import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope, PROTOCOL_VERSION, safeError, validateActivityBindingStatus, validateActivityJoinRequest, validateActivityPairRequest, validateActivityPairingCode, validateActivityPairingResponse, validateActivityResumeRequest, validateCameraFocusPayload, validateElementHiddenEvent, validateElementRevealedEvent, validateEnvelope, validateJoinPolicy, validateJoinRequest, validateLiveBoardSnapshot, validatePingPayload, validateResumeRequest, validateTokenAssignRequest, validateTokenClearRequest, validateTokenMovePayload } from '../packages/protocol/src/index';

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


test('board snapshot and incremental events require validated sequence and payloads', () => {
  const boardId = 'board_123';
  const element = { elementId: 'element_1', type: 'text', x: 0, y: 0, width: 100, height: 50, z: 1, text: 'public' };
  const snapshot = validateLiveBoardSnapshot({ boardId, title: 'Scene', elements: [element], stateSeq: 3 });
  assert.ok(snapshot);
  assert.equal(snapshot?.stateSeq, 3);
  assert.equal(validateLiveBoardSnapshot({ boardId, title: 'Scene', elements: [element], stateSeq: -1 }), undefined);

  const revealed = validateElementRevealedEvent({ boardId, element, stateSeq: 4 });
  assert.ok(revealed);
  assert.equal(revealed?.element.elementId, 'element_1');
  assert.equal(validateElementRevealedEvent({ boardId, element: { ...element, width: -1 }, stateSeq: 4 }), undefined);

  assert.deepEqual(validateElementHiddenEvent({ boardId, elementIds: ['element_1'], stateSeq: 5 }), { boardId, elementIds: ['element_1'], stateSeq: 5 });
  assert.equal(validateElementHiddenEvent({ boardId, elementIds: ['element_1', 'element_1'], stateSeq: 5 }), undefined);
});


test('mutating envelopes preserve a safe requestId', () => {
  const message = envelope('token.move.commit', { boardId: 'board_1' }, 'req_abc-123');
  assert.deepEqual(validateEnvelope(message), message);
  assert.equal(validateEnvelope({ ...message, requestId: '../bad' }), undefined);
});

test('token control move ping and focus payloads are narrowly validated', () => {
  assert.deepEqual(validateTokenAssignRequest({ boardId: 'board_1', tokenId: 'token_1', participantId: 'participant_1' }), { boardId: 'board_1', tokenId: 'token_1', participantId: 'participant_1' });
  assert.deepEqual(validateTokenClearRequest({ boardId: 'board_1', tokenId: 'token_1' }), { boardId: 'board_1', tokenId: 'token_1' });
  assert.deepEqual(validateTokenMovePayload({ boardId: 'board_1', tokenId: 'token_1', x: -12.5, y: 99 }), { boardId: 'board_1', tokenId: 'token_1', x: -12.5, y: 99 });
  assert.equal(validateTokenMovePayload({ boardId: 'board_1', tokenId: 'token_1', x: Infinity, y: 0 }), undefined);
  assert.deepEqual(validatePingPayload({ boardId: 'board_1', x: 1, y: 2 }), { boardId: 'board_1', x: 1, y: 2 });
  assert.deepEqual(validateCameraFocusPayload({ boardId: 'board_1', mode: 'fit' }), { boardId: 'board_1', mode: 'fit' });
  assert.equal(validateCameraFocusPayload({ boardId: 'board_1', mode: 'free' }), undefined);
});

test('player board snapshot can expose only the current player controllable token ids', () => {
  const snapshot = validateLiveBoardSnapshot({
    boardId: 'board_1',
    title: 'Arena',
    stateSeq: 7,
    controlledTokenIds: ['token_1', 'token_1'],
    elements: [{ elementId: 'token_1', type: 'token', name: 'Hero', x: 0, y: 0, width: 80, height: 80, z: 1 }]
  });
  assert.deepEqual(snapshot?.controlledTokenIds, ['token_1']);
  assert.equal(validateLiveBoardSnapshot({
    boardId: 'board_1',
    title: 'Arena',
    stateSeq: 7,
    controlledTokenIds: ['../bad'],
    elements: []
  }), undefined);
});


test('Discord Activity pairing protocol accepts only opaque instance and short pairing code', () => {
  assert.deepEqual(validateActivityPairRequest({ instanceId: 'instance_abc.123:test', pairingCode: 'ABC-DEF' }), {
    instanceId: 'instance_abc.123:test',
    pairingCode: 'ABC-DEF'
  });
  assert.equal(validateActivityPairRequest({ instanceId: '../bad', pairingCode: 'ABC-DEF' }), undefined);
  assert.equal(validateActivityPairingCode('abc-def'), undefined);
  assert.equal(validateActivityPairingCode('ABC-DEF'), 'ABC-DEF');
  assert.deepEqual(validateActivityPairingResponse({ pairingCode: 'ABC-DEF', expiresAt: 123456 }), { pairingCode: 'ABC-DEF', expiresAt: 123456 });
});

test('unbound Activity status contains no session or campaign data', () => {
  assert.deepEqual(validateActivityBindingStatus({ bound: false }), { bound: false });
  assert.deepEqual(validateActivityBindingStatus({ bound: false, liveSessionId: 'session_secret', board: { private: true } }), { bound: false });
  assert.deepEqual(validateActivityBindingStatus({ bound: true, pairedAt: 123456 }), { bound: true, pairedAt: 123456 });
});


test('Discord Activity join and resume requests reject spoofable or malformed identity input', () => {
  assert.deepEqual(validateActivityJoinRequest({ instanceId: 'instance_one', code: 'oauth-code-value' }), {
    instanceId: 'instance_one',
    code: 'oauth-code-value'
  });
  assert.equal(validateActivityJoinRequest({ instanceId: '../bad', code: 'oauth-code-value' }), undefined);
  assert.equal(validateActivityJoinRequest({ instanceId: 'instance_one', code: '' }), undefined);
  assert.equal(validateActivityJoinRequest({ instanceId: 'instance_one', code: 'oauth-code-value', discordUserId: 'spoofed' })?.instanceId, 'instance_one');

  assert.deepEqual(validateActivityResumeRequest({
    instanceId: 'instance_one',
    participantId: 'participant_abc',
    activityCredential: 'activity_secret_123'
  }), {
    instanceId: 'instance_one',
    participantId: 'participant_abc',
    activityCredential: 'activity_secret_123'
  });
  assert.equal(validateActivityResumeRequest({
    instanceId: 'instance_one',
    participantId: '../participant',
    activityCredential: 'activity_secret_123'
  }), undefined);
});
