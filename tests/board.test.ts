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
  const saved = await repository.write(created.relativePath, { ...created, elements: [{ elementId: randomUUID(), kind: 'text', x: 10, y: 20, width: 200, height: 80, z: 1, locked: false, text: 'Cittadella' }] }, created.revision);
  const reopened = await repository.read(saved.relativePath);
  assert.equal(reopened.elements[0].text, 'Cittadella');
  assert.doesNotMatch(await fs.readFile(path.join(root, 'Boards', saved.relativePath), 'utf8'), new RegExp(root.replaceAll('\\', '\\\\'), 'u'));
  await fs.writeFile(path.join(root, 'Boards', saved.relativePath), JSON.stringify({ ...reopened, title: 'Esterno' }));
  await assert.rejects(repository.write(saved.relativePath, reopened, saved.revision), { code: 'conflict' });
});
