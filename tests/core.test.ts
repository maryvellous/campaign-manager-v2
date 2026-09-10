import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateRelativePath, validateNoteId, parseMetadata, CampaignError } from '../packages/core/src/index';

test('portable relative paths preserve Unicode and spaces', () => {
  assert.equal(validateNoteId('Luoghi/Città perduta.md'), 'Luoghi/Città perduta.md');
  assert.equal(validateRelativePath('', true), '');
});
test('paths cannot escape root or use Windows special names', () => {
  for (const id of ['../x.md', '/x.md', 'C:/x.md', 'a\\x.md', 'a//b.md', 'a/./b.md', 'NUL.md', 'com1.txt', 'LPT¹.md', 'a. ', 'a/b.', 'a\u0000.md', 'x:stream.md', '']) assert.throws(() => validateRelativePath(id), CampaignError, id);
  assert.throws(() => validateNoteId('image.png'), CampaignError);
});
test('metadata validates schema and preserves unknown user fields', () => {
  const metadata = { schemaVersion: 1, campaignId: randomUUID(), custom: { keep: true } };
  assert.deepEqual(parseMetadata(metadata), metadata);
  for (const invalid of [null, [], {}, { schemaVersion: 1, campaignId: '../../outside' }, { ...metadata, name: 3 }]) assert.throws(() => parseMetadata(invalid), { code: 'metadata_invalid' });
  assert.throws(() => parseMetadata({ ...metadata, schemaVersion: 2 }), { code: 'unsupported_schema' });
});
