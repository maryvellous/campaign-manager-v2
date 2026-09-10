import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-app-'));
  const root = path.join(dir, 'vault'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'Note.md'), 'original');
  const service = new CampaignService(new LocalStore(path.join(dir, 'local')));
  t.after(async () => { await service.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  await service.run(() => service.open(root)); return { root, dir, service };
}
test('edits are recovered outside vault and successful save clears equivalent recovery', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md'));
  await service.run(() => service.edit('local change'));
  assert.equal(service.state.document?.protected, true);
  assert.equal((await service.store.listRecovery(service.state.campaign!.campaignId))[0].draft.markdown, 'local change');
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'original');
  await service.run(() => service.save());
  assert.equal(service.state.document?.state, 'clean');
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'local change');
  assert.equal((await service.store.listRecovery(service.state.campaign!.campaignId)).length, 0);
});
test('external clean updates reload, dirty changes conflict and explicit revision is required', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md'));
  await fs.writeFile(path.join(root, 'Note.md'), 'external clean');
  await service.run(() => service.refresh());
  assert.equal(service.state.document?.markdown, 'external clean');
  await service.run(() => service.edit('local dirty'));
  await fs.writeFile(path.join(root, 'Note.md'), 'external dirty');
  await service.run(() => service.refresh());
  assert.equal(service.state.document?.state, 'conflict');
  assert.equal(service.state.document?.markdown, 'local dirty');
  await assert.rejects(service.run(() => service.resolve('local', 'stale')), { code: 'conflict' });
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'external dirty');
  const revision = service.state.document!.disk!.revision;
  await service.run(() => service.resolve('local', revision));
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'local dirty');
});
test('missing root preserves dirty buffer and identity-checked relink restores access', async t => {
  const { root, dir, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('protected'));
  const campaignId = service.state.campaign!.campaignId;
  const moved = path.join(dir, 'moved'); await fs.rename(root, moved);
  await service.run(() => service.refresh());
  assert.equal(service.state.rootMissing, true);
  assert.equal(service.state.document?.markdown, 'protected');
  await service.run(() => service.open(moved, false, false, true));
  assert.equal(service.state.campaign?.campaignId, campaignId);
  assert.equal(service.state.document?.markdown, 'protected');
  await service.run(() => service.save());
  assert.equal(await fs.readFile(path.join(moved, 'Note.md'), 'utf8'), 'protected');
});
test('copy detection only changes metadata after explicit independent-copy choice', async t => {
  const { root, dir, service } = await fixture(t);
  const id = service.state.campaign!.campaignId;
  const copy = path.join(dir, 'copy'); await fs.cp(root, copy, { recursive: true });
  await assert.rejects(service.run(() => service.open(copy)), { code: 'collision' });
  assert.equal(JSON.parse(await fs.readFile(path.join(copy, 'campaign.json'), 'utf8')).campaignId, id);
  await service.run(() => service.open(copy, true));
  assert.notEqual(service.state.campaign?.campaignId, id);
  assert.equal(await fs.readFile(path.join(copy, 'Note.md'), 'utf8'), 'original');
});
test('corrupt preferences do not prevent vault access', async t => {
  const { dir, root, service } = await fixture(t);
  await fs.writeFile(path.join(dir, 'local', 'preferences.json'), 'invalid');
  assert.deepEqual(await service.store.readPreferences(), { recent: [] });
  assert.ok(service.store.warning);
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'original');
});


