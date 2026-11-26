import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReport, weaponExpectation } from '../tools/combat-report.mts';
import { ITEM_STATS, PLAYER_WEAPONS, isProjectileWeapon, selectedWeapon } from '../src/item-stats.ts';
import { PROGRESSION } from '../src/config/progression.ts';
import { normalizeCharacter } from '../src/character-config.ts';
import { COMBAT_SUPPLY_OFFERS } from '../src/combat-supply-shop.ts';
import { BATTERY_SHOTS } from '../server/combat-supplies.mts';
import { LIGHTSABER_HITS } from '../src/config/lightsaber.ts';

test('seeded rolls match analytical damage, accuracy and DPS at every Strength level at maximum range', () => {
  const rows = combatReport({
    levels: Array.from({ length: PROGRESSION.maxLevel }, (_, i) => i + 1),
    samples: 20000,
    atMaxRange: true,
  });
  assert.equal(
    rows.length,
    PROGRESSION.maxLevel *
      Object.values(ITEM_STATS).filter((item) => item.slot === 'weapon').length,
  );
  for (const row of rows) {
    assert.ok(
      Math.abs(row.averageDamage - row.expectedAverageDamage) < 6 * row.standardError + 0.002,
      JSON.stringify(row),
    );
    const accuracyError = Math.sqrt(row.expectedAccuracy * (1 - row.expectedAccuracy) / row.samples);
    assert.ok(
      Math.abs(row.observedAccuracy - row.expectedAccuracy) < 6 * accuracyError,
      JSON.stringify(row),
    );
    assert.equal(row.observedDPS, row.averageDamage / requiredFixture(row.attackSeconds));
  }
  for (const id of PLAYER_WEAPONS) {
    assert.ok(weaponExpectation(PROGRESSION.maxLevel, id).accuracy <= 0.93);
    assert.ok(weaponExpectation(PROGRESSION.maxLevel, id).dps > weaponExpectation(1, id).dps);
    for (let level = 2; level <= PROGRESSION.maxLevel; level++)
      assert.ok(weaponExpectation(level, id).dps >= weaponExpectation(level - 1, id).dps);
  }
});
test('inebriation halves average DPS at 100%, while four armor defense reduces damage without increasing misses', () => {
  const sober = combatReport({ levels: [1, 5, 10] satisfies [number, number, number] }),
    drunk = combatReport({
      levels: [1, 5, 10] satisfies [number, number, number],
      inebriation: 100,
    }),
    armored = combatReport({ levels: [1, 5, 10] satisfies [number, number, number], defense: 4 });
  for (let i = 0; i < sober.length; i++) {
    assert.equal(drunk[i].expectedDPS, sober[i].expectedDPS * 0.5);
    assert.ok(armored[i].expectedDPS < sober[i].expectedDPS);
    assert.equal(armored[i].expectedAccuracy, sober[i].expectedAccuracy);
    assert.ok(
      Math.abs(drunk[i].averageDamage - drunk[i].expectedAverageDamage) <
        6 * drunk[i].standardError + 0.002,
    );
    assert.ok(
      Math.abs(armored[i].averageDamage - armored[i].expectedAverageDamage) <
        6 * armored[i].standardError + 0.002,
    );
  }
});
test('Fist is unarmed, including legacy Automatic saves, and never silently equips an owned weapon', () => {
  const gear = { ownedEquipment: ['railgun', 'bayonet', 'battleaxe'] };
  assert.equal(normalizeCharacter({ weapon: 'auto' }).weapon, 'unarmed');
  assert.equal(normalizeCharacter({}).weapon, 'unarmed');
  assert.equal(selectedWeapon('unarmed', gear), 'unarmed');
  assert.equal(selectedWeapon('auto', gear), 'unarmed');
  for (const id of ['railgun', 'bayonet', 'battleaxe'] satisfies [string, string, string])
    assert.equal(selectedWeapon(id, gear), id);
});

test('the bowling ball buys more damage than the rolling pin at the cost of reach and consistency', () => {
  for (const level of [1, 10, PROGRESSION.maxLevel]) {
    const ball = weaponExpectation(level, 'bowling-ball');
    const pin = weaponExpectation(level, 'rolling-pin');
    assert.ok(ball.max > pin.max && ball.accuracy < pin.accuracy);
    assert.ok(ball.dps > pin.dps && ball.dps < pin.dps * 1.2);
  }
  assert.ok(ITEM_STATS['bowling-ball'].interval > ITEM_STATS['rolling-pin'].interval);
  assert.ok(ITEM_STATS['bowling-ball'].range < ITEM_STATS['rolling-pin'].range);
});

