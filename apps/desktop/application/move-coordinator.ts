import { randomUUID } from 'node:crypto';
import { parseWikiLinks, resolveWikiLink } from '../../../packages/core/src/markdown';
import { CampaignRepository, ioError } from '../infrastructure/campaign-repository';
import { CampaignError } from '../../../packages/core/src/index';
export interface MoveRepairRecord { operationId: string; campaignId: string; oldPath: string; newPath: string; startedAt: string; identity: string; changes: { noteId: string; revision: string; markdown: string }[] }
export interface RepairStore { putMoveRepair(record: MoveRepairRecord): Promise<void>; listMoveRepairs(campaignId: string): Promise<MoveRepairRecord[]>; removeMoveRepair(campaignId: string, id: string): Promise<void> }
export interface MoveResult { status: 'success' | 'partial'; oldId: string; newId: string; failedSources: { noteId: string; reason: string }[] }
export const remapPath = (id: string, oldPath: string, newPath: string) => id === oldPath || id.startsWith(oldPath + '/') ? newPath + id.slice(oldPath.length) : id;
function rewrite(markdown: string, ids: string[], oldPath: string, newPath: string): string {
  const replacements: { start: number; end: number; value: string }[] = [];
  for (const link of parseWikiLinks(markdown)) {
    const raw = link.target;
    const { candidates, status } = resolveWikiLink(raw, ids);
    if (status !== 'resolved') continue;
    const oldId = candidates[0]; const mapped = remapPath(oldId, oldPath, newPath);
    if (mapped === oldId) continue;
    let target = raw.includes('/') ? mapped.slice(0, -3) : mapped.split('/').at(-1)!.slice(0, -3);
    if (!raw.includes('/') && ids.map(id => remapPath(id, oldPath, newPath)).filter(id => id.split('/').at(-1)!.slice(0, -3).toLowerCase() === target.toLowerCase()).length > 1) target = mapped.slice(0, -3);
    if (/\.md$/iu.test(raw)) target += '.md';
    if (raw === target) continue;
    replacements.push({ start: link.start, end: link.end, value: `[[${target}]]` });
  }
  for (const change of replacements.reverse()) markdown = markdown.slice(0, change.start) + change.value + markdown.slice(change.end);
  return markdown;
}
export class MoveCoordinator {
  constructor(readonly repo: CampaignRepository, readonly store: RepairStore) {}
  async execute(oldPath: string, newPath: string, remap: () => Promise<void>): Promise<MoveResult> {
    await this.repo.validateMove(oldPath, newPath);
    const identity = await this.repo.entryIdentity(oldPath); if (!identity) throw new CampaignError('not_found', 'Elemento non trovato.');
    const ids = (await this.repo.discover()).filter(e => e.kind === 'note').map(e => e.id);
    const changes: MoveRepairRecord['changes'] = [];
    for (const id of ids) { const note = await this.repo.readNote(id); const markdown = rewrite(note.markdown, ids, oldPath, newPath); if (markdown !== note.markdown) changes.push({ noteId: id, revision: note.revision, markdown }); }
    for (const change of changes) if ((await this.repo.readNote(change.noteId)).revision !== change.revision) throw new CampaignError('conflict', 'Una nota collegata è cambiata. Riprova dopo aver risolto il conflitto.');
    const record: MoveRepairRecord = { operationId: randomUUID(), campaignId: this.repo.metadata.campaignId, oldPath, newPath, identity, startedAt: new Date().toISOString(), changes };
    await this.store.putMoveRepair(record);
    await this.repo.move(oldPath, newPath);
    await remap();
    return this.complete(record);
  }
  async repair(record: MoveRepairRecord, remap: () => Promise<void>): Promise<MoveResult> {
    const oldIdentity = await this.repo.entryIdentity(record.oldPath); const newIdentity = await this.repo.entryIdentity(record.newPath);
    if (oldIdentity === record.identity && newIdentity === null) { await this.repo.move(record.oldPath, record.newPath); }
    else if (oldIdentity === null && newIdentity === null && record.oldPath.toLowerCase() === record.newPath.toLowerCase()) { await this.repo.repairCaseRename(record.oldPath, record.newPath, record.identity); }
    else if (newIdentity !== record.identity || oldIdentity !== null) throw new CampaignError('conflict', 'I percorsi sono cambiati dopo l’interruzione. Nessuna modifica automatica eseguita.');
    // Rebuild the concrete repair against current content; never replay stale Markdown.
    const currentIds = (await this.repo.discover()).filter(e => e.kind === 'note').map(e => e.id);
    const priorIds = currentIds.map(id => remapPath(id, record.newPath, record.oldPath));
    record.changes = [];
    for (const id of currentIds) {
      const current = await this.repo.readNote(id);
      const markdown = rewrite(current.markdown, priorIds, record.oldPath, record.newPath);
      if (markdown !== current.markdown) record.changes.push({ noteId: remapPath(id, record.newPath, record.oldPath), revision: current.revision, markdown });
    }
    await this.store.putMoveRepair(record);
    await remap(); return this.complete(record);
  }
  private async complete(record: MoveRepairRecord): Promise<MoveResult> {
    const failedSources: MoveResult['failedSources'] = [];
    for (const change of record.changes) {
      const id = remapPath(change.noteId, record.oldPath, record.newPath);
      try { const current = await this.repo.readNote(id); if (current.markdown === change.markdown) continue; await this.repo.saveNote(id, change.markdown, change.revision); }
      catch (error) { failedSources.push({ noteId: id, reason: ioError(error).message }); }
    }
    if (!failedSources.length) await this.store.removeMoveRepair(record.campaignId, record.operationId);
    return { status: failedSources.length ? 'partial' : 'success', oldId: record.oldPath, newId: record.newPath, failedSources };
  }
}

