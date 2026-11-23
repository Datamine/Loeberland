import {
  storedWorldFixture,
  storedPlayerFixture,
  fixture,
  fixtureGeometry,
  player,
  requiredResult,
} from './fixtures.mts';

import type { TestGame, TestPlayer, CapturedMessage } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { decodePlayerFrame } from '../../src/multiplayer-protocol.ts';
import type { ServerPlayer } from '../../src/types/server.ts';

async function act(
  game: TestGame,
  p: ServerPlayer,
  action: string,
  args: Record<string, unknown> = {},
  epoch = p.inventory.meta.epoch,
) {
  game.receive(p, { type: 'command', request: Math.random(), action, args, inventoryEpoch: epoch });
  await p.queue;
  return Reflect.get(p.transport, 'messages')?.at(-1);
}
const gear = {
  'sf-character-v1': '{"weapon":"railgun"}',
  'sf-expeditions-v1': '{"raptor":"completed","railgun":true,"equipped":true}',
};
async function enable(
  game: import('./fixtures.mts').TestGame,
  ...people: {
    p: ServerPlayer;
    messages: CapturedMessage[];
    transport: {
      open: boolean;
      bufferedAmount: number;
      send: (value: string | ArrayBuffer) => number;
      close(code?: number, reason?: string): void;
    };
    token: string;
  }[]
) {
  for (const person of people) await act(game, person.p, 'pvp', { enabled: true });
}
async function finishKill(
  game: TestGame,
  advance: { (ms: number): number; (ms: number): number; (arg0: number): void },
  attacker: TestPlayer,
  victim: TestPlayer,
) {
  await act(game, attacker.p, 'pvpAttack', { id: victim.p.id });
  for (let i = 0; i < 15 && victim.p.hp > 0; i++) {
    advance(850);
    game.tick(0.05);
  }
  await victim.p.deathTask;
}

