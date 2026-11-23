import { requiredFixture } from '../../tests/helpers/required.mts';
import { MP_PROTOCOL } from '../../src/multiplayer-protocol.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../index.mts';
import { createMemoryStore } from '../store.mts';
import { fixtureGeometry } from './fixtures.mts';
import gamePackage from '../../package.json' with { type: 'json' };

test('real WebSockets authenticate, exchange nearby avatars, moderate names and recover the same account', async () => {
  const server = await startServer({
      port: 0,
      geometry: fixtureGeometry(),
      store: createMemoryStore(),
    }),
    clients: WebSocket[] = [];
  const open = async (token: string) => {
    const ws = new WebSocket('ws://127.0.0.1:' + server.port + '/ws'),
      messages: import('../../src/types/network.ts').ServerEvent[] = [];
    clients.push(ws);
    ws.on('message', (data, binary) => {
      if (!binary) messages.push(JSON.parse(data.toString()));
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'hello', protocol: MP_PROTOCOL, token, privateState: {} }));
    return { ws, messages };
  };
  const until = async (predicate: () => boolean) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('Timed out waiting for a WebSocket event');
  };
  try {
    const a = await open('a'.repeat(64)),
      b = await open('b'.repeat(64));
    await until(
      () =>
        a.messages.some((m) => m.type === 'welcome') &&
        b.messages.some((m) => m.type === 'interest' && m.enter.length),
    );
    a.ws.send(
      JSON.stringify({ type: 'command', request: 1, action: 'rename', args: { name: 'BayPilot' } }),
    );
    await until(() => a.messages.some((m) => m.type === 'result' && m.request === 1));
    assert.equal(
      requiredFixture(a.messages.filter((m) => m.type === 'result').find((m) => m.request === 1))
        .ok,
      true,
    );
    b.ws.send(
      JSON.stringify({ type: 'command', request: 2, action: 'rename', args: { name: 'baypilot' } }),
    );
    await until(() => b.messages.some((m) => m.type === 'result' && m.request === 2));
    assert.equal(
      requiredFixture(b.messages.filter((m) => m.type === 'result').find((m) => m.request === 2))
        .ok,
      false,
    );
    b.ws.send(
      JSON.stringify({ type: 'command', request: 3, action: 'rename', args: { name: 'sh1t' } }),
    );
    await until(() => b.messages.some((m) => m.type === 'result' && m.request === 3));
    assert.equal(
      requiredFixture(b.messages.filter((m) => m.type === 'result').find((m) => m.request === 3))
        .ok,
      false,
    );
    const reconnect = await open('a'.repeat(64));
    await until(() => reconnect.messages.some((m) => m.type === 'welcome'));
    assert.equal(
      requiredFixture(reconnect.messages.find((m) => m.type === 'welcome')).name,
      'BayPilot',
    );
    const health = await (await fetch('http://127.0.0.1:' + server.port + '/healthz')).json();
    const serverBuild = requiredFixture(
      reconnect.messages.find((m) => m.type === 'welcome')?.serverBuild,
    );
    assert.equal(serverBuild.version, gamePackage.version);
    assert.deepEqual(health.build, serverBuild);
    assert.equal(health.players, 2);
    assert.equal(health.ok, true);
    assert.ok(health.timings.broadcastMs.samples > 0);
    assert.ok(health.timings.broadcastMs.p99 >= 0);
    assert.ok(health.actions.pending >= 0);
    assert.ok(health.routes.entries <= 4096);
    assert.ok(health.network.bytes > 0);
    assert.equal(
      (await fetch('http://127.0.0.1:' + server.port + '/server/package.json')).status,
      404,
    );
    server.announceUpdate();
    await until(() =>
      [b, reconnect].every(({ messages }) =>
        messages.some(
          (message) =>
            message.type === 'notice' &&
            message.id === 'server-update' &&
            message.message === 'Server update incoming',
        ),
      ),
    );
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      reconnect.ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    await server.close();
    assert.deepEqual(await closed, { code: 1012, reason: 'Server Updating...' });
  } finally {
    for (const ws of clients) ws.terminate();
    await server.close();
  }
});
