import { CampaignError, validateNoteId, validateRelativePath } from '../../../packages/core/src/index';

export type BoardSaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface BoardCamera {
  x: number;
  y: number;
  zoom: number;
}

interface BoardElementBase {
  elementId: string;
  z: number;
  locked: boolean;
  groupId?: string;
  visibleByDefault?: boolean;
}

interface BoardBoxElementBase extends BoardElementBase {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardTextElement extends BoardBoxElementBase {
  type: 'text';
  text: string;
}

export interface BoardImageElement extends BoardBoxElementBase {
  type: 'image';
  assetPath: string;
}

export interface BoardTokenElement extends BoardBoxElementBase {
  type: 'token';
  name: string;
  assetPath?: string;
  characterNoteId?: string;
}

export interface BoardCardElement extends BoardBoxElementBase {
  type: 'card';
  cardKind: 'note' | 'excerpt';
  sourceNoteId: string;
  sourceTitle: string;
  excerpt?: string;
}

export type BoardLinkEndpoint =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'element'; elementId: string };

export interface BoardLinkElement extends BoardElementBase {
  type: 'link';
  from: BoardLinkEndpoint;
  to: BoardLinkEndpoint;
  arrow: 'none' | 'end';
}

export type BoardBoxElement = BoardTextElement | BoardImageElement | BoardTokenElement | BoardCardElement;
export type BoardElement = BoardBoxElement | BoardLinkElement;

export interface BoardDocument {
  schemaVersion: 1;
  boardId: string;
  camera: BoardCamera;
  elements: BoardElement[];
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

export function isBoardBoxElement(element: BoardElement): element is BoardBoxElement {
  return element.type !== 'link';
}

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

function parseGroupId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !uuid.test(value)) throw new CampaignError('metadata_invalid', 'Gruppo board non valido.');
  return value;
}

function parseEndpoint(value: unknown): BoardLinkEndpoint {
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
  if (record.schemaVersion !== 1) throw new CampaignError('unsupported_schema', 'Versione board non supportata.');
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
    if (!finite(element.z) || typeof element.locked !== 'boolean') throw new CampaignError('metadata_invalid', 'Ordine o lock elemento board non validi.');
    const groupId = parseGroupId(element.groupId);
    if (element.visibleByDefault !== undefined && typeof element.visibleByDefault !== 'boolean') throw new CampaignError('metadata_invalid', 'Visibilità board non valida.');
    const base = {
      elementId: element.elementId,
      z: element.z,
      locked: element.locked,
      ...(groupId ? { groupId } : {}),
      ...(element.visibleByDefault === undefined ? {} : { visibleByDefault: element.visibleByDefault })
    };

    if (element.type === 'link') {
      if (element.arrow !== 'none' && element.arrow !== 'end') throw new CampaignError('metadata_invalid', 'Freccia collegamento non valida.');
      return { ...base, type: 'link', from: parseEndpoint(element.from), to: parseEndpoint(element.to), arrow: element.arrow };
    }

    for (const key of ['x', 'y', 'width', 'height'] as const) if (!finite(element[key])) throw new CampaignError('metadata_invalid', 'Geometria elemento board non valida.');
    if ((element.width as number) <= 0 || (element.height as number) <= 0) throw new CampaignError('metadata_invalid', 'Dimensione elemento board non valida.');
    const box = {
      ...base,
      x: element.x as number,
      y: element.y as number,
      width: element.width as number,
      height: element.height as number
    };

    if (element.type === 'text') {
      if (typeof element.text !== 'string') throw new CampaignError('metadata_invalid', 'Testo board non valido.');
      return { ...box, type: 'text', text: element.text };
    }
    if (element.type === 'image') {
      if (typeof element.assetPath !== 'string') throw new CampaignError('metadata_invalid', 'Immagine board non valida.');
      return { ...box, type: 'image', assetPath: validateBoardAssetPath(element.assetPath) };
    }
    if (element.type === 'token') {
      if (typeof element.name !== 'string' || !element.name.trim()) throw new CampaignError('metadata_invalid', 'Nome token non valido.');
      if (element.assetPath !== undefined && typeof element.assetPath !== 'string') throw new CampaignError('metadata_invalid', 'Avatar token non valido.');
      const assetPath = element.assetPath === undefined ? undefined : validateBoardAssetPath(element.assetPath);
      const characterNoteId = element.characterNoteId === undefined ? undefined : validateNoteId(element.characterNoteId as string);
      return {
        ...box,
        type: 'token',
        name: element.name.trim(),
        ...(assetPath ? { assetPath } : {}),
        ...(characterNoteId ? { characterNoteId } : {})
      };
    }
    if (element.type === 'card') {
      if (element.cardKind !== 'note' && element.cardKind !== 'excerpt') throw new CampaignError('metadata_invalid', 'Tipo card board non valido.');
      if (typeof element.sourceNoteId !== 'string') throw new CampaignError('metadata_invalid', 'Sorgente card non valida.');
      const sourceNoteId = validateNoteId(element.sourceNoteId);
      if (typeof element.sourceTitle !== 'string' || !element.sourceTitle.trim()) throw new CampaignError('metadata_invalid', 'Titolo card non valido.');
      if (element.cardKind === 'note') {
        if (element.excerpt !== undefined) throw new CampaignError('metadata_invalid', 'Una card nota non deve incorporare il Markdown della sorgente.');
        return { ...box, type: 'card', cardKind: 'note', sourceNoteId, sourceTitle: element.sourceTitle.trim() };
      }
      if (typeof element.excerpt !== 'string' || !element.excerpt.trim()) throw new CampaignError('metadata_invalid', 'Estratto card non valido.');
      return { ...box, type: 'card', cardKind: 'excerpt', sourceNoteId, sourceTitle: element.sourceTitle.trim(), excerpt: element.excerpt };
    }
    throw new CampaignError('metadata_invalid', 'Tipo elemento board non supportato.');
  });

  return {
    schemaVersion: 1,
    boardId: record.boardId,
    camera: { x: camera.x as number, y: camera.y as number, zoom: bounded(camera.zoom as number, 0.2, 4) },
    elements
  };
}
