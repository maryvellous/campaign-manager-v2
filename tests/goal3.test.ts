import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import { externalUrl } from '../packages/core/src/safe-url';
async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-goal3-')); const root = path.join(dir, 'vault'); await fs.mkdir(root);
  const service = new CampaignService(new LocalStore(path.join(dir, 'local'))); await service.run(() => service.open(root));
  t.after(async () => { await service.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, root, service };
}
test('explicit missing link creation uses source folder or qualified root path, preserves source and refuses collisions', async t => {
  const { root, service } = await fixture(t); await fs.mkdir(path.join(root, 'Lore')); await fs.writeFile(path.join(root, 'Lore', 'Source.md'), '[[New]] [[World/Places/New]]');
  await service.run(() => service.openNote('Lore/Source.md')); await service.run(() => service.edit('source [[New]]'));
  await service.run(() => service.createLinkedNote('New'));
  assert.equal(service.state.document?.noteId, 'Lore/New.md'); assert.equal(await fs.readFile(path.join(root, 'Lore', 'Source.md'), 'utf8'), 'source [[New]]');
  await service.run(() => service.openNote('Lore/Source.md')); await service.run(() => service.createLinkedNote('World/Places/New.md'));
  assert.equal(service.state.document?.noteId, 'World/Places/New.md');
  await assert.rejects(service.run(() => service.createLinkedNote('World/Places/New')), { code: 'collision' });
  await assert.rejects(service.run(() => service.createLinkedNote('../Outside')), { code: 'invalid_path' });
  await assert.rejects(service.run(() => service.createLinkedNote('Safe/CON')), { code: 'invalid_path' });
  await assert.rejects(fs.stat(path.join(root, 'Safe')), { code: 'ENOENT' });
});
test('backlinks include only uniquely resolved links, refresh external content and remap after rename', async t => {
  const { root, service } = await fixture(t); await fs.mkdir(path.join(root, 'Other'));
  await fs.writeFile(path.join(root, 'Target.md'), 'target'); await fs.writeFile(path.join(root, 'Other', 'Target.md'), 'other');
  await fs.writeFile(path.join(root, 'Source.md'), '[[Target]] [[Other/Target]] `[[Target]]` [[Missing]]');
  await service.run(() => service.refresh()); await service.run(() => service.openNote('Target.md'));
  assert.deepEqual((await service.run(() => service.linkDetails())).backlinks, []);
  await service.run(() => service.openNote('Other/Target.md')); assert.deepEqual((await service.run(() => service.linkDetails())).backlinks, ['Source.md']);
  await service.run(() => service.renameResource('Other/Target.md', 'Renamed')); assert.deepEqual((await service.run(() => service.linkDetails())).backlinks, ['Source.md']);
  await fs.writeFile(path.join(root, 'Source.md'), 'no links'); await service.run(() => service.refresh());
  assert.deepEqual((await service.run(() => service.linkDetails())).backlinks, []);
});
test('image adapter permits verified local raster bytes and rejects remote, traversal, symlink and disguised content', async t => {
  const { root, dir, service } = await fixture(t);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(path.join(root, 'Image.png'), png); await fs.writeFile(path.join(root, 'Fake.png'), '<script>alert(1)</script>');
  assert.match(await service.readImage('Source.md', 'Image.png'), /^data:image\/png;base64,/);
  for (const source of ['https://example.com/a.png', '../outside.png', '%2e%2e/outside.png', 'C:/a.png', '/a.png', 'Fake.png', 'image.svg']) await assert.rejects(service.readImage('Source.md', source));
  await fs.mkdir(path.join(dir, 'outside')); await fs.writeFile(path.join(dir, 'outside', 'Image.png'), png);
  await fs.symlink(path.join(dir, 'outside'), path.join(root, 'Junction'), 'junction');
  await assert.rejects(service.readImage('Source.md', 'Junction/Image.png'), { code: 'outside_campaign_root' });
});
test('external OS links use only explicit http/https/mailto schemes', () => {
  assert.equal(externalUrl('https://example.com/path'), 'https://example.com/path'); assert.equal(externalUrl('mailto:user@example.com'), 'mailto:user@example.com');
  for (const input of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,hi', 'shell:AppsFolder', '//example.com', 'https://user:pass@example.com', 'https://example.com/\n']) assert.throws(() => externalUrl(input));
});
test('autosave preserves opaque frontmatter and a conflicting external file with both versions available', async t => {
  const { root, service } = await fixture(t); const initial = '---\r\nunknown: [invalid yaml\r\n---\r\n# Original';
  await fs.writeFile(path.join(root, 'A.md'), initial); await service.run(() => service.openNote('A.md'));
  await service.run(() => service.edit(initial + '\r\nLocal text')); await fs.writeFile(path.join(root, 'A.md'), 'external');
  await new Promise(resolve => setTimeout(resolve, 800)); await service.run(() => service.refresh());
  assert.equal(await fs.readFile(path.join(root, 'A.md'), 'utf8'), 'external'); assert.equal(service.state.document?.state, 'conflict');
  assert.equal(service.state.document?.markdown, initial + '\r\nLocal text'); assert.equal(service.state.document?.disk?.markdown, 'external');
  await service.run(() => service.saveAs('Local.md')); assert.equal(await fs.readFile(path.join(root, 'Local.md'), 'utf8'), initial + '\r\nLocal text');
});