test('the Combat Lamp lands between the crowbar and battleaxe in DPS and outranges both', () => {
  const lamp = ITEM_STATS['combat-lamp'];
  assert.ok(lamp.range > Math.max(ITEM_STATS.crowbar.range, ITEM_STATS.battleaxe.range));
  assert.ok(lamp.price > ITEM_STATS.crowbar.price && lamp.price < ITEM_STATS.battleaxe.price);
  for (let level = 1; level <= PROGRESSION.maxLevel; level++) {
    const crowbar = weaponExpectation(level, 'crowbar');
    const combatLamp = weaponExpectation(level, 'combat-lamp');
    const axe = weaponExpectation(level, 'battleaxe');
    assert.ok(combatLamp.dps > crowbar.dps && combatLamp.dps < axe.dps, 'Strength ' + level);
  }
});

test('ranged weapons keep close-range damage rolls and lose accuracy past half range', () => {
  for (const weapon of PLAYER_WEAPONS) {
    const range = ITEM_STATS[weapon].range;
    const close = weaponExpectation(30, weapon);
    assert.deepEqual(weaponExpectation(30, weapon, { distance: range / 2 }), close);
    const edge = weaponExpectation(30, weapon, { distance: range });
    if (isProjectileWeapon(weapon)) {
      const mid = weaponExpectation(30, weapon, { distance: range * 0.75 });
      assert.ok(edge.accuracy < mid.accuracy && mid.accuracy < close.accuracy);
      assert.ok(edge.dps < close.dps);
      assert.deepEqual([edge.min, edge.max], [close.min, close.max]);
    } else assert.deepEqual(edge, close);
  }
});

test('Akimbos lead the Railgun up close and the Railgun pulls ahead as the distance opens', () => {
  assert.ok(ITEM_STATS.akibo.range < ITEM_STATS.railgun.range);
  for (const level of [1, 10, 25, 50]) {
    const closeAkimbos = weaponExpectation(level, 'akibo');
    const closeRailgun = weaponExpectation(level, 'railgun');
    const distance = ITEM_STATS.akibo.range;
    assert.ok(closeAkimbos.dps > closeRailgun.dps);
    assert.ok(closeAkimbos.accuracy < closeRailgun.accuracy);
    assert.ok(
      weaponExpectation(level, 'railgun', { distance }).dps >
        weaponExpectation(level, 'akibo', { distance }).dps,
    );
  }
});

test('the missile launcher trades speed and consistency for the longest reach and the hardest hits', () => {
  const launcher = ITEM_STATS['missile-launcher'];
  for (const other of PLAYER_WEAPONS.filter((weapon) => weapon !== 'missile-launcher')) {
    assert.ok(launcher.range > ITEM_STATS[other].range);
    assert.ok(launcher.interval > ITEM_STATS[other].interval);
    assert.ok(weaponExpectation(50, 'missile-launcher').max > weaponExpectation(50, other).max);
  }
  assert.ok(
    weaponExpectation(50, 'missile-launcher', { defense: 16 }).dps >
      weaponExpectation(50, 'akibo', { defense: 16 }).dps,
  );
  assert.ok(weaponExpectation(50, 'missile-launcher').dps < weaponExpectation(50, 'railgun').dps);
});

test('the katana wins on sustained damage and the battleaxe wins on reach and single-hit power', () => {
  assert.ok(ITEM_STATS.katana.interval < ITEM_STATS.battleaxe.interval);
  assert.ok(ITEM_STATS.katana.range < ITEM_STATS.battleaxe.range);
  for (let level = 1; level <= PROGRESSION.maxLevel; level++) {
    const katana = weaponExpectation(level, 'katana');
    const axe = weaponExpectation(level, 'battleaxe');
    assert.ok(katana.max < axe.max && katana.accuracy > axe.accuracy);
    assert.ok(katana.dps > axe.dps);
  }
  assert.ok(
    weaponExpectation(30, 'battleaxe', { defense: 16 }).dps >
      weaponExpectation(30, 'katana', { defense: 16 }).dps,
  );
});

test('the lightsaber has 1.5 tiles of melee reach and higher DPS than the missile launcher', () => {
  assert.equal(isProjectileWeapon('lightsaber'), false);
  assert.equal(ITEM_STATS.lightsaber.range, 1.5);
  assert.equal(ITEM_STATS.lightsaber.interval, 0.56);
  for (let level = 1; level <= PROGRESSION.maxLevel; level++)
    assert.ok(weaponExpectation(level, 'lightsaber').dps > weaponExpectation(level, 'missile-launcher').dps);
});

test('ammo costs per point of expected damage progress from railgun to lightsaber', () => {
  const { buyAmmo, buyBattery, buyMissile } = COMBAT_SUPPLY_OFFERS;
  for (let level = 1; level <= PROGRESSION.maxLevel; level++) {
    const saber = weaponExpectation(level, 'lightsaber');
    const costs = [
      buyBattery.price / BATTERY_SHOTS / weaponExpectation(level, 'railgun').average,
      buyAmmo.price / buyAmmo.units / weaponExpectation(level, 'akibo').average,
      buyMissile.price / weaponExpectation(level, 'missile-launcher').average,
      (buyBattery.price / LIGHTSABER_HITS) * saber.accuracy / saber.average,
    ];
    assert.ok(costs.every((price, i) => i === 0 || price > costs[i - 1]), `Strength ${level}: ${costs}`);
  }
});
