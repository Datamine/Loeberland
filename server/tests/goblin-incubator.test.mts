import assert from 'node:assert/strict';
import test from 'node:test';
import { enemyDamageRange, rollWeaponDamage } from '../../src/combat.ts';
import { LIGHTSABER_HITS } from '../../src/config/lightsaber.ts';
import { MONSTER_STATS, rollMonsterDrops } from '../../src/monster-drops.ts';
import {
  GOBLIN_CITY_HALL,
  GOBLIN_CHARM,
  GOBLIN_KING,
  GOBLIN_ROCK,
  INCUBATOR_CAVE,
  INCUBATOR_CRATES,
  INCUBATOR_DEATH_LINES,
  INCUBATOR_ENTRANCE,
  INCUBATOR_FLOOR,
  INCUBATOR_GUARD_LINES,
  INCUBATOR_NAV,
  INCUBATOR_POSTER_BOXES,
  INCUBATOR_SPAWNS,
  incubatorPoint,
} from '../../src/goblin-incubator-cave.ts';
import { GOBLIN_INCUBATOR } from '../../src/goblin-town.ts';
import { ITEM_STATS, goblinCharmEquipped } from '../../src/item-stats.ts';
import { hitpointMaximum, SKILL_THRESHOLDS } from '../../src/progression.ts';
import { applyWorldPatches, type WorldMaps } from '../../src/world-deltas.ts';
import { createMemoryStore } from '../store.mts';
import { createGame } from '../game.mts';
import {
  fixtureGeometry,
  player,
  requiredResult,
  storedPlayerFixture,
  type TestPlayer,
} from './fixtures.mts';

const kingSpawn = INCUBATOR_SPAWNS.find((spawn) => spawn.id === GOBLIN_KING)!;
const port = { x: GOBLIN_CITY_HALL.entry.x + 0.5, z: GOBLIN_CITY_HALL.entry.y + 0.5 };
const cell = (point: { x: number; z: number }) => ({ x: point.x - 0.5, y: point.z - 0.5 });
const royalSentries = INCUBATOR_SPAWNS.filter(
  (spawn) =>
    spawn.id !== GOBLIN_KING &&
    Math.hypot(spawn.x - kingSpawn.x, spawn.z - kingSpawn.z) < 9 &&
    INCUBATOR_NAV.segment(cell(spawn), cell(kingSpawn)),
);

async function fixture(spawns = INCUBATOR_SPAWNS) {
  let clock = 1_000_000;
  let roll = 0.5;
  const geometry = fixtureGeometry();
  geometry.sights = [
    {
      id: GOBLIN_INCUBATOR.id,
      kind: GOBLIN_INCUBATOR.id,
      label: GOBLIN_INCUBATOR.name,
      entry: GOBLIN_INCUBATOR.entry,
    },
  ];
  geometry.merchants = [{ ...GOBLIN_CITY_HALL.clerk, label: GOBLIN_CITY_HALL.clerk.name }];
  geometry.wilderness = { actors: [...spawns] };
  const store = createMemoryStore();
  const game = await createGame({ geometry, store, now: () => clock, random: () => roll });
  async function act(person: TestPlayer, action: string, args: Record<string, unknown> = {}) {
    game.receive(person.p, {
      type: 'command',
      request: Math.random(),
      action,
      args,
      inventoryEpoch: person.p.inventory.meta.epoch,
    });
    await person.p.queue;
    return requiredResult(person.messages);
  }
  async function visitor(number: number, fish = 5) {
    const person = await player(game, number, { 'sf-purse-v1': JSON.stringify({ fish }) });
    Object.assign(person.p, port, { hp: 1000, max: 1000 });
    return person;
  }
  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      clock += 50;
      game.tick(0.05);
    }
  }
  return {
    game,
    store,
    visitor,
    act,
    enter: (p: TestPlayer) => act(p, 'instanceEnter', { kind: INCUBATOR_CAVE.kind }),
    step,
    setRoll(value: number) {
      roll = value;
    },
  };
}
function visible(person: TestPlayer) {
  const maps: WorldMaps = {};
  for (const event of person.messages)
    if (event.type === 'world') applyWorldPatches(maps, event.patches, event.removed);
  return maps;
}

