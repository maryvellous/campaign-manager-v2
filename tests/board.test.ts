import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { BoardRepository } from '../apps/desktop/infrastructure/board-repository';
import { BoardService } from '../apps/desktop/application/board-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import { parseBoardDocument, type BoardConnector, type BoardTextElement, type BoardTokenElement } from '../apps/desktop/application/board-types';
import { contentBounds, marqueeSelection, reorderElements } from '../apps/desktop/application/board-operations';

async function campaignFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-'));
  const campaignId = randomUUID();
  await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1, campaignId }, null, 2));
  return { root, campaignId, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('schema v1 boards migrate in memory to schema v2 without losing content', () => {
  const boardId = randomUUID();
  const elementId = randomUUID();
  const migrated = parseBoardDocument({
    schemaVersion: 1,
    boardId,
    camera: { x: 2, y: 3, zoom: 1 },
    elements: [{ type: 'text', elementId, text: 'Vecchia board', x: 10, y: 20, width: 200, height: 90, z: 1, locked: false }]
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.boardId, boardId);
  assert.deepEqual(migrated.connectors, []);
  assert.equal(migrated.elements[0].elementId, elementId);
});

test('schema v2 persists neutral tokens groups and anchored connectors', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Organizzazione');
    const groupId = randomUUID();
    const token: BoardTokenElement = {
      type: 'token', elementId: randomUUID(), name: 'Guardia', x: 100, y: 100, width: 96, height: 96, z: 1,
      locked: false, groupId, visibleByDefault: false
    };
    const text: BoardTextElement = {
      type: 'text', elementId: randomUUID(), text: 'Porta nord', x: 260, y: 110, width: 180, height: 80, z: 2,
      locked: false, groupId
    };
    const connector: BoardConnector = {
      connectorId: randomUUID(), style: 'arrow', from: { kind: 'element', elementId: token.elementId },
      to: { kind: 'element', elementId: text.elementId }, locked: false
    };
    const saved = await repo.saveBoard(created.path, { ...created.document, elements: [token, text], connectors: [connector] }, created.revision);
    const reopened = await repo.readBoard(saved.path);
    assert.equal(reopened.document.schemaVersion, 2);
    assert.equal((reopened.document.elements[0] as BoardTokenElement).avatarPath, undefined);
    assert.equal((reopened.document.elements[0] as BoardTokenElement).visibleByDefault, false);
    assert.equal(reopened.document.elements[0].groupId, groupId);
    assert.deepEqual(reopened.document.connectors, [connector]);
  } finally { await fixture.cleanup(); }
});

test('board selection helpers expand groups and preserve block ordering', () => {
  const groupId = randomUUID();
  const elements: BoardTextElement[] = [
    { type: 'text', elementId: randomUUID(), text: 'A', x: 0, y: 0, width: 50, height: 50, z: 1, locked: false, groupId },
    { type: 'text', elementId: randomUUID(), text: 'B', x: 60, y: 0, width: 50, height: 50, z: 2, locked: false, groupId },
    { type: 'text', elementId: randomUUID(), text: 'C', x: 300, y: 0, width: 50, height: 50, z: 3, locked: false }
  ];
  const selected = marqueeSelection(elements, { x: 0, y: 0, width: 30, height: 30 });
  assert.deepEqual(new Set(selected), new Set([elements[0].elementId, elements[1].elementId]));
  const front = reorderElements(elements, selected, 'front').slice().sort((a, b) => a.z - b.z);
  assert.equal(front[0].elementId, elements[2].elementId);
  assert.deepEqual(front.slice(1).map(element => element.elementId), [elements[0].elementId, elements[1].elementId]);
});

test('content bounds include free and anchored connector endpoints', () => {
  const token: BoardTokenElement = { type: 'token', elementId: randomUUID(), name: '', x: 100, y: 100, width: 80, height: 80, z: 1, locked: false, visibleByDefault: false };
  const document = parseBoardDocument({
    schemaVersion: 2,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [token],
    connectors: [{ connectorId: randomUUID(), style: 'line', from: { kind: 'element', elementId: token.elementId }, to: { kind: 'point', x: 500, y: 400 }, locked: false }]
  });
  assert.deepEqual(contentBounds(document), { x: 100, y: 100, width: 400, height: 300 });
});

test('token avatar paths remain campaign-relative', () => {
  assert.throws(() => parseBoardDocument({
    schemaVersion: 2,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [{ type: 'token', elementId: randomUUID(), name: 'X', avatarPath: '../outside.png', x: 0, y: 0, width: 80, height: 80, z: 1, locked: false, visibleByDefault: false }],
    connectors: []
  }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'invalid_path');
    return true;
  });
});

test('board create/save/reopen keeps stable id and content', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Taverna');
    assert.equal(created.path, 'Boards/Taverna.board.json');
    const element: BoardTextElement = { type: 'text', elementId: randomUUID(), text: 'Porta chiusa', x: 40, y: 80, width: 240, height: 100, z: 1, locked: false };
    const document = { ...created.document, camera: { x: 22, y: -14, zoom: 1.25 }, elements: [element] };
    const saved = await repo.saveBoard(created.path, document, created.revision);
    const reopened = await repo.readBoard(created.path);
    assert.equal(reopened.document.boardId, created.document.boardId);
    assert.deepEqual(reopened.document, saved.document);
    assert.deepEqual(reopened.document.elements, [element]);
  } finally { await fixture.cleanup(); }
});

