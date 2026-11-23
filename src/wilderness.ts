import { CREATURE_STRIKE_MS } from './creature-attack-pose.ts';
import { WILDERNESS_FIRST_ATTACK_SECONDS } from './config/gameplay.ts';
import { legacyBugSpawns } from './legacy-software-layout.ts';
import { contentText } from './content-runtime.ts';
import { isFiniteNumber } from './types/json.ts';
import type {
  WildernessSpawn,
  WildernessPerson,
  WildernessActor,
  WildernessDrop,
  MonsterStats,
} from './types/monsters.ts';
import type { WorldPoint, Point } from './types/geometry.ts';
interface WildernessOptions<P extends WildernessPerson> {
  spawns?: readonly WildernessSpawn[];
  ground?: (x: number, z: number) => number;
  canTravel?: (from: WorldPoint, to: WorldPoint) => boolean;
  canShoot?: (from: WildernessActor, to: P) => boolean;
  route?: (from: WildernessActor, to: WorldPoint) => WorldPoint[] | null | undefined;
  random?: () => number;
  onHit?: (event: { actor: WildernessActor; attacker: WildernessPerson; damage: number }) => void;
  onDrop?: (drop: WildernessDrop, attacker: WildernessPerson) => void;
  onDamage?: (person: P, amount: number, actor: WildernessActor) => void;
  onReflect?: (attacker: WildernessPerson, amount: number, actor: WildernessActor) => void;
}
type WalkingMonster = MonsterStats & {
  speed: number;
  leash: number;
  interval: number;
  respawn: number;
};
import { FIGHTER_SPAWNS, isYardFighter, inFighterYard } from './fighter-yard-layout.ts';
import { SCAPEGOAT } from './girard-layout.ts';
import { BOLINAS_CULTIST, BOLINAS_URCHINS, EMF_DISCIPLES, EMF_WARRIOR } from './bolinas.ts';
import { GOBLIN_SPAWNS } from './goblin-town.ts';
import { FROG_SPAWNS, inFrogFarm } from './frog-farm.ts';
import { SOMA_ZOMBIE_SPAWNS } from './downtown.ts';
import { ITEM_STATS } from './item-stats.ts';
import { MONSTER_STATS, rollMonsterDrops } from './monster-drops.ts';
import { rollWeaponDamage } from './combat.ts';
import {
  OUTLAW_SITE,
  LOST_PIRATE_SITE,
  LANDSHARK_SITE,
  TERMINATOR_SITE,
  BISON_SITE,
} from './wilderness-sites.ts';

/** Pet from a neighboring tile, with enough room for both models. Coordinates
 * here are world coordinates; navigation helpers use tile coordinates. */
export function besideBear(person: WorldPoint, bear: WorldPoint) {
  const distance = Math.hypot(person.x - bear.x, person.z - bear.z),
    dx = Math.abs(Math.floor(person.x) - Math.floor(bear.x)),
    dz = Math.abs(Math.floor(person.z) - Math.floor(bear.z));
  return distance >= 1.05 && distance <= 1.9 && Math.max(dx, dz) === 1;
}
export function bearPettingApproach({
  from,
  bear,
  free,
  canTravel,
  pathTo,
}: {
  from: Point;
  bear: WorldPoint;
  free: (x: number, y: number) => boolean;
  canTravel: (ax: number, ay: number, bx: number, by: number, ignore?: boolean) => boolean;
  pathTo: (x: number, y: number, from: Point) => unknown;
}) {
  const candidates = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const p = { x: Math.floor(bear.x) + dx, y: Math.floor(bear.z) + dz };
      if (
        besideBear({ x: p.x + 0.5, z: p.y + 0.5 }, bear) &&
        free(p.x, p.y) &&
        canTravel(p.x, p.y, bear.x - 0.5, bear.z - 0.5, true)
      )
        candidates.push(p);
    }
  candidates.sort(
    (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
  );
  return candidates.find((p) => pathTo(p.x, p.y, from)) || null;
}

