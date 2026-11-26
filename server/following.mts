import { contentText } from '../src/content-runtime.ts';
import { isFiniteNumber } from '../src/types/json.ts';
import type { Point } from '../src/types/geometry.ts';
import type { ActionReceipt } from '../src/types/world.ts';
import { GAMEPLAY } from '../src/config/gameplay.ts';
import {
  PLAYER_INTERACTION_RANGE,
  interiorNavigation,
  playerSegmentClear,
  playersWithinReach,
} from './player-proximity.mts';

interface PlayerApproach {
  error: (target: ServerPlayer | undefined) => string;
  arrive: (target: ServerPlayer) => ActionReceipt;
}
interface FollowState {
  target: number;
  attack: boolean;
  approach?: PlayerApproach;
  route: Point[];
  replan: number;
  goalX: number;
  goalZ: number;
  checked?: Point;
  checkedRevision?: number;
  orbitDirection?: number;
}
import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';
import { sameMapInstance } from '../src/map-instances.ts';
import { inFighterYard } from '../src/fighter-yard-layout.ts';
import { fighterYardMayEnter } from './fighter-yard.mts';
import { guildMayEnter } from './guild.mts';
const FOLLOW_SPEED = GAMEPLAY.walkSpeed,
  APPROACH_SPEED = FOLLOW_SPEED * 1.35,
  FOLLOW_RANGE = 1.2,
  ORBIT_RANGE = 2.2,
  ORBIT_MIN_RADIUS = 0.75,
  ORBIT_SPEED = 1.7,
  REPLAN_JUMP_DISTANCE = 8;
/** Routes and distance budgets belong to the fixed-step server. Neither
 * camera focus nor client pose packets advance a follower. */
