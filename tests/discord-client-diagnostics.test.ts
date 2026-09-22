import test from 'node:test';
import assert from 'node:assert/strict';
import { discordAuthFailure } from '../apps/activity/discord-diagnostics';

test('Discord auth diagnostics identify the failing stage and keep Error messages', () => {
  assert.equal(
    discordAuthFailure('authorize', new Error('scope identify rejected')),
    'Autorizzazione Discord fallita: scope identify rejected'
  );
  assert.equal(
    discordAuthFailure('authenticate', new Error('Invalid command')),
    'Autenticazione Discord fallita: Invalid command'
  );
});

test('Discord auth diagnostics preserve structured code/message without serializing arbitrary fields', () => {
  const message = discordAuthFailure('authenticate', {
    code: 4004,
    message: 'Authentication failed',
    access_token: 'must-never-appear',
    nested: { secret: 'must-never-appear-either' }
  });
  assert.equal(message, 'Autenticazione Discord fallita: Authentication failed [4004]');
  assert.doesNotMatch(message, /must-never-appear/u);
});

test('Discord auth diagnostics redact obvious credentials from SDK messages', () => {
  const message = discordAuthFailure('join', {
    code: 'AUTH_FAILED',
    message: 'authorization=secret-value Bearer abc.def.ghi access_token=other-secret'
  });
  assert.equal(
    message,
    'Ingresso Activity fallito: authorization=[redacted] Bearer [redacted] access_token=[redacted] [AUTH_FAILED]'
  );
});

test('Discord auth diagnostics remain useful when the SDK rejects with an unknown value', () => {
  assert.equal(
    discordAuthFailure('authenticate', null),
    'Autenticazione Discord fallita: Discord non ha fornito dettagli utilizzabili.'
  );
});
