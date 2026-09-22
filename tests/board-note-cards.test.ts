import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { preparedPublicSnapshot } from '../apps/desktop/application/board-privacy';
import {
  parseBoardDocument,
  type BoardExcerptCardElement,
  type BoardLinkElement,
  type BoardNoteCardElement,
  type BoardTextElement
} from '../apps/desktop/application/board-types';
import { BoardRepository } from '../apps/desktop/infrastructure/board-repository';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-notes-'));
  const root = path.join(dir, 'vault');
  await fs.mkdir(path.join(root, 'Lore'), { recursive: true });
  await fs.writeFile(path.join(root, 'Lore', 'Old.md'), '# Vecchia nota\nPRIVATE SECRET\nTesto selezionato v1');
  const store = new LocalStore(path.join(dir, 'local'));
  const service = new CampaignService(store);
  await service.run(() => service.open(root));
  const campaignId = service.state.campaign!.campaignId;
  const boards = new BoardRepository(root, campaignId);
  t.after(async () => { await service.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, root, store, service, campaignId, boards };
}

test('old board elements normalize to private-ready visibility', () => {
  const elementId = randomUUID();
  const board = parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [{ type: 'text', elementId, text: 'Privato', x: 1, y: 2, width: 120, height: 60, z: 1, locked: false }]
  });
  assert.equal(board.elements[0].visibleByDefault, false);
});

test('linked note card stores reference and title without duplicating note Markdown', async t => {
  const { root, boards } = await fixture(t);
  const created = await boards.createBoard('Indizi');
  const card: BoardNoteCardElement = {
    type: 'note-card',
    elementId: randomUUID(),
    sourceNoteId: 'Lore/Old.md',
    title: 'Old',
    x: 20, y: 30, width: 280, height: 110, z: 1,
    locked: false,
    visibleByDefault: false
  };
  await boards.saveBoard(created.path, { ...created.document, elements: [card] }, created.revision);
  const raw = await fs.readFile(path.join(root, created.path), 'utf8');
  assert.match(raw, /Lore\/Old\.md/u);
  assert.match(raw, /"title": "Old"/u);
  assert.equal(raw.includes('PRIVATE SECRET'), false);
  assert.equal(raw.includes('# Vecchia nota'), false);
});

test('excerpt card is a snapshot and survives later private source edits unchanged', async t => {
  const { root, boards } = await fixture(t);
  const created = await boards.createBoard('Estratti');
  const excerpt: BoardExcerptCardElement = {
    type: 'excerpt-card',
    elementId: randomUUID(),
    sourceNoteId: 'Lore/Old.md',
    sourceTitle: 'Old',
    excerpt: 'Testo selezionato v1',
    x: 40, y: 60, width: 280, height: 170, z: 1,
    locked: false,
    visibleByDefault: false
  };
  const saved = await boards.saveBoard(created.path, { ...created.document, elements: [excerpt] }, created.revision);
  await fs.writeFile(path.join(root, 'Lore', 'Old.md'), '# Vecchia nota\nNUOVO SEGRETO PRIVATO\nTesto selezionato v2');
  const reopened = await boards.readBoard(saved.path);
  const card = reopened.document.elements[0];
  assert.equal(card.type, 'excerpt-card');
  if (card.type !== 'excerpt-card') throw new Error('Expected excerpt card');
  assert.equal(card.excerpt, 'Testo selezionato v1');
  assert.equal(JSON.stringify(reopened.document).includes('NUOVO SEGRETO PRIVATO'), false);
});

test('Campaign Manager rename and move repair board sources and aligned board recovery', async t => {
  const { root, store, service, campaignId, boards } = await fixture(t);
  const created = await boards.createBoard('Fonti');
  const noteCard: BoardNoteCardElement = {
    type: 'note-card', elementId: randomUUID(), sourceNoteId: 'Lore/Old.md', title: 'Old',
    x: 10, y: 10, width: 280, height: 110, z: 1, locked: false, visibleByDefault: false
  };
  const excerptCard: BoardExcerptCardElement = {
    type: 'excerpt-card', elementId: randomUUID(), sourceNoteId: 'Lore/Old.md', sourceTitle: 'Old', excerpt: 'bozza locale',
    x: 20, y: 160, width: 280, height: 170, z: 2, locked: false, visibleByDefault: false
  };
  const saved = await boards.saveBoard(created.path, { ...created.document, elements: [noteCard, excerptCard] }, created.revision);
  await store.putBoardRecovery({
    campaignId,
    boardPath: saved.path,
    baseRevision: saved.revision,
    document: { ...saved.document, elements: saved.document.elements.map(element => element.type === 'excerpt-card' ? { ...element, excerpt: 'modifica dirty protetta' } : element) },
    capturedAt: new Date().toISOString()
  });

  await service.run(() => service.renameResource('Lore/Old.md', 'New'));
  let disk = await boards.readBoard(saved.path);
  assert.deepEqual(disk.document.elements.filter(element => element.type === 'note-card' || element.type === 'excerpt-card').map(element => element.sourceNoteId), ['Lore/New.md', 'Lore/New.md']);
  assert.equal((disk.document.elements[0] as BoardNoteCardElement).title, 'New');
  let recovery = (await store.listBoardRecovery(campaignId))[0].draft;
  assert.equal(recovery.baseRevision, disk.revision);
  assert.equal((recovery.document.elements[1] as BoardExcerptCardElement).sourceNoteId, 'Lore/New.md');
  assert.equal((recovery.document.elements[1] as BoardExcerptCardElement).excerpt, 'modifica dirty protetta');

  await service.run(() => service.createFolder('Archive'));
  await service.run(() => service.moveResource('Lore/New.md', 'Archive'));
  disk = await boards.readBoard(saved.path);
  assert.deepEqual(disk.document.elements.filter(element => element.type === 'note-card' || element.type === 'excerpt-card').map(element => element.sourceNoteId), ['Archive/New.md', 'Archive/New.md']);
  recovery = (await store.listBoardRecovery(campaignId))[0].draft;
  assert.equal(recovery.baseRevision, disk.revision);
  assert.equal((recovery.document.elements[0] as BoardNoteCardElement).sourceNoteId, 'Archive/New.md');
  assert.equal(await fs.readFile(path.join(root, 'Archive', 'New.md'), 'utf8'), '# Vecchia nota\nPRIVATE SECRET\nTesto selezionato v1');
});

