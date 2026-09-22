import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateLiveBoardPayload, type LiveBoardPayload } from '../packages/protocol/src/index';
import { LiveSessionModel } from '../services/relay/session-model';

async function liveFixture() {
  const created = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const identity = await created.model.consumeTicket(created.ticket, 1001);
  assert.equal(identity.ok, true);
  if (!identity.ok) throw new Error('host ticket failed');
  created.model.connect(identity.value);
  return created;
}

const textElement = (id: string, text: string) => ({
  elementId: id, type: 'text' as const, x: 10, y: 20, width: 180, height: 80, z: 1, text
});

test('A -> B -> A preserves runtime state accumulated on A', async () => {
  const { model, hostCredential } = await liveFixture();
  const aId = randomUUID(); const bId = randomUUID();
  const initial: LiveBoardPayload = { boardId: aId, title: 'A', elements: [textElement(randomUUID(), 'base A')] };
  const publishedA = await model.publishBoard(hostCredential, initial);
  assert.equal(publishedA.ok, true);
  const revealedId = randomUUID();
  const revealed = await model.revealElement(hostCredential, aId, textElement(revealedId, 'revealed A'));
  assert.equal(revealed.ok, true);

  const publishedB = await model.publishBoard(hostCredential, { boardId: bId, title: 'B', elements: [textElement(randomUUID(), 'base B')] });
  assert.equal(publishedB.ok, true);
  assert.equal(model.summary().activeBoardId, bId);

  const backToA = await model.switchBoard(hostCredential, aId);
  assert.equal(backToA.ok, true);
  if (backToA.ok) assert.ok(backToA.value.elements.some(element => element.elementId === revealedId));
});

test('reset rebuilds runtime board from prepared payload and unpublish returns waiting', async () => {
  const { model, hostCredential } = await liveFixture();
  const boardId = randomUUID();
  const baseId = randomUUID(); const runtimeId = randomUUID();
  await model.publishBoard(hostCredential, { boardId, title: 'Scene', elements: [textElement(baseId, 'prepared')] });
  await model.revealElement(hostCredential, boardId, textElement(runtimeId, 'runtime'));
  const reset = await model.resetBoard(hostCredential, { boardId, title: 'Scene', elements: [textElement(baseId, 'prepared updated')] });
  assert.equal(reset.ok, true);
  if (reset.ok) {
    assert.equal(reset.value.elements.length, 1);
    assert.equal(reset.value.elements[0].elementId, baseId);
  }
  const waiting = await model.unpublish(hostCredential);
  assert.equal(waiting.ok, true);
  if (waiting.ok) assert.equal(waiting.value.presentation, 'waiting');
  assert.equal(model.summary().activeBoardId, undefined);
});

test('hiding an endpoint also removes visual links that would expose it', async () => {
  const { model, hostCredential } = await liveFixture();
  const boardId = randomUUID(); const left = randomUUID(); const right = randomUUID(); const link = randomUUID();
  await model.publishBoard(hostCredential, {
    boardId,
    title: 'Links',
    elements: [
      textElement(left, 'left'),
      textElement(right, 'right'),
      { elementId: link, type: 'link', z: 3, from: { kind: 'element', elementId: left }, to: { kind: 'element', elementId: right }, arrow: 'end' }
    ]
  });
  const hidden = await model.hideElement(hostCredential, boardId, right);
  assert.equal(hidden.ok, true);
  if (hidden.ok) {
    assert.equal(hidden.value.elements.some(element => element.elementId === right), false);
    assert.equal(hidden.value.elements.some(element => element.elementId === link), false);
  }
});

test('reveal rejects a link whose endpoint is not public', async () => {
  const { model, hostCredential } = await liveFixture();
  const boardId = randomUUID(); const visible = randomUUID();
  await model.publishBoard(hostCredential, { boardId, title: 'Private endpoint', elements: [textElement(visible, 'visible')] });
  const result = await model.revealElement(hostCredential, boardId, {
    elementId: randomUUID(), type: 'link', z: 2,
    from: { kind: 'element', elementId: visible },
    to: { kind: 'element', elementId: randomUUID() },
    arrow: 'end'
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.error.code, 'PERMISSION_DENIED');
});

test('runtime board validation strips local note ids and rejects dangling links', () => {
  const cardId = randomUUID();
  const parsed = validateLiveBoardPayload({
    boardId: randomUUID(),
    title: 'Safe',
    elements: [{
      elementId: cardId,
      type: 'card',
      cardKind: 'excerpt',
      sourceTitle: 'Secrets',
      sourceNoteId: 'Private/Secrets.md',
      excerpt: 'Only this text',
      x: 0, y: 0, width: 240, height: 160, z: 1
    }]
  });
  assert.ok(parsed);
  assert.equal(JSON.stringify(parsed).includes('sourceNoteId'), false);

  const dangling = validateLiveBoardPayload({
    boardId: randomUUID(),
    title: 'Bad link',
    elements: [{
      elementId: randomUUID(), type: 'link', z: 1,
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'element', elementId: randomUUID() },
      arrow: 'end'
    }]
  });
  assert.equal(dangling, undefined);
});
