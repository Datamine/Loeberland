import type { TestGame, TestPlayer } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { fixtureGeometry, player, command, latestResult } from './fixtures.mts';
import { itemLoot, weaponAttackInterval, ITEM_STATS } from '../../src/item-stats.ts';
import { clothingSelection } from '../../src/clothing.ts';
import { LIGHTSABER_HITS } from '../../src/config/lightsaber.ts';
import {
  UPGRADED_AKIMBO,
  UPGRADED_RAILGUN,
  WEAPON_UPGRADE_KIT,
} from '../../src/config/weapon-upgrades.ts';
import { equipmentOptions } from '../../src/equipment-options.ts';
import { swapHoldings, tradeStock } from '../trade-inventory.mts';

async function act(
  game: TestGame,
  a: TestPlayer,
  action: string,
  args: { op?: string; id?: string; weapon?: string; amount?: unknown },
) {
  game.receive(a.p, {
    type: 'command',
    request: Math.random(),
    action,
    args,
    inventoryEpoch: a.p.inventory.meta.epoch,
  });
  await a.p.queue;
  return latestResult(a.messages);
}
test('ammo and battery purchases validate location and price, charge explicitly, and spend one unit per shot', async () => {
  const geometry = fixtureGeometry(),
    game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  try {
    const a = await player(game, 99201, {
        'sf-purse-v1': '{"coins":100,"ownedEquipment":["akibo"]}',
      }),
      cow = game.shared.cows[0];
    a.p.inventory.meta.akimboAmmo = 0;
    a.p.inventory.meta.railgunCharge = 0;
    assert.equal(requiredFixture(await act(game, a, 'inventory', { op: 'buyAmmo' })).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 100);
    for (const [id, kind, questRole] of [
      ['armorer', 'armorer', 'armorer'] satisfies [string, string, string],
      ['battery', 'battery-seller'] satisfies [string, string],
      ['chef', 'chef'] satisfies [string, string],
    ]) {
      const npc = { label: 'Test actor', id, kind, questRole, x: a.p.x, z: a.p.z, base: a.p.y };
      geometry.merchants.push(npc);
      game.shared.npcById.set(id, npc);
    }
    assert.equal(requiredFixture(await act(game, a, 'inventory', { op: 'buyAmmo' })).ok, true);
    assert.equal(a.p.inventory.meta.akimboAmmo, 20);
    assert.equal(requiredFixture(await act(game, a, 'inventory', { op: 'buyBattery' })).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 5);
    assert.equal(a.p.inventory.meta.railgunCharge, 0);
    assert.equal(
      requiredFixture(await act(game, a, 'inventory', { op: 'chargeRailgun' })).ok,
      true,
    );
    assert.equal(a.p.inventory.meta.railgunCharge, 25);
    assert.equal(a.p.inventory.meta.railgunBatteries, 0);
    Object.assign(a.p, { x: cow.x - 1, z: cow.z });
    cow.hp = cow.max = 1000;
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: cow.id, weapon: 'railgun' })).ok,
      true,
    );
    assert.equal(a.p.inventory.meta.railgunCharge, 24);
    await act(game, a, 'attack', { id: cow.id, weapon: 'railgun' });
    assert.equal(
      a.p.inventory.meta.railgunCharge,
      24,
      'repeated commands during cooldown cost nothing',
    );
    a.p.shotAt = 0;
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: cow.id, weapon: 'akibo' })).ok,
      true,
    );
    assert.equal(a.p.inventory.meta.akimboAmmo, 19);
    a.p.shotAt = 0;
    a.p.inventory.meta.akimboAmmo = 0;
    const before = cow.hp;
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: cow.id, weapon: 'akibo' })).ok,
      false,
    );
    assert.equal(cow.hp, before);
    const token = a.token;
    await game.disconnect(a.p);
    const returned = await player(game, 99201);
    assert.equal(returned.token, token);
    assert.equal(returned.p.inventory.meta.railgunCharge, 24);
    assert.equal(returned.p.inventory.meta.akimboAmmo, 0);
  } finally {
    await game.close();
  }
});

