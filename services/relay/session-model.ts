import {
  safeError,
  type CreateSessionResponse,
  type JoinSessionResponse,
  type LiveApiError,
  type LiveBoardElement,
  type LiveBoardPayload,
  type LiveBoardSnapshot,
  type LiveParticipant,
  type LiveRole,
  type FinalTokenPositionsResponse,
  type PlayerBoardState,
  type SessionEndReason,
  type SessionEndedEvent,
  type SessionLifecycle,
  type SessionSummary,
  type TicketResponse,
  type TokenMovePayload,
  type TokenPositionEvent,
  type WaitingSnapshot
} from '../../packages/protocol/src/index';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const encoder = new TextEncoder();
export const HOST_GRACE_MS = 10 * 60 * 1000;
export const ACTIVITY_PAIRING_TTL_MS = 5 * 60 * 1000;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomOpaque(prefix: string, bytes = 24): string {
  return `${prefix}_${base64url(randomBytes(bytes))}`;
}

export function randomJoinCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let index = 0; index < 8; index++) code += alphabet[bytes[index] % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function randomActivityPairingCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let index = 0; index < 6; index++) code += alphabet[bytes[index] % alphabet.length];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export async function secretHash(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return base64url(new Uint8Array(digest));
}

export interface SessionTicket {
  ticketHash: string;
  role: LiveRole;
  participantId?: string;
  expiresAt: number;
}

export interface StoredParticipant extends LiveParticipant {
  resumeCredentialHash: string;
}

export interface StoredLiveBoard {
  boardId: string;
  title: string;
  elements: LiveBoardElement[];
  tokenControllers: Record<string, string>;
  tokenPositions: Record<string, { x: number; y: number }>;
}

export interface LiveSessionRecord {
  liveSessionId: string;
  joinCode: string;
  lifecycle: SessionLifecycle;
  acceptingJoins: boolean;
  hostCredentialHash: string;
  hostConnected: boolean;
  hostGraceUntil?: number;
  endedAt?: number;
  endReason?: SessionEndReason;
  participants: StoredParticipant[];
  tickets: SessionTicket[];
  stateSeq: number;
  activeBoardId?: string;
  boards: StoredLiveBoard[];
}

export type SessionResult<T> = { ok: true; value: T } | { ok: false; error: LiveApiError };

export interface TicketIdentity {
  role: LiveRole;
  participantId?: string;
}

const ok = <T>(value: T): SessionResult<T> => ({ ok: true, value });
const fail = <T>(code: Parameters<typeof safeError>[0], message: string): SessionResult<T> => ({ ok: false, error: safeError(code, message) });

