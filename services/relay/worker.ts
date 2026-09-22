import {
  envelope,
  safeError,
  validateBoardIdRequest,
  validateEnvelope,
  validateHideElementRequest,
  validateJoinPolicy,
  validateJoinRequest,
  validatePublishBoardRequest,
  validateResumeRequest,
  validateRevealElementRequest,
  validateTokenAssignRequest,
  validateTokenClearRequest,
  validateTokenMovePayload,
  validatePingPayload,
  validateCameraFocusPayload,
  validateActivityPairRequest,
  validateActivityInstanceId,
  type ActivityBindingStatus,
  type ActivityPairingResponse,
  type ConnectionReadyPayload,
  type LiveApiError,
  type LiveBoardElement,
  type LiveBoardPayload,
  type SessionSummary
} from '../../packages/protocol/src/index';
import {
  createResponse,
  LiveSessionModel,
  randomActivityPairingCode,
  randomJoinCode,
  randomOpaque,
  SessionDirectoryModel,
  type ActivityBindingRecord,
  type ActivityPairingRecord,
  type LiveSessionRecord,
  type TicketIdentity
} from './session-model';

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  acceptWebSocket(webSocket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

type DurableObjectIdLike = object;
interface DurableObjectStubLike { fetch(input: Request | string, init?: RequestInit): Promise<Response> }
interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

interface AssetBinding { fetch(request: Request): Promise<Response> }
interface R2ObjectLike {
  body: ReadableStream<Uint8Array> | null;
  httpMetadata?: { contentType?: string };
}
interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<unknown | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
}

export interface Env {
  LIVE_SESSIONS: DurableObjectNamespaceLike;
  SESSION_DIRECTORY: DurableObjectNamespaceLike;
  LIVE_ASSETS: R2BucketLike;
  ASSETS: AssetBinding;
  DISCORD_CLIENT_ID?: string;
}

declare const WebSocketPair: {
  new(): { 0: WebSocket; 1: WebSocket };
};

type AttachedSocket = WebSocket & {
  serializeAttachment?: (value: TicketIdentity) => void;
  deserializeAttachment?: () => TicketIdentity | undefined;
};

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}

function errorStatus(error: LiveApiError): number {
  switch (error.error.code) {
    case 'AUTH_FAILED': return 401;
    case 'PERMISSION_DENIED':
    case 'TOKEN_NOT_CONTROLLABLE': return 403;
    case 'SESSION_NOT_FOUND': return 404;
    case 'SESSION_ENDED': return 410;
    case 'JOIN_LOCKED':
    case 'HOST_OFFLINE':
    case 'BOARD_NOT_ACTIVE':
    case 'ASSET_UNAVAILABLE':
    case 'STALE_STATE': return 409;
    case 'RATE_LIMITED': return 429;
    case 'CODE_INVALID':
    case 'PAYLOAD_INVALID': return 400;
    default: return 500;
  }
}

function resultResponse<T>(result: { ok: true; value: T } | { ok: false; error: LiveApiError }): Response {
  return result.ok ? json(result.value) : json(result.error, errorStatus(result.error));
}

async function requestJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) return undefined;
  try { return await request.json(); } catch { return undefined; }
}

function bearer(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const value = header.slice('Bearer '.length);
  return value && value.length <= 256 ? value : undefined;
}

function ticketFromProtocols(request: Request): string | undefined {
  const protocols = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map(value => value.trim());
  const ticketProtocol = protocols.find(value => value.startsWith('cmv2.ticket.'));
  return ticketProtocol?.slice('cmv2.ticket.'.length);
}

function assetIdsFromElement(element: LiveBoardElement): string[] {
  if (element.type === 'image') return [element.publishedAssetId];
  if (element.type === 'token' && element.publishedAssetId) return [element.publishedAssetId];
  return [];
}

function assetIdsFromBoard(board: LiveBoardPayload): string[] {
  return [...new Set(board.elements.flatMap(assetIdsFromElement))];
}

export async function assetsAvailable(bucket: R2BucketLike, liveSessionId: string, assetIds: string[]): Promise<boolean> {
  for (const assetId of assetIds) if (!await bucket.head(`${liveSessionId}/${assetId}`)) return false;
  return true;
}