test('a lightsaber battery powers ten landed hits and misses preserve its charge', async () => {
  let roll = 0;
  const game = await createGame({
    geometry: fixtureGeometry(),
    store: createMemoryStore(),
    random: () => roll,
  });
  try {
    const a = await player(game, 99207, {
      'sf-purse-v1': '{"ownedEquipment":["lightsaber"]}',
    });
    const cow = game.shared.cows[0];
    const supplies = a.p.inventory.meta;
    const reload = () => act(game, a, 'inventory', { op: 'chargeLightsaber' });
    const swing = () => {
      a.p.shotAt = 0;
      return act(game, a, 'attack', { id: cow.id, weapon: 'lightsaber' });
    };
    cow.hp = cow.max = 1000;
    supplies.railgunBatteries = 2;
    Object.assign(a.p, { x: cow.x - 1.51, z: cow.z });
    assert.equal((await reload())?.ok, true);
    await swing();
    assert.equal(cow.hp, 1000);
    assert.equal(supplies.lightsaberCharge, LIGHTSABER_HITS);
    Object.assign(a.p, { x: cow.x - 1.45, z: cow.z });
    roll = 0.99;
    assert.equal((await swing())?.ok, true);
    assert.equal(cow.hp, 1000);
    assert.equal(supplies.lightsaberCharge, LIGHTSABER_HITS);
    roll = 0;
    for (let remaining = LIGHTSABER_HITS - 1; remaining >= 0; remaining--) {
      const hp = cow.hp;
      assert.equal((await swing())?.ok, true);
      assert.ok(cow.hp < hp);
      assert.equal(supplies.lightsaberCharge, remaining);
    }
    assert.equal(supplies.railgunBatteries, 1);
    const hp = cow.hp;
    assert.equal((await swing())?.ok, false);
    assert.equal(cow.hp, hp);
    assert.equal((await reload())?.ok, true);
    assert.equal(supplies.lightsaberCharge, LIGHTSABER_HITS);
    assert.equal(supplies.railgunBatteries, 0);
    assert.equal(supplies.railgunCharge, 25);
  } finally {
    await game.close();
  }
});

test('combat supply vendors sell whole-number quantities and reject the entire invalid order', async () => {
  const geometry = fixtureGeometry();
  const game = await createGame({ geometry, store: createMemoryStore() });
  try {
    const a = await player(game, 99206, { 'sf-purse-v1': '{"coins":278}' });
    const buy = (op: string, amount: unknown) => act(game, a, 'inventory', { op, amount });
    const purse = a.p.inventory.economy.state;
    const supplies = a.p.inventory.meta;
    supplies.akimboAmmo = 0;
    assert.equal((await buy('buyMissile', 2))?.ok, false);
    assert.equal((await buy('buyBattery', 2))?.ok, false);
    for (const [id, kind] of [
      ['armorer', 'armorer'],
      ['battery', 'battery-seller'],
    ]) {
      const npc = { id, kind, label: id, questRole: kind, x: a.p.x, z: a.p.z, base: a.p.y };
      geometry.merchants.push(npc);
      game.shared.npcById.set(id, npc);
    }
    assert.equal((await buy('buyAmmo', 3))?.ok, true);
    assert.equal((await buy('buyMissile', 4))?.ok, true);
    const batteryOrder = await buy('buyBattery', 2);
    assert.equal(batteryOrder?.ok, true);
    assert.match(batteryOrder?.message || '', /2 railgun batteries for 100 coins/);
    assert.deepEqual(
      [purse.coins, supplies.akimboAmmo, supplies.missiles, supplies.railgunBatteries],
      [7, 60, 4, 2],
    );
    for (const amount of [0, -2, 1.5, '2', null, Number.MAX_SAFE_INTEGER])
      assert.equal((await buy('buyAmmo', amount))?.ok, false);
    assert.equal((await buy('buyBattery', 3))?.ok, false);
    assert.equal((await buy('buyMissile', 1))?.ok, false);
    assert.deepEqual(
      [purse.coins, supplies.akimboAmmo, supplies.missiles, supplies.railgunBatteries],
      [7, 60, 4, 2],
    );
    supplies.akimboAmmo = 999_970;
    assert.equal((await buy('buyAmmo', 2))?.ok, false);
    assert.equal(supplies.akimboAmmo, 999_970);
    assert.equal(purse.coins, 7);
  } finally {
    await game.close();
  }
});

