import {
  storedPlayerFixture,
  fixtureGeometry,
  player,
  command as gameCommand,
  requiredResult,
} from './fixtures.mts';
import type { TestGame } from './fixtures.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { itemLoot } from '../../src/item-stats.ts';
import { rollMonsterDrops } from '../../src/monster-drops.ts';
import { INCUBATOR_GUARD } from '../../src/goblin-incubator-cave.ts';
import { GOBLIN_BUSH_GUARD } from '../../src/goblin-bush.ts';
import { equipmentOptions } from '../../src/equipment-options.ts';
import { characterAppearance, normalizeCharacter } from '../../src/character-config.ts';
import { swapHoldings } from '../trade-inventory.mts';
import {
  HIKING_BACKPACK,
  HIKING_BACKPACK_UPGRADE_KIT,
  UPGRADED_HIKING_BACKPACK,
} from '../../src/config/hiking-backpack.ts';

import type { ServerGeometry, ServerPlayer } from '../../src/types/server.ts';

async function command(game: TestGame, p: ServerPlayer, action: string, args?: {} | undefined) {
  if (action !== 'inventory') return gameCommand(game, p, action, args);
  game.receive(p, {
    type: 'command',
    request: Math.random(),
    action,
    args,
    inventoryEpoch: p.inventory.meta.epoch,
  });
  await p.queue;
}

async function setup(wilderness?: ServerGeometry['wilderness'], random?: () => number) {
  let time = 1000000;
  const geometry = fixtureGeometry();
  geometry.wilderness = wilderness;
  geometry.merchants = [
    {
      label: 'hiking-supplier',
      id: 'hiking-supplier',
      kind: 'hiking-supplier',
      x: 92.2,
      z: 120,
      base: 1.15,
    },
    { label: 'deli', id: 'deli', kind: 'deli', x: 92.2, z: 120 },
    {
      label: 'mazarine-clerk',
      id: 'mazarine-clerk',
      neighborhoodService: 'mazarine',
      x: 92.2,
      z: 120,
    },
  ];
  const store = createMemoryStore(),
    game = await createGame({ geometry, store, now: () => time, random });
  return { game, store, geometry, advance: (ms: number) => (time += ms) };
}
test('five-sandwich capacity covers purchases and loot; the 100-coin backpack raises it to twenty', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 56001, { 'sf-purse-v1': '{"coins":500}' });
    for (let i = 0; i < 5; i++) {
      await command(f.game, a.p, 'inventory', { op: 'pickup' });
      assert.equal(requiredResult(a.messages).ok, true);
    }
    const before = a.p.inventory.economy.state.coins;
    await command(f.game, a.p, 'inventory', { op: 'pickup' });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, before);
    assert.equal(a.p.inventory.receive({ lootKind: 'sandwich', amount: 1 }).ok, false);
    a.p.x += 30;
    await command(f.game, a.p, 'inventory', { op: 'buyBackpack' });
    assert.equal(requiredResult(a.messages).ok, false);
    a.p.x -= 30;
    await command(f.game, a.p, 'inventory', { op: 'buyBackpack' });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, before - 100);
    assert.equal(a.p.inventory.snapshot().capacity, 20);
    await command(f.game, a.p, 'inventory', { op: 'buyBackpack' });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, before - 100);
    assert.equal(a.p.inventory.receive({ lootKind: 'sandwich', amount: 15 }).ok, true);
    assert.equal(a.p.inventory.meta.sandwiches, 20);
    assert.equal(a.p.inventory.receive({ lootKind: 'sandwich', amount: 1 }).ok, false);
    await command(f.game, a.p, 'inventory', { op: 'order' });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, before - 100);
    const found = a.p.inventory.snapshot().collection;
    assert.ok(found.includes('sandwich') && found.includes('backpack'));
    a.p.inventory.meta.sandwiches = 0;
    a.p.inventory.save();
    assert.ok(a.p.inventory.snapshot().collection.includes('sandwich'));
    await f.game.flush();
    assert.ok(
      (
        await storedPlayerFixture(f.store, 'player:' + a.p.owner)
      ).playerState.inventory.collection.includes('backpack'),
    );
  } finally {
    await f.game.close();
  }
});
test('each Goblin Guard variant has a one-in-100 backpack kit drop', () => {
  for (const kind of ['goblin-guard', INCUBATOR_GUARD, GOBLIN_BUSH_GUARD]) {
    const dropsKit = (value: number) =>
      rollMonsterDrops(kind, () => value).some(
        (item) => item.lootKind === HIKING_BACKPACK_UPGRADE_KIT,
      );
    assert.equal(dropsKit(0.01), false, kind);
    assert.equal(dropsKit(0.01 - Number.EPSILON), true, kind);
  }
});

