import { requiredFixture } from './helpers/required.mts';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpeditions, scientistDialogue, ahabDialogue } from '../src/jurassic.ts';
import { dialogueChoices } from '../src/dialogue-choices.ts';
import { createHitpoints } from '../src/combat.ts';
import { createEconomy } from '../src/economy.ts';
import { createDeli } from '../src/deli.ts';
import { EQUIPMENT_IDS, ITEM_STATS, itemLoot } from '../src/item-stats.ts';
import { MONSTER_DROPS } from '../src/config/monster-drops.ts';
import { characterEquipmentMesh } from '../src/characters.ts';
import { ENERGY_BOLT_SECONDS, MISSILE_FLIGHT_SECONDS } from '../src/config/gameplay.ts';
import { projectileEffect } from '../src/projectile-models.ts';
import { AKIMBO_SHOT_GAP, SHOT_BODY_HEIGHT } from '../src/ranged-weapon-mounts.ts';
import { JURASSIC, PEQUOD, KRAKEN_CAPE_TEXT } from '../src/jurassic-layout.ts';
import { Mesh, rayTriangleAt } from '../src/geometry.ts';
import {
  JURASSIC_SIGNS,
  drawJurassicCampus,
  drawVelociraptor,
  drawCow,
  drawCattlePen,
  drawSpectre,
  drawPequod,
  drawBeam,
  drawKrakenCape,
} from '../src/jurassic-models.ts';
import { drawGroundItem } from '../src/ground-item-models.ts';
import { drawKraken, sampleKraken } from '../src/kraken-model.ts';
import type { ExpeditionProgress } from '../src/types/content.ts';
import type { ExpeditionEvent } from '../src/types/expeditions.ts';

function setup(options: Partial<Parameters<typeof createExpeditions>[0]> = {}) {
  const health = createHitpoints(),
    economy = createEconomy(),
    events: ExpeditionEvent[] = [],
    saved: ExpeditionProgress[] = [],
    p = { x: JURASSIC.exit.x, z: JURASSIC.exit.z + 4, base: 1.4, eligible: true },
    food: number[] = [];
  const game = createExpeditions({
    health,
    economy,
    random: () => 0.5,
    player: () => ({ ...p }),
    food: (n) => food.push(n),
    routeTo: (a, b) => [{ x: b.x, z: b.z }],
    canTravel: () => true,
    onEvent: (e) => events.push(e),
    onSave: (s) => saved.push(s),
    ...options,
  });
  game.setHarbor({ x: 0, z: 110 });
  return { game, health, economy, p, events, saved, food };
}
const shoot = (
  g: ReturnType<typeof createExpeditions>,
  target: NonNullable<Parameters<ReturnType<typeof createExpeditions>['shoot']>[0]>,
) => {
  g.state.cooldown = 0;
  return g.shoot(target, { x: target.x + 4, z: target.z, base: 0 }, 'railgun');
};

test('monster drops and equipment render distinct ground models from their item IDs', () => {
  const items = new Set([
    ...EQUIPMENT_IDS,
    ...Object.values(MONSTER_DROPS).flatMap((rules) =>
      rules.flatMap((rule) => rule.choose ?? (rule.item ? [rule.item] : [])),
    ),
    'iphone',
    'light-crystal',
  ]);
  const hashes = new Map<string, string>();
  for (const id of items) {
    const mesh = new Mesh();
    drawGroundItem(mesh, { ...itemLoot(id), x: 3, z: 7 }, 2, 0);
    assert.ok(mesh.data.length && mesh.data.every(Number.isFinite), id);
    const hash = createHash('sha256').update(JSON.stringify(mesh.data)).digest('hex');
    assert.ok(!hashes.has(hash), id + ' uses the same model as ' + hashes.get(hash));
    hashes.set(hash, id);
  }
});