test('both players must opt in and disabling has a persisted 30-second cooldown', async () => {
  const { game, store, advance } = await fixture(),
    a = await player(game, 201, gear),
    b = await player(game, 202);
  await act(game, a.p, 'pvpAttack', { id: b.p.id });
  assert.equal(requiredResult(a.messages).ok, false);
  await enable(game, a);
  await act(game, a.p, 'pvpAttack', { id: b.p.id });
  assert.equal(requiredResult(a.messages).ok, false);
  await enable(game, b);
  await act(game, a.p, 'pvp', { enabled: false });
  assert.equal(requiredResult(a.messages).ok, false);
  const saved = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.equal(requiredFixture(saved.playerState.social.pvp).enabled, true);
  assert.equal(requiredFixture(saved.playerState.social.pvp).disableAt, 1060000 - 30000);
  advance(29999);
  await act(game, a.p, 'pvp', { enabled: false });
  assert.equal(requiredResult(a.messages).ok, false);
  advance(1);
  await act(game, a.p, 'pvp', { enabled: false });
  assert.equal(requiredResult(a.messages).ok, true);
  assert.equal(game.pvp.status(a.p).enabled, false);
  await game.close();
});
test('PvP uses Strength for damage and publishes the composite player level', async () => {
  let time = 1_000_000;
  const game = await createGame({
      geometry: fixtureGeometry(),
      store: createMemoryStore(),
      now: () => time,
      random: () => 0,
    }),
    a = await player(game, 203, { 'sf-strength-v1': '{"xp":12000}', ...gear }),
    b = await player(game, 204);
  assert.equal(requiredFixture(a.messages.find((m) => m.type === 'welcome')).level, 5);
  await enable(game, a, b);
  a.p.x = b.p.x + 8;
  await act(game, a.p, 'pvpAttack', { id: b.p.id });
  assert.equal(requiredResult(a.messages).ok, false);
  a.p.x = b.p.x + 4;
  await act(game, a.p, 'pvpAttack', { id: b.p.id });
  assert.equal(requiredResult(a.messages).ok, true);
  game.tick(0.05);
  assert.equal(b.p.hp, 20, 'Strength 10 deals 10 damage on the minimum railgun roll');
  const after = b.p.hp;
  game.tick(0.05);
  assert.equal(b.p.hp, after, 'render/tick frequency cannot bypass attack cooldown');
  time += 800;
  game.tick(0.05);
  assert.equal(b.p.hp, 10);
  game.broadcast();
  const frame = decodePlayerFrame(
    requiredFixture(b.messages.filter((m) => m instanceof ArrayBuffer).at(-1)),
  );
  assert.ok(frame != null, 'Missing test fixture: frame');
  const remote = frame.players.find((p) => p.id === a.p.id);
  assert.ok(remote != null, 'Missing test fixture: remote');
  assert.equal(remote.level, 6, 'Hitpoints reached level 2 while Strength stayed at 10');

  assert.equal(remote.pvp, true);
  await game.close();
  const geometry = fixtureGeometry();
  geometry.lineClear = () => false;
  const blocked = await createGame({ geometry, store: createMemoryStore() }),
    x = await player(blocked, 205, gear),
    y = await player(blocked, 206);
  await enable(blocked, x, y);
  await act(blocked, x.p, 'pvpAttack', { id: y.p.id });
  assert.equal(requiredResult(x.messages).ok, false);
  assert.equal(y.p.hp, 30);
  await blocked.close();
});
test('a PvP death drops every specified item exactly once and stale saves cannot restore them', async () => {
  const { game, store, advance } = await fixture(),
    a = await player(game, 207, gear),
    b = await player(game, 208, {
      'sf-purse-v1':
        '{"coins":431,"iphoneOwned":true,"iphoneEquipped":true,"ownedHats":["paper","crown"],"equity":2}',
      'sf-deli-v1': '{"sandwiches":7,"pending":false}',
      'sf-character-v1': '{"hat":"crown","shirt":"#707b4b"}',
    });
  await enable(game, a, b);
  await finishKill(game, advance, a, b);
  assert.equal(b.p.hp, 0);
  const items = [...game.shared.loot.values()];
  assert.equal(items.length, 3);
  assert.equal(requiredFixture(items.find((i) => i.lootKind === 'coins')).amount, 431);
  assert.equal(requiredFixture(items.find((i) => i.lootKind === 'sandwich')).amount, 7);
  assert.ok(items.some((i) => i.lootKind === 'iphone'));
  assert.deepEqual(
    items
      .filter((i) => i.lootKind === 'hat')
      .map((i) => i.hatId)
      .sort(),
    [],
  );
  assert.equal(b.p.inventory.economy.state.coins, 0);
  assert.equal(b.p.inventory.meta.sandwiches, 0);
  assert.equal(b.p.inventory.economy.state.iphoneOwned, false);
  assert.deepEqual(b.p.inventory.economy.state.ownedHats, ['paper', 'crown'] satisfies [
    string,
    string,
  ]);
  assert.equal(b.p.appearance.hat, 'crown');
  assert.equal(b.p.inventory.economy.state.equity, 2);
  game.receive(b.p, {
    type: 'checkpoint',
    inventoryEpoch: 0,
    privateState: {
      'sf-purse-v1': '{"coins":999,"iphoneOwned":true,"ownedHats":["crown"]}',
      'sf-deli-v1': '{"sandwiches":999}',
    },
  });
  await b.p.queue;
  assert.equal(b.p.inventory.economy.state.coins, 0);
  assert.equal(JSON.parse(b.p.profile.privateState['sf-purse-v1']).coins, 0);
  await act(game, b.p, 'inventory', { op: 'credit', amount: 1000 }, 0);
  assert.equal(requiredResult(b.messages).ok, false);
  assert.equal(b.p.inventory.economy.state.coins, 0);
  const persisted = await storedPlayerFixture(store, 'player:' + b.p.owner);
  assert.equal(persisted.playerState.inventory.economy.coins, 0);
  assert.equal(
    (await storedWorldFixture(store, 'world')).shared.loot.filter((i) => i.transfer).length,
    3,
  );
  game.tick(0.05);
  assert.equal(game.shared.loot.size, 3);
  await game.close();
});
test('PvP loot transfers do not multiply coins through the iPhone earnings boost and survive collector retries', async () => {
  const { game, advance } = await fixture(),
    a = await player(game, 209, {
      'sf-purse-v1': '{"coins":25,"iphoneOwned":true,"iphoneEquipped":true}',
      ...gear,
    }),
    b = await player(game, 210, {
      'sf-purse-v1': '{"coins":100,"ownedHats":["paper"]}',
      'sf-deli-v1': '{"sandwiches":3}',
    });
  await enable(game, a, b);
  await finishKill(game, advance, a, b);
  const coins = [...game.shared.loot.values()].find((i) => i.lootKind === 'coins');
  assert.ok(coins != null, 'Missing test fixture: coins');
  await act(game, a.p, 'collect', { id: coins.id });
  assert.equal(requiredResult(a.messages).ok, true);
  assert.equal(
    a.p.inventory.economy.state.coins,
    125,
    'all 100 coins transfer without minting a 25% bonus',
  );

  await act(game, a.p, 'collect', { id: coins.id });
  assert.equal(requiredResult(a.messages).ok, false);
  assert.equal(a.p.inventory.economy.state.coins, 125);
  assert.ok(![...game.shared.loot.values()].some((i) => i.lootKind === 'hat'));
  assert.ok(b.p.inventory.economy.state.ownedHats.includes('paper'));
  advance(3000);
  game.tick();
  assert.equal(b.p.hp, 30);
  assert.equal(b.messages.filter((m) => m.type === 'position' && m.reason === 'respawn').length, 1);
  assert.equal(b.p.inventory.economy.state.coins, 0);
  await game.close();
});

