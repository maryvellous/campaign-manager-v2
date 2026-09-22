import { randomUUID } from 'node:crypto';
import { CampaignError } from '../../../packages/core/src/index';
import {
  AiProviderError,
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODELS,
  OpenAiProvider,
  type AiMessage,
  type AiPreparedContext,
  type AiProvider,
  type AiProviderErrorCode,
  type OpenAiModel,
} from '../../../packages/ai/src/index';
import { LocalStore, type AiPreferences } from '../infrastructure/local-store';
import { aiInstructions } from './ai-context';

export type AiStatus =
  | 'not_configured'
  | 'ready'
  | 'thinking'
  | 'cancelled'
  | 'offline'
  | 'auth/provider_key_invalid'
  | 'rate_limited'
  | 'provider_error'
  | 'context_too_large'
  | 'source_missing';

export interface AiState {
  status: AiStatus;
  configured: boolean;
  provider: 'openai';
  model: OpenAiModel;
  privacyAccepted: boolean;
  messages: AiMessage[];
  error?: string;
}

export interface AiSecretCodec {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export class AiService {
  state: AiState = {
    status: 'not_configured',
    configured: false,
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    privacyAccepted: false,
    messages: [],
  };

  onChange: () => void = () => undefined;
  private preferences: AiPreferences = {
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    privacyAccepted: false,
  };
  private campaignId?: string;
  private controller?: AbortController;

  constructor(
    readonly store: LocalStore,
    private readonly codec: AiSecretCodec,
    private readonly provider: AiProvider = new OpenAiProvider()
  ) {}

  async initialize(): Promise<void> {
    this.preferences = await this.store.readAiPreferences();
    this.projectConfiguration();
  }

  private projectConfiguration(): void {
    this.state.provider = 'openai';
    this.state.model = this.preferences.model;
    this.state.privacyAccepted = this.preferences.privacyAccepted;
    this.state.configured = Boolean(this.preferences.encryptedKey);
    if (!this.state.configured) this.state.status = 'not_configured';
    else if (this.state.status === 'not_configured') this.state.status = 'ready';
  }

  async bindCampaign(campaignId?: string): Promise<AiState> {
    if (this.campaignId === campaignId) return this.state;
    this.controller?.abort();
    this.controller = undefined;
    this.campaignId = campaignId;
    this.state.messages = campaignId ? (await this.store.readAiThread(campaignId)).messages : [];
    this.state.error = undefined;
    this.projectConfiguration();
    this.onChange();
    return this.state;
  }

  async configure(apiKey: string, model: OpenAiModel): Promise<AiState> {
    const key = apiKey.trim();
    if (!key || key.length > 1000) throw new CampaignError('invalid_path', 'Chiave API non valida.');
    if (!OPENAI_MODELS.includes(model)) throw new CampaignError('invalid_path', 'Modello IA non valido.');
    if (!this.codec.available()) throw new CampaignError('permission_denied', 'Lo storage sicuro del sistema non è disponibile: la chiave API non verrà salvata in chiaro.');

    this.preferences = {
      provider: 'openai',
      model,
      encryptedKey: this.codec.encrypt(key),
      privacyAccepted: this.preferences.privacyAccepted,
    };
    await this.store.writeAiPreferences(this.preferences);
    this.state.error = undefined;
    this.state.status = 'ready';
    this.projectConfiguration();
    this.onChange();
    return this.state;
  }

  async setModel(model: OpenAiModel): Promise<AiState> {
    if (!OPENAI_MODELS.includes(model)) throw new CampaignError('invalid_path', 'Modello IA non valido.');
    this.preferences = { ...this.preferences, model };
    await this.store.writeAiPreferences(this.preferences);
    this.state.model = model;
    this.onChange();
    return this.state;
  }

  async clearConfiguration(): Promise<AiState> {
    this.controller?.abort();
    this.controller = undefined;
    this.preferences = { provider: 'openai', model: DEFAULT_OPENAI_MODEL, privacyAccepted: false };
    await this.store.writeAiPreferences(this.preferences);
    this.state = {
      status: 'not_configured',
      configured: false,
      provider: 'openai',
      model: DEFAULT_OPENAI_MODEL,
      privacyAccepted: false,
      messages: this.state.messages,
    };
    this.onChange();
    return this.state;
  }

