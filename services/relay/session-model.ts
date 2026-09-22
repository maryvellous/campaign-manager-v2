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
  type PlayerBoardState,
  type SessionLifecycle,
  type SessionSummary,
  type TicketResponse,
  type WaitingSnapshot
} from '../../packages/protocol/src/index';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const encoder = new TextEncoder();

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
}

export interface LiveSessionRecord {
  liveSessionId: string;
  joinCode: string;
  lifecycle: SessionLifecycle;
  acceptingJoins: boolean;
  hostCredentialHash: string;
  hostConnected: boolean;
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
      boards: Array.isArray(record.boards) ? structuredClone(record.boards) : [],
      ...(record.activeBoardId ? { activeBoardId: record.activeBoardId } : {})
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
      participants: this.record.participants.map(participant => ({ participantId: participant.participantId, displayName: participant.displayName, connected: participant.connected, tokenIds: [...participant.tokenIds] })),
      stateSeq: this.record.stateSeq,
      presentation: this.record.activeBoardId ? 'board' : 'waiting',
      ...(this.record.activeBoardId ? { activeBoardId: this.record.activeBoardId } : {}),
      ...(this.record.activeBoardId ? { activeElementIds: this.board(this.record.activeBoardId)?.elements.map(element => element.elementId) ?? [] } : {}),
      liveBoards: this.record.boards.map(board => ({ boardId: board.boardId, title: board.title }))
    };
  }

  async authenticateHost(hostCredential: string): Promise<boolean> {
    return await secretHash(hostCredential) === this.record.hostCredentialHash;
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

  boardSnapshot(boardId = this.record.activeBoardId): LiveBoardSnapshot | undefined {
    if (!boardId) return undefined;
    const board = this.board(boardId);
    return board ? { boardId: board.boardId, title: board.title, elements: structuredClone(board.elements), stateSeq: this.record.stateSeq } : undefined;
  }

  playerSnapshot(): WaitingSnapshot | PlayerBoardState {
    const board = this.boardSnapshot();
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

  async hostTicket(hostCredential: string, now = Date.now()): Promise<SessionResult<TicketResponse>> {
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

  connect(identity: TicketIdentity): SessionResult<SessionSummary> {
    if (this.record.lifecycle === 'ended') return fail('SESSION_ENDED', 'La sessione è terminata.');
    if (identity.role === 'host') {
      this.record.hostConnected = true;
      if (this.record.lifecycle === 'host_reconnecting') this.record.lifecycle = 'open';
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

  disconnect(identity: TicketIdentity): void {
    if (identity.role === 'host') {
      this.record.hostConnected = false;
      if (this.record.lifecycle === 'open') this.record.lifecycle = 'host_reconnecting';
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
    this.bump();
    return ok(this.summary());
  }

  async publishBoard(hostCredential: string, payload: LiveBoardPayload): Promise<SessionResult<LiveBoardSnapshot>> {
    const authorized = await this.authorizeHostMutation(hostCredential); if (!authorized.ok) return authorized;
    const existing = this.board(payload.boardId);
    if (!existing) {
      this.record.boards.push(structuredClone(payload));
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
    if (index >= 0) this.record.boards[index] = structuredClone(payload);
    else this.record.boards.push(structuredClone(payload));
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
    const index = board.elements.findIndex(item => item.elementId === element.elementId);
    if (index >= 0) board.elements[index] = structuredClone(element);
    else board.elements.push(structuredClone(element));
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

export class SessionDirectoryModel {
  constructor(public codes: Record<string, string> = {}) {}

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

  remove(joinCode: string, liveSessionId: string): void {
    if (this.codes[joinCode] === liveSessionId) delete this.codes[joinCode];
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
