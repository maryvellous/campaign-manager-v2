import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { BoardRepository } from '../apps/desktop/infrastructure/board-repository';

test('board repository creates, reopens, persists and rejects external conflicts', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const repository = await BoardRepository.open(root);
  const created = await repository.create('Scena');
  assert.equal(created.boardId.length, 36);
  assert.equal(created.relativePath, 'Scena.board.json');
  const saved = await repository.write(created.relativePath, { ...created, elements: [{ elementId: randomUUID(), kind: 'text', x: 10, y: 20, width: 200, height: 80, z: 1, locked: false, visibleByDefault: false, text: 'Cittadella' }] }, created.revision);
  const reopened = await repository.read(saved.relativePath);
  assert.equal(reopened.elements[0].text, 'Cittadella');
  assert.doesNotMatch(await fs.readFile(path.join(root, 'Boards', saved.relativePath), 'utf8'), new RegExp(root.replaceAll('\\', '\\\\'), 'u'));
  await fs.writeFile(path.join(root, 'Boards', saved.relativePath), JSON.stringify({ ...reopened, title: 'Esterno' }));
  await assert.rejects(repository.write(saved.relativePath, reopened, saved.revision), { code: 'conflict' });
});

test('board repository round-trips V02-2 tokens, links and groups without an avatar', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-v02-2-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const repository = await BoardRepository.open(root);
  const created = await repository.create('Taverna');
  const tokenId = randomUUID(); const textId = randomUUID(); const groupId = randomUUID();
  const saved = await repository.write(created.relativePath, { ...created, elements: [
    { elementId: tokenId, kind: 'token', x: 10, y: 20, width: 64, height: 64, z: 2, locked: false, visibleByDefault: false, title: 'Mara', groupId },
    { elementId: textId, kind: 'text', x: 120, y: 20, width: 180, height: 60, z: 1, locked: true, visibleByDefault: false, text: 'Ingresso', groupId },
    { elementId: randomUUID(), kind: 'link', x: 74, y: 52, width: 46, height: 4, z: 3, locked: false, visibleByDefault: false, fromElementId: tokenId, toElementId: textId, title: 'Percorso' },
  ] }, created.revision);
  const reopened = await repository.read(saved.relativePath);
  assert.equal(reopened.elements.find(element => element.elementId === tokenId)?.title, 'Mara');
  assert.equal(reopened.elements.find(element => element.elementId === tokenId)?.visibleByDefault, false);
  assert.equal(reopened.elements.find(element => element.elementId === tokenId)?.groupId, groupId);
  assert.equal(reopened.elements.find(element => element.kind === 'link')?.toElementId, textId);
});

test('board input defaults to private and rejects unsafe references and duplicate identifiers', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-private-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const repo = await BoardRepository.open(root); const board = await repo.create('Privata');
  const file = path.join(root, 'Boards', board.relativePath);
  const element = { elementId: randomUUID(), kind: 'token', x: 0, y: 0, width: 60, height: 60, z: 1, locked: false };
  await fs.writeFile(file, JSON.stringify({ ...board, elements: [element] }));
  assert.equal((await repo.read(board.relativePath)).elements[0].visibleByDefault, false);
  await fs.writeFile(file, JSON.stringify({ ...board, elements: [element, element] }));
  await assert.rejects(repo.read(board.relativePath), { code: 'metadata_invalid' });
  for (const key of ['avatarPath', 'sourceNoteId']) {
    await fs.writeFile(file, JSON.stringify({ ...board, elements: [{ ...element, [key]: '../segreto.png' }] }));
    await assert.rejects(repo.read(board.relativePath));
  }
});

test('concurrent board saves preserve the first committed revision', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-race-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const repo = await BoardRepository.open(root); const board = await repo.create('Scena');
  const results = await Promise.allSettled([
    repo.write(board.relativePath, { ...board, title: 'Prima' }, board.revision),
    repo.write(board.relativePath, { ...board, title: 'Seconda' }, board.revision),
  ]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.equal((await repo.read(board.relativePath)).title, 'Prima');
  assert.equal((await fs.readdir(path.join(root, 'Boards'))).length, 1);
});
test('missing board root is never recreated by a pending save', async t => {
  const container = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-root-'));
  t.after(async () => fs.rm(container, { recursive: true, force: true }));
  const root = path.join(container, 'vault'); await fs.mkdir(root);
  const repo = await BoardRepository.open(root); const board = await repo.create('Scena');
  await fs.rename(root, path.join(container, 'moved'));
  await assert.rejects(repo.write(board.relativePath, { ...board, title: 'Locale' }, board.revision));
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
  assert.equal(JSON.parse(await fs.readFile(path.join(container, 'moved', 'Boards', board.relativePath), 'utf8')).title, 'Scena');
});
test('board folders cannot redirect reads or saves through a junction', async t => {
  const container = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-junction-'));
  t.after(async () => fs.rm(container, { recursive: true, force: true }));
  const root = path.join(container, 'vault'); await fs.mkdir(root);
  const repo = await BoardRepository.open(root); const board = await repo.create('Scena');
  const outside = path.join(container, 'outside'); await fs.rename(path.join(root, 'Boards'), outside);
  await fs.symlink(outside, path.join(root, 'Boards'), 'junction');
  await assert.rejects(repo.read(board.relativePath), { code: 'outside_campaign_root' });
  await assert.rejects(repo.write(board.relativePath, { ...board, title: 'Locale' }, board.revision), { code: 'outside_campaign_root' });
  assert.equal(JSON.parse(await fs.readFile(path.join(outside, board.relativePath), 'utf8')).title, 'Scena');
});

test('external changes during temporary board write are preserved', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-external-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const repo = await BoardRepository.open(root); const board = await repo.create('Scena');
  const originalOpen = fs.open.bind(fs); let intercepted = false;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args);
    if (String(args[0]).endsWith('.tmp') && !intercepted) {
      intercepted = true;
      await fs.writeFile(path.join(root, 'Boards', board.relativePath), JSON.stringify({ ...board, title: 'Esterno' }));
    }
    return handle;
  });
  await assert.rejects(repo.write(board.relativePath, { ...board, title: 'Locale' }, board.revision), { code: 'conflict' });
  assert.equal((await repo.read(board.relativePath)).title, 'Esterno');
  assert.deepEqual(await fs.readdir(path.join(root, 'Boards')), [board.relativePath]);
});