export function createServerFollowing({
  players,
  geometry,
  routes,
  pvp,
  send,
  dirty,
  now = Date.now,
}: Pick<SimulationServices, 'players' | 'geometry' | 'routes' | 'pvp' | 'send' | 'dirty' | 'now'>) {
  const active = new Map<number, FollowState>();
  let elapsed = 0,
    cursor = 0;
  const pose = (p: ServerPlayer) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    angle: p.angle,
    phase: p.phase,
    motion: p.motion,
    moving: p.moving,
    mode: p.mode,
    hp: p.hp,
  });
  const available = (p: ServerPlayer) =>
    p &&
    p.transport.open &&
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.personalJailed &&
    !p.airship &&
    !p.grappling &&
    !p.parachute &&
    !p.bomberActive &&
    !p.tabletTeleport &&
    (p.instance?.kind || 'world') === 'world' &&
    (
      ['walk', 'dance', 'train', 'roll', 'sit'] satisfies [string, string, string, string, string]
    ).includes(p.mode);
  function stop(p: ServerPlayer, message = '') {
    const state = active.get(p.id);
    if (!state) return false;
    active.delete(p.id);
    p.following = null;
    p.moving = false;
    p.motion = 0;
    p.lastPoseAt = now();
    if (state.attack) pvp.stop(p);
    dirty(p);
    if (!state.approach) send(p, { type: 'following', target: null, position: pose(p), message });
    else if (message) send(p, { type: 'notice', message });
    return true;
  }
  function validate(
    p: ServerPlayer,
    target: ServerPlayer | undefined,
    attack = false,
    groundCache: Map<number, number> | null = null,
    continuing = false,
  ) {
    if (!available(p)) return 'Stand on the ground before following another player.';
    if (!target || target === p || !target.transport.open || !sameMapInstance(p, target))
      return 'That player is no longer nearby.';
    if (
      continuing &&
      !attack &&
      (!target.hp || target.respawnAllowed || target.tabletTeleport || target.personalJailed)
    )
      return '';
    if (!target.hp || target.respawnAllowed) return 'That player is no longer nearby.';
    let ground = groundCache?.get(target.id);
    if (ground === undefined) {
      ground = geometry.characterGround(target.x, target.z);
      groundCache?.set(target.id, ground);
    }
    if (
      !(
        [
          'walk',
          'bike',
          'motorcycle',
          'ferrari',
          'skateboard',
          'roll',
          'dance',
          'train',
          'sit',
        ] satisfies [string, string, string, string, string, string, string, string, string]
      ).includes(target.mode) ||
      Math.abs(target.y - ground) > 2.5
    )
      return 'You cannot follow them there.';
    if (attack && (!pvp.status(p).enabled || !pvp.status(target).enabled))
      return 'Both players must enable PvP.';
    return '';
  }
  function plan(
    p: ServerPlayer,
    target: { x: number; z: number },
    range: number,
    { perimeter = false, approach = false } = {},
  ) {
    const interior = interiorNavigation(p);
    const origin = { x: p.x - 0.5, y: p.z - 0.5 },
      radius = perimeter ? range - 0.2 : Math.min(0.9, range * 0.75),
      candidates = Array.from({ length: 12 }, (_, i) => ({
        x: target.x - 0.5 + Math.cos((i * Math.PI) / 6) * radius,
        y: target.z - 0.5 + Math.sin((i * Math.PI) / 6) * radius,
      }));
    if (!perimeter) candidates.push({ x: target.x - 0.5, y: target.z - 0.5 });
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y),
    );
    for (const goal of candidates) {
      if (interior ? !interior.free(goal.x, goal.y) : !geometry.landClearAt(goal.x, goal.y))
        continue;
      if (
        approach &&
        !playerSegmentClear(geometry, p, goal, { x: target.x - 0.5, y: target.z - 0.5 })
      )
        continue;
      const path = interior
        ? interior.path(origin, goal)
        : (routes || geometry).pathTo(goal.x, goal.y, origin, true);
      if (path) return path.map((p) => ({ ...p }));
    }
    return null;
  }
  function tooFar(p: ServerPlayer, target: ServerPlayer) {
    return Math.hypot(p.x - target.x, p.z - target.z) > GAMEPLAY.viewRadius;
  }
  function noRoute() {
    return {
      ok: false,
      message: contentText('world-message.server.following.no-walkable-route-to-that-player'),
    };
  }
  function begin(
    p: ServerPlayer,
    target: ServerPlayer,
    state: Pick<FollowState, 'attack' | 'route' | 'approach'>,
  ) {
    stop(p);
    pvp.stop(p);
    p.attack = null;
    p.following = null;
    p.mode = 'walk';
    active.set(p.id, {
      ...state,
      target: target.id,
      replan: elapsed + 0.5 + (p.id % 10) * 0.05,
      goalX: Math.floor(target.x * 4),
      goalZ: Math.floor(target.z * 4),
    });
    dirty(p);
  }
  function approach(p: ServerPlayer, target: ServerPlayer, interaction: PlayerApproach) {
    if (playersWithinReach(geometry, p, target)) return interaction.arrive(target);
    if (tooFar(p, target)) return { ok: false, message: 'That player is no longer nearby.' };
    const route = plan(p, target.seat?.exit ?? target, PLAYER_INTERACTION_RANGE, {
      approach: true,
    });
    if (!route?.length) return noRoute();
    begin(p, target, { attack: false, route, approach: interaction });
    return { ok: true };
  }
  function activate(p: ServerPlayer, target: ServerPlayer, attack: boolean, route: Point[] = []) {
    begin(p, target, { attack, route });
    p.following = target.id;
    send(p, { type: 'following', target: target.id, attack, position: pose(p) });
    return { ok: true, following: target.id };
  }
  function start(p: ServerPlayer, id: unknown, { attack = false } = {}) {
    const target = typeof id === 'number' ? players.get(id) : undefined;
    const error = validate(p, target, attack);
    if (error || !target) return { ok: false, message: error };
    if (tooFar(p, target))
      return {
        ok: false,
        message: contentText(
          'world-message.server.following.that-player-is-too-far-away-to-follow',
        ),
      };
    if (!attack)
      return approach(p, target, {
        error: (next) => validate(p, next, false, null),
        arrive: (next) => activate(p, next, false),
      });
    const range = pvp.rangeFor(p);
    const route = Math.hypot(p.x - target.x, p.z - target.z) > range ? plan(p, target, range) : [];
    return route ? activate(p, target, true, route) : noRoute();
  }
  function orbit(a: ServerPlayer, b: ServerPlayer, state: FollowState, dt: number) {
    const centerX = (a.x + b.x) / 2;
    const centerZ = (a.z + b.z) / 2;
    const radius = Math.hypot(a.x - centerX, a.z - centerZ);
    const angle = radius > 1e-6 ? Math.atan2(a.z - centerZ, a.x - centerX) : a.angle;
    const nextRadius = Math.max(
      radius,
      Math.min(ORBIT_MIN_RADIUS, radius + (FOLLOW_SPEED * dt) / 2),
    );
    const preferred = state.orbitDirection ?? 1;
    for (const direction of [preferred, -preferred]) {
      const nextAngle = angle + direction * ORBIT_SPEED * dt;
      const dx = nextRadius * Math.cos(nextAngle);
      const dz = nextRadius * Math.sin(nextAngle);
      const steps = [a, b].map((p, i) => {
        const sign = i === 0 ? 1 : -1;
        const x = centerX + sign * dx;
        const z = centerZ + sign * dz;
        return { p, x, z, y: geometry.characterGround(x, z) };
      });
      if (
        !steps.every(
          ({ p, x, y, z }) =>
            geometry.landClearAt(x - 0.5, z - 0.5) &&
            geometry.canTravel!(p.x - 0.5, p.z - 0.5, x - 0.5, z - 0.5, true) &&
            (inFighterYard(p.x, p.z) || fighterYardMayEnter(p, x, z)) &&
            guildMayEnter(p, geometry, x, y, z),
        )
      )
        continue;

      state.orbitDirection = direction;
      for (const { p, x, y, z } of steps) {
        const dx = x - p.x;
        const dz = z - p.z;
        const distance = Math.hypot(dx, dz);
        Object.assign(p, {
          x,
          y,
          z,
          angle: Math.atan2(dz, dx),
          mode: 'walk',
          moving: true,
          motion: 1,
          phase: p.phase + distance * Math.PI,
          lastPoseAt: now(),
        });
        dirty(p);
      }
      return;
    }
    for (const p of [a, b]) {
      p.moving = false;
      p.motion = 0;
    }
  }
  function tick(dt: unknown) {
    if (!isFiniteNumber(dt) || dt <= 0) return;
    elapsed += dt;
    const groundCache = new Map<number, number>();
    const ids = [...active.keys()];
    const orbited = new Set<number>();
    let nextCursor = cursor;
    for (let i = 0; i < ids.length; i++) {
      const index = (cursor + i) % ids.length,
        id = ids[index],
        state = active.get(id);
      if (!state || orbited.has(id)) continue;
      const p = players.get(id),
        target = players.get(state.target);
      if (!p) {
        active.delete(id);
        continue;
      }
      const approach = state.approach;
      const error = approach
        ? approach.error(target)
        : validate(p, target, state.attack, groundCache, true);
      if (
        error ||
        !target ||
        (approach && tooFar(p, target)) ||
        (state.attack && Math.hypot(p.x - target.x, p.z - target.z) > 80)
      ) {
        stop(p, error || 'That player is no longer nearby.');
        continue;
      }
      if (approach && playersWithinReach(geometry, p, target)) {
        stop(p);
        const result = approach.arrive(target);
        if (!result.ok && result.message) send(p, { type: 'notice', message: result.message });
        continue;
      }
      const reciprocal = active.get(target.id);
      if (
        !state.attack &&
        reciprocal &&
        !reciprocal.attack &&
        reciprocal.target === id &&
        available(target) &&
        Math.hypot(p.x - target.x, p.z - target.z) <= ORBIT_RANGE
      ) {
        orbited.add(target.id);
        state.route = [];
        reciprocal.route = [];
        state.replan = reciprocal.replan = elapsed;
        if (id < target.id) orbit(p, target, state, dt);
        else orbit(target, p, reciprocal, dt);
        continue;
      }
      // The detention cell is fenced off. Follow the detainee to the
      // perimeter and resume following their position when they leave.
      const jail =
        !state.attack && target.personalJailed && geometry.detention?.walkable(target.x, target.z)
          ? geometry.detention
          : null;
      const destination =
        jail ?? target.tabletTeleport?.to ?? (approach ? target.seat?.exit : null) ?? target;
      const range = jail
          ? Math.max(jail.w, jail.d) / 2 + 0.8
          : approach
            ? PLAYER_INTERACTION_RANGE
            : state.attack
              ? pvp.rangeFor(p)
              : FOLLOW_RANGE,
        distance = Math.hypot(destination.x - p.x, destination.z - p.z),
        clear =
          !state.attack ||
          distance > range ||
          !geometry.lineClear ||
          geometry.lineClear({ ...p, base: p.y }, { ...target, base: target.y });
      if (!approach && distance <= range && (!state.attack || clear)) {
        p.moving = false;
        p.motion = 0;
        state.route = [];
        if (state.attack && p.pvpTarget !== target.id) pvp.attack(p, target.id);
        continue;
      }
      if (state.attack) pvp.stop(p);
      const gx = Math.floor(destination.x * 4),
        gz = Math.floor(destination.z * 4);
      // A clear straight approach can track a walking player every tick.
      // Reuse the normal route planner when a wall or other obstacle intervenes.
      const direct = { x: destination.x - 0.5, y: destination.z - 0.5 };
      const tracksDirectly =
        !state.attack &&
        destination === target &&
        target.moving &&
        distance <= GAMEPLAY.viewRadius &&
        playerSegmentClear(geometry, p, { x: p.x - 0.5, y: p.z - 0.5 }, direct);
      if (tracksDirectly) {
        state.route = [direct];
        state.checked = direct;
        state.checkedRevision = geometry.navigationRevision;
      }
      if (
        !tracksDirectly &&
        !state.attack &&
        Math.hypot(gx - state.goalX, gz - state.goalZ) > REPLAN_JUMP_DISTANCE * 4
      ) {
        state.route = [];
        state.replan = elapsed;
      }
      if (
        !tracksDirectly &&
        elapsed >= state.replan &&
        (gx !== state.goalX || gz !== state.goalZ || !state.route.length) &&
        (!routes || routes.allowReplan())
      ) {
        nextCursor = (index + 1) % ids.length;
        const route = plan(p, destination, range, { perimeter: !!jail, approach: !!approach });
        state.replan = elapsed + (route ? 0.5 : 2);
        state.goalX = gx;
        state.goalZ = gz;
        if (route && (!approach || route.length)) state.route = route;
        else if ((approach || state.attack) && !state.route.length) {
          stop(p, 'No walkable route to that player.');
          continue;
        }
      }
      const interior = interiorNavigation(p);
      let budget = (state.attack || jail ? FOLLOW_SPEED : APPROACH_SPEED) * dt,
        traveled = 0;
      while (budget > 1e-8 && state.route.length) {
        const next = state.route[0],
          from = { x: p.x - 0.5, y: p.z - 0.5 },
          dx = next.x - from.x,
          dz = next.y - from.y,
          length = Math.hypot(dx, dz);
        if (length < 1e-8) {
          state.route.shift();
          continue;
        }
        const step = Math.min(budget, length),
          x = p.x + (dx / length) * step,
          z = p.z + (dz / length) * step,
          y = interior ? p.y : geometry.characterGround(x, z);
        // The tile map is immutable during play. Validate a new route edge
        // once, then consume its distance on subsequent ticks. A map
        // revision invalidates the cache if dynamic terrain is added.
        if (state.checked !== next || state.checkedRevision !== geometry.navigationRevision) {
          if (!playerSegmentClear(geometry, p, from, next)) {
            stop(p, 'That route is blocked.');
            break;
          }
          state.checked = next;
          state.checkedRevision = geometry.navigationRevision;
        }
        if (!interior && !inFighterYard(p.x, p.z) && !fighterYardMayEnter(p, x, z)) {
          stop(p, contentText('world-message.fighter-yard.admission-required'));
          break;
        }
        if (!interior && !guildMayEnter(p, geometry, x, y, z)) {
          stop(p, 'The guild admits members only.');
          break;
        }
        Object.assign(p, {
          x,
          y,
          z,
          angle: Math.atan2(dz, dx),
          mode: 'walk',
          moving: true,
          motion: 1,
          lastPoseAt: now(),
        });
        traveled += step;
        budget -= step;
        if (length <= step + 1e-8) state.route.shift();
        if (
          approach
            ? playersWithinReach(geometry, p, target)
            : Math.hypot(destination.x - p.x, destination.z - p.z) <= range
        )
          break;
      }
      if (!active.has(id)) continue;
      p.moving = traveled > 0;
      p.motion = p.moving ? 1 : 0;
      p.phase += traveled * Math.PI;
      if (traveled) dirty(p);
    }
    cursor = nextCursor;
  }
  return {
    start,
    approach,
    stop,
    cancelApproach(p: ServerPlayer) {
      if (active.get(p.id)?.approach) stop(p);
    },
    tick,
    active,
    owns: (p: Pick<ServerPlayer, 'id'>) => active.has(p.id),
    clear(p: ServerPlayer) {
      stop(p);
    },
  };
}
