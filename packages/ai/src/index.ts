export type AiProviderId = 'openai';
export type OpenAiModel = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';

export const OPENAI_MODELS: readonly OpenAiModel[] = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'] as const;
export const DEFAULT_OPENAI_MODEL: OpenAiModel = 'gpt-5.6-luna';

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

export interface AiThread {
  messages: AiMessage[];
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
  model: OpenAiModel;
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
  }
  return `Il provider ha risposto con HTTP ${status}.`;
}

function extractOutputText(payload: unknown): string {
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

export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly transport: FetchLike = fetch,
    private readonly endpoint = 'https://api.openai.com/v1/responses'
  ) {}

  async complete(apiKey: string, request: AiCompletionRequest): Promise<string> {
    let response: Response;
    try {
      response = await this.transport(this.endpoint, {
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
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new AiProviderError('cancelled', 'Generazione annullata.');
      }
      throw new AiProviderError('offline', 'Il provider non è raggiungibile.');
    }

    let payload: unknown;
    try { payload = await response.json(); }
    catch { payload = undefined; }

    if (!response.ok) {
      const message = providerMessage(response.status, payload);
      if (response.status === 401 || response.status === 403) throw new AiProviderError('auth/provider_key_invalid', 'La chiave API non è valida o non è autorizzata.');
      if (response.status === 429) throw new AiProviderError('rate_limited', 'Limite del provider raggiunto. Riprova più tardi.');
      if (response.status === 413 || (response.status === 400 && /context|token|too large|maximum/i.test(message))) {
        throw new AiProviderError('context_too_large', 'Il contesto della richiesta è troppo grande per il provider.');
      }
      throw new AiProviderError('provider_error', message);
    }

    return extractOutputText(payload);
  }
}
