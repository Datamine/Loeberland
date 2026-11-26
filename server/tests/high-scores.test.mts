import test from 'node:test';
import assert from 'node:assert/strict';
import { createHighScores } from '../high-scores.mts';
import { createMemoryStore } from '../store.mts';
import { hydratePlayerProfile } from '../../src/player-document.ts';
import { SKILL_THRESHOLDS } from '../../src/progression.ts';
import { COLLECTION_ITEMS } from '../../src/config/collection.ts';
import { PYROMANIAC_PETER } from '../../src/config/fireworks.ts';
import { ALIEN_TARGETS } from '../../src/they-live.ts';
import type { NameReservation } from '../../src/types/storage.ts';
import type { PlayerProfile } from '../../src/types/profile.ts';
import { createGame } from '../game.mts';
import { createInventoryAccount } from '../inventory.mts';
import {
  command,
  fixture,
  fixtureGeometry,
  player,
  requiredResult,
  storedPlayerFixture,
} from './fixtures.mts';

test('high scores rank online and offline characters by bank plus purse and by Strength XP', async () => {
  const store = createMemoryStore();
  const names = new Map<string, NameReservation>();
  const profiles = new Map();
  const now = 3_600_001;
  const level50XP = SKILL_THRESHOLDS.at(-1)!;
  for (let i = 1; i <= 22; i++) {
    const owner = 'p' + i,
      name = 'Player_' + i;
    names.set(owner, { owner, name, canonical: name.toLowerCase(), changed: 0 });
    const profile = hydratePlayerProfile({});
    profile.playerState.inventory.economy.coins = i;
    profile.playerState.skills.strength.xp = i >= 21 ? level50XP + i : 1800 - i;
    if (i > 1)
      profile.playerState.progress.gameCompletion = {
        at: now - i * 1000,
        recordedOnVerification: i === 22,
      };
    if (i === 1) profile.playerState.finance.bank = { balance: 100.7, updatedAt: 1 };
    if (i === 22) profiles.set(owner, profile);
    else await store.batch([['player:' + owner, { playerState: profile.playerState }]]);
  }
  const scores = await createHighScores(store, names, profiles, () => now)();
  assert.equal(scores.coins.length, 20);
  assert.equal(scores.strength.length, 20);
  assert.equal(scores.coins[0].name, 'Player_1');
  assert.equal(scores.coins[0].coins, 106);
  assert.ok(scores.coins.every((row) => Number.isInteger(row.coins)));
  assert.equal(scores.coins[1].name, 'Player_22');
  assert.deepEqual(scores.strength.slice(0, 2), [
    { name: 'Player_22', xp: level50XP + 22, level: 50 },
    { name: 'Player_21', xp: level50XP + 21, level: 50 },
  ]);
  assert.equal('owner' in scores.coins[0], false);
  assert.equal(scores.completion.length, 21);
  assert.deepEqual(
    scores.completion.map((row) => row.name),
    Array.from({ length: 21 }, (_, i) => 'Player_' + (22 - i)),
  );
  assert.deepEqual(scores.completion[0], {
    name: 'Player_22',
    at: now - 22_000,
    recordedOnVerification: true,
  });
});

function completedQuests(profile: PlayerProfile) {
  const { quests } = profile.playerState;
  quests.monkey.stage = 'completed';
  quests.stochasticParrot.stage = 'proof';
  quests.burningMan.stage = 'completed';
  quests.lightsaber.stage = 'completed';
  Object.assign(quests.theyLive, {
    started: true,
    evidence: true,
    permit: true,
    bayonet: true,
    defeated: ALIEN_TARGETS.map(({ id }) => id),
    completed: true,
    skateboard: true,
  });
  Object.assign(quests.expeditions, {
    raptor: 'completed',
    raptorDefeated: true,
    railgun: true,
    krakenStarted: true,
    krakenDefeated: true,
    krakenReward: true,
    cape: true,
  });
  Object.assign(quests.illuminatus, { initiated: true, bomberOwned: true });
}

