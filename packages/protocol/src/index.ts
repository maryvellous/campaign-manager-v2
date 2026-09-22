export const PROTOCOL_VERSION = 1 as const;

export const liveErrorCodes = [
  'AUTH_FAILED',
  'SESSION_NOT_FOUND',
  'SESSION_ENDED',
  'HOST_OFFLINE',
  'JOIN_LOCKED',
  'CODE_INVALID',
  'PERMISSION_DENIED',
  'PAYLOAD_INVALID',
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

export interface WaitingSnapshot {
  lifecycle: SessionLifecycle;
  presentation: 'waiting';
  stateSeq: number;
  acceptingJoins: boolean;
  participants?: LiveParticipant[];
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

export interface SessionSummary {
  liveSessionId: string;
  joinCode: string;
  lifecycle: SessionLifecycle;
  acceptingJoins: boolean;
  participants: LiveParticipant[];
  stateSeq: number;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
const opaqueId = (value: unknown): value is string => cleanString(value, 128) && /^[A-Za-z0-9_-]+$/u.test(value);
const displayName = (value: unknown): value is string => cleanString(value, 80) && [...value].every(character => { const code = character.charCodeAt(0); return code > 31 && code !== 127; });
const joinCode = (value: unknown): value is string => cleanString(value, 32) && /^[A-Z2-9]{4}(?:-[A-Z2-9]{4})?$/u.test(value);

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
