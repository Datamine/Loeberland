import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAttackDamage,
  rollEnemyDamage,
  createAlienBattle,
  createHitpoints,
} from '../src/combat.ts';
import { monsterFighter, playerFighter, simulateFight } from '../editor/combat-simulator.ts';
import { ITEM_STATS, ownedEquipmentDefense, sandwichCapacity } from '../src/item-stats.ts';
import { PROGRESSION } from '../src/config/progression.ts';
import { PEQUOD } from '../src/jurassic-layout.ts';
import { combatRandomStream } from '../tools/combat-report.mts';
import { BATTERY_SHOTS } from '../server/combat-supplies.mts';
import { createExpeditions } from '../src/jurassic.ts';
import { createEconomy } from '../src/economy.ts';
import { MONSTER_STATS } from '../src/monster-drops.ts';
import { GOBLIN_KING } from '../src/goblin-incubator-cave.ts';
import { monsterInBombArea, bombTileArea } from '../src/stealth-bomber.ts';

test('prepared players can beat solo encounters at matched Strength and Hitpoints levels', () => {
  const armor = {
    early: { owned: ['iron-armor'], look: { torso: 'iron-armor' } },
    mid: {
      owned: ['iron-armor', 'iron-armor-legs', 'combat-boots'],
      look: { torso: 'iron-armor', legs: 'iron-armor-legs', boots: true },
    },
    late: {
      owned: ['ice-top', 'ice-pants', 'combat-boots', 'backpack'],
      look: { iceTop: true, icePants: true, boots: true },
    },
    emf: {
      owned: ['tinfoil-suit', 'ice-pants', 'combat-boots', 'backpack'],
      look: { tinfoil: true, icePants: true, boots: true },
    },
  };
  const rounds = 500;
  for (const [id, stats] of Object.entries(MONSTER_STATS)) {
    // The King has a separate multiplayer test with his guards and both attacks.
    if (id === GOBLIN_KING) continue;
    // Bosses above the skill cap are tested with max-level player skills.
    const level = Math.min(stats.level, PROGRESSION.maxLevel);
    const railgun = level >= 32 || id === 'raptor';
    const weapon = railgun ? 'railgun' : level >= 9 ? 'katana' : level >= 4 ? 'crowbar' : 'rolling-pin';
    const kit = id === 'emf-warrior'
      ? armor.emf
      : level >= 32
        ? armor.late
        : level >= 16
          ? armor.mid
          : level >= 8
            ? armor.early
            : null;
    const purse = { ownedEquipment: kit?.owned ?? [] };
    const player = playerFighter({
      level,
      weapon,
      defense: ownedEquipmentDefense(purse, kit?.look ?? {}),
      sandwiches: sandwichCapacity(purse),
      distance: id === 'kraken' ? PEQUOD.krakenDistance : railgun ? ITEM_STATS.railgun.range : 0,
    });
    const monster = monsterFighter(id);
    const random = combatRandomStream(77190);
    const availableShots = id === 'kraken' ? 2 * BATTERY_SHOTS : BATTERY_SHOTS;
    let wins = 0;
    let foodUsed = 0;
    for (let round = 0; round < rounds; round++) {
      const result = simulateFight([player, monster], random);
      if (result.winner === 0 && (!railgun || result.attacks[0] <= availableShots)) {
        wins++;
        foodUsed += result.foodUsed[0];
      }
    }
    assert.ok(wins >= rounds * 0.95, `${id}: ${wins}/${rounds} wins with ${weapon} at level ${level}`);
    if (id === 'kraken') assert.ok(foodUsed / wins >= 4, 'the boss still rewards bringing food');
    if (id === 'landshark') assert.ok(foodUsed / wins >= 0.75, 'Landshark bites threaten iron armor');
  }
});

test('Mad Scientist DPS uses the live hit roll and cadence while simulated damage waits for impact', () => {
  const attacker = monsterFighter('mad-scientist');
  const opponent = { ...monsterFighter('cow'), level: 1, hp: 30 };
  const roll = attacker.range(opponent);
  assert.deepEqual(roll, { min: 9, max: 47, accuracy: 0.9 });
  assert.equal((averageAttackDamage(roll) / attacker.interval).toFixed(2), '13.62');
  const expectedWithArmor = (0.9 * 666) / 39;
  assert.ok(Math.abs(averageAttackDamage(roll, 11) - expectedWithArmor) < 1e-10);
  const frames: { time: number; hp: number }[] = [];
  const result = simulateFight(
    [attacker, opponent],
    () => 0.5,
    (time, hp) => {
      frames.push({ time, hp: hp[1] });
    },
  );
  const firstHit = requiredFixture(frames.find((frame) => frame.hp < opponent.hp));
  assert.ok(Math.abs(firstHit.time - 1.15) < 1e-10);
  assert.equal(firstHit.hp, 2);
  assert.equal(result.damage[0], 30, 'the fight counts health lost, including a capped final hit');
});

