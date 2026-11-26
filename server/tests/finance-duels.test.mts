import {
  storedPlayerFixture,
  fixture,
  fixtureGeometry,
  player,
  command,
  requiredResult,
} from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';

import { DUEL_ARENA } from '../../src/duel-layout.ts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { MONSTER_STATS, rollMonsterDrops } from '../../src/monster-drops.ts';
import type { ServerPlayer } from '../../src/types/server.ts';
test('growth equity validates NPC proximity and backend-only ownership; checkpointed positions are ignored', async () => {
  const { game, geometry, advance } = await fixture(),
    a = await player(game, 1100, { 'sf-purse-v1': '{"coins":20000}' });
  try {
    await command(game, a.p, 'growthBuy', { amount: 1000 });
    assert.equal(requiredResult(a.messages).ok, false);
    geometry.merchants.push(
      {
        label: 'capital-test',
        id: 'capital-test',
        kind: 'capital',
        x: a.p.x,
        z: a.p.z,
        base: a.p.y,
      },
      { label: 'Broker', id: 'broker-test', kind: 'stockbroker', x: a.p.x, z: a.p.z, base: a.p.y },
    );
    await command(game, a.p, 'growthBuy', { amount: 5000 });
    assert.ok(requiredResult(a.messages).ok);
    await command(game, a.p, 'growthList');
    assert.ok(requiredResult(a.messages).ok);
    assert.equal(a.p.inventory.economy.state.coins, 14750);
    advance(1000);
    game.tick(0.05);
    assert.ok(a.messages.some((m) => m.type === 'finance' && m.position?.phase === 'listed'));
    game.receive(a.p, { type: 'checkpoint', privateState: { 'sf-growth-v1': '{"cost":9999999}' } });
    await a.p.queue;
    assert.equal(requiredFixture(game.finance.account(a.p).snapshot()).cost, 5000);
    await game.flush();
    assert.equal(
      requiredFixture(
        (await storedPlayerFixture(game.store, 'player:' + a.p.owner)).playerState.finance.growth,
      ).cost,
      5000,
    );
    await command(game, a.p, 'growthSell');
    assert.ok(requiredResult(a.messages).ok);
    const coins = a.p.inventory.economy.state.coins;
    await command(game, a.p, 'growthSell');
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, coins);
  } finally {
    await game.close();
  }
});
test('successful listings roll for an investigator who can bind, and failed listings do not dispatch one', async () => {
  const geometry = fixtureGeometry();
  geometry.wilderness = {
    actors: Array.from({ length: 12 }, (_, index) => ({
      id: 'nearby-bear-' + index,
      combatKind: 'bear',
      x: geometry.spawn.x + 4 + index * 0.1,
      z: geometry.spawn.y + 4,
    })),
  };
  let roll = 1 / 5;
  let time = 1_000_000;
  const game = await createGame({
    geometry,
    store: createMemoryStore(),
    random: () => roll,
    now: () => time,
  });
  try {
    const a = await player(game, 1199, { 'sf-purse-v1': '{"coins":20000}' });
    const { p } = a;
    const spot = { x: p.x, z: p.z, base: p.y };
    geometry.merchants.push(
      { ...spot, id: 'capital', kind: 'capital', label: 'Capital' },
      { ...spot, id: 'broker', kind: 'stockbroker', label: 'Broker' },
    );
    const act = async (action: string) => {
      await command(game, p, action, { amount: 1000 });
      return requiredResult(a.messages);
    };
    const investigators = () =>
      game.shared.wilderness.actors.filter(
        (actor) => actor.combatKind === 'securities-investigator',
      );
    assert.ok((await act('growthBuy')).ok);
    assert.ok((await act('growthList')).ok);
    assert.equal(investigators().length, 0);
    assert.ok((await act('growthSell')).ok);
    roll = 0.19;
    assert.equal((await act('growthList')).ok, false);
    assert.equal(investigators().length, 0);
    assert.ok((await act('growthBuy')).ok);
    game.broadcast();
    assert.equal(
      a.messages.find((message) => message.type === 'world')?.patches?.wilderness?.length,
      12,
    );
    assert.ok((await act('growthList')).ok);
    const inspector = requiredFixture(investigators()[0]);
    assert.equal(inspector.level, 40);
    assert.equal(inspector.enemy, p.id);
    assert.ok(Math.hypot(inspector.x - p.x, inspector.z - p.z) >= 1.2);
    p.hp = p.max = 200;
    roll = 1 / 8;
    time += 50;
    game.tick(0.05);
    assert.ok(p.hp < 200, 'the investigator attacked');
    assert.equal(p.boundUntil, undefined);
    roll = 0.124;
    const interval = MONSTER_STATS['securities-investigator'].interval;
    time += interval * 1000;
    game.tick(interval);
    assert.equal(p.boundUntil, time + 10_000);
    assert.ok(a.messages.some((message) => message.type === 'pvpBound' && message.target === p.id));
    game.broadcast();
    assert.ok(
      a.messages.some(
        (message) =>
          message.type === 'world' &&
          message.patches?.wilderness?.some(([id]) => id === inspector.id),
      ),
      'the dispatched investigator is replicated even with a full wilderness interest set',
    );
    assert.deepEqual(
      rollMonsterDrops(inspector.combatKind, () => 0.5).map((item) => item.lootKind),
      ['coins'],
    );
    assert.deepEqual(
      rollMonsterDrops(inspector.combatKind, () => 0).map((item) => item.lootKind),
      ['coins', 'sandwich', 'light-crystal'],
    );
  } finally {
    await game.close();
  }
});

