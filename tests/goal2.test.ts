import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import { MoveCoordinator } from '../apps/desktop/application/move-coordinator';
import { CampaignRepository } from '../apps/desktop/infrastructure/campaign-repository';
import { draftTitle } from '../apps/desktop/application/workspace-types';
async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-goal2-')); const root = path.join(dir, 'vault'); await fs.mkdir(root);
  const store = new LocalStore(path.join(dir, 'local')); const service = new CampaignService(store);
  await service.run(() => service.open(root));
  t.after(async () => { await service.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, root, store, service };
}
test('draft titles use up to three visible words without leading Markdown markers', () => {
  assert.equal(draftTitle('# La città perduta\nresto'), 'La città perduta');
  assert.equal(draftTitle('**Lady Maya**'), 'Lady Maya');
  assert.equal(draftTitle('Meradyl'), 'Meradyl');
  assert.equal(draftTitle('# ** ~~ ---'), '');
});
test('empty and marker-only drafts produce neither a file nor recovery when abandoned', async t => {
  const { root, store, service } = await fixture(t);
  await service.run(() => service.newNote()); assert.equal(service.state.entries.length, 0);
  await service.run(() => service.edit(' # ** ~~ --- \n'));
  assert.equal((await store.listRecovery(service.state.campaign!.campaignId)).length, 0);
  await service.run(() => service.closeTab(service.state.activeTabId!));
  assert.deepEqual(await fs.readdir(root), ['campaign.json']); assert.equal(service.state.tabs.length, 0);
});
test('one-word draft materializes on explicit save in selected folder and title stays fixed', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.createFolder('Luoghi')); await service.run(() => service.newNote());
  await service.run(() => service.edit('Meradyl')); await assert.rejects(fs.stat(path.join(root, 'Luoghi', 'Meradyl.md')), { code: 'ENOENT' });
  await service.run(() => service.save()); assert.equal(service.state.document?.noteId, 'Luoghi/Meradyl.md');
  await service.run(() => service.edit('Una città completamente diversa')); await service.run(() => service.save());
  assert.equal(service.state.document?.noteId, 'Luoghi/Meradyl.md');
  assert.equal(await fs.readFile(path.join(root, 'Luoghi', 'Meradyl.md'), 'utf8'), 'Una città completamente diversa');
});
test('three-word draft materializes through normal idle save', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.newNote()); await service.run(() => service.edit('# La città perduta '));
  await new Promise(resolve => setTimeout(resolve, 850)); await service.run(async () => undefined);
  assert.equal(await fs.readFile(path.join(root, 'La città perduta.md'), 'utf8'), '# La città perduta ');
});
test('title collision keeps draft intact until explicit inline correction', async t => {
  const { root, service } = await fixture(t); await fs.writeFile(path.join(root, 'Meradyl.md'), 'original');
  await service.run(() => service.refresh()); await service.run(() => service.newNote()); await service.run(() => service.edit('Meradyl'));
  await service.run(() => service.save()); assert.ok(service.state.document?.draft); assert.equal(service.state.document?.markdown, 'Meradyl'); assert.equal(service.state.document?.state, 'error');
  assert.equal(await fs.readFile(path.join(root, 'Meradyl.md'), 'utf8'), 'original');
  await service.run(() => service.setDraftTitle('Seconda città')); await service.run(() => service.save());
  assert.equal(await fs.readFile(path.join(root, 'Seconda città.md'), 'utf8'), 'Meradyl');
  assert.equal((await fs.readdir(root)).some(name => name.includes('(2)')), false);
});
test('ordinary navigation reuses tab, explicit new tab activates existing note and history is preserved', async t => {
  const { root, service } = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'a'); await fs.writeFile(path.join(root, 'B.md'), 'b');
  await service.run(() => service.openNote('A.md')); const first = service.state.activeTabId!;
  await service.run(() => service.openNote('B.md')); assert.equal(service.state.tabs.length, 1);
  await service.run(() => service.navigateHistory(-1)); assert.equal(service.state.document?.noteId, 'A.md');
  await service.run(() => service.navigateHistory(1)); assert.equal(service.state.document?.noteId, 'B.md');
  await service.run(() => service.openNote('A.md', true)); assert.equal(service.state.tabs.length, 2);
  await service.run(() => service.openNote('B.md', true)); assert.equal(service.state.activeTabId, first); assert.equal(service.state.tabs.length, 2);
  await service.run(() => service.closeTab(first)); assert.equal(service.state.document?.noteId, 'A.md');
});
test('switching view materializes short drafts and preserves active tabs', async t => {
  const { root, service } = await fixture(t); await service.run(() => service.newNote()); await service.run(() => service.edit('Lady Maya'));
  await service.run(() => service.setView('compendium')); assert.equal(await fs.readFile(path.join(root, 'Lady Maya.md'), 'utf8'), 'Lady Maya');
  const tab = service.state.activeTabId; await service.run(() => service.setView('notes')); assert.equal(service.state.activeTabId, tab); assert.equal(service.state.document?.markdown, 'Lady Maya');
});
test('folder move remaps tabs, favorites and resolved links, leaving code and ambiguity unchanged', async t => {
  const { root, service } = await fixture(t); await service.run(() => service.createFolder('Luoghi'));
  await fs.writeFile(path.join(root, 'Luoghi', 'Meradyl.md'), '# Meradyl'); await fs.writeFile(path.join(root, 'Indice.md'), '[[Luoghi/Meradyl]] [[Meradyl]] `[[Luoghi/Meradyl]]` \\[[Luoghi/Meradyl]]');
  await service.run(() => service.refresh()); await service.run(() => service.openNote('Luoghi/Meradyl.md')); await service.run(() => service.toggleFavorite('Luoghi/Meradyl.md'));
  await service.run(() => service.renameResource('Luoghi', 'Città'));
  assert.equal(service.state.document?.noteId, 'Città/Meradyl.md'); assert.deepEqual(service.state.ui.favorites, ['Città/Meradyl.md']);
  assert.equal(await fs.readFile(path.join(root, 'Indice.md'), 'utf8'), '[[Città/Meradyl]] [[Meradyl]] `[[Luoghi/Meradyl]]` \\[[Luoghi/Meradyl]]');
  assert.equal(service.state.repairs.length, 0);
});
test('move collisions and self-descendant folders are rejected, case-only rename works', async t => {
  const { root, service } = await fixture(t); await service.run(() => service.createFolder('Folder')); await service.run(() => service.createFolder('Other'));
  await assert.rejects(service.run(() => service.renameResource('Folder', 'Other')), { code: 'collision' });
  await assert.rejects(service.run(() => service.moveResource('Folder', 'Folder')), { code: 'invalid_path' });
  await service.run(() => service.renameResource('Folder', 'folder'));
  assert.ok((await fs.readdir(root)).includes('folder')); assert.equal((await fs.readdir(root)).includes('Folder'), false);
});
test('interrupted physical move can finish its concrete link repairs without overwriting changed sources', async t => {
  const { root, store } = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'a'); await fs.writeFile(path.join(root, 'Source.md'), '[[A]]');
  const repo = await CampaignRepository.open(root); const coordinator = new MoveCoordinator(repo, store);
  await assert.rejects(coordinator.execute('A.md', 'B.md', async () => { throw new Error('crash after physical move'); }));
  const records = await store.listMoveRepairs(repo.metadata.campaignId); assert.equal(records.length, 1);
  await fs.writeFile(path.join(root, 'Source.md'), 'external [[A]]');
  const result = await coordinator.repair(records[0], async () => undefined);
  assert.equal(result.status, 'success'); assert.equal(await fs.readFile(path.join(root, 'Source.md'), 'utf8'), 'external [[B]]');
  assert.equal((await store.listMoveRepairs(repo.metadata.campaignId)).length, 0);
});
test('local favorites, recents, panel sizes and tab state reopen by campaign identity', async t => {
  const { root, store, service } = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'a'); await service.run(() => service.refresh());
  await service.run(() => service.openNote('A.md')); await service.run(() => service.toggleFavorite('A.md')); await service.run(() => service.setUi({ sidebarWidth: 310, inspectorCollapsed: true }));
  await service.run(() => service.prepareLeave()); const fresh = new CampaignService(store);
  try { await fresh.run(() => fresh.initialize()); assert.equal(fresh.state.document?.noteId, 'A.md'); assert.deepEqual(fresh.state.ui.favorites, ['A.md']); assert.equal(fresh.state.ui.sidebarWidth, 310); assert.equal(fresh.state.ui.inspectorCollapsed, true); assert.equal(fresh.state.ui.recentNotes[0], 'A.md'); } finally { await fresh.dispose(); }
});
test('nonempty folder trash requires confirmation, flushes files and removes favorites and tabs', async t => {
  const { root, service } = await fixture(t); await service.run(() => service.createFolder('Folder')); await fs.writeFile(path.join(root, 'Folder', 'A.md'), 'a');
  await service.run(() => service.refresh()); await service.run(() => service.openNote('Folder/A.md')); await service.run(() => service.toggleFavorite('Folder/A.md')); await service.run(() => service.edit('changed'));
  let called = false; const adapter = async (target: string) => { called = true; assert.equal(await fs.readFile(path.join(target, 'A.md'), 'utf8'), 'changed'); await fs.rename(target, path.join(root, 'TestTrash')); };
  await assert.rejects(service.run(() => service.trashResource('Folder', adapter)), { code: 'conflict' }); assert.equal(called, false);
  await service.run(() => service.trashResource('Folder', adapter, true)); assert.equal(called, true); assert.deepEqual(service.state.ui.favorites, []); assert.equal(service.state.tabs.length, 0);
});