function tokenPositionsFromElements(elements: LiveBoardElement[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(elements.filter((element): element is Extract<LiveBoardElement, { type: 'token' }> => element.type === 'token').map(token => [token.elementId, { x: token.x, y: token.y }]));
}

function storedBoard(payload: LiveBoardPayload): StoredLiveBoard {
  return { ...structuredClone(payload), tokenControllers: {}, tokenPositions: tokenPositionsFromElements(payload.elements) };
}

export class LiveSessionModel {
  private constructor(public record: LiveSessionRecord) {}

  static async create(joinCode = randomJoinCode(), now = Date.now()): Promise<{ model: LiveSessionModel; hostCredential: string; ticket: string }> {
    const liveSessionId = randomOpaque('session');
    const hostCredential = randomOpaque('host', 32);
    const model = new LiveSessionModel({
      liveSessionId,
      joinCode,
      lifecycle: 'open',
      acceptingJoins: true,
      hostCredentialHash: await secretHash(hostCredential),
      hostConnected: false,
      participants: [],
      tickets: [],
      stateSeq: 0,
      boards: []
    });
    const ticket = await model.issueTicket('host', undefined, now);
    return { model, hostCredential, ticket };
  }

  static from(record: LiveSessionRecord): LiveSessionModel {
    return new LiveSessionModel({
      ...structuredClone(record),
      boards: Array.isArray(record.boards)
        ? structuredClone(record.boards).map(board => ({
            ...board,
            tokenControllers: board.tokenControllers ?? {},
            tokenPositions: board.tokenPositions ?? tokenPositionsFromElements(board.elements)
          }))
        : [],
      ...(record.activeBoardId ? { activeBoardId: record.activeBoardId } : {}),
      ...(record.hostGraceUntil ? { hostGraceUntil: record.hostGraceUntil } : {}),
      ...(record.endedAt ? { endedAt: record.endedAt } : {}),
      ...(record.endReason ? { endReason: record.endReason } : {})
    });
  }

  private cleanupTickets(now: number): void {
    this.record.tickets = this.record.tickets.filter(ticket => ticket.expiresAt > now);
  }

  private bump(): void {
    this.record.stateSeq += 1;
  }

  private async issueTicket(role: LiveRole, participantId: string | undefined, now: number): Promise<string> {
    this.cleanupTickets(now);
    const ticket = randomOpaque('ticket');
    this.record.tickets.push({
      ticketHash: await secretHash(ticket),
      role,
      ...(participantId ? { participantId } : {}),
      expiresAt: now + 60_000
    });
    return ticket;
  }

  summary(): SessionSummary {
    return {
      liveSessionId: this.record.liveSessionId,
      joinCode: this.record.joinCode,
      lifecycle: this.record.lifecycle,
      acceptingJoins: this.record.acceptingJoins,
      participants: this.record.participants.map(participant => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        connected: participant.connected,
        tokenIds: this.controlledVisibleTokenIds(participant.participantId)
      })),
      stateSeq: this.record.stateSeq,
      presentation: this.record.activeBoardId ? 'board' : 'waiting',
      ...(this.record.hostGraceUntil ? { hostGraceUntil: this.record.hostGraceUntil } : {}),
      ...(this.record.activeBoardId ? { activeBoardId: this.record.activeBoardId } : {}),
      ...(this.record.activeBoardId ? { activeElementIds: this.board(this.record.activeBoardId)?.elements.map(element => element.elementId) ?? [] } : {}),
      liveBoards: this.record.boards.map(board => ({ boardId: board.boardId, title: board.title }))
    };
  }

  async authenticateHost(hostCredential: string): Promise<boolean> {
    if (this.record.lifecycle === 'ended') return false;
    return await secretHash(hostCredential) === this.record.hostCredentialHash;
  }

  async authorizeAssetRead(credential: string): Promise<SessionResult<true>> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    const hash = await secretHash(credential);
    if (hash === this.record.hostCredentialHash) return ok(true);
    if (this.record.participants.some(participant => participant.resumeCredentialHash === hash)) return ok(true);
    return fail('AUTH_FAILED', 'Credenziale asset non valida.');
  }

  private async authorizeHostMutation(hostCredential: string): Promise<SessionResult<true>> {
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (this.record.lifecycle !== 'open' || !this.record.hostConnected) return fail('HOST_OFFLINE', 'Il master non è connesso alla sessione.');
    return ok(true);
  }

  private board(boardId: string): StoredLiveBoard | undefined {
    return this.record.boards.find(board => board.boardId === boardId);
  }

  private visibleToken(board: StoredLiveBoard, tokenId: string): Extract<LiveBoardElement, { type: 'token' }> | undefined {
    const token = board.elements.find(element => element.elementId === tokenId);
    return token?.type === 'token' ? token : undefined;
  }

  private controlledVisibleTokenIds(participantId: string): string[] {
    return [...new Set(this.record.boards.flatMap(board =>
      Object.entries(board.tokenControllers)
        .filter(([tokenId, controller]) => controller === participantId && !!this.visibleToken(board, tokenId))
        .map(([tokenId]) => tokenId)
    ))];
  }

  controllerForToken(boardId: string, tokenId: string): string | undefined {
    return this.board(boardId)?.tokenControllers[tokenId];
  }

  tokenPosition(boardId: string, tokenId: string): { x: number; y: number } | undefined {
    const position = this.board(boardId)?.tokenPositions[tokenId];
    return position ? { ...position } : undefined;
  }

  finalTokenPositions(): FinalTokenPositionsResponse {
    return {
      boards: this.record.boards.map(board => ({
        boardId: board.boardId,
        title: board.title,
        tokens: Object.entries(board.tokenPositions).map(([tokenId, position]) => ({ tokenId, ...position }))
      }))
    };
  }

  hostGraceDeadline(): number | undefined {
    return this.record.lifecycle === 'host_reconnecting' ? this.record.hostGraceUntil : undefined;
  }

  private finish(reason: SessionEndReason, now: number): SessionEndedEvent {
    this.record.lifecycle = 'ended';
    this.record.endReason = reason;
    this.record.endedAt = now;
    this.record.hostConnected = false;
    this.record.hostGraceUntil = undefined;
    this.record.acceptingJoins = false;
    this.record.activeBoardId = undefined;
    this.record.tickets = [];
    for (const participant of this.record.participants) participant.connected = false;
    this.bump();
    return { reason, endedAt: now };
  }

  expireHostGrace(now = Date.now()): SessionEndedEvent | undefined {
    if (this.record.lifecycle !== 'host_reconnecting' || !this.record.hostGraceUntil || now < this.record.hostGraceUntil) return undefined;
    return this.finish('host_timeout', now);
  }

  async endSession(hostCredential: string, now = Date.now()): Promise<SessionResult<SessionEndedEvent>> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è già terminata.');
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    return ok(this.finish('explicit', now));
  }

  compactEndedRuntime(): void {
    if (this.record.lifecycle !== 'ended') return;
    this.record.hostCredentialHash = 'ended';
    this.record.participants = [];
    this.record.tickets = [];
    this.record.boards = [];
    this.record.activeBoardId = undefined;
  }

  boardSnapshot(boardId = this.record.activeBoardId, participantId?: string): LiveBoardSnapshot | undefined {
    if (!boardId) return undefined;
    const board = this.board(boardId);
    if (!board) return undefined;
    const controlledTokenIds = participantId
      ? Object.entries(board.tokenControllers)
          .filter(([tokenId, controller]) => controller === participantId && !!this.visibleToken(board, tokenId))
          .map(([tokenId]) => tokenId)
      : undefined;
    return {
      boardId: board.boardId,
      title: board.title,
      elements: structuredClone(board.elements),
      stateSeq: this.record.stateSeq,
      ...(controlledTokenIds ? { controlledTokenIds } : {})
    };
  }

  playerSnapshot(participantId?: string): WaitingSnapshot | PlayerBoardState {
    const board = this.boardSnapshot(undefined, participantId);
    if (!board) {
      return {
        lifecycle: this.record.lifecycle,
        presentation: 'waiting',
        stateSeq: this.record.stateSeq,
        acceptingJoins: this.record.acceptingJoins
      };
    }
    return {
      lifecycle: this.record.lifecycle,
      presentation: 'board',
      stateSeq: this.record.stateSeq,
      board
    };
  }

  async authorizeAssetUpload(hostCredential: string): Promise<SessionResult<true>> {
    return this.authorizeHostMutation(hostCredential);
  }

  async authorizeActivityPairing(hostCredential: string): Promise<SessionResult<true>> {
    return this.authorizeHostMutation(hostCredential);
  }

  async hostTicket(hostCredential: string, now = Date.now()): Promise<SessionResult<TicketResponse>> {
    if (this.record.lifecycle === 'host_reconnecting' && this.record.hostGraceUntil && now >= this.record.hostGraceUntil) this.finish('host_timeout', now);
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    return ok({ ticket: await this.issueTicket('host', undefined, now) });
  }

  async join(joinCode: string, displayName: string, now = Date.now()): Promise<SessionResult<JoinSessionResponse>> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (joinCode !== this.record.joinCode) return fail('CODE_INVALID', 'Codice sessione non valido.');
    if (!this.record.acceptingJoins) return fail('JOIN_LOCKED', 'Il master ha chiuso i nuovi ingressi.');
    if (!this.record.hostConnected) return fail('HOST_OFFLINE', 'Il master non è connesso alla sessione.');

    const participantId = randomOpaque('participant', 18);
    const resumeCredential = randomOpaque('resume', 32);
    this.record.participants.push({
      participantId,
      displayName,
      connected: false,
      tokenIds: [],
      resumeCredentialHash: await secretHash(resumeCredential)
    });
    this.bump();
    return ok({
      liveSessionId: this.record.liveSessionId,
      participantId,
      resumeCredential,
      ticket: await this.issueTicket('player', participantId, now)
    });
  }

  async resume(participantId: string, resumeCredential: string, now = Date.now()): Promise<SessionResult<TicketResponse>> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    const participant = this.record.participants.find(item => item.participantId === participantId);
    if (!participant || await secretHash(resumeCredential) !== participant.resumeCredentialHash) return fail('AUTH_FAILED', 'Credenziale partecipante non valida.');
    return ok({ ticket: await this.issueTicket('player', participantId, now) });
  }

  async consumeTicket(ticket: string, now = Date.now()): Promise<SessionResult<TicketIdentity>> {
    this.cleanupTickets(now);
    const hash = await secretHash(ticket);
    const index = this.record.tickets.findIndex(item => item.ticketHash === hash);
    if (index < 0) return fail('AUTH_FAILED', 'Ticket di connessione non valido o scaduto.');
    const [stored] = this.record.tickets.splice(index, 1);
    if (stored.role === 'player' && !this.record.participants.some(item => item.participantId === stored.participantId)) return fail('AUTH_FAILED', 'Partecipante non più valido.');
    return ok({ role: stored.role, ...(stored.participantId ? { participantId: stored.participantId } : {}) });
  }

  connect(identity: TicketIdentity, now = Date.now()): SessionResult<SessionSummary> {
    if (identity.role === 'host' && this.record.lifecycle === 'host_reconnecting' && this.record.hostGraceUntil && now >= this.record.hostGraceUntil) this.finish('host_timeout', now);
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (identity.role === 'host') {
      this.record.hostConnected = true;
      if (this.record.lifecycle === 'host_reconnecting') {
        this.record.lifecycle = 'open';
        this.record.hostGraceUntil = undefined;
        this.bump();
      }
      return ok(this.summary());
    }
    const participant = this.record.participants.find(item => item.participantId === identity.participantId);
    if (!participant) return fail('AUTH_FAILED', 'Partecipante non valido.');
    if (!participant.connected) {
      participant.connected = true;
      this.bump();
    }
    return ok(this.summary());
  }

  disconnect(identity: TicketIdentity, now = Date.now()): void {
    if (identity.role === 'host') {
      this.record.hostConnected = false;
      if (this.record.lifecycle === 'open') {
        this.record.lifecycle = 'host_reconnecting';
        this.record.hostGraceUntil = now + HOST_GRACE_MS;
        this.bump();
      }
      return;
    }
    const participant = this.record.participants.find(item => item.participantId === identity.participantId);
    if (participant?.connected) {
      participant.connected = false;
      this.bump();
    }
  }

  async setAcceptingJoins(hostCredential: string, acceptingJoins: boolean): Promise<SessionResult<SessionSummary>> {
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (this.record.acceptingJoins !== acceptingJoins) {
      this.record.acceptingJoins = acceptingJoins;
      this.bump();
    }
    return ok(this.summary());
  }

  async rotateJoinCode(hostCredential: string, joinCode = randomJoinCode()): Promise<SessionResult<{ previousCode: string; summary: SessionSummary }>> {
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    const previousCode = this.record.joinCode;
    this.record.joinCode = joinCode;
    this.bump();
    return ok({ previousCode, summary: this.summary() });
  }

  async removeParticipant(hostCredential: string, participantId: string): Promise<SessionResult<SessionSummary>> {
    if (!(await this.authenticateHost(hostCredential))) return fail('AUTH_FAILED', 'Credenziale host non valida.');
    const index = this.record.participants.findIndex(item => item.participantId === participantId);
    if (index < 0) return fail('SESSION_NOT_FOUND', 'Partecipante non trovato.');
    this.record.participants.splice(index, 1);
    this.record.tickets = this.record.tickets.filter(ticket => ticket.participantId !== participantId);
    for (const board of this.record.boards) {
      for (const [tokenId, controller] of Object.entries(board.tokenControllers)) if (controller === participantId) delete board.tokenControllers[tokenId];
    }
    this.bump();
    return ok(this.summary());
  }

  async assignTokenController(hostCredential: string, boardId: string, tokenId: string, participantId: string): Promise<SessionResult<SessionSummary>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId !== boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    const board = this.board(boardId); if (!board) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    if (!this.visibleToken(board, tokenId)) return fail('TOKEN_NOT_CONTROLLABLE', 'Il token non è pubblicato nella scena attiva.');
    if (!this.record.participants.some(participant => participant.participantId === participantId)) return fail('SESSION_NOT_FOUND', 'Partecipante non trovato.');
    if (board.tokenControllers[tokenId] !== participantId) {
      board.tokenControllers[tokenId] = participantId;
      this.bump();
    }
    return ok(this.summary());
  }

  async clearTokenController(hostCredential: string, boardId: string, tokenId: string): Promise<SessionResult<SessionSummary>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    const board = this.board(boardId); if (!board) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    if (board.tokenControllers[tokenId]) {
      delete board.tokenControllers[tokenId];
      this.bump();
    }
    return ok(this.summary());
  }

  private authorizePlayerBoardMutation(participantId: string, boardId: string): SessionResult<StoredLiveBoard> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (this.record.lifecycle !== 'open' || !this.record.hostConnected) return fail('HOST_OFFLINE', 'Il master non è connesso alla sessione.');
    if (!this.record.participants.some(participant => participant.participantId === participantId)) return fail('AUTH_FAILED', 'Partecipante non valido.');
    if (this.record.activeBoardId !== boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    const board = this.board(boardId);
    return board ? ok(board) : fail('SESSION_NOT_FOUND', 'Board live non trovata.');
  }

  authorizePlayerTokenPreview(participantId: string, move: TokenMovePayload): SessionResult<TokenMovePayload> {
    const authorized = this.authorizePlayerBoardMutation(participantId, move.boardId); if (!authorized.ok) return authorized;
    const board = authorized.value;
    if (!this.visibleToken(board, move.tokenId) || board.tokenControllers[move.tokenId] !== participantId) return fail('TOKEN_NOT_CONTROLLABLE', 'Questo token non è controllabile dal partecipante.');
    return ok({ ...move });
  }

  commitPlayerTokenMove(participantId: string, move: TokenMovePayload): SessionResult<TokenPositionEvent> {
    const authorized = this.authorizePlayerBoardMutation(participantId, move.boardId); if (!authorized.ok) return authorized;
    const board = authorized.value;
    const token = this.visibleToken(board, move.tokenId);
    if (!token || board.tokenControllers[move.tokenId] !== participantId) return fail('TOKEN_NOT_CONTROLLABLE', 'Questo token non è controllabile dal partecipante.');
    if (token.x !== move.x || token.y !== move.y) {
      token.x = move.x; token.y = move.y; board.tokenPositions[move.tokenId] = { x: move.x, y: move.y }; this.bump();
    }
    return ok({ ...move, stateSeq: this.record.stateSeq });
  }

  async moveTokenAsHost(hostCredential: string, move: TokenMovePayload): Promise<SessionResult<TokenPositionEvent>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId !== move.boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    const board = this.board(move.boardId); if (!board) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    const token = this.visibleToken(board, move.tokenId);
    if (!token) return fail('TOKEN_NOT_CONTROLLABLE', 'Il token non è pubblicato nella scena attiva.');
    if (token.x !== move.x || token.y !== move.y) {
      token.x = move.x; token.y = move.y; board.tokenPositions[move.tokenId] = { x: move.x, y: move.y }; this.bump();
    }
    return ok({ ...move, stateSeq: this.record.stateSeq });
  }

  authorizePing(participantId: string, boardId: string): SessionResult<true> {
    const authorized = this.authorizePlayerBoardMutation(participantId, boardId);
    return authorized.ok ? ok(true) : authorized;
  }

  async authorizeCameraFocus(hostCredential: string, boardId: string): Promise<SessionResult<true>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId !== boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    return this.board(boardId) ? ok(true) : fail('SESSION_NOT_FOUND', 'Board live non trovata.');
  }

  async publishBoard(hostCredential: string, payload: LiveBoardPayload): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    const existing = this.board(payload.boardId);
    if (!existing) {
      this.record.boards.push(storedBoard(payload));
      this.record.activeBoardId = payload.boardId;
      this.bump();
    } else if (this.record.activeBoardId !== payload.boardId) {
      this.record.activeBoardId = payload.boardId;
      this.bump();
    }
    return ok(this.boardSnapshot(payload.boardId)!);
  }

  async resetBoard(hostCredential: string, payload: LiveBoardPayload): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    const index = this.record.boards.findIndex(board => board.boardId === payload.boardId);
    if (index >= 0) this.record.boards[index] = storedBoard(payload);
    else this.record.boards.push(storedBoard(payload));
    this.record.activeBoardId = payload.boardId;
    this.bump();
    return ok(this.boardSnapshot(payload.boardId)!);
  }

  async switchBoard(hostCredential: string, boardId: string): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (!this.board(boardId)) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    if (this.record.activeBoardId !== boardId) {
      this.record.activeBoardId = boardId;
      this.bump();
    }
    return ok(this.boardSnapshot(boardId)!);
  }

  async unpublish(hostCredential: string): Promise<SessionResult<WaitingSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId) {
      this.record.activeBoardId = undefined;
      this.bump();
    }
    return ok(this.playerSnapshot() as WaitingSnapshot);
  }

  async revealElement(hostCredential: string, boardId: string, element: LiveBoardElement): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId !== boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    const board = this.board(boardId); if (!board) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    if (element.type === 'link') {
      const ids = new Set(board.elements.filter(item => item.type !== 'link').map(item => item.elementId));
      for (const endpoint of [element.from, element.to]) if (endpoint.kind === 'element' && !ids.has(endpoint.elementId)) return fail('PERMISSION_DENIED', 'Il collegamento richiede un endpoint non visibile.');
    }
    const restored = element.type === 'token' && board.tokenPositions[element.elementId]
      ? { ...structuredClone(element), ...board.tokenPositions[element.elementId] }
      : structuredClone(element);
    if (restored.type === 'token' && !board.tokenPositions[restored.elementId]) board.tokenPositions[restored.elementId] = { x: restored.x, y: restored.y };
    const index = board.elements.findIndex(item => item.elementId === restored.elementId);
    if (index >= 0) board.elements[index] = restored;
    else board.elements.push(restored);
    this.bump();
    return ok(this.boardSnapshot(boardId)!);
  }

  async hideElement(hostCredential: string, boardId: string, elementId: string): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    if (this.record.activeBoardId !== boardId) return fail('BOARD_NOT_ACTIVE', 'La board non è la scena attiva.');
    const board = this.board(boardId); if (!board) return fail('SESSION_NOT_FOUND', 'Board live non trovata.');
    const before = board.elements.length;
    board.elements = board.elements.filter(item => {
      if (item.elementId === elementId) return false;
      if (item.type !== 'link') return true;
      return ![item.from, item.to].some(endpoint => endpoint.kind === 'element' && endpoint.elementId === elementId);
    });
    if (board.elements.length !== before) this.bump();
    return ok(this.boardSnapshot(boardId)!);
  }
}

