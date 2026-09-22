export const PROTOCOL_VERSION = 1 as const;

export const liveErrorCodes = [
  'AUTH_FAILED',
  'SESSION_NOT_FOUND',
  'SESSION_ENDED',
  'HOST_OFFLINE',
  'JOIN_LOCKED',
  'CODE_INVALID',
  'PERMISSION_DENIED',
  'TOKEN_NOT_CONTROLLABLE',
  'BOARD_NOT_ACTIVE',
  'ASSET_UNAVAILABLE',
  'PAYLOAD_INVALID',
  'RATE_LIMITED',
  'STALE_STATE',
  'PROTOCOL_VERSION_UNSUPPORTED',
  'INTERNAL_ERROR'
] as const;

export type LiveErrorCode = typeof liveErrorCodes[number];
export type SessionLifecycle = 'open' | 'host_reconnecting' | 'ending' | 'ended';
export type PlayerPresentation = 'waiting' | 'board';
export type LiveRole = 'host' | 'player';

export interface LiveParticipant {
  participantId: string;
  displayName: string;
  connected: boolean;
  tokenIds: string[];
}

export interface LiveBoardPointEndpoint { kind: 'point'; x: number; y: number }
export interface LiveBoardElementEndpoint { kind: 'element'; elementId: string }
export type LiveBoardEndpoint = LiveBoardPointEndpoint | LiveBoardElementEndpoint;