test('the dropped iron cuirass uses the worn chestplate, shoulders and metal palette', () => {
  const mesh = new Mesh();
  const worn = characterEquipmentMesh('top', { torso: 'iron-armor' });
  drawGroundItem(mesh, { ...itemLoot('iron-armor'), x: 4, z: 9 }, 3, 0);
  assert.equal(mesh.data.length, worn.length);
  for (let i = 0; i < worn.length; i += 11) {
    assert.ok(mesh.data[i + 1] > 3, 'the armor should sit on the ground surface');
    assert.deepEqual(mesh.data.slice(i + 6, i + 11), worn.slice(i + 6, i + 11));
    const [x, y, z] = worn.slice(i, i + 3);
    const [u, v, w] = worn.slice(0, 3);
    const sourceDistance = Math.hypot(x - u, y - v, z - w);
    const groundDistance = Math.hypot(
      mesh.data[i] - mesh.data[0],
      mesh.data[i + 1] - mesh.data[1],
      mesh.data[i + 2] - mesh.data[2],
    );
    assert.ok(Math.abs(sourceDistance - groundDistance) < 1e-9);
  }
});

test('kraken spoils remain within reach on open deck and can be picked past the ship’s mast', () => {
  const { game } = setup({ saved: { raptor: 'completed', railgun: true, krakenDefeated: true } });
  game.board();
  game.update(6.1);
  const loot = game.state.loot.find((l) => l.lootKind === 'kraken');
  assert.ok(loot);
  assert.ok(Math.hypot(loot.x - game.ship.x, loot.z - game.ship.z) < 2);
  const ship = new Mesh(),
    coins = new Mesh(),
    signs = new Map(
      JURASSIC_SIGNS.map((s) => [
        s,
        [
          [0, 0] satisfies [number, number],
          [1, 0] satisfies [number, number],
          [1, 1] satisfies [number, number],
          [0, 1] satisfies [number, number],
        ],
      ]),
    );
  drawPequod(ship, game.ship, 0, signs);
  drawGroundItem(coins, loot, PEQUOD.deck, 0);
  assert.ok(coins.data.every(Number.isFinite));
  const origin = [game.ship.x + 18.64, 20.23, game.ship.z + 2.54] satisfies [
      number,
      number,
      number,
    ],
    target = [loot.x, PEQUOD.deck + 0.17, loot.z],
    delta = target.map((v, i) => v - origin[i]),
    length = Math.hypot(...delta),
    ray = { origin, dir: delta.map((v) => v / length) };
  const hit = (mesh: Mesh) => {
    let nearest = Infinity;
    for (let i = 0; i < mesh.data.length; i += 33) {
      const d = rayTriangleAt(ray, mesh.data, i);
      if (d !== null) nearest = Math.min(nearest, d);
    }
    return nearest;
  };
  assert.ok(Number.isFinite(hit(coins)));
  assert.ok(hit(coins) < hit(ship), 'Take must select the reward rather than Examine The Pequod');
});

