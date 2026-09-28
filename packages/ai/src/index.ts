export type AiProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek';

export type OpenAiModel = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
export type AnthropicModel = 'claude-sonnet-5' | 'claude-opus-5-5' | 'claude-haiku-4-5-20251001';
export type GoogleModel = 'gemini-3.8-flash' | 'gemini-3.5-flash-lite';
export type DeepSeekModel = 'deepseek-flash' | 'deepseek-v4-pro';
export type AiModel = OpenAiModel | AnthropicModel | GoogleModel | DeepSeekModel;

export const OPENAI_MODELS: readonly OpenAiModel[] = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'] as const;
export const ANTHROPIC_MODELS: readonly AnthropicModel[] = ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'] as const;
export const GOOGLE_MODELS: readonly GoogleModel[] = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const;
export const DEEPSEEK_MODELS: readonly DeepSeekModel[] = ['deepseek-flash', 'deepseek-v4-pro'] as const;

export const DEFAULT_OPENAI_MODEL: OpenAiModel = 'gpt-5.6-luna';
export const DEFAULT_AI_MODELS: Record<AiProviderId, AiModel> = {
  openai: DEFAULT_OPENAI_MODEL,
  anthropic: 'claude-sonnet-5',
  google: 'gemini-3.8-flash',
  deepseek: 'deepseek-flash',
};

export const AI_PROVIDER_MODELS: Record<AiProviderId, readonly AiModel[]> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
  deepseek: DEEPSEEK_MODELS,
};

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && ['openai', 'anthropic', 'google', 'deepseek'].includes(value);
}

export function isAiModelForProvider(provider: AiProviderId, value: unknown): value is AiModel {
  return typeof value === 'string' && AI_PROVIDER_MODELS[provider].includes(value as AiModel);
}

export interface AiSource {
  noteId: string;
  title: string;
  relativePath: string;
}

export type AiContextSelection =
  | { kind: 'campaign' }
  | { kind: 'note'; noteId: string }
  | { kind: 'selection'; noteId: string; selection: string };

export interface AiPreparedContext {
  label: string;
  text: string;
  sources: AiSource[];
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: AiSource[];
}

export interface AiEditProposal {
  id: string;
  kind: 'edit';
  noteId: string;
  title: string;
  baseRevision: string;
  originalMarkdown: string;
  proposedMarkdown: string;
  createdAt: string;
}

export interface AiNewNoteProposal {
  id: string;
  kind: 'new';
  parentFolder: string;
  title: string;
  markdown: string;
  createdAt: string;
}

export type AiProposal = AiEditProposal | AiNewNoteProposal;

export interface AiThread {
  messages: AiMessage[];
  proposal?: AiProposal;
}

export type AiProviderErrorCode =
  | 'cancelled'
  | 'offline'
  | 'auth/provider_key_invalid'
  | 'rate_limited'
  | 'context_too_large'
  | 'provider_error';

export class AiProviderError extends Error {
  constructor(readonly code: AiProviderErrorCode, message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiCompletionRequest {
  model: AiModel;
  messages: AiMessage[];
  instructions?: string;
  signal?: AbortSignal;
}

export interface AiProvider {
  complete(apiKey: string, request: AiCompletionRequest): Promise<string>;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function providerMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
    if (typeof (payload as { message?: unknown }).message === 'string') return (payload as { message: string }).message;
  }
  return `Il provider ha risposto con HTTP ${status}.`;
}

async function providerPayload(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return undefined; }
}

function throwProviderFailure(response: Response, payload: unknown): never {
  const message = providerMessage(response.status, payload);
  if (
    response.status === 401
    || response.status === 403
    || (response.status === 400 && /api.?key|key.?invalid|invalid.?key|authentication|unauthorized/i.test(message))
  ) {
    throw new AiProviderError('auth/provider_key_invalid', 'La chiave API non è valida o non è autorizzata.');
  }
  if (response.status === 429) throw new AiProviderError('rate_limited', 'Limite del provider raggiunto. Riprova più tardi.');
  if (response.status === 413 || (response.status === 400 && /context|token|too large|maximum|length/i.test(message))) {
    throw new AiProviderError('context_too_large', 'Il contesto della richiesta è troppo grande per il provider.');
  }
  throw new AiProviderError('provider_error', message);
}

