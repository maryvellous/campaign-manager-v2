import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSessionModel } from '../services/relay/session-model';

async function fixture() {
  const created = await LiveSessionModel.create('ABCD-EFGH', 1_000);
  const hostIdentity = await created.model.consumeTicket(created.ticket, 1_001);
  assert.equal(hostIdentity.ok, true);
  if (!hostIdentity.ok) throw new Error('host ticket failed');
  created.model.connect(hostIdentity.value, 1_001);
  return created;
}

test('verified Discord user maps to one participant and refreshes Activity credential', async () => {
  const f = await fixture();
  const first = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary', 2_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary Updated', 3_000);
  assert.equal(second.ok, true);
  if (!second.ok) return;

  assert.equal(second.value.participantId, first.value.participantId);
  assert.notEqual(second.value.activityCredential, first.value.activityCredential);
  assert.equal(second.value.displayName, 'Mary Updated');
  assert.equal(f.model.summary().participants.length, 1);
});

test('Activity resume credential is bound to participant and current instance', async () => {
  const f = await fixture();
  const joined = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary', 2_000);
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const resumed = await f.model.resumeDiscordParticipant('instance_one', joined.value.participantId, joined.value.activityCredential, 3_000);
  assert.equal(resumed.ok, true);

  const wrongInstance = await f.model.resumeDiscordParticipant('instance_two', joined.value.participantId, joined.value.activityCredential, 3_000);
  assert.equal(wrongInstance.ok, false);
  if (!wrongInstance.ok) assert.equal(wrongInstance.error.error.code, 'AUTH_FAILED');

  const standaloneResume = await f.model.resume(joined.value.participantId, joined.value.activityCredential, 3_000);
  assert.equal(standaloneResume.ok, false);
  if (!standaloneResume.ok) assert.equal(standaloneResume.error.error.code, 'AUTH_FAILED');
});

test('Discord participant obeys join lock on first entry but can rejoin same identity', async () => {
  const f = await fixture();
  const first = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary', 2_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const locked = await f.model.setAcceptingJoins(f.hostCredential, false);
  assert.equal(locked.ok, true);

  const known = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary', 3_000);
  assert.equal(known.ok, true);
  if (known.ok) assert.equal(known.value.participantId, first.value.participantId);

  const newUser = await f.model.joinDiscordParticipant('instance_one', '205519959982473218', 'Other', 3_000);
  assert.equal(newUser.ok, false);
  if (!newUser.ok) assert.equal(newUser.error.error.code, 'JOIN_LOCKED');
});

test('Activity credential authorizes live assets but never host authority', async () => {
  const f = await fixture();
  const joined = await f.model.joinDiscordParticipant('instance_one', '205519959982473217', 'Mary', 2_000);
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const asset = await f.model.authorizeAssetRead(joined.value.activityCredential);
  assert.equal(asset.ok, true);

  assert.equal(await f.model.authenticateHost(joined.value.activityCredential), false);
  const hostTicket = await f.model.hostTicket(joined.value.activityCredential, 3_000);
  assert.equal(hostTicket.ok, false);
  if (!hostTicket.ok) assert.equal(hostTicket.error.error.code, 'AUTH_FAILED');
});
