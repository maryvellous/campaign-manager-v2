import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CampaignRepository } from '../apps/desktop/infrastructure/campaign-repository';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('opening only adds minimal metadata, reopening preserves identity and note bytes', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'Città.md'), '---\nunknown: keep\n---\n# Città\r\n');
  const before = await fs.readFile(path.join(root, 'Città.md'));
  const repo = await CampaignRepository.open(root);
  assert.deepEqual(Object.keys(repo.metadata).sort(), ['campaignId', 'schemaVersion']);
  assert.deepEqual((await fs.readdir(root)).sort(), ['Città.md', 'campaign.json']);
  assert.equal((await CampaignRepository.open(root)).metadata.campaignId, repo.metadata.campaignId);
  assert.deepEqual(await fs.readFile(path.join(root, 'Città.md')), before);
});
test('save creates real UTF8 files, rejects stale revision and never recreates a missing note', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  const first = await repo.saveNote('Meradyl.md', 'La città', null);
  assert.equal(await fs.readFile(path.join(repo.root, first.noteId), 'utf8'), 'La città');
  const updated = await repo.saveNote(first.noteId, 'Nuova città', first.revision);
  assert.notEqual(updated.revision, first.revision);
  await assert.rejects(repo.saveNote(first.noteId, 'stale', first.revision), { code: 'conflict' });
  assert.equal((await repo.readNote(first.noteId)).markdown, 'Nuova città');
  await fs.unlink(path.join(repo.root, first.noteId));
  await assert.rejects(repo.saveNote(first.noteId, 'recreate', updated.revision), { code: 'not_found' });
  await assert.rejects(fs.stat(path.join(repo.root, first.noteId)), { code: 'ENOENT' });
});
test('parallel saves from the same revision cannot silently replace one another', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  const note = await repo.saveNote('A.md', 'base', null);
  const results = await Promise.allSettled([repo.saveNote('A.md', 'one', note.revision), repo.saveNote('A.md', 'two', note.revision)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});
test('invalid and future metadata are never overwritten', async t => {
  const root = await fixture(t);
  for (const content of ['broken JSON', '{"schemaVersion":2,"campaignId":"future"}']) {
    await fs.writeFile(path.join(root, 'campaign.json'), content);
    await assert.rejects(CampaignRepository.open(root));
    assert.equal(await fs.readFile(path.join(root, 'campaign.json'), 'utf8'), content);
  }
});
test('discovery handles 200 notes / 15 folders and ignores internal files', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  for (let i = 0; i < 15; i++) await fs.mkdir(path.join(repo.root, `Folder ${i}`));
  for (let i = 0; i < 200; i++) await fs.writeFile(path.join(repo.root, `Folder ${i % 15}`, `Note ${i}.md`), `# ${i}`);
  await fs.mkdir(path.join(repo.root, '.git'));
  await fs.writeFile(path.join(repo.root, '.git', 'hidden.md'), 'hidden');
  await fs.writeFile(path.join(repo.root, '.cmv2-temp.md'), 'temp');
  const entries = await repo.discover();
  assert.equal(entries.filter(e => e.kind === 'folder').length, 15);
  assert.equal(entries.filter(e => e.kind === 'note').length, 200);
  assert.deepEqual(entries.slice(0, 3).map(e => e.id), ['Folder 0', 'Folder 0/Note 0.md', 'Folder 0/Note 15.md']);
});
test('trash failure preserves file and root replacement suspends writes', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  const note = await repo.saveNote('A.md', 'keep', null);
  await assert.rejects(repo.trash('A.md', async () => { throw new Error('unavailable'); }), { code: 'trash_unavailable' });
  assert.equal((await repo.readNote('A.md')).markdown, 'keep');
  await fs.unlink(path.join(repo.root, 'campaign.json'));
  await assert.rejects(repo.saveNote('A.md', 'wrong root', note.revision), { code: 'not_found' });
  assert.equal(await fs.readFile(path.join(repo.root, 'A.md'), 'utf8'), 'keep');
});


test('disk-full failure before replace preserves original and removes temporary files', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  const note = await repo.saveNote('A.md', 'original', null);
  const realOpen = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).includes('.cmv2-save-')) throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    return realOpen(...args);
  });
  await assert.rejects(repo.saveNote('A.md', 'lost?', note.revision), { code: 'disk_full' });
  assert.equal(await fs.readFile(path.join(repo.root, 'A.md'), 'utf8'), 'original');
  assert.deepEqual((await fs.readdir(repo.root)).sort(), ['A.md', 'campaign.json']);
});
test('external write during temporary save is detected before replacement', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  const note = await repo.saveNote('A.md', 'original', null);
  const realOpen = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).includes('.cmv2-save-')) await fs.writeFile(path.join(repo.root, 'A.md'), 'external');
    return realOpen(...args);
  });
  await assert.rejects(repo.saveNote('A.md', 'local', note.revision), { code: 'conflict' });
  assert.equal(await fs.readFile(path.join(repo.root, 'A.md'), 'utf8'), 'external');
});
test('junctions cannot be read, saved or trashed through the vault', async t => {
  const root = await fixture(t); const outside = await fixture(t);
  await fs.writeFile(path.join(outside, 'Secret.md'), 'private');
  const repo = await CampaignRepository.open(root);
  await fs.symlink(outside, path.join(root, 'Linked'), 'junction');
  assert.equal((await repo.discover()).length, 0);
  await assert.rejects(repo.readNote('Linked/Secret.md'), { code: 'outside_campaign_root' });
  await assert.rejects(repo.saveNote('Linked/New.md', 'bad', null), { code: 'outside_campaign_root' });
  let called = false;
  await assert.rejects(repo.trash('Linked', async () => { called = true; }), { code: 'outside_campaign_root' });
  assert.equal(called, false);
  assert.equal(await fs.readFile(path.join(outside, 'Secret.md'), 'utf8'), 'private');
});
test('case collisions and invalid UTF8 are rejected without modifying bytes', async t => {
  const repo = await CampaignRepository.open(await fixture(t));
  await repo.saveNote('A.md', 'keep', null);
  await assert.rejects(repo.saveNote('a.md', 'collision', null), { code: 'case_collision' });
  await fs.writeFile(path.join(repo.root, 'Invalid.md'), Buffer.from([0xff, 0xfe]));
  await assert.rejects(repo.readNote('Invalid.md'), { code: 'encoding_error' });
  assert.deepEqual(await fs.readFile(path.join(repo.root, 'Invalid.md')), Buffer.from([0xff, 0xfe]));
});

test('unwritable folder is blocked before initialization and leaves existing notes untouched', async t => {
  const root = await fixture(t); await fs.writeFile(path.join(root, 'A.md'), 'keep');
  const realOpen = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).includes('.cmv2-probe-')) throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
    return realOpen(...args);
  });
  await assert.rejects(CampaignRepository.open(root), { code: 'permission_denied' });
  assert.deepEqual(await fs.readdir(root), ['A.md']);
  assert.equal(await fs.readFile(path.join(root, 'A.md'), 'utf8'), 'keep');
});
