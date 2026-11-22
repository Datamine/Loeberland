import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import {
  fixtureGeometry,
  latestResult,
  player,
  type TestPlayer,
  type TestGame,
} from './fixtures.mts';
import { hydratePlayerProfile } from '../../src/player-document.ts';
import { isRecord } from '../../src/types/json.ts';

let request = 0;
async function act(game: TestGame, player: TestPlayer, action: string, args: object) {
  game.receive(player.p, {
    type: 'command',
    request: ++request,
    action,
    args,
    inventoryEpoch: player.p.inventory.meta.epoch,
  });
  await player.p.queue;
  const result = latestResult(player.messages);
  assert.ok(result);
  return result;
}
function view(p: TestPlayer) {
  const event = p.messages.findLast((event) => event.type === 'tradeView');
  assert.ok(event?.type === 'tradeView');
  return event.trade;
}
async function open(game: TestGame, a: TestPlayer, b: TestPlayer) {
  assert.equal((await act(game, a, 'tradeRequest', { id: b.p.id })).ok, true);
  const { id, revision } = view(b);
  assert.equal((await act(game, b, 'tradeJoin', { trade: id, revision })).ok, true);
  return id;
}
const offer = (game: TestGame, p: TestPlayer, items: { id: string; quantity: number }[]) =>
  act(game, p, 'tradeOffer', { trade: view(p).id, revision: view(p).revision, items });
const confirm = (game: TestGame, p: TestPlayer, revision = view(p).revision) =>
  act(game, p, 'tradeConfirm', { trade: view(p).id, revision });

test('players see private stock, blocked quest gear, separate equity and an atomic exchange', async () => {
  const store = createMemoryStore();
  const batches: string[][] = [];
  const batch = store.batch;
  store.batch = (entries) => {
    batches.push(entries.map(([key]) => key));
    return batch(entries);
  };
  const game = await createGame({ geometry: fixtureGeometry(), store });
  try {
    const a = await player(game, 77001, {
      'sf-purse-v1': JSON.stringify({
        coins: 90,
        equity: 4,
        fuelCans: 1,
        ownedEquipment: ['bayonet', 'ice-top', 'combat-boots'],
      }),
      'sf-character-v1': '{"boots":true,"torso":"ice-top"}',
    });
    const b = await player(game, 77002, { 'sf-purse-v1': '{"coins":160,"fish":1}' });
    b.p.profile.growth = { phase: 'private', cost: 1000, value: 1000, fee: 50 };
    a.p.inventory.receive({ lootKind: 'peptides', amount: 3 });
    await open(game, a, b);
    assert.equal(
      view(a).available.some((item) => ['railgun', 'bayonet', 'growth-equity'].includes(item.id)),
      false,
    );
    assert.equal(
      view(b).available.some((item) => item.id === 'startup-equity'),
      false,
    );
    assert.equal((await offer(game, a, [{ id: 'railgun', quantity: 1 }])).ok, false);
    assert.equal((await offer(game, a, [{ id: 'bayonet', quantity: 1 }])).ok, false);
    const items = [
      { id: 'startup-equity', quantity: 2 },
      { id: 'combat-boots', quantity: 1 },
      { id: 'ice-top', quantity: 1 },
      { id: 'fuel-can', quantity: 1 },
      { id: 'peptides', quantity: 2 },
    ];
    assert.equal((await offer(game, a, items)).ok, true);
    assert.equal((await confirm(game, a)).ok, true);
    const stale = view(a).revision;
    assert.equal(
      (
        await offer(game, b, [
          { id: 'growth-equity', quantity: 400 },
          { id: 'coins', quantity: 55 },
          { id: 'fish', quantity: 1 },
        ])
      ).ok,
      true,
    );
    assert.equal(view(a).you.confirmed, false);
    assert.equal((await confirm(game, a, stale)).ok, false);
    assert.equal((await confirm(game, b)).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 90);
    assert.equal((await confirm(game, a)).ok, true);
    assert.deepEqual(
      [
        a.p.inventory.economy.state.coins,
        a.p.inventory.economy.state.equity,
        a.p.inventory.economy.state.fish,
      ],
      [145, 2, 1],
    );
    assert.deepEqual(
      [
        b.p.inventory.economy.state.coins,
        b.p.inventory.economy.state.equity,
        b.p.inventory.economy.state.fuelCans,
        b.p.inventory.meta.peptides,
      ],
      [105, 2, 1, 2],
    );
    assert.equal(a.p.profile.growth?.cost, 400);
    assert.equal(b.p.profile.growth?.cost, 600);
    assert.equal(a.p.appearance.boots, false);
    assert.equal(a.p.appearance.torso, 'shirt');
    assert.ok(b.p.inventory.economy.state.ownedEquipment.includes('ice-top'));
    assert.ok(b.p.inventory.snapshot().collection.includes('combat-boots'));
    const savedPair = ['player:' + a.p.owner, 'player:' + b.p.owner];
    assert.ok(
      batches.some((keys) => keys.length === 2 && savedPair.every((key) => keys.includes(key))),
    );
    for (const [i, key] of savedPair.entries()) {
      const record = await store.get(key);
      assert.ok(isRecord(record));
      assert.equal(hydratePlayerProfile(record).growth?.cost, i ? 600 : 400);
    }
  } finally {
    await game.close();
  }
});

