import { CampaignError, validateRelativePath } from '../../../packages/core/src/index';

export type BoardSaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface BoardCamera {
  x: number;
  y: number;
  zoom: number;
}

interface BoardElementBase {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  locked: boolean;
  groupId?: string;
}

export interface BoardTextElement extends BoardElementBase {
  type: 'text';
  text: string;
}

export interface BoardImageElement extends BoardElementBase {
  type: 'image';
  assetPath: string;
}

export interface BoardTokenElement extends BoardElementBase {
  type: 'token';
  name: string;
  avatarPath?: string;
  visibleByDefault: boolean;
}

export type BoardElement = BoardTextElement | BoardImageElement | BoardTokenElement;

export type BoardConnectionEndpoint =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'element'; elementId: string };

export interface BoardConnector {
  connectorId: string;
  style: 'line' | 'arrow';
  from: BoardConnectionEndpoint;
  to: BoardConnectionEndpoint;
  locked: boolean;
}

export interface BoardDocument {
  schemaVersion: 2;
  boardId: string;
  camera: BoardCamera;
  elements: BoardElement[];
  connectors: BoardConnector[];
}

export interface BoardSnapshot {
  path: string;
  title: string;
  revision: string;
  document: BoardDocument;
}

export interface BoardListItem {
  path: string;
  title: string;
  boardId: string;
}

export interface BoardRecoveryDraft {
  campaignId: string;
  boardPath: string;
  baseRevision: string;
  document: BoardDocument;
  capturedAt: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function boardTitleFromPath(boardPath: string): string {
  validateBoardPath(boardPath);
  return boardPath.slice('Boards/'.length, -'.board.json'.length);
}

export function validateBoardPath(boardPath: string): string {
  validateRelativePath(boardPath);
  if (!/^Boards\/[^/]+\.board\.json$/iu.test(boardPath)) throw new CampaignError('invalid_path', 'La board deve essere salvata in Boards/*.board.json.');
  return boardPath;
}

export function boardPathFromTitle(title: string): string {
  const trimmed = title.trim().replace(/\.board\.json$/iu, '');
  validateRelativePath(trimmed);
  if (trimmed.includes('/')) throw new CampaignError('invalid_path', 'Il nome della board non può contenere cartelle.');
  return `Boards/${trimmed}.board.json`;
}

export function validateBoardAssetPath(assetPath: string): string {
  validateRelativePath(assetPath);
  if (!/^Assets\/Board\/[^/]+\.(png|jpe?g|webp)$/iu.test(assetPath)) throw new CampaignError('invalid_path', 'Asset board non valido.');
  return assetPath;
}

function parseEndpoint(value: unknown): BoardConnectionEndpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignError('metadata_invalid', 'Estremità collegamento non valida.');
  const endpoint = value as Record<string, unknown>;
  if (endpoint.kind === 'point') {
    if (!finite(endpoint.x) || !finite(endpoint.y)) throw new CampaignError('metadata_invalid', 'Punto collegamento non valido.');
    return { kind: 'point', x: endpoint.x, y: endpoint.y };
  }
  if (endpoint.kind === 'element') {
    if (typeof endpoint.elementId !== 'string' || !uuid.test(endpoint.elementId)) throw new CampaignError('metadata_invalid', 'Ancora collegamento non valida.');
    return { kind: 'element', elementId: endpoint.elementId };
  }
  throw new CampaignError('metadata_invalid', 'Tipo estremità collegamento non supportato.');
}

