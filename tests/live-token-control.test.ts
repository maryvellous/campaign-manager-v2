import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LiveSessionModel } from '../services/relay/session-model';
import type { LiveBoardPayload } from '../packages/protocol/src/index';

async function fixture() {
  const created = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const hostIdentity = await created.model.consumeTicket(created.ticket, 1001);
  assert.equal(hostIdentity.ok, true);
  if (!hostIdentity.ok) throw new Error('host auth failed');
  created.model.connect(hostIdentity.value);

  const one = await created.model.join('ABCD-EFGH', 'One', 1002);
  const two = await created.model.join('ABCD-EFGH', 'Two', 1003);
  assert.equal(one.ok, true); assert.equal(two.ok, true);
  if (!one.ok || !two.ok) throw new Error('join failed');

  const boardId = randomUUID();
  const tokenId = randomUUID();
  const board: LiveBoardPayload = {
    boardId,
    title: 'Arena',
    elements: [{
      type: 'token',
      elementId: tokenId,
      name: 'Hero',
      x: 10, y: 20, width: 80, height: 80, z: 1
    }]
  };
  const published = await created.model.publishBoard(created.hostCredential, board);
  assert.equal(published.ok, true);
  return { ...created, one: one.value, two: two.value, boardId, tokenId };
}

test('one token has at most one player controller and reassignment replaces it', async () => {
  const f = await fixture();
  const first = await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  assert.equal(first.ok, true);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), f.one.participantId);
  const firstSnapshot = f.model.playerSnapshot(f.one.participantId);
  assert.deepEqual(firstSnapshot.presentation === 'board' ? firstSnapshot.board.controlledTokenIds : [], [f.tokenId]);

  const second = await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.two.participantId);
  assert.equal(second.ok, true);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), f.two.participantId);
  const oneSnapshot = f.model.playerSnapshot(f.one.participantId);
  const twoSnapshot = f.model.playerSnapshot(f.two.participantId);
  assert.deepEqual(oneSnapshot.presentation === 'board' ? oneSnapshot.board.controlledTokenIds : [], []);
  assert.deepEqual(twoSnapshot.presentation === 'board' ? twoSnapshot.board.controlledTokenIds : [], [f.tokenId]);
});

test('authorized player commit moves token and increments stateSeq', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  const before = f.model.summary().stateSeq;
  const moved = f.model.commitPlayerTokenMove(f.one.participantId, { boardId: f.boardId, tokenId: f.tokenId, x: 145, y: 230 });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.value.stateSeq, before + 1);
  assert.deepEqual(f.model.tokenPosition(f.boardId, f.tokenId), { x: 145, y: 230 });
});

test('unassigned or wrong player cannot move token and authoritative position is unchanged', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  const before = f.model.summary().stateSeq;
  const rejected = f.model.commitPlayerTokenMove(f.two.participantId, { boardId: f.boardId, tokenId: f.tokenId, x: 999, y: 999 });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.error.code, 'TOKEN_NOT_CONTROLLABLE');
  assert.equal(f.model.summary().stateSeq, before);
  assert.deepEqual(f.model.tokenPosition(f.boardId, f.tokenId), { x: 10, y: 20 });
});

test('hidden token is not controllable but assignment can survive reveal', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  const hidden = await f.model.hideElement(f.hostCredential, f.boardId, f.tokenId);
  assert.equal(hidden.ok, true);
  const denied = f.model.commitPlayerTokenMove(f.one.participantId, { boardId: f.boardId, tokenId: f.tokenId, x: 30, y: 40 });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.error.code, 'TOKEN_NOT_CONTROLLABLE');

  const reveal = await f.model.revealElement(f.hostCredential, f.boardId, {
    type: 'token',
    elementId: f.tokenId,
    name: 'Hero',
    x: 10, y: 20, width: 80, height: 80, z: 1
  });
  assert.equal(reveal.ok, true);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), f.one.participantId);
  const allowed = f.model.commitPlayerTokenMove(f.one.participantId, { boardId: f.boardId, tokenId: f.tokenId, x: 30, y: 40 });
  assert.equal(allowed.ok, true);
});

test('host can move any published token regardless of player controller', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  const moved = await f.model.moveTokenAsHost(f.hostCredential, { boardId: f.boardId, tokenId: f.tokenId, x: -50, y: 75 });
  assert.equal(moved.ok, true);
  assert.deepEqual(f.model.tokenPosition(f.boardId, f.tokenId), { x: -50, y: 75 });
});

test('reset clears runtime token controller while board switch preserves it', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);

  const otherId = randomUUID();
  await f.model.publishBoard(f.hostCredential, { boardId: otherId, title: 'Other', elements: [] });
  await f.model.switchBoard(f.hostCredential, f.boardId);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), f.one.participantId);

  const reset = await f.model.resetBoard(f.hostCredential, {
    boardId: f.boardId,
    title: 'Arena',
    elements: [{ type: 'token', elementId: f.tokenId, name: 'Hero', x: 10, y: 20, width: 80, height: 80, z: 1 }]
  });
  assert.equal(reset.ok, true);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), undefined);
});

test('participant removal clears every token controller owned by that participant', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  const removed = await f.model.removeParticipant(f.hostCredential, f.one.participantId);
  assert.equal(removed.ok, true);
  assert.equal(f.model.controllerForToken(f.boardId, f.tokenId), undefined);
});

test('ping and token preview are blocked when host is reconnecting', async () => {
  const f = await fixture();
  await f.model.assignTokenController(f.hostCredential, f.boardId, f.tokenId, f.one.participantId);
  f.model.disconnect({ role: 'host' });
  const ping = f.model.authorizePing(f.one.participantId, f.boardId);
  assert.equal(ping.ok, false);
  if (!ping.ok) assert.equal(ping.error.error.code, 'HOST_OFFLINE');
  const preview = f.model.authorizePlayerTokenPreview(f.one.participantId, { boardId: f.boardId, tokenId: f.tokenId, x: 40, y: 50 });
  assert.equal(preview.ok, false);
  if (!preview.ok) assert.equal(preview.error.error.code, 'HOST_OFFLINE');
});