async function deleteSessionAssets(bucket: R2BucketLike, liveSessionId: string): Promise<void> {
  const prefix = `${liveSessionId}/`;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    if (page.objects.length) await bucket.delete(page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

function imageMime(bytes: Uint8Array, declared: string): string | undefined {
  if (declared === 'image/png' && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return declared;
  if (declared === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return declared;
  if (declared === 'image/webp' && bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return declared;
  return undefined;
}

function sessionStub(env: Env, liveSessionId: string): DurableObjectStubLike {
  return env.LIVE_SESSIONS.get(env.LIVE_SESSIONS.idFromName(liveSessionId));
}

function directoryStub(env: Env): DurableObjectStubLike {
  return env.SESSION_DIRECTORY.get(env.SESSION_DIRECTORY.idFromName('directory'));
}

async function directoryCall(env: Env, path: string, body?: unknown): Promise<Response> {
  return directoryStub(env).fetch(`https://directory.internal${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function reserveCode(env: Env, liveSessionId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const joinCode = randomJoinCode();
    const response = await directoryCall(env, '/reserve', { joinCode, liveSessionId });
    if (response.ok) return joinCode;
  }
  throw new Error('Unable to reserve join code');
}

async function reserveActivityPairing(env: Env, liveSessionId: string): Promise<ActivityPairingResponse> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const pairingCode = randomActivityPairingCode();
    const response = await directoryCall(env, '/pairing-reserve', { pairingCode, liveSessionId });
    if (!response.ok) continue;
    const value = await response.json() as { expiresAt?: unknown };
    if (typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt)) return { pairingCode, expiresAt: value.expiresAt };
  }
  throw new Error('Unable to reserve activity pairing code');
}

export class SessionDirectory {
  private pairAttempts = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly state: DurableObjectStateLike) {}

  private async model(): Promise<SessionDirectoryModel> {
    return new SessionDirectoryModel(
      await this.state.storage.get<Record<string, string>>('codes') ?? {},
      await this.state.storage.get<Record<string, ActivityPairingRecord>>('pairings') ?? {},
      await this.state.storage.get<Record<string, ActivityBindingRecord>>('activityBindings') ?? {}
    );
  }

  private async persist(model: SessionDirectoryModel): Promise<void> {
    await this.state.storage.put('codes', model.codes);
    await this.state.storage.put('pairings', model.pairings);
    await this.state.storage.put('activityBindings', model.activityBindings);
  }

  private allowPairAttempt(instanceId: string, now = Date.now()): boolean {
    const current = this.pairAttempts.get(instanceId);
    if (!current || now - current.startedAt >= 60_000) {
      this.pairAttempts.set(instanceId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= 8) return false;
    current.count += 1;
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const model = await this.model();

    if (request.method === 'GET' && url.pathname === '/resolve') {
      const joinCode = url.searchParams.get('code') ?? '';
      const liveSessionId = model.resolve(joinCode);
      return liveSessionId ? json({ liveSessionId }) : json(safeError('CODE_INVALID', 'Codice sessione non valido.'), 404);
    }

    if (request.method === 'GET' && url.pathname === '/activity-binding') {
      const instanceId = url.searchParams.get('instanceId') ?? '';
      const binding = instanceId ? model.activityBinding(instanceId) : undefined;
      const status: ActivityBindingStatus = binding ? { bound: true, pairedAt: binding.pairedAt } : { bound: false };
      return json(status);
    }

    if (request.method === 'GET' && url.pathname === '/activity-binding-session') {
      const liveSessionId = url.searchParams.get('liveSessionId') ?? '';
      const binding = liveSessionId ? model.activityBindingForSession(liveSessionId) : undefined;
      const status: ActivityBindingStatus = binding ? { bound: true, instanceId: binding.instanceId, pairedAt: binding.pairedAt } : { bound: false };
      return json(status);
    }

    if (request.method !== 'POST') return json(safeError('PAYLOAD_INVALID', 'Metodo non supportato.'), 405);
    const body = await requestJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(safeError('PAYLOAD_INVALID', 'Richiesta non valida.'), 400);
    const data = body as Record<string, unknown>;
    const joinCode = typeof data.joinCode === 'string' ? data.joinCode : '';
    const liveSessionId = typeof data.liveSessionId === 'string' ? data.liveSessionId : '';

    if (url.pathname === '/reserve') {
      if (!joinCode || !liveSessionId || !model.reserve(joinCode, liveSessionId)) return json(safeError('CODE_INVALID', 'Codice non disponibile.'), 409);
      await this.persist(model);
      return json({ ok: true });
    }

    if (url.pathname === '/pairing-reserve') {
      const pairingCode = typeof data.pairingCode === 'string' ? data.pairingCode : '';
      const pairing = pairingCode && liveSessionId ? model.reserveActivityPairing(pairingCode, liveSessionId) : undefined;
      if (!pairing) return json(safeError('CODE_INVALID', 'Codice pairing non disponibile.'), 409);
      await this.persist(model);
      return json({ expiresAt: pairing.expiresAt });
    }

    if (url.pathname === '/pairing-consume') {
      const pairingCode = typeof data.pairingCode === 'string' ? data.pairingCode : '';
      const instanceId = typeof data.instanceId === 'string' ? data.instanceId : '';
      if (!pairingCode || !instanceId) return json(safeError('PAYLOAD_INVALID', 'Pairing non valido.'), 400);
      if (!this.allowPairAttempt(instanceId)) return json(safeError('RATE_LIMITED', 'Troppi tentativi di pairing.'), 429);
      const binding = model.consumeActivityPairing(pairingCode, instanceId);
      if (!binding) return json(safeError('CODE_INVALID', 'Pairing scaduto, già usato o non valido.'), 400);
      await this.persist(model);
      return json({ bound: true });
    }

    if (url.pathname === '/remove') {
      model.remove(joinCode, liveSessionId);
      await this.persist(model);
      return json({ ok: true });
    }

    return json(safeError('SESSION_NOT_FOUND', 'Endpoint directory non trovato.'), 404);
  }
}

export class LiveSession {
  private rateWindows = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly state: DurableObjectStateLike, private readonly env: Env) {}

  private allowRate(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const current = this.rateWindows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      this.rateWindows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  private async model(): Promise<LiveSessionModel | undefined> {
    const record = await this.state.storage.get<LiveSessionRecord>('session');
    return record ? LiveSessionModel.from(record) : undefined;
  }

  private async persist(model: LiveSessionModel): Promise<void> {
    await this.state.storage.put('session', model.record);
  }

  private socketIdentity(webSocket: WebSocket): TicketIdentity | undefined {
    return (webSocket as AttachedSocket).deserializeAttachment?.();
  }

  private send(webSocket: WebSocket, type: string, payload: unknown, requestId?: string): void {
    try { webSocket.send(JSON.stringify(envelope(type, payload, requestId))); } catch { /* closing socket */ }
  }

  private reject(webSocket: WebSocket, requestId: string | undefined, error: LiveApiError['error'], extra?: Record<string, unknown>): void {
    this.send(webSocket, 'request.rejected', { error, ...(extra ?? {}) }, requestId);
  }

  private accept(webSocket: WebSocket, requestId: string, payload: Record<string, unknown> = {}): void {
    this.send(webSocket, 'request.accepted', payload, requestId);
  }

  private async cleanupEndedSession(model: LiveSessionModel): Promise<void> {
    model.compactEndedRuntime();
    await this.persist(model);
    try {
      await directoryCall(this.env, '/remove', { joinCode: model.record.joinCode, liveSessionId: model.record.liveSessionId });
      await deleteSessionAssets(this.env.LIVE_ASSETS, model.record.liveSessionId);
      await this.state.storage.deleteAlarm();
    } catch {
      await this.state.storage.setAlarm(Date.now() + 60_000);
    }
  }

  private closeEndedSockets(reason: string, endedAt: number): void {
    for (const socket of this.state.getWebSockets()) {
      this.send(socket, 'session.ended', { reason, endedAt });
      try { socket.close(4000, reason); } catch { /* already closed */ }
    }
  }

  private hostSnapshot(model: LiveSessionModel): void {
    const summary = model.summary();
    for (const socket of this.state.getWebSockets('host')) this.send(socket, 'session.state', summary);
  }

  private sendPlayerSnapshot(model: LiveSessionModel, socket: WebSocket): void {
    const identity = this.socketIdentity(socket);
    const snapshot = model.playerSnapshot(identity?.role === 'player' ? identity.participantId : undefined);
    if (snapshot.presentation === 'board') this.send(socket, 'board.snapshot', snapshot.board);
    else this.send(socket, 'presentation.waiting', snapshot);
  }

  private broadcastPlayerSnapshot(model: LiveSessionModel): void {
    for (const socket of this.state.getWebSockets('player')) this.sendPlayerSnapshot(model, socket);
  }

  private broadcastTokenController(model: LiveSessionModel, boardId: string, tokenId: string): void {
    const stateSeq = model.summary().stateSeq;
    const controller = model.controllerForToken(boardId, tokenId);
    for (const socket of this.state.getWebSockets('player')) {
      const identity = this.socketIdentity(socket);
      this.send(socket, 'token.controller', {
        boardId,
        tokenId,
        controlled: identity?.role === 'player' && identity.participantId === controller,
        stateSeq
      });
    }
  }

  private playersLifecycle(model: LiveSessionModel): void {
    const summary = model.summary();
    for (const socket of this.state.getWebSockets('player')) {
      this.send(socket, 'session.state', {
        lifecycle: summary.lifecycle,
        presentation: summary.presentation,
        stateSeq: summary.stateSeq
      });
    }
  }

  private connectionReady(model: LiveSessionModel, socket: WebSocket, identity: TicketIdentity): void {
    const summary = model.summary();
    const payload: ConnectionReadyPayload = {
      role: identity.role,
      lifecycle: summary.lifecycle,
      stateSeq: summary.stateSeq,
      presentation: summary.presentation,
      ...(identity.participantId ? { participantId: identity.participantId } : {})
    };
    this.send(socket, 'connection.ready', payload);
    if (identity.role === 'host') this.send(socket, 'session.state', summary);
    else this.sendPlayerSnapshot(model, socket);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/init') {
      if (await this.model()) return json(safeError('PERMISSION_DENIED', 'Sessione già inizializzata.'), 409);
      const body = await requestJson(request) as { record?: LiveSessionRecord } | undefined;
      if (!body?.record?.liveSessionId) return json(safeError('PAYLOAD_INVALID', 'Stato iniziale non valido.'), 400);
      await this.state.storage.put('session', body.record);
      return json({ ok: true });
    }

    const model = await this.model();
    if (!model) return json(safeError('SESSION_NOT_FOUND', 'Sessione non trovata.'), 404);
    const expired = model.expireHostGrace();
    if (expired) {
      await this.persist(model);
      this.closeEndedSockets(expired.reason, expired.endedAt);
      await this.cleanupEndedSession(model);
      return json(safeError('SESSION_ENDED', 'La sessione è terminata.'), 410);
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket' && url.pathname.endsWith('/ws')) {
      const ticket = ticketFromProtocols(request);
      if (!ticket) return json(safeError('AUTH_FAILED', 'Ticket di connessione mancante.'), 401);
      const identity = await model.consumeTicket(ticket);
      if (!identity.ok) return resultResponse(identity);
      const connected = model.connect(identity.value);
      if (!connected.ok) { await this.persist(model); return resultResponse(connected); }
      await this.persist(model);
      if (identity.value.role === 'host') await this.state.storage.deleteAlarm();

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1] as AttachedSocket;
      server.serializeAttachment?.(identity.value);
      const tags = identity.value.role === 'host'
        ? ['host']
        : ['player', `participant:${identity.value.participantId}`];
      this.state.acceptWebSocket(server, tags);
      this.connectionReady(model, server, identity.value);
      this.hostSnapshot(model);
      this.playersLifecycle(model);
      return new Response(null, {
        status: 101,
        headers: { 'sec-websocket-protocol': 'cmv2.v1' },
        webSocket: client
      } as ResponseInit & { webSocket: WebSocket });
    }

    if (request.method === 'GET' && url.pathname === '/summary') {
      const credential = bearer(request);
      if (!credential || !(await model.authenticateHost(credential))) return json(safeError('AUTH_FAILED', 'Credenziale host non valida.'), 401);
      return json(model.summary());
    }

    if (request.method === 'POST' && url.pathname === '/host-ticket') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      const result = await model.hostTicket(credential);
      await this.persist(model);
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/activity-pairing-authorize') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      return resultResponse(await model.authorizeActivityPairing(credential));
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      const input = validateJoinRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Codice o nome non valido.'), 400);
      const result = await model.join(input.joinCode, input.displayName);
      await this.persist(model);
      if (result.ok) this.hostSnapshot(model);
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/resume') {
      const input = validateResumeRequest(await requestJson(request));
      if (!input || input.liveSessionId !== model.record.liveSessionId) return json(safeError('PAYLOAD_INVALID', 'Dati di resume non validi.'), 400);
      const result = await model.resume(input.participantId, input.resumeCredential);
      await this.persist(model);
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/join-policy') {
      const credential = bearer(request);
      const input = validateJoinPolicy(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Policy ingressi non valida.'), 400);
      const result = await model.setAcceptingJoins(credential, input.acceptingJoins);
      await this.persist(model);
      if (result.ok) this.hostSnapshot(model);
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/rotate-code') {
      const credential = bearer(request);
      const body = await requestJson(request) as { joinCode?: unknown } | undefined;
      if (!credential || typeof body?.joinCode !== 'string') return json(safeError('PAYLOAD_INVALID', 'Nuovo codice non valido.'), 400);
      const result = await model.rotateJoinCode(credential, body.joinCode);
      await this.persist(model);
      if (result.ok) this.hostSnapshot(model);
      return resultResponse(result);
    }

    if (request.method === 'GET' && url.pathname === '/final-token-positions') {
      const credential = bearer(request);
      if (!credential || !(await model.authenticateHost(credential))) return json(safeError('AUTH_FAILED', 'Credenziale host non valida.'), 401);
      if (model.record.lifecycle === 'ended') return json(safeError('SESSION_ENDED', 'La sessione è terminata.'), 410);
      return json(model.finalTokenPositions());
    }

    if (request.method === 'POST' && url.pathname === '/end') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      const result = await model.endSession(credential);
      await this.persist(model);
      if (result.ok) {
        this.closeEndedSockets(result.value.reason, result.value.endedAt);
        await this.cleanupEndedSession(model);
      }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/asset-authorize') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      return resultResponse(await model.authorizeAssetUpload(credential));
    }

    if (request.method === 'GET' && url.pathname === '/asset-read-authorize') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale asset mancante.'), 401);
      return resultResponse(await model.authorizeAssetRead(credential));
    }

    if (request.method === 'POST' && url.pathname === '/publish-board') {
      const credential = bearer(request); const input = validatePublishBoardRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Board live non valida.'), 400);
      const result = await model.publishBoard(credential, input.board);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastPlayerSnapshot(model); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/reset-board') {
      const credential = bearer(request); const input = validatePublishBoardRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Board live non valida.'), 400);
      const result = await model.resetBoard(credential, input.board);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastPlayerSnapshot(model); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/switch-board') {
      const credential = bearer(request); const input = validateBoardIdRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Board live non valida.'), 400);
      const result = await model.switchBoard(credential, input.boardId);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastPlayerSnapshot(model); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/unpublish') {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      const result = await model.unpublish(credential);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastPlayerSnapshot(model); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/reveal') {
      const credential = bearer(request); const input = validateRevealElementRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Elemento live non valido.'), 400);
      const result = await model.revealElement(credential, input.boardId, input.element);
      await this.persist(model);
      if (result.ok) {
        this.hostSnapshot(model);
        if (input.element.type === 'token' && model.controllerForToken(input.boardId, input.element.elementId)) {
          this.broadcastPlayerSnapshot(model);
        } else {
          for (const socket of this.state.getWebSockets('player')) this.send(socket, 'element.revealed', { boardId: input.boardId, element: input.element, stateSeq: result.value.stateSeq });
        }
      }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/hide') {
      const credential = bearer(request); const input = validateHideElementRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Elemento live non valido.'), 400);
      const before = model.boardSnapshot(input.boardId);
      const result = await model.hideElement(credential, input.boardId, input.elementId);
      await this.persist(model);
      if (result.ok) {
        this.hostSnapshot(model);
        const afterIds = new Set(result.value.elements.map(element => element.elementId));
        const removedIds = before?.elements.filter(element => !afterIds.has(element.elementId)).map(element => element.elementId) ?? [input.elementId];
        for (const socket of this.state.getWebSockets('player')) this.send(socket, 'element.hidden', { boardId: input.boardId, elementIds: removedIds, stateSeq: result.value.stateSeq });
      }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/token-controller/assign') {
      const credential = bearer(request); const input = validateTokenAssignRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Assegnazione token non valida.'), 400);
      const result = await model.assignTokenController(credential, input.boardId, input.tokenId, input.participantId);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastTokenController(model, input.boardId, input.tokenId); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/token-controller/clear') {
      const credential = bearer(request); const input = validateTokenClearRequest(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Rimozione controller non valida.'), 400);
      const result = await model.clearTokenController(credential, input.boardId, input.tokenId);
      await this.persist(model);
      if (result.ok) { this.hostSnapshot(model); this.broadcastTokenController(model, input.boardId, input.tokenId); }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/token-move-host') {
      const credential = bearer(request); const input = validateTokenMovePayload(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Movimento token non valido.'), 400);
      const result = await model.moveTokenAsHost(credential, input);
      await this.persist(model);
      if (result.ok) {
        this.hostSnapshot(model);
        for (const socket of this.state.getWebSockets('player')) this.send(socket, 'token.position', result.value);
      }
      return resultResponse(result);
    }

    if (request.method === 'POST' && url.pathname === '/camera-focus') {
      const credential = bearer(request); const input = validateCameraFocusPayload(await requestJson(request));
      if (!credential || !input) return json(safeError('PAYLOAD_INVALID', 'Focus camera non valido.'), 400);
      const result = await model.authorizeCameraFocus(credential, input.boardId);
      if (result.ok) for (const socket of this.state.getWebSockets('player')) this.send(socket, 'camera.focus', input);
      return resultResponse(result);
    }

    const removeMatch = url.pathname.match(/^\/participants\/([^/]+)\/remove$/u);
    if (request.method === 'POST' && removeMatch) {
      const credential = bearer(request);
      if (!credential) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      const participantId = decodeURIComponent(removeMatch[1]);
      const result = await model.removeParticipant(credential, participantId);
      await this.persist(model);
      if (result.ok) {
        for (const socket of this.state.getWebSockets(`participant:${participantId}`)) {
          this.send(socket, 'participant.removed', { participantId });
          socket.close(4003, 'removed');
        }
        this.hostSnapshot(model);
      }
      return resultResponse(result);
    }

    return json(safeError('SESSION_NOT_FOUND', 'Endpoint sessione non trovato.'), 404);
  }

  async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const model = await this.model(); if (!model) return;
    const identity = this.socketIdentity(webSocket);
    if (!identity) { webSocket.close(4001, 'unauthorized'); return; }
    if (typeof message !== 'string' || message.length > 64 * 1024) {
      this.send(webSocket, 'request.rejected', { error: { code: 'PAYLOAD_INVALID', message: 'Messaggio non valido.' } });
      return;
    }
    let value: unknown;
    try { value = JSON.parse(message); } catch { value = undefined; }
    if (value && typeof value === 'object' && !Array.isArray(value) && 'protocolVersion' in value && (value as { protocolVersion?: unknown }).protocolVersion !== 1) {
      this.send(webSocket, 'request.rejected', { error: { code: 'PROTOCOL_VERSION_UNSUPPORTED', message: 'Versione protocollo non supportata.' } });
      return;
    }
    const inbound = validateEnvelope(value);
    if (!inbound) {
      this.send(webSocket, 'request.rejected', { error: { code: 'PAYLOAD_INVALID', message: 'Messaggio non valido.' } });
      return;
    }
    if (identity.role === 'player' && inbound.type === 'snapshot.request') {
      this.sendPlayerSnapshot(model, webSocket);
      return;
    }

    if (identity.role !== 'player' || !identity.participantId) {
      this.reject(webSocket, inbound.requestId, { code: 'PERMISSION_DENIED', message: 'Comando non disponibile per questo ruolo.' });
      return;
    }

    if (inbound.type === 'token.move.preview') {
      const input = validateTokenMovePayload(inbound.payload);
      if (!input) { this.reject(webSocket, inbound.requestId, { code: 'PAYLOAD_INVALID', message: 'Preview token non valida.' }); return; }
      if (!this.allowRate(`preview:${identity.participantId}`, 40, 1000)) return;
      const allowed = model.authorizePlayerTokenPreview(identity.participantId, input);
      if (!allowed.ok) { if (inbound.requestId) this.reject(webSocket, inbound.requestId, allowed.error.error, { authoritativePosition: model.tokenPosition(input.boardId, input.tokenId) }); return; }
      for (const socket of this.state.getWebSockets('player')) this.send(socket, 'token.move.preview', input);
      return;
    }

    if (inbound.type === 'token.move.commit') {
      const input = validateTokenMovePayload(inbound.payload);
      if (!inbound.requestId || !input) { this.reject(webSocket, inbound.requestId, { code: 'PAYLOAD_INVALID', message: 'Commit token non valido.' }); return; }
      if (!this.allowRate(`commit:${identity.participantId}`, 16, 1000)) { this.reject(webSocket, inbound.requestId, { code: 'RATE_LIMITED', message: 'Troppi movimenti ravvicinati.' }, { authoritativePosition: model.tokenPosition(input.boardId, input.tokenId) }); return; }
      const result = model.commitPlayerTokenMove(identity.participantId, input);
      if (!result.ok) { this.reject(webSocket, inbound.requestId, result.error.error, { authoritativePosition: model.tokenPosition(input.boardId, input.tokenId) }); return; }
      await this.persist(model);
      this.accept(webSocket, inbound.requestId, { stateSeq: result.value.stateSeq });
      this.hostSnapshot(model);
      for (const socket of this.state.getWebSockets('player')) this.send(socket, 'token.position', result.value);
      return;
    }

    if (inbound.type === 'ping.create') {
      const input = validatePingPayload(inbound.payload);
      if (!inbound.requestId || !input) { this.reject(webSocket, inbound.requestId, { code: 'PAYLOAD_INVALID', message: 'Ping non valido.' }); return; }
      if (!this.allowRate(`ping:${identity.participantId}`, 4, 3000)) { this.reject(webSocket, inbound.requestId, { code: 'RATE_LIMITED', message: 'Troppi ping ravvicinati.' }); return; }
      const allowed = model.authorizePing(identity.participantId, input.boardId);
      if (!allowed.ok) { this.reject(webSocket, inbound.requestId, allowed.error.error); return; }
      this.accept(webSocket, inbound.requestId);
      for (const socket of this.state.getWebSockets('player')) this.send(socket, 'ping.show', { ...input, participantId: identity.participantId });
      for (const socket of this.state.getWebSockets('host')) this.send(socket, 'ping.show', { ...input, participantId: identity.participantId });
      return;
    }

    this.reject(webSocket, inbound.requestId, { code: 'PERMISSION_DENIED', message: 'Comando non disponibile in questa versione.' });
  }

  async webSocketClose(webSocket: WebSocket): Promise<void> {
    const model = await this.model(); if (!model) return;
    const identity = this.socketIdentity(webSocket); if (!identity) return;

    if (identity.role === 'host') {
      if (this.state.getWebSockets('host').length > 0) return;
      model.disconnect(identity);
      await this.persist(model);
      const deadline = model.hostGraceDeadline();
      if (deadline) await this.state.storage.setAlarm(deadline);
    } else {
      const participantId = identity.participantId;
      if (!participantId || this.state.getWebSockets(`participant:${participantId}`).length > 0) return;
      model.disconnect(identity);
      await this.persist(model);
    }
    this.hostSnapshot(model);
    this.playersLifecycle(model);
  }

  async webSocketError(webSocket: WebSocket): Promise<void> {
    await this.webSocketClose(webSocket);
  }

  async alarm(): Promise<void> {
    const model = await this.model(); if (!model) return;
    if (model.record.lifecycle === 'ended') {
      await this.cleanupEndedSession(model);
      return;
    }
    const ended = model.expireHostGrace();
    if (!ended) {
      const deadline = model.hostGraceDeadline();
      if (deadline) await this.state.storage.setAlarm(deadline);
      return;
    }
    await this.persist(model);
    this.closeEndedSockets(ended.reason, ended.endedAt);
    await this.cleanupEndedSession(model);
  }
}

async function forwardSession(env: Env, liveSessionId: string, path: string, request: Request, body?: unknown): Promise<Response> {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return sessionStub(env, liveSessionId).fetch(`https://session.internal${path}`, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (request.method === 'POST' && url.pathname === '/api/sessions') {
      const created = await LiveSessionModel.create();
      const joinCode = await reserveCode(env, created.model.record.liveSessionId);
      created.model.record.joinCode = joinCode;
      const stub = sessionStub(env, created.model.record.liveSessionId);
      const init = await stub.fetch('https://session.internal/internal/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ record: created.model.record })
      });
      if (!init.ok) {
        await directoryCall(env, '/remove', { joinCode, liveSessionId: created.model.record.liveSessionId });
        return json(safeError('INTERNAL_ERROR', 'Non è stato possibile creare la sessione.'), 500);
      }
      return json(createResponse(created.model, created.hostCredential, created.ticket, `${url.origin}/`), 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/activity/config') {
      return json({ ...(env.DISCORD_CLIENT_ID ? { clientId: env.DISCORD_CLIENT_ID } : {}) });
    }

    const activityInstanceMatch = url.pathname.match(/^\/api\/activity\/instances\/([^/]+)$/u);
    if (request.method === 'GET' && activityInstanceMatch) {
      const instanceId = validateActivityInstanceId(decodeURIComponent(activityInstanceMatch[1]));
      if (!instanceId) return json(safeError('PAYLOAD_INVALID', 'Activity instance non valida.'), 400);
      return directoryStub(env).fetch(`https://directory.internal/activity-binding?instanceId=${encodeURIComponent(instanceId)}`);
    }

    if (request.method === 'POST' && url.pathname === '/api/activity/pair') {
      const input = validateActivityPairRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Pairing Activity non valido.'), 400);
      return directoryCall(env, '/pairing-consume', input);
    }

    if (request.method === 'POST' && url.pathname === '/api/join') {
      const input = validateJoinRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Codice o nome non valido.'), 400);
      const directory = await directoryStub(env).fetch(`https://directory.internal/resolve?code=${encodeURIComponent(input.joinCode)}`);
      if (!directory.ok) return json(safeError('CODE_INVALID', 'Codice sessione non valido.'), 400);
      const { liveSessionId } = await directory.json() as { liveSessionId: string };
      return forwardSession(env, liveSessionId, '/join', new Request(request.url, { method: 'POST' }), input);
    }

    if (request.method === 'POST' && url.pathname === '/api/resume') {
      const input = validateResumeRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Dati di resume non validi.'), 400);
      return forwardSession(env, input.liveSessionId, '/resume', new Request(request.url, { method: 'POST' }), input);
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)(.*)$/u);
    if (!sessionMatch) return json(safeError('SESSION_NOT_FOUND', 'Endpoint non trovato.'), 404);
    const liveSessionId = decodeURIComponent(sessionMatch[1]);
    const tail = sessionMatch[2] || '';

    if (tail === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return sessionStub(env, liveSessionId).fetch(request);
    }

    const assetMatch = tail.match(/^\/assets\/([A-Za-z0-9_-]+)$/u);
    if (request.method === 'GET' && assetMatch) {
      const authorized = await forwardSession(env, liveSessionId, '/asset-read-authorize', request);
      if (!authorized.ok) return authorized;
      const publishedAssetId = assetMatch[1];
      const object = await env.LIVE_ASSETS.get(`${liveSessionId}/${publishedAssetId}`);
      if (!object?.body) return json(safeError('ASSET_UNAVAILABLE', 'Asset live non disponibile.'), 404);
      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          'cache-control': 'private, max-age=3600',
          'x-content-type-options': 'nosniff'
        }
      });
    }

    if (request.method === 'POST' && tail === '/assets') {
      const authorized = await forwardSession(env, liveSessionId, '/asset-authorize', request);
      if (!authorized.ok) return authorized;
      const declared = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(declared)) return json(safeError('PAYLOAD_INVALID', 'Formato asset live non supportato.'), 400);
      const contentLength = Number(request.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > 20 * 1024 * 1024) return json(safeError('PAYLOAD_INVALID', 'Asset live troppo grande.'), 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const mime = imageMime(bytes, declared);
      if (!bytes.length || bytes.length > 20 * 1024 * 1024 || !mime) return json(safeError('PAYLOAD_INVALID', 'Asset live non valido.'), 400);
      const publishedAssetId = randomOpaque('asset', 18);
      await env.LIVE_ASSETS.put(`${liveSessionId}/${publishedAssetId}`, bytes, { httpMetadata: { contentType: mime } });
      return json({ publishedAssetId }, 201);
    }

    if (request.method === 'GET' && !tail) return forwardSession(env, liveSessionId, '/summary', request);

    if (request.method === 'POST' && tail === '/activity-pairing') {
      const authorized = await forwardSession(env, liveSessionId, '/activity-pairing-authorize', request);
      if (!authorized.ok) return authorized;
      try { return json(await reserveActivityPairing(env, liveSessionId), 201); }
      catch { return json(safeError('INTERNAL_ERROR', 'Non è stato possibile creare il pairing Discord.'), 500); }
    }

    if (request.method === 'GET' && tail === '/activity-binding') {
      const authorized = await forwardSession(env, liveSessionId, '/summary', request);
      if (!authorized.ok) return authorized;
      return directoryStub(env).fetch(`https://directory.internal/activity-binding-session?liveSessionId=${encodeURIComponent(liveSessionId)}`);
    }

    if (request.method === 'GET' && tail === '/final-token-positions') return forwardSession(env, liveSessionId, '/final-token-positions', request);
    if (request.method === 'POST' && tail === '/end') return forwardSession(env, liveSessionId, '/end', request);
    if (request.method === 'POST' && tail === '/host-ticket') return forwardSession(env, liveSessionId, '/host-ticket', request);
    if (request.method === 'POST' && tail === '/join-policy') return forwardSession(env, liveSessionId, '/join-policy', request, await requestJson(request));

    if (request.method === 'POST' && (tail === '/publish-board' || tail === '/reset-board')) {
      const input = validatePublishBoardRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Board live non valida.'), 400);
      if (!await assetsAvailable(env.LIVE_ASSETS, liveSessionId, assetIdsFromBoard(input.board))) return json(safeError('ASSET_UNAVAILABLE', 'Uno o più asset della board non sono disponibili.'), 409);
      return forwardSession(env, liveSessionId, tail, request, input);
    }

    if (request.method === 'POST' && tail === '/switch-board') {
      const input = validateBoardIdRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Board live non valida.'), 400);
      return forwardSession(env, liveSessionId, '/switch-board', request, input);
    }

    if (request.method === 'POST' && tail === '/unpublish') return forwardSession(env, liveSessionId, '/unpublish', request);

    if (request.method === 'POST' && tail === '/reveal') {
      const input = validateRevealElementRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Elemento live non valido.'), 400);
      if (!await assetsAvailable(env.LIVE_ASSETS, liveSessionId, assetIdsFromElement(input.element))) return json(safeError('ASSET_UNAVAILABLE', 'Asset dell’elemento non disponibile.'), 409);
      return forwardSession(env, liveSessionId, '/reveal', request, input);
    }

    if (request.method === 'POST' && tail === '/hide') {
      const input = validateHideElementRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Elemento live non valido.'), 400);
      return forwardSession(env, liveSessionId, '/hide', request, input);
    }

    if (request.method === 'POST' && tail === '/token-controller/assign') {
      const input = validateTokenAssignRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Assegnazione token non valida.'), 400);
      return forwardSession(env, liveSessionId, '/token-controller/assign', request, input);
    }

    if (request.method === 'POST' && tail === '/token-controller/clear') {
      const input = validateTokenClearRequest(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Rimozione controller non valida.'), 400);
      return forwardSession(env, liveSessionId, '/token-controller/clear', request, input);
    }

    if (request.method === 'POST' && tail === '/token-move-host') {
      const input = validateTokenMovePayload(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Movimento token non valido.'), 400);
      return forwardSession(env, liveSessionId, '/token-move-host', request, input);
    }

    if (request.method === 'POST' && tail === '/camera-focus') {
      const input = validateCameraFocusPayload(await requestJson(request));
      if (!input) return json(safeError('PAYLOAD_INVALID', 'Focus camera non valido.'), 400);
      return forwardSession(env, liveSessionId, '/camera-focus', request, input);
    }

    if (request.method === 'POST' && tail === '/rotate-code') {
      const authorization = bearer(request);
      if (!authorization) return json(safeError('AUTH_FAILED', 'Credenziale host mancante.'), 401);
      const currentResponse = await forwardSession(env, liveSessionId, '/summary', request);
      if (!currentResponse.ok) return currentResponse;
      const current = await currentResponse.json() as SessionSummary;
      const nextCode = await reserveCode(env, liveSessionId);
      const rotated = await forwardSession(env, liveSessionId, '/rotate-code', request, { joinCode: nextCode });
      if (!rotated.ok) {
        await directoryCall(env, '/remove', { joinCode: nextCode, liveSessionId });
        return rotated;
      }
      await directoryCall(env, '/remove', { joinCode: current.joinCode, liveSessionId });
      return json({ joinCode: nextCode });
    }

    const removeMatch = tail.match(/^\/participants\/([^/]+)\/remove$/u);
    if (request.method === 'POST' && removeMatch) {
      return forwardSession(env, liveSessionId, `/participants/${encodeURIComponent(decodeURIComponent(removeMatch[1]))}/remove`, request);
    }

    return json(safeError('SESSION_NOT_FOUND', 'Endpoint non trovato.'), 404);
  }
};