test('Goblin City Hall charges five live fish per visit and shares only its own players and mobs', async (t) => {
  const { game, store, visitor, act, enter, step } = await fixture();
  t.after(() => game.close());
  const a = await visitor(4701, 10);
  const b = await visitor(4702);
  const surface = await visitor(4703, 4);

  Object.assign(a.p, { x: GOBLIN_INCUBATOR.entry.x + 0.5, z: GOBLIN_INCUBATOR.entry.y + 0.5 });
  assert.match((await enter(a)).message ?? '', /walk up to the Goblin City Hall Clerk/i);
  assert.equal(a.p.instance.kind, 'world');
  assert.equal(a.p.inventory.economy.state.fish, 10);
  Object.assign(a.p, port);
  assert.match((await enter(surface)).message ?? '', /5 live fish/);
  assert.equal(surface.p.inventory.economy.state.fish, 4);

  const receipt = await enter(a);
  assert.equal(receipt.ok, true);
  assert.match(receipt.message ?? '', /hand the clerk 5 live fish.*enter Goblin City Hall/);
  assert.equal(a.p.inventory.economy.state.fish, 5);
  assert.equal((await enter(a)).ok, true);
  assert.equal(a.p.inventory.economy.state.fish, 5);
  assert.equal((await enter(b)).ok, true);
  assert.equal(b.p.inventory.economy.state.fish, 0);
  assert.equal(a.p.instance.id, INCUBATOR_CAVE.id);
  assert.equal(b.p.instance.id, a.p.instance.id);
  assert.equal(a.p.y, INCUBATOR_FLOOR + 0.025);
  game.broadcast();
  assert.ok(a.p.seen.has(b.p.id));
  assert.ok(!a.p.seen.has(surface.p.id));
  assert.ok(!surface.p.seen.has(a.p.id));
  const sentry = game.shared.wilderness.actors[0];
  assert.ok(visible(a).wilderness?.has(sentry.id));
  assert.ok(!visible(surface).wilderness?.has(sentry.id));
  assert.equal((await act(surface, 'attack', { id: sentry.id, weapon: 'unarmed' })).ok, false);

  const lowerChamber = incubatorPoint(8, 30);
  assert.equal((await act(a, 'moveTo', { ...lowerChamber })).ok, true);
  step(45);
  assert.ok(Math.hypot(a.p.x - lowerChamber.x, a.p.z - lowerChamber.z) < 0.1);
  assert.equal((await act(a, 'instanceLeave')).ok, false);
  a.p.hp = a.p.max = 10_000;
  const throneChamber = incubatorPoint(35, 10);
  assert.equal((await act(a, 'moveTo', { ...throneChamber })).ok, true);
  step(430);
  assert.ok(
    Math.hypot(a.p.x - throneChamber.x, a.p.z - throneChamber.z) < 0.1,
    JSON.stringify({
      position: { x: a.p.x, z: a.p.z },
      goal: a.p.moveGoal,
      mode: a.p.mode,
      hp: a.p.hp,
    }),
  );
  game.broadcast();
  const throneCreatures = visible(a).wilderness;
  assert.ok(throneCreatures?.has(GOBLIN_KING));
  for (const { id } of royalSentries) assert.ok(throneCreatures?.has(id), id);
  assert.equal((await act(a, 'moveTo', { ...INCUBATOR_ENTRANCE })).ok, true);
  step(430);
  assert.equal((await act(a, 'instanceLeave')).ok, true);
  assert.deepEqual({ x: a.p.x, z: a.p.z }, port);
  assert.equal(a.p.instance.kind, 'world');
  assert.equal((await enter(a)).ok, true);
  assert.equal(a.p.inventory.economy.state.fish, 0);
  await game.flush();
  const stored = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.equal(stored.playerState.inventory.economy.fish, 0);
});

