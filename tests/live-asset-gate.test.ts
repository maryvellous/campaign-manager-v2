import test from 'node:test';
import assert from 'node:assert/strict';
import { assetsAvailable } from '../services/relay/worker';

test('asset gate succeeds only when every referenced live asset exists', async () => {
  const existing = new Set(['session_one/asset_a', 'session_one/asset_b']);
  const bucket = {
    async head(key: string) { return existing.has(key) ? { key } : null; },
    async put() { return undefined; },
    async get() { return null; },
    async list() { return { objects: [], truncated: false }; },
    async delete() { return undefined; }
  };

  assert.equal(await assetsAvailable(bucket, 'session_one', []), true);
  assert.equal(await assetsAvailable(bucket, 'session_one', ['asset_a']), true);
  assert.equal(await assetsAvailable(bucket, 'session_one', ['asset_a', 'asset_b']), true);
  assert.equal(await assetsAvailable(bucket, 'session_one', ['asset_a', 'asset_missing']), false);
});