export interface ActivityPairingRecord {
  liveSessionId: string;
  expiresAt: number;
}

export interface ActivityBindingRecord {
  liveSessionId: string;
  pairedAt: number;
}

export class SessionDirectoryModel {
  constructor(
    public codes: Record<string, string> = {},
    public pairings: Record<string, ActivityPairingRecord> = {},
    public activityBindings: Record<string, ActivityBindingRecord> = {}
  ) {}

  private cleanupPairings(now: number): void {
    for (const [code, pairing] of Object.entries(this.pairings)) if (pairing.expiresAt <= now) delete this.pairings[code];
  }

  resolve(joinCode: string): string | undefined {
    return this.codes[joinCode];
  }

  reserve(joinCode: string, liveSessionId: string): boolean {
    if (this.codes[joinCode]) return false;
    this.codes[joinCode] = liveSessionId;
    return true;
  }

  rotate(previousCode: string, nextCode: string, liveSessionId: string): boolean {
    if (nextCode !== previousCode && this.codes[nextCode]) return false;
    if (this.codes[previousCode] === liveSessionId) delete this.codes[previousCode];
    this.codes[nextCode] = liveSessionId;
    return true;
  }

  reserveActivityPairing(pairingCode: string, liveSessionId: string, now = Date.now()): ActivityPairingRecord | undefined {
    this.cleanupPairings(now);
    if (this.pairings[pairingCode]) return undefined;
    for (const [code, pairing] of Object.entries(this.pairings)) if (pairing.liveSessionId === liveSessionId) delete this.pairings[code];
    const pairing = { liveSessionId, expiresAt: now + ACTIVITY_PAIRING_TTL_MS };
    this.pairings[pairingCode] = pairing;
    return { ...pairing };
  }