test('stock changes, moving away and storage failure leave both inventories intact', async () => {
  const store = createMemoryStore();
  const batch = store.batch;
  let failPair = false;
  store.batch = async (entries) => {
    if (failPair && entries.length === 2 && entries.every(([key]) => key.startsWith('player:')))
      throw Error('test trade save failure');
    return batch(entries);
  };
  const game = await createGame({ geometry: fixtureGeometry(), store });
  try {
    const a = await player(game, 77003),
      b = await player(game, 77004);
    let trade = await open(game, a, b);
    assert.equal((await offer(game, a, [{ id: 'coins', quantity: 20 }])).ok, true);
    assert.equal((await confirm(game, b)).ok, true);
    a.p.inventory.economy.state.coins = 10;
    assert.equal((await confirm(game, a)).ok, false);
    assert.equal(b.p.inventory.economy.state.coins, 25);
    b.p.x += 5;
    game.tick(0.05);
    assert.equal((await act(game, a, 'tradeCancel', { trade })).ok, false);
    b.p.x -= 5;
    trade = await open(game, a, b);
    assert.equal((await offer(game, a, [{ id: 'coins', quantity: 6 }])).ok, true);
    assert.equal((await confirm(game, a)).ok, true);
    failPair = true;
    assert.match((await confirm(game, b)).message || '', /intact/);
    failPair = false;
    assert.equal(a.p.inventory.economy.state.coins, 10);
    assert.equal(b.p.inventory.economy.state.coins, 25);
    assert.equal((await act(game, a, 'tradeCancel', { trade })).ok, false);
    await open(game, a, b);
    await game.disconnect(b.p);
    assert.ok(a.messages.some((message) => message.type === 'tradeClosed' && !message.completed));
  } finally {
    await game.close();
  }
});

test('listed growth positions transfer intact, including the original listing timer', async () => {
  const { swapHoldings } = await import('../trade-inventory.mts');
  const game = await createGame({ geometry: fixtureGeometry(), store: createMemoryStore() });
  try {
    const a = await player(game, 77005),
      b = await player(game, 77006);
    const position = {
      phase: 'listed',
      cost: 1000,
      value: 991.5,
      fee: 50,
      listedAt: 1,
      lastAt: 3001,
      history: [1000, 991],
    } as const;
    const holdings = {
      inventory: a.p.inventory.snapshot(),
      growth: { ...position, history: [...position.history] },
      grapplingHook: false,
    };
    const empty = { inventory: b.p.inventory.snapshot(), growth: null, grapplingHook: false };
    const line = { id: 'growth-equity', quantity: 1000 };
    assert.equal(swapHoldings(holdings, empty, [{ ...line, quantity: 500 }], []), null);
    const drafts = swapHoldings(holdings, empty, [line], []);
    assert.ok(drafts);
    assert.equal(drafts[0].growth, null);
    assert.deepEqual(drafts[1].growth, position);
  } finally {
    await game.close();
  }
});