test('EMF warriors require equipped foil and each kit upgrades a single weapon', async () => {
  const geometry = fixtureGeometry();
  geometry.wilderness = { actors: [{ id: 'emf', combatKind: 'emf-warrior', x: 94, z: 120 }] };
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  try {
    const a = await player(game, 99202, {
        'sf-purse-v1': '{"coins":100,"ownedEquipment":["akibo"]}',
      }),
      warrior = game.shared.wilderness.actors[0];
    Object.assign(a.p, { x: warrior.x - 1, z: warrior.z });
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: warrior.id, weapon: 'railgun' })).ok,
      false,
    );
    assert.equal(a.p.inventory.meta.railgunCharge, 25);
    assert.equal(
      game.shared.wilderness.damage(warrior.id, 10000, { id: a.p.id, x: a.p.x, z: a.p.z }).ok,
      false,
    );
    const chef = { label: 'chef', id: 'chef', kind: 'chef', x: a.p.x, z: a.p.z, base: a.p.y };
    geometry.merchants.push(chef);
    game.shared.npcById.set(chef.id, chef);
    assert.equal(requiredFixture(await act(game, a, 'inventory', { op: 'buyTinfoil' })).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 80);
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: warrior.id, weapon: 'railgun' })).ok,
      false,
      'ownership alone is insufficient',
    );
    Object.assign(a.p.appearance, clothingSelection({ torso: 'tinfoil-suit' }));
    warrior.hp = 1;
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: warrior.id, weapon: 'railgun' })).ok,
      true,
    );
    const pickupKit = async () => {
      const bundle = [...game.shared.loot.values()].find(
        (item) => item.lootKind === WEAPON_UPGRADE_KIT,
      );
      assert.ok(bundle);
      const result = requiredFixture(await act(game, a, 'collect', { id: bundle.id }));
      assert.equal(result.ok, true);
      assert.equal(result.award?.inventory?.weaponUpgradeKits, 1);
    };
    const upgrade = async (weapon: string) =>
      requiredFixture(await act(game, a, 'inventory', { op: 'upgradeWeapon', weapon }));
    const available = a.p.inventory.economy.state;
    await pickupKit();
    assert.equal(weaponAttackInterval('railgun', available), ITEM_STATS.railgun.interval);
    assert.equal(weaponAttackInterval('akibo', available), ITEM_STATS.akibo.interval);

    assert.equal((await upgrade('railgun')).inventory?.weaponUpgradeKits, 0);
    assert.ok(available.ownedEquipment.includes(UPGRADED_RAILGUN));
    assert.equal(weaponAttackInterval('railgun', available), ITEM_STATS.railgun.interval / 1.1);
    assert.equal(weaponAttackInterval('akibo', available), ITEM_STATS.akibo.interval);
    assert.equal((await upgrade('akibo')).ok, false);

    game.shared.tick(2);
    warrior.hp = 1;
    assert.equal(
      requiredFixture(await act(game, a, 'attack', { id: warrior.id, weapon: 'railgun' })).ok,
      true,
    );
    await pickupKit();
    assert.equal((await upgrade('railgun')).ok, false);
    assert.equal(a.p.inventory.meta.weaponUpgradeKits, 1);
    assert.equal((await upgrade('akibo')).inventory?.weaponUpgradeKits, 0);
    assert.equal(weaponAttackInterval('akibo', available), ITEM_STATS.akibo.interval / 1.1);
    assert.deepEqual(equipmentOptions(available).weapon, [
      { value: 'unarmed', label: 'Fist' },
      { value: 'railgun', label: 'Upgraded Railgun' },
      { value: 'akibo', label: 'Upgraded Akimbo' },
    ]);
    assert.ok(a.p.inventory.snapshot().collection.includes(UPGRADED_AKIMBO));
    await game.disconnect(a.p);
    const returned = await player(game, 99202);
    assert.ok(returned.p.inventory.economy.state.ownedEquipment.includes(UPGRADED_RAILGUN));
    assert.ok(returned.p.inventory.economy.state.ownedEquipment.includes(UPGRADED_AKIMBO));
    assert.equal(returned.p.inventory.meta.weaponUpgradeKits, 0);
  } finally {
    await game.close();
  }
});