test('board save refuses stale revision and preserves external change', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Conflitto');
    const external = { ...created.document, camera: { x: 99, y: 12, zoom: 1 } };
    await fs.writeFile(path.join(fixture.root, created.path), JSON.stringify(external, null, 2) + '\n');
    const local = { ...created.document, camera: { x: -50, y: 0, zoom: 1 } };
    await assert.rejects(() => repo.saveBoard(created.path, local, created.revision), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'conflict');
      return true;
    });
    const disk = await repo.readBoard(created.path);
    assert.equal(disk.document.camera.x, 99);
  } finally { await fixture.cleanup(); }
});

test('board rename never overwrites an existing destination', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const first = await repo.createBoard('Prima');
    const second = await repo.createBoard('Seconda');
    await assert.rejects(() => repo.renameBoard(first.path, 'Seconda'), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'collision');
      return true;
    });
    const preserved = await repo.readBoard(second.path);
    assert.equal(preserved.document.boardId, second.document.boardId);
    assert.equal((await repo.readBoard(first.path)).document.boardId, first.document.boardId);
  } finally { await fixture.cleanup(); }
});

test('case-only board rename preserves board identity', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Scena');
    const renamed = await repo.renameBoard(created.path, 'SCENA');
    assert.equal(renamed.path, 'Boards/SCENA.board.json');
    assert.equal(renamed.document.boardId, created.document.boardId);
    await assert.rejects(() => repo.readBoard(created.path), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'case_collision');
      return true;
    });
  } finally { await fixture.cleanup(); }
});

test('stale recovery is detectable against a newer disk revision', async () => {
  const fixture = await campaignFixture();
  const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-stale-'));
  try {
    const store = new LocalStore(localRoot);
    const service = new BoardService(store);
    service.bind({ root: fixture.root, campaignId: fixture.campaignId });
    const created = await service.create('Stale');
    const recoveredDocument = { ...created.snapshot.document, camera: { x: 15, y: 0, zoom: 1 } };
    await service.protect(created.snapshot.path, created.snapshot.revision, recoveredDocument);

    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    await repo.saveBoard(created.snapshot.path, { ...created.snapshot.document, camera: { x: 80, y: 0, zoom: 1 } }, created.snapshot.revision);

    const opened = await service.open(created.snapshot.path);
    assert.ok(opened.recovery);
    assert.notEqual(opened.recovery.draft.baseRevision, opened.snapshot.revision);
    assert.equal(opened.recovery.draft.document.camera.x, 15);
    assert.equal(opened.snapshot.document.camera.x, 80);
  } finally {
    await fixture.cleanup();
    await fs.rm(localRoot, { recursive: true, force: true });
  }
});

test('board image import stays inside Assets/Board and never overwrites a collision', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const first = await repo.importImage('mappa.png', png);
    const second = await repo.importImage('mappa.png', png);
    assert.equal(first, 'Assets/Board/mappa.png');
    assert.equal(second, 'Assets/Board/mappa-2.png');
    assert.match(await repo.readAsset(first), /^data:image\/png;base64,/u);
    const board = await repo.createBoard('Mappa');
    const withImage = {
      ...board.document,
      elements: [{
        type: 'image' as const,
        elementId: randomUUID(),
        assetPath: first,
        x: 0, y: 0, width: 400, height: 300, z: 1, locked: true
      }]
    };
    await repo.saveBoard(board.path, withImage, board.revision);
    const raw = await fs.readFile(path.join(fixture.root, board.path), 'utf8');
    assert.equal(raw.includes(fixture.root), false);
    assert.equal(raw.includes(first), true);
  } finally { await fixture.cleanup(); }
});

test('board asset import rejects symlinked asset directories before writing outside the campaign', { skip: process.platform === 'win32' }, async () => {
  const fixture = await campaignFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-outside-'));
  try {
    await fs.symlink(outside, path.join(fixture.root, 'Assets'), 'dir');
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await assert.rejects(() => repo.importImage('mappa.png', png), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'outside_campaign_root');
      return true;
    });
    await assert.rejects(() => fs.lstat(path.join(outside, 'Board')), { code: 'ENOENT' });
  } finally {
    await fixture.cleanup();
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('board recovery is outside the vault and removed only after confirmed save', async () => {
  const fixture = await campaignFixture();
  const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-local-'));
  try {
    const store = new LocalStore(localRoot);
    const service = new BoardService(store);
    service.bind({ root: fixture.root, campaignId: fixture.campaignId });
    const created = await service.create('Recovery');
    const document = { ...created.snapshot.document, camera: { x: 10, y: 20, zoom: 1 } };
    await service.protect(created.snapshot.path, created.snapshot.revision, document);
    let listed = await service.list();
    assert.equal(listed.recoveries.length, 1);
    assert.equal(await fs.readdir(path.join(fixture.root, 'Boards')).then(() => true), true);
    await service.save(created.snapshot.path, created.snapshot.revision, document);
    listed = await service.list();
    assert.equal(listed.recoveries.length, 0);
    const localFiles = await fs.readdir(path.join(localRoot, 'campaigns', fixture.campaignId, 'board-recovery'));
    assert.deepEqual(localFiles, []);
  } finally {
    await fixture.cleanup();
    await fs.rm(localRoot, { recursive: true, force: true });
  }
});