export function parseBoardDocument(value: unknown): BoardDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignError('metadata_invalid', 'Documento board non valido.');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) throw new CampaignError('unsupported_schema', 'Versione board non supportata.');
  if (typeof record.boardId !== 'string' || !uuid.test(record.boardId)) throw new CampaignError('metadata_invalid', 'Identità board non valida.');
  if (!record.camera || typeof record.camera !== 'object' || Array.isArray(record.camera)) throw new CampaignError('metadata_invalid', 'Camera board non valida.');
  const camera = record.camera as Record<string, unknown>;
  if (!finite(camera.x) || !finite(camera.y) || !finite(camera.zoom)) throw new CampaignError('metadata_invalid', 'Camera board non valida.');
  if (!Array.isArray(record.elements)) throw new CampaignError('metadata_invalid', 'Elementi board non validi.');

  const seen = new Set<string>();
  const elements = record.elements.map((raw, index): BoardElement => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CampaignError('metadata_invalid', `Elemento board ${index + 1} non valido.`);
    const element = raw as Record<string, unknown>;
    if (typeof element.elementId !== 'string' || !uuid.test(element.elementId) || seen.has(element.elementId)) throw new CampaignError('metadata_invalid', 'Identità elemento board non valida.');
    seen.add(element.elementId);
    for (const key of ['x', 'y', 'width', 'height', 'z'] as const) if (!finite(element[key])) throw new CampaignError('metadata_invalid', 'Geometria elemento board non valida.');
    if ((element.width as number) <= 0 || (element.height as number) <= 0 || typeof element.locked !== 'boolean') throw new CampaignError('metadata_invalid', 'Dimensione o lock elemento board non validi.');
    if (element.groupId !== undefined && (typeof element.groupId !== 'string' || !uuid.test(element.groupId))) throw new CampaignError('metadata_invalid', 'Gruppo board non valido.');
    const base = {
      elementId: element.elementId,
      x: element.x as number,
      y: element.y as number,
      width: element.width as number,
      height: element.height as number,
      z: element.z as number,
      locked: element.locked,
      ...(element.groupId === undefined ? {} : { groupId: element.groupId as string })
    };
    if (element.type === 'text') {
      if (typeof element.text !== 'string') throw new CampaignError('metadata_invalid', 'Testo board non valido.');
      return { ...base, type: 'text', text: element.text };
    }
    if (element.type === 'image') {
      if (typeof element.assetPath !== 'string') throw new CampaignError('metadata_invalid', 'Immagine board non valida.');
      return { ...base, type: 'image', assetPath: validateBoardAssetPath(element.assetPath) };
    }
    if (element.type === 'token' && record.schemaVersion === 2) {
      if (typeof element.name !== 'string' || typeof element.visibleByDefault !== 'boolean') throw new CampaignError('metadata_invalid', 'Token board non valido.');
      if (element.avatarPath !== undefined && typeof element.avatarPath !== 'string') throw new CampaignError('metadata_invalid', 'Avatar token non valido.');
      return {
        ...base,
        type: 'token',
        name: element.name,
        visibleByDefault: element.visibleByDefault,
        ...(element.avatarPath === undefined ? {} : { avatarPath: validateBoardAssetPath(element.avatarPath) })
      };
    }
    throw new CampaignError('metadata_invalid', 'Tipo elemento board non supportato.');
  });

  const connectors: BoardConnector[] = [];
  if (record.schemaVersion === 2) {
    if (!Array.isArray(record.connectors)) throw new CampaignError('metadata_invalid', 'Collegamenti board non validi.');
    const connectorIds = new Set<string>();
    for (const raw of record.connectors) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CampaignError('metadata_invalid', 'Collegamento board non valido.');
      const connector = raw as Record<string, unknown>;
      if (typeof connector.connectorId !== 'string' || !uuid.test(connector.connectorId) || connectorIds.has(connector.connectorId)) throw new CampaignError('metadata_invalid', 'Identità collegamento board non valida.');
      connectorIds.add(connector.connectorId);
      if (connector.style !== 'line' && connector.style !== 'arrow') throw new CampaignError('metadata_invalid', 'Stile collegamento board non valido.');
      if (typeof connector.locked !== 'boolean') throw new CampaignError('metadata_invalid', 'Lock collegamento board non valido.');
      connectors.push({
        connectorId: connector.connectorId,
        style: connector.style,
        from: parseEndpoint(connector.from),
        to: parseEndpoint(connector.to),
        locked: connector.locked
      });
    }
  }

  return {
    schemaVersion: 2,
    boardId: record.boardId,
    camera: { x: camera.x as number, y: camera.y as number, zoom: bounded(camera.zoom as number, 0.2, 4) },
    elements,
    connectors
  };
}