test('railgun upgrade changes the authoritative repeated-shot interval', async () => {
  for (const upgraded of [false, true] satisfies [boolean, boolean]) {
    const game = await createGame({
      geometry: fixtureGeometry(),
      store: createMemoryStore(),
      random: () => 0,
    });
    try {
      const a = await player(game, upgraded ? 99204 : 99203, {
          'sf-purse-v1': JSON.stringify({
            coins: 25,
            ownedEquipment: upgraded ? [UPGRADED_RAILGUN] : [],
          }),
        }),
        cow = game.shared.cows[0];
      cow.hp = cow.max = 10000;
      Object.assign(a.p, { x: cow.x - 1, z: cow.z });
      await command(game, a.p, 'attack', { id: cow.id, weapon: 'railgun' });
      for (let i = 0; i < 336; i++) game.shared.tick(0.05);
      const hits = a.messages.filter(
        (m): m is Extract<typeof m, { type: 'sharedHit' }> =>
          m.type === 'sharedHit' && m.target === cow.id,
      );
      assert.equal(
        hits.length,
        Math.floor(16.8 / weaponAttackInterval('railgun', a.p.inventory.economy.state) + 1e-8) + 1,
      );
    } finally {
      await game.close();
    }
  }
});

test('an unarmed player cannot get a kit as a drop, from the ground or through trade', async (t) => {
  const geometry = fixtureGeometry();
  geometry.wilderness = { actors: [{ id: 'emf', combatKind: 'emf-warrior', x: 94, z: 120 }] };
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  t.after(() => game.close());
  const a = await player(game, 99220, { 'sf-expeditions-v1': '{}' });
  const b = await player(game, 99221);
  const warrior = game.shared.wilderness.actors[0];
  const kit = itemLoot(WEAPON_UPGRADE_KIT);
  game.shared.wilderness.damage(warrior.id, warrior.hp, { ...a.p, tinfoil: true });
  assert.ok(![...game.shared.loot.values()].some((i) => i.lootKind === WEAPON_UPGRADE_KIT));
  assert.equal(a.p.inventory.receive(kit).ok, false);
  assert.equal(b.p.inventory.receive(kit).ok, true);
  const stock = (person: TestPlayer) => ({
    inventory: person.p.inventory.snapshot(),
    grapplingHook: false,
    growth: null,
  });
  const line = { id: WEAPON_UPGRADE_KIT, quantity: 1 };
  assert.equal(swapHoldings(stock(a), stock(b), [], [line]), null);
  assert.equal(a.p.inventory.receive(itemLoot('akibo')).ok, true);
  const swap = swapHoldings(stock(a), stock(b), [], [line]);
  assert.equal(swap?.[0].inventory.weaponUpgradeKits, 1);
  assert.equal(swap?.[1].inventory.weaponUpgradeKits, 0);
});

