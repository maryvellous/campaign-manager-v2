import { parseWikiLinks, resolveWikiLink } from '../../../packages/core/src/markdown';
import { randomUUID } from 'node:crypto';
import { defaultUi, draftTitle, draftWords, type UiState, type View } from './workspace-types';
import { MoveCoordinator, remapPath, type MoveRepairRecord } from './move-coordinator';
import { validateRelativePath } from '../../../packages/core/src/index';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import { CampaignError, type RecoveryDraft, type RecoveryTarget, type NoteSnapshot, type VaultEntry } from '../../../packages/core/src/index';
import { CampaignRepository, ioError } from '../infrastructure/campaign-repository';
import { LocalStore, type Preferences } from '../infrastructure/local-store';
import { BoardRepository, type BoardDocument, type BoardSnapshot } from '../infrastructure/board-repository';
export interface DocumentSession { sessionId?: string; draft?: { id: string; parentFolder: string; manualTitle?: string }; noteId: string; markdown: string; baseRevision: string; state: 'clean' | 'dirty' | 'saving' | 'error' | 'conflict' | 'missing'; recoveryKey?: string; recoveryTarget?: RecoveryTarget; protected: boolean; error?: string; disk?: NoteSnapshot }
export interface WorkspaceTab { id: string; document?: DocumentSession; history: string[]; historyIndex: number }
export interface AppState {
  projectionVersion?: number; tabs: WorkspaceTab[]; activeTabId?: string; ui: UiState; repairs: MoveRepairRecord[];
  campaign?: { campaignId: string; name: string; root: string };
  entries: VaultEntry[]; preferences: Preferences; document?: DocumentSession;
  recoveries: Array<{ key: string; draft: RecoveryDraft }>;
  rootMissing: boolean; warning?: string;
  boards: BoardSnapshot[]; activeBoard?: BoardSnapshot; boardState?: 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'; boardError?: string;
}
export type SearchMatchKind = 'title-exact' | 'title-prefix' | 'title-contains' | 'path' | 'body';
export interface SearchResult {
  noteId: string;
  title: string;
  relativePath: string;
  score: number;
  matchKind: SearchMatchKind;
  snippet?: string;
}
export interface SearchDocument {
  noteId: string;
  title: string;
  relativePath: string;
  folderPath: string;
  bodyText: string;
  revision: string;
}
export interface GraphNode {
  noteId: string;
  effectiveFolderColor?: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  occurrences: number;
}

