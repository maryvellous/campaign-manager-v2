import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BoardService } from '../apps/desktop/application/board-service';
import type { BoardDocument } from '../apps/desktop/application/board-types';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import { HOST_GRACE_MS, LiveSessionModel } from '../services/relay/session-model';

async function liveFixture() {
  const created = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const identity = await created.model.consumeTicket(created.ticket, 1001);
  assert.equal(identity.ok, true);
  if (!identity.ok) throw new Error('host ticket failed');
  created.model.connect(identity.value, 1001);
  return { ...created, identity: identity.value };
}

test('host disconnect starts an exact ten minute grace and freezes shared mutations', async () => {
  const f = await liveFixture();
  f.model.disconnect(f.identity, 5_000);
  assert.equal(f.model.summary().lifecycle, 'host_reconnecting');
  assert.equal(f.model.hostGraceDeadline(), 5_000 + HOST_GRACE_MS);

  const joined = await f.model.join('ABCD-EFGH', 'Late', 5_001);
  assert.equal(joined.ok, false);
  if (!joined.ok) assert.equal(joined.error.error.code, 'HOST_OFFLINE');

  assert.equal(f.model.expireHostGrace(5_000 + HOST_GRACE_MS - 1), undefined);
  assert.equal(f.model.summary().lifecycle, 'host_reconnecting');
});

test('host reconnect before grace deadline resumes the same session', async () => {
  const f = await liveFixture();
  f.model.disconnect(f.identity, 2_000);
  const ticket = await f.model.hostTicket(f.hostCredential, 2_000 + HOST_GRACE_MS - 2);
  assert.equal(ticket.ok, true);
  if (!ticket.ok) return;
  const identity = await f.model.consumeTicket(ticket.value.ticket, 2_000 + HOST_GRACE_MS - 1);
  assert.equal(identity.ok, true);
  if (!identity.ok) return;
  const resumed = f.model.connect(identity.value, 2_000 + HOST_GRACE_MS - 1);
  assert.equal(resumed.ok, true);
  assert.equal(f.model.summary().lifecycle, 'open');
  assert.equal(f.model.hostGraceDeadline(), undefined);
});

test('host timeout ends session exactly at deadline and invalidates primary credentials', async () => {
  const f = await liveFixture();
  const player = await f.model.join('ABCD-EFGH', 'Player', 1100);
  assert.equal(player.ok, true);
  if (!player.ok) return;

  f.model.disconnect(f.identity, 10_000);
  const ended = f.model.expireHostGrace(10_000 + HOST_GRACE_MS);
  assert.deepEqual(ended, { reason: 'host_timeout', endedAt: 10_000 + HOST_GRACE_MS });
  assert.equal(f.model.summary().lifecycle, 'ended');
  assert.equal(await f.model.authenticateHost(f.hostCredential), false);

  const hostTicket = await f.model.hostTicket(f.hostCredential, 10_000 + HOST_GRACE_MS + 1);
  assert.equal(hostTicket.ok, false);
  if (!hostTicket.ok) assert.equal(hostTicket.error.error.code, 'SESSION_ENDED');
  const resume = await f.model.resume(player.value.participantId, player.value.resumeCredential, 10_000 + HOST_GRACE_MS + 1);
  assert.equal(resume.ok, false);
  if (!resume.ok) assert.equal(resume.error.error.code, 'SESSION_ENDED');
});

test('explicit end invalidates tickets and compacts runtime after final positions were collected', async () => {
  const f = await liveFixture();
  const boardId = randomUUID();
  const tokenId = randomUUID();
  await f.model.publishBoard(f.hostCredential, {
    boardId,
    title: 'Finale',
    elements: [{ type: 'token', elementId: tokenId, name: 'Hero', x: 10, y: 20, width: 80, height: 80, z: 1 }]
  });
  await f.model.moveTokenAsHost(f.hostCredential, { boardId, tokenId, x: 350, y: 275 });

  const final = f.model.finalTokenPositions();
  assert.deepEqual(final.boards[0].tokens, [{ tokenId, x: 350, y: 275 }]);

  const ended = await f.model.endSession(f.hostCredential, 9_000);
  assert.equal(ended.ok, true);
  if (ended.ok) assert.deepEqual(ended.value, { reason: 'explicit', endedAt: 9_000 });
  assert.equal(await f.model.authenticateHost(f.hostCredential), false);

  f.model.compactEndedRuntime();
  assert.equal(f.model.record.boards.length, 0);
  assert.equal(f.model.record.participants.length, 0);
  assert.equal(f.model.record.tickets.length, 0);
  assert.equal(f.model.record.hostCredentialHash, 'ended');
});