test('the cave connects the entrance to 44 level 40/50 goblins and the King', () => {
  assert.equal(INCUBATOR_SPAWNS.length, 45);
  for (const spawn of INCUBATOR_SPAWNS) {
    assert.ok(INCUBATOR_NAV.path(cell(INCUBATOR_ENTRANCE), cell(spawn)), spawn.id);
    assert.ok([40, 50, 90].includes(MONSTER_STATS[spawn.combatKind].level), spawn.id);
  }
  for (const [x, z] of INCUBATOR_CRATES) {
    const center = cell(incubatorPoint(x, z));
    assert.equal(INCUBATOR_NAV.free(center.x, center.y), false);
  }
  assert.equal(INCUBATOR_POSTER_BOXES.length, 2);
  for (const box of INCUBATOR_POSTER_BOXES) {
    const center = cell(box);
    assert.equal(INCUBATOR_NAV.free(center.x, center.y), false);
    const approach = INCUBATOR_NAV.nearest(center.x, center.y, cell(INCUBATOR_ENTRANCE));
    assert.ok(approach && Math.hypot(approach.x - center.x, approach.y - center.y) <= 1.5);
  }
  assert.equal(INCUBATOR_NAV.segment(cell(INCUBATOR_ENTRANCE), cell(kingSpawn)), false);
  assert.equal(royalSentries.length, 10);
});

test('the guarded King defeats a fully stocked solo melee fighter and falls to a party of three', async () => {
  const xp = SKILL_THRESHOLDS.at(-1)!;
  const max = hitpointMaximum(xp);
  const look = {
    torso: 'icy-kevlar-vest',
    legs: 'icy-kevlar-pants',
    boots: true,
    hat: 'upgraded-goblin-helmet',
    weapon: 'lightsaber',
  };
  const positions = [incubatorPoint(37, 7), incubatorPoint(38, 6), incubatorPoint(38, 8)];

  async function fight(size: number) {
    const { game, act, enter, step } = await fixture([...royalSentries, kingSpawn]);
    try {
      const party: TestPlayer[] = [];
      const attack = (person: TestPlayer) =>
        act(person, 'attack', { id: GOBLIN_KING, weapon: look.weapon });
      for (let i = 0; i < size; i++) {
        const person = await player(game, 4740 + i, {
          'sf-purse-v1': JSON.stringify({
            fish: 5,
            ownedEquipment: [look.torso, look.legs, look.weapon, 'combat-boots', 'backpack'],
            ownedHats: [look.hat],
          }),
          'sf-strength-v1': JSON.stringify({ xp }),
          'sf-hitpoints-v1': JSON.stringify({ xp, hp: max }),
          'sf-deli-v1': JSON.stringify({ sandwiches: 20 }),
        });
        Object.assign(person.p, port);
        assert.equal((await enter(person)).ok, true);
        Object.assign(person.p, positions[i]);
        assert.equal((await act(person, 'equipAppearance', { look })).ok, true);
        assert.equal(person.p.max, max);
        person.p.inventory.meta.railgunBatteries = 20;
        person.p.inventory.meta.lightsaberCharge = LIGHTSABER_HITS;
        party.push(person);
      }

      const king = game.shared.wilderness.actors.find((actor) => actor.id === GOBLIN_KING)!;
      for (const member of party) assert.equal((await attack(member)).ok, true);
      const stillStanding = () => party.filter(({ p }) => p.hp > 0);
      for (let i = 0; i < 2400 && king.hp && stillStanding().length; i++) {
        for (const member of stillStanding()) {
          const { p } = member;
          if (p.hp <= p.max - ITEM_STATS.sandwich.healing && p.inventory.meta.sandwiches > 0)
            assert.equal((await act(member, 'inventory', { op: 'eat' })).ok, true);
          if (p.inventory.meta.lightsaberCharge === 0) {
            assert.equal((await act(member, 'inventory', { op: 'chargeLightsaber' })).ok, true);
            await attack(member);
            assert.equal(p.attack, GOBLIN_KING);
          }
        }
        step();
      }
      return { kingHP: king.hp, survivors: stillStanding().length };
    } finally {
      await game.close();
    }
  }

  const solo = await fight(1);
  assert.equal(solo.survivors, 0);
  assert.ok(solo.kingHP > 0);
  const party = await fight(3);
  assert.deepEqual(party, { kingHP: 0, survivors: 3 });
});

