import {
  inBerkeleyLab,
  labSegment,
  LAB_FLOOR,
  LAB_INSTANCE,
  LAB_NAV,
} from '../src/berkeley-lab.ts';
import { isYardFighter } from '../src/fighter-yard-layout.ts';
import { hasFighterYardPass } from './fighter-yard.mts';
import { contentText } from '../src/content-runtime.ts';
import { GAMEPLAY, ENERGY_BOLT_SECONDS, SCIENTIST_EXPLOSIVE } from '../src/config/gameplay.ts';
import { isFiniteNumber } from '../src/types/json.ts';
import type { WildernessPerson, WildernessActor } from '../src/types/monsters.ts';
import type { CommandResult, AirshipSnapshot } from '../src/types/network.ts';
import type { Point, WorldPoint } from '../src/types/geometry.ts';
import type {
  SharedWorldOptions,
  SharedRaptor,
  SharedCow,
  SharedLoot,
} from '../src/types/shared-world.ts';

import type { Actor } from '../src/types/world.ts';
import type { ServerPlayer } from '../src/types/server.ts';
import {
  consumeWeaponShot,
  advanceAttackDeadline,
  railgunRestriction,
} from './combat-supplies.mts';
import { updateGrazingCow } from '../src/cow-roaming.ts';
import { createAirship } from '../src/airship.ts';
import { validNPCRoamingState } from '../src/npc-roaming.ts';
import { NAVIGATION_DIRECTIONS } from '../src/navigation.ts';
import { createAirshipRental } from './airship-rental.mts';

import { AIRSHIP_BASKET } from '../src/airship-basket.ts';
import { JURASSIC, cowSpawns } from '../src/jurassic-layout.ts';
import { raptorCivilian } from '../src/jurassic.ts';
import { SF_ZOO } from '../src/zoo.ts';
import { createTigerEncounter, TIGER_CATCH_GRACE, ZOO_VIEW_RADIUS } from '../src/zoo-encounter.ts';
import type { TigerState } from '../src/types/zoo.ts';
import { rollWeaponDamage, rollEnemyDamage } from '../src/combat.ts';
import { strengthStatus } from '../src/strength.ts';
import { SpatialIndex } from './spatial-index.mts';
import { moveResearcherNPCs } from '../src/research-campuses.ts';
import { actorLevel } from '../src/levels.ts';
import { PEPTIDE_SPAWN_MS } from '../src/guild.ts';
import { BOMB_DAMAGE, monsterInBombArea } from '../src/stealth-bomber.ts';
import { createWilderness } from '../src/wilderness.ts';
import { combatInRange } from '../src/combat-navigation.ts';
import {
  ITEM_STATS,
  weaponAttackInterval,
  itemLoot,
  equipmentOwned,
  ownedEquipmentDefense,
  recoilDamage,
  weaponOwned,
} from '../src/item-stats.ts';
import { MONSTER_STATS, rollMonsterDrops } from '../src/monster-drops.ts';
import {
  groundItemDeadline,
  groundItemExpired,
  GROUND_ITEM_LIFETIME_SECONDS,
} from '../src/ground-items.ts';