const atArena = (p: ServerPlayer) =>
  Object.assign(p, { x: DUEL_ARENA.x, z: DUEL_ARENA.z, y: DUEL_ARENA.base + 0.24, mode: 'walk' });

test('trade and duel preferences default on and auto-decline incoming requests after saving', async () => {
  const { game, store } = await fixture();
  const a = await player(game, 1105);
  let b = await player(game, 1106);
  const setting = () => ({
    name: b.p.name,
    look: b.p.appearance,
    pvp: false,
    phone: false,
  });
  try {
    const welcome = requiredFixture(b.messages.find((m) => m.type === 'welcome'));
    assert.equal(welcome.playerState?.social.tradeDuelEnabled, true);
    atArena(a.p);
    atArena(b.p);
    const offer = { id: b.p.id, stake: 1 };
    await command(game, a.p, 'duelOffer', offer);
    assert.ok(requiredResult(a.messages).ok);
    await command(game, a.p, 'tradeRequest', { id: b.p.id });
    assert.ok(requiredResult(a.messages).ok);

    await command(game, b.p, 'saveCharacter', { ...setting(), tradeDuelEnabled: false });
    assert.ok(requiredResult(b.messages).ok);
    const updated = b.messages.findLast((m) => 'playerState' in m && m.playerState);
    assert.ok(updated && 'playerState' in updated);
    assert.equal(updated.playerState?.social.tradeDuelEnabled, false);
    const disabled = /has trade and duel requests disabled/;
    assert.match(requiredFixture(a.messages.find((m) => m.type === 'duelClosed')).message, disabled);
    assert.match(requiredFixture(a.messages.find((m) => m.type === 'tradeClosed')).message, disabled);
    const stored = await storedPlayerFixture(store, 'player:' + b.p.owner);
    assert.equal(stored.playerState.social.tradeDuelEnabled, false);

    await game.disconnect(b.p);
    b = await player(game, 1106);
    atArena(b.p);
    const reconnected = requiredFixture(b.messages.find((m) => m.type === 'welcome'));
    assert.equal(reconnected.playerState?.social.tradeDuelEnabled, false);
    await command(game, b.p, 'saveCharacter', setting());
    assert.ok(requiredResult(b.messages).ok);
    assert.equal(b.p.profile.tradeDuelEnabled, false);

    await command(game, a.p, 'duelOffer', { ...offer, id: b.p.id });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.match(requiredResult(a.messages).message ?? '', disabled);
    await command(game, a.p, 'tradeRequest', { id: b.p.id });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.match(requiredResult(a.messages).message ?? '', disabled);
    assert.ok(!b.messages.some((m) => m.type === 'duelOffer' || m.type === 'tradeView'));

    await command(game, b.p, 'tradeRequest', { id: a.p.id });
    assert.ok(requiredResult(b.messages).ok);
    const outbound = requiredFixture(b.messages.findLast((m) => m.type === 'tradeView'));
    await command(game, b.p, 'tradeCancel', { trade: outbound.trade.id });
    await command(game, b.p, 'saveCharacter', { ...setting(), tradeDuelEnabled: true });
    assert.ok(requiredResult(b.messages).ok);
    await command(game, a.p, 'duelOffer', { ...offer, id: b.p.id });
    assert.ok(requiredResult(a.messages).ok);
    assert.ok(b.messages.some((m) => m.type === 'duelOffer'));
  } finally {
    await game.close();
  }
});