const normalizeSearchText = (value: string): string => value.normalize('NFKD').replace(/[\p{Diacritic}]/gu, '').toLowerCase();
const normalizeMarkdownText = (markdown: string): string => markdown
  .replace(/```[\s\S]*?```/gu, ' ')
  .replace(/`[^`]*`/gu, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
  .replace(/\[[^\]]+\]\([^)]*\)/gu, ' ')
  .replace(/\[[^\]]+\]/gu, ' ')
  .replace(/[\r\n]+/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();

export class CampaignService {
  private repo?: CampaignRepository;
  private disposed = false;
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Promise<unknown> = Promise.resolve();
  state: AppState = { tabs: [], ui: defaultUi(), repairs: [], entries: [], preferences: { recent: [] }, recoveries: [], rootMissing: false, boards: [], boardState: 'clean' };
  private boardRepo?: BoardRepository;
  private boardSaveTimer?: ReturnType<typeof setTimeout>;
  onChange: () => void = () => undefined;
  private autoSaveTimer?: ReturnType<typeof setTimeout>;
  constructor(readonly store: LocalStore) {
    Object.defineProperty(this.state, 'document', {
      enumerable: true,
      get: () => this.activeTab()?.document,
      set: (document: DocumentSession | undefined) => {
        let tab = this.activeTab();
        if (!tab && document) { tab = { id: randomUUID(), history: [], historyIndex: -1 }; this.state.tabs.push(tab); this.state.activeTabId = tab.id; }
        if (document) document.sessionId ??= tab?.document?.noteId === document.noteId ? tab.document.sessionId ?? randomUUID() : randomUUID();
        if (tab) tab.document = document;
      }
    });
  }
  private activeTab(): WorkspaceTab | undefined { return this.state.tabs.find(tab => tab.id === this.state.activeTabId); }
  private async persistUi(): Promise<void> {
    if (!this.repo) return;
    try { await this.store.writeUi(this.repo.metadata.campaignId, this.state.ui, { activeTabId: this.state.activeTabId, tabs: this.state.tabs.filter(t => t.document && !t.document.draft).map(t => ({ id: t.id, noteId: t.document!.noteId, history: t.history, historyIndex: t.historyIndex })) }); }
    catch { this.state.warning = 'Non è stato possibile aggiornare le preferenze locali. I file della campagna sono indipendenti.'; }
  }
  private touchNote(id: string): void { this.state.ui.recentNotes = [id, ...this.state.ui.recentNotes.filter(n => n !== id)].slice(0, 50); }
  run<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.catch(() => undefined).then(operation); this.queue = task;
    return task.finally(() => this.onChange());
  }
  async initialize(): Promise<void> {
    this.state.preferences = await this.store.readPreferences();
    this.state.warning = this.store.warning;
    if (this.state.preferences.lastPath) {
      try { await this.open(this.state.preferences.lastPath); }
      catch (error) { this.state.warning = `L'ultima campagna non è disponibile. ${ioError(error).message}`; }
    }
  }
  async open(root: string, independent = false, preserveRecovery = false, relink = false): Promise<void> {
    if (relink && !this.repo) throw new CampaignError('not_found', 'Nessuna campagna da ricollegare.');
    if (relink) {
      const metadata = await CampaignRepository.metadataAt(root);
      if (metadata.campaignId !== this.repo!.metadata.campaignId) throw new CampaignError('metadata_invalid', 'Questa cartella appartiene a una campagna diversa.');
    } else if (!(await this.prepareLeave(preserveRecovery))) throw new CampaignError('conflict', 'Ci sono modifiche non salvate. Resta qui oppure conserva una bozza di recupero.');
    const repo = await CampaignRepository.open(root);
    const known = this.state.preferences.recent.find(r => r.campaignId === repo.metadata.campaignId && r.path.toLowerCase() !== repo.root.toLowerCase());
    if (known) {
      let duplicate = false;
      try { duplicate = (await CampaignRepository.metadataAt(known.path)).campaignId === repo.metadata.campaignId; } catch (error) { if (ioError(error).code !== 'not_found') throw error; }
      if (duplicate) {
        if (!independent) throw new CampaignError('collision', 'Questa campagna esiste già in un’altra cartella. Puoi usare questa cartella come nuova copia indipendente.');
        await repo.makeIndependentCopy();
      }
    }
    const entries = await repo.discover();
    const previousDocument = relink ? this.state.document : undefined;
    this.watcher?.close(); if (this.timer) clearInterval(this.timer);
    this.repo = repo;
    this.boardRepo = await BoardRepository.open(repo.root);
    this.state.campaign = { campaignId: repo.metadata.campaignId, name: repo.metadata.name || path.basename(repo.root), root: repo.root };
    this.state.entries = entries; this.state.boards = await this.boardRepo.list(); this.state.activeBoard = undefined; this.state.boardState = 'clean'; this.state.boardError = undefined; this.state.rootMissing = false;
    if (!relink) {
      this.state.tabs = []; this.state.activeTabId = undefined;
      const saved = await this.store.readUi(repo.metadata.campaignId); this.state.ui = saved.ui;
      const recovery = await this.store.listRecovery(repo.metadata.campaignId);
      for (const tab of saved.workspace.tabs) {
        if (this.state.tabs.some(t => t.document?.noteId === tab.noteId) || recovery.some(r => r.draft.target.kind === 'existing' && r.draft.target.noteId === tab.noteId)) continue;
        try { const note = await repo.readNote(tab.noteId); this.state.tabs.push({ id: tab.id, history: tab.history, historyIndex: tab.historyIndex, document: { sessionId: randomUUID(), ...note, baseRevision: note.revision, state: 'clean', protected: true } }); } catch { /* A missing file does not block startup. */ }
      }
      this.state.activeTabId = this.state.tabs.find(t => t.id === saved.workspace.activeTabId)?.id ?? this.state.tabs[0]?.id;
    } else this.state.document = previousDocument;
    this.state.repairs = await this.store.listMoveRepairs(repo.metadata.campaignId);
    this.state.recoveries = await this.store.listRecovery(repo.metadata.campaignId);
    this.state.preferences = { lastPath: repo.root, recent: [{ campaignId: repo.metadata.campaignId, path: repo.root, name: this.state.campaign.name }, ...this.state.preferences.recent.filter(r => r.campaignId !== repo.metadata.campaignId)].slice(0, 12) };
    try { await this.store.writePreferences(this.state.preferences); } catch { this.state.warning = 'Campagna aperta; non è stato possibile aggiornare le preferenze locali.'; }
    try { this.watcher = repo.watch(() => { void this.run(() => this.refresh()).catch(() => undefined); }); } catch { this.state.warning = 'Notifiche filesystem non disponibili; verifica periodica attiva.'; }
    // Polling covers a removed/remounted root and missed native watcher notifications.
    this.timer = setInterval(() => { void this.run(() => this.refresh()).catch(() => undefined); }, 1500);
    this.timer.unref();
    if (relink) await this.refresh();
  }
  async openNote(noteId: string, newTab = false, recordHistory = true): Promise<void> {
    const existing = this.state.tabs.find(t => t.document?.noteId === noteId && !t.document.draft);
    if (existing) { await this.activateTab(existing.id); this.state.ui.view = 'notes'; this.state.ui.selectedFolder = ''; return; }
    if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Salva o risolvi le modifiche prima di aprire un’altra nota.');
    this.state.recoveries = await this.store.listRecovery(this.requiredRepo().metadata.campaignId);
    if (this.state.recoveries.some(item => item.draft.target.kind === 'existing' && item.draft.target.noteId === noteId)) throw new CampaignError('conflict', 'Questa nota ha una bozza da recuperare. Scegli Ripristina, Esporta o Scarta prima di modificarla.');
    const note = await this.requiredRepo().readNote(noteId);
    if (newTab || !this.activeTab()) { const tab = { id: randomUUID(), history: [] as string[], historyIndex: -1 }; this.state.tabs.push(tab); this.state.activeTabId = tab.id; }
    this.state.document = { ...note, baseRevision: note.revision, state: 'clean', protected: true };
    const tab = this.activeTab()!;
    if (recordHistory) { tab.history = [...tab.history.slice(0, tab.historyIndex + 1), noteId]; tab.historyIndex = tab.history.length - 1; }
    this.state.ui.view = 'notes'; this.state.ui.selectedFolder = ''; this.touchNote(noteId); await this.persistUi();
  }
  private requiredRepo(): CampaignRepository { if (!this.repo) throw new CampaignError('not_found', 'Apri una campagna.'); return this.repo; }
  private async protect(): Promise<void> {
    const doc = this.state.document;
    if (!doc || doc.state === 'clean') return;
    if (doc.draft && !draftWords(doc.markdown).length) { if (doc.recoveryKey) await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey); doc.recoveryKey = undefined; doc.protected = true; return; }
    try {
      doc.recoveryKey = await this.store.putRecovery({ campaignId: this.requiredRepo().metadata.campaignId, target: doc.draft ? { kind: 'new-draft', draftId: doc.draft.id, parentFolder: doc.draft.parentFolder, manualTitle: doc.draft.manualTitle } : doc.recoveryTarget?.kind === 'new-draft' ? doc.recoveryTarget : { kind: 'existing', noteId: doc.noteId, baseRevision: doc.baseRevision }, markdown: doc.markdown, capturedAt: new Date().toISOString() });
      doc.protected = true;
    } catch (error) { doc.protected = false; doc.error = `Bozza non protetta: ${ioError(error).message}`; throw error; }
  }
  async edit(markdown: string): Promise<void> {
    const doc = this.state.document;
    if (!doc) throw new CampaignError('not_found', 'Nessuna nota aperta.');
    if (doc.markdown === markdown) return;
    doc.markdown = markdown; doc.protected = false;
    if (!['conflict', 'missing'].includes(doc.state)) doc.state = 'dirty';
    await this.protect();
    this.scheduleSave();
  }
  async save(): Promise<void> {
    const doc = this.state.document;
    if (!doc || doc.state === 'clean') return;
    if (doc.state === 'conflict' || doc.state === 'missing' || this.state.rootMissing) { await this.protect(); return; }
    doc.state = 'saving'; this.onChange();
    const savedContent = doc.markdown;
    if (doc.draft && !draftWords(savedContent).length) { if (doc.recoveryKey) await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey); doc.recoveryKey = undefined; doc.state = 'clean'; doc.protected = true; return; }
    try {
      const id = doc.draft ? [doc.draft.parentFolder, `${doc.draft.manualTitle || draftTitle(savedContent)}.md`].filter(Boolean).join('/') : doc.noteId;
      const note = await this.requiredRepo().saveNote(id, savedContent, doc.draft ? null : doc.baseRevision);
      if (doc.draft) { doc.noteId = note.noteId; doc.draft = undefined; const tab = this.activeTab()!; tab.history = [...tab.history.slice(0, tab.historyIndex + 1), note.noteId]; tab.historyIndex = tab.history.length - 1; this.state.entries = await this.requiredRepo().discover(); }
      this.touchNote(note.noteId);
      doc.baseRevision = note.revision; doc.state = 'clean'; doc.protected = true; doc.error = undefined; doc.disk = undefined; doc.recoveryTarget = undefined;
      if (doc.recoveryKey) {
        try { await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey); doc.recoveryKey = undefined; }
        catch { this.state.warning = 'Nota salvata. La vecchia bozza verrà verificata alla riapertura.'; }
      }
      try { this.state.recoveries = await this.store.listRecovery(this.requiredRepo().metadata.campaignId); }
      catch { this.state.warning = 'Il file è salvato; non è stato possibile aggiornare l’elenco delle bozze.'; }
    } catch (error) {
      const failure = ioError(error); doc.error = failure.message;
      doc.state = failure.code === 'conflict' ? 'conflict' : failure.code === 'not_found' ? 'missing' : 'error';
      if (doc.state === 'conflict') doc.disk = await this.requiredRepo().readNote(doc.noteId).catch(() => undefined);
      await this.protect();
    }
  }
  async refresh(): Promise<void> {
    this.state.projectionVersion = (this.state.projectionVersion ?? 0) + 1;
    if (!this.repo || this.disposed) return;
    try { await this.repo.checkRoot(); this.state.rootMissing = false; }
    catch { this.state.rootMissing = true; if (this.state.document?.state !== 'clean') await this.protect(); return; }
    try { this.state.entries = await this.repo.discover(); }
    catch (error) { this.state.warning = ioError(error).message; }
    const active = this.state.activeTabId;
    try {
      for (const tab of this.state.tabs) {
        this.state.activeTabId = tab.id;
        const doc = tab.document; if (!doc || doc.draft) continue;
        try {
          const disk = await this.repo.readNote(doc.noteId);
          if (disk.revision === doc.baseRevision) { if (doc.state === 'missing') doc.state = doc.markdown === disk.markdown ? 'clean' : 'dirty'; continue; }
          if (doc.state === 'clean') { doc.markdown = disk.markdown; doc.baseRevision = disk.revision; }
          else { doc.state = 'conflict'; doc.disk = disk; await this.protect(); }
        } catch (error) { doc.state = ioError(error).code === 'not_found' ? 'missing' : 'error'; doc.error = ioError(error).message; await this.protect(); }
      }
    } finally { this.state.activeTabId = active; }
    const known = new Set(this.state.entries.filter(e => e.kind === 'note').map(e => e.id));
    this.state.ui.recentNotes = this.state.ui.recentNotes.filter(id => known.has(id));
  }
  async resolve(choice: 'local' | 'disk', confirmedRevision?: string): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;
    const disk = await this.requiredRepo().readNote(doc.noteId);
    if (choice === 'disk') {
      if (doc.recoveryKey) await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey);
      this.state.document = { ...disk, baseRevision: disk.revision, state: 'clean', protected: true };
      try { this.state.recoveries = await this.store.listRecovery(this.requiredRepo().metadata.campaignId); }
      catch { this.state.warning = 'Il file è salvato; non è stato possibile aggiornare l’elenco delle bozze.'; }
    } else {
      if (disk.revision !== confirmedRevision) { doc.disk = disk; throw new CampaignError('conflict', 'La versione su disco è cambiata di nuovo: confrontala prima di confermare.'); }
      doc.baseRevision = disk.revision; doc.state = 'dirty'; await this.protect(); await this.save();
    }
  }
  async saveAs(noteId: string): Promise<void> {
    const doc = this.state.document; if (!doc) return;
    const pending = await this.store.listRecovery(this.requiredRepo().metadata.campaignId);
    if (pending.some(item => item.key !== doc.recoveryKey && item.draft.target.kind === 'existing' && item.draft.target.noteId === noteId)) throw new CampaignError('conflict', 'Il nuovo percorso ha già una bozza da recuperare. Scegli un altro nome.');
    const saved = await this.requiredRepo().saveNote(noteId, doc.markdown, null);
    if (doc.recoveryKey) {
      try { await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey); }
      catch { this.state.warning = 'La nuova nota è salvata. La vecchia bozza è stata conservata.'; }
    }
    this.state.document = { ...saved, baseRevision: saved.revision, state: 'clean', protected: true };
    const tab = this.activeTab(); if (tab) { tab.history = [...tab.history.slice(0, tab.historyIndex + 1), noteId]; tab.historyIndex = tab.history.length - 1; }
    this.touchNote(noteId); this.state.ui.view = 'notes'; await this.refresh(); await this.persistUi();
  }
  async recovery(key: string, action: 'restore' | 'discard'): Promise<void> {
    const repo = this.requiredRepo();
    const item = (await this.store.listRecovery(repo.metadata.campaignId)).find(item => item.key === key);
    if (!item) throw new CampaignError('not_found', 'Bozza non trovata.');
    if (action === 'discard') await this.store.removeRecovery(repo.metadata.campaignId, key);
    else {
      const recoveredTab = this.state.tabs.find(tab => tab.document?.recoveryKey === key);
      if (recoveredTab) { await this.activateTab(recoveredTab.id); return; }
      if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi prima la nota aperta.');
      const target = item.draft.target;
      const existing = target.kind === 'existing' ? this.state.tabs.find(tab => tab.document?.noteId === target.noteId && !tab.document.draft) : undefined;
      if (existing) { this.state.activeTabId = existing.id; if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi prima la nota aperta.'); }
      this.state.ui.view = 'notes';
      const noteId = target.kind === 'existing' ? target.noteId : `${target.parentFolder ? target.parentFolder + '/' : ''}${target.manualTitle || 'Bozza recuperata'}.md`;
      const disk = await repo.readNote(noteId).catch(error => { if (ioError(error).code !== 'not_found') throw error; return undefined; });
      this.state.document = { noteId, markdown: item.draft.markdown, baseRevision: target.kind === 'existing' ? target.baseRevision : '', state: target.kind === 'new-draft' ? 'dirty' : !disk ? 'missing' : disk.revision === (target.kind === 'existing' ? target.baseRevision : '') ? 'dirty' : 'conflict', recoveryKey: key, recoveryTarget: target, draft: target.kind === 'new-draft' ? { id: target.draftId, parentFolder: target.parentFolder, manualTitle: target.manualTitle } : undefined, protected: true, disk };
    }
    this.state.recoveries = await this.store.listRecovery(repo.metadata.campaignId);
  }
  private async leaveCurrent(preserve = false): Promise<boolean> {
    await this.save(); const doc = this.state.document;
    if (!doc || doc.state === 'clean') return true;
    try { await this.protect(); } catch { return false; }
    return preserve && doc.protected;
  }
  async prepareLeave(preserve = false): Promise<boolean> {
    const active = this.state.activeTabId; let allowed = true;
    try { for (const tab of [...this.state.tabs]) { this.state.activeTabId = tab.id; if (!(await this.leaveCurrent(preserve))) allowed = false; } }
    finally { this.state.activeTabId = active; }
    await this.persistUi(); return allowed;
  }
  async discard(): Promise<void> {
    const doc = this.state.document;
    if (doc?.recoveryKey) await this.store.removeRecovery(this.requiredRepo().metadata.campaignId, doc.recoveryKey);
    this.state.document = undefined;
  }
  async trash(adapter: (target: string) => Promise<void>): Promise<void> {
    if (!(await this.prepareLeave(false))) throw new CampaignError('conflict', 'Risolvi le modifiche prima di cestinare.');
    if (!this.state.document) return;
    await this.requiredRepo().trash(this.state.document.noteId, adapter);
    this.state.document = undefined; await this.refresh();
  }
  private scheduleSave(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    const id = this.state.activeTabId;
    this.autoSaveTimer = setTimeout(() => {
      void this.run(async () => {
        if (this.disposed || this.state.activeTabId !== id) return;
        const doc = this.state.document;
        if (!doc || (doc.draft && draftWords(doc.markdown).length < 3)) return;
        await this.save(); await this.persistUi();
      }).catch(() => undefined);
    }, 600);
    this.autoSaveTimer.unref();
  }
  async newNote(parentFolder?: string, newTab = false): Promise<void> {
    const folder = parentFolder ?? (this.state.ui.selectedFolder || this.state.document?.noteId.split('/').slice(0, -1).join('/') || '');
    validateRelativePath(folder, true);
    if (folder && !this.state.entries.some(e => e.kind === 'folder' && e.id === folder)) throw new CampaignError('not_found', 'Cartella non trovata.');
    this.requiredRepo();
    if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi le modifiche prima di creare una nuova nota.');
    if (newTab || !this.activeTab()) { const tab = { id: randomUUID(), history: [] as string[], historyIndex: -1 }; this.state.tabs.push(tab); this.state.activeTabId = tab.id; }
    this.state.document = { draft: { id: randomUUID(), parentFolder: folder }, noteId: '', markdown: '', baseRevision: '', state: 'clean', protected: true };
    this.state.ui.view = 'notes'; this.state.ui.selectedFolder = ''; await this.persistUi();
  }
  async setDraftTitle(title: string): Promise<void> {
    const doc = this.state.document; if (!doc?.draft) throw new CampaignError('invalid_path', 'Nessuna bozza aperta.');
    const name = title.replace(/\.md$/iu, ''); validateRelativePath(name);
    if (name.includes('/')) throw new CampaignError('invalid_path', 'Il titolo non può contenere un percorso.');
    doc.draft.manualTitle = name; doc.error = undefined; if (doc.state !== 'clean') doc.state = 'dirty'; await this.protect();
  }
  async setView(view: View): Promise<void> {
    if (!['notes', 'search', 'graph', 'board', 'compendium', 'recent', 'favorites', 'settings'].includes(view)) throw new CampaignError('invalid_path', 'Vista non valida.');
    if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi le modifiche prima di cambiare vista.');
    this.state.ui.view = view; await this.persistUi();
  }
  async createBoard(title: string): Promise<void> {
    const repo = this.boardRepo ?? await BoardRepository.open(this.requiredRepo().root); this.boardRepo = repo;
    const board = await repo.create(title); this.state.boards = await repo.list(); this.state.activeBoard = board; this.state.boardState = 'saved'; this.state.boardError = undefined;
  }
  async openBoard(relativePath: string): Promise<void> {
    const board = await (this.boardRepo ?? (this.boardRepo = await BoardRepository.open(this.requiredRepo().root))).read(relativePath);
    this.state.activeBoard = board; this.state.boardState = 'saved'; this.state.boardError = undefined;
    const recovery = await this.store.readBoardRecovery(this.requiredRepo().metadata.campaignId);
    if (recovery?.relativePath === relativePath) { this.state.activeBoard = { ...recovery.board, relativePath, revision: board.revision }; this.state.boardState = 'dirty'; }
  }
  async renameBoard(title: string): Promise<void> {
    const active = this.state.activeBoard; if (!active) throw new CampaignError('not_found', 'Nessuna board aperta.');
    const board = await this.requiredBoardRepo().rename(active.relativePath, title); this.state.activeBoard = board; this.state.boards = await this.requiredBoardRepo().list(); this.state.boardState = 'saved';
  }
  async updateBoard(board: BoardDocument): Promise<void> {
    const active = this.state.activeBoard; if (!active || board.boardId !== active.boardId) throw new CampaignError('not_found', 'Nessuna board aperta.');
    this.state.activeBoard = { ...board, relativePath: active.relativePath, revision: active.revision }; this.state.boardState = 'dirty'; this.state.boardError = undefined;
    await this.store.putBoardRecovery(this.requiredRepo().metadata.campaignId, active.relativePath, board);
    if (this.boardSaveTimer) clearTimeout(this.boardSaveTimer);
    this.boardSaveTimer = setTimeout(() => { void this.run(() => this.saveBoard()).catch(() => undefined); }, 600); this.boardSaveTimer.unref();
  }
  async saveBoard(): Promise<void> {
    const active = this.state.activeBoard; if (!active || this.state.boardState === 'clean' || this.state.boardState === 'saved') return;
    this.state.boardState = 'saving'; this.onChange();
    try {
      const saved = await this.requiredBoardRepo().write(active.relativePath, active, active.revision);
      this.state.activeBoard = saved; this.state.boards = await this.requiredBoardRepo().list(); this.state.boardState = 'saved'; this.state.boardError = undefined; await this.store.removeBoardRecovery(this.requiredRepo().metadata.campaignId);
    } catch (error) {
      const failure = ioError(error); this.state.boardState = failure.code === 'conflict' ? 'conflict' : 'error'; this.state.boardError = failure.message;
    }
  }
  async importBoardAsset(source: string): Promise<string> { return this.requiredBoardRepo().importAsset(source); }
    async readBoardAsset(relativePath: string): Promise<string> { return this.requiredBoardRepo().readAsset(relativePath); }
  private requiredBoardRepo(): BoardRepository { if (!this.boardRepo) throw new CampaignError('not_found', 'Apri una campagna.'); return this.boardRepo; }
  async setUi(patch: Partial<UiState>): Promise<void> {
    const ui = this.state.ui;
    if (patch.selectedFolder !== undefined) { validateRelativePath(patch.selectedFolder, true); if (patch.selectedFolder && !this.state.entries.some(e => e.kind === 'folder' && e.id === patch.selectedFolder)) throw new CampaignError('not_found', 'Cartella non trovata.'); ui.selectedFolder = patch.selectedFolder; }
    if (patch.expandedFolders !== undefined) { if (!Array.isArray(patch.expandedFolders) || patch.expandedFolders.some(id => typeof id !== 'string')) throw new CampaignError('invalid_path', 'Cartelle non valide.'); ui.expandedFolders = patch.expandedFolders.filter(id => this.state.entries.some(e => e.kind === 'folder' && e.id === id)); }
    for (const key of ['sidebarWidth', 'inspectorWidth'] as const) if (patch[key] !== undefined) { if (typeof patch[key] !== 'number' || !Number.isFinite(patch[key])) throw new CampaignError('invalid_path', 'Larghezza non valida.'); ui[key] = Math.max(key === 'sidebarWidth' ? 200 : 240, Math.min(360, patch[key])); }
    for (const key of ['sidebarCollapsed', 'inspectorCollapsed'] as const) if (patch[key] !== undefined) { if (typeof patch[key] !== 'boolean') throw new CampaignError('invalid_path', 'Stato pannello non valido.'); ui[key] = patch[key]; }
    await this.persistUi();
  }
  async toggleFavorite(noteId: string): Promise<void> {
    if (!this.state.entries.some(e => e.kind === 'note' && e.id === noteId)) throw new CampaignError('not_found', 'Nota non trovata.');
    const list = this.state.ui.favorites; this.state.ui.favorites = list.includes(noteId) ? list.filter(id => id !== noteId) : [...list, noteId].sort(); await this.persistUi();
  }
  async activateTab(id: string): Promise<void> {
    if (!this.state.tabs.some(t => t.id === id)) throw new CampaignError('not_found', 'Tab non trovata.');
    if (id !== this.state.activeTabId && !(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi le modifiche prima di cambiare tab.');
    this.state.activeTabId = id; this.state.ui.view = 'notes'; this.state.ui.selectedFolder = ''; if (this.state.document && !this.state.document.draft) this.touchNote(this.state.document.noteId); await this.persistUi();
  }
  async closeTab(id: string, preserve = false): Promise<void> {
    const index = this.state.tabs.findIndex(t => t.id === id); if (index < 0) return;
    const original = this.state.activeTabId; this.state.activeTabId = id;
    try { if (!(await this.leaveCurrent(preserve))) throw new CampaignError('conflict', 'Questa tab contiene modifiche non salvate. Puoi restare o conservarne la bozza.'); }
    catch (error) { this.state.activeTabId = original; throw error; }
    this.state.tabs.splice(index, 1); this.state.activeTabId = original === id ? this.state.tabs[Math.min(index, this.state.tabs.length - 1)]?.id : original; await this.persistUi();
  }
  async navigateHistory(direction: -1 | 1): Promise<void> {
    const tab = this.activeTab(); if (!tab) return;
    const index = tab.historyIndex + direction; if (index < 0 || index >= tab.history.length) return;
    await this.openNote(tab.history[index], false, false); tab.historyIndex = index; await this.persistUi();
  }
  async reorderTab(id: string, index: number): Promise<void> {
    const previous = this.state.tabs.findIndex(t => t.id === id); if (previous < 0 || !Number.isInteger(index) || index < 0 || index >= this.state.tabs.length) throw new CampaignError('invalid_path', 'Posizione tab non valida.');
    const [tab] = this.state.tabs.splice(previous, 1); this.state.tabs.splice(index, 0, tab); await this.persistUi();
  }
  async createFolder(id: string): Promise<void> { await this.requiredRepo().createFolder(id); this.state.entries = await this.requiredRepo().discover(); this.state.ui.expandedFolders = [...new Set([...this.state.ui.expandedFolders, ...id.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))])]; this.state.ui.selectedFolder = id; await this.persistUi(); }
  async renameResource(id: string, title: string): Promise<void> {
    const entry = this.state.entries.find(e => e.id === id); if (!entry) throw new CampaignError('not_found', 'Elemento non trovato.');
    validateRelativePath(title); if (title.includes('/')) throw new CampaignError('invalid_path', 'Il nome non può contenere un percorso.');
    const name = entry.kind === 'note' ? title.replace(/\.md$/iu, '') + '.md' : title;
    const newId = [...id.split('/').slice(0, -1), name].join('/'); if (newId === id) return; await this.moveTo(id, newId);
  }
  async moveResource(id: string, parentFolder: string): Promise<void> { validateRelativePath(parentFolder, true); const target = [parentFolder, id.split('/').at(-1)!].filter(Boolean).join('/'); if (target === id) return; await this.moveTo(id, target); }
  private async moveTo(id: string, target: string): Promise<void> {
    if (!(await this.prepareLeave(false))) throw new CampaignError('conflict', 'Risolvi le modifiche prima di rinominare o spostare.');
    const pending = await this.store.listRecovery(this.requiredRepo().metadata.campaignId);
    if (pending.some(r => r.draft.target.kind === 'existing' && (r.draft.target.noteId === id || r.draft.target.noteId.startsWith(id + '/')))) throw new CampaignError('conflict', 'Recupera o scarta le bozze coinvolte prima dello spostamento.');
    const coordinator = new MoveCoordinator(this.requiredRepo(), this.store);
    let result;
    try { result = await coordinator.execute(id, target, () => this.remap(id, target)); }
    finally { this.state.repairs = await this.store.listMoveRepairs(this.requiredRepo().metadata.campaignId); }
    if (result.status === 'partial') this.state.warning = `Spostamento riuscito, collegamenti da completare: ${result.failedSources.map(f => f.noteId).join(', ')}. Usa Verifica e ripara.`;
    await this.refresh(); await this.persistUi();
  }
  private async remap(oldId: string, newId: string): Promise<void> {
    const map = (id: string) => remapPath(id, oldId, newId);
    for (const tab of this.state.tabs) { if (tab.document && !tab.document.draft) tab.document.noteId = map(tab.document.noteId); if (tab.document?.draft) tab.document.draft.parentFolder = map(tab.document.draft.parentFolder); tab.history = tab.history.map(map); }
    for (const key of ['favorites', 'recentNotes', 'expandedFolders'] as const) this.state.ui[key] = this.state.ui[key].map(map);
    this.state.ui.selectedFolder = map(this.state.ui.selectedFolder);
    this.state.ui.folderColors = Object.fromEntries(Object.entries(this.state.ui.folderColors).map(([key, value]) => [map(key), value]));
    await this.persistUi();
  }
  async retryRepair(id: string): Promise<void> {
    if (!(await this.prepareLeave(false))) throw new CampaignError('conflict', 'Risolvi prima le modifiche aperte.');
    const record = (await this.store.listMoveRepairs(this.requiredRepo().metadata.campaignId)).find(r => r.operationId === id); if (!record) throw new CampaignError('not_found', 'Operazione non trovata.');
    const result = await new MoveCoordinator(this.requiredRepo(), this.store).repair(record, () => this.remap(record.oldPath, record.newPath));
    this.state.repairs = await this.store.listMoveRepairs(this.requiredRepo().metadata.campaignId); this.state.warning = result.status === 'partial' ? `Restano collegamenti da riparare: ${result.failedSources.map(f => f.noteId).join(', ')}` : undefined; await this.refresh();
  }
  async trashResource(id: string, adapter: (target: string) => Promise<void>, confirmed = false): Promise<void> {
    const entry = this.state.entries.find(e => e.id === id); if (!entry) throw new CampaignError('not_found', 'Elemento non trovato.');
    if (entry.kind === 'folder' && !confirmed) throw new CampaignError('conflict', 'La cartella richiede conferma esplicita prima del cestino.');
    if (!(await this.prepareLeave(false))) throw new CampaignError('conflict', 'Risolvi le modifiche prima di cestinare.');
    const involved = (target: string) => target === id || target.startsWith(id + '/');
    if ((await this.store.listRecovery(this.requiredRepo().metadata.campaignId)).some(r => r.draft.target.kind === 'existing' && involved(r.draft.target.noteId))) throw new CampaignError('conflict', 'Recupera o scarta le bozze coinvolte prima del cestino.');
    await this.requiredRepo().trash(id, adapter);
    this.state.tabs = this.state.tabs.filter(t => !t.document || t.document.draft || !involved(t.document.noteId));
    for (const tab of this.state.tabs) { tab.history = tab.history.filter(n => !involved(n)); tab.historyIndex = Math.min(tab.historyIndex, tab.history.length - 1); }
    if (!this.activeTab()) this.state.activeTabId = this.state.tabs[0]?.id;
    for (const key of ['favorites', 'recentNotes', 'expandedFolders'] as const) this.state.ui[key] = this.state.ui[key].filter(n => !involved(n));
    if (involved(this.state.ui.selectedFolder)) this.state.ui.selectedFolder = '';
    await this.refresh(); await this.persistUi();
  }
  async closeCampaign(preserve = false): Promise<void> {
    if (!(await this.prepareLeave(preserve))) throw new CampaignError('conflict', 'La campagna contiene modifiche non salvate. Puoi conservarne la bozza prima di chiuderla.');
    this.watcher?.close(); if (this.timer) clearInterval(this.timer); if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    if (this.boardSaveTimer) clearTimeout(this.boardSaveTimer); this.repo = undefined; this.boardRepo = undefined; this.state.campaign = undefined; this.state.tabs = []; this.state.activeTabId = undefined; this.state.entries = []; this.state.boards = []; this.state.activeBoard = undefined; this.state.boardState = 'clean'; this.state.boardError = undefined; this.state.ui = defaultUi(); this.state.recoveries = []; this.state.repairs = []; this.state.rootMissing = false;
    this.state.preferences.lastPath = undefined; await this.store.writePreferences(this.state.preferences);
  }
  async linkDetails(): Promise<{ backlinks: string[]; warning?: string }> {
    const repo = this.requiredRepo(); const current = this.state.document;
    if (!current || current.draft) return { backlinks: [] };
    const ids = this.state.entries.filter(e => e.kind === 'note').map(e => e.id); const backlinks: string[] = []; let warning: string | undefined;
    for (const id of ids) {
      try {
        const open = this.state.tabs.find(t => t.document?.noteId === id)?.document;
        const markdown = open?.markdown ?? (await repo.readNote(id)).markdown;
        if (parseWikiLinks(markdown).some(link => { const result = resolveWikiLink(link.target, ids); return result.status === 'resolved' && result.candidates[0] === current.noteId; })) backlinks.push(id);
      } catch { warning = 'Alcune note non sono leggibili: i backlink possono essere incompleti.'; }
    }
    return { backlinks, warning };
  }
  async createLinkedNote(target: string): Promise<void> {
    if (!this.state.document) throw new CampaignError('not_found', 'Apri la nota sorgente.');
    if (!(await this.leaveCurrent())) throw new CampaignError('conflict', 'Risolvi prima le modifiche della nota sorgente.');
    const repo = this.requiredRepo(); this.state.entries = await repo.discover();
    const resolution = resolveWikiLink(target, this.state.entries.filter(e => e.kind === 'note').map(e => e.id));
    if (resolution.status !== 'missing') throw new CampaignError('collision', 'Il collegamento ora corrisponde a una nota esistente: selezionala.');
    const name = target.trim().replace(/\.md$/iu, '') + '.md';
    const id = target.includes('/') ? name : [...this.state.document.noteId.split('/').slice(0, -1), name].join('/');
    validateRelativePath(id);
    const folderParts = id.split('/').slice(0, -1);
    for (let i = 1; i <= folderParts.length; i++) {
      const folder = folderParts.slice(0, i).join('/');
      if (!this.state.entries.some(e => e.kind === 'folder' && e.id === folder)) await repo.createFolder(folder);
    }
    await repo.saveNote(id, '', null); await this.refresh(); await this.openNote(id);
  }
  async readImage(noteId: string, source: string): Promise<string> { return this.requiredRepo().readImage(noteId, source); }
  async rebuildSearch(): Promise<SearchDocument[]> {
    const repo = this.requiredRepo();
    const documents: SearchDocument[] = [];
    for (const entry of this.state.entries.filter(item => item.kind === 'note')) {
      try {
        const note = await repo.readNote(entry.id);
        const title = entry.id.split('/').at(-1)?.replace(/\.md$/iu, '') ?? entry.id;
        documents.push({
          noteId: entry.id,
          title,
          relativePath: entry.id,
          folderPath: entry.id.includes('/') ? entry.id.slice(0, entry.id.lastIndexOf('/')) : '',
          bodyText: normalizeMarkdownText(note.markdown),
          revision: note.revision,
        });
      } catch { /* Missing or unreadable notes stay out of the current index. */ }
    }
    this.state.ui.recentNotes = this.state.ui.recentNotes.filter(id => documents.some(doc => doc.noteId === id));
    return documents;
  }
  async searchNotes(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const documents = this.state.entries.some(entry => entry.kind === 'note') ? (await this.rebuildSearch()) : [];
    const target = normalizeSearchText(trimmed);
    const results: SearchResult[] = [];
    for (const document of documents) {
      const title = document.title;
      const titleNorm = normalizeSearchText(title);
      const pathNorm = normalizeSearchText(document.relativePath);
      const bodyNorm = normalizeSearchText(document.bodyText);
      let score = -1;
      let matchKind: SearchMatchKind = 'body';
      let snippet: string | undefined;
      if (titleNorm === target) { score = 1000; matchKind = 'title-exact'; }
      else if (titleNorm.startsWith(target)) { score = 900; matchKind = 'title-prefix'; }
      else if (titleNorm.includes(target)) { score = 800; matchKind = 'title-contains'; }
      else if (pathNorm === target || pathNorm.includes(target)) { score = 700; matchKind = 'path'; }
      else {
        const index = bodyNorm.indexOf(target);
        if (index < 0) continue;
        score = 200 + (bodyNorm.length - index);
        matchKind = 'body';
        const start = Math.max(0, index - 35);
        const end = Math.min(document.bodyText.length, index + 70);
        snippet = document.bodyText.slice(start, end).replace(/\s+/gu, ' ').trim();
      }
      if (score < 0) continue;
      results.push({ noteId: document.noteId, title, relativePath: document.relativePath, score, matchKind, snippet });
    }
    return results.sort((left, right) => right.score - left.score || normalizeSearchText(left.title).localeCompare(normalizeSearchText(right.title)) || left.relativePath.localeCompare(right.relativePath)).slice(0, 50);
  }
  async graphProjection(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const repo = this.requiredRepo();
    const ids = this.state.entries.filter(entry => entry.kind === 'note').map(entry => entry.id);
    const nodes: GraphNode[] = ids.map(noteId => ({ noteId }));
    const edges = new Map<string, GraphEdge>();
    for (const noteId of ids) {
      try {
        const markdown = this.state.document && this.state.document.noteId === noteId ? this.state.document.markdown : (await repo.readNote(noteId)).markdown;
        for (const link of parseWikiLinks(markdown)) {
          const resolution = resolveWikiLink(link.target, ids);
          if (resolution.status !== 'resolved' || !resolution.candidates[0]) continue;
          const target = resolution.candidates[0];
          if (target === noteId) continue;
          const key = `${noteId}::${target}`;
          const current = edges.get(key) ?? { source: noteId, target, occurrences: 0 };
          current.occurrences += 1;
          edges.set(key, current);
        }
      } catch { /* missing files do not break graph projection. */ }
    }
    return { nodes, edges: [...edges.values()].sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target)) };
  }
  async dispose(): Promise<void> { this.disposed = true; if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer); if (this.boardSaveTimer) clearTimeout(this.boardSaveTimer); this.watcher?.close(); if (this.timer) clearInterval(this.timer); await this.queue.catch(() => undefined); }
}