test('the King changes targets while a party remains and recovers on returning to his throne', async (t) => {
  const { game, visitor, enter, step } = await fixture([kingSpawn]);
  t.after(() => game.close());
  const a = await visitor(4743);
  const b = await visitor(4744);
  for (const member of [a, b]) assert.equal((await enter(member)).ok, true);
  Object.assign(a.p, incubatorPoint(37, 7));
  Object.assign(b.p, incubatorPoint(38, 8));
  const king = game.shared.wilderness.actors[0];
  game.shared.wilderness.provoke(king, a.p);
  king.hp -= 500;
  Object.assign(a.p, INCUBATOR_ENTRANCE);
  step(80);
  assert.equal(king.enemy, b.p.id);
  assert.equal(king.hp, king.max - 500);

  Object.assign(b.p, INCUBATOR_ENTRANCE);
  step(200);
  assert.equal(king.enemy, null);
  assert.equal(king.hp, king.max);
});

test('the King throws a delayed 3×3 boulder and uses both attacks in melee range', async (t) => {
  const { game, visitor, enter, step, setRoll } = await fixture([kingSpawn]);
  t.after(() => game.close());
  const target = await visitor(4710);
  const inside = await visitor(4711);
  const outside = await visitor(4712);
  for (const person of [target, inside, outside]) assert.equal((await enter(person)).ok, true);
  const king = game.shared.wilderness.actors[0];
  const stats = MONSTER_STATS[GOBLIN_KING];
  assert.equal(stats.rangedAttack?.range, 15);
  assert.equal(enemyDamageRange(stats.damage).max, 65);
  assert.equal(enemyDamageRange(stats.rangedAttack!.damage).max, 45);

  Object.assign(target.p, incubatorPoint(30, 13));
  const projectile = () => target.messages.find((event) => event.type === 'goblinRock');
  for (let i = 0; i < 65 && !projectile(); i++) step();
  const shot = projectile();
  assert.ok(shot, 'the King throws rocks before the player enters sword range');
  assert.ok(Math.hypot(shot.from.x - shot.to.x, shot.from.z - shot.to.z) > stats.attackRange!);
  Object.assign(inside.p, { x: shot.to.x + 1.35, z: shot.to.z - 1.35 });
  Object.assign(outside.p, { x: shot.to.x + 1.55, z: shot.to.z + 0.3 });
  step(Math.floor(GOBLIN_ROCK.flight / 0.05) - 1);
  assert.equal(target.p.hp, target.p.max);
  setRoll(0.99);
  step(4);
  assert.equal(target.p.max - target.p.hp, 45);
  assert.equal(inside.p.max - inside.p.hp, 45);
  assert.equal(outside.p.hp, outside.p.max);
  assert.ok(inside.messages.some((event) => event.type === 'goblinRock'));

  Object.assign(target.p, { x: king.x - 1.1, z: king.z });
  for (const person of [inside, outside]) Object.assign(person.p, INCUBATOR_ENTRANCE);
  const messages = target.messages;
  messages.length = 0;
  setRoll(0.5);
  step(150);
  assert.ok(
    messages.some((event) => event.type === 'goblinRock'),
    'he still throws in melee',
  );
  assert.ok(
    messages.some(
      (event) => event.type === 'damage' && event.attacker === king.id && event.damage === 39,
    ),
    'the sword deals its own damage while the boulder is on cooldown',
  );
});

