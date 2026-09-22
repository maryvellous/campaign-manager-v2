import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BoardService } from '../apps/desktop/application/board-service';
import { projectPreparedBoardForPlayers } from '../apps/desktop/application/board-privacy';
import { parseBoardDocument, type BoardDocument } from '../apps/desktop/application/board-types';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-card-'));
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-card-local-'));
  const campaignId = randomUUID();
  await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1, campaignId }, null, 2));
  const store = new LocalStore(local);
  const service = new BoardService(store);
  service.bind({ root, campaignId });
  return {
    root,
    local,
    campaignId,
    store,
    service,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(local, { recursive: true, force: true });
    }
  };
}

test('whole-note cards never copy source Markdown while excerpts snapshot only explicit text', async () => {
  const testFixture = await fixture();
  try {
    await fs.writeFile(path.join(testFixture.root, 'Secrets.md'), '# Segreti\n\nTOP SECRET WHOLE NOTE\n');
    const created = await testFixture.service.create('Scena');
    await testFixture.service.addCard(created.snapshot.path, 'Secrets.md');
    await testFixture.service.addCard(created.snapshot.path, 'Secrets.md', 'Indizio scelto dal master');

    const raw = await fs.readFile(path.join(testFixture.root, created.snapshot.path), 'utf8');
    assert.equal(raw.includes('TOP SECRET WHOLE NOTE'), false);
    assert.equal(raw.includes('Indizio scelto dal master'), true);

    const opened = await testFixture.service.open(created.snapshot.path);
    const cards = opened.snapshot.document.elements.filter(element => element.type === 'card');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].type === 'card' && cards[0].cardKind, 'note');
    assert.equal(cards[0].type === 'card' && cards[0].excerpt, undefined);
    assert.equal(cards[1].type === 'card' && cards[1].cardKind, 'excerpt');
    assert.equal(cards[1].type === 'card' && cards[1].excerpt, 'Indizio scelto dal master');

    await fs.unlink(path.join(testFixture.root, 'Secrets.md'));
    const missingSource = await testFixture.service.open(created.snapshot.path);
    assert.equal(missingSource.snapshot.document.elements.filter(element => element.type === 'card').length, 2);
  } finally { await testFixture.cleanup(); }
});

test('player projection excludes private elements and strips NoteId and board-only metadata', () => {
  const publicText = randomUUID();
  const publicCard = randomUUID();
  const privateText = randomUUID();
  const privateCard = randomUUID();
  const document = parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 30, y: -10, zoom: 1.25 },
    elements: [
      { type: 'text', elementId: publicText, text: 'PUBBLICO', x: 0, y: 0, width: 120, height: 80, z: 1, locked: true, visibleByDefault: true, groupId: randomUUID() },
      { type: 'text', elementId: privateText, text: 'PRIVATE_TEXT', x: 200, y: 0, width: 120, height: 80, z: 2, locked: false, visibleByDefault: false },
      { type: 'card', cardKind: 'excerpt', elementId: publicCard, sourceNoteId: 'Segreti.md', sourceTitle: 'Segreti', excerpt: 'PUBLIC_EXCERPT', x: 0, y: 150, width: 260, height: 160, z: 3, locked: false, visibleByDefault: true },
      { type: 'card', cardKind: 'excerpt', elementId: privateCard, sourceNoteId: 'Privata.md', sourceTitle: 'Privata', excerpt: 'PRIVATE_EXCERPT', x: 300, y: 150, width: 260, height: 160, z: 4, locked: false, visibleByDefault: false },
      { type: 'link', elementId: randomUUID(), from: { kind: 'element', elementId: publicText }, to: { kind: 'element', elementId: publicCard }, arrow: 'end', z: 5, locked: false, visibleByDefault: true },
      { type: 'link', elementId: randomUUID(), from: { kind: 'element', elementId: publicText }, to: { kind: 'element', elementId: privateText }, arrow: 'end', z: 6, locked: false, visibleByDefault: true }
    ]
  }) as BoardDocument;

  const projection = projectPreparedBoardForPlayers(document);
  const serialized = JSON.stringify(projection);
  assert.equal(projection.elements.length, 3);
  assert.equal(serialized.includes('PRIVATE_TEXT'), false);
  assert.equal(serialized.includes('PRIVATE_EXCERPT'), false);
  assert.equal(serialized.includes('Segreti.md'), false);
  assert.equal(serialized.includes('Privata.md'), false);
  assert.equal(serialized.includes('sourceNoteId'), false);
  assert.equal(serialized.includes('visibleByDefault'), false);
  assert.equal(serialized.includes('groupId'), false);
  assert.equal(serialized.includes('"locked"'), false);
  assert.equal(serialized.includes('PUBLIC_EXCERPT'), true);
  assert.equal(serialized.includes('PUBBLICO'), true);
});

test('note rename remaps card references in authoritative board and matching recovery', async () => {
  const testFixture = await fixture();
  try {
    const created = await testFixture.service.create('Riferimenti');
    const added = await testFixture.service.addCard(created.snapshot.path, 'Lore/Old.md', 'Estratto persistente');
    const recoveryDocument: BoardDocument = {
      ...added.snapshot.document,
      camera: { x: 90, y: 20, zoom: 1 }
    };
    await testFixture.service.protect(added.snapshot.path, added.snapshot.revision, recoveryDocument);

    await testFixture.service.remapNoteReferences('Lore/Old.md', 'Archive/New.md');

    const opened = await testFixture.service.open(added.snapshot.path);
    const card = opened.snapshot.document.elements.find(element => element.type === 'card');
    assert.ok(card && card.type === 'card');
    assert.equal(card.sourceNoteId, 'Archive/New.md');
    assert.equal(card.sourceTitle, 'New');
    assert.equal(card.excerpt, 'Estratto persistente');

    const recoveries = (await testFixture.service.list()).recoveries;
    assert.equal(recoveries.length, 1);
    const recoveryCard = recoveries[0].draft.document.elements.find(element => element.type === 'card');
    assert.ok(recoveryCard && recoveryCard.type === 'card');
    assert.equal(recoveryCard.sourceNoteId, 'Archive/New.md');
    assert.equal(recoveryCard.sourceTitle, 'New');
    assert.equal(recoveries[0].draft.baseRevision, opened.snapshot.revision);
  } finally { await testFixture.cleanup(); }
});

test('folder move remaps every card source below that folder', async () => {
  const testFixture = await fixture();
  try {
    const created = await testFixture.service.create('Cartelle');
    const first = await testFixture.service.addCard(created.snapshot.path, 'Lore/A.md');
    await testFixture.service.addCard(first.snapshot.path, 'Lore/Sub/B.md');
    await testFixture.service.remapNoteReferences('Lore', 'Archivio/Lore');

    const opened = await testFixture.service.open(created.snapshot.path);
    const sources = opened.snapshot.document.elements
      .filter(element => element.type === 'card')
      .map(element => element.type === 'card' ? element.sourceNoteId : '')
      .sort();
    assert.deepEqual(sources, ['Archivio/Lore/A.md', 'Archivio/Lore/Sub/B.md']);
  } finally { await testFixture.cleanup(); }
});

test('card parser rejects accidental Markdown payload on a whole-note card', () => {
  assert.throws(() => parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [{
      type: 'card',
      cardKind: 'note',
      elementId: randomUUID(),
      sourceNoteId: 'Privata.md',
      sourceTitle: 'Privata',
      excerpt: 'questo non deve esserci',
      x: 0, y: 0, width: 200, height: 100, z: 1, locked: false
    }]
  }), /non deve incorporare il Markdown/u);
});