test('the scientist grants a railgun, visibly releases the raptor, and accepts its remains exactly once', async () => {
  const { game: g, saved } = setup();
  assert.equal(g.state.railgun, false);
  assert.equal(g.board().ok, false);
  const d = scientistDialogue({ name: 'Scientist' }, g);
  assert.equal(g.raptor.phase, 'caged');
  const briefing = requiredFixture(dialogueChoices(d)[0].next);
  const accept = requiredFixture(dialogueChoices(briefing)[0].accept);
  assert.equal(requiredFixture(await accept()).ok, true);
  assert.equal(g.raptor.phase, 'releasing');
  assert.equal(g.startQuest().ok, false);
  g.update(1);
  assert.equal(g.raptor.phase, 'loose');
  assert.match(shoot(g, g.cows[0]).message || '', /on loan/);
  assert.equal(g.raptor.max, 72);
  for (let i = 0; i < 7; i++) assert.equal(shoot(g, g.raptor).damage, 10);
  assert.equal(g.state.raptorDefeated, false);
  assert.equal(shoot(g, g.raptor).damage, 2);
  assert.equal(g.state.raptorDefeated, true);
  assert.equal(shoot(g, g.cows[0]).ok, true);
  assert.equal(g.raptor.phase, 'dead');
  const body = g.state.loot.find((l) => l.lootKind === 'raptor');
  assert.ok(body);
  assert.equal(g.collect(body).ok, true);
  assert.equal(g.collect(body).ok, false);
  const response = requiredFixture(scientistDialogue({ name: 'Scientist' }, g).accept)();
  assert.match(
    requiredFixture(requiredFixture(await response).message),
    /good test of the raptor escape and emergency recovery protocol/,
  );
  assert.equal(g.state.raptor, 'completed');
  assert.equal(g.finishQuest().ok, false);
  assert.equal(g.state.railgun, true);
  assert.equal(createExpeditions({ saved: saved.at(-1) }).state.raptor, 'completed');
});
test('expired expedition loot is uncollectable and the raptor hunt can be retried', () => {
  let time = 1000;
  const { game } = setup({ now: () => time });
  assert.equal(game.startQuest().ok, true);
  game.update(1);
  for (let i = 0; i < 8; i++) assert.equal(shoot(game, game.raptor).ok, true);
  const remains = requiredFixture(game.state.loot.find((l) => l.lootKind === 'raptor'));
  time += 59_999;
  assert.equal(game.startQuest().ok, false);
  time++;
  assert.equal(game.collect(remains).ok, false);
  game.update(0.05);
  assert.ok(!game.state.loot.includes(remains));
  assert.equal(game.startQuest().ok, true);
  assert.equal(game.raptor.phase, 'releasing');
  assert.equal(game.raptor.hp, game.raptor.max);
  assert.equal(game.state.raptorDefeated, true);
});