test('case-only rename interrupted between the two filesystem steps can be repaired', async t => {
  const { root, store } = await fixture(t); await fs.writeFile(path.join(root, 'Name.md'), 'name');
  const repo = await CampaignRepository.open(root); const identity = (await repo.entryIdentity('Name.md'))!;
  const operationId = '12345678-1234-4234-8234-123456789abc';
  await fs.rename(path.join(root, 'Name.md'), path.join(root, '.cmv2-move-' + operationId));
  const record = { operationId, campaignId: repo.metadata.campaignId, oldPath: 'Name.md', newPath: 'name.md', identity, startedAt: new Date().toISOString(), changes: [] };
  await store.putMoveRepair(record);
  assert.equal((await new MoveCoordinator(repo, store).repair(record, async () => undefined)).status, 'success');
  assert.ok((await fs.readdir(root)).includes('name.md'));
});

test('partial link update preserves external edits and explicit repair finishes against current content', async t => {
  const { root, store } = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'a'); await fs.writeFile(path.join(root, 'Source.md'), '[[A]]');
  const repo = await CampaignRepository.open(root); const coordinator = new MoveCoordinator(repo, store);
  const result = await coordinator.execute('A.md', 'B.md', async () => { await fs.writeFile(path.join(root, 'Source.md'), 'external [[A]]'); });
  assert.equal(result.status, 'partial'); assert.equal(await fs.readFile(path.join(root, 'Source.md'), 'utf8'), 'external [[A]]');
  const [record] = await store.listMoveRepairs(repo.metadata.campaignId);
  assert.equal((await coordinator.repair(record, async () => undefined)).status, 'success');
  assert.equal(await fs.readFile(path.join(root, 'Source.md'), 'utf8'), 'external [[B]]');
});