test('legacy passive kits migrate to one unspent kit and an Akimbo upgrade stays with the traded weapon', async (t) => {
  const game = await createGame({ geometry: fixtureGeometry(), store: createMemoryStore() });
  t.after(() => game.close());
  const a = await player(game, 99222, {
    'sf-purse-v1': JSON.stringify({ ownedEquipment: [WEAPON_UPGRADE_KIT, 'akibo'] }),
  });
  assert.equal(a.p.inventory.meta.weaponUpgradeKits, 1);
  assert.equal(
    weaponAttackInterval('railgun', a.p.inventory.economy.state),
    ITEM_STATS.railgun.interval,
  );
  assert.equal(
    weaponAttackInterval('akibo', a.p.inventory.economy.state),
    ITEM_STATS.akibo.interval,
  );
  await game.disconnect(a.p);
  const returned = await player(game, 99222);
  assert.equal(returned.p.inventory.meta.weaponUpgradeKits, 1);
  assert.equal(
    requiredFixture(
      await act(game, returned, 'inventory', { op: 'upgradeWeapon', weapon: 'akibo' }),
    ).ok,
    true,
  );
  const b = await player(game, 99223);
  const stock = (p: TestPlayer) => ({
    inventory: p.p.inventory.snapshot(),
    grapplingHook: false,
    growth: null,
  });
  assert.ok(
    tradeStock(stock(returned)).some(
      ({ id, name }) => id === UPGRADED_AKIMBO && name === 'Upgraded Akimbo',
    ),
  );
  const offer = [{ id: UPGRADED_AKIMBO, quantity: 1 }];
  const swap = swapHoldings(stock(returned), stock(b), offer, []);
  assert.ok(swap);
  assert.equal(weaponAttackInterval('akibo', swap[0].inventory.purse), ITEM_STATS.akibo.interval);
  assert.equal(
    weaponAttackInterval('akibo', swap[1].inventory.purse),
    ITEM_STATS.akibo.interval / 1.1,
  );
  assert.equal(b.p.inventory.receive(itemLoot('akibo')).ok, true);
  assert.equal(swapHoldings(stock(returned), stock(b), offer, []), null);
});

test('the armorer sells missiles for 9 coins and the launcher spends one per shot', async () => {
  const geometry = fixtureGeometry();
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  try {
    const a = await player(game, 99205, {
      'sf-purse-v1': '{"coins":20,"ownedEquipment":["missile-launcher"]}',
    });
    const buy = () => act(game, a, 'inventory', { op: 'buyMissile' });
    const purse = a.p.inventory.economy.state,
      cow = game.shared.cows[0];
    assert.equal((await buy())?.ok, false);
    assert.equal(a.p.inventory.snapshot().missiles, 0);
    const armorer = {
      id: 'armorer',
      label: 'Armorer',
      questRole: 'armorer',
      x: a.p.x,
      z: a.p.z,
      base: a.p.y,
    };
    geometry.merchants.push(armorer);
    game.shared.npcById.set(armorer.id, armorer);
    assert.equal((await buy())?.ok, true);
    assert.equal(purse.coins, 11);
    assert.equal((await buy())?.ok, true);
    assert.equal(purse.coins, 2);
    assert.equal((await buy())?.ok, false);
    assert.equal(a.p.inventory.snapshot().missiles, 2);
    await game.disconnect(a.p);
    const b = await player(game, 99205);
    assert.equal(b.p.inventory.snapshot().missiles, 2);
    Object.assign(b.p, { x: cow.x - 9, z: cow.z });
    cow.hp = cow.max = 1000;
    const attack = () => act(game, b, 'attack', { id: cow.id, weapon: 'missile-launcher' });
    assert.equal((await attack())?.ok, true);
    assert.equal(b.p.inventory.snapshot().missiles, 1);
    await attack();
    assert.equal(b.p.inventory.snapshot().missiles, 1);
    b.p.shotAt = 0;
    assert.equal((await attack())?.ok, true);
    assert.equal(b.p.inventory.snapshot().missiles, 0);
    const hp = cow.hp;
    b.p.shotAt = 0;
    assert.match((await attack())?.message || '', /out of missiles/i);
    assert.equal(cow.hp, hp);
  } finally {
    await game.close();
  }
});
