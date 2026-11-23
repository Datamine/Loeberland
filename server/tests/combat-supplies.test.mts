import type { TestGame, TestPlayer } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { fixtureGeometry, player, command, latestResult } from './fixtures.mts';
import { weaponAttackInterval, ITEM_STATS } from '../../src/item-stats.ts';
import { clothingSelection } from '../../src/clothing.ts';

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
    assert.equal(a.p.inventory.economy.state.coins, 75);
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

test('combat supply vendors sell whole-number quantities and reject the entire invalid order', async () => {
  const geometry = fixtureGeometry();
  const game = await createGame({ geometry, store: createMemoryStore() });
  try {
    const a = await player(game, 99206, { 'sf-purse-v1': '{"coins":300}' });
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
    assert.match(batteryOrder?.message || '', /2 railgun batteries for 40 coins/);
    assert.deepEqual(
      [purse.coins, supplies.akimboAmmo, supplies.missiles, supplies.railgunBatteries],
      [45, 60, 4, 2],
    );
    for (const amount of [0, -2, 1.5, '2', null, Number.MAX_SAFE_INTEGER])
      assert.equal((await buy('buyAmmo', amount))?.ok, false);
    assert.equal((await buy('buyBattery', 3))?.ok, false);
    assert.equal((await buy('buyMissile', 1))?.ok, false);
    assert.deepEqual(
      [purse.coins, supplies.akimboAmmo, supplies.missiles, supplies.railgunBatteries],
      [45, 60, 4, 2],
    );
    supplies.akimboAmmo = 999_970;
    assert.equal((await buy('buyAmmo', 2))?.ok, false);
    assert.equal(supplies.akimboAmmo, 999_970);
    assert.equal(purse.coins, 45);
  } finally {
    await game.close();
  }
});

test('EMF warrior rejects unprotected attacks and bombs, requires equipped owned foil, and drops the permanent Weaponry upgrade kit', async () => {
  const geometry = fixtureGeometry();
  geometry.wilderness = { actors: [{ id: 'emf', combatKind: 'emf-warrior', x: 94, z: 120 }] };
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  try {
    const a = await player(game, 99202, { 'sf-purse-v1': '{"coins":100}' }),
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
    const coil = [...game.shared.loot.values()].find((i) => i.itemId === 'railgun-upgrade');
    assert.ok(coil);
    assert.equal(requiredFixture(await act(game, a, 'collect', { id: coil.id })).ok, true);
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('railgun-upgrade'));
    assert.ok(
      Math.abs(
        weaponAttackInterval('railgun', a.p.inventory.economy.state) * 1.1 -
          ITEM_STATS.railgun.interval,
      ) < 1e-10,
    );
    assert.equal(
      weaponAttackInterval('akibo', a.p.inventory.economy.state),
      ITEM_STATS.akibo.interval / 1.1,
    );
    await game.disconnect(a.p);
    const returned = await player(game, 99202);
    assert.ok(returned.p.inventory.economy.state.ownedEquipment.includes('railgun-upgrade'));
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
            ownedEquipment: upgraded ? ['railgun-upgrade'] : [],
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

test('the legacy kit boosts Akimbos and railgun fire rate equally', () => {
  const purse = { ownedEquipment: ['railgun-upgrade'] };
  assert.equal(ITEM_STATS['railgun-upgrade'].name, 'Weaponry upgrade kit');
  for (const weapon of ['akibo', 'railgun']) {
    assert.equal(
      weaponAttackInterval(weapon, purse),
      weaponAttackInterval(weapon, { ownedEquipment: [] }) / 1.1,
    );
  }
  assert.equal(
    weaponAttackInterval('missile-launcher', purse),
    ITEM_STATS['missile-launcher'].interval,
  );
});

test('the armorer sells missiles for 50 coins and the launcher spends one per shot', async () => {
  const geometry = fixtureGeometry();
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0 });
  try {
    const a = await player(game, 99205, {
      'sf-purse-v1': '{"coins":110,"ownedEquipment":["missile-launcher"]}',
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
    assert.equal(purse.coins, 60);
    assert.equal((await buy())?.ok, true);
    assert.equal(purse.coins, 10);
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
