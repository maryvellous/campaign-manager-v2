import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { AiContextError, prepareAiContext } from '../apps/desktop/application/ai-context';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-ret-'));
  const root = path.join(dir, 'vault');
  await fs.mkdir(path.join(root, 'NPC'), { recursive: true });
  await fs.mkdir(path.join(root, 'Luoghi'), { recursive: true });
  await fs.writeFile(path.join(root, 'NPC', 'Kaldrim.md'), '# Kaldrim\nKaldrim collabora con Vorax nel tempio.', 'utf8');
  await fs.writeFile(path.join(root, 'Luoghi', 'Mercato.md'), '# Mercato\nBancarelle, tessuti e spezie. Informazione privata irrilevante.', 'utf8');
  const service = new CampaignService(new LocalStore(path.join(dir, 'local')));
  t.after(async () => { await service.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  await service.run(() => service.open(root));
  return { dir, root, service };
}

test('campaign retrieval reads only lexically relevant authoritative notes and reports those exact sources', async t => {
  const { service } = await fixture(t);
  const context = await prepareAiContext(service, 'Che rapporto c’è tra Kaldrim e Vorax?', { kind: 'campaign' });
  assert.equal(context.label, 'Campagna intera');
  assert.deepEqual(context.sources.map(source => source.noteId), ['NPC/Kaldrim.md']);
  assert.match(context.text, /Kaldrim collabora con Vorax/u);
  assert.doesNotMatch(context.text, /Informazione privata irrilevante/u);
});

test('campaign retrieval does not automatically send a dirty editor buffer', async t => {
  const { service } = await fixture(t);
  await service.run(() => service.openNote('NPC/Kaldrim.md'));
  await service.run(() => service.edit('# Kaldrim\nBOZZA SEGRETA NON SALVATA. Kaldrim collabora con Vorax.'));
  const context = await prepareAiContext(service, 'Kaldrim Vorax', { kind: 'campaign' });
  assert.match(context.text, /Kaldrim collabora con Vorax nel tempio/u);
  assert.doesNotMatch(context.text, /BOZZA SEGRETA NON SALVATA/u);
});

test('explicit note context may use the current editor buffer because the user selected that note', async t => {
  const { service } = await fixture(t);
  await service.run(() => service.openNote('NPC/Kaldrim.md'));
  await service.run(() => service.edit('# Kaldrim\nVersione corrente scelta esplicitamente.'));
  const context = await prepareAiContext(service, 'Riassumi', { kind: 'note', noteId: 'NPC/Kaldrim.md' });
  assert.match(context.text, /Versione corrente scelta esplicitamente/u);
  assert.deepEqual(context.sources.map(source => source.noteId), ['NPC/Kaldrim.md']);
});

test('selection context sends only selected text while keeping its real note as source', async t => {
  const { service } = await fixture(t);
  const context = await prepareAiContext(service, 'Spiegami questo', {
    kind: 'selection',
    noteId: 'Luoghi/Mercato.md',
    selection: 'Bancarelle, tessuti e spezie.',
  });
  assert.match(context.text, /Bancarelle, tessuti e spezie/u);
  assert.doesNotMatch(context.text, /Informazione privata irrilevante/u);
  assert.deepEqual(context.sources.map(source => source.noteId), ['Luoghi/Mercato.md']);
});

test('missing source and oversized explicit context fail before a provider request can be made', async t => {
  const { root, service } = await fixture(t);
  await assert.rejects(
    prepareAiContext(service, 'Riassumi', { kind: 'note', noteId: 'NPC/Inesistente.md' }),
    (error: unknown) => error instanceof AiContextError && error.code === 'source_missing'
  );

  const huge = '# Gigante\n' + 'x'.repeat(61_000);
  await fs.writeFile(path.join(root, 'Gigante.md'), huge, 'utf8');
  await service.run(() => service.refresh());
  await assert.rejects(
    prepareAiContext(service, 'Riassumi', { kind: 'note', noteId: 'Gigante.md' }),
    (error: unknown) => error instanceof AiContextError && error.code === 'context_too_large'
  );
});

test('campaign retrieval with no match sends no vault source instead of inventing one', async t => {
  const { service } = await fixture(t);
  const context = await prepareAiContext(service, 'xyzzynothingmatches', { kind: 'campaign' });
  assert.deepEqual(context.sources, []);
  assert.equal(context.text, '');
});