test('collecting an oversized sandwich stack fills available slots and preserves the rest', async (t) => {
  const { game, store } = await fixture();
  t.after(() => game.close());
  const first = await player(game, 228, { 'sf-purse-v1': '{"ownedEquipment":["backpack"]}' });
  const second = await player(game, 229, { 'sf-deli-v1': '{"sandwiches":3,"pending":true}' });
  const [id] = game.shared.dropInventory(first.p, null, [{ lootKind: 'sandwich', amount: 97 }]);
  const initial = { ...requiredFixture(game.shared.loot.get(id)) };

  await act(game, first.p, 'collect', { id });
  const receipt = requiredResult(first.messages);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.award?.amount, 20);
  assert.match(receipt.message || '', /20 sandwiches.*77 sandwiches/);
  assert.equal(first.p.inventory.meta.sandwiches, 20);
  assert.deepEqual(game.shared.loot.get(id), { ...initial, amount: 77, label: '77 sandwiches' });

  await act(game, first.p, 'collect', { id });
  assert.equal(requiredResult(first.messages).ok, false);
  assert.equal(game.shared.loot.get(id)?.amount, 77);

  Object.assign(second.p, { x: first.p.x, y: first.p.y, z: first.p.z });
  second.p.inventory.meta.deliveryPending = true;
  await act(game, second.p, 'collect', { id });
  assert.equal(requiredResult(second.messages).award?.amount, 1);
  assert.equal(second.p.inventory.meta.sandwiches, 4);
  assert.equal(game.shared.loot.get(id)?.amount, 76);
  assert.equal(
    (await storedWorldFixture(store, 'world')).shared.loot.find((item) => item.id === id)?.amount,
    76,
  );
});

