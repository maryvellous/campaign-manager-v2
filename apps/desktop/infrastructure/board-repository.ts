import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CampaignError, validateRelativePath } from '../../../packages/core/src/index';
import { ioError } from './campaign-repository';

export type BoardTool = 'select' | 'hand' | 'text' | 'image' | 'token' | 'link';
export interface BoardElement {
  elementId: string;
  kind: 'text' | 'image' | 'note-card' | 'token' | 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  locked: boolean;
  text?: string;
  sourceNoteId?: string;
  excerpt?: string;
  assetPath?: string;
  title?: string;
  avatarPath?: string;
  visibleByDefault: boolean;
  groupId?: string;
  fromElementId?: string;
  toElementId?: string;
}
export interface BoardDocument {
  schemaVersion: 1;
  boardId: string;
  title: string;
  viewport: { x: number; y: number; zoom: number };
  elements: BoardElement[];
}
export interface BoardSnapshot extends BoardDocument { relativePath: string; revision: string }

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const boardName = (title: string) => {
  const cleaned = title.trim().replace(/\.board\.json$/iu, '');
  validateRelativePath(cleaned);
  if (!cleaned || cleaned.includes('/')) throw new CampaignError('invalid_path', 'Il nome della board non è valido.');
  return cleaned;
};
const validateElement = (value: unknown): BoardElement => {
  if (!value || typeof value !== 'object') throw new CampaignError('metadata_invalid', 'Elemento board non valido.');
  const element = value as BoardElement;
  if (typeof element.elementId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(element.elementId) || !['text', 'image', 'note-card', 'token', 'link'].includes(element.kind)) throw new CampaignError('metadata_invalid', 'Elemento board non valido.');
  for (const key of ['x', 'y', 'width', 'height', 'z'] as const) if (typeof element[key] !== 'number' || !Number.isFinite(element[key])) throw new CampaignError('metadata_invalid', 'Geometria board non valida.');
  if (element.width <= 0 || element.height <= 0 || typeof element.locked !== 'boolean') throw new CampaignError('metadata_invalid', 'Geometria board non valida.');
  if (element.visibleByDefault === undefined) element.visibleByDefault = false;
  if (typeof element.visibleByDefault !== 'boolean') throw new CampaignError('metadata_invalid', 'Visibilità board non valida.');
  for (const key of ['text', 'sourceNoteId', 'excerpt', 'assetPath', 'title', 'avatarPath', 'groupId', 'fromElementId', 'toElementId'] as const) if (element[key] !== undefined && typeof element[key] !== 'string') throw new CampaignError('metadata_invalid', 'Proprietà board non valida.');
  if (element.assetPath) { validateRelativePath(element.assetPath); if (path.isAbsolute(element.assetPath)) throw new CampaignError('outside_campaign_root', 'La board non può contenere path assoluti.'); }
  for (const key of ['sourceNoteId', 'avatarPath'] as const) if (element[key]) validateRelativePath(element[key]!);
  return element;
};
const parseBoard = (value: unknown): BoardDocument => {
  if (!value || typeof value !== 'object') throw new CampaignError('metadata_invalid', 'Board non valida.');
  const board = value as BoardDocument;
  if (board.schemaVersion !== 1 || typeof board.boardId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(board.boardId) || typeof board.title !== 'string' || !board.viewport || typeof board.viewport.x !== 'number' || typeof board.viewport.y !== 'number' || typeof board.viewport.zoom !== 'number' || board.viewport.zoom <= 0 || !Array.isArray(board.elements)) throw new CampaignError('metadata_invalid', 'Schema board non valido.');
  if (![board.viewport.x, board.viewport.y, board.viewport.zoom].every(Number.isFinite)) throw new CampaignError('metadata_invalid', 'Viewport board non valido.');
  if (new Set(board.elements.map(element => element?.elementId)).size !== board.elements.length) throw new CampaignError('metadata_invalid', 'Identificatori degli elementi duplicati.');
  return { schemaVersion: 1, boardId: board.boardId, title: board.title, viewport: board.viewport, elements: board.elements.map(validateElement) };
};