test('railgun range, cooldown, collision and immunity cannot be bypassed; shooting a civilian raises the alarm', () => {
  const { game: g, events } = setup({ saved: { raptor: 'completed', railgun: true } });
  g.update(1);
  const cow = g.cows[0];
  const range = ITEM_STATS.railgun.range;
  assert.equal(g.shoot(cow, { x: cow.x + range + 0.01, z: cow.z }).ok, false);
  assert.equal(g.shoot(cow, { x: cow.x + range, z: cow.z }).damage, 10);
  assert.equal(g.shoot(cow, { x: cow.x + range, z: cow.z }).cooldown, true);
  g.state.cooldown = 0;
  const ghost = { id: 'alien', label: 'Alien', combatKind: 'spectre', x: 0, z: 0, hp: 36 };
  assert.equal(g.shoot(ghost, { x: 0, z: 4 }).damage, 0);
  assert.equal(ghost.hp, 36);
  assert.ok(g.state.beams.length);
  g.state.cooldown = 0;
  const citizen = { id: 'test-man', label: 'Man', x: 0, z: 0 };
  assert.equal(g.shoot(citizen, { x: 0, z: 4 }).ok, true);
  assert.equal(events.filter((e) => e.type === 'illegal').length, 1);
  const blocked = setup({
    lineClear: () => false,
    saved: { raptor: 'completed', railgun: true },
  }).game;
  assert.equal(shoot(blocked, blocked.cows[0]).ok, false);
  assert.equal(blocked.cows[0].hp, 20);
});
test('the raptor flees, kills a pedestrian, and leaves coins before the pedestrian respawns', () => {
  const npc: import('../src/types/world.ts').Actor = {
    id: 'civilian',
    label: 'Woman',
    x: JURASSIC.runout.x,
    z: JURASSIC.runout.z,
  };
  const { game: g, p, economy } = setup({ pedestrians: () => [npc], random: () => 0.9 });
  p.eligible = false;
  g.startQuest();
  g.update(2);
  assert.ok(g.raptor.z > JURASSIC.exit.z);
  g.update(2);
  assert.equal(npc.expeditionDead, true);
  assert.equal(g.raptor.phase, 'loose');
  const coins = requiredFixture(g.state.loot.find((l) => l.lootKind === 'coins'));
  const before = economy.state.coins;
  assert.equal(g.collect(coins).ok, true);
  assert.equal(economy.state.coins, before + 7);
  g.update(35);
  assert.equal(npc.expeditionDead, false);
});
test('raptors damage nearby players and never travel through blocked terrain', () => {
  const { game: g, p, health } = setup();
  p.x = JURASSIC.runout.x;
  p.z = JURASSIC.runout.z;
  g.startQuest();
  g.update(6);
  assert.ok(health.state.hp < 30);
  const b = setup({ canTravel: () => false });
  b.game.startQuest();
  b.game.update(1);
  const before = { x: b.game.raptor.x, z: b.game.raptor.z };
  b.game.update(2);
  assert.deepEqual({ x: b.game.raptor.x, z: b.game.raptor.z }, before);
});
test('cows drop stored food and respawn after ten simulation seconds', () => {
  const { game: g, p, food } = setup({ saved: { raptor: 'completed', railgun: true } });
  p.eligible = false;
  const c = g.cows[0];
  shoot(g, c);
  shoot(g, c);
  assert.equal(c.hp, 0);
  assert.equal(c.respawn, 10);
  const item = g.state.loot.find((l) => l.lootKind === 'sandwich');
  assert.equal(g.collect(requiredFixture(item)).ok, true);
  assert.deepEqual(food, [1]);
  assert.equal(g.collect(requiredFixture(item)).ok, false);
  g.update(9.9);
  assert.equal(c.hp, 0);
  g.update(0.1);
  assert.equal(c.hp, 20);
  const economy = createEconomy(),
    health = createHitpoints(),
    deli = createDeli({
      economy,
      health,
      origin: { x: 0, y: 0 },
      routeTo: (target) => [target],
      canTravel: () => true,
    });
  assert.equal(deli.storeSandwich(3), true);
  health.damage(22);
  assert.equal(deli.eat().ok, true);
  assert.equal(deli.state.sandwiches, 2);
  assert.equal(health.state.hp, 23);
});
test('Ahab requires an unlocked railgun; 140 boss hits deplete 1,400 HP and yield one 250-coin reward and a persistent cape', () => {
  assert.equal(setup().game.board().ok, false);
  const {
    game: g,
    p,
    health,
    economy,
    saved,
  } = setup({ saved: { raptor: 'completed', railgun: true } });
  assert.equal(g.board().ok, true);
  p.eligible = false;
  g.update(6);
  p.x = g.ship.x;
  p.z = g.ship.z;
  p.base = 0.86;
  p.eligible = true;
  assert.equal(g.ship.phase, 'fighting');
  assert.equal(g.kraken.visible, true);
  g.update(3.5);
  assert.equal(health.state.hp, 0);
  g.state.target = null;
  assert.equal(g.kraken.max, 1400);
  for (let i = 0; i < 139; i++) {
    g.state.cooldown = 0;
    assert.equal(g.shoot(g.kraken, p).damage, 10);
    assert.equal(g.ship.phase, 'fighting');
  }
  g.state.cooldown = 0;
  g.shoot(g.kraken, p);
  assert.equal(g.ship.phase, 'victory');
  assert.equal(g.kraken.hp, 0);
  assert.equal(g.state.krakenReward, false);
  const spoils = g.state.loot.find((l) => l.lootKind === 'kraken'),
    before = economy.state.coins;
  g.collect(requiredFixture(spoils));
  assert.equal(economy.state.coins, before + 250);
  assert.equal(g.state.cape, true);
  assert.equal(g.collect(requiredFixture(spoils)).ok, false);
  assert.equal(requiredFixture(g.entries().at(-1)).description, KRAKEN_CAPE_TEXT);
  const restored = createExpeditions({ saved: saved.at(-1) });
  assert.equal(restored.state.cape, true);
  assert.equal(restored.state.krakenReward, true);
  assert.equal(restored.board().ok, false);
  assert.equal(g.returnShip(), true);
  g.update(5);
  assert.equal(g.ship.aboard, false);
  assert.equal(g.ship.x, 0);
  assert.match(ahabDialogue({ name: 'Ahab' }, setup().game, false).intro, /railgun/);
  assert.equal(KRAKEN_CAPE_TEXT, 'I Killed the Kraken and All I Got Was This Lousy Cape');
});
test('returning to a defeated Kraken restores a pending crystal without rerolling', () => {
  let received = 0;
  for (const pending of [true, false]) {
    const { game, saved } = setup({
      saved: {
        raptor: 'completed',
        railgun: true,
        krakenDefeated: true,
        krakenCrystalPending: pending,
      },
      random: () => assert.fail('Approaching a defeated Kraken must not reroll loot'),
      receiveCrystal: () => {
        received++;
        return { ok: true };
      },
    });
    assert.ok(game.board().ok);
    game.update(6);
    assert.equal(game.state.loot.some((item) => item.lootKind === 'light-crystal'), pending);
    const spoils = requiredFixture(game.state.loot.find((item) => item.lootKind === 'kraken'));
    assert.ok(game.collect(spoils).ok);
    assert.equal(game.state.loot.length, 0);
    assert.equal(saved.at(-1)?.krakenCrystalPending, false);
  }
  assert.equal(received, 1);
});