  consumeActivityPairing(pairingCode: string, instanceId: string, now = Date.now()): ActivityBindingRecord | undefined {
    this.cleanupPairings(now);
    const pairing = this.pairings[pairingCode];
    if (!pairing || this.activityBindings[instanceId]) return undefined;
    delete this.pairings[pairingCode];
    for (const [boundInstanceId, binding] of Object.entries(this.activityBindings)) {
      if (binding.liveSessionId === pairing.liveSessionId) delete this.activityBindings[boundInstanceId];
    }
    const binding = { liveSessionId: pairing.liveSessionId, pairedAt: now };
    this.activityBindings[instanceId] = binding;
    return { ...binding };
  }

  activityBinding(instanceId: string): ActivityBindingRecord | undefined {
    const binding = this.activityBindings[instanceId];
    return binding ? { ...binding } : undefined;
  }

  activityBindingForSession(liveSessionId: string): { instanceId: string; pairedAt: number } | undefined {
    const match = Object.entries(this.activityBindings).find(([, binding]) => binding.liveSessionId === liveSessionId);
    return match ? { instanceId: match[0], pairedAt: match[1].pairedAt } : undefined;
  }

  removeSession(joinCode: string, liveSessionId: string): void {
    if (this.codes[joinCode] === liveSessionId) delete this.codes[joinCode];
    for (const [code, pairing] of Object.entries(this.pairings)) if (pairing.liveSessionId === liveSessionId) delete this.pairings[code];
    for (const [instanceId, binding] of Object.entries(this.activityBindings)) if (binding.liveSessionId === liveSessionId) delete this.activityBindings[instanceId];
  }

  remove(joinCode: string, liveSessionId: string): void {
    this.removeSession(joinCode, liveSessionId);
  }
}

export function createResponse(model: LiveSessionModel, hostCredential: string, ticket: string, playerUrl: string): CreateSessionResponse {
  return {
    liveSessionId: model.record.liveSessionId,
    joinCode: model.record.joinCode,
    hostCredential,
    ticket,
    playerUrl
  };
}