export function wildernessSpawns({ marin, tahoe }: { marin: Point; tahoe: WorldPoint }) {
  return [
    { id: 'marin-bear', combatKind: 'bear', x: marin.x + 0.5, z: marin.y + 0.5 },
    // Keep the giant group on the snowy walking route, about ten tiles
    // farther from the rocket landing than its previous village positions.
    ...[
      [-12, -11, 'snow-giant'] satisfies [number, number, string],
      [-14, -13, 'ice-giant'] satisfies [number, number, string],
      [-9, -14, 'snow-giant'] satisfies [number, number, string],
      [-8, -12, 'ice-giant'] satisfies [number, number, string],
    ].map(([dx, dz, combatKind], i) => ({
      id: 'tahoe-giant-' + i,
      combatKind,
      x: tahoe.x + dx,
      z: tahoe.z + dz,
    })),
    ...(
      [
        [-22, 10, 'tahoe-bear'],
        [-30, -5, 'tahoe-bear'],
        [2, 18, 'tahoe-fox'],
        [-11, 16, 'tahoe-fox'],
        [-7, -22, 'tahoe-fox'],
      ] as const
    ).map(([dx, dz, combatKind], i) => ({
      id: 'tahoe-wildlife-' + (i + 1),
      combatKind,
      x: tahoe.x + dx,
      z: tahoe.z + dz,
    })),
    { ...OUTLAW_SITE },
    { ...LOST_PIRATE_SITE },
    { ...LANDSHARK_SITE },
    { ...TERMINATOR_SITE },
    { ...BISON_SITE },
    ...GOBLIN_SPAWNS,
    ...FROG_SPAWNS,
    ...FIGHTER_SPAWNS,
    ...legacyBugSpawns(),
    SCAPEGOAT,
    ...BOLINAS_URCHINS,
    ...SOMA_ZOMBIE_SPAWNS.map((spawn) => ({ ...spawn })),
    { id: 'presidio-coyote', combatKind: 'coyote', x: 27.5, z: 23.5 },
    { id: 'neighborhood-raccoon', combatKind: 'raccoon', x: 24, z: 97 },
    { ...EMF_WARRIOR },
    ...EMF_DISCIPLES,
    BOLINAS_CULTIST,
    { id: 'marin-ridge-fox-1', combatKind: 'tahoe-fox', x: 4, z: -34 },
    { id: 'marin-ridge-fox-2', combatKind: 'tahoe-fox', x: 14, z: -28 },
    { id: 'marin-ridge-bear-1', combatKind: 'tahoe-bear', x: 8, z: -27 },
    { id: 'marin-ridge-bear-2', combatKind: 'tahoe-bear', x: 19, z: -24 },
    ...[[22, 18.5] as const, [20.5, 21.5] as const, [20.5, 25.5] as const].map(([x, z], i) => ({
      id: 'presidio-seagull-' + i,
      combatKind: 'seagull',
      x,
      z,
    })),
    ...[
      [43.5, 17.25] satisfies [number, number],
      [40.5, 18.5] satisfies [number, number],
      [49.5, 19.5] satisfies [number, number],
      [46, 21] satisfies [number, number],
    ].map(([x, z], i) => ({ id: 'waterfront-seagull-' + i, combatKind: 'seagull', x, z })),
  ];
}
/** Shared simulation, also used unchanged in single player. No DOM, meshes,
 * sockets or inventory ownership live in this controller. */
