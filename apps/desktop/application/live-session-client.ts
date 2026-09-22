import {
  validateEnvelope,
  type CreateSessionResponse,
  type LiveApiError,
  type LiveBoardElement,
  type LiveBoardPayload,
  type LiveBoardSnapshot,
  type SessionSummary
} from '../../../packages/protocol/src/index';
import type { PublicBoardElement, PublicPreparedBoard } from './board-privacy';

export interface DesktopLiveState {
  status: 'idle' | 'starting' | 'open' | 'host_reconnecting' | 'error';
  connected: boolean;
  liveSessionId?: string;
  joinCode?: string;
  playerUrl?: string;
  acceptingJoins: boolean;
  participants: SessionSummary['participants'];
  stateSeq: number;
  presentation: SessionSummary['presentation'];
  activeBoardId?: string;
  activeElementIds: string[];
  liveBoards: SessionSummary['liveBoards'];
  error?: string;
}

type ApiResult<T> = { ok: true; value: T } | { ok: false; error: LiveApiError['error'] };
type AssetLoader = (assetPath: string) => Promise<{ mime: string; bytes: Uint8Array }>;

const initialState = (): DesktopLiveState => ({
  status: 'idle',
  connected: false,
  acceptingJoins: true,
  participants: [],
  stateSeq: 0,
  presentation: 'waiting',
  activeElementIds: [],
  liveBoards: []
});

function normalizedRelayUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Relay URL non valido.');
  return url.origin;
}

function withoutLocalAsset(element: PublicBoardElement, publishedAssetId?: string): LiveBoardElement {
  if (element.type === 'image') {
    if (!publishedAssetId) throw new Error('Asset live mancante.');
    return {
      elementId: element.elementId, type: 'image', x: element.x, y: element.y, width: element.width, height: element.height, z: element.z,
      publishedAssetId
    };
  }
  if (element.type === 'token') {
    return {
      elementId: element.elementId, type: 'token', x: element.x, y: element.y, width: element.width, height: element.height, z: element.z,
      name: element.name, ...(publishedAssetId ? { publishedAssetId } : {})
    };
  }
  if (element.type === 'text') return { ...element };
  if (element.type === 'link') return { ...element };
  return {
    elementId: element.elementId, type: 'card', x: element.x, y: element.y, width: element.width, height: element.height, z: element.z,
    cardKind: element.cardKind, sourceTitle: element.sourceTitle, ...(element.cardKind === 'excerpt' ? { excerpt: element.excerpt } : {})
  };
}

export class LiveSessionClient {
  state = initialState();
  onChange: () => void = () => undefined;
  private hostCredential?: string;
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryCount = 0;
  private disposed = false;
  private publishedAssets = new Map<string, string>();
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
      presentation: summary.presentation,
      ...(summary.activeBoardId ? { activeBoardId: summary.activeBoardId } : { activeBoardId: undefined }),
      activeElementIds: summary.activeElementIds ?? [],
      liveBoards: summary.liveBoards,
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
        if (typeof summary.liveSessionId === 'string' && Array.isArray(summary.participants) && Array.isArray(summary.liveBoards)) this.applySummary(summary);
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