interface LiveBoardBoxBase {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export type LiveBoardElement =
  | (LiveBoardBoxBase & { type: 'text'; text: string })
  | (LiveBoardBoxBase & { type: 'image'; publishedAssetId: string })
  | (LiveBoardBoxBase & { type: 'token'; name: string; publishedAssetId?: string })
  | (LiveBoardBoxBase & { type: 'card'; cardKind: 'note' | 'excerpt'; sourceTitle: string; excerpt?: string })
  | { elementId: string; type: 'link'; z: number; from: LiveBoardEndpoint; to: LiveBoardEndpoint; arrow: 'none' | 'end' };

export interface LiveBoardPayload {
  boardId: string;
  title: string;
  elements: LiveBoardElement[];
}

export interface LiveBoardSnapshot extends LiveBoardPayload {
  stateSeq: number;
}

export interface ElementRevealedEvent {
  boardId: string;
  element: LiveBoardElement;
  stateSeq: number;
}

export interface ElementHiddenEvent {
  boardId: string;
  elementIds: string[];
  stateSeq: number;
}

export interface LiveBoardSummary {
  boardId: string;
  title: string;
}

export interface WaitingSnapshot {
  lifecycle: SessionLifecycle;
  presentation: 'waiting';
  stateSeq: number;
  acceptingJoins: boolean;
  participants?: LiveParticipant[];
}

export interface PlayerBoardState {
  lifecycle: SessionLifecycle;
  presentation: 'board';
  stateSeq: number;
  board: LiveBoardSnapshot;
}

export interface ConnectionReadyPayload {
  role: LiveRole;
  lifecycle: SessionLifecycle;
  stateSeq: number;
  presentation: PlayerPresentation;
  participantId?: string;
}

export interface ProtocolEnvelope<T = unknown> {
  protocolVersion: 1;
  type: string;
  payload: T;
}

export interface LiveApiError {
  error: { code: LiveErrorCode; message: string };
}

export interface CreateSessionResponse {
  liveSessionId: string;
  joinCode: string;
  hostCredential: string;
  ticket: string;
  playerUrl: string;
}

export interface JoinSessionRequest {
  joinCode: string;
  displayName: string;
}

export interface JoinSessionResponse {
  liveSessionId: string;
  participantId: string;
  resumeCredential: string;
  ticket: string;
}

export interface ResumeSessionRequest {
  liveSessionId: string;
  participantId: string;
  resumeCredential: string;
}

export interface TicketResponse { ticket: string }

export interface JoinPolicyRequest { acceptingJoins: boolean }

export interface JoinCodeResponse { joinCode: string }

export interface PublishBoardRequest { board: LiveBoardPayload }
export interface RevealElementRequest { boardId: string; element: LiveBoardElement }
export interface HideElementRequest { boardId: string; elementId: string }
export interface BoardIdRequest { boardId: string }

export interface SessionSummary {
  liveSessionId: string;
  joinCode: string;
  lifecycle: SessionLifecycle;
  acceptingJoins: boolean;
  participants: LiveParticipant[];
  stateSeq: number;
  presentation: PlayerPresentation;
  activeBoardId?: string;
  activeElementIds?: string[];
  liveBoards: LiveBoardSummary[];
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
const opaqueId = (value: unknown): value is string => cleanString(value, 128) && /^[A-Za-z0-9_-]+$/u.test(value);
const displayName = (value: unknown): value is string => cleanString(value, 80) && [...value].every(character => { const code = character.charCodeAt(0); return code > 31 && code !== 127; });
const joinCode = (value: unknown): value is string => cleanString(value, 32) && /^[A-Z2-9]{4}(?:-[A-Z2-9]{4})?$/u.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000;
const positive = (value: unknown): value is number => finite(value) && value > 0 && value <= 1_000_000;

function validateEndpoint(value: unknown): LiveBoardEndpoint | undefined {
  if (!object(value)) return undefined;
  if (value.kind === 'point' && finite(value.x) && finite(value.y)) return { kind: 'point', x: value.x, y: value.y };
  if (value.kind === 'element' && opaqueId(value.elementId)) return { kind: 'element', elementId: value.elementId };
  return undefined;
}

export function validateLiveBoardElement(value: unknown): LiveBoardElement | undefined {
  if (!object(value) || !opaqueId(value.elementId) || !finite(value.z) || typeof value.type !== 'string') return undefined;

  if (value.type === 'link') {
    const from = validateEndpoint(value.from); const to = validateEndpoint(value.to);
    if (!from || !to || (value.arrow !== 'none' && value.arrow !== 'end')) return undefined;
    return { elementId: value.elementId, type: 'link', z: value.z, from, to, arrow: value.arrow };
  }

  if (!finite(value.x) || !finite(value.y) || !positive(value.width) || !positive(value.height)) return undefined;
  const base = { elementId: value.elementId, x: value.x, y: value.y, width: value.width, height: value.height, z: value.z };

  if (value.type === 'text') {
    if (typeof value.text !== 'string' || value.text.length > 100_000) return undefined;
    return { ...base, type: 'text', text: value.text };
  }
  if (value.type === 'image') {
    if (!opaqueId(value.publishedAssetId)) return undefined;
    return { ...base, type: 'image', publishedAssetId: value.publishedAssetId };
  }
  if (value.type === 'token') {
    if (!cleanString(value.name, 250) || (value.publishedAssetId !== undefined && !opaqueId(value.publishedAssetId))) return undefined;
    return { ...base, type: 'token', name: value.name, ...(value.publishedAssetId ? { publishedAssetId: value.publishedAssetId } : {}) };
  }
  if (value.type === 'card') {
    if ((value.cardKind !== 'note' && value.cardKind !== 'excerpt') || !cleanString(value.sourceTitle, 500)) return undefined;
    if (value.cardKind === 'note') {
      if (value.excerpt !== undefined) return undefined;
      return { ...base, type: 'card', cardKind: 'note', sourceTitle: value.sourceTitle };
    }
    if (typeof value.excerpt !== 'string' || !value.excerpt.trim() || value.excerpt.length > 100_000) return undefined;
    return { ...base, type: 'card', cardKind: 'excerpt', sourceTitle: value.sourceTitle, excerpt: value.excerpt };
  }
  return undefined;
}

export function validateLiveBoardPayload(value: unknown): LiveBoardPayload | undefined {
  if (!object(value) || !opaqueId(value.boardId) || !cleanString(value.title, 500) || !Array.isArray(value.elements) || value.elements.length > 5000) return undefined;
  const elements: LiveBoardElement[] = [];
  const ids = new Set<string>();
  for (const raw of value.elements) {
    const element = validateLiveBoardElement(raw);
    if (!element || ids.has(element.elementId)) return undefined;
    ids.add(element.elementId); elements.push(element);
  }
  for (const element of elements) {
    if (element.type !== 'link') continue;
    for (const endpoint of [element.from, element.to]) if (endpoint.kind === 'element' && !ids.has(endpoint.elementId)) return undefined;
  }
  return { boardId: value.boardId, title: value.title, elements };
}

export function validateLiveBoardSnapshot(value: unknown): LiveBoardSnapshot | undefined {
  if (!object(value) || !Number.isSafeInteger(value.stateSeq) || (value.stateSeq as number) < 0) return undefined;
  const board = validateLiveBoardPayload(value);
  return board ? { ...board, stateSeq: value.stateSeq as number } : undefined;
}

export function validateElementRevealedEvent(value: unknown): ElementRevealedEvent | undefined {
  if (!object(value) || !opaqueId(value.boardId) || !Number.isSafeInteger(value.stateSeq) || (value.stateSeq as number) < 0) return undefined;
  const element = validateLiveBoardElement(value.element);
  return element ? { boardId: value.boardId, element, stateSeq: value.stateSeq as number } : undefined;
}

export function validateElementHiddenEvent(value: unknown): ElementHiddenEvent | undefined {
  if (!object(value) || !opaqueId(value.boardId) || !Number.isSafeInteger(value.stateSeq) || (value.stateSeq as number) < 0 || !Array.isArray(value.elementIds) || value.elementIds.length > 5000) return undefined;
  const elementIds: string[] = [];
  for (const raw of value.elementIds) {
    if (!opaqueId(raw) || elementIds.includes(raw)) return undefined;
    elementIds.push(raw);
  }
  return { boardId: value.boardId, elementIds, stateSeq: value.stateSeq as number };
}

export function validateJoinRequest(value: unknown): JoinSessionRequest | undefined {
  if (!object(value) || !joinCode(value.joinCode) || !displayName(value.displayName)) return undefined;
  return { joinCode: value.joinCode, displayName: value.displayName };
}

export function validateResumeRequest(value: unknown): ResumeSessionRequest | undefined {
  if (!object(value) || !opaqueId(value.liveSessionId) || !opaqueId(value.participantId) || !opaqueId(value.resumeCredential)) return undefined;
  return { liveSessionId: value.liveSessionId, participantId: value.participantId, resumeCredential: value.resumeCredential };
}

export function validateJoinPolicy(value: unknown): JoinPolicyRequest | undefined {
  if (!object(value) || typeof value.acceptingJoins !== 'boolean') return undefined;
  return { acceptingJoins: value.acceptingJoins };
}

export function validatePublishBoardRequest(value: unknown): PublishBoardRequest | undefined {
  if (!object(value)) return undefined;
  const board = validateLiveBoardPayload(value.board);
  return board ? { board } : undefined;
}

export function validateRevealElementRequest(value: unknown): RevealElementRequest | undefined {
  if (!object(value) || !opaqueId(value.boardId)) return undefined;
  const element = validateLiveBoardElement(value.element);
  return element ? { boardId: value.boardId, element } : undefined;
}

export function validateHideElementRequest(value: unknown): HideElementRequest | undefined {
  if (!object(value) || !opaqueId(value.boardId) || !opaqueId(value.elementId)) return undefined;
  return { boardId: value.boardId, elementId: value.elementId };
}

export function validateBoardIdRequest(value: unknown): BoardIdRequest | undefined {
  if (!object(value) || !opaqueId(value.boardId)) return undefined;
  return { boardId: value.boardId };
}

export function validateEnvelope(value: unknown): ProtocolEnvelope | undefined {
  if (!object(value) || value.protocolVersion !== PROTOCOL_VERSION || typeof value.type !== 'string' || !value.type || !('payload' in value)) return undefined;
  return { protocolVersion: PROTOCOL_VERSION, type: value.type, payload: value.payload };
}

export function envelope<T>(type: string, payload: T): ProtocolEnvelope<T> {
  return { protocolVersion: PROTOCOL_VERSION, type, payload };
}

export function safeError(code: LiveErrorCode, message: string): LiveApiError {
  return { error: { code, message } };
}

export function isLiveErrorCode(value: unknown): value is LiveErrorCode {
  return typeof value === 'string' && (liveErrorCodes as readonly string[]).includes(value);
}