async function runProviderRequest(
  transport: FetchLike,
  input: string | URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<{ response: Response; payload: unknown }> {
  let response: Response;
  try {
    response = await transport(input, { ...init, signal });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new AiProviderError('cancelled', 'Generazione annullata.');
    }
    throw new AiProviderError('offline', 'Il provider non è raggiungibile.');
  }
  const payload = await providerPayload(response);
  if (!response.ok) throwProviderFailure(response, payload);
  return { response, payload };
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new AiProviderError('provider_error', 'Risposta del provider non valida.');
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const part of (item as { content: unknown[] }).content) {
      if (!part || typeof part !== 'object') continue;
      const value = part as { type?: unknown; text?: unknown };
      if (value.type === 'output_text' && typeof value.text === 'string') chunks.push(value.text);
    }
  }
  const text = chunks.join('\n').trim();
  if (!text) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  return text;
}

function extractAnthropicText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new AiProviderError('provider_error', 'Risposta del provider non valida.');
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  const text = content
    .filter(part => part && typeof part === 'object' && (part as { type?: unknown }).type === 'text')
    .map(part => (part as { text?: unknown }).text)
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  if (!text) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  return text;
}

function extractGoogleText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new AiProviderError('provider_error', 'Risposta del provider non valida.');
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  const text = parts
    .map(part => part && typeof part === 'object' ? (part as { text?: unknown }).text : undefined)
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  if (!text) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  return text;
}

function extractDeepSeekText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new AiProviderError('provider_error', 'Risposta del provider non valida.');
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AiProviderError('provider_error', 'Il provider non ha restituito testo.');
  return content.trim();
}

export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly transport: FetchLike = fetch,
    private readonly endpoint = 'https://api.openai.com/v1/responses'
  ) {}

  async complete(apiKey: string, request: AiCompletionRequest): Promise<string> {
    const { payload } = await runProviderRequest(this.transport, this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        input: request.messages.map(message => ({ role: message.role, content: message.content })),
        ...(request.instructions ? { instructions: request.instructions } : {}),
        store: false,
      }),
    }, request.signal);
    return extractOpenAiText(payload);
  }
}

export class AnthropicProvider implements AiProvider {
  constructor(
    private readonly transport: FetchLike = fetch,
    private readonly endpoint = 'https://api.anthropic.com/v1/messages'
  ) {}

  async complete(apiKey: string, request: AiCompletionRequest): Promise<string> {
    const { payload } = await runProviderRequest(this.transport, this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: 32768,
        messages: request.messages.map(message => ({ role: message.role, content: message.content })),
        ...(request.instructions ? { system: request.instructions } : {}),
      }),
    }, request.signal);
    return extractAnthropicText(payload);
  }
}

export class GoogleProvider implements AiProvider {
  constructor(
    private readonly transport: FetchLike = fetch,
    private readonly baseEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models'
  ) {}

  async complete(apiKey: string, request: AiCompletionRequest): Promise<string> {
    const endpoint = `${this.baseEndpoint}/${encodeURIComponent(request.model)}:generateContent`;
    const { payload } = await runProviderRequest(this.transport, endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: request.messages.map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        ...(request.instructions ? { systemInstruction: { parts: [{ text: request.instructions }] } } : {}),
      }),
    }, request.signal);
    return extractGoogleText(payload);
  }
}

export class DeepSeekProvider implements AiProvider {
  constructor(
    private readonly transport: FetchLike = fetch,
    private readonly endpoint = 'https://api.deepseek.com/chat/completions'
  ) {}

  async complete(apiKey: string, request: AiCompletionRequest): Promise<string> {
    const messages = [
      ...(request.instructions ? [{ role: 'system' as const, content: request.instructions }] : []),
      ...request.messages.map(message => ({ role: message.role, content: message.content })),
    ];
    const { payload } = await runProviderRequest(this.transport, this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: false,
      }),
    }, request.signal);
    return extractDeepSeekText(payload);
  }
}
