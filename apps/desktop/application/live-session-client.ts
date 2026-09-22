import {
  validateEnvelope,
  type CreateSessionResponse,
  type LiveApiError,
  type SessionSummary
} from '../../../packages/protocol/src/index';

export interface DesktopLiveState {
  status: 'idle' | 'starting' | 'open' | 'host_reconnecting' | 'error';
  connected: boolean;
  liveSessionId?: string;
  joinCode?: string;
  playerUrl?: string;
  acceptingJoins: boolean;
  participants: SessionSummary['participants'];
  stateSeq: number;
  error?: string;
}

type ApiResult<T> = { ok: true; value: T } | { ok: false; error: LiveApiError['error'] };

const initialState = (): DesktopLiveState => ({
  status: 'idle',
  connected: false,
  acceptingJoins: true,
  participants: [],
  stateSeq: 0
});

function normalizedRelayUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Relay URL non valido.');
  return url.origin;
}

export class LiveSessionClient {
  state = initialState();
  onChange: () => void = () => undefined;
  private hostCredential?: string;
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryCount = 0;
  private disposed = false;
  readonly relayUrl: string;

  constructor(relayUrl: string) {
    this.relayUrl = normalizedRelayUrl(relayUrl);
  }

  private emit(): void { this.onChange(); }

  private async api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    try {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
      if (this.hostCredential) headers.set('authorization', `Bearer ${this.hostCredential}`);
      const response = await fetch(`${this.relayUrl}${path}`, { ...init, headers });
      const value = await response.json() as T | LiveApiError;
      if (!response.ok) {
        const fallback = { code: 'INTERNAL_ERROR' as const, message: 'Il relay non ha accettato la richiesta.' };
        return { ok: false, error: (value as LiveApiError).error ?? fallback };
      }
      return { ok: true, value: value as T };
    } catch {
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Relay non raggiungibile.' } };
    }
  }

  private applySummary(summary: SessionSummary): void {
    this.state = {
      ...this.state,
      status: summary.lifecycle === 'host_reconnecting' ? 'host_reconnecting' : 'open',
      liveSessionId: summary.liveSessionId,
      joinCode: summary.joinCode,
      acceptingJoins: summary.acceptingJoins,
      participants: summary.participants,
      stateSeq: summary.stateSeq,
      error: undefined
    };
    this.emit();
  }

  private websocketUrl(liveSessionId: string): string {
    const base = new URL(this.relayUrl);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = `/api/sessions/${encodeURIComponent(liveSessionId)}/ws`;
    base.search = '';
    base.hash = '';
    return base.href;
  }

  private connect(ticket: string): void {
    const liveSessionId = this.state.liveSessionId;
    if (!liveSessionId || this.disposed) return;
    this.socket?.close();
    const socket = new WebSocket(this.websocketUrl(liveSessionId), ['cmv2.v1', `cmv2.ticket.${ticket}`]);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retryCount = 0;
      this.state = { ...this.state, connected: true, status: 'open', error: undefined };
      this.emit();
    });

    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let parsed: unknown;
      try { parsed = JSON.parse(event.data); } catch { return; }
      const message = validateEnvelope(parsed); if (!message) return;
      if (message.type === 'session.state' && message.payload && typeof message.payload === 'object') {
        const summary = message.payload as SessionSummary;
        if (typeof summary.liveSessionId === 'string' && Array.isArray(summary.participants)) this.applySummary(summary);
      }
    });

    socket.addEventListener('close', () => {
      if (this.disposed || !this.hostCredential || this.socket !== socket) return;
      this.state = { ...this.state, connected: false, status: 'host_reconnecting', error: 'Connessione al relay interrotta. Riprovo automaticamente.' };
      this.emit();
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (this.socket === socket) socket.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(5000, 700 * 2 ** Math.min(this.retryCount++, 3));
    this.retryTimer = setTimeout(() => { void this.reconnect(); }, delay);
    this.retryTimer.unref?.();
  }

  private async reconnect(): Promise<void> {
    if (!this.state.liveSessionId || !this.hostCredential || this.disposed) return;
    const ticket = await this.api<{ ticket: string }>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}/host-ticket`, { method: 'POST' });
    if (!ticket.ok) {
      this.state = { ...this.state, connected: false, status: 'host_reconnecting', error: ticket.error.message };
      this.emit();
      this.scheduleReconnect();
      return;
    }
    this.connect(ticket.value.ticket);
  }

  async start(): Promise<ApiResult<DesktopLiveState>> {
    if (this.state.liveSessionId) return { ok: true, value: this.state };
    this.state = { ...initialState(), status: 'starting' }; this.emit();
    const created = await this.api<CreateSessionResponse>('/api/sessions', { method: 'POST' });
    if (!created.ok) {
      this.state = { ...initialState(), status: 'error', error: created.error.message }; this.emit();
      return { ok: false, error: created.error };
    }
    this.hostCredential = created.value.hostCredential;
    this.state = {
      ...initialState(),
      status: 'open',
      liveSessionId: created.value.liveSessionId,
      joinCode: created.value.joinCode,
      playerUrl: created.value.playerUrl
    };
    this.emit();
    this.connect(created.value.ticket);
    return { ok: true, value: this.state };
  }

  async refresh(): Promise<ApiResult<DesktopLiveState>> {
    if (!this.state.liveSessionId || !this.hostCredential) return { ok: true, value: this.state };
    const response = await this.api<SessionSummary>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}`);
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async setAcceptingJoins(acceptingJoins: boolean): Promise<ApiResult<DesktopLiveState>> {
    if (!this.state.liveSessionId) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'Nessuna sessione attiva.' } };
    const response = await this.api<SessionSummary>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}/join-policy`, {
      method: 'POST',
      body: JSON.stringify({ acceptingJoins })
    });
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async rotateJoinCode(): Promise<ApiResult<DesktopLiveState>> {
    if (!this.state.liveSessionId) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'Nessuna sessione attiva.' } };
    const response = await this.api<{ joinCode: string }>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}/rotate-code`, { method: 'POST' });
    if (!response.ok) return response;
    this.state = { ...this.state, joinCode: response.value.joinCode }; this.emit();
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async removeParticipant(participantId: string): Promise<ApiResult<DesktopLiveState>> {
    if (!this.state.liveSessionId) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'Nessuna sessione attiva.' } };
    const response = await this.api<SessionSummary>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}/participants/${encodeURIComponent(participantId)}/remove`, { method: 'POST' });
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = undefined;
    this.hostCredential = undefined;
    this.state = initialState();
  }
}