test('the backpack kit requires ownership and adds five permanent sandwich slots', async (t) => {
  const f = await setup(
    {
      actors: [
        { id: 'guard-a', combatKind: 'goblin-guard', x: 92.2, z: 120 },
        { id: 'guard-b', combatKind: 'goblin-guard', x: 92.2, z: 120 },
      ],
    },
    () => 0,
  );
  t.after(() => f.game.close());
  const newcomer = await player(f.game, 56005);
  const owner = await player(f.game, 56006, {
    'sf-purse-v1': JSON.stringify({ coins: 500, ownedEquipment: [HIKING_BACKPACK] }),
  });
  const act = async (action: string, args: Record<string, unknown>) => {
    await command(f.game, owner.p, action, args);
    return requiredResult(owner.messages);
  };
  const inventory = (op: string) => act('inventory', { op });
  const [first, second] = f.game.shared.wilderness.actors;
  const kits = () =>
    [...f.game.shared.loot.values()].filter(
      (item) => item.lootKind === HIKING_BACKPACK_UPGRADE_KIT,
    );
  f.game.shared.wilderness.damage(first.id, first.hp, newcomer.p);
  assert.equal(kits().length, 0);
  assert.equal(newcomer.p.inventory.receive(itemLoot(HIKING_BACKPACK_UPGRADE_KIT)).ok, false);
  f.game.shared.wilderness.damage(second.id, second.hp, owner.p);
  const [kit] = kits();
  assert.ok(kit);
  Object.assign(owner.p, { x: kit.x, z: kit.z });
  assert.equal(
    (await act('collect', { id: kit.id })).award?.inventory?.hikingBackpackUpgradeKits,
    1,
  );
  assert.ok(owner.p.inventory.receive(itemLoot('sandwich', 20)).ok);
  assert.equal(owner.p.inventory.receive(itemLoot('sandwich')).ok, false);
  assert.equal((await act('equipAppearance', { look: { back: HIKING_BACKPACK } })).ok, true);
  const upgrade = await inventory('upgradeBackpack');
  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.appearance?.back, UPGRADED_HIKING_BACKPACK);
  assert.equal(upgrade.inventory?.capacity, 25);
  assert.equal(upgrade.inventory?.hikingBackpackUpgradeKits, 0);
  assert.ok(upgrade.inventory?.collection.includes(UPGRADED_HIKING_BACKPACK));
  assert.equal(
    equipmentOptions(owner.p.inventory.economy.state).back[1].label,
    'Upgraded Hiking Backpack',
  );
  assert.ok(characterAppearance(normalizeCharacter(owner.p.appearance)).backpack);
  assert.equal((await inventory('buyBackpack')).ok, false);
  assert.ok(owner.p.inventory.receive(itemLoot(HIKING_BACKPACK_UPGRADE_KIT)).ok);
  assert.equal((await inventory('upgradeBackpack')).ok, false);
  assert.equal(owner.p.inventory.meta.hikingBackpackUpgradeKits, 1);

  assert.ok(owner.p.inventory.receive(itemLoot('sandwich', 4)).ok);
  assert.equal((await inventory('order')).ok, true);
  assert.equal(
    owner.p.inventory.receive(itemLoot('sandwich')).ok,
    false,
    'delivery reserves the last slot',
  );
  f.advance(50);
  for (let i = 0; i < 10 && owner.p.inventory.meta.deliveryPending; i++) f.game.tick(0.05);
  assert.equal(owner.p.inventory.meta.sandwiches, 25);
  assert.equal((await inventory('pickup')).ok, false);
  assert.equal((await act('equipAppearance', { look: { back: 'none' } })).ok, true);
  assert.equal(owner.p.inventory.snapshot().capacity, 25);

  const holdings = (p: ServerPlayer) => ({
    inventory: p.inventory.snapshot(),
    growth: null,
    grapplingHook: false,
  });
  const pack = { id: UPGRADED_HIKING_BACKPACK, quantity: 1 };
  assert.equal(swapHoldings(holdings(owner.p), holdings(newcomer.p), [pack], []), null);
  const swap = swapHoldings(
    holdings(owner.p),
    holdings(newcomer.p),
    [pack, { id: 'sandwich', quantity: 25 }],
    [],
  );
  assert.equal(swap?.[1].inventory.sandwiches, 25);
  assert.ok(swap?.[1].inventory.purse.ownedEquipment.includes(UPGRADED_HIKING_BACKPACK));
  await f.game.disconnect(owner.p);
  const returning = await player(f.game, 56006);
  assert.equal(returning.p.inventory.snapshot().capacity, 25);
  assert.equal(returning.p.inventory.meta.sandwiches, 25);
});