test('Kraken windups, alternating strikes, enrage, and sinking follow the combat clock', () => {
  const { game, health, events } = setup({ saved: { raptor: 'completed', railgun: true } });
  health.state.hp = health.state.max = 1000;
  assert.equal(game.board().ok, true);
  game.update(6);
  const { kraken } = game,
    animation = kraken.animation,
    first = requiredFixture(animation.strikeAt);
  assert.equal(animation.emergedAt, game.state.clock);
  assert.equal(sampleKraken(animation, game.state.clock).rise, 0);
  const windup = sampleKraken(animation, first - 0.3);
  assert.ok(windup.coil > 0.8);
  assert.equal(windup.reach, 0);
  assert.equal(windup.both, false);
  assert.equal(sampleKraken(animation, first).reach, 1);
  const raisedArms = (time: number) => {
    const mesh = new Mesh(),
      end = requiredFixture(drawKraken(mesh, kraken, time));
    assert.ok(mesh.data.every(Number.isFinite));
    const sides = new Set<number>();
    for (let i = 0; i < end; i += 11) {
      const y = mesh.data[i + 1],
        z = mesh.data[i + 2] - kraken.z;
      if (y > 2.6 && Math.abs(z) > 1.4) sides.add(Math.sign(z));
    }
    return sides.size;
  };
  assert.equal(raisedArms(first - 0.2), 1);

  game.update(first - game.state.clock);
  assert.equal(events.filter((e) => e.type === 'damage').length, 1);
  assert.deepEqual(animation.lastStrike, { at: game.state.clock, enraged: false });
  const next = requiredFixture(animation.strikeAt);
  assert.equal(sampleKraken(animation, next - 0.3).side, -windup.side);

  kraken.hp = kraken.max / 2;
  game.update(0.05);
  assert.equal(animation.enragedAt, game.state.clock);
  const enragedStrike = requiredFixture(animation.strikeAt);
  assert.ok(enragedStrike < next);
  assert.equal(sampleKraken(animation, enragedStrike - 0.3, kraken.enraged).both, true);
  assert.equal(raisedArms(enragedStrike - 0.2), 2);
  game.update(enragedStrike - game.state.clock);
  assert.equal(events.filter((e) => e.type === 'damage').length, 2);
  assert.deepEqual(animation.lastStrike, { at: game.state.clock, enraged: true });

  kraken.hp = 1;
  assert.equal(shoot(game, kraken).ok, true);
  assert.equal(kraken.hp, 0);
  assert.equal(animation.defeatedAt, game.state.clock);
  assert.equal(animation.strikeAt, undefined);
  assert.ok(drawKraken(new Mesh(), kraken, game.state.clock + 0.8));
  const afterSink = new Mesh();
  assert.equal(drawKraken(afterSink, kraken, game.state.clock + 2), null);
  assert.equal(afterSink.data.length, 0);
});