export function createWilderness<P extends WildernessPerson = WildernessPerson>({
  spawns = [],
  ground = () => 0,
  canTravel = () => true,
  canShoot = canTravel,
  route = (a, b) => (canTravel(a, b) ? [b] : null),
  random = Math.random,
  onHit = () => {},
  onDrop = () => {},
  onDamage = () => {},
  onReflect = () => {},
}: WildernessOptions<P> = {}) {
  let clock = 0;
  const statsByKind = new Map<string, WalkingMonster>();
  function walkingStats(kind: string): WalkingMonster {
    const cached = statsByKind.get(kind);
    if (cached) return cached;
    const stats = MONSTER_STATS[kind];
    if (
      !stats ||
      !isFiniteNumber(stats.speed) ||
      !isFiniteNumber(stats.leash) ||
      !isFiniteNumber(stats.interval) ||
      !isFiniteNumber(stats.respawn)
    )
      throw new Error('Invalid wilderness monster: ' + kind);
    const walking = stats as WalkingMonster;
    statsByKind.set(kind, walking);
    return walking;
  }
  function makeActor(p: WildernessSpawn, i: number): WildernessActor {
    const s = walkingStats(p.combatKind);
    return {
      ...p,
      wilderness: true,
      label: s.name,
      level: s.level,
      height: s.height || (s.friendly ? 1.6 : 3.5),
      hp: s.hp,
      max: s.hp,
      base: ground(p.x, p.z),
      home: { x: p.x, z: p.z },
      angle: i,
      phase: 0,
      motion: 0,
      respawn: 0,
      enemy: null,
      path: [],
      repath: 0,
      attackAt: 0,
      affection: 0,
      chaseUntil: 0,
      returning: false,
      description:
        s.description ||
        (p.combatKind === 'bear'
          ? 'A big bear with small ambitions: sunshine, a nap, and perhaps your sandwich.'
          : p.combatKind === 'snow-giant'
            ? 'An ancient snowdrift with fists. Its scarf is a small avalanche.'
            : 'A glacier has stood up, and it is not pleased about your carbon footprint.'),
    };
  }
  const actors = spawns.map(makeActor);
  function dispatch(spawn: WildernessSpawn, person: P) {
    const actor = makeActor(spawn, actors.length);
    actor.enemy = actor.dispatchedFor = person.id;
    actor.enemyPosition = { x: person.x, z: person.z };
    actor.lastCombatAt = clock;
    actors.push(actor);
    return actor;
  }

  function strike(id: string, attacker: WildernessPerson) {
    const actor = actors.find((n) => n.id === id),
      weapon = ITEM_STATS[attacker.weapon || 'unarmed'] || ITEM_STATS.unarmed;
    if (!actor?.hp)
      return {
        ok: false,
        message: contentText(
          'world-message.src.wilderness.that-creature-is-resting-come-back-after-it-respawns',
        ),
      };
    if (
      Math.hypot(actor.x - attacker.x, actor.z - attacker.z) >
      (weapon.range ?? ITEM_STATS.unarmed.range) + 0.01
    )
      return {
        ok: false,
        message: contentText('world-message.src.wilderness.move-closer-to-the', {
          value1: String(actor.label.toLowerCase()),
        }),
      };
    return damage(
      id,
      rollWeaponDamage(attacker.level, attacker.weapon, random, attacker.inebriation),
      attacker,
      true,
    );
  }
  function provoke(actor: WildernessActor, person: WildernessPerson) {
    if (actor.enemy !== person.id) {
      actor.chaseUntil = 0;
      actor.enemyPosition = { x: person.x, z: person.z };
      actor.repath = 0;
    }
    if (actor.enemy === null)
      actor.attackAt = Math.max(actor.attackAt, clock + WILDERNESS_FIRST_ATTACK_SECONDS);
    actor.enemy = person.id;
    actor.returning = false;
    actor.affection = 0;
  }
  function damage(id: string, amount: unknown, attacker: WildernessPerson, retaliate = false) {
    const actor = actors.find((n) => n.id === id);
    if (!actor?.hp || !isFiniteNumber(amount) || amount < 0) return { ok: false };
    if (actor.combatKind === 'emf-warrior' && attacker?.tinfoil !== true)
      return {
        ok: false,
        message: contentText('world-message.src.wilderness.a-wall-of-static-forces-you-back'),
      };
    const hit = Math.min(actor.hp, Math.floor(amount));
    actor.hp -= hit;
    const stats = walkingStats(actor.combatKind);
    const reflected = stats.reflectDamage ? Math.ceil(hit * stats.reflectDamage) : 0;
    if (retaliate && !stats.reflectDamage) provoke(actor, attacker);
    if (actor.dispatchedFor !== undefined) actor.lastCombatAt = clock;
    actor.affection = 0;
    onHit({ actor, attacker, damage: hit });
    if (reflected) {
      actor.angle = Math.atan2(attacker.z - actor.z, attacker.x - actor.x);
      actor.attackAnimation = 1;
      onReflect(attacker, reflected, actor);
    }
    if (!actor.hp) {
      actor.enemy = null;
      actor.path = [];
      actor.motion = 0;
      actor.respawn = stats.respawn;
      for (const drop of rollMonsterDrops(actor.combatKind, random))
        onDrop({ ...drop, x: actor.x, z: actor.z, base: actor.base + 0.025 }, attacker);
    }
    return { ok: true, damage: hit, hp: actor.hp, max: actor.max };
  }
  function pet(id: string, person: { z: number; x: number }) {
    const actor = actors.find((n) => n.id === id);
    const available = actor?.combatKind === 'bear' && actor.hp > 0;
    if (!available || !besideBear(person, actor) || !canTravel(person, actor))
      return {
        ok: false,
        retryApproach: available,
        message: contentText(
          'world-message.src.wilderness.stand-beside-the-friendly-bear-to-pet-it',
        ),
      };
    actor.enemy = null;
    actor.path = [];
    actor.motion = 0;
    actor.affection = 3;
    actor.angle = Math.atan2(person.z - actor.z, person.x - actor.x);
    return {
      ok: true,
      message: contentText(
        'world-message.src.wilderness.you-pet-the-bear-it-leans-into-your-hand-and-makes-a-very-cont',
      ),
    };
  }
  function update(dt: unknown, people: readonly P[] = []) {
    if (!isFiniteNumber(dt) || dt <= 0) return;
    clock += dt;
    const byId = new Map(people.map((p) => [p.id, p]));
    // Remove expired responses before iterating the active roster.
    for (let i = actors.length - 1; i >= 0; i--) {
      const actor = actors[i];
      if (actor.lastCombatAt !== undefined && (!actor.hp || clock - actor.lastCombatAt >= 60))
        actors.splice(i, 1);
    }
    for (const [i, actor] of actors.entries()) {
      const stats = walkingStats(actor.combatKind),
        yardFighter = isYardFighter(actor.combatKind),
        attackRange = stats.attackRange ?? 1.6,
        inFiringRange = (person: P) =>
          Math.hypot(person.x - actor.x, person.z - actor.z) <= attackRange &&
          canShoot(actor, person),
        inTerritory = (p: WorldPoint) => {
          if (yardFighter) return inFighterYard(p.x, p.z);
          if (actor.combatKind === 'frog') return inFrogFarm(p.x, p.z, -0.18);
          return (
            !stats.territoryHalfWidth ||
            Math.max(Math.abs(p.x - actor.home.x), Math.abs(p.z - actor.home.z)) <=
              stats.territoryHalfWidth
          );
        };
      actor.affection = Math.max(0, actor.affection - dt);
      if (actor.attackAnimation)
        actor.attackAnimation = Math.max(
          0,
          actor.attackAnimation - (dt * 1000) / CREATURE_STRIKE_MS,
        );
      if (!actor.hp) {
        actor.respawn = Math.max(0, actor.respawn - dt);
        if (!actor.respawn)
          Object.assign(actor, {
            hp: actor.max,
            x: actor.home.x,
            z: actor.home.z,
            base: ground(actor.home.x, actor.home.z),
            enemy: null,
            chaseUntil: 0,
            returning: false,
            enemyPosition: undefined,
            path: [],
          });
        continue;
      }
      let enemy: P | null = (actor.enemy === null ? undefined : byId.get(actor.enemy)) || null;
      const canPursue = (person: P) =>
        inTerritory(person) &&
        (person.attack === actor.id ||
          Math.hypot(person.x - actor.home.x, person.z - actor.home.z) <= stats.leash);
      if (enemy) {
        const distance = Math.hypot(enemy.x - actor.x, enemy.z - actor.z),
          previous = actor.enemyPosition,
          movingAway =
            previous && distance > Math.hypot(previous.x - actor.x, previous.z - actor.z) + 0.00001,
          canReach = canPursue(enemy);
        actor.enemyPosition = { x: enemy.x, z: enemy.z };
        if (
          canReach &&
          (enemy.attack === actor.id ||
            (stats.attackRange ? inFiringRange(enemy) : distance < attackRange))
        )
          actor.chaseUntil = 0;
        else if (!actor.chaseUntil && (movingAway || !canReach)) actor.chaseUntil = clock - dt + 3;
        if (actor.chaseUntil && clock + 1e-8 >= actor.chaseUntil) enemy = null;
      }
      if (!enemy && actor.enemy !== null) {
        actor.enemy = null;
        actor.chaseUntil = 0;
        actor.enemyPosition = undefined;
        actor.returning = true;
        actor.repath = 0;
      }
      if (!enemy && !actor.returning && stats.aggression) {
        let closest = stats.aggression + 0.000001;
        for (const person of people) {
          const distance = stats.territoryHalfWidth
            ? Math.max(Math.abs(person.x - actor.home.x), Math.abs(person.z - actor.home.z))
            : Math.hypot(person.x - actor.x, person.z - actor.z);
          if (
            inTerritory(person) &&
            distance < closest &&
            Math.hypot(person.x - actor.home.x, person.z - actor.home.z) <= stats.leash
          ) {
            enemy = person;
            closest = distance;
          }
        }
        if (enemy) {
          actor.enemy = enemy.id;
          actor.enemyPosition = { x: enemy.x, z: enemy.z };
          actor.repath = 0;
          actor.attackAt = Math.max(actor.attackAt, clock + WILDERNESS_FIRST_ATTACK_SECONDS);
        }
      }
      if (actor.returning && Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) < 0.05) {
        actor.returning = false;
        actor.repath = 0;
      }
      if (actor.affection && !enemy) {
        actor.path = [];
        actor.motion = 0;
        continue;
      }
      actor.repath -= dt;
      const direct = enemy && stats.pursuit === 'direct';
      const clear = (a: WorldPoint, b: WorldPoint) => {
        if (!inTerritory(b) || !canTravel(a, b)) return false;
        if (!stats.radius) return true;
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4,
            dx = Math.cos(angle) * stats.radius,
            dz = Math.sin(angle) * stats.radius;
          if (!canTravel({ x: a.x + dx, z: a.z + dz }, { x: b.x + dx, z: b.z + dz })) return false;
        }
        return true;
      };
      if (actor.repath <= 0) {
        actor.repath = enemy ? 0.6 : 1.5;
        const goal = enemy
          ? { x: enemy.x, z: enemy.z }
          : actor.returning ||
              Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) >
                (stats.roamRadius || 1) + 0.25
            ? actor.home
            : {
                x: actor.home.x + Math.sin(clock * 0.17 + i) * (stats.roamRadius || 0.24),
                z:
                  actor.home.z +
                  Math.cos(clock * 0.2 + i) * (stats.roamRadius ? stats.roamRadius * 0.7 : 0.65),
              };
        // Territory-bound creatures can follow to the boundary while their timer runs.
        actor.path = direct ? [] : route(actor, goal) || [];
      }
      const distance = enemy ? Math.hypot(enemy.x - actor.x, enemy.z - actor.z) : Infinity;
      let budget =
        enemy &&
        (stats.attackRange
          ? inFiringRange(enemy)
          : distance < 1.35 && (direct || clear(actor, enemy)))
          ? 0
          : dt * (enemy || actor.returning ? stats.speed : stats.roamSpeed || 0.45);
      actor.motion = 0;
      // Giants pursue in short direct steps rather than finding a route
      // around every obstacle. Their broader bodies stop beside trunks;
      // players can reposition around a tree to establish a safe shot.
      while (budget > 1e-8 && (direct || actor.path.length)) {
        const next = direct ? enemy! : actor.path[0],
          dx = next.x - actor.x,
          dz = next.z - actor.z,
          d = Math.hypot(dx, dz),
          step = Math.min(budget, d, direct ? Math.min(0.2, Math.max(0, d - 1.35)) : Infinity);
        if (step <= 1e-8) break;
        const end = { x: actor.x + (dx / d) * step, z: actor.z + (dz / d) * step };
        if (!clear(actor, end)) {
          actor.path = [];
          break;
        }
        actor.x = end.x;
        actor.z = end.z;
        actor.angle = Math.atan2(dz, dx);
        actor.motion = 1;
        actor.phase += step * (stats.walkStride ? (Math.PI * 2) / stats.walkStride : 4);
        budget -= step;
        if (!direct && d <= step + 1e-8) actor.path.shift();
      }
      actor.base = ground(actor.x, actor.z);
      if (
        enemy &&
        clock >= actor.attackAt &&
        canPursue(enemy) &&
        (stats.attackRange
          ? inFiringRange(enemy)
          : (stats.territoryHalfWidth ||
              Math.hypot(enemy.x - actor.x, enemy.z - actor.z) < attackRange) &&
            clear(actor, enemy))
      ) {
        actor.attackAt = clock + stats.interval;
        actor.angle = Math.atan2(enemy.z - actor.z, enemy.x - actor.x);
        actor.attackAnimation = 1;
        if (actor.dispatchedFor !== undefined) actor.lastCombatAt = clock;
        onDamage(enemy, stats.damage, actor);
      }
    }
  }
  function sync(records: readonly (Pick<WildernessActor, 'id'> & Partial<WildernessActor>)[] = []) {
    for (const p of records) {
      const actor = actors.find((n) => n.id === p.id);
      if (actor) Object.assign(actor, p, { path: [] });
    }
  }
  return {
    actors,
    dispatch,
    strike,
    provoke,
    damage,
    pet,
    update,
    sync,
    snapshot: () => actors.map(({ path, home, ...actor }) => ({ ...actor, home: { ...home } })),
  };
}