test('hidden live token preserves its final runtime position for end-session copy', async () => {
  const f = await liveFixture();
  const boardId = randomUUID();
  const tokenId = randomUUID();
  await f.model.publishBoard(f.hostCredential, {
    boardId,
    title: 'Hidden',
    elements: [{ type: 'token', elementId: tokenId, name: 'Hidden Hero', x: 1, y: 2, width: 80, height: 80, z: 1 }]
  });
  await f.model.moveTokenAsHost(f.hostCredential, { boardId, tokenId, x: 99, y: 101 });
  await f.model.hideElement(f.hostCredential, boardId, tokenId);

  assert.equal(f.model.boardSnapshot(boardId)?.elements.some(element => element.elementId === tokenId), false);
  assert.deepEqual(f.model.finalTokenPositions().boards[0].tokens, [{ tokenId, x: 99, y: 101 }]);

  await f.model.revealElement(f.hostCredential, boardId, { type: 'token', elementId: tokenId, name: 'Hidden Hero', x: 1, y: 2, width: 80, height: 80, z: 1 });
  assert.deepEqual(f.model.tokenPosition(boardId, tokenId), { x: 99, y: 101 });
  const visible = f.model.boardSnapshot(boardId)?.elements.find(element => element.elementId === tokenId);
  assert.ok(visible && visible.type === 'token');
  if (visible?.type === 'token') assert.deepEqual({ x: visible.x, y: visible.y }, { x: 99, y: 101 });
});

async function boardFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-live-end-board-'));
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-live-end-local-'));
  const campaignId = randomUUID();
  await fs.writeFile(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1, campaignId }, null, 2));
  const service = new BoardService(new LocalStore(local));
  service.bind({ root, campaignId });
  return { root, local, campaignId, service, cleanup: async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(local, { recursive: true, force: true }); } };
}

test('saving final positions changes only prepared token coordinates', async () => {
  const f = await boardFixture();
  try {
    const created = await f.service.create('Ending');
    const tokenId = randomUUID();
    const document: BoardDocument = {
      ...created.snapshot.document,
      elements: [{
        type: 'token', elementId: tokenId, name: 'Hero', x: 10, y: 20, width: 84, height: 84, z: 1, locked: true, visibleByDefault: false
      }]
    };
    const saved = await f.service.save(created.snapshot.path, created.snapshot.revision, document);
    const result = await f.service.applyLiveTokenPositions({
      boards: [{ boardId: document.boardId, title: 'Ending', tokens: [{ tokenId, x: 400, y: -25 }] }]
    });
    assert.equal(result.changedTokens, 1);

    const reopened = await f.service.open(created.snapshot.path);
    const token = reopened.snapshot.document.elements[0];
    assert.ok(token && token.type === 'token');
    if (token?.type === 'token') {
      assert.equal(token.x, 400);
      assert.equal(token.y, -25);
      assert.equal(token.name, 'Hero');
      assert.equal(token.locked, true);
      assert.equal(token.visibleByDefault, false);
      assert.equal(token.width, 84);
      assert.equal(token.height, 84);
    }
    assert.notEqual(reopened.snapshot.revision, saved.snapshot.revision);
  } finally { await f.cleanup(); }
});

test('final position apply refuses a board with protected local recovery', async () => {
  const f = await boardFixture();
  try {
    const created = await f.service.create('Conflict');
    const tokenId = randomUUID();
    const document: BoardDocument = {
      ...created.snapshot.document,
      elements: [{ type: 'token', elementId: tokenId, name: 'Hero', x: 1, y: 2, width: 80, height: 80, z: 1, locked: false }]
    };
    const saved = await f.service.save(created.snapshot.path, created.snapshot.revision, document);
    await f.service.protect(saved.snapshot.path, saved.snapshot.revision, { ...document, camera: { x: 10, y: 10, zoom: 1 } });

    await assert.rejects(() => f.service.applyLiveTokenPositions({
      boards: [{ boardId: document.boardId, title: 'Conflict', tokens: [{ tokenId, x: 50, y: 60 }] }]
    }), /Salva o scarta le modifiche locali/u);

    const reopened = await f.service.open(saved.snapshot.path);
    const token = reopened.snapshot.document.elements[0];
    assert.ok(token && token.type === 'token');
    if (token?.type === 'token') assert.deepEqual({ x: token.x, y: token.y }, { x: 1, y: 2 });
  } finally { await f.cleanup(); }
});


test('host timeout freezes and then ends a table with eight existing players', async () => {
  const f = await liveFixture();
  const players = [];
  for (let index = 0; index < 8; index++) {
    const joined = await f.model.join('ABCD-EFGH', `Player ${index + 1}`, 2_000 + index);
    assert.equal(joined.ok, true);
    if (joined.ok) players.push(joined.value);
  }
  assert.equal(players.length, 8);

  f.model.disconnect(f.identity, 20_000);
  assert.equal(f.model.summary().participants.length, 8);
  assert.equal(f.model.summary().lifecycle, 'host_reconnecting');
  for (const player of players) {
    const resumed = await f.model.resume(player.participantId, player.resumeCredential, 20_100);
    assert.equal(resumed.ok, true);
  }

  const ended = f.model.expireHostGrace(20_000 + HOST_GRACE_MS);
  assert.equal(ended?.reason, 'host_timeout');
  assert.equal(f.model.summary().lifecycle, 'ended');
  for (const player of players) {
    const resumed = await f.model.resume(player.participantId, player.resumeCredential, 20_000 + HOST_GRACE_MS + 1);
    assert.equal(resumed.ok, false);
    if (!resumed.ok) assert.equal(resumed.error.error.code, 'SESSION_ENDED');
  }
});
