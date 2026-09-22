import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BoardRepository } from '../apps/desktop/infrastructure/board-repository';
import { parseBoardDocument, type BoardDocument, type BoardElement } from '../apps/desktop/application/board-types';

async function campaignFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-board-org-'));
  const campaignId = randomUUID();
  await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1, campaignId }, null, 2));
  return { root, campaignId, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('token without avatar is valid and group id persists', () => {
  const groupId = randomUUID();
  const tokenId = randomUUID();
  const parsed = parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [{
      type: 'token',
      elementId: tokenId,
      name: 'Guardia',
      x: 20,
      y: 30,
      width: 84,
      height: 84,
      z: 1,
      locked: false,
      groupId
    }]
  });
  assert.equal(parsed.elements[0].type, 'token');
  assert.equal(parsed.elements[0].groupId, groupId);
  if (parsed.elements[0].type === 'token') {
    assert.equal(parsed.elements[0].name, 'Guardia');
    assert.equal(parsed.elements[0].assetPath, undefined);
  }
});

test('token avatar must stay inside Assets/Board', () => {
  const base = {
    schemaVersion: 1 as const,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [{
      type: 'token' as const,
      elementId: randomUUID(),
      name: 'Nyx',
      assetPath: 'C:/outside/nyx.png',
      x: 0, y: 0, width: 84, height: 84, z: 1, locked: false
    }]
  };
  assert.throws(() => parseBoardDocument(base), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'invalid_path');
    return true;
  });
});

test('free and anchored links persist and remain independent from wikilinks', async () => {
  const fixture = await campaignFixture();
  try {
    const repo = new BoardRepository(fixture.root, fixture.campaignId);
    const created = await repo.createBoard('Collegamenti');
    const left = randomUUID();
    const right = randomUUID();
    const elements: BoardElement[] = [
      { type: 'token', elementId: left, name: 'A', x: 10, y: 20, width: 72, height: 72, z: 1, locked: false },
      { type: 'text', elementId: right, text: 'Porta', x: 300, y: 100, width: 180, height: 90, z: 2, locked: false },
      {
        type: 'link',
        elementId: randomUUID(),
        from: { kind: 'element', elementId: left },
        to: { kind: 'element', elementId: right },
        arrow: 'end',
        z: 3,
        locked: false
      },
      {
        type: 'link',
        elementId: randomUUID(),
        from: { kind: 'point', x: 20, y: 400 },
        to: { kind: 'point', x: 420, y: 410 },
        arrow: 'none',
        z: 4,
        locked: false
      }
    ];
    const document: BoardDocument = { ...created.document, elements };
    const saved = await repo.saveBoard(created.path, document, created.revision);
    const reopened = await repo.readBoard(created.path);
    assert.deepEqual(reopened.document.elements, saved.document.elements);
    const anchored = reopened.document.elements.find(element => element.type === 'link' && element.arrow === 'end');
    assert.ok(anchored && anchored.type === 'link');
    assert.deepEqual(anchored.from, { kind: 'element', elementId: left });
    assert.deepEqual(anchored.to, { kind: 'element', elementId: right });
    const raw = await fs.readFile(path.join(fixture.root, created.path), 'utf8');
    assert.equal(raw.includes('[['), false);
  } finally { await fixture.cleanup(); }
});

test('invalid group and broken link endpoint ids are rejected', () => {
  const boardId = randomUUID();
  const base = { schemaVersion: 1 as const, boardId, camera: { x: 0, y: 0, zoom: 1 } };
  assert.throws(() => parseBoardDocument({
    ...base,
    elements: [{ type: 'text', elementId: randomUUID(), text: 'x', x: 0, y: 0, width: 100, height: 50, z: 1, locked: false, groupId: 'not-a-uuid' }]
  }), /Gruppo board non valido/u);
  assert.throws(() => parseBoardDocument({
    ...base,
    elements: [{ type: 'link', elementId: randomUUID(), from: { kind: 'element', elementId: 'bad' }, to: { kind: 'point', x: 1, y: 2 }, arrow: 'end', z: 1, locked: false }]
  }), /Ancora collegamento non valida/u);
});

test('duplicate element ids remain invalid with organization elements', () => {
  const elementId = randomUUID();
  assert.throws(() => parseBoardDocument({
    schemaVersion: 1,
    boardId: randomUUID(),
    camera: { x: 0, y: 0, zoom: 1 },
    elements: [
      { type: 'token', elementId, name: 'Uno', x: 0, y: 0, width: 80, height: 80, z: 1, locked: false },
      { type: 'link', elementId, from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 10, y: 10 }, arrow: 'none', z: 2, locked: false }
    ]
  }), /Identità elemento board non valida/u);
});