  private async uploadAsset(assetPath: string, loadAsset: AssetLoader): Promise<ApiResult<string>> {
    const cached = this.publishedAssets.get(assetPath);
    if (cached) return { ok: true, value: cached };
    if (!this.state.liveSessionId || !this.hostCredential) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'Nessuna sessione attiva.' } };
    let asset: { mime: string; bytes: Uint8Array };
    try { asset = await loadAsset(assetPath); }
    catch { return { ok: false, error: { code: 'ASSET_UNAVAILABLE', message: `Asset locale non disponibile: ${assetPath}` } }; }

    try {
      const payload = new Uint8Array(asset.bytes).buffer;
      const response = await fetch(`${this.relayUrl}/api/sessions/${encodeURIComponent(this.state.liveSessionId)}/assets`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.hostCredential}`,
          'content-type': asset.mime
        },
        body: payload
      });
      const value = await response.json() as { publishedAssetId?: string } | LiveApiError;
      if (!response.ok || !('publishedAssetId' in value) || typeof value.publishedAssetId !== 'string') {
        const error = (value as LiveApiError).error ?? { code: 'ASSET_UNAVAILABLE' as const, message: 'Upload asset live non riuscito.' };
        return { ok: false, error };
      }
      this.publishedAssets.set(assetPath, value.publishedAssetId);
      return { ok: true, value: value.publishedAssetId };
    } catch {
      return { ok: false, error: { code: 'ASSET_UNAVAILABLE', message: 'Upload asset live non riuscito.' } };
    }
  }

  private async materializeElement(element: PublicBoardElement, loadAsset: AssetLoader): Promise<ApiResult<LiveBoardElement>> {
    if (element.type === 'image') {
      const asset = await this.uploadAsset(element.assetPath, loadAsset);
      return asset.ok ? { ok: true, value: withoutLocalAsset(element, asset.value) } : asset;
    }
    if (element.type === 'token' && element.assetPath) {
      const asset = await this.uploadAsset(element.assetPath, loadAsset);
      return asset.ok ? { ok: true, value: withoutLocalAsset(element, asset.value) } : asset;
    }
    return { ok: true, value: withoutLocalAsset(element) };
  }

  private async materializeBoard(title: string, board: PublicPreparedBoard, loadAsset: AssetLoader): Promise<ApiResult<LiveBoardPayload>> {
    const elements: LiveBoardElement[] = [];
    for (const element of board.elements) {
      const materialized = await this.materializeElement(element, loadAsset);
      if (!materialized.ok) return materialized;
      elements.push(materialized.value);
    }
    return { ok: true, value: { boardId: board.boardId, title, elements } };
  }

  private async postBoardAction<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    if (!this.state.liveSessionId) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'Nessuna sessione attiva.' } };
    return this.api<T>(`/api/sessions/${encodeURIComponent(this.state.liveSessionId)}${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
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
    this.publishedAssets.clear();
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
    const response = await this.postBoardAction<SessionSummary>('/join-policy', { acceptingJoins });
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async rotateJoinCode(): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<{ joinCode: string }>('/rotate-code');
    if (!response.ok) return response;
    this.state = { ...this.state, joinCode: response.value.joinCode }; this.emit();
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async removeParticipant(participantId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<SessionSummary>(`/participants/${encodeURIComponent(participantId)}/remove`);
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async publishBoard(title: string, board: PublicPreparedBoard, loadAsset: AssetLoader, reset = false): Promise<ApiResult<DesktopLiveState>> {
    let materialized = await this.materializeBoard(title, board, loadAsset);
    if (!materialized.ok) return materialized;
    let response = await this.postBoardAction<LiveBoardSnapshot>(reset ? '/reset-board' : '/publish-board', { board: materialized.value });
    if (!response.ok && response.error.code === 'ASSET_UNAVAILABLE') {
      this.publishedAssets.clear();
      materialized = await this.materializeBoard(title, board, loadAsset);
      if (!materialized.ok) return materialized;
      response = await this.postBoardAction<LiveBoardSnapshot>(reset ? '/reset-board' : '/publish-board', { board: materialized.value });
    }
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async switchBoard(boardId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<LiveBoardSnapshot>('/switch-board', { boardId });
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async unpublish(): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<unknown>('/unpublish');
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async revealElement(boardId: string, element: PublicBoardElement, loadAsset: AssetLoader): Promise<ApiResult<DesktopLiveState>> {
    let materialized = await this.materializeElement(element, loadAsset);
    if (!materialized.ok) return materialized;
    let response = await this.postBoardAction<LiveBoardSnapshot>('/reveal', { boardId, element: materialized.value });
    if (!response.ok && response.error.code === 'ASSET_UNAVAILABLE') {
      this.publishedAssets.clear();
      materialized = await this.materializeElement(element, loadAsset);
      if (!materialized.ok) return materialized;
      response = await this.postBoardAction<LiveBoardSnapshot>('/reveal', { boardId, element: materialized.value });
    }
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async hideElement(boardId: string, elementId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<LiveBoardSnapshot>('/hide', { boardId, elementId });
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  async assignTokenController(boardId: string, tokenId: string, participantId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<SessionSummary>('/token-controller/assign', { boardId, tokenId, participantId });
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async clearTokenController(boardId: string, tokenId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<SessionSummary>('/token-controller/clear', { boardId, tokenId });
    if (!response.ok) return response;
    this.applySummary(response.value);
    return { ok: true, value: this.state };
  }

  async focusPlayers(boardId: string): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<true>('/camera-focus', { boardId, mode: 'fit' });
    return response.ok ? { ok: true, value: this.state } : response;
  }

  async moveTokenAsHost(boardId: string, tokenId: string, x: number, y: number): Promise<ApiResult<DesktopLiveState>> {
    const response = await this.postBoardAction<unknown>('/token-move-host', { boardId, tokenId, x, y });
    if (!response.ok) return response;
    await this.refresh();
    return { ok: true, value: this.state };
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = undefined;
    this.hostCredential = undefined;
    this.publishedAssets.clear();
    this.state = initialState();
  }
}
