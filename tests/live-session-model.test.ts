import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSessionModel, SessionDirectoryModel } from '../services/relay/session-model';

test('session starts accepting joins but requires connected host', async () => {
  const { model, ticket } = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const beforeHost = await model.join('ABCD-EFGH', 'Player', 1001);
  assert.equal(beforeHost.ok, false);
  if (!beforeHost.ok) assert.equal(beforeHost.error.error.code, 'HOST_OFFLINE');

  const identity = await model.consumeTicket(ticket, 1002);
  assert.equal(identity.ok, true);
  if (identity.ok) model.connect(identity.value);

  const joined = await model.join('ABCD-EFGH', 'Player', 1003);
  assert.equal(joined.ok, true);
  if (joined.ok) {
    assert.match(joined.value.participantId, /^participant_/u);
    assert.match(joined.value.resumeCredential, /^resume_/u);
  }
});

test('participant reconnect preserves id even when new joins are locked', async () => {
  const { model, hostCredential, ticket } = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const host = await model.consumeTicket(ticket, 1001);
  assert.equal(host.ok, true);
  if (host.ok) model.connect(host.value);

  const joined = await model.join('ABCD-EFGH', 'Same Name', 1002);
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const locked = await model.setAcceptingJoins(hostCredential, false);
  assert.equal(locked.ok, true);
  const rejected = await model.join('ABCD-EFGH', 'Other', 1003);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.error.code, 'JOIN_LOCKED');

  const resumed = await model.resume(joined.value.participantId, joined.value.resumeCredential, 1004);
  assert.equal(resumed.ok, true);
  if (resumed.ok) {
    const identity = await model.consumeTicket(resumed.value.ticket, 1005);
    assert.equal(identity.ok, true);
    if (identity.ok) assert.equal(identity.value.participantId, joined.value.participantId);
  }
});

test('connection tickets are short-lived and single-use', async () => {
  const { model, ticket } = await LiveSessionModel.create('ABCD-EFGH', 1000);
  assert.equal((await model.consumeTicket(ticket, 61_001)).ok, false);

  const second = await LiveSessionModel.create('WXYZ-2345', 1000);
  const firstUse = await second.model.consumeTicket(second.ticket, 1001);
  const secondUse = await second.model.consumeTicket(second.ticket, 1002);
  assert.equal(firstUse.ok, true);
  assert.equal(secondUse.ok, false);
});

test('removing a participant invalidates resume and pending tickets', async () => {
  const { model, hostCredential, ticket } = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const host = await model.consumeTicket(ticket, 1001);
  if (host.ok) model.connect(host.value);
  const joined = await model.join('ABCD-EFGH', 'Guest', 1002);
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const removed = await model.removeParticipant(hostCredential, joined.value.participantId);
  assert.equal(removed.ok, true);
  assert.equal((await model.consumeTicket(joined.value.ticket, 1003)).ok, false);
  assert.equal((await model.resume(joined.value.participantId, joined.value.resumeCredential, 1004)).ok, false);
});

test('rotating code invalidates the old directory entry without affecting participants', async () => {
  const directory = new SessionDirectoryModel();
  assert.equal(directory.reserve('ABCD-EFGH', 'session_one'), true);
  assert.equal(directory.resolve('ABCD-EFGH'), 'session_one');
  assert.equal(directory.rotate('ABCD-EFGH', 'WXYZ-2345', 'session_one'), true);
  assert.equal(directory.resolve('ABCD-EFGH'), undefined);
  assert.equal(directory.resolve('WXYZ-2345'), 'session_one');
});

test('duplicate display names remain separate identities', async () => {
  const { model, ticket } = await LiveSessionModel.create('ABCD-EFGH', 1000);
  const host = await model.consumeTicket(ticket, 1001);
  if (host.ok) model.connect(host.value);
  const one = await model.join('ABCD-EFGH', 'Alex', 1002);
  const two = await model.join('ABCD-EFGH', 'Alex', 1003);
  assert.equal(one.ok, true); assert.equal(two.ok, true);
  if (one.ok && two.ok) assert.notEqual(one.value.participantId, two.value.participantId);
});
