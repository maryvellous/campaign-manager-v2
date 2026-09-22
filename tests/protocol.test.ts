import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope, PROTOCOL_VERSION, safeError, validateEnvelope, validateJoinPolicy, validateJoinRequest, validateResumeRequest } from '../packages/protocol/src/index';

test('join request accepts readable code and duplicate-safe display names', () => {
  assert.deepEqual(validateJoinRequest({ joinCode: 'ABCD-EFGH', displayName: 'Mary' }), { joinCode: 'ABCD-EFGH', displayName: 'Mary' });
  assert.equal(validateJoinRequest({ joinCode: 'abcd-efgh', displayName: 'Mary' }), undefined);
  assert.equal(validateJoinRequest({ joinCode: 'ABCD-EFGH', displayName: ' Mary ' }), undefined);
  assert.equal(validateJoinRequest({ joinCode: 'ABCD-EFGH', displayName: 'bad\nname' }), undefined);
});

test('resume request never accepts arbitrary objects or path-like credentials', () => {
  assert.deepEqual(validateResumeRequest({ liveSessionId: 'session_abc', participantId: 'participant_1', resumeCredential: 'secret_ABC-123' }), {
    liveSessionId: 'session_abc', participantId: 'participant_1', resumeCredential: 'secret_ABC-123'
  });
  assert.equal(validateResumeRequest({ liveSessionId: '../session', participantId: 'p', resumeCredential: 'x' }), undefined);
});

test('protocol envelope rejects incompatible versions', () => {
  const message = envelope('presentation.waiting', { stateSeq: 0 });
  assert.equal(message.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(validateEnvelope(message), message);
  assert.equal(validateEnvelope({ ...message, protocolVersion: 2 }), undefined);
});

test('join policy is strictly boolean and errors expose only safe code/message', () => {
  assert.deepEqual(validateJoinPolicy({ acceptingJoins: false }), { acceptingJoins: false });
  assert.equal(validateJoinPolicy({ acceptingJoins: 'false' }), undefined);
  assert.deepEqual(safeError('JOIN_LOCKED', 'Gli ingressi sono chiusi.'), { error: { code: 'JOIN_LOCKED', message: 'Gli ingressi sono chiusi.' } });
});