test('recovery after restart handles unchanged, changed and missing original', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('recovered buffer'));
  const key = service.state.document!.recoveryKey!;
  const restored = new CampaignService(service.store);
  t.after(async () => { await restored.dispose(); });
  await restored.run(() => restored.initialize());
  await restored.run(() => restored.recovery(key, 'restore'));
  assert.equal(restored.state.document?.state, 'dirty');
  assert.equal(restored.state.document?.markdown, 'recovered buffer');
  await fs.writeFile(path.join(root, 'Note.md'), 'external');
  await restored.run(() => restored.refresh());
  assert.equal(restored.state.document?.state, 'conflict');
  assert.equal(restored.state.document?.markdown, 'recovered buffer');
  await fs.unlink(path.join(root, 'Note.md'));
  await restored.run(() => restored.refresh());
  assert.equal(restored.state.document?.state, 'missing');
  assert.equal(await restored.run(() => restored.prepareLeave()), false);
  assert.equal(await restored.run(() => restored.prepareLeave(true)), true);
  await restored.run(() => restored.saveAs('Recovered.md'));
  assert.equal(await fs.readFile(path.join(root, 'Recovered.md'), 'utf8'), 'recovered buffer');
  await restored.dispose();
});
test('unwritable recovery prevents closing or switching with an unsaved buffer', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('local buffer'));
  await fs.writeFile(path.join(root, 'Note.md'), 'external');
  await service.run(() => service.refresh());
  t.mock.method(service.store, 'putRecovery', async () => { throw new Error('storage unavailable'); });
  await assert.rejects(service.run(() => service.prepareLeave(true)));
  assert.equal(service.state.document?.markdown, 'local buffer');
  assert.equal(service.state.document?.protected, false);
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'external');
});


test('failed authoritative save leaves error state and a recoverable buffer', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('recover me'));
  const realOpen = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).includes('.cmv2-save-')) throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    return realOpen(...args);
  });
  await service.run(() => service.save());
  assert.equal(service.state.document?.state, 'error');
  assert.equal(service.state.document?.protected, true);
  assert.equal(service.state.document?.markdown, 'recover me');
  assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'original');
  assert.equal((await service.store.listRecovery(service.state.campaign!.campaignId))[0].draft.markdown, 'recover me');
});
test('new draft recovery stays outside vault and can be restored without creating a file', async t => {
  const { root, service } = await fixture(t);
  const key = await service.store.putRecovery({ campaignId: service.state.campaign!.campaignId, target: { kind: 'new-draft', draftId: 'draft-one', parentFolder: '', manualTitle: 'Nuova' }, markdown: 'Bozza importante', capturedAt: new Date().toISOString() });
  await service.run(() => service.recovery(key, 'restore'));
  assert.equal(service.state.document?.markdown, 'Bozza importante');
  await assert.rejects(fs.stat(path.join(root, 'Nuova.md')), { code: 'ENOENT' });
  assert.equal((await service.store.listRecovery(service.state.campaign!.campaignId)).length, 1);
});

test('ordinary opening cannot overwrite an unresolved recovery from a previous run', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('irreplaceable old recovery'));
  const key = service.state.document!.recoveryKey!;
  const fresh = new CampaignService(service.store);
  try {
    await fresh.run(() => fresh.initialize());
    await assert.rejects(fresh.run(() => fresh.openNote('Note.md')), { code: 'conflict' });
    assert.equal(Boolean(fresh.state.document), false);
    assert.equal((await service.store.listRecovery(fresh.state.campaign!.campaignId)).find(item => item.key === key)?.draft.markdown, 'irreplaceable old recovery');
    assert.equal(await fs.readFile(path.join(root, 'Note.md'), 'utf8'), 'original');
    await fresh.run(() => fresh.recovery(key, 'restore'));
    assert.equal(fresh.state.document?.markdown, 'irreplaceable old recovery');
  } finally { await fresh.dispose(); }
});


test('save-as refuses a target that has another unresolved recovery', async t => {
  const { root, service } = await fixture(t);
  await service.run(() => service.openNote('Note.md')); await service.run(() => service.edit('current buffer'));
  const key = await service.store.putRecovery({ campaignId: service.state.campaign!.campaignId, target: { kind: 'existing', noteId: 'Other.md', baseRevision: 'old' }, markdown: 'older irreplaceable buffer', capturedAt: new Date().toISOString() });
  await assert.rejects(service.run(() => service.saveAs('Other.md')), { code: 'conflict' });
  await assert.rejects(fs.stat(path.join(root, 'Other.md')), { code: 'ENOENT' });
  assert.equal((await service.store.listRecovery(service.state.campaign!.campaignId)).find(item => item.key === key)?.draft.markdown, 'older irreplaceable buffer');
  assert.equal(service.state.document?.markdown, 'current buffer');
});