const writes = new Map<string, Promise<unknown>>();
export class BoardRepository {
  private constructor(readonly root: string, readonly boardsRoot: string, private readonly rootIdentity: string) {}
  static async open(root: string): Promise<BoardRepository> {
    try { root = await fs.realpath(root); const stat = await fs.stat(root); if (!stat.isDirectory()) throw new CampaignError('invalid_path', 'Seleziona una cartella.'); return new BoardRepository(root, path.join(root, 'Boards'), `${stat.dev}:${stat.ino}`); }
    catch (error) { throw ioError(error); }
  }
  private file(relativePath: string): string {
    validateRelativePath(relativePath); if (!/\.board\.json$/iu.test(relativePath) || relativePath.includes('/')) throw new CampaignError('invalid_path', 'Percorso board non valido.');
    return path.join(this.boardsRoot, relativePath);
  }
  private async checkedFile(relativePath: string, createDirectory = false): Promise<string> {
    const target = this.file(relativePath);
    const rootStat = await fs.lstat(this.root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || this.rootIdentity !== rootStat.dev + ':' + rootStat.ino) throw new CampaignError('not_found', 'La cartella originale non è più disponibile.');
    try { await fs.lstat(this.boardsRoot); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !createDirectory) throw error; await fs.mkdir(this.boardsRoot); }
    const directory = await fs.lstat(this.boardsRoot);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new CampaignError('outside_campaign_root', 'La cartella Boards deve essere una cartella locale.');
    const names = await fs.readdir(this.boardsRoot);
    if (names.some(name => name !== relativePath && name.toLowerCase() === relativePath.toLowerCase())) throw new CampaignError('collision', 'Esiste già una board con questo nome.');
    try { const stat = await fs.lstat(target); if (stat.isSymbolicLink() || !stat.isFile()) throw new CampaignError('outside_campaign_root', 'La board deve essere un file locale.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return target;
  }
  async list(): Promise<BoardSnapshot[]> {
    try {
      const names = (await fs.readdir(this.boardsRoot)).filter(name => /\.board\.json$/iu.test(name)).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
      const result: BoardSnapshot[] = [];
      for (const name of names) { try { result.push(await this.read(name)); } catch { /* An invalid board does not prevent other boards from opening. */ } }
      return result;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw ioError(error); }
  }
  async read(relativePath: string): Promise<BoardSnapshot> {
    try { const bytes = await fs.readFile(await this.checkedFile(relativePath)); const board = parseBoard(JSON.parse(bytes.toString('utf8'))); return { ...board, relativePath, revision: digest(bytes) }; }
    catch (error) { throw ioError(error); }
  }
  async create(title: string): Promise<BoardSnapshot> {
    const name = boardName(title); const relativePath = `${name}.board.json`; const board: BoardDocument = { schemaVersion: 1, boardId: randomUUID(), title: name, viewport: { x: 0, y: 0, zoom: 1 }, elements: [] };
    return this.write(relativePath, board, null);
  }
  async rename(relativePath: string, title: string): Promise<BoardSnapshot> {
    const source = this.file(relativePath); const targetRelative = `${boardName(title)}.board.json`; const target = this.file(targetRelative); if (targetRelative === relativePath) return this.read(relativePath);
    try { await fs.lstat(target); throw new CampaignError('collision', 'Esiste già una board con questo nome.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof CampaignError)) throw error; if (error instanceof CampaignError) throw error; }
    await fs.rename(source, target); const board = await this.read(targetRelative); return board;
  }
  async write(relativePath: string, board: BoardDocument, expectedRevision: string | null): Promise<BoardSnapshot> {
    const key = this.file(relativePath).toLowerCase();
    const next = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => this.writeNow(relativePath, board, expectedRevision));
    writes.set(key, next);
    try { return await next; } finally { if (writes.get(key) === next) writes.delete(key); }
  }
  private async writeNow(relativePath: string, board: BoardDocument, expectedRevision: string | null): Promise<BoardSnapshot> {
    const target = this.file(relativePath); const document = parseBoard(board); const bytes = Buffer.from(JSON.stringify(document, null, 2) + '\n', 'utf8');
    const temp = target + '.' + randomUUID() + '.tmp';
    try {
      await this.checkedFile(relativePath, true);
      const check = async () => {
        if (expectedRevision === null) {
          try { await fs.lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
          throw new CampaignError('collision', 'Esiste già una board con questo nome.');
        }
        if ((await this.read(relativePath)).revision !== expectedRevision) throw new CampaignError('conflict', 'La board è cambiata sul disco.');
      };
      await check();
      const handle = await fs.open(temp, 'wx');
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await this.checkedFile(relativePath);
      await check();
      if (expectedRevision === null) await fs.link(temp, target);
      else await fs.rename(temp, target);
      return { ...document, relativePath, revision: digest(bytes) };
    } catch (error) { throw ioError(error); }
    finally { await fs.unlink(temp).catch(() => undefined); }
  }
  async importAsset(source: string): Promise<string> {
    const extension = path.extname(source).toLowerCase(); if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new CampaignError('invalid_path', 'Supportati: PNG, JPEG e WebP.');
    const assets = path.join(this.root, 'Assets', 'Board'); await fs.mkdir(assets, { recursive: true }); const base = path.basename(source).replace(/[^a-z0-9._-]/giu, '_'); let target = path.join(assets, base); let index = 1;
    while (true) { try { await fs.lstat(target); target = path.join(assets, `${path.basename(base, extension)}-${index++}${extension}`); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; } }
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL); return path.relative(this.root, target).replaceAll(path.sep, '/');
  }
  async readAsset(relativePath: string): Promise<string> {
    validateRelativePath(relativePath); if (!relativePath.startsWith('Assets/Board/')) throw new CampaignError('outside_campaign_root', 'Asset board non valido.');
    const target = path.join(this.root, ...relativePath.split('/')); const bytes = await fs.readFile(target); const extension = path.extname(relativePath).toLowerCase(); const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extension];
    if (!mime) throw new CampaignError('invalid_path', 'Formato immagine non supportato.'); return `data:${mime};base64,${bytes.toString('base64')}`;
  }
}