test('the Kraken waits to strike a cloaked player until they fire', () => {
  const { game, health } = setup({
    saved: { raptor: 'completed', railgun: true },
    hiddenFromMonsters: () => true,
  });
  assert.equal(game.board().ok, true);
  game.update(12);
  assert.equal(game.ship.phase, 'fighting');
  assert.equal(game.kraken.animation.strikeAt, undefined);
  assert.equal(health.state.hp, health.state.max);
  assert.equal(shoot(game, game.kraken).ok, true);
  game.update(3.6);
  assert.equal(game.kraken.animation.strikes, 1);
  assert.ok(health.state.hp < health.state.max);
});

test('automatic ranged attacks remain frame-rate independent against the level-60 kraken', () => {
  const run = (step: number) => {
    const { game: g, p, health } = setup({ saved: { raptor: 'completed', railgun: true } });
    g.board();
    p.eligible = false;
    g.update(6);
    p.x = g.ship.x;
    p.z = g.ship.z;
    p.eligible = true;
    health.state.hp = health.state.max = 250;
    g.attack(g.kraken);
    for (let t = 0; t < 8 - 1e-8; t += step) g.update(Math.min(step, 8 - t));
    return { hp: health.state.hp, boss: g.kraken.hp, phase: g.ship.phase };
  };
  const small = run(1 / 60),
    large = run(0.2);
  assert.deepEqual(small, large);
  assert.equal(small.boss, 1400 - (1 + Math.floor(8 / ITEM_STATS.railgun.interval)) * 10);
  assert.ok(small.hp > 0);
  assert.equal(small.phase, 'fighting');
});
test('all expedition models and cape inscriptions produce finite geometry within a modest triangle budget', () => {
  const signs = new Map(
      JURASSIC_SIGNS.map((s) => [
        s,
        [
          [0, 0] satisfies [number, number],
          [1, 0] satisfies [number, number],
          [1, 1] satisfies [number, number],
          [0, 1] satisfies [number, number],
        ],
      ]),
    ),
    mesh = new Mesh();
  drawJurassicCampus(mesh, signs);
  drawVelociraptor(mesh, { x: 0, z: 0, angle: 0, phase: 'loose' }, 400);
  drawCow(mesh, { x: 0, z: 0, angle: 0 }, 400);
  drawCattlePen(mesh, () => 0);
  drawSpectre(mesh, { id: 'alien', label: 'Alien', x: 0, z: 0 }, 400);
  drawPequod(mesh, { x: 0, z: 0 }, 400, signs);
  drawKraken(mesh, { x: 0, z: 0 }, 0.4);
  drawBeam(mesh, { from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 1, z: 0 }, ttl: 0.22 });
  drawKrakenCape(mesh, 0, 0, 0, 0, 400, signs);
  assert.ok(mesh.data.every(Number.isFinite));
  assert.ok(mesh.data.length / 33 < 26000, 'new models stay in the shared mesh batch');
});

test('each Akimbo bolt leaves its own muzzle on a separate firing beat', () => {
  const from = { x: 0, y: SHOT_BODY_HEIGHT, z: 0 };
  const to = { x: 4, y: 1, z: 0 };
  const shot = projectileEffect('akibo', from, to);
  const [right, left] = requiredFixture(shot.muzzles);
  assert.ok(right[2] < -0.2 && left[2] > 0.2);
  assert.ok(right[0] > 0.65 && left[0] > 0.65);
  const points = (age: number) => {
    const mesh = new Mesh();
    drawBeam(mesh, { ...shot, ttl: shot.ttl - age });
    assert.ok(mesh.data.every(Number.isFinite));
    return mesh.data.filter((_, index) => index % 11 < 3);
  };
  const first = points(0);
  const firstLateral = first.filter((_, index) => index % 3 === 2);
  assert.ok(firstLateral.length > 0 && firstLateral.every((z) => z < 0));
  const second = points(AKIMBO_SHOT_GAP + 0.006);
  for (const muzzle of [right, left]) {
    const side = second.filter((_, index) => index % 3 === 0 &&
      Math.sign(second[index + 2]) === Math.sign(muzzle[2]));
    assert.ok(side.length > 0);
    if (muzzle === right) assert.ok(Math.max(...side) > right[0] + 1);
    else assert.ok(Math.min(...side) < left[0] + 0.12);
  }
  const turned = projectileEffect('akibo', from, { x: 0, y: 1, z: 4 });
  for (const [i, muzzle] of requiredFixture(turned.muzzles).entries()) {
    const original = requiredFixture(shot.muzzles)[i];
    assert.ok(Math.abs(muzzle[0] + original[2]) < 1e-6);
    assert.ok(Math.abs(muzzle[2] - original[0]) < 1e-6);
  }
});

