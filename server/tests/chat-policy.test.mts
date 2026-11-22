import assert from 'node:assert/strict';
import test from 'node:test';
import { ILLUMINATI_INSTANCE } from '../../src/map-instances.ts';
import { PLAYER_CHAT_COOLDOWN_MS, PLAYER_CHAT_LIMIT } from '../../src/player-chat.ts';
import { readChatPolicy } from '../chat-policy.mts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { command, fixtureGeometry, player } from './fixtures.mts';
import type { TestPlayer } from './fixtures.mts';

test('the deployment switches default to True and accept mixed-case True and False', () => {
  assert.deepEqual(readChatPolicy({}), {
    oauthRequired: true,
    upgradeRequiredForServerChat: true,
  });
  assert.deepEqual(
    readChatPolicy({ OAUTH_REQUIRED: 'False', UPGRADE_REQUIRED_FOR_SERVER_CHAT: 'tRuE' }),
    { oauthRequired: false, upgradeRequiredForServerChat: true },
  );
  assert.throws(() => readChatPolicy({ OAUTH_REQUIRED: 'typo' }), /OAUTH_REQUIRED/);
});

for (const oauthRequired of [true, false]) {
  for (const upgradeRequiredForServerChat of [true, false]) {
    test(`typed and server chat permissions with OAuth=${oauthRequired} and upgrade=${upgradeRequiredForServerChat}`, async () => {
      let time = 1_000_000;
      const store = createMemoryStore();
      const game = await createGame({
        geometry: fixtureGeometry(),
        store,
        now: () => time,
        oauthRequired,
        upgradeRequiredForServerChat,
      });
      try {
        let sender = await player(game, 101);
        const nearby = await player(game, 102);
        const elsewhere = await player(game, 103);
        elsewhere.p.instance = ILLUMINATI_INSTANCE;
        game.broadcast();
        const heard = (recipient: TestPlayer) =>
          recipient.messages.filter((message) => message.type === 'say').at(-1);
        async function say(text: string) {
          time += PLAYER_CHAT_COOLDOWN_MS;
          game.receive(sender.p, { type: 'say', text, upgrade: true });
          await sender.p.queue;
        }
        const welcome = sender.messages.find((message) => message.type === 'welcome');
        assert.equal(welcome?.chatUnlocked, !oauthRequired);
        assert.equal(welcome?.serverChatAllowed, !oauthRequired && !upgradeRequiredForServerChat);
        assert.equal(sender.p.profile.upgrade, false);
        await say('Hello nearby');
        assert.equal(heard(sender)?.text, oauthRequired ? undefined : 'Hello nearby');
        assert.equal(heard(nearby)?.text, oauthRequired ? undefined : 'Hello nearby');
        assert.equal(heard(elsewhere), undefined);
        await say('/Hello server');
        assert.equal(
          heard(elsewhere)?.text,
          !oauthRequired && !upgradeRequiredForServerChat ? 'Hello server' : undefined,
        );

        await command(game, sender.p, 'beginPlay');
        assert.equal(await game.grantChatUnlock(sender.token, 'google-test-subject'), true);
        const unlocked = sender.messages.find((message) => message.type === 'chatUnlocked');
        assert.equal(unlocked?.serverChatAllowed, !upgradeRequiredForServerChat);
        const before = heard(elsewhere);
        await say('/Once logged in');
        if (upgradeRequiredForServerChat) assert.equal(heard(elsewhere), before);
        else assert.equal(heard(elsewhere)?.text, 'Once logged in');

        sender.p.profile.upgrade = true;
        await game.disconnect(sender.p);
        sender = await player(game, 101);
        const upgraded = sender.messages.find((message) => message.type === 'welcome');
        assert.equal(sender.p.profile.upgrade, true);
        assert.equal(upgraded?.serverChatAllowed, true);
        await say('/  Across maps');
        for (const recipient of [sender, nearby, elsewhere])
          assert.deepEqual(heard(recipient), {
            type: 'say',
            id: sender.p.id,
            name: sender.p.name,
            scope: 'server',
            text: 'Across maps',
          });
        const latest = heard(elsewhere);
        game.receive(sender.p, { type: 'say', text: '/Too soon' });
        await sender.p.queue;
        await say('/');
        await say('/' + 'x'.repeat(PLAYER_CHAT_LIMIT));
        assert.equal(heard(elsewhere), latest);
      } finally {
        await game.close();
      }
    });
  }
}