test('two explicit matching consents settle one wager, persist both balances and reject duplicate claims', async () => {
  const { game, store } = await fixture(),
    a = await player(game, 1101, { 'sf-purse-v1': '{"coins":1000}' }),
    b = await player(game, 1102, { 'sf-purse-v1': '{"coins":1000}' });
  try {
    atArena(a.p);
    atArena(b.p);
    await command(game, a.p, 'duelOffer', { id: b.p.id, stake: 200 });
    assert.ok(requiredResult(a.messages).ok);
    assert.equal(a.p.inventory.economy.state.coins, 1000);
    const offer = requiredFixture(b.messages.find((m) => m.type === 'duelOffer')).offer;
    await command(game, b.p, 'duelAccept', { offer: offer.id, stake: 199 });
    assert.equal(requiredResult(b.messages).ok, false);
    await Promise.all([
      command(game, b.p, 'duelAccept', { offer: offer.id, stake: 200 }),
      command(game, a.p, 'duelAccept', { offer: offer.id, stake: 200 }),
    ]);
    assert.equal(a.p.inventory.economy.state.coins + b.p.inventory.economy.state.coins, 2000);
    assert.deepEqual(
      [a.p.inventory.economy.state.coins, b.p.inventory.economy.state.coins].sort((a, b) => a - b),
      [800, 1200] satisfies [number, number],
    );
    assert.equal(a.messages.filter((m) => m.type === 'duelSettled').length, 1);
    assert.equal(
      JSON.stringify(
        (await storedPlayerFixture(store, 'player:' + a.p.owner)).playerState.inventory.economy,
      ),
      JSON.stringify(a.p.inventory.economy.state),
    );
    await command(game, b.p, 'duelAccept', { offer: offer.id, stake: 200 });
    assert.equal(requiredResult(b.messages).ok, false);
  } finally {
    await game.close();
  }
});
test('leaving the arena, disconnecting or changing the stake cancels safely; self-wagers and forged balances fail', async () => {
  const { game } = await fixture(),
    a = await player(game, 1103),
    b = await player(game, 1104);
  try {
    atArena(a.p);
    atArena(b.p);
    await command(game, a.p, 'duelOffer', { id: a.p.id, stake: 1 });
    assert.equal(requiredResult(a.messages).ok, false);
    await command(game, a.p, 'duelOffer', { id: b.p.id, stake: 26 });
    assert.equal(requiredResult(a.messages).ok, false);
    await command(game, a.p, 'duelOffer', { id: b.p.id, stake: 10 });
    const offer = requiredFixture(b.messages.find((m) => m.type === 'duelOffer')).offer;
    b.p.x = 0;
    game.tick(0.05);
    await command(game, b.p, 'duelAccept', { offer: offer.id, stake: 10 });
    assert.equal(requiredResult(b.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 25);
    assert.equal(b.p.inventory.economy.state.coins, 25);
  } finally {
    await game.close();
  }
});