  async acceptPrivacy(): Promise<AiState> {
    if (!this.state.configured) throw new CampaignError('not_found', 'Configura prima un provider IA.');
    this.preferences = { ...this.preferences, privacyAccepted: true };
    await this.store.writeAiPreferences(this.preferences);
    this.state.privacyAccepted = true;
    this.onChange();
    return this.state;
  }

  async newConversation(): Promise<AiState> {
    if (!this.campaignId) throw new CampaignError('not_found', 'Apri una campagna prima di usare l’assistente.');
    this.controller?.abort();
    this.controller = undefined;
    this.state.messages = [];
    this.state.error = undefined;
    this.state.status = this.state.configured ? 'ready' : 'not_configured';
    await this.store.clearAiThread(this.campaignId);
    this.onChange();
    return this.state;
  }

  private providerMessages(messages: AiMessage[]): AiMessage[] {
    const selected: AiMessage[] = [];
    let chars = 0;
    for (let index = messages.length - 1; index >= 0 && selected.length < 24; index--) {
      const message = messages[index];
      if (selected.length && chars + message.content.length > 48_000) break;
      selected.unshift(message);
      chars += message.content.length;
    }
    return selected;
  }

  contextError(code: 'context_too_large' | 'source_missing', message: string): AiState {
    this.state.status = code;
    this.state.error = message;
    this.onChange();
    return this.state;
  }

  cancel(): AiState {
    this.controller?.abort();
    this.controller = undefined;
    if (this.state.status === 'thinking') this.state.status = 'cancelled';
    this.onChange();
    return this.state;
  }

  async send(prompt: string, context: AiPreparedContext): Promise<AiState> {
    if (!this.campaignId) throw new CampaignError('not_found', 'Apri una campagna prima di usare l’assistente.');
    const content = prompt.trim();
    if (!content || content.length > 20000) throw new CampaignError('invalid_path', 'Messaggio non valido.');
    if (!this.preferences.encryptedKey || !this.state.configured) throw new CampaignError('not_found', 'Configura prima un provider IA.');
    if (!this.preferences.privacyAccepted) throw new CampaignError('permission_denied', 'Conferma prima l’invio dei dati necessari al provider IA.');
    if (!this.codec.available()) throw new CampaignError('permission_denied', 'Lo storage sicuro del sistema non è disponibile.');
    if (this.state.status === 'thinking') throw new CampaignError('conflict', 'Attendi o annulla la richiesta in corso.');

    const user: AiMessage = { id: randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
    this.state.messages = [...this.state.messages, user];
    this.state.status = 'thinking';
    this.state.error = undefined;
    await this.store.writeAiThread(this.campaignId, { messages: this.state.messages });
    this.onChange();

    const controller = new AbortController();
    this.controller = controller;
    try {
      const answer = await this.provider.complete(this.codec.decrypt(this.preferences.encryptedKey), {
        model: this.preferences.model,
        messages: this.providerMessages(this.state.messages),
        instructions: aiInstructions(context),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        this.state.status = 'cancelled';
        return this.state;
      }
      const assistant: AiMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: answer,
        createdAt: new Date().toISOString(),
        ...(context.sources.length ? { sources: context.sources } : {}),
      };
      this.state.messages = [...this.state.messages, assistant];
      this.state.status = 'ready';
      await this.store.writeAiThread(this.campaignId, { messages: this.state.messages });
      return this.state;
    } catch (error) {
      if (error instanceof AiProviderError) {
        this.state.status = error.code as AiProviderErrorCode;
        this.state.error = error.message;
      } else {
        this.state.status = 'provider_error';
        this.state.error = 'La richiesta IA non è riuscita.';
      }
      return this.state;
    } finally {
      if (this.controller === controller) this.controller = undefined;
      this.onChange();
    }
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}
