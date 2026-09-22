import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDiscordActivityInstance, verifyDiscordActivityUser, verifyDiscordInstanceMembership } from '../services/relay/worker';

const env = {
  DISCORD_CLIENT_ID: '1215413995645968394',
  DISCORD_CLIENT_SECRET: 'server-secret',
  DISCORD_BOT_TOKEN: 'server-bot-token'
} as Parameters<typeof verifyDiscordActivityUser>[0];

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('OAuth code is exchanged server-side and identity must belong to exact Activity instance', async () => {
  const calls: Array<{ url: string; authorization?: string; body?: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      ...(headers.get('authorization') ? { authorization: headers.get('authorization')! } : {}),
      ...(typeof init?.body === 'string' ? { body: init.body } : init?.body instanceof URLSearchParams ? { body: init.body.toString() } : {})
    });

    if (url.endsWith('/oauth2/token')) return response({ access_token: 'oauth-access', token_type: 'Bearer' });
    if (url.endsWith('/users/@me')) return response({ id: '205519959982473217', username: 'mary', global_name: 'Mary' });
    if (url.includes('/activity-instances/instance_one')) return response({
      application_id: env.DISCORD_CLIENT_ID,
      instance_id: 'instance_one',
      users: ['205519959982473217']
    });
    return response({}, 404);
  };

  const verified = await verifyDiscordActivityUser(env, 'oauth-code', 'instance_one', fetcher);
  assert.deepEqual(verified, {
    userId: '205519959982473217',
    displayName: 'Mary',
    accessToken: 'oauth-access'
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0].body ?? '', /client_secret=server-secret/u);
  assert.match(calls[0].body ?? '', /code=oauth-code/u);
  assert.equal(calls[1].authorization, 'Bearer oauth-access');
  assert.equal(calls[2].authorization, 'Bot server-bot-token');
});

test('client cannot spoof a Discord user that is absent from the Activity instance', async () => {
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    if (url.endsWith('/oauth2/token')) return response({ access_token: 'oauth-access', token_type: 'Bearer' });
    if (url.endsWith('/users/@me')) return response({ id: '205519959982473217', username: 'mary' });
    return response({
      application_id: env.DISCORD_CLIENT_ID,
      instance_id: 'instance_one',
      users: ['999999999999999999']
    });
  };

  assert.equal(await verifyDiscordActivityUser(env, 'oauth-code', 'instance_one', fetcher), undefined);
});

test('Activity reconnect membership check binds both application and instance ids', async () => {
  const good: typeof fetch = async () => response({
    application_id: env.DISCORD_CLIENT_ID,
    instance_id: 'instance_one',
    users: ['205519959982473217']
  });
  assert.equal(await verifyDiscordInstanceMembership(env, 'instance_one', '205519959982473217', good), true);

  const wrongInstance: typeof fetch = async () => response({
    application_id: env.DISCORD_CLIENT_ID,
    instance_id: 'instance_other',
    users: ['205519959982473217']
  });
  assert.equal(await verifyDiscordInstanceMembership(env, 'instance_one', '205519959982473217', wrongInstance), false);

  const missingUser: typeof fetch = async () => response({
    application_id: env.DISCORD_CLIENT_ID,
    instance_id: 'instance_one',
    users: []
  });
  assert.equal(await verifyDiscordInstanceMembership(env, 'instance_one', '205519959982473217', missingUser), false);
});


test('pairing can verify a real Activity instance before consuming the one-use code', async () => {
  const good: typeof fetch = async () => response({
    application_id: env.DISCORD_CLIENT_ID,
    instance_id: 'instance_one',
    users: []
  });
  assert.equal(await verifyDiscordActivityInstance(env, 'instance_one', good), true);

  const fake: typeof fetch = async () => response({
    application_id: env.DISCORD_CLIENT_ID,
    instance_id: 'instance_fake',
    users: []
  });
  assert.equal(await verifyDiscordActivityInstance(env, 'instance_one', fake), false);
});