test('rename leaves opaque frontmatter, fenced code, unresolved and ambiguous references untouched', async t => {
  const { root, service } = await fixture(t);
  await fs.mkdir(path.join(root, 'Other')); await fs.writeFile(path.join(root, 'A.md'), 'a'); await fs.writeFile(path.join(root, 'Other', 'A.md'), 'other');
  const content = '---\nopaque: "[[A]]"\n---\n[[A]] [[Missing]] [[Other/A]]\n```md\n[[Other/A]]\n```still-code\n[[Other/A]]\n```\n';
  await fs.writeFile(path.join(root, 'Source.md'), content); await service.run(() => service.refresh());
  await service.run(() => service.renameResource('Other/A.md', 'B'));
  assert.equal(await fs.readFile(path.join(root, 'Source.md'), 'utf8'), content.replace('[[A]] [[Missing]] [[Other/A]]', '[[A]] [[Missing]] [[Other/B]]'));
});

test('restoring a recovery already open keeps the unique tab and its current buffer', async t => {
  const { root, service } = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'a');
  await service.run(() => service.openNote('A.md')); await service.run(() => service.edit('current buffer'));
  const key = service.state.document!.recoveryKey!; const tab = service.state.activeTabId;
  await service.run(() => service.recovery(key, 'restore'));
  assert.equal(service.state.tabs.length, 1); assert.equal(service.state.activeTabId, tab);
  assert.equal(service.state.document?.markdown, 'current buffer');
});