test('ordinary creature bomb eligibility excludes quest species and uses the same 3×3 tile boundary', () => {
  const area = bombTileArea(10, 20);
  for (const combatKind of ['cow', 'bear', 'snow-giant', 'ice-giant'] satisfies [
    string,
    string,
    string,
    string,
  ])
    assert.ok(monsterInBombArea({ combatKind, hp: 20, x: 10.5, z: 20.5 }, area));
  for (const combatKind of ['raptor', 'kraken', 'spectre', undefined])
    assert.equal(monsterInBombArea({ combatKind, hp: 600, x: 10.5, z: 20.5 }, area), false);
  assert.equal(monsterInBombArea({ combatKind: 'bear', hp: 20, x: 12, z: 20.5 }, area), false);
  assert.equal(monsterInBombArea({ combatKind: 'bear', hp: 0, x: 10, z: 20 }, area), false);
});
test('ice defense requires ownership and equipment, stacks and never turns a hit into healing', () => {
  assert.equal(
    ownedEquipmentDefense(
      { ownedEquipment: ['ice-top', 'ice-pants'] satisfies [string, string] },
      { iceTop: true, icePants: true },
    ),
    10,
  );
  assert.equal(ownedEquipmentDefense({ ownedEquipment: [] }, { iceTop: true, icePants: true }), 0);
  assert.equal(ownedEquipmentDefense({ ownedEquipment: ['ice-top'] }, {}), 0);
  assert.equal(
    rollEnemyDamage(14, 1, () => 0.5, 5),
    rollEnemyDamage(14, 1, () => 0.5) - 5,
  );
  assert.equal(
    rollEnemyDamage(7, 1, () => 0, 10),
    0,
  );
  let defense = 0;
  const health = createHitpoints(),
    battle = createAlienBattle({ health, defense: () => defense, random: () => 0.5 });
  battle.update(0.85);
  assert.equal(health.state.hp, 25);
  defense = 10;
  battle.update(1.25);
  assert.equal(health.state.hp, 25);
});
test('the level-60 kraken enrages once at half health, accelerates its attacks and hits harder', () => {
  const p = { x: 0, z: 0, eligible: false },
    events: import('../src/types/expeditions.ts').ExpeditionEvent[] = [],
    health = {
      state: { hp: 1000, max: 1000 },
      heal(n = 0) {
        this.state.hp = Math.min(this.state.max, this.state.hp + n);
        return n;
      },
      damage(n: number) {
        this.state.hp -= n;
        return n;
      },
    },
    g = createExpeditions({
      saved: { raptor: 'completed', railgun: true },
      health,
      economy: createEconomy(),
      player: () => p,
      random: () => 0.5,
      onEvent: (e) => events.push(e),
    });
  g.setHarbor({ x: 0, z: 0 });
  g.board();
  g.update(6);
  p.x = g.ship.x;
  p.eligible = true;
  assert.equal(MONSTER_STATS.kraken.level, 60);
  assert.equal(g.kraken.max, 1400);
  g.ship.attackIn = 0.05;
  g.update(0.05);
  const normal = requiredFixture(
    requiredFixture(events.filter((e) => e.type === 'damage').at(-1)).damage,
  );
  g.kraken.hp = g.kraken.max / 2;
  g.ship.attackIn = 2.8;
  g.update(0.05);
  assert.equal(g.kraken.enraged, true);
  assert.ok(g.ship.attackIn <= MONSTER_STATS.kraken.enrageInterval);
  g.update(1.95);
  const enraged = requiredFixture(
    requiredFixture(events.filter((e) => e.type === 'damage').at(-1)).damage,
  );
  assert.ok(enraged > normal);
  const count = events.filter((e) => e.type === 'damage').length;
  g.update(2);
  assert.equal(events.filter((e) => e.type === 'damage').length, count + 1);
  assert.equal(events.filter((e) => e.type === 'kraken-enraged').length, 1);
  g.abandonShip();
  g.board();
  assert.equal(g.kraken.enraged, false);
  assert.equal(g.kraken.hp, MONSTER_STATS.kraken.hp);
});
