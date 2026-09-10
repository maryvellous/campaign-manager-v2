import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-goal4-'));
  const root = path.join(dir, 'vault');
  await fs.mkdir(root);
  const service = new CampaignService(new LocalStore(path.join(dir, 'local')));
  await service.run(() => service.open(root));
  t.after(async () => {
    await service.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { dir, root, service };
}

test('full-text search ranks exact title and path matches above body hits and can rebuild safely', async t => {
  const { root, service } = await fixture(t);
  await fs.mkdir(path.join(root, 'Lore'), { recursive: true });
  await fs.writeFile(path.join(root, 'Lore', 'Library.md'), '# Library\n\nThe city of Meradyl is hidden beneath the tombs.');
  await fs.writeFile(path.join(root, 'Lore', 'Meradyl.md'), 'The city of Meradyl is a place of tombs.');
  await fs.writeFile(path.join(root, 'Camp.md'), 'The city of Meradyl is hidden in the marshes.');
  await service.run(() => service.refresh());

  const results = await service.run(() => service.searchNotes('Meradyl'));
  assert.equal(results[0]?.noteId, 'Lore/Meradyl.md');
  assert.equal(results[0]?.matchKind, 'title-exact');
  assert.equal(results[1]?.noteId, 'Lore/Library.md');
  assert.ok(results.some(result => result.noteId === 'Camp.md'));

  await service.run(() => service.rebuildSearch());
  const rebuilt = await service.run(() => service.searchNotes('Meradyl'));
  assert.deepEqual(rebuilt.map(result => result.noteId), results.map(result => result.noteId));
});

test('graph projection derives nodes from notes and edges only from resolved wikilinks', async t => {
  const { root, service } = await fixture(t);
  await fs.mkdir(path.join(root, 'Places'), { recursive: true });
  await fs.writeFile(path.join(root, 'Places', 'Meradyl.md'), '[[City]] [[Missing]] [[City]]');
  await fs.writeFile(path.join(root, 'City.md'), 'A city.');
  await fs.writeFile(path.join(root, 'Root.md'), 'No links.');
  await service.run(() => service.refresh());

  const graph = await service.run(() => service.graphProjection());
  assert.ok(graph.nodes.some(node => node.noteId === 'City.md'));
  assert.ok(graph.nodes.some(node => node.noteId === 'Root.md'));
  assert.deepEqual(graph.edges.find(edge => edge.source === 'Places/Meradyl.md' && edge.target === 'City.md')?.occurrences ?? 0, 2);
  assert.equal(graph.edges.some(edge => edge.target === 'Missing.md'), false);
});