test('inventory operations settle in order and pending client balances cannot overrule death epochs', async () => {
  const { game } = await fixture(),
    a = await player(game, 211, { 'sf-purse-v1': '{"coins":200}' });
  for (const [id, kind] of [
    ['hat', 'haberdasher'] satisfies [string, string],
    ['food', 'deli'] satisfies [string, string],
    ['phone', 'tim-apple'] satisfies [string, string],
  ]) {
    const npc = { label: 'Test actor', id, kind, x: a.p.x, z: a.p.z, base: a.p.y };
    game.shared.npcById.set(id, npc);
  }
  await act(game, a.p, 'inventory', { op: 'buyHat', id: 'beanie' });
  assert.equal(a.p.inventory.economy.state.coins, 190);
  assert.ok(a.p.inventory.economy.state.ownedHats.includes('beanie'));
  await act(game, a.p, 'inventory', { op: 'pickup' });
  assert.equal(a.p.inventory.economy.state.coins, 187);
  assert.equal(a.p.inventory.meta.sandwiches, 1);
  a.p.hp = 10;
  await act(game, a.p, 'inventory', { op: 'eat', hpBefore: 10 });
  assert.equal(a.p.hp, 25);
  assert.equal(a.p.inventory.meta.sandwiches, 0);
  await act(game, a.p, 'inventory', { op: 'buyPhone' });
  assert.equal(a.p.inventory.economy.state.coins, 87);
  assert.equal(a.p.inventory.economy.state.iphoneOwned, true);
  await game.close();
});

test('a non-player death drops coins, phone and sandwiches that can be reclaimed after respawn', async (t) => {
  const { game, advance, store } = await fixture(),
    a = await player(game, 212, {
      'sf-purse-v1': '{"coins":80,"iphoneOwned":true,"ownedHats":["paper"]}',
      'sf-deli-v1': '{"sandwiches":2}',
    });
  t.after(() => game.close());
  await enable(game, a);
  // Browser HP claims cannot cause or undo death. The server applies the
  // personal encounter damage, then authorizes the hospital respawn.
  game.personal.runtime(a.p).health.damage(100);
  assert.equal(a.p.hp, 0);
  await act(game, a.p, 'respawn');
  assert.equal(a.p.hp, 0);
  assert.equal(requiredResult(a.messages).ok, false);
  advance(2999);
  game.tick();
  assert.equal(a.p.hp, 0);
  advance(1);
  game.tick();
  assert.equal(a.p.hp, 30);
  await act(game, a.p, 'respawn');
  assert.equal(requiredResult(a.messages).ok, false);
  assert.equal(a.messages.filter((m) => m.type === 'position' && m.reason === 'respawn').length, 1);
  assert.equal(a.p.inventory.economy.state.coins, 0);
  assert.equal(a.p.inventory.meta.sandwiches, 0);
  assert.deepEqual(a.p.inventory.economy.state.ownedHats, ['paper']);
  assert.equal(a.p.inventory.meta.epoch, 1);
  assert.deepEqual([...game.shared.loot.values()].map((i) => i.lootKind).sort(), [
    'coins',
    'iphone',
    'sandwich',
  ] satisfies [string, string, string]);

  const coins = requiredFixture([...game.shared.loot.values()].find((i) => i.lootKind === 'coins'));
  const food = requiredFixture(
    [...game.shared.loot.values()].find((i) => i.lootKind === 'sandwich'),
  );
  await act(game, a.p, 'collect', { id: coins.id });
  assert.equal(requiredResult(a.messages).retryApproach, true);
  assert.ok(game.shared.loot.has(coins.id));
  await act(game, a.p, 'teleport', { x: coins.x, z: coins.z });
  assert.equal(requiredResult(a.messages).ok, true);
  await act(game, a.p, 'collect', { id: coins.id });
  assert.equal(requiredResult(a.messages).award?.inventory?.purse.coins, 80);
  await act(game, a.p, 'collect', { id: food.id });
  assert.equal(requiredResult(a.messages).award?.inventory?.sandwiches, 2);
  assert.equal(requiredResult(a.messages).message, 'You collect 2 sandwiches.');
  assert.equal(a.p.inventory.economy.state.coins, 80);
  assert.equal(a.p.inventory.meta.sandwiches, 2);
  const saved = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.equal(saved.playerState.inventory.economy.coins, 80);
  assert.equal(saved.playerState.inventory.ledger?.sandwiches, 2);
});