const LOOT_OWNER_CLAIM_SECONDS = 15;
const near = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const LEGACY_RAPTOR_MAX_HP = 40;
function restoredMonsterHealth(hp: number, savedMax: number | undefined, currentMax: number) {
  if (isFiniteNumber(savedMax) && savedMax > 0 && hp >= savedMax) return currentMax;
  return Math.max(0, Math.min(currentMax, hp));
}
export function canSeeZooPursuit(
  observer: WorldPoint,
  encounter: Pick<TigerState, 'tiger' | 'wardens'>,
) {
  const inRange = (x: number, z: number) =>
    Math.hypot(x - observer.x, z - observer.z) < ZOO_VIEW_RADIUS;
  return (
    inRange(SF_ZOO.x, SF_ZOO.z) ||
    inRange(encounter.tiger.x + 0.5, encounter.tiger.y + 0.5) ||
    encounter.wardens.some((warden) => inRange(warden.x + 0.5, warden.y + 0.5))
  );
}
export function createSharedWorld({
  geometry,
  routes,
  players,
  send,
  dirty,
  random = Math.random,
  now = Date.now,
  saved = {},
  movement,
  onAirshipReset = () => {},
  onCombatDamage = () => {},
  onRaptorDefeated = () => {},
  onBind = () => {},
}: SharedWorldOptions) {
  const routeTo = (...args: Parameters<NonNullable<typeof routes>['pathTo']>) =>
    routes ? routes.pathTo(...args) : geometry.pathTo(...args);
  const airship =
      geometry.airship ||
      createAirship({ groundHeight: (x: number, z: number) => geometry.characterGround(x, z) }),
    passengers = new Set<number>();
  let robocopSerial = 0;
  let investigatorSerial = 0;
  const projectileImpacts: {
    at: number;
    target: ServerPlayer;
    instanceId: string;
    actor: WildernessActor;
    amount: number;
  }[] = [];
  const approachAt = new WeakMap<ServerPlayer, number>();
  let captain: number | null = null,
    clock = Number(saved.clock) || 0,
    lootSerial = Number(saved.lootSerial) || 0,
    focus: ServerPlayer | null = null;
  const shipHome = { ...airship.home },
    shipRope: AirshipSnapshot['rope'] & { fareOwner?: number | null } = {
      deployed: false,
      top: null,
      bottom: null,
    },
    cows: SharedCow[] = cowSpawns().map((c) => ({
      ...c,
      home: { x: c.x, z: c.z },
      phase: 0,
      motion: 0,
      hp: MONSTER_STATS.cow.hp,
      max: MONSTER_STATS.cow.hp,
      respawn: 0,
    }));
  const nextPeptideDeadline = now() + PEPTIDE_SPAWN_MS;
  let nextPeptideAt = isFiniteNumber(saved.nextPeptideAt)
    ? Math.min(saved.nextPeptideAt, nextPeptideDeadline)
    : nextPeptideDeadline;
  const raptor: SharedRaptor = {
    id: 'jurassic-raptor',
    combatKind: 'raptor',
    label: 'Velociraptor',
    x: JURASSIC.cage.x,
    z: JURASSIC.cage.z,
    hp: MONSTER_STATS.raptor.hp,
    max: MONSTER_STATS.raptor.hp,
    phase: 'caged',
    angle: Math.PI / 2,
    path: [],
    repath: 0,
    attackIn: 1,
    prey: null,
    resetAt: 0,
    release: 0,
  };
  const lives = geometry.lives || [],
    loot = new Map<string, SharedLoot>(),
    npcIndex = new SpatialIndex<Actor>(),
    npcList: Actor[] = [...(geometry.merchants || []), ...lives.flatMap((l) => l?.people || [])],
    npcById = new Map(npcList.map((n) => [n.id, n])),
    pathTo = (a: WorldPoint, b: { x: number; z: number }) =>
      routeTo(b.x - 0.5, b.z - 0.5, { x: a.x - 0.5, y: a.z - 0.5 })?.map((p) => ({
        x: p.x + 0.5,
        z: p.y + 0.5,
      }));
  const restoredAt = now();
  for (const item of saved.loot || []) {
    // Older drops without a wall deadline stored their spawn time as unlockAt minus the claim window.
    // Older market vials had a wall deadline and unlocked immediately.
    const droppedAt =
      item.unlockAt - (item.wallExpiresAt === undefined ? LOOT_OWNER_CLAIM_SECONDS : 0);
    const expires = Math.min(item.expires, droppedAt + GROUND_ITEM_LIFETIME_SECONDS);
    const wallExpiresAt =
      item.wallExpiresAt === undefined
        ? restoredAt + Math.round((expires - clock) * 1000)
        : item.wallExpiresAt - Math.round((item.expires - expires) * 1000);
    const restored = { ...item, expires, wallExpiresAt };
    if (!groundItemExpired(restored, clock, restoredAt)) loot.set(item.id, restored);
  }
  for (const cow of cows) {
    const previous = saved.cows?.find((c) => c.id === cow.id);
    if (previous) {
      if (
        Number.isFinite(previous.x) &&
        Number.isFinite(previous.z) &&
        Math.hypot(previous.x - cow.home.x, previous.z - cow.home.z) < 2 &&
        geometry.landClearAt(previous.x - 0.5, previous.z - 0.5)
      )
        Object.assign(cow, {
          x: previous.x,
          z: previous.z,
          phase: previous.phase || 0,
          grazingVisit: previous.grazingVisit || 0,
          grazingPause: previous.grazingPause ?? 2,
        });
      Object.assign(cow, {
        hp: Math.max(0, Math.min(MONSTER_STATS.cow.hp, previous.hp)),
        respawn: Math.max(0, Math.min(MONSTER_STATS.cow.respawn, previous.respawn)),
      });
    }
  }
  if (saved.raptor)
    Object.assign(raptor, saved.raptor, {
      max: MONSTER_STATS.raptor.hp,
      hp: restoredMonsterHealth(
        saved.raptor.hp ?? saved.raptor.max ?? LEGACY_RAPTOR_MAX_HP,
        saved.raptor.max ?? LEGACY_RAPTOR_MAX_HP,
        MONSTER_STATS.raptor.hp,
      ),
      path: [],
      prey: null,
      repath: 0,
    });
  // Saved animation positions belong to a particular authored patrol. A map
  // edit must not leave a relocated researcher walking back across the city.
  const npcLayouts = new Map(
    npcList.map((n) => [
      n.id,
      JSON.stringify(n.roam ? [n.roam.home, n.roam.bounds, n.roam.points] : n.points || [n.x, n.z]),
    ]),
  );
  for (const previous of saved.npcs || []) {
    const npc = npcById.get(previous.id);
    if (
      !npc ||
      !Number.isFinite(previous.x) ||
      !Number.isFinite(previous.z) ||
      !geometry.landClearAt(previous.x - 0.5, previous.z - 0.5)
    )
      continue;
    if (previous.layout && previous.layout !== npcLayouts.get(npc.id)) continue;
    if (npc.roam && (!previous.layout || !validNPCRoamingState(npc.roam, previous.roam))) continue;
    if (
      npc.points &&
      previous.routeIndex !== undefined &&
      (!Number.isInteger(previous.routeIndex) ||
        previous.routeIndex < 0 ||
        previous.routeIndex >= npc.points.length)
    )
      continue;
    if (!previous.layout) {
      const b = npc.roam?.bounds;
      if (
        b &&
        (previous.x - 0.5 < b.west ||
          previous.x - 0.5 > b.east ||
          previous.z - 0.5 < b.north ||
          previous.z - 0.5 > b.south)
      )
        continue;
      if (npc.researcher && npc.points) {
        const xs = npc.points.map((p) => (Array.isArray(p) ? p[0] : p.x)),
          zs = npc.points.map((p) => (Array.isArray(p) ? p[1] : p.y));
        if (
          previous.x < Math.min(...xs) - 0.2 ||
          previous.x > Math.max(...xs) + 0.2 ||
          previous.z < Math.min(...zs) - 0.2 ||
          previous.z > Math.max(...zs) + 0.2
        )
          continue;
      }
    }
    const { roam, layout, ...fields } = previous;
    Object.assign(npc, fields);
    if (roam && npc.roam)
      Object.assign(npc.roam, { index: roam.index, pause: roam.pause, stops: roam.stops });
  }
  const tigerGrace = new WeakMap<ServerPlayer, number>();
  const tigerPlayer = { x: SF_ZOO.exit.x, y: SF_ZOO.exit.y },
    tiger = createTigerEncounter({
      player: tigerPlayer,
      home: { x: SF_ZOO.cage.x - 0.5, y: SF_ZOO.cage.z - 0.5 },
      exit: SF_ZOO.exit,
      wardenStarts: SF_ZOO.wardens,
      routeTo: (x: number, y: number, from?: Point) => routeTo(x, y, from || tigerPlayer),
      canCapture: (a, b) => geometry.canTravel!(a.x, a.y, b.x, b.y, true),
      canPursue: () => !!focus,
      captureGrace: 0,
      onDeath: () => {
        if (focus) {
          tigerGrace.set(focus, clock + TIGER_CATCH_GRACE);
          focus.hp = 0;
          send(focus, { type: 'caught', source: 'tiger' });
          focus.respawnAllowed = true;
          dirty(focus);
          focus = null;
        }
      },
      random,
    });
  tiger.restore(saved.tiger);
  tiger.state.grace = 0;
  // Preserve the aircraft in flight, returning it safely to the mooring
  // after a restart; never restore dangling socket IDs as pilot authority.
  if (saved.airship?.active && saved.airship.position) {
    Object.assign(airship.state, saved.airship, {
      position: { ...saved.airship.position },
      active: true,
      target: null,
    });
    airship.returnHome();
  }
  const airshipRental = createAirshipRental({
    geometry,
    players,
    airship,
    captain: () => captain,
    reset: resetAirship,
    now,
    dirty,
    saved: saved.airshipLease,
  });
  const publicPlayer = (p: ServerPlayer) => (p.instance?.kind || 'world') === 'world';
  const labPlayer = (p: ServerPlayer) => p.instance?.kind === LAB_INSTANCE.kind;
  const eligible = (p: ServerPlayer) =>
    (publicPlayer(p) || labPlayer(p)) &&
    p.hp > 0 &&
    !p.personalJailed &&
    !p.detainAt &&
    !p.grappling &&
    !p.depotLaunch &&
    p.mode !== 'roof' &&
    p.mode !== 'atv' &&
    p.mode !== 'waymo' &&
    !passengers.has(p.id) &&
    !(
      [
        'rocket',
        'hidden',
        'surf',
        'gondola',
        'climb',
        'airship',
        'bomber',
        'parachute',
        'teleport',
      ] satisfies [string, string, string, string, string, string, string, string, string]
    ).includes(p.mode);
  npcIndex.rebuild(npcList);
  const level = (p: ServerPlayer) => strengthStatus(p.profile.playerState.skills.strength.xp).level;
  const creatureGround = (x: number, z: number) =>
    inBerkeleyLab(x, z) ? LAB_FLOOR + 0.025 : geometry.characterGround(x, z);
  const creatureSegment = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    inBerkeleyLab(a.x, a.z) || inBerkeleyLab(b.x, b.z)
      ? labSegment(a, b)
      : geometry.canTravel!(a.x - 0.5, a.z - 0.5, b.x - 0.5, b.z - 0.5, true);
  const wilderness = createWilderness<ServerPlayer>({
    spawns: geometry.wilderness?.actors || [],
    ground: creatureGround,
    canTravel: creatureSegment,
    canShoot: (actor, target) =>
      inBerkeleyLab(actor.x, actor.z)
        ? labSegment(actor, target)
        : (geometry.lineClear?.(actor, target) ?? creatureSegment(actor, target)),
    route: (actor, goal) => {
      // A small idle shuffle blocked by a tree should wait for the next
      // wander target, not search the entire mountain for a detour. Pursuit
      // and returning from a distant chase still use the full route planner.
      if (!actor.enemy && Math.hypot(actor.x - goal.x, actor.z - goal.z) < 3)
        return creatureSegment(actor, goal) ? [goal] : [];
      if (inBerkeleyLab(actor.x, actor.z))
        return LAB_NAV.path(
          { x: actor.x - 0.5, y: actor.z - 0.5 },
          { x: goal.x - 0.5, y: goal.z - 0.5 },
        )?.map(({ x, y }) => ({ x: x + 0.5, z: y + 0.5 }));
      return pathTo(actor, goal);
    },
    random,
    onHit: ({ actor, attacker, damage }) =>
      broadcastHit(attacker, actor, damage, attacker.weapon || 'unarmed'),
    onDrop: (record, attacker) =>
      Object.assign(
        drop(record.lootKind, record.x, record.z, attacker.owner, record.amount),
        record,
      ),
    onDamage: (p: ServerPlayer, amount: number, actor: WildernessActor) => {
      if (amount <= 0) return;
      const effect = MONSTER_STATS[actor.combatKind].attackEffect;
      if (effect !== 'explosive' && effect !== 'akimbo' && effect !== 'robocop-laser') {
        hitFromWilderness(p, amount, actor);
        return;
      }
      const explosive = effect === 'explosive';
      const impact = {
        at: clock + (explosive ? SCIENTIST_EXPLOSIVE.flight : ENERGY_BOLT_SECONDS),
        target: p,
        instanceId: p.instance.id,
        actor,
        amount,
      };
      const before = projectileImpacts.findIndex((pending) => pending.at > impact.at);
      projectileImpacts.splice(before < 0 ? projectileImpacts.length : before, 0, impact);
      const wrist = effect === 'robocop-laser';
      const forward = explosive ? 0.28 : wrist ? 0.64 : 0.52;
      const side = wrist ? 0.29 : 0;
      const cos = Math.cos(actor.angle);
      const sin = Math.sin(actor.angle);
      const from = {
        x: actor.x + cos * forward - sin * side,
        y: actor.base + (explosive ? 1.48 : wrist ? 1.29 : 1.19),
        z: actor.z + sin * forward + cos * side,
      };
      const to = { x: p.x, y: p.y + (explosive ? 0.1 : 0.9), z: p.z };
      for (const observer of players.values()) {
        if (observer.instance.id !== p.instance.id || near(observer, actor) >= 45) continue;
        if (explosive) send(observer, { type: 'scientistExplosive', from, to });
        else send(observer, { type: 'robotShot', weapon: effect, from, to });
      }
    },
    onReflect: (attacker, amount, actor) => {
      const player = typeof attacker.id === 'number' ? players.get(attacker.id) : undefined;
      if (player?.hp && !player.respawnAllowed)
        applyPlayerDamage(player, amount, actor.label, actor);
    },
  });
  function hitFromWilderness(p: ServerPlayer, amount: number, actor: WildernessActor) {
    const damage = hitPlayer(p, amount, actor.label, actor);
    if (damage === undefined) return;
    if (p.hp > 0 && MONSTER_STATS[actor.combatKind].attackEffect === 'bind' && random() < 1 / 8)
      onBind(p);
    const reflected = recoilDamage(p.inventory.economy.state, p.appearance, damage);
    if (reflected)
      wilderness.damage(
        actor.id,
        reflected,
        { ...p, weapon: 'unarmed', tinfoil: p.appearance.tinfoil },
        true,
      );
  }
  function dispatchSecuritiesInvestigator(p: ServerPlayer) {
    const from = { x: p.x - 0.5, y: p.z - 0.5 };
    const reachable = (x: number, y: number) =>
      Math.hypot(x - from.x, y - from.y) >= 1.2 && creatureSegment(p, { x: x + 0.5, z: y + 0.5 });
    const spawn =
      geometry.airship?.nearest(from.x, from.y, 3.5, reachable) ??
      geometry.nearestNavigation?.(from.x, from.y, 3.5, reachable) ??
      NAVIGATION_DIRECTIONS.map(({ dx, dz }) => ({
        x: from.x + dx * 1.25,
        y: from.y + dz * 1.25,
      })).find(({ x, y }) => reachable(x, y));
    return wilderness.dispatch(
      {
        id: 'securities-investigator-' + ++investigatorSerial,
        combatKind: 'securities-investigator',
        x: spawn ? spawn.x + 0.5 : p.x,
        z: spawn ? spawn.y + 0.5 : p.z,
      },
      p,
    );
  }
  wilderness.sync(
    (saved.wilderness || []).map((n) => {
      const actor = wilderness.actors.find((a) => a.id === n.id);
      if (!actor) return n;
      const stats = MONSTER_STATS[actor.combatKind],
        moved = n.home && Math.hypot(actor.home.x - n.home.x, actor.home.z - n.home.z) > 0.01;
      const outside =
        stats.territoryHalfWidth &&
        Math.max(
          Math.abs((n.x ?? actor.home.x) - actor.home.x),
          Math.abs((n.z ?? actor.home.z) - actor.home.z),
        ) > stats.territoryHalfWidth;
      // Checkpoints retain encounter progress; difficulty and territory are
      // authored configuration and must follow balance changes after restart.
      return {
        ...n,
        combatKind: actor.combatKind,
        label: actor.label,
        description: actor.description,
        level: actor.level,
        height: actor.height,
        max: actor.max,
        hp: isFiniteNumber(n.hp) ? restoredMonsterHealth(n.hp, n.max, actor.max) : actor.hp,
        enemy: null,
        enemyPosition: undefined,
        attackAnimation: undefined,
        returning: false,
        chaseUntil: 0,
        ...(moved || outside
          ? { x: actor.x, z: actor.z, base: actor.base, home: { ...actor.home } }
          : {}),
      };
    }),
  );
  function broadcastHit(
    attacker: WildernessPerson,
    target: WorldPoint & { id: string; hp: number; max: number },
    damage: number,
    weapon: string,
  ) {
    const player = typeof attacker.id === 'number' ? players.get(attacker.id) : undefined;
    const p = player || attacker;
    if (player) onCombatDamage(player, damage);
    p.angle = Math.atan2(target.z - p.z, target.x - p.x);
    p.gesture = 'attack';
    p.gestureUntil = now() + 450;
    const event = {
      type: 'sharedHit',
      attacker: p.id,
      target: target.id,
      damage,
      hp: target.hp,
      max: target.max,
      weapon,
      from: { x: p.x, y: (p.y ?? p.base ?? 0) + 1.14, z: p.z },
      to: { x: target.x, y: creatureGround(target.x, target.z) + 0.9, z: target.z },
    };
    for (const observer of players.values())
      if (
        (inBerkeleyLab(target.x, target.z) ? labPlayer(observer) : publicPlayer(observer)) &&
        near(observer, target) < 45
      )
        send(observer, event);
  }
  function monsterDrops(kind: string, target: WorldPoint, owner: string | null | undefined) {
    for (const record of rollMonsterDrops(kind, random))
      Object.assign(drop(record.lootKind, target.x, target.z, owner, record.amount), record, {
        base: geometry.characterGround(target.x, target.z) + 0.025,
      });
  }
  function freeDeckSpot() {
    const spots = Array.from({ length: 16 }, (_, i) => ({
      x: -2.4 + (i % 4) * 0.8,
      z: -0.6 + Math.floor(i / 4) * 0.4,
    }));
    return (
      spots.find(
        (spot) =>
          ![...players.values()].some(
            (p) =>
              passengers.has(p.id) &&
              p.deck &&
              Math.hypot(p.deck.x - spot.x, p.deck.z - spot.z) < 0.32,
          ),
      ) || spots[0]
    );
  }
  function drop(kind: string, x: number, z: number, owner: string | null = null, amount = 1) {
    const item: SharedLoot = {
      id: 'shared-loot-' + ++lootSerial,
      kind: 'loot',
      network: true,
      ...itemLoot(kind, amount),
      x,
      z,
      owner,
      unlockAt: clock + LOOT_OWNER_CLAIM_SECONDS,
      ...groundItemDeadline(clock, now()),
    };
    loot.set(item.id, item);
    return item;
  }
  function hitPlayer(
    p: ServerPlayer,
    amount: number,
    source: string,
    attacker: { id: string | number } | null,
  ) {
    if (!eligible(p)) return;
    const damage = Math.max(
      0,
      rollEnemyDamage(amount, level(p), random) -
        ownedEquipmentDefense(p.inventory.economy.state, p.appearance),
    );
    return applyPlayerDamage(p, damage, source, attacker);
  }
  function applyPlayerDamage(
    p: ServerPlayer,
    amount: number,
    source: string,
    attacker: { id: string | number } | null,
  ) {
    const damage = Math.min(p.hp, amount);
    p.hp -= damage;
    p.damagePending = true;
    send(p, { type: 'damage', damage, hp: p.hp, max: p.max, source, attacker: attacker?.id });
    if (!p.hp) {
      p.respawnAllowed = true;
      p.attack = null;
      send(p, { type: 'caught', source });
    }
    dirty(p);
    return damage;
  }
  function clearShot(p: ServerPlayer, target: { x: number; z: number }, range = 5) {
    const lab = inBerkeleyLab(target.x, target.z);
    if (lab !== labPlayer(p)) return false;
    if (lab) return near(p, target) <= range && labSegment(p, target);
    if (
      range <= 1.5 &&
      !geometry.canTravel!(p.x - 0.5, p.z - 0.5, target.x - 0.5, target.z - 0.5, true)
    )
      return false;
    if (
      !combatInRange(
        { ...p, base: p.y },
        { ...target, base: geometry.characterGround(target.x, target.z) },
        range,
      )
    )
      return false;
    if (!geometry.lineClear) return true;
    return geometry.lineClear(
      { ...p, base: p.y },
      { ...target, base: geometry.characterGround(target.x, target.z) },
    );
  }
  function shoot(
    p: ServerPlayer,
    target: SharedCow | SharedRaptor | WildernessActor,
    weapon: string,
  ): CommandResult & { cooldown?: boolean; damage?: number } {
    if (p.shotAt > clock + 1e-8) return { ok: false, cooldown: true };
    const supply = consumeWeaponShot(p, weapon, target === raptor);
    if (!supply.ok) {
      p.attack = null;
      return supply;
    }
    if (supply.spent) send(p, { type: 'inventory', inventory: p.inventory.snapshot() });
    p.shotAt = advanceAttackDeadline(
      clock,
      p.shotAt,
      weaponAttackInterval(weapon, p.inventory.economy.state),
    );
    if ('wilderness' in target && target.wilderness) {
      const result = wilderness.strike(target.id, {
        ...p,
        level: level(p),
        tinfoil: p.appearance.tinfoil && equipmentOwned(p.inventory.economy.state, 'tinfoil-suit'),
        weapon,
        inebriation: p.profile.playerState.conditions.inebriation,
      });
      dirty(p);
      return result;
    }
    const damage = Math.min(
      target.hp,
      rollWeaponDamage(level(p), weapon, random, p.profile.playerState.conditions.inebriation),
    );
    damageCreature(p, target, damage, weapon);
    return { ok: true, damage };
  }
  function damageCreature(
    p: ServerPlayer,
    target: SharedCow | SharedRaptor,
    damage: number,
    weapon: string,
  ) {
    target.hp -= damage;
    broadcastHit(p, target, damage, weapon);
    if (!target.hp) {
      p.attack = null;
      if (target === raptor) {
        raptor.phase = 'dead';
        raptor.path = [];
        raptor.prey = null;
        raptor.resetAt = clock + MONSTER_STATS.raptor.respawn;
        onRaptorDefeated(p);
        monsterDrops('raptor', target, p.owner);
      } else {
        (target as SharedCow).respawn = MONSTER_STATS.cow.respawn;
        monsterDrops('cow', target, p.owner);
      }
      dirty(p);
    }
  }
  const blockedByStatic = (p: ServerPlayer, target: Actor) =>
    target.combatKind === 'emf-warrior' &&
    !(p.appearance.tinfoil && equipmentOwned(p.inventory.economy.state, 'tinfoil-suit'));
  function announceCaptain(id: number) {
    const pilot = players.get(id);
    if (pilot)
      send(pilot, {
        type: 'notice',
        message: contentText('world-message.server.shared-world.you-are-the-airship-pilot', {
          value1: '',
        }),
      });
  }
  function removePassenger(p: ServerPlayer) {
    passengers.delete(p.id);
    p.deckTarget = null;
    p.airship = false;
    if (captain === p.id) {
      captain = passengers.values().next().value ?? null;
      if (captain !== null) announceCaptain(captain);
    }
  }
  function clearRope() {
    Object.assign(shipRope, {
      deployed: false,
      top: null,
      bottom: null,
      passenger: null,
      passengerPaid: false,
      fareOwner: null,
    });
  }
  function leave(p: ServerPlayer) {
    removePassenger(p);
    p.grappling = null;
    if (
      !passengers.size &&
      airship.state.active &&
      ![...players.values()].some((other) => other.grappling && !other.grappling.down)
    ) {
      clearRope();
      airship.returnHome();
    }
    return { ok: true };
  }
  function airshipSnapshot() {
    const s = airship.state;
    return {
      active: s.active,
      phase: s.phase,
      position: s.position || shipHome,
      heading: s.heading,
      speed: s.speed,
      captain,
      passengers: [...passengers],
      rope: { ...shipRope },
      grapplers: [...players.values()]
        .filter((p) => p.grappling)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
      ...airshipRental.publicStatus(),
    };
  }
  function resetAirship(reason: string, requester: ServerPlayer | null = null) {
    const affected = new Set(
      [...players.values()].filter((p) => passengers.has(p.id) || p.airship || p.grappling),
    );
    airship.cancel();
    airship.state.heading = -Math.PI / 2;
    captain = null;
    passengers.clear();
    clearRope();
    for (const item of loot.values())
      if (item.ship) {
        item.x = shipHome.x + (item.deck?.z || 0);
        item.z = shipHome.z - (item.deck?.x || 0);
        item.base = geometry.characterGround(item.x, item.z) + 0.025;
        item.ship = false;
        delete item.deck;
      }
    for (const p of affected) {
      Object.assign(p, {
        x: shipHome.x,
        z: shipHome.z,
        y: geometry.characterGround(shipHome.x, shipHome.z),
        mode: 'walk',
        moving: false,
        motion: 0,
        airship: false,
        grappling: null,
        deck: null,
        deckTarget: null,
        attack: null,
      });
      onAirshipReset(p);
      dirty(p);
    }
    const ship = airshipSnapshot();
    for (const p of players.values())
      if (publicPlayer(p)) {
        const message =
          reason === 'scheduled'
            ? contentText(
                'world-message.server.shared-world.the-hourly-airship-reset-has-returned-the-ship-to-the-terminal',
              )
            : requester?.id === p.id
              ? contentText(
                  'world-message.server.shared-world.your-priority-recall-has-returned-the-airship-to-the-terminal',
                )
              : contentText('world-message.server.shared-world.the-airship-has-been-recalled-by', {
                  name: String(requester!.name),
                });
        send(p, {
          type: 'airshipReset',
          reason,
          airship: ship,
          ...(affected.has(p)
            ? {
                position: { x: p.x, y: p.y, z: p.z, angle: p.angle },
                message: contentText(
                  'world-message.server.shared-world.you-return-safely-to-the-mooring',
                  { message: String(message) },
                ),
              }
            : { message }),
        });
      }
  }
  function command(p: ServerPlayer, action: string, args: Record<string, unknown> = {}) {
    airshipRental.tick();
    if (action === 'stopAttack') {
      p.attack = null;
      movement?.stopCombatRoute(p);
      return { ok: true };
    }
    if (!publicPlayer(p) && !(labPlayer(p) && (action === 'attack' || action === 'collect')))
      return {
        ok: false,
        message: contentText(
          'world-message.server.shared-world.that-shared-world-interaction-is-unavailable-in-this-private-m',
        ),
      };
    if (action === 'airshipStatus' || action === 'airshipRecall')
      return airshipRental.command(p, action, args);
    if (action === 'talkCultist' || action === 'confrontPastor') {
      const pastor = action === 'confrontPastor';
      const kind = pastor ? 'unusual-pastor' : 'bolinas-cultist';
      const target = wilderness.actors.find(
        (n) => n.id === args.id && n.combatKind === kind && n.hp > 0,
      );
      if (
        !eligible(p) ||
        !target ||
        near(p, target) > GAMEPLAY.interactionRange ||
        !creatureSegment(p, target)
      )
        return {
          ok: false,
          message: pastor
            ? 'Get closer to the Unusual Pastor.'
            : contentText('world-message.bolinas.approach-cultist'),
        };
      wilderness.provoke(target, p);
      return {
        ok: true,
        message: pastor
          ? 'The Unusual Pastor attacks!'
          : contentText('world-message.bolinas.cultist-attacks'),
      };
    }
    if (action === 'attack') {
      const target = [...cows, raptor, ...wilderness.actors].find((n) => n.id === args.id),
        weapon = typeof args.weapon === 'string' ? args.weapon : 'railgun';
      if (!eligible(p) || !weaponOwned(p.inventory.economy.state, weapon))
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.you-need-to-own-that-weapon-and-have-both-feet-available',
          ),
        };
      const restriction = railgunRestriction(p, weapon, target === raptor);
      if (restriction) return { ok: false, message: restriction };
      if (
        !target?.hp ||
        inBerkeleyLab(target.x, target.z) !== labPlayer(p) ||
        (target === raptor && raptor.phase !== 'loose')
      )
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.that-target-is-unavailable'),
        };
      if (isYardFighter(target.combatKind) && !hasFighterYardPass(p))
        return { ok: false, message: contentText('world-message.fighter-yard.admission-required') };
      if (blockedByStatic(p, target))
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.a-wall-of-static-forces-you-back',
          ),
        };
      const range = ITEM_STATS[weapon].range ?? ITEM_STATS.unarmed.range!;
      if (!clearShot(p, target, range)) {
        if (!movement?.approachCombat(p, { x: target.x, z: target.z }, range))
          return {
            ok: false,
            message: contentText(
              'world-message.server.shared-world.there-is-no-reachable-attack-position',
            ),
          };
        p.attack = target.id;
        p.attackWeapon = weapon;
        approachAt.set(p, clock + 0.35);
        return { ok: true };
      }
      const result = shoot(p, target, weapon);
      if (result.ok || result.cooldown) {
        p.attack = target.hp > 0 && p.hp > 0 ? target.id : null;
        p.attackWeapon = weapon;
      }
      return result;
    }
    if (action === 'kickTaxi') {
      const car = geometry.streetTraffic?.cars?.find((vehicle) => vehicle.id === args.id);
      if (!eligible(p) || !car || near(p, car) > 2.1 || !creatureSegment(p, car))
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.stand-beside-the-vehicle-to-kick-it',
          ),
          retryApproach: eligible(p) && !!car,
        };
      if (
        wilderness.actors.some(
          (actor) => actor.combatKind === 'robocop' && actor.hp > 0 && actor.dispatchedFor === p.id,
        )
      )
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.robocop-is-already-responding'),
        };
      const spawn = geometry.nearestNavigation?.(
        car.x - 0.5,
        car.z - 0.5,
        3,
        (x, z) =>
          Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) >= 1.35 &&
          creatureSegment(p, { x: x + 0.5, z: z + 0.5 }),
      );
      wilderness.dispatch(
        {
          id: 'robocop-' + ++robocopSerial,
          combatKind: 'robocop',
          x: spawn ? spawn.x + 0.5 : car.x,
          z: spawn ? spawn.y + 0.5 : car.z,
        },
        p,
      );
      p.gesture = 'attack';
      p.gestureUntil = now() + 450;
      return {
        ok: true,
        message: contentText('world-message.server.shared-world.the-taxi-calls-robocop'),
      };
    }
    if (action === 'petBear') {
      if (!eligible(p))
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.find-your-feet-before-petting-the-bear',
          ),
        };
      p.attack = null;
      const result = wilderness.pet(typeof args.id === 'string' ? args.id : '', p);
      if (result.ok) {
        const bear = wilderness.actors.find((n) => n.id === args.id);
        p.angle = Math.atan2(bear!.z - p.z, bear!.x - p.x);
        p.gesture = 'pet-bear';
        p.gestureUntil = now() + 1500;
      }
      return result;
    }
    if (action === 'releaseRaptor') {
      if (raptor.phase !== 'caged')
        return {
          ok: true,
          message:
            raptor.phase === 'dead'
              ? contentText(
                  'world-message.server.shared-world.recover-the-velociraptors-remains-or-check-back-when-the-cage',
                )
              : contentText(
                  'world-message.server.shared-world.the-velociraptor-is-already-out-follow-it-toward-the-road-sout',
                ),
        };
      Object.assign(raptor, {
        phase: 'releasing',
        release: 0,
        hp: MONSTER_STATS.raptor.hp,
        x: JURASSIC.exit.x,
        z: JURASSIC.cage.z,
        path: [],
        repath: 0,
        prey: null,
        attackIn: 1,
        angle: Math.PI / 2,
      });
      return {
        ok: true,
        message: contentText(
          'world-message.server.shared-world.the-gate-opens-follow-the-raptor-south-of-the-lab',
        ),
      };
    }
    if (action === 'releaseTiger') {
      if (near(p, { x: SF_ZOO.entry.x + 0.5, z: SF_ZOO.entry.y + 0.5 }) > 14)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.go-to-the-tiger-enclosure-first'),
        };
      return tiger.release()
        ? { ok: true }
        : {
            ok: false,
            message: contentText(
              'world-message.server.shared-world.the-tiger-is-already-out-this-affects-everyone',
            ),
          };
    }
    if (action === 'collect') {
      const item = loot.get(typeof args.id === 'string' ? args.id : '');
      if (!item || groundItemExpired(item, clock, now())) {
        if (item) loot.delete(item.id);
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.someone-already-collected-that-loot',
          ),
        };
      }
      if (
        !(eligible(p) || (p.hp > 0 && p.airship && item.ship)) ||
        inBerkeleyLab(item.x, item.z) !== labPlayer(p) ||
        near(p, item) > 1.8 ||
        Math.abs(p.y - (item.base ?? p.y)) > 2.5
      )
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.walk-closer-to-the-loot'),
        };
      if (item.owner && item.owner !== p.owner && clock < item.unlockAt)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.the-hunter-has-first-claim-for-more-seconds',
            { value1: String(Math.ceil(item.unlockAt - clock)) },
          ),
        };
      if (
        item.lootKind === 'raptor' &&
        (item.owner !== p.owner || p.profile.playerState.quests.expeditions.raptor !== 'escaped')
      )
        return {
          ok: false,
          message: contentText('world-message.jurassic.your-own-raptor-remains'),
        };
      const definition = ITEM_STATS[item.lootKind];
      if (definition?.pickup === 'disintegrate') {
        loot.delete(item.id);
        dirty(p);
        return {
          ok: true,
          message: definition.pickupMessageId && contentText(definition.pickupMessageId),
        };
      }
      const grant = p.inventory?.receive(item);
      if (grant && !grant.ok) return grant;
      loot.delete(item.id);
      return {
        ok: true,
        award: {
          kind: item.lootKind,
          amount: item.amount,
          hatId: item.hatId,
          inventory: grant && 'inventory' in grant ? grant.inventory : undefined,
        },
        message:
          item.lootKind === 'sandwich'
            ? undefined
            : contentText('world-message.server.shared-world.you-collect', {
                value1: String(item.label.toLowerCase()),
              }),
      };
    }
    if (action === 'airshipBoard') {
      const permission = airshipRental.mayBoard(p);
      if (!permission.ok) return permission;
      if (!eligible(p) || near(p, shipHome) > 3)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.walk-to-the-airship-mooring-first',
          ),
        };
      if (
        (airship.state.active && near(airship.state.position!, shipHome) > 0.5) ||
        (airship.state.position?.y ?? -Infinity) > shipHome.y + 1
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.the-airship-is-away-a-grappling-hook-can-reach-its-basket-from',
          ),
        };
      if (passengers.size >= 16)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.the-basket-is-full'),
        };
      const rental = airshipRental.rent(p, args.price);
      if (!rental.ok) return rental;
      if (!airship.state.active) airship.board({ x: shipHome.x - 0.5, y: shipHome.z - 0.5 });
      captain ??= p.id;
      p.deck = freeDeckSpot();
      passengers.add(p.id);
      p.airship = true;
      p.attack = null;
      airshipRental.boarded(p);
      return {
        ...rental,
        message:
          captain === p.id
            ? contentText('world-message.server.shared-world.you-are-the-airship-pilot', {
                value1: String(
                  ('paid' in rental ? rental.paid : 0)
                    ? 'You rent the airship for ' +
                        ('paid' in rental ? rental.paid : 0) +
                        ' coins. '
                    : '',
                ),
              })
            : contentText('world-message.server.shared-world.you-board-as-a-passenger'),
      };
    }
    if (action === 'airshipTarget' || action === 'airshipStop' || action === 'airshipHome') {
      if (captain !== p.id)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.only-the-current-pilot-can-steer-you-can-walk-around-the-baske',
          ),
        };
      if (shipRope.deployed && action !== 'airshipStop')
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.retract-the-rope-before-flying'),
        };
      if (action === 'airshipStop') airship.stop();
      else if (action === 'airshipHome') airship.returnHome();
      else {
        if (
          !isFiniteNumber(args.x) ||
          !isFiniteNumber(args.z) ||
          Math.abs(args.x) > 5000 ||
          Math.abs(args.z) > 5000
        )
          return {
            ok: false,
            message: contentText('world-message.server.shared-world.invalid-destination'),
          };
        airship.flyTo(args.x, args.z);
      }
      return { ok: true };
    }
    if (action === 'airshipRope') {
      if (captain !== p.id)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.only-the-pilot-can-lower-or-retract-the-shared-rope',
          ),
        };
      if (args.retract) {
        if (
          shipRope.passenger?.phase === 'ascending' ||
          [...players.values()].some((other) => other.grappling)
        )
          return {
            ok: false,
            message: contentText(
              'world-message.server.shared-world.wait-for-everyone-to-finish-climbing',
            ),
          };
        shipRope.deployed = false;
        return { ok: true };
      }
      const s = airship.state.position;
      if (!s || airship.state.phase !== 'flying' || !geometry.landClearAt(s.x - 0.5, s.z - 0.5))
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.hover-over-walkable-ground-before-lowering-a-rope',
          ),
        };
      airship.stop();
      Object.assign(shipRope, {
        deployed: true,
        top: { ...s },
        bottom: { x: s.x, y: geometry.characterGround(s.x, s.z), z: s.z },
      });
      return {
        ok: true,
        message: contentText(
          'world-message.server.shared-world.the-shared-rope-is-lowered-other-players-can-climb-it-too',
        ),
      };
    }
    if (action === 'airshipInvite') {
      if (captain !== p.id || !shipRope.deployed || shipRope.passenger || shipRope.passengerPaid)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.lower-the-rope-and-invite-one-traveler-at-a-time',
          ),
        };
      shipRope.passenger = {
        ...shipRope.bottom!,
        phase: 'ascending',
        gender: random() < 0.5 ? 'man' : 'woman',
      };
      shipRope.fareOwner = p.id;
      return {
        ok: true,
        message: contentText(
          'world-message.server.shared-world.the-traveler-starts-climbing-the-fare-is-paid-on-arrival',
        ),
      };
    }
    if (action === 'airshipClimbDown') {
      if (!passengers.has(p.id) || !shipRope.deployed)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.lower-the-rope-first'),
        };
      const from = { x: p.x, y: p.y, z: p.z },
        to = { ...shipRope.bottom! };
      removePassenger(p);
      p.grappling = {
        down: true,
        from,
        to,
        elapsed: 0,
        duration: Math.max(2, Math.min(8, (from.y - to.y) / 6)),
      };
      p.mode = 'climb';
      return { ok: true };
    }
    if (action === 'airshipClimbUp') {
      if (!shipRope.deployed || !eligible(p) || near(p, shipRope.bottom!) > 1.5)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.stand-next-to-the-lowered-rope'),
        };
      if (passengers.size >= 16)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.the-basket-is-full'),
        };
      p.grappling = {
        from: { x: p.x, y: p.y, z: p.z },
        elapsed: 0,
        duration: Math.max(2, Math.min(8, (shipRope.top!.y - p.y) / 6)),
      };
      p.mode = 'climb';
      return { ok: true };
    }
    if (action === 'airshipDeck') {
      if (!passengers.has(p.id) || !isFiniteNumber(args.x) || !isFiniteNumber(args.z))
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.you-are-not-aboard'),
        };
      p.deckTarget = {
        x: Math.max(AIRSHIP_BASKET.left + 0.3, Math.min(AIRSHIP_BASKET.right - 0.3, args.x)),
        z: Math.max(AIRSHIP_BASKET.north + 0.3, Math.min(AIRSHIP_BASKET.south - 0.3, args.z)),
      };
      return { ok: true };
    }
    if (action === 'airshipLeave') {
      if (!passengers.has(p.id) && !p.grappling) return { ok: true };
      const s = airship.state.position || shipHome,
        landing =
          geometry.nearestGround?.(s.x, s.z) ||
          (!geometry.landClearAt(s.x - 0.5, s.z - 0.5) ? null : { x: s.x, z: s.z });
      if (!landing)
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.wait-until-the-airship-is-above-walkable-ground',
          ),
        };
      leave(p);
      p.x = landing.x;
      p.z = landing.z;
      p.y = geometry.characterGround(p.x, p.z);
      p.mode = 'walk';
      send(p, { type: 'position', x: p.x, z: p.z, y: p.y, reason: 'disembark' });
      return { ok: true };
    }
    if (action === 'grapple') {
      if (!p.profile.grapplingHook)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.you-do-not-own-a-grappling-hook'),
        };
      if (
        !eligible(p) ||
        !airship.state.active ||
        near(p, airship.state.position!) > 6 ||
        airship.state.position!.y < p.y + 0.8
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.shared-world.stand-within-six-tiles-underneath-the-flying-airship',
          ),
        };
      if (passengers.size >= 16)
        return {
          ok: false,
          message: contentText('world-message.server.shared-world.the-basket-is-full'),
        };
      p.attack = null;
      p.grappling = {
        from: { x: p.x, y: p.y, z: p.z },
        elapsed: 0,
        duration: Math.max(2, Math.min(8, (airship.state.position!.y - p.y) / 6)),
      };
      p.mode = 'climb';
      return {
        ok: true,
        message: contentText(
          'world-message.server.shared-world.your-hook-catches-the-basket-hold-on',
        ),
      };
    }
    return {
      ok: false,
      message: contentText('world-message.server.shared-world.unknown-world-action'),
    };
  }
  function tick(dt: number) {
    clock += dt;
    while (projectileImpacts.length && projectileImpacts[0].at <= clock + 1e-8) {
      const { target, instanceId, actor, amount } = projectileImpacts.shift()!;
      if (players.get(target.id) === target && target.instance.id === instanceId)
        hitFromWilderness(target, amount, actor);
    }
    geometry.streetTraffic?.update?.(dt);
    airshipRental.tick();
    const points = geometry.peptideSpawns || [];
    if (points.length && now() >= nextPeptideAt) {
      const point = points[Math.min(points.length - 1, Math.floor(random() * points.length))],
        item = drop('peptides', point.x, point.z, null, 1);
      Object.assign(item, {
        label: 'Peptides',
        description:
          'A tiny vial with a very large social network. Donate it to Ray at the Freemasons’ Guild to gain one rank.',
        base: geometry.characterGround(point.x, point.z) + 0.025,
        unlockAt: clock,
      });
      nextPeptideAt = now() + PEPTIDE_SPAWN_MS;
    }
    for (const cow of cows)
      if (!cow.hp) {
        cow.respawn = Math.max(0, cow.respawn - dt);
        if (!cow.respawn) cow.hp = cow.max;
      }
    const engaged = new Set();
    for (const p of players.values()) if (p.attack) engaged.add(p.attack);
    for (const cow of cows)
      updateGrazingCow(cow, dt, {
        blocked: engaged.has(cow.id),
        clear: geometry.landClearAt,
        travel: geometry.canTravel,
      });
    const lootTime = now();
    for (const [id, item] of loot) if (groundItemExpired(item, clock, lootTime)) loot.delete(id);
    for (const p of players.values()) {
      if (!p.attack) continue;
      const target =
          cows.find((n) => n.id === p.attack) ||
          (p.attack === raptor.id ? raptor : wilderness.actors.find((n) => n.id === p.attack)),
        weapon = p.attackWeapon || 'railgun';
      if (
        !target ||
        !target.hp ||
        !eligible(p) ||
        !weaponOwned(p.inventory.economy.state, weapon) ||
        (isYardFighter(target.combatKind) && !hasFighterYardPass(p)) ||
        (target === raptor && raptor.phase !== 'loose')
      ) {
        p.attack = null;
        continue;
      }
      if (blockedByStatic(p, target)) {
        send(p, {
          type: 'notice',
          message: contentText(
            'world-message.server.shared-world.a-wall-of-static-forces-you-back',
          ),
        });
        p.attack = null;
        movement?.stopCombatRoute(p);
        continue;
      }
      const range = ITEM_STATS[weapon].range ?? ITEM_STATS.unarmed.range!;
      if (clearShot(p, target, range)) {
        movement?.stopCombatRoute(p);
        if (p.shotAt <= clock + 1e-8) {
          const result = shoot(p, target, weapon);
          if (!result.ok && result.message) send(p, { type: 'notice', message: result.message });
        }
      } else if ((approachAt.get(p) ?? 0) <= clock) {
        approachAt.set(p, clock + 0.35);
        movement?.approachCombat(p, { x: target.x, z: target.z }, range);
      }
    }
    const event = airship.update(dt),
      ship = airship.state.position || shipHome;
    if (event === 'landed') {
      clearRope();
      captain = null;
    }
    if (shipRope.deployed && shipRope.passenger?.phase === 'ascending') {
      shipRope.passenger.y = Math.min(shipRope.top!.y, shipRope.passenger.y + dt * 2.6);
      if (shipRope.passenger.y === shipRope.top!.y) {
        shipRope.passenger.phase = 'aboard';
        shipRope.passengerPaid = true;
        const pilot = players.get(shipRope.fareOwner ?? -1);
        if (pilot) {
          pilot.inventory.economy.trade('passenger');
          pilot.inventory.save();
          dirty(pilot);
          send(pilot, {
            type: 'notice',
            message: contentText(
              'world-message.server.shared-world.the-traveler-reaches-the-basket-and-pays-you-5-coins',
            ),
          });
        }
      }
    }
    for (const item of loot.values())
      if (item.ship) {
        const c = Math.cos(airship.state.heading),
          s = Math.sin(airship.state.heading);
        item.x = ship.x + item.deck!.x * c - item.deck!.z * s;
        item.z = ship.z + item.deck!.x * s + item.deck!.z * c;
        item.base = ship.y + AIRSHIP_BASKET.floor;
      }
    for (const p of players.values()) {
      if (p.grappling) {
        const g = p.grappling,
          to = g.down ? g.to : ship;
        g.elapsed = Math.min(g.duration, g.elapsed + dt);
        const f = g.elapsed / g.duration,
          ease = f * f * (3 - 2 * f);
        p.x = g.from.x + (to.x - g.from.x) * ease;
        p.z = g.from.z + (to.z - g.from.z) * ease;
        p.y = g.from.y + (to.y - g.from.y) * ease;
        p.mode = 'climb';
        p.motion = 1;
        p.phase += dt * 7;
        if (f === 1) {
          p.grappling = null;
          if (g.down) {
            p.mode = 'walk';
            send(p, { type: 'position', x: p.x, y: p.y, z: p.z, reason: 'disembark' });
          } else {
            p.deck = freeDeckSpot();
            passengers.add(p.id);
            if (captain === null) {
              captain = p.id;
              announceCaptain(p.id);
            }
            p.airship = true;
          }
        }
      }
      if (!passengers.has(p.id)) continue;
      if (event === 'landed') {
        leave(p);
        p.x = shipHome.x;
        p.z = shipHome.z;
        p.y = shipHome.y;
        p.mode = 'walk';
        send(p, { type: 'position', x: p.x, z: p.z, y: p.y, reason: 'landed' });
        continue;
      }
      const deck = p.deck || (p.deck = { x: -1.2, z: 0 }),
        target = p.deckTarget;
      p.motion = 0;
      p.moving = false;
      if (target) {
        const dx = target.x - deck.x,
          dz = target.z - deck.z,
          d = Math.hypot(dx, dz),
          step = Math.min(d, 2.2 * dt);
        if (d > 1e-6) {
          deck.x += (dx / d) * step;
          deck.z += (dz / d) * step;
          p.angle = airship.state.heading + Math.atan2(dz, dx);
          p.motion = 1;
          p.moving = true;
          p.phase += step * 7;
        }
        if (d <= step + 1e-6) p.deckTarget = null;
      }
      const c = Math.cos(airship.state.heading),
        s = Math.sin(airship.state.heading);
      p.x = ship.x + deck.x * c - deck.z * s;
      p.z = ship.z + deck.x * s + deck.z * c;
      p.y = ship.y + AIRSHIP_BASKET.floor;
      p.mode = 'airship';
    }
    const combatants = [...players.values()].filter(eligible);
    wilderness.update(dt, combatants);
    const available = combatants.filter(publicPlayer);
    focus = null;
    if (tiger.dangerous) {
      const position = { x: tiger.state.tiger.x + 0.5, z: tiger.state.tiger.y + 0.5 };
      let nearest = Infinity;
      for (const p of available) {
        if (p.respawnAllowed || (tigerGrace.get(p) || 0) > clock) continue;
        const distance = near(p, position);
        if (distance < nearest) {
          focus = p;
          nearest = distance;
        }
      }
    }
    if (focus) {
      tigerPlayer.x = focus.x - 0.5;
      tigerPlayer.y = focus.z - 0.5;
    }
    tiger.update(dt);
    if (raptor.phase === 'releasing') {
      raptor.release = Math.min(1, raptor.release + dt);
      raptor.z = JURASSIC.cage.z + (JURASSIC.exit.z - JURASSIC.cage.z) * raptor.release;
      if (raptor.release >= 1 - 1e-8) {
        raptor.release = 1;
        raptor.phase = 'loose';
        raptor.path = pathTo(raptor, JURASSIC.runout) || [];
        raptor.repath = raptor.path.length ? 2.5 : 0;
      }
    } else if (raptor.phase === 'dead' && clock >= raptor.resetAt) {
      Object.assign(raptor, {
        phase: 'caged',
        x: JURASSIC.cage.x,
        z: JURASSIC.cage.z,
        hp: MONSTER_STATS.raptor.hp,
        path: [],
      });
    } else if (raptor.phase === 'loose') {
      raptor.repath -= dt;
      raptor.attackIn -= dt;
      if (raptor.repath <= 0) {
        raptor.repath = 0.75;
        const candidates = npcList.filter((n) => near(n, raptor) <= 30 && raptorCivilian(n, clock));
        candidates.sort((a, b) => near(a, raptor) - near(b, raptor));
        raptor.prey = null;
        raptor.path = [];
        const nearbyPlayers = available.filter((p) => near(p, raptor) < 8);
        for (const target of [...candidates.slice(0, 8), ...nearbyPlayers]) {
          const path = pathTo(raptor, target);
          if (path) {
            raptor.prey = target;
            raptor.path = path;
            break;
          }
        }
      }
      let budget = dt * 5.1;
      while (budget > 0 && raptor.path.length) {
        const target = raptor.path[0],
          distance = near(raptor, target),
          step = Math.min(budget, distance);
        if (distance > 1e-7) {
          raptor.angle = Math.atan2(target.z - raptor.z, target.x - raptor.x);
          raptor.x += ((target.x - raptor.x) * step) / distance;
          raptor.z += ((target.z - raptor.z) * step) / distance;
        }
        budget -= step;
        if (distance <= step + 1e-7) raptor.path.shift();
      }
      const prey = raptor.prey;
      if (prey && near(raptor, prey) < 1.15 && raptor.attackIn <= 0) {
        raptor.attackIn = MONSTER_STATS.raptor.interval;
        const playerPrey = typeof prey.id === 'number' ? players.get(prey.id) : undefined;
        if (playerPrey) {
          const damage =
            hitPlayer(playerPrey, MONSTER_STATS.raptor.damage, 'velociraptor', raptor) || 0;
          const reflected = Math.min(
            raptor.hp,
            recoilDamage(playerPrey.inventory.economy.state, playerPrey.appearance, damage),
          );
          if (reflected) damageCreature(playerPrey, raptor, reflected, 'recoil-amulet');
        } else {
          if (!(prey as Actor).expeditionDead) {
            (prey as Actor).expeditionDead = true;
            (prey as Actor).recoverAt = clock + 35;
            drop('coins', prey.x, prey.z, null, 3 + Math.floor(random() * 5));
            for (const p of available)
              if (near(p, prey) < 25)
                send(p, {
                  type: 'notice',
                  message: contentText(
                    'world-message.src.jurassic.the-velociraptor-attacks-a-coins-fall-to-the-ground',
                    {
                      value1: String((prey as Actor).label.toLowerCase()),
                    },
                  ),
                });
          }
          raptor.repath = 0;
        }
      }
    }
    for (const npc of npcList)
      if (npc.expeditionDead && clock >= npc.recoverAt!) npc.expeditionDead = false;
    geometry.specialNPCLife?.update(dt, {
      paused: false,
      lookAt: null,
      disabled: (n) => !!n.expeditionDead,
    });
    geometry.socialLife?.update(dt, { paused: false, lookAt: null });
    moveResearcherNPCs(npcList, dt);
    for (const life of lives) life?.update(dt);
    npcIndex.rebuild(npcList);
  }
  function dropInventory(
    victim: ServerPlayer,
    killer: ServerPlayer | null,
    items: { lootKind: string; amount: number | undefined }[],
  ) {
    const deck = victim.deck ? { ...victim.deck } : null;
    return items.map((record, index) => {
      const item = drop(record.lootKind, victim.x, victim.z, killer?.owner || null, record.amount);
      Object.assign(item, record, {
        transfer: true,
        description: 'Dropped by ' + victim.name + ' after a defeat.',
        base: victim.y + 0.02,
      });
      if (victim.airship && deck)
        Object.assign(item, {
          ship: true,
          deck: { x: deck.x + ((index % 3) - 1) * 0.13, z: deck.z + Math.floor(index / 3) * 0.1 },
        });
      else {
        const a = index * 2.4,
          r = index ? 0.32 + Math.floor(index / 6) * 0.22 : 0;
        const x = item.x + Math.cos(a) * r,
          z = item.z + Math.sin(a) * r;
        if (geometry.landClearAt(x - 0.5, z - 0.5)) {
          item.x = x;
          item.z = z;
        }
      }
      return item.id;
    });
  }
  function bombCreatures(
    bomb: Pick<
      import('../src/types/aircraft.ts').BombFlight,
      'attacker' | 'from' | 'x' | 'z' | 'halfWidth'
    > & { owner?: string | null },
  ) {
    // Query shared combat creatures only. Players, townspeople and personal
    // quest enemies never enter this collection; quest species are immune.
    const attacker = {
      id: bomb.attacker,
      owner: bomb.owner,
      x: bomb.from.x,
      y: bomb.from.y,
      z: bomb.from.z,
      weapon: 'bomb',
    };
    for (const cow of cows)
      if (monsterInBombArea(cow, bomb)) {
        const damage = Math.min(cow.hp, BOMB_DAMAGE);
        cow.hp -= damage;
        if (!cow.hp) {
          cow.respawn = MONSTER_STATS.cow.respawn;
          monsterDrops('cow', cow, bomb.owner);
        }
        broadcastHit(attacker, cow, damage, 'bomb');
      }
    const pilot = typeof bomb.attacker === 'number' ? players.get(bomb.attacker) : undefined;
    for (const actor of wilderness.actors)
      if (
        (!isYardFighter(actor.combatKind) || hasFighterYardPass(pilot)) &&
        monsterInBombArea(actor, bomb)
      )
        wilderness.damage(actor.id, BOMB_DAMAGE, attacker);
  }
  function snapshot(observer?: ServerPlayer) {
    const npcs = observer ? npcIndex.near(observer.x, observer.z, 38, 32) : npcList;
    const lootTime = now();
    return {
      clock,
      peptideSpawnAt: nextPeptideAt,
      wilderness: wilderness.snapshot().filter((n) => !observer || near(observer, n) < 45),
      cows: cows.map((c) => ({ ...c })),
      traffic: (geometry.streetTraffic?.cars || []).map(({ id, x, z, angle }) => ({
        id,
        x,
        z,
        angle,
      })),
      raptor: {
        id: raptor.id,
        x: raptor.x,
        z: raptor.z,
        hp: raptor.hp,
        max: MONSTER_STATS.raptor.hp,
        phase: raptor.phase,
        angle: raptor.angle,
        release: raptor.release,
        preyId: raptor.prey?.id ?? null,
      },
      tiger:
        observer && (!publicPlayer(observer) || !canSeeZooPursuit(observer, tiger.state))
          ? null
          : {
              ...tiger.state,
              targetId: tiger.dangerous ? (focus?.id ?? null) : null,
              elapsed: tiger.state.phase === 'caged' ? 0 : tiger.state.elapsed,
              tiger: { ...tiger.state.tiger, path: [], target: null },
              wardens: tiger.state.wardens.map((w) => ({ ...w, path: [], target: null })),
            },
      airship: airshipSnapshot(),
      loot: [...loot.values()]
        .filter(
          (item) =>
            !groundItemExpired(item, clock, lootTime) && (!observer || near(observer, item) < 45),
        )
        .slice(0, observer ? 64 : Infinity)
        .map((item) => {
          const { owner, ...visible } = item;
          return { ...visible, mine: !!observer && owner === observer.owner };
        }),
      npcs: npcs.map((n) => ({
        id: n.id,
        x: n.x,
        z: n.z,
        base: n.base,
        angle: n.angle,
        motion: n.motion || 0,
        phase: n.phase || 0,
        level: actorLevel(n),
        elapsed: n.elapsed,
        hold: n.hold || 0,
        showStartedAt: n.showStartedAt,
        bicycleTaken: n.rider ? (n.bicycleTakenUntil || 0) > now() : undefined,
        expeditionDead: !!n.expeditionDead,
      })),
    };
  }
  airshipRental.tick();
  return {
    command,
    dispatchSecuritiesInvestigator,
    tick,
    snapshot,
    leave,
    dropInventory,
    wilderness,
    bombCreatures,
    airship,
    passengers,
    canBuyGrapple: airshipRental.canBuyGrapple,
    raptor,
    cows,
    tiger,
    loot,
    npcById,
    get clock() {
      return clock;
    },
    persist: () => ({
      clock,
      lootSerial,
      wilderness: wilderness.snapshot().filter((n) => n.dispatchedFor === undefined),
      nextPeptideAt,
      tiger: tiger.snapshot(),
      airship: { ...airship.state },
      airshipLease: airshipRental.persist(),
      npcs: npcList.map((n) => ({
        id: n.id,
        layout: npcLayouts.get(n.id),
        x: n.x,
        z: n.z,
        angle: n.angle,
        phase: n.phase,
        elapsed: n.elapsed,
        hold: n.hold,
        motion: n.motion,
        pause: n.pause,
        routeIndex: n.routeIndex,
        expeditionDead: n.expeditionDead,
        recoverAt: n.recoverAt,
        showStartedAt: n.showStartedAt,
        ...(n.roam
          ? { roam: { index: n.roam.index, pause: n.roam.pause, stops: n.roam.stops } }
          : {}),
      })),
      loot: [...loot.values()],
      cows: cows.map((c) => ({ ...c })),
      traffic: (geometry.streetTraffic?.cars || []).map(({ id, x, z, angle }) => ({
        id,
        x,
        z,
        angle,
      })),
      raptor: {
        x: raptor.x,
        z: raptor.z,
        hp: raptor.hp,
        max: raptor.max,
        phase: raptor.phase,
        angle: raptor.angle,
        resetAt: raptor.resetAt,
        release: raptor.release,
      },
    }),
  };
}
