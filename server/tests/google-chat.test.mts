import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { CHARACTER_IDENTITY_COOKIE } from '../../src/multiplayer-protocol.ts';
import { createCheckpointManager } from '../checkpoints.mts';
import { createGame } from '../game.mts';
import { googleLinkKey, googleOwnerKey } from '../google-account-links.mts';
import { createGoogleChatRoutes, readGoogleChatConfig } from '../google-chat.mts';
import { createMemoryStore } from '../store.mts';
import { command, fixtureGeometry, player } from './fixtures.mts';

test('Google OAuth unlocks only the character that began the flow and persists across connections', async () => {
  const storage = createMemoryStore();
  const checkpoints = await createCheckpointManager({ store: storage });
  const game = await createGame({ geometry: fixtureGeometry(), store: checkpoints.openGame() });
  checkpoints.attach('world', { prepare: game.prepareCheckpoint, drain: game.close });
  try {
    const actor = await player(game, 7851);
    const other = await player(game, 7852);
    const subject = 'mock-google-subject';
    const accountLabel = 'p•••@example.com';
    const identityKey = 'character-google:' + actor.p.owner;
    await command(game, actor.p, 'beginPlay');
    const config = readGoogleChatConfig({
      GOOGLE_CHAT_CLIENT_ID: 'mock-client',
      GOOGLE_CHAT_CLIENT_SECRET: 'mock-secret',
      GOOGLE_CHAT_REDIRECT_URI: 'https://game.example/auth/google/chat/callback',
    });
    assert.ok(config);
    let oauthURL: URL;
    let exchanges = 0;
    const routes = createGoogleChatRoutes(config, game, async (endpoint, request) => {
      assert.equal(endpoint, 'https://oauth2.googleapis.com/token');
      assert.equal(request?.redirect, 'error');
      const params = request?.body;
      assert.ok(params instanceof URLSearchParams);
      assert.equal(params.get('redirect_uri'), config.redirect.href);
      const verifier = params.get('code_verifier');
      assert.ok(verifier);
      assert.equal(
        createHash('sha256').update(verifier).digest('base64url'),
        oauthURL.searchParams.get('code_challenge'),
      );
      exchanges++;
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: params.get('code') === 'wrong-audience' ? 'different-client' : config.clientId,
          nonce: oauthURL.searchParams.get('nonce'),
          exp: Date.now() / 1000 + 60,
          sub: params.get('code') === 'different-account' ? 'another-google-subject' : subject,
          email: 'private-address@example.com',
          email_verified: true,
        }),
      ).toString('base64url');
      return Response.json({
        id_token: 'header.' + payload + '.signature',
        access_token: 'private-access-token',
      });
    });
    async function request(path: string, cookie?: string) {
      const headers = new Map<string, string>();
      const req = {
        method: 'GET',
        headers: { host: config!.redirect.host, cookie },
      } as IncomingMessage;
      const res = {
        setHeader: (name: string, value: string) => headers.set(name, value),
        writeHead: (_: number, values: Record<string, string>) => {
          for (const [name, value] of Object.entries(values)) headers.set(name, value);
        },
        end() {},
      } as unknown as ServerResponse;
      assert.equal(await routes(req, res, new URL(path, config!.redirect)), true);
      return headers;
    }
    async function start(token = actor.token) {
      const headers = await request(
        '/auth/google/chat/start',
        CHARACTER_IDENTITY_COOKIE + '=' + token,
      );
      const location = headers.get('Location');
      const cookie = headers.get('Set-Cookie');
      assert.ok(location && cookie);
      assert.match(cookie, /HttpOnly; SameSite=Lax; Secure/);
      oauthURL = new URL(location);
      assert.equal(oauthURL.origin, 'https://accounts.google.com');
      assert.equal(oauthURL.searchParams.get('scope'), 'openid email');
      return { cookie: cookie.split(';')[0], state: oauthURL.searchParams.get('state') };
    }
    const callback = (state: string | null, code: string, cookie?: string) =>
      request(
        '/auth/google/chat/callback?' + new URLSearchParams({ state: state ?? '', code }),
        cookie,
      );

    game.receive(actor.p, { type: 'say', text: 'Unverified free text' });
    await actor.p.queue;
    assert.ok(!actor.messages.some((message) => message.type === 'say'));
    game.receive(actor.p, { type: 'say', text: 'ok' });
    await actor.p.queue;
    assert.ok(actor.messages.some((message) => message.type === 'say' && message.text === 'OK'));
    assert.equal(
      (await request('/auth/google/chat/start')).get('Location'),
      '/auth/google/chat/result?status=failed',
    );

    const denied = await start();
    assert.match(
      (await callback('invalid-state', 'good', denied.cookie)).get('Location') ?? '',
      /status=failed$/,
    );
    assert.match((await callback(denied.state, 'good')).get('Location') ?? '', /status=failed$/);
    assert.equal(exchanges, 0);
    assert.match(
      (await callback(denied.state, 'wrong-audience', denied.cookie)).get('Location') ?? '',
      /status=failed$/,
    );
    assert.equal(actor.p.profile.chatUnlocked, undefined);
    assert.equal(await game.store.get(identityKey), null);

    const verified = await start();
    assert.match(
      (await callback(verified.state, 'good', verified.cookie)).get('Location') ?? '',
      /status=unlocked$/,
    );
    assert.equal(actor.p.profile.chatUnlocked, true);
    assert.equal(other.p.profile.chatUnlocked, undefined);
    assert.deepEqual(await game.store.get(identityKey), { subject, label: accountLabel });
    assert.equal(await game.store.get('character-google:' + other.p.owner), null);
    assert.ok(
      actor.messages.some(
        (message) => message.type === 'chatUnlocked' && message.googleAccountLabel === accountLabel,
      ),
    );
    assert.ok(!JSON.stringify(other.messages).includes(accountLabel));
    assert.match(
      (await callback(verified.state, 'good', verified.cookie)).get('Location') ?? '',
      /status=failed$/,
    );
    assert.equal(exchanges, 2);
    await command(game, other.p, 'beginPlay');
    const alreadyLinked = await start(other.token);
    assert.match(
      (await callback(alreadyLinked.state, 'good', alreadyLinked.cookie)).get('Location') ?? '',
      /status=linked$/,
    );
    assert.equal(other.p.profile.chatUnlocked, undefined);
    assert.equal(await game.store.get(googleLinkKey(other.p.owner)), null);
    const different = await start();
    assert.match(
      (await callback(different.state, 'different-account', different.cookie)).get('Location') ??
        '',
      /status=failed$/,
    );
    assert.deepEqual(await game.store.get(identityKey), { subject, label: accountLabel });
    await game.disconnect(actor.p);
    const reconnected = await player(game, 7851);
    assert.ok(
      reconnected.messages.some(
        (message) =>
          message.type === 'welcome' &&
          message.chatUnlocked &&
          message.googleAccountLabel === accountLabel,
      ),
    );
    game.receive(reconnected.p, { type: 'say', text: 'Hello from my character' });
    await reconnected.p.queue;
    assert.ok(
      reconnected.messages.some(
        (message) => message.type === 'say' && message.text === 'Hello from my character',
      ),
    );
    for (const recipient of [actor, other, reconnected]) {
      const clientMessages = JSON.stringify(recipient.messages);
      assert.ok(!clientMessages.includes(subject));
      assert.ok(!clientMessages.includes('private-address@example.com'));
      assert.ok(!clientMessages.includes('private-access-token'));
    }
    await checkpoints.checkpoint('world');
    const [saved] = await storage.loadGames();
    const records = new Map(saved.records);
    assert.deepEqual(records.get(identityKey), { subject, label: accountLabel });
    assert.equal(records.get(googleOwnerKey(subject)), actor.p.owner);
    assert.ok(!JSON.stringify(records.get('player:' + actor.p.owner)).includes(subject));
  } finally {
    await checkpoints.shutdown();
  }
});
