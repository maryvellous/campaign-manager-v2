import { defaultUi, type UiState, type SavedTabs } from '../application/workspace-types';
import type { MoveRepairRecord } from '../application/move-coordinator';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { CampaignError, type RecoveryDraft } from '../../../packages/core/src/index';
import { ioError } from './campaign-repository';
import { parseBoardDocument, validateBoardPath, type BoardRecoveryDraft } from '../application/board-types';
import { DEFAULT_OPENAI_MODEL, OPENAI_MODELS, type AiThread, type OpenAiModel } from '../../../packages/ai/src/index';
export interface RecentCampaign { campaignId: string; path: string; name: string }
export interface Preferences { recent: RecentCampaign[]; lastPath?: string }
export interface AiPreferences { provider: 'openai'; model: OpenAiModel; encryptedKey?: string; privacyAccepted: boolean }
export class LocalStore {
  warning?: string;
  constructor(readonly root: string) {}
  private async write(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temp, 'wx');
      try { await handle.writeFile(JSON.stringify(value, null, 2), 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temp, file);
    } catch (error) { throw ioError(error); }
    finally { await fs.unlink(temp).catch(() => undefined); }
  }
  async readPreferences(): Promise<Preferences> {
    try {
      const value: unknown = JSON.parse(await fs.readFile(path.join(this.root, 'preferences.json'), 'utf8'));
      if (!value || typeof value !== 'object' || !Array.isArray((value as Preferences).recent)) throw new Error('Invalid preferences');
      const prefs = value as Preferences;
      if (prefs.recent.some(r => !r || typeof r.campaignId !== 'string' || typeof r.path !== 'string' || typeof r.name !== 'string') || (prefs.lastPath !== undefined && typeof prefs.lastPath !== 'string')) throw new Error('Invalid preferences');
      return prefs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warning = 'Le preferenze locali non sono leggibili: uso le impostazioni iniziali. Le note sono intatte.';
      return { recent: [] };
    }
  }
  async writePreferences(preferences: Preferences): Promise<void> { await this.write(path.join(this.root, 'preferences.json'), preferences); }
  private recoveryDirectory(campaignId: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(campaignId)) throw new CampaignError('invalid_path', 'Identità recovery non valida.');
    return path.join(this.root, 'campaigns', campaignId, 'recovery');
  }
  async readUi(campaignId: string): Promise<{ ui: UiState; workspace: SavedTabs }> {
    const result = { ui: defaultUi(), workspace: { tabs: [] } as SavedTabs };
    try {
      const value = JSON.parse(await fs.readFile(path.join(this.recoveryDirectory(campaignId), '..', 'ui.json'), 'utf8'));
      if (!value || !value.ui || !value.workspace || !Array.isArray(value.workspace.tabs)) throw new Error('Invalid UI');
      for (const key of ['favorites', 'recentNotes', 'expandedFolders'] as const) if (Array.isArray(value.ui[key]) && value.ui[key].every((v: unknown) => typeof v === 'string')) result.ui[key] = value.ui[key];
      if (['notes', 'search', 'graph', 'boards', 'live', 'assistant', 'compendium', 'recent', 'favorites', 'settings'].includes(value.ui.view)) result.ui.view = value.ui.view;
      if (typeof value.ui.selectedFolder === 'string') result.ui.selectedFolder = value.ui.selectedFolder;
      for (const key of ['sidebarCollapsed', 'inspectorCollapsed'] as const) if (typeof value.ui[key] === 'boolean') result.ui[key] = value.ui[key];
      for (const key of ['sidebarWidth', 'inspectorWidth'] as const) if (typeof value.ui[key] === 'number' && Number.isFinite(value.ui[key])) result.ui[key] = Math.max(key === 'sidebarWidth' ? 200 : 240, Math.min(360, value.ui[key]));
      result.workspace.tabs = value.workspace.tabs.filter((tab: SavedTabs['tabs'][number]) => tab && typeof tab.id === 'string' && typeof tab.noteId === 'string' && Array.isArray(tab.history) && tab.history.every(id => typeof id === 'string') && Number.isInteger(tab.historyIndex));
      if (typeof value.workspace.activeTabId === 'string') result.workspace.activeTabId = value.workspace.activeTabId;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warning = 'Preferenze della campagna non leggibili: disposizione iniziale ripristinata.'; }
    return result;
  }
  async writeUi(campaignId: string, ui: UiState, workspace: SavedTabs): Promise<void> { await this.write(path.join(this.recoveryDirectory(campaignId), '..', 'ui.json'), { ui, workspace }); }
  async putMoveRepair(record: MoveRepairRecord): Promise<void> {
    if (!/^[0-9a-f-]{36}$/iu.test(record.operationId)) throw new CampaignError('invalid_path', 'Operazione non valida.');
    await this.write(path.join(this.recoveryDirectory(record.campaignId), '..', 'repairs', `${record.operationId}.json`), record);
  }
  async listMoveRepairs(campaignId: string): Promise<MoveRepairRecord[]> {
    const directory = path.join(this.recoveryDirectory(campaignId), '..', 'repairs');
    let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: MoveRepairRecord[] = [];
    for (const name of names.filter(n => /^[0-9a-f-]{36}\.json$/iu.test(n))) {
      try { const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as MoveRepairRecord; if (record.campaignId !== campaignId || record.operationId + '.json' !== name || typeof record.oldPath !== 'string' || typeof record.newPath !== 'string' || typeof record.identity !== 'string' || !Array.isArray(record.changes) || record.changes.some(c => typeof c.noteId !== 'string' || typeof c.revision !== 'string' || typeof c.markdown !== 'string')) throw new Error('Invalid repair'); result.push(record); }
      catch { this.warning = 'Un record di riparazione non è leggibile ed è stato conservato.'; }
    }
    return result;
  }
  async removeMoveRepair(campaignId: string, id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/iu.test(id)) throw new CampaignError('invalid_path', 'Operazione non valida.');
    await fs.unlink(path.join(this.recoveryDirectory(campaignId), '..', 'repairs', `${id}.json`));
  }
  recoveryKey(draft: RecoveryDraft): string {
    return createHash('sha256').update(draft.target.kind === 'existing' ? draft.target.noteId : draft.target.draftId).digest('hex');
  }
  async putRecovery(draft: RecoveryDraft): Promise<string> {
    const key = this.recoveryKey(draft);
    await this.write(path.join(this.recoveryDirectory(draft.campaignId), `${key}.json`), draft); return key;
  }
  async listRecovery(campaignId: string): Promise<Array<{ key: string; draft: RecoveryDraft }>> {
    const directory = this.recoveryDirectory(campaignId);
    let names: string[];
    try { names = await fs.readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw ioError(error); }
    const result: Array<{ key: string; draft: RecoveryDraft }> = [];
    for (const name of names.filter(name => /^[0-9a-f]{64}\.json$/u.test(name))) {
      try {
        const draft = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as RecoveryDraft;
        if (draft.campaignId !== campaignId || typeof draft.markdown !== 'string' || typeof draft.capturedAt !== 'string' || !draft.target || !['existing', 'new-draft'].includes(draft.target.kind) || this.recoveryKey(draft) !== name.slice(0, -5)) throw new Error('Invalid recovery');
        result.push({ key: name.slice(0, -5), draft });
      } catch { this.warning = 'Una bozza di recupero non è leggibile ed è stata conservata per il recupero manuale.'; }
    }
    return result;
  }
  async removeRecovery(campaignId: string, key: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/u.test(key)) throw new CampaignError('invalid_path', 'Bozza non valida.');
    await fs.unlink(path.join(this.recoveryDirectory(campaignId), `${key}.json`)).catch(error => { if (error.code !== 'ENOENT') throw ioError(error); });
  }

  private boardRecoveryDirectory(campaignId: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(campaignId)) throw new CampaignError('invalid_path', 'Identità recovery board non valida.');
    return path.join(this.root, 'campaigns', campaignId, 'board-recovery');
  }
  boardRecoveryKey(boardPath: string): string {
    validateBoardPath(boardPath);
    return createHash('sha256').update(boardPath.toLowerCase()).digest('hex');
  }
  async putBoardRecovery(draft: BoardRecoveryDraft): Promise<string> {
    const key = this.boardRecoveryKey(draft.boardPath);
    await this.write(path.join(this.boardRecoveryDirectory(draft.campaignId), `${key}.json`), draft);
    return key;
  }
  async listBoardRecovery(campaignId: string): Promise<Array<{ key: string; draft: BoardRecoveryDraft }>> {
    const directory = this.boardRecoveryDirectory(campaignId);
    let names: string[];
    try { names = await fs.readdir(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw ioError(error); }
    const result: Array<{ key: string; draft: BoardRecoveryDraft }> = [];
    for (const name of names.filter(name => /^[0-9a-f]{64}\.json$/u.test(name))) {
      try {
        const draft = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as BoardRecoveryDraft;
        if (draft.campaignId !== campaignId || typeof draft.boardPath !== 'string' || typeof draft.baseRevision !== 'string' || typeof draft.capturedAt !== 'string') throw new Error('Invalid board recovery');
        validateBoardPath(draft.boardPath);
        draft.document = parseBoardDocument(draft.document);
        if (this.boardRecoveryKey(draft.boardPath) !== name.slice(0, -5)) throw new Error('Invalid board recovery key');
        result.push({ key: name.slice(0, -5), draft });
      } catch {
        this.warning = 'Una recovery board non è leggibile ed è stata conservata per il recupero manuale.';
      }
    }
    return result;
  }
  async removeBoardRecovery(campaignId: string, boardPath: string): Promise<void> {
    const key = this.boardRecoveryKey(boardPath);
    await fs.unlink(path.join(this.boardRecoveryDirectory(campaignId), `${key}.json`)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw ioError(error);
    });
  }

  async readAiPreferences(): Promise<AiPreferences> {
    const fallback: AiPreferences = { provider: 'openai', model: DEFAULT_OPENAI_MODEL, privacyAccepted: false };
    try {
      const value: unknown = JSON.parse(await fs.readFile(path.join(this.root, 'ai', 'preferences.json'), 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid AI preferences');
      const input = value as Partial<AiPreferences>;
      if (input.provider !== 'openai' || typeof input.model !== 'string' || !OPENAI_MODELS.includes(input.model as OpenAiModel)) throw new Error('Invalid AI provider');
      if (input.encryptedKey !== undefined && typeof input.encryptedKey !== 'string') throw new Error('Invalid AI credential');
      if (typeof input.privacyAccepted !== 'boolean') throw new Error('Invalid AI privacy state');
      return { provider: 'openai', model: input.model as OpenAiModel, ...(input.encryptedKey ? { encryptedKey: input.encryptedKey } : {}), privacyAccepted: input.privacyAccepted };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warning = 'Le impostazioni IA locali non sono leggibili: il provider resta disattivato. La campagna è intatta.';
      return fallback;
    }
  }

  async writeAiPreferences(preferences: AiPreferences): Promise<void> {
    if (preferences.provider !== 'openai' || !OPENAI_MODELS.includes(preferences.model)) throw new CampaignError('invalid_path', 'Impostazioni IA non valide.');
    if (preferences.encryptedKey !== undefined && typeof preferences.encryptedKey !== 'string') throw new CampaignError('invalid_path', 'Credenziale IA non valida.');
    await this.write(path.join(this.root, 'ai', 'preferences.json'), preferences);
  }

  private aiThreadFile(campaignId: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(campaignId)) throw new CampaignError('invalid_path', 'Identità conversazione IA non valida.');
    return path.join(this.root, 'campaigns', campaignId, 'ai', 'thread.json');
  }

  async readAiThread(campaignId: string): Promise<AiThread> {
    try {
      const value: unknown = JSON.parse(await fs.readFile(this.aiThreadFile(campaignId), 'utf8'));
      if (!value || typeof value !== 'object' || !Array.isArray((value as AiThread).messages)) throw new Error('Invalid AI thread');
      const messages = (value as AiThread).messages;
      if (messages.some(message => !message || typeof message.id !== 'string' || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || typeof message.createdAt !== 'string')) throw new Error('Invalid AI message');
      return { messages: messages.slice(-100) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warning = 'La conversazione IA locale non è leggibile ed è stata ignorata. Le note sono intatte.';
      return { messages: [] };
    }
  }

  async writeAiThread(campaignId: string, thread: AiThread): Promise<void> {
    if (!Array.isArray(thread.messages) || thread.messages.some(message => !message || typeof message.id !== 'string' || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || typeof message.createdAt !== 'string')) throw new CampaignError('invalid_path', 'Conversazione IA non valida.');
    await this.write(this.aiThreadFile(campaignId), { messages: thread.messages.slice(-100) });
  }

  async clearAiThread(campaignId: string): Promise<void> {
    await fs.unlink(this.aiThreadFile(campaignId)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw ioError(error);
    });
  }

}