test('guards speak before the fight and react to the shared King kill, which drops collectible loot', async (t) => {
  const guards = INCUBATOR_SPAWNS.slice(-1 - INCUBATOR_DEATH_LINES.length, -1);
  const { game, visitor, enter, setRoll, step, act } = await fixture([...guards, kingSpawn]);
  t.after(() => game.close());
  const victor = await visitor(4720);
  const witness = await visitor(4721);
  await enter(victor);
  await enter(witness);
  for (const { p } of [victor, witness]) p.hp = p.max = 1000;
  Object.assign(victor.p, incubatorPoint(35, 11));
  Object.assign(witness.p, incubatorPoint(35, 10));
  step(15);
  game.broadcast();
  assert.ok(
    guards.some(({ id }) =>
      INCUBATOR_GUARD_LINES.some(
        (line) => visible(witness).wilderness?.get(id)?.speechLine === line,
      ),
    ),
    'nearby players see the guards shout',
  );
  const king = game.shared.wilderness.actors.find((actor) => actor.id === GOBLIN_KING)!;
  victor.p.hitpointsXP = SKILL_THRESHOLDS.at(-1)!;
  victor.p.hp = victor.p.max = hitpointMaximum(victor.p.hitpointsXP);
  setRoll(0.049);
  game.shared.wilderness.damage(king.id, king.hp, victor.p);
  step(5);
  game.broadcast();
  assert.deepEqual(
    new Set(guards.map(({ id }) => visible(witness).wilderness?.get(id)?.speechLine)),
    new Set(INCUBATOR_DEATH_LINES),
  );
  const drops = [...game.shared.loot.values()];
  assert.ok(drops.some((item) => item.lootKind === 'coins' && item.amount === 1600));
  assert.ok(drops.some((item) => item.lootKind === 'sandwich' && item.amount === 8));
  const charm = drops.find((item) => item.itemId === GOBLIN_CHARM);
  assert.ok(charm);
  assert.ok(
    !rollMonsterDrops(GOBLIN_KING, () => 0.05).some((item) => item.itemId === GOBLIN_CHARM),
  );
  Object.assign(victor.p, { x: charm.x, z: charm.z });
  const pickup = await act(victor, 'collect', { id: charm.id });
  assert.equal(pickup.ok, true, pickup.message);
  assert.ok(victor.p.inventory.economy.state.ownedEquipment.includes(GOBLIN_CHARM));
  assert.equal((await act(victor, 'equipAppearance', { look: { neck: GOBLIN_CHARM } })).ok, true);
  assert.equal(victor.p.appearance.neck, GOBLIN_CHARM);
});

test('the Goblin Charm adds exactly one accuracy reroll on a miss', () => {
  const weapon = 'battleaxe';
  const attack = (rolls: number[], charm = false) =>
    rollWeaponDamage(
      20,
      weapon,
      () => {
        assert.ok(rolls.length, 'unexpected extra roll');
        return rolls.shift()!;
      },
      0,
      1,
      charm,
    );
  assert.equal(attack([0.999]), 0);
  assert.ok(attack([0.999, 0, 0.5], true) > 0);
  assert.equal(attack([0.999, 0.999], true), 0);
  const rolls = [0, 0.5, 0.999];
  assert.equal(attack(rolls, true), attack([0, 0.5]));
  assert.deepEqual(rolls, [0.999]);
  assert.ok(goblinCharmEquipped({ ownedEquipment: [GOBLIN_CHARM] }, { neck: GOBLIN_CHARM }));
  assert.ok(!goblinCharmEquipped({ ownedEquipment: [] }, { neck: GOBLIN_CHARM }));
  assert.ok(!goblinCharmEquipped({ ownedEquipment: [GOBLIN_CHARM] }, {}));
});
