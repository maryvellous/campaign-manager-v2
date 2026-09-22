import { randomUUID } from 'node:crypto';
import { CampaignError } from '../../../packages/core/src/index';
import {
  AiProviderError,
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODELS,
  OpenAiProvider,
  type AiEditProposal,
  type AiMessage,
  type AiNewNoteProposal,
  type AiPreparedContext,
  type AiProposal,
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
  | 'source_missing'
  | 'proposal_stale'
  | 'save_conflict';

export interface AiState {
  status: AiStatus;
  configured: boolean;
  provider: 'openai';
  model: OpenAiModel;
  privacyAccepted: boolean;
  messages: AiMessage[];
  proposal?: AiProposal;
  error?: string;
}

export interface AiSecretCodec {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export interface AiProposalNote {
  noteId: string;
  title: string;
  revision: string;
  markdown: string;
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

  private async persistThread(): Promise<void> {
    if (!this.campaignId) return;
    await this.store.writeAiThread(this.campaignId, {
      messages: this.state.messages,
      ...(this.state.proposal ? { proposal: this.state.proposal } : {}),
    });
  }

  async bindCampaign(campaignId?: string): Promise<AiState> {
    if (this.campaignId === campaignId) return this.state;
    this.controller?.abort();
    this.controller = undefined;
    this.campaignId = campaignId;
    const thread = campaignId ? await this.store.readAiThread(campaignId) : { messages: [] };
    this.state.messages = thread.messages;
    this.state.proposal = thread.proposal;
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
      ...(this.state.proposal ? { proposal: this.state.proposal } : {}),
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
    this.state.proposal = undefined;
    this.state.error = undefined;
    this.state.status = this.state.configured ? 'ready' : 'not_configured';
    await this.store.clearAiThread(this.campaignId);
    this.onChange();
    return this.state;
  }

  latestUserPrompt(): string | undefined {
    return [...this.state.messages].reverse().find(message => message.role === 'user')?.content;
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

  private ensureRemoteReady(): void {
    if (!this.campaignId) throw new CampaignError('not_found', 'Apri una campagna prima di usare l’assistente.');
    if (!this.preferences.encryptedKey || !this.state.configured) throw new CampaignError('not_found', 'Configura prima un provider IA.');
    if (!this.preferences.privacyAccepted) throw new CampaignError('permission_denied', 'Conferma prima l’invio dei dati necessari al provider IA.');
    if (!this.codec.available()) throw new CampaignError('permission_denied', 'Lo storage sicuro del sistema non è disponibile.');
    if (this.state.status === 'thinking') throw new CampaignError('conflict', 'Attendi o annulla la richiesta in corso.');
  }

  private async complete(messages: AiMessage[], instructions: string): Promise<string | undefined> {
    this.ensureRemoteReady();
    this.state.status = 'thinking';
    this.state.error = undefined;
    this.onChange();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const answer = await this.provider.complete(this.codec.decrypt(this.preferences.encryptedKey!), {
        model: this.preferences.model,
        messages: this.providerMessages(messages),
        instructions,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        this.state.status = 'cancelled';
        return undefined;
      }
      return answer;
    } catch (error) {
      if (error instanceof AiProviderError) {
        this.state.status = error.code as AiProviderErrorCode;
        this.state.error = error.message;
      } else {
        this.state.status = 'provider_error';
        this.state.error = 'La richiesta IA non è riuscita.';
      }
      return undefined;
    } finally {
      if (this.controller === controller) this.controller = undefined;
      this.onChange();
    }
  }

  private parseObject(text: string): Record<string, unknown> {
    const trimmed = text.trim().replace(/^\`\`\`(?:json)?\s*/iu, '').replace(/\s*\`\`\`$/u, '');
    let value: unknown;
    try { value = JSON.parse(trimmed); }
    catch { throw new CampaignError('invalid_path', 'Il provider non ha restituito una proposta valida.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignError('invalid_path', 'Il provider non ha restituito una proposta valida.');
    return value as Record<string, unknown>;
  }

  contextError(code: 'context_too_large' | 'source_missing', message: string): AiState {
    this.state.status = code;
    this.state.error = message;
    this.onChange();
    return this.state;
  }

  proposalError(code: 'proposal_stale' | 'save_conflict', message: string): AiState {
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
    this.ensureRemoteReady();
    const content = prompt.trim();
    if (!content || content.length > 20000) throw new CampaignError('invalid_path', 'Messaggio non valido.');

    const user: AiMessage = { id: randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
    this.state.messages = [...this.state.messages, user];
    await this.persistThread();

    const answer = await this.complete(this.state.messages, aiInstructions(context));
    if (answer === undefined) return this.state;

    const assistant: AiMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: answer,
      createdAt: new Date().toISOString(),
      ...(context.sources.length ? { sources: context.sources } : {}),
    };
    this.state.messages = [...this.state.messages, assistant];
    this.state.status = 'ready';
    this.state.error = undefined;
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async proposeEdit(note: AiProposalNote, context: AiPreparedContext): Promise<AiState> {
    this.ensureRemoteReady();
    if (this.state.proposal) throw new CampaignError('conflict', 'Rivedi o scarta la proposta corrente prima di crearne un’altra.');
    if (note.markdown.length > 60_000) return this.contextError('context_too_large', 'La nota è troppo grande per generare una proposta in una singola richiesta.');

    const action: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: 'Genera una proposta di modifica per la nota scelta, coerente con la conversazione corrente.',
      createdAt: new Date().toISOString(),
    };
    const instructions = [
      aiInstructions(context),
      'Devi proporre la nuova versione completa di UNA sola nota esistente.',
      'Non proporre delete, rename, move, folder operation, board edit o modifiche ad altre note.',
      'Restituisci SOLO JSON valido senza Markdown fence con questa forma esatta: {"markdown":"contenuto Markdown completo proposto"}.',
      `Nota da modificare: ${note.noteId}\n\n${note.markdown}`,
    ].join('\n\n');
    const answer = await this.complete([...this.state.messages, action], instructions);
    if (answer === undefined) return this.state;
    let parsed: Record<string, unknown>;
    try { parsed = this.parseObject(answer); }
    catch (error) {
      this.state.status = 'provider_error';
      this.state.error = error instanceof Error ? error.message : 'Proposta non valida.';
      this.onChange();
      return this.state;
    }
    if (typeof parsed.markdown !== 'string' || parsed.markdown.length > 100_000) {
      this.state.status = 'provider_error';
      this.state.error = 'Il provider non ha restituito una proposta valida.';
      this.onChange();
      return this.state;
    }
    const proposal: AiEditProposal = {
      id: randomUUID(),
      kind: 'edit',
      noteId: note.noteId,
      title: note.title,
      baseRevision: note.revision,
      originalMarkdown: note.markdown,
      proposedMarkdown: parsed.markdown,
      createdAt: new Date().toISOString(),
    };
    this.state.proposal = proposal;
    this.state.status = 'ready';
    this.state.error = undefined;
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async proposeNew(context: AiPreparedContext, allowedFolders: string[]): Promise<AiState> {
    this.ensureRemoteReady();
    if (this.state.proposal) throw new CampaignError('conflict', 'Rivedi o scarta la proposta corrente prima di crearne un’altra.');
    const folders = [...new Set(['', ...allowedFolders])].filter(folder => typeof folder === 'string').slice(0, 300);
    const action: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: 'Genera una proposta per una singola nuova nota, coerente con la conversazione corrente.',
      createdAt: new Date().toISOString(),
    };
    const instructions = [
      aiInstructions(context),
      'Devi proporre UNA sola nuova nota Markdown. Non modificare note esistenti.',
      'Restituisci SOLO JSON valido senza Markdown fence con questa forma esatta: {"title":"Titolo","parentFolder":"","markdown":"contenuto Markdown"}.',
      'parentFolder deve essere una delle cartelle esistenti elencate qui; stringa vuota significa cartella principale.',
      `Cartelle consentite: ${JSON.stringify(folders)}`,
    ].join('\n\n');
    const answer = await this.complete([...this.state.messages, action], instructions);
    if (answer === undefined) return this.state;
    let parsed: Record<string, unknown>;
    try { parsed = this.parseObject(answer); }
    catch (error) {
      this.state.status = 'provider_error';
      this.state.error = error instanceof Error ? error.message : 'Proposta non valida.';
      this.onChange();
      return this.state;
    }
    const rawTitle = typeof parsed.title === 'string' ? parsed.title.trim().replace(/\.md$/iu, '') : '';
    const rawFolder = typeof parsed.parentFolder === 'string' ? parsed.parentFolder : '';
    const markdown = typeof parsed.markdown === 'string' ? parsed.markdown : '';
    const title = rawTitle && rawTitle.length <= 180 && !/[\\/]/u.test(rawTitle) ? rawTitle : 'Nuova nota';
    const parentFolder = folders.includes(rawFolder) ? rawFolder : '';
    if (markdown.length > 100_000) {
      this.state.status = 'provider_error';
      this.state.error = 'La proposta generata è troppo grande.';
      this.onChange();
      return this.state;
    }
    const proposal: AiNewNoteProposal = {
      id: randomUUID(),
      kind: 'new',
      parentFolder,
      title,
      markdown,
      createdAt: new Date().toISOString(),
    };
    this.state.proposal = proposal;
    this.state.status = 'ready';
    this.state.error = undefined;
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async updateEditProposal(markdown: string): Promise<AiState> {
    if (!this.state.proposal || this.state.proposal.kind !== 'edit') throw new CampaignError('not_found', 'Nessuna proposta di modifica disponibile.');
    if (markdown.length > 100_000) throw new CampaignError('invalid_path', 'La proposta è troppo grande.');
    this.state.proposal = { ...this.state.proposal, proposedMarkdown: markdown };
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async updateNewProposal(title: string, parentFolder: string, markdown: string): Promise<AiState> {
    if (!this.state.proposal || this.state.proposal.kind !== 'new') throw new CampaignError('not_found', 'Nessuna proposta di nuova nota disponibile.');
    const cleanTitle = title.trim().replace(/\.md$/iu, '');
    if (!cleanTitle || cleanTitle.length > 180 || /[\\/]/u.test(cleanTitle)) throw new CampaignError('invalid_path', 'Titolo della proposta non valido.');
    if (parentFolder.length > 2000 || markdown.length > 100_000) throw new CampaignError('invalid_path', 'Proposta non valida.');
    this.state.proposal = { ...this.state.proposal, title: cleanTitle, parentFolder, markdown };
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async discardProposal(): Promise<AiState> {
    this.state.proposal = undefined;
    this.state.status = this.state.configured ? 'ready' : 'not_configured';
    this.state.error = undefined;
    await this.persistThread();
    this.onChange();
    return this.state;
  }

  async proposalApplied(): Promise<AiState> {
    return this.discardProposal();
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}