test('a pending delivery reserves its sandwich slot so ground loot cannot overfill the bag', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 56002);
    a.p.inventory.receive({ lootKind: 'sandwich', amount: 4 });
    await command(f.game, a.p, 'inventory', { op: 'order' });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.inventory.meta.deliveryPending, true);
    assert.equal(a.p.inventory.receive({ lootKind: 'sandwich', amount: 1 }).ok, false);
  } finally {
    await f.game.close();
  }
});
test('an arrived DoorDash cooler stays at its delivery position for two seconds', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 56004);
    await command(f.game, a.p, 'inventory', { op: 'order' });
    assert.equal(requiredResult(a.messages).ok, true);
    const arrivedAt = f.advance(50);
    f.game.tick(0.05);
    f.game.broadcast();
    assert.equal(a.p.inventory.meta.deliveryPending, false);
    assert.equal(a.p.inventory.meta.sandwiches, 1);
    const snapshot = a.messages.findLast(
      (m) => m.type === 'playerState' && m.state?.deliveryArrivals,
    );
    assert.ok(snapshot?.type === 'playerState');
    const arrivals = snapshot.state?.deliveryArrivals;
    assert.equal(arrivals?.length, 1);
    assert.equal(arrivals?.[0].expiresAt, arrivedAt + 2000);

    a.p.x += 8;
    f.advance(1999);
    f.game.tick(0.05);
    assert.deepEqual(f.game.personal.runtime(a.p).deli.state.arrivals, arrivals);
    f.advance(1);
    f.game.tick(0.05);
    assert.deepEqual(f.game.personal.runtime(a.p).deli.state.arrivals, []);
    for (let i = 0; i < 4; i++) f.game.tick(0.05);
    f.game.broadcast();
    const expired = a.messages.findLast(
      (m) => m.type === 'playerState' && m.state?.deliveryArrivals,
    );
    assert.ok(expired?.type === 'playerState');
    assert.deepEqual(expired.state?.deliveryArrivals, []);
    assert.equal(a.p.inventory.meta.sandwiches, 1);
  } finally {
    await f.game.close();
  }
});

test('Mazarine sweeping pays one coin, animates work, and retains its three-minute cooldown after restart', async () => {
  const f = await setup();
  let game = f.game;
  try {
    const a = await player(game, 56003);
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'mazarine-clerk',
      offer: 'sweep',
    });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 26);
    assert.equal(a.p.gesture, 'work');
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'mazarine-clerk',
      offer: 'sweep',
    });
    assert.equal(requiredResult(a.messages).ok, false);
    await game.close();
    game = await createGame({ geometry: f.geometry, store: f.store, now: () => 1000000 });
    const b = await player(game, 56003);
    await command(game, b.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'mazarine-clerk',
      offer: 'sweep',
    });
    assert.equal(requiredResult(b.messages).ok, false);
    await game.close();
    game = await createGame({ geometry: f.geometry, store: f.store, now: () => 1180000 });
    const c = await player(game, 56003);
    await command(game, c.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'mazarine-clerk',
      offer: 'sweep',
    });
    assert.equal(requiredResult(c.messages).ok, true);
    assert.equal(c.p.inventory.economy.state.coins, 27);
  } finally {
    await game.close();
  }
});