test('missing note source never destroys linked or excerpt cards', async t => {
  const { root, boards } = await fixture(t);
  const created = await boards.createBoard('Missing');
  const elements = [
    {
      type: 'note-card' as const, elementId: randomUUID(), sourceNoteId: 'Lore/Old.md', title: 'Old',
      x: 0, y: 0, width: 280, height: 110, z: 1, locked: false, visibleByDefault: false
    },
    {
      type: 'excerpt-card' as const, elementId: randomUUID(), sourceNoteId: 'Lore/Old.md', sourceTitle: 'Old', excerpt: 'snapshot',
      x: 0, y: 140, width: 280, height: 170, z: 2, locked: false, visibleByDefault: false
    }
  ];
  const saved = await boards.saveBoard(created.path, { ...created.document, elements }, created.revision);
  await fs.unlink(path.join(root, 'Lore', 'Old.md'));
  const reopened = await boards.readBoard(saved.path);
  assert.equal(reopened.document.elements.length, 2);
  assert.deepEqual(reopened.document.elements.map(element => element.type), ['note-card', 'excerpt-card']);
});

test('prepared public snapshot omits private elements and source NoteIds', () => {
  const privateCard: BoardNoteCardElement = {
    type: 'note-card', elementId: randomUUID(), sourceNoteId: 'Secret/DM-only.md', title: 'Segreto del master',
    x: 999, y: 777, width: 280, height: 110, z: 1, locked: false, visibleByDefault: false
  };
  const publicCard: BoardNoteCardElement = {
    type: 'note-card', elementId: randomUUID(), sourceNoteId: 'Lore/Public.md', title: 'Torre',
    x: 20, y: 30, width: 280, height: 110, z: 2, locked: false, visibleByDefault: true
  };
  const publicExcerpt: BoardExcerptCardElement = {
    type: 'excerpt-card', elementId: randomUUID(), sourceNoteId: 'Lore/Public.md', sourceTitle: 'Public',
    excerpt: 'Solo questo estratto [[Secret/DM-only]]', x: 40, y: 170, width: 280, height: 170, z: 3, locked: false, visibleByDefault: true
  };
  const publicText: BoardTextElement = {
    type: 'text', elementId: randomUUID(), text: 'Testo pubblico', x: 400, y: 50, width: 160, height: 80, z: 4, locked: false, visibleByDefault: true
  };
  const leakingLink: BoardLinkElement = {
    type: 'link', elementId: randomUUID(), from: { kind: 'element', elementId: privateCard.elementId },
    to: { kind: 'element', elementId: publicCard.elementId }, arrow: 'end', z: 5, locked: false, visibleByDefault: true
  };
  const board = parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 1234, y: 5678, zoom: 2 },
    elements: [privateCard, publicCard, publicExcerpt, publicText, leakingLink]
  });

  const projected = preparedPublicSnapshot(board);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes('Secret/DM-only.md'), false);
  assert.equal(serialized.includes('Lore/Public.md'), false);
  assert.equal(serialized.includes(privateCard.elementId), false);
  assert.equal(serialized.includes('"x":999'), false);
  assert.equal(serialized.includes('"x":1234'), false);
  assert.equal(projected.elements.some(element => element.type === 'link'), false);

  const note = projected.elements.find(element => element.type === 'note-card');
  assert.ok(note && note.type === 'note-card');
  assert.equal(note.title, 'Torre');
  assert.equal('sourceNoteId' in note, false);
  const excerpt = projected.elements.find(element => element.type === 'excerpt-card');
  assert.ok(excerpt && excerpt.type === 'excerpt-card');
  assert.equal(excerpt.excerpt, 'Solo questo estratto [[Secret/DM-only]]');
  assert.equal('sourceNoteId' in excerpt, false);
});
