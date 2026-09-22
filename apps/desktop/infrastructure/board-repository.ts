import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CampaignError, validateRelativePath } from '../../../packages/core/src/index';
import { CampaignRepository, ioError } from './campaign-repository';
import {
  boardPathFromTitle,
  boardTitleFromPath,
  parseBoardDocument,
  validateBoardAssetPath,
  validateBoardPath,
  type BoardDocument,
  type BoardListItem,
  type BoardSnapshot
} from '../application/board-types';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const serializedLocks = new Map<string, Promise<unknown>>();

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = serializedLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  serializedLocks.set(key, next);
  try { return await next; }
  finally { if (serializedLocks.get(key) === next) serializedLocks.delete(key); }
}

function supportedImage(name: string): { extension: string; mime: string } {
  const extension = path.extname(name).toLowerCase();
  const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extension];
  if (!mime) throw new CampaignError('invalid_path', 'Usa un’immagine PNG, JPG/JPEG o WebP.');
  return { extension, mime };
}

function validImage(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export class BoardRepository {
  constructor(readonly root: string, readonly campaignId: string) {}

  private async checkRoot(): Promise<void> {
    const metadata = await CampaignRepository.metadataAt(this.root);
    if (metadata.campaignId !== this.campaignId) throw new CampaignError('not_found', 'La cartella della campagna non è più disponibile.');
  }

  private async ensureDirectory(relative: 'Boards' | 'Assets/Board'): Promise<string> {
    await this.checkRoot();
    const target = path.join(this.root, ...relative.split('/'));
    await fs.mkdir(target, { recursive: true });
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CampaignError('outside_campaign_root', 'La cartella board non può essere un collegamento simbolico.');
    const real = await fs.realpath(target);
    const rel = path.relative(this.root, real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CampaignError('outside_campaign_root', 'Percorso board esterno alla campagna.');
    return target;
  }

  private async target(relative: string, missingLeaf = false): Promise<string> {
    validateRelativePath(relative);
    await this.checkRoot();
    let cursor = this.root;
    const segments = relative.split('/');
    for (let index = 0; index < segments.length; index++) {
      cursor = path.join(cursor, segments[index]);
      try {
        const stat = await fs.lstat(cursor);
        if (stat.isSymbolicLink()) throw new CampaignError('outside_campaign_root', 'I collegamenti simbolici non sono supportati per board e asset.');
        if (index < segments.length - 1 && !stat.isDirectory()) throw new CampaignError('invalid_path', 'Il percorso board non è valido.');
      } catch (error) {
        if (missingLeaf && index === segments.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
    }
    const parent = await fs.realpath(path.dirname(cursor));
    const rel = path.relative(this.root, parent);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CampaignError('outside_campaign_root', 'Percorso board esterno alla campagna.');
    return cursor;
  }

  async discover(): Promise<BoardListItem[]> {
    try {
      const directory = await this.ensureDirectory('Boards');
      const children = await fs.readdir(directory, { withFileTypes: true });
      const result: BoardListItem[] = [];
      for (const child of children.filter(child => child.isFile() && /\.board\.json$/iu.test(child.name)).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))) {
        const boardPath = `Boards/${child.name}`;
        try {
          const snapshot = await this.readBoard(boardPath);
          result.push({ path: boardPath, title: snapshot.title, boardId: snapshot.document.boardId });
        } catch (error) {
          const failure = ioError(error);
          if (failure.code === 'metadata_invalid' || failure.code === 'unsupported_schema') continue;
          throw error;
        }
      }
      return result;
    } catch (error) { throw ioError(error); }
  }

  async readBoard(boardPath: string): Promise<BoardSnapshot> {
    try {
      validateBoardPath(boardPath);
      const target = await this.target(boardPath);
      const stat = await fs.lstat(target);
      if (!stat.isFile()) throw new CampaignError('invalid_path', 'La board non è un file regolare.');
      const bytes = await fs.readFile(target);
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
      catch { throw new CampaignError('metadata_invalid', 'La board non è JSON UTF-8 valido.'); }
      return { path: boardPath, title: boardTitleFromPath(boardPath), revision: digest(bytes), document: parseBoardDocument(value) };
    } catch (error) { throw ioError(error); }
  }

  async createBoard(title: string): Promise<BoardSnapshot> {
    const boardPath = boardPathFromTitle(title);
    const document: BoardDocument = { schemaVersion: 1, boardId: randomUUID(), camera: { x: 0, y: 0, zoom: 1 }, elements: [] };
    return this.saveBoard(boardPath, document, null);
  }

  async saveBoard(boardPath: string, document: BoardDocument, expectedRevision: string | null): Promise<BoardSnapshot> {
    validateBoardPath(boardPath);
    const valid = parseBoardDocument(document);
    await this.ensureDirectory('Boards');
    return serialized(`${this.root}/${boardPath}`.toLowerCase(), async () => {
      let temp: string | undefined;
      try {
        const target = await this.target(boardPath, expectedRevision === null);
        const verify = async () => {
          if (expectedRevision === null) {
            try { await fs.lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
            throw new CampaignError('collision', 'Esiste già una board con questo nome.');
          }
          const current = await this.readBoard(boardPath);
          if (current.revision !== expectedRevision) throw new CampaignError('conflict', 'La board è cambiata sul disco.');
        };
        await verify();
        const payload = JSON.stringify(valid, null, 2) + '\n';
        temp = path.join(path.dirname(target), `.cmv2-board-${randomUUID()}`);
        const handle = await fs.open(temp, 'wx');
        try { await handle.writeFile(payload, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        await verify();
        if (expectedRevision === null) { await fs.link(temp, target); await fs.unlink(temp); }
        else await fs.rename(temp, target);
        temp = undefined;
        return await this.readBoard(boardPath);
      } catch (error) { throw ioError(error); }
      finally { if (temp) await fs.unlink(temp).catch(() => undefined); }
    });
  }

  async renameBoard(oldPath: string, title: string): Promise<BoardSnapshot> {
    validateBoardPath(oldPath);
    const newPath = boardPathFromTitle(title);
    if (newPath === oldPath) return this.readBoard(oldPath);
    return serialized(`${this.root}/boards-rename`, async () => {
      try {
        const source = await this.target(oldPath);
        const destination = await this.target(newPath, true);
        try { await fs.lstat(destination); throw new CampaignError('collision', 'Esiste già una board con questo nome.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await fs.rename(source, destination);
        return await this.readBoard(newPath);
      } catch (error) { throw ioError(error); }
    });
  }

  async importImage(originalName: string, base64: string): Promise<string> {
    try {
      const { extension, mime } = supportedImage(originalName);
      const bytes = Buffer.from(base64, 'base64');
      if (!bytes.length || bytes.length > 20 * 1024 * 1024 || !validImage(bytes, mime)) throw new CampaignError('invalid_path', 'Immagine non valida o troppo grande (massimo 20 MB).');
      const directory = await this.ensureDirectory('Assets/Board');
      const rawStem = path.basename(originalName, extension).trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').replace(/[. ]+$/u, '') || 'immagine';
      const stem = rawStem.slice(0, 100);
      let name = `${stem}${extension}`;
      for (let suffix = 2; ; suffix++) {
        const relative = `Assets/Board/${name}`;
        validateBoardAssetPath(relative);
        const target = path.join(directory, name);
        try {
          const handle = await fs.open(target, 'wx');
          try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
          return relative;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          name = `${stem}-${suffix}${extension}`;
        }
      }
    } catch (error) { throw ioError(error); }
  }

  async readAsset(assetPath: string): Promise<string> {
    try {
      validateBoardAssetPath(assetPath);
      const target = await this.target(assetPath);
      const bytes = await fs.readFile(target);
      const { mime } = supportedImage(assetPath);
      if (!validImage(bytes, mime)) throw new CampaignError('invalid_path', 'Asset board non valido.');
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch (error) { throw ioError(error); }
  }
}