test('the last quest and last collection item are both required, then completion time is permanent', async () => {
  const { game, geometry, advance, store } = await fixture();
  const a = await player(game, 17101, { 'sf-purse-v1': '{"coins":150,"saltLetters":1}' });
  const trade = async (kind: string) => {
    game.receive(a.p, {
      type: 'command',
      request: Math.random(),
      action: 'inventory',
      args: { op: 'trade', kind },
      inventoryEpoch: a.p.inventory.meta.epoch,
    });
    await a.p.queue;
    assert.ok(requiredResult(a.messages).ok, requiredResult(a.messages).message);
  };
  const rankings = async () => {
    await command(game, a.p, 'highScores');
    return requiredResult(a.messages).highScores?.completion;
  };
  try {
    const here = { x: a.p.x, z: a.p.z, base: a.p.y, label: 'Merchant' };
    geometry.merchants.push(
      { ...here, id: PYROMANIAC_PETER.id },
      { ...here, id: 'test-clerk', kind: 'clerk' },
    );
    completedQuests(a.p.profile);
    a.p.profile.collection = COLLECTION_ITEMS.map(({ id }) => id).filter(
      (id) => id !== 'fireworks',
    );
    assert.deepEqual(await rankings(), []);

    await trade('fireworks');
    assert.ok(a.p.profile.collection.includes('fireworks'));
    assert.equal(a.p.profile.playerState.progress.gameCompletion, null);
    assert.deepEqual(await rankings(), []);

    const at = advance(1200);
    await trade('salt-letter-deliver');
    assert.deepEqual(await rankings(), [{ name: a.p.name, at, recordedOnVerification: false }]);
    const saved = await storedPlayerFixture(store, 'player:' + a.p.owner);
    assert.deepEqual(saved.playerState.progress.gameCompletion, {
      at,
      recordedOnVerification: false,
    });

    advance(60_000);
    await command(game, a.p, 'rename', { name: 'Finisher' });
    assert.ok(requiredResult(a.messages).ok);
    assert.deepEqual(await rankings(), [{ name: 'Finisher', at, recordedOnVerification: false }]);
  } finally {
    await game.close();
  }
});

test('older complete saves get a stable verification timestamp while offline', async () => {
  const store = createMemoryStore();
  const profile = hydratePlayerProfile({});
  completedQuests(profile);
  profile.playerState.inventory.economy.saltLettersDelivered = 1;
  profile.collection = COLLECTION_ITEMS.map(({ id }) => id).filter((id) => id !== 'fireworks');
  createInventoryAccount(profile).meta.fireworks = 1;
  const owner = 'old-finisher';
  await store.rename(owner, 'earlyfinisher', 'EarlyFinisher', 0);
  await store.batch([['player:' + owner, { playerState: profile.playerState }]]);

  for (const at of [3_000_000, 4_000_000]) {
    const game = await createGame({ geometry: fixtureGeometry(), store, now: () => at });
    try {
      const a = await player(game, 17102);
      await command(game, a.p, 'highScores');
      assert.deepEqual(requiredResult(a.messages).highScores?.completion, [
        { name: 'EarlyFinisher', at: 3_000_000, recordedOnVerification: true },
      ]);
      const saved = await storedPlayerFixture(store, 'player:' + owner);
      assert.deepEqual(saved.playerState.progress.gameCompletion, {
        at: 3_000_000,
        recordedOnVerification: true,
      });
    } finally {
      await game.close();
    }
  }
});

test('receiving the last collectible through a trade saves completion with the exchange', async () => {
  const { game, advance, store } = await fixture();
  const a = await player(game, 17103);
  const b = await player(game, 17104, { 'sf-deli-v1': '{"sandwiches":1}' });
  const currentOffer = () => {
    const view = b.messages.findLast((message) => message.type === 'tradeView');
    assert.ok(view?.type === 'tradeView');
    return { trade: view.trade.id, revision: view.trade.revision };
  };
  try {
    completedQuests(a.p.profile);
    a.p.inventory.economy.state.saltLettersDelivered = 1;
    a.p.profile.collection = COLLECTION_ITEMS.map(({ id }) => id).filter((id) => id !== 'sandwich');
    a.p.inventory.save();
    await command(game, b.p, 'tradeRequest', { id: a.p.id });
    await command(game, a.p, 'tradeJoin', currentOffer());
    await command(game, b.p, 'tradeOffer', {
      ...currentOffer(),
      items: [{ id: 'sandwich', quantity: 1 }],
    });
    await command(game, b.p, 'tradeConfirm', currentOffer());
    assert.equal(a.p.profile.playerState.progress.gameCompletion, null);
    const at = advance(2200);
    await command(game, a.p, 'tradeConfirm', currentOffer());
    assert.ok(requiredResult(a.messages).ok);
    const saved = await storedPlayerFixture(store, 'player:' + a.p.owner);
    const completion = { at, recordedOnVerification: false };
    assert.deepEqual(saved.playerState.progress.gameCompletion, completion);
    assert.deepEqual(a.p.profile.playerState.progress.gameCompletion, completion);
    assert.ok(saved.playerState.inventory.collection.includes('sandwich'));
  } finally {
    await game.close();
  }
});
