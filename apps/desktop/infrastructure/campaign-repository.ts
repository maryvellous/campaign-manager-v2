import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CampaignError, parseMetadata, validateNoteId, validateRelativePath, type CampaignMetadata, type NoteSnapshot, type VaultEntry } from '../../../packages/core/src/index';

export function ioError(error: unknown): CampaignError {
  if (error instanceof CampaignError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  const codes = { ENOENT: 'not_found', EACCES: 'permission_denied', EPERM: 'permission_denied', EROFS: 'read_only', ENOSPC: 'disk_full', EEXIST: 'collision' } as const;
  return new CampaignError(codes[code as keyof typeof codes] ?? 'io_error', error instanceof Error ? error.message : 'Operazione filesystem fallita.');
}
const revision = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ignored = (name: string) => ['.git', 'node_modules', 'boards', 'assets'].includes(name.toLowerCase()) || name.startsWith('.cmv2-');
const locks = new Map<string, Promise<unknown>>();
async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
export class CampaignRepository {
  private constructor(readonly root: string, public metadata: CampaignMetadata) {}
  static async metadataAt(root: string): Promise<CampaignMetadata> {
    try {
      const target = path.join(root, 'campaign.json');
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new CampaignError('metadata_invalid', 'campaign.json deve essere un file regolare.');
      let value: unknown;
      try { value = JSON.parse(await fs.readFile(target, 'utf8')); } catch { throw new CampaignError('metadata_invalid', 'campaign.json non è leggibile come JSON.'); }
      return parseMetadata(value);
    } catch (error) { throw ioError(error); }
  }
  static async open(input: string): Promise<CampaignRepository> {
    try {
      const root = await fs.realpath(input);
      if (!(await fs.stat(root)).isDirectory()) throw new CampaignError('invalid_path', 'Seleziona una cartella.');
      await fs.readdir(root);
      const probe = path.join(root, `.cmv2-probe-${randomUUID()}`);
      const handle = await fs.open(probe, 'wx');
      try { await handle.sync(); } finally { await handle.close(); await fs.unlink(probe); }
      let metadata: CampaignMetadata;
      try { metadata = await this.metadataAt(root); }
      catch (error) {
        if (!(error instanceof CampaignError) || error.code !== 'not_found') throw error;
        const candidate: CampaignMetadata = { schemaVersion: 1, campaignId: randomUUID() };
        try { await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx' }); }
        catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError; }
        metadata = await this.metadataAt(root);
      }
      return new CampaignRepository(root, metadata);
    } catch (error) { throw ioError(error); }
  }
  async checkRoot(): Promise<void> {
    const current = await CampaignRepository.metadataAt(this.root);
    if (current.campaignId !== this.metadata.campaignId) throw new CampaignError('not_found', 'La cartella originale non è più disponibile.');
  }
  private async target(id: string, missingLeaf = false): Promise<string> {
    validateRelativePath(id);
    await this.checkRoot();
    let cursor = this.root;
    const segments = id.split('/');
    for (let i = 0; i < segments.length; i++) {
      if (ignored(segments[i])) throw new CampaignError('invalid_path', 'Percorso interno escluso.');
      const names = await fs.readdir(cursor);
      const equivalent = names.find(name => name.toLowerCase() === segments[i].toLowerCase());
      if (equivalent && equivalent !== segments[i]) throw new CampaignError('case_collision', 'Il percorso differisce soltanto per maiuscole/minuscole.');
      cursor = path.join(cursor, segments[i]);
      try {
        const stat = await fs.lstat(cursor);
        if (stat.isSymbolicLink()) throw new CampaignError('outside_campaign_root', 'I collegamenti simbolici non sono supportati.');
        if (i < segments.length - 1 && !stat.isDirectory()) throw new CampaignError('invalid_path', 'Il percorso non è una cartella.');
      } catch (error) { if (missingLeaf && i === segments.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
    }
    const realParent = await fs.realpath(path.dirname(cursor));
    const relative = path.relative(this.root, realParent);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new CampaignError('outside_campaign_root', 'Percorso esterno alla campagna.');
    return cursor;
  }
  async readImage(noteId: string, source: string): Promise<string> {
    validateNoteId(noteId);
    let relative: string; try { relative = decodeURIComponent(source); } catch { throw new CampaignError('invalid_path', 'Immagine non valida.'); }
    relative = relative.replace(/^\.\//u, ''); validateRelativePath(relative);
    const extension = path.extname(relative).toLowerCase();
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as Record<string, string>)[extension];
    if (!mime) throw new CampaignError('invalid_path', 'Formato immagine non supportato.');
    const id = [...noteId.split('/').slice(0, -1), relative].join('/');
    const target = await this.target(id); const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new CampaignError('invalid_path', 'Immagine troppo grande o non valida (massimo 20 MB).');
      const bytes = await handle.readFile();
      const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/gif' ? /^GIF8[79]a$/u.test(bytes.subarray(0, 6).toString('ascii')) : bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
      if (!valid) throw new CampaignError('invalid_path', 'Contenuto immagine non valido.');
      return 'data:' + mime + ';base64,' + bytes.toString('base64');
    } finally { await handle.close(); }
  }
  async discover(): Promise<VaultEntry[]> {
    try {
      await this.checkRoot();
      const entries: VaultEntry[] = [];
      const walk = async (relative: string) => {
        const children = await fs.readdir(path.join(this.root, relative), { withFileTypes: true });
        const seen = new Set<string>();
        children.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name));
        for (const child of children) {
          if (ignored(child.name) || child.isSymbolicLink()) continue;
          const id = relative ? `${relative}/${child.name}` : child.name;
          if (!child.isDirectory() && !(child.isFile() && /\.md$/iu.test(child.name))) continue;
          validateRelativePath(id);
          if (seen.has(child.name.toLowerCase())) throw new CampaignError('case_collision', `Collisione di nomi: ${id}`);
          seen.add(child.name.toLowerCase());
          entries.push({ id, kind: child.isDirectory() ? 'folder' : 'note' });
          if (child.isDirectory()) await walk(id);
        }
      };
      await walk(''); return entries;
    } catch (error) { throw ioError(error); }
  }
  async readNote(noteId: string): Promise<NoteSnapshot> {
    try {
      validateNoteId(noteId);
      const target = await this.target(noteId);
      if (!(await fs.lstat(target)).isFile()) throw new CampaignError('invalid_path', 'La nota non è un file regolare.');
      const bytes = await fs.readFile(target);
      let markdown: string;
      try { markdown = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new CampaignError('encoding_error', 'Il file non è UTF-8 valido.'); }
      return { noteId, markdown, revision: revision(bytes) };
    } catch (error) { throw ioError(error); }
  }
  async saveNote(noteId: string, markdown: string, expectedRevision: string | null): Promise<NoteSnapshot> {
    return serialized(`${this.root}/${noteId}`.toLowerCase(), async () => {
      let temp: string | undefined;
      try {
        validateNoteId(noteId);
        const target = await this.target(noteId, expectedRevision === null);
        const verifyRevision = async () => {
          if (expectedRevision === null) {
            try { await fs.lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
            throw new CampaignError('collision', 'Esiste già una nota con questo nome.');
          }
          const current = await this.readNote(noteId);
          if (current.revision !== expectedRevision) throw new CampaignError('conflict', 'La nota è cambiata sul disco.');
        };
        await verifyRevision();
        temp = path.join(path.dirname(target), `.cmv2-save-${randomUUID()}`);
        const handle = await fs.open(temp, 'wx');
        try { await handle.writeFile(markdown, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        await this.target(noteId, expectedRevision === null);
        await verifyRevision();
        if (expectedRevision === null) { await fs.link(temp, target); await fs.unlink(temp); }
        else await fs.rename(temp, target);
        temp = undefined;
        const saved = await this.readNote(noteId);
        if (saved.revision !== revision(Buffer.from(markdown, 'utf8'))) throw new CampaignError('conflict', 'Il contenuto è cambiato durante il salvataggio.');
        return saved;
      } catch (error) { throw ioError(error); }
      finally { if (temp) await fs.unlink(temp).catch(() => undefined); }
    });
  }
  async trash(id: string, adapter: (absolutePath: string) => Promise<void>): Promise<void> {
    try { const target = await this.target(id); await adapter(target); }
    catch (error) { if (error instanceof CampaignError) throw error; throw new CampaignError('trash_unavailable', 'Il cestino non è disponibile. Nessuna eliminazione definitiva è stata richiesta.'); }
  }
  async createFolder(id: string): Promise<void> {
    try { await fs.mkdir(await this.target(id, true)); } catch (error) { throw ioError(error); }
  }
  async entryIdentity(id: string): Promise<string | null> {
    try {
      const stat = await fs.lstat(await this.target(id));
      return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.isDirectory() ? 'folder' : 'file'}`;
    } catch (error) { const failure = ioError(error); if (failure.code === 'not_found' || failure.code === 'case_collision') return null; throw failure; }
  }
  async validateMove(oldId: string, newId: string): Promise<void> {
    try {
      validateRelativePath(oldId); validateRelativePath(newId);
      if (oldId === newId) throw new CampaignError('invalid_path', 'Il percorso è già quello richiesto.');
      const source = await this.target(oldId);
      const stat = await fs.lstat(source);
      if (!stat.isDirectory()) { validateNoteId(oldId); validateNoteId(newId); }
      if (stat.isDirectory() && newId.toLowerCase().startsWith(`${oldId.toLowerCase()}/`)) throw new CampaignError('invalid_path', 'Una cartella non può essere spostata dentro se stessa.');
      const parent = newId.includes('/') ? newId.slice(0, newId.lastIndexOf('/')) : '';
      const directory = parent ? await this.target(parent) : this.root;
      if (!(await fs.lstat(directory)).isDirectory()) throw new CampaignError('invalid_path', 'La destinazione non è una cartella.');
      const basename = newId.split('/').at(-1)!;
      if (ignored(basename)) throw new CampaignError('invalid_path', 'Percorso interno escluso.');
      const existing = (await fs.readdir(directory)).find(name => name.toLowerCase() === basename.toLowerCase());
      const oldParent = oldId.includes('/') ? oldId.slice(0, oldId.lastIndexOf('/')) : '';
      if (existing && !(parent === oldParent && existing === oldId.split('/').at(-1))) throw new CampaignError(existing === basename ? 'collision' : 'case_collision', 'La destinazione esiste già.');
    } catch (error) { throw ioError(error); }
  }
  async move(oldId: string, newId: string): Promise<void> {
    return serialized(`${this.root}/move`, async () => {
      try {
        await this.validateMove(oldId, newId);
        const source = await this.target(oldId);
        const destination = path.join(this.root, ...newId.split('/'));
        if (oldId.toLowerCase() === newId.toLowerCase()) {
          const temporary = path.join(path.dirname(source), `.cmv2-move-${randomUUID()}`);
          await fs.rename(source, temporary);
          try {
            if ((await fs.readdir(path.dirname(destination))).some(name => name.toLowerCase() === path.basename(destination).toLowerCase())) throw new CampaignError('collision', 'La destinazione è stata creata durante la rinomina.');
            await fs.rename(temporary, destination);
          } catch (error) { await fs.rename(temporary, source); throw error; }
        } else {
          await this.target(newId, true);
          await fs.rename(source, destination);
        }
      } catch (error) { throw ioError(error); }
    });
  }
  async repairCaseRename(oldId: string, newId: string, identity: string): Promise<void> {
    validateRelativePath(oldId); validateRelativePath(newId);
    if (oldId.toLowerCase() !== newId.toLowerCase()) throw new CampaignError('invalid_path', 'Non è una rinomina di sole maiuscole/minuscole.');
    await this.checkRoot();
    const parentId = oldId.split('/').slice(0, -1).join('/');
    const directory = parentId ? await this.target(parentId) : this.root;
    const names = await fs.readdir(directory);
    if (names.some(n => n.toLowerCase() === newId.split('/').at(-1)!.toLowerCase())) throw new CampaignError('collision', 'La destinazione è già occupata.');
    const matches: string[] = [];
    for (const name of names.filter(n => /^\.cmv2-move-[0-9a-f-]{36}$/iu.test(n))) {
      const candidate = path.join(directory, name); const stat = await fs.lstat(candidate);
      if (!stat.isSymbolicLink() && `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.isDirectory() ? 'folder' : 'file'}` === identity) matches.push(candidate);
    }
    if (matches.length !== 1) throw new CampaignError('conflict', 'Non è stato possibile identificare il file temporaneo dello spostamento.');
    await fs.rename(matches[0], path.join(directory, newId.split('/').at(-1)!));
  }
  async makeIndependentCopy(): Promise<void> {
    await serialized(`${this.root}/campaign.json`.toLowerCase(), async () => {
      await this.checkRoot();
      const target = path.join(this.root, 'campaign.json');
      const original = await fs.readFile(target, 'utf8');
      const metadata = { ...parseMetadata(JSON.parse(original)), campaignId: randomUUID() };
      const temp = path.join(this.root, `.cmv2-metadata-${randomUUID()}`);
      try {
        const handle = await fs.open(temp, 'wx');
        try { await handle.writeFile(JSON.stringify(metadata, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
        if (await fs.readFile(target, 'utf8') !== original) throw new CampaignError('conflict', 'I metadata sono cambiati sul disco.');
        await fs.rename(temp, target); this.metadata = metadata;
      } finally { await fs.unlink(temp).catch(() => undefined); }
    });
  }
  watch(callback: () => void): FSWatcher {
    const watcher = watch(this.root, { recursive: true }, callback);
    watcher.on('error', callback); return watcher;
  }
}