test('railgun traces advance from the barrel then spark at the point of impact', () => {
  const shot = projectileEffect('railgun', { x: 0, y: SHOT_BODY_HEIGHT, z: 0 }, { x: 6, y: 1, z: 0 });
  const barrel = requiredFixture(shot.muzzles)[0];
  assert.ok(barrel[0] > 0.9);
  function maxX(age: number) {
    const mesh = new Mesh();
    drawBeam(mesh, { ...shot, ttl: shot.ttl - age });
    return Math.max(...mesh.data.filter((_, i) => i % 11 === 0));
  }
  assert.ok(maxX(0.035) > barrel[0] + 1 && maxX(0.035) < 6);
  assert.ok(maxX(0.11) > 6);
});

test('EMF lightning forks before reaching its target and sparks on impact', () => {
  const shot = projectileEffect('emf-lightning', { x: 0, y: 1.2, z: 0 }, { x: 6, y: 1, z: 0 });
  const positions = (age: number) => {
    const mesh = new Mesh();
    drawBeam(mesh, { ...shot, ttl: shot.ttl - age });
    assert.ok(mesh.data.length > 0 && mesh.data.every(Number.isFinite), 'valid lightning mesh');
    return mesh.data.filter((_, index) => index % 11 < 3);
  };
  const flight = positions(ENERGY_BOLT_SECONDS * 0.6);
  assert.ok(
    Math.max(...flight.filter((_, index) => index % 3 === 0)) < shot.to.x - 1,
    'the lightning tip advances toward the target during flight',
  );
  assert.ok(
    flight.some((value, index) => index % 3 === 2 && Math.abs(value) > 0.3),
    'the lightning branches sideways',
  );
  const impact = positions(ENERGY_BOLT_SECONDS + 0.04);
  assert.ok(
    Math.max(...impact.filter((_, index) => index % 3 === 0)) > shot.to.x + 0.1,
    'impact sparks extend past the target',
  );
});

test('missiles launch from the tube with rear exhaust, a smoke trail and an impact burst', () => {
  const range = ITEM_STATS['missile-launcher'].range;
  const shot = projectileEffect(
    'missile-launcher',
    { x: 0, y: SHOT_BODY_HEIGHT, z: 0 },
    { x: range, y: 1.14, z: 0 },
  );
  assert.ok(requiredFixture(shot.exhaust)[0] < 0);
  assert.ok(requiredFixture(shot.muzzles)[0][0] > 0.5);
  function bounds(age: number) {
    const mesh = new Mesh();
    drawBeam(mesh, { ...shot, ttl: shot.ttl - age });
    assert.ok(mesh.data.every(Number.isFinite));
    const xs = mesh.data.filter((_, i) => i % 11 === 0);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }
  const launch = bounds(0.025);
  const flight = bounds(MISSILE_FLIGHT_SECONDS / 2);
  const impact = bounds(MISSILE_FLIGHT_SECONDS + 0.07);
  assert.ok(launch.min < -0.4 && launch.max > 0.7 && launch.max < 2);
  assert.ok(flight.max > range / 2 && flight.max - flight.min > 1.5);
  assert.ok(impact.min > range - 1 && impact.max > range + 0.2);
});
