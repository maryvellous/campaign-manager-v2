import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { clearTimeout as cancelTimer, setTimeout as schedule } from 'node:timers';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 8791;
const origin = `http://127.0.0.1:${port}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const wrangler = spawn(npx, ['--yes', 'wrangler@4.136.1', 'dev', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NO_COLOR: '1' }
});

let logs = '';
for (const stream of [wrangler.stdout, wrangler.stderr]) stream.on('data', chunk => { logs += String(chunk); if (logs.length > 20_000) logs = logs.slice(-20_000); });

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler exited early\n${logs}`);
    try {
      const response = await globalThis.fetch(origin);
      if (response.ok) return;
    } catch { /* readiness/close errors are expected in smoke cleanup */ }
    await sleep(250);
  }
  throw new Error(`wrangler did not become ready\n${logs}`);
}

async function jsonRequest(path, { method = 'POST', body, credential } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (credential) headers.authorization = `Bearer ${credential}`;
  const response = await globalThis.fetch(origin + path, {
    method,
    headers,
    signal: globalThis.AbortSignal.timeout(8_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(value)}`);
  return value;
}

function socketUrl(sessionId) {
  return `ws://127.0.0.1:${port}/api/sessions/${encodeURIComponent(sessionId)}/ws`;
}

function connectSocket(sessionId, ticket) {
  return new Promise((resolve, reject) => {
    const socket = new globalThis.WebSocket(socketUrl(sessionId), ['cmv2.v1', `cmv2.ticket.${ticket}`]);
    const inbox = [];
    const timeout = schedule(() => {
      try { socket.close(); } catch { /* close is best-effort */ }
      reject(new Error('websocket connection timed out'));
    }, 8_000);
    socket.addEventListener('message', event => {
      try { inbox.push({ at: globalThis.performance.now(), value: JSON.parse(String(event.data)) }); } catch { /* malformed smoke message is ignored */ }
    });
    socket.addEventListener('open', () => {
      cancelTimer(timeout);
      resolve({ socket, inbox });
    });
    socket.addEventListener('error', () => {
      cancelTimer(timeout);
      reject(new Error('websocket connection failed'));
    });
  });
}

async function waitMessage(client, predicate, timeout = 5_000) {
  const deadline = globalThis.performance.now() + timeout;
  while (globalThis.performance.now() < deadline) {
    const index = client.inbox.findIndex(item => predicate(item.value));
    if (index >= 0) return client.inbox.splice(index, 1)[0];
    await sleep(10);
  }
  throw new Error('timed out waiting for websocket message');
}

function message(type, payload, requestId) {
  return JSON.stringify({
    protocolVersion: 1,
    type,
    payload,
    ...(requestId ? { requestId } : {})
  });
}

const sockets = [];
try {
  await waitForServer();
  assert.equal(typeof globalThis.WebSocket, 'function', 'Node runtime must expose WebSocket');

  const created = await jsonRequest('/api/sessions', { body: {} });
  assert.ok(created.liveSessionId);
  assert.ok(created.hostCredential);
  const host = await connectSocket(created.liveSessionId, created.ticket);
  sockets.push(host.socket);
  await waitMessage(host, value => value.type === 'connection.ready');

  const players = [];
  for (let index = 0; index < 8; index++) {
    const joined = await jsonRequest('/api/join', { body: { joinCode: created.joinCode, displayName: `Smoke ${index + 1}` } });
    const client = await connectSocket(created.liveSessionId, joined.ticket);
    sockets.push(client.socket);
    await waitMessage(client, value => value.type === 'connection.ready');
    players.push({ ...joined, client });
  }

  const boardId = 'board_network_smoke';
  const tokenId = 'token_network_smoke';
  await jsonRequest(`/api/sessions/${created.liveSessionId}/publish-board`, {
    credential: created.hostCredential,
    body: {
      board: {
        boardId,
        title: 'Network smoke',
        elements: [{ type: 'token', elementId: tokenId, name: 'Smoke token', x: 10, y: 20, width: 80, height: 80, z: 1 }]
      }
    }
  });

  for (const player of players) await waitMessage(player.client, value => value.type === 'board.snapshot');

  await jsonRequest(`/api/sessions/${created.liveSessionId}/token-controller/assign`, {
    credential: created.hostCredential,
    body: { boardId, tokenId, participantId: players[0].participantId }
  });
  await waitMessage(players[0].client, value => value.type === 'token.controller' && value.payload?.controlled === true);

  // Production player throttles preview to roughly one every 35 ms (~28.6/s).
  // Measure that cadence against the real local Worker + Durable Object with 8 connected players.
  const previewDurationMs = 2_000;
  const previewIntervalMs = 35;
  const previewStartedAt = globalThis.performance.now();
  let previewSent = 0;
  while (globalThis.performance.now() - previewStartedAt < previewDurationMs) {
    previewSent += 1;
    players[0].client.socket.send(message('token.move.preview', { boardId, tokenId, x: 10 + previewSent, y: 20 + previewSent }));
    await sleep(previewIntervalMs);
  }

  const requestId = 'req_network_smoke_commit';
  const finalPosition = { x: 420, y: 315 };
  const commitStartedAt = globalThis.performance.now();
  players[0].client.socket.send(message('token.move.commit', { boardId, tokenId, ...finalPosition }, requestId));
  const accepted = await waitMessage(players[0].client, value => value.type === 'request.accepted' && value.requestId === requestId);
  const commitAckMs = accepted.at - commitStartedAt;
  await waitMessage(players[0].client, value => value.type === 'token.position' && value.payload?.x === finalPosition.x && value.payload?.y === finalPosition.y);

  players[0].client.socket.send(message('snapshot.request', {}));
  const snapshotMessage = await waitMessage(players[0].client, value => value.type === 'board.snapshot');
  const token = snapshotMessage.value.payload.elements.find(element => element.elementId === tokenId);
  assert.deepEqual({ x: token.x, y: token.y }, finalPosition);

  const previewReceivedByController = players[0].client.inbox.filter(item => item.value.type === 'token.move.preview').length;
  assert.ok(previewSent >= 45, `preview cadence unexpectedly low: ${previewSent}`);
  assert.ok(previewReceivedByController > 0, 'relay did not fan out any drag preview');
  assert.ok(commitAckMs < 5_000, `final commit ack timed out operational budget: ${commitAckMs.toFixed(1)}ms`);

  console.log(JSON.stringify({
    players: players.length,
    previewDurationMs,
    previewIntervalMs,
    previewSent,
    previewReceivedByController,
    commitAckMs: Number(commitAckMs.toFixed(1)),
    finalStateSeq: snapshotMessage.value.payload.stateSeq
  }));

  await jsonRequest(`/api/sessions/${created.liveSessionId}/end`, { credential: created.hostCredential, body: {} });
} finally {
  for (const socket of sockets) {
    try { socket.close(); } catch { /* readiness/close errors are expected in smoke cleanup */ }
  }
  if (wrangler.exitCode === null) wrangler.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => wrangler.once('exit', resolve)),
    sleep(5_000)
  ]);
}
