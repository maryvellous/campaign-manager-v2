import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_PAIRING_TTL_MS, SessionDirectoryModel } from '../services/relay/session-model';

test('activity pairing is one-use and expires after five minutes', () => {
  const directory = new SessionDirectoryModel();
  const created = directory.reserveActivityPairing('ABC-DEF', 'session_one', 1_000);
  assert.deepEqual(created, { liveSessionId: 'session_one', expiresAt: 1_000 + ACTIVITY_PAIRING_TTL_MS });

  const consumed = directory.consumeActivityPairing('ABC-DEF', 'instance_one', 2_000);
  assert.deepEqual(consumed, { liveSessionId: 'session_one', pairedAt: 2_000 });
  assert.equal(directory.consumeActivityPairing('ABC-DEF', 'instance_two', 2_001), undefined);
  assert.deepEqual(directory.activityBinding('instance_one'), { liveSessionId: 'session_one', pairedAt: 2_000 });

  directory.reserveActivityPairing('GHI-JKL', 'session_two', 10_000);
  assert.equal(directory.consumeActivityPairing('GHI-JKL', 'instance_expired', 10_000 + ACTIVITY_PAIRING_TTL_MS), undefined);
  assert.equal(directory.activityBinding('instance_expired'), undefined);
});

test('regenerating pairing invalidates the prior code for the same live session', () => {
  const directory = new SessionDirectoryModel();
  directory.reserveActivityPairing('ABC-DEF', 'session_one', 1_000);
  directory.reserveActivityPairing('GHI-JKL', 'session_one', 2_000);

  assert.equal(directory.consumeActivityPairing('ABC-DEF', 'instance_old', 2_100), undefined);
  assert.deepEqual(directory.consumeActivityPairing('GHI-JKL', 'instance_new', 2_100), { liveSessionId: 'session_one', pairedAt: 2_100 });
});

test('new instance pairing replaces the prior instance for the same live session', () => {
  const directory = new SessionDirectoryModel();
  directory.reserveActivityPairing('ABC-DEF', 'session_one', 1_000);
  directory.consumeActivityPairing('ABC-DEF', 'instance_one', 1_100);
  assert.ok(directory.activityBinding('instance_one'));

  directory.reserveActivityPairing('GHI-JKL', 'session_one', 2_000);
  directory.consumeActivityPairing('GHI-JKL', 'instance_two', 2_100);

  assert.equal(directory.activityBinding('instance_one'), undefined);
  assert.deepEqual(directory.activityBinding('instance_two'), { liveSessionId: 'session_one', pairedAt: 2_100 });
  assert.deepEqual(directory.activityBindingForSession('session_one'), { instanceId: 'instance_two', pairedAt: 2_100 });
});

test('an already bound instance cannot consume another session pairing', () => {
  const directory = new SessionDirectoryModel();
  directory.reserveActivityPairing('ABC-DEF', 'session_one', 1_000);
  directory.consumeActivityPairing('ABC-DEF', 'instance_one', 1_100);
  directory.reserveActivityPairing('GHI-JKL', 'session_two', 2_000);

  assert.equal(directory.consumeActivityPairing('GHI-JKL', 'instance_one', 2_100), undefined);
  assert.equal(directory.activityBindingForSession('session_two'), undefined);
});

test('session removal invalidates pairing codes and activity binding', () => {
  const directory = new SessionDirectoryModel();
  directory.reserve('ABCD-EFGH', 'session_one');
  directory.reserveActivityPairing('ABC-DEF', 'session_one', 1_000);
  directory.consumeActivityPairing('ABC-DEF', 'instance_one', 1_100);
  directory.reserveActivityPairing('GHI-JKL', 'session_one', 2_000);

  directory.removeSession('ABCD-EFGH', 'session_one');

  assert.equal(directory.resolve('ABCD-EFGH'), undefined);
  assert.equal(directory.activityBinding('instance_one'), undefined);
  assert.equal(directory.consumeActivityPairing('GHI-JKL', 'instance_two', 2_100), undefined);
});
