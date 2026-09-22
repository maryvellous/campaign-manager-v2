import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { BoardRepository } from '../apps/desktop/infrastructure/board-repository';
import { BoardService } from '../apps/desktop/application/board-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import type { BoardTextElement } from '../apps/desktop/application/board-types';

async function campaignFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-'));
  const campaignId = randomUUID();
  await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1, campaignId }, null, 2));
  return { root, campaignId, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('board create/save/reopen keeps stable id and content', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Taverna');
    assert.equal(created.path, 'Boards/Taverna.board.json');
    const element: BoardTextElement = { type: 'text', elementId: randomUUID(), text: 'Porta chiusa', x: 40, y: 80, width: 240, height: 100, z: 1, locked: false, visibleByDefault: false };
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
