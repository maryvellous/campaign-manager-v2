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
