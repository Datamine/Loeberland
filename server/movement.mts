import { LAB_FLOOR, LAB_INSTANCE, LAB_NAV, labSegment } from '../src/berkeley-lab.ts';
import { contentText } from '../src/content-runtime.ts';
import { hasPhysicalBounds } from '../src/picking.ts';
import { isFiniteNumber, isRecord } from '../src/types/json.ts';
import type { MovementRuntime } from '../src/types/movement.ts';
import type { Point } from '../src/types/geometry.ts';

import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';

import { nearestMinimapPoint } from '../src/minimap-navigation.ts';
import { GAMEPLAY } from '../src/config/gameplay.ts';
import { CAVE_NAVIGATION, ILLUMINATI_CAVE, ILLUMINATI_INSTANCE } from '../src/map-instances.ts';
import { inFighterYard } from '../src/fighter-yard-layout.ts';
import { fighterYardMayEnter } from './fighter-yard.mts';
import { guildMayEnter } from './guild.mts';
import { createStealthBomber, bomberCruiseHeight } from '../src/stealth-bomber.ts';
import { createFerrari } from '../src/ferrari.ts';
import { createFerrariCityRoads } from '../src/ferrari-roads.ts';
import { createRocketTravel, rocketCruiseSpeed } from '../src/rocket.ts';
import { createTahoe } from '../src/tahoe.ts';
import { SF_SPACEPORT } from '../src/southern-district.ts';
import { SF_FITNESS } from '../src/southern-layout.ts';
import { createSutroClimb } from '../src/sutro.ts';
import { CHARACTER_CLIPS } from '../src/characters.ts';
import { createSurfing } from '../src/surfing.ts';
import { createWindsurfing } from '../src/windsurfing.ts';
import { createWhales, WHALE_JUMP_LEAD_MS } from '../src/wildlife.ts';
import { nearbyServiceNPC } from '../src/interaction-access.ts';
import { FORWARD_ROLL_DURATION } from '../src/forward-roll.ts';
import { combatApproach, type CombatPoint } from '../src/combat-navigation.ts';
import { houseClimb } from '../src/search-houses.ts';
import {
  marketStreetcarPose,
  marketStreetcarRider,
  STREETCAR_BOARD_RANGE,
} from '../src/market-streetcar.ts';
import { ATV_RENTAL, ATV_SPEED, rampRise } from '../src/atv.ts';
import { MOTORCYCLE_SPEED, MOTORCYCLE_TRICKS } from '../src/motorcycle.ts';
import { SWING_RANGE, swingAngle, swingRiderGround } from '../src/swings.ts';
import { WAYMO_RENTAL } from '../src/waymo-rental.ts';
import { createWaymoRental } from './waymo.mts';
import {
  chairForGesture,
  FACTORY_CHAIRS,
  goblinRampLane,
  goblinRoofAt,
  GOBLIN_HUTS,
} from '../src/goblin-town.ts';
import { MUD_BATH } from '../src/goblin-space-layout.ts';

const json = (value: string | undefined): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
/** User destinations enter here. Routes, distance budgets, fuel, elevation and
 * vehicle clocks never come from a browser pose or browser elapsed time. */
const interiorNavigation = (p: ServerPlayer) =>
  p.instance?.kind === ILLUMINATI_INSTANCE.kind
    ? CAVE_NAVIGATION
    : p.instance?.kind === LAB_INSTANCE.kind
      ? LAB_NAV
      : null;

export function createServerMovement({
  geometry,
  routes,
  players,
  send,
  dirty,
  now,
  following,
  clock = () => 0,
}: Pick<
  SimulationServices,
  'geometry' | 'routes' | 'players' | 'send' | 'dirty' | 'now' | 'following'
> & { clock?: () => number }) {
  const active = new Map<number, MovementRuntime>();
  const waymo = createWaymoRental({ geometry, routes, now, send, dirty, following }, stop);
  const position = (p: ServerPlayer) => ({
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
  function state(p: ServerPlayer) {
    let s = active.get(p.id);
    if (!s) {
      const bomber = createStealthBomber({
        ground: geometry.characterGround,
        now,
        cruiseHeight: () => bomberCruiseHeight(geometry.airship?.cruiseHeight),
        boostSpeed: () =>
          geometry.tahoe?.spaceport
            ? rocketCruiseSpeed(SF_SPACEPORT, geometry.tahoe.spaceport)
            : 140,
      });
      const ferrari = geometry.regionalRoad
        ? createFerrari(
            geometry.regionalRoad,
            json(p.profile.privateState['sf-ferrari-v1']),
            (v) => {
              p.profile.privateState['sf-ferrari-v1'] = JSON.stringify(v);
              dirty(p);
            },
            {
              cityDriving: createFerrariCityRoads({
                road: geometry.regionalRoad,
                traffic: () => geometry.streetTraffic || { nodes: [], edges: [] },
                ground: geometry.characterGround,
              }),
            },
          )
        : null;
      s = {
        route: [],
        mode: 'walk',
        speed: 0,
        boost: false,
        bomber,
        ferrari,
        rocket: createRocketTravel({ groundHeight: geometry.characterGround }),
        tahoeValue: null,
        get tahoe() {
          return (this.tahoeValue ??= createTahoe());
        },
        sutro: createSutroClimb(),
        checked: null,
        wave: createSurfing({
          water: (x: number, z: number) => !!geometry.surf?.water(x, z),
          segment: (a, b) =>
            !!geometry.surf?.segment(
              { x: a.x - 0.5, y: a.z - 0.5 },
              { x: b.x - 0.5, y: b.z - 0.5 },
            ),
        }),
        windsurf: createWindsurfing({
          scale: 1.5,
          isSea: (x: number, z: number) => !!geometry.surf?.water(x, z),
        }),
        whales: createWhales(),
      };
      active.set(p.id, s);
    }
    return s;
  }
  const available = (p: ServerPlayer) =>
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.detainAt &&
    !p.airship &&
    !p.grappling &&
    !p.parachute &&
    !p.tabletTeleport &&
    !p.depotLaunch;
  function park(p: ServerPlayer, s: MovementRuntime) {
    if (s.mode === 'bike') p.profile.bicycle = { x: p.x - 0.5, y: p.z - 0.5 };
    if (s.mode === 'motorcycle') {
      p.profile.privateState['sf-motorcycle-v1'] = JSON.stringify({
        ...json(p.profile.privateState['sf-motorcycle-v1']),
        x: p.x - 0.5,
        y: p.z - 0.5,
        angle: p.angle,
      });
      if (MOTORCYCLE_TRICKS.some((trick) => trick.id === p.gesture)) {
        p.gesture = '';
        p.gestureUntil = 0;
      }
    }
    if (s.ferrari?.state.riding) s.ferrari.park();
    s.atv = undefined;
  }
  function stop(p: ServerPlayer) {
    const s = state(p);
    s.route = [];
    if (s.atv) s.atv.ramp = undefined;
    s.combatTarget = undefined;
    s.queuedWalk = undefined;
    s.speed = 0;
    p.moving = false;
    p.motion = 0;
    if (s.bomber.state.active) s.bomber.state.target = null;
    if (s.ferrari?.state.riding) s.ferrari.state.target = null;
  }
  function leaveSeat(p: ServerPlayer) {
    if (p.seatedRecoverySeconds) p.seatedRecoverySeconds = 0;
    if (!p.seat) return;
    const exit = p.seat.exit;
    Object.assign(p, { x: exit.x, z: exit.z, y: geometry.characterGround(exit.x, exit.z) });
    if (p.mode === 'swing') p.phase = 0;
    p.seat = null;
  }
  function leaveConstruction(p: ServerPlayer) {
    if (!p.constructing) return;
    delete p.constructing;
    const s = state(p);
    if (s.mode === 'construction') s.mode = 'walk';
    if (p.mode === 'construction') p.mode = 'walk';
    dirty(p);
  }
  function wake(p: ServerPlayer) {
    leaveConstruction(p);
    const s = state(p);
    if (['sit', 'bench', 'dance', 'swing'].includes(s.mode)) {
      leaveSeat(p);
      s.mode = 'walk';
      p.mode = 'walk';
      if (chairForGesture(p.gesture)) p.gesture = '';
    }
  }
  function leaveTraining(p: ServerPlayer) {
    if (!p.training) return;
    p.training = false;
    if (
      (['bench', 'curl', 'squat', 'press'] satisfies [string, string, string, string]).includes(
        p.gesture,
      )
    )
      p.gesture = '';
    const entry = SF_FITNESS.entry;
    Object.assign(p, {
      x: entry.x + 0.5,
      z: entry.y + 0.5,
      y: geometry.characterGround(entry.x + 0.5, entry.y + 0.5),
      mode: 'walk',
      moving: false,
      motion: 0,
    });
    const s = state(p);
    s.mode = 'walk';
    s.route = [];
    dirty(p);
  }
  function move(p: ServerPlayer, args: { x?: unknown; z?: unknown }) {
    if (p.mode === 'streetcar') return { ok: false };
    if ((p.boundUntil || 0) > now())
      return { ok: false, message: contentText('world-message.bind-tablet.immobile') };
    const { x, z } = args;
    if (!isFiniteNumber(x) || !isFiniteNumber(z) || Math.abs(x) > 5000 || Math.abs(z) > 5000)
      return {
        ok: false,
        message: contentText('world-message.server.movement.invalid-destination'),
      };
    const s = state(p);
    if (s.houseClimb) return { ok: false };
    if ((p.instance?.kind || 'world') === 'world' && !fighterYardMayEnter(p, x, z))
      return { ok: false, message: contentText('world-message.fighter-yard.admission-required') };
    if (!p.hp || p.respawnAllowed || p.airship || p.grappling || p.instance?.kind === 'kraken')
      return { ok: false };
    if (p.detainAt && !geometry.detention?.walkable(x, z)) return { ok: false };
    if (
      p.detainAt ||
      p.tabletTeleport ||
      p.parachute ||
      s.rocket.state.active ||
      s.tahoeValue?.state.mode === 'gondola'
    ) {
      s.queuedWalk = { x, z };
      return { ok: true, goal: { x, z } };
    }
    s.queuedWalk = undefined;
    s.combatTarget = undefined;
    leaveTraining(p);
    leaveConstruction(p);
    following.stop(p);
    p.training = false;
    p.personalBattle = null;
    p.attack = null;
    if (p.bomberActive) {
      if (!s.bomber.state.active) s.bomber.board(position(p));
      return { ok: s.bomber.target(x, z) };
    }
    if (s.sutro.state.active)
      return s.sutro.state.phase === 'top'
        ? {
            ok: false,
            message: contentText('world-message.server.movement.use-the-ladder-to-climb-down'),
          }
        : { ok: false };
    if (s.tahoeValue?.state.mode === 'ski') return { ok: s.tahoe.steerTo(x, z) };
    if (s.ferrari?.state.riding) {
      const ok = s.ferrari.driveTo(x, z),
        goal = s.ferrari.state.destination;
      return { ok, ...(ok ? { goal: { x: goal!.x, z: goal!.z } } : {}) };
    }
    if (s.wave.state.ride) return { ok: s.wave.steer(x, z) };
    if (s.atv) {
      if (s.atv.donut) return { ok: false };
      const to = { x, z };
      if (!geometry.marinLand?.onLand(x, z))
        return {
          ok: false,
          message: contentText('world-message.server.movement.keep-the-atv-on-marin-land'),
        };
      const route = atvSegment(p, to)
        ? [{ x: x - 0.5, y: z - 0.5 }]
        : geometry.marinLand.path(
            { x: p.x - 0.5, y: p.z - 0.5 },
            { x: x - 0.5, y: z - 0.5 },
            () => null,
          );
      if (!route)
        return {
          ok: false,
          message: contentText('world-message.server.movement.the-atv-needs-a-clear-route'),
        };
      s.atv.ramp = undefined;
      beginRoute(p, s, route, to);
      return { ok: true, goal: to };
    }
    if (p.seat) wake(p);
    const from = { x: p.x - 0.5, y: p.z - 0.5 },
      to = { x: x - 0.5, y: z - 0.5 },
      interior = interiorNavigation(p);
    if (
      s.route.length &&
      p.moveGoal?.x === x &&
      p.moveGoal?.z === z &&
      s.routeRevision === geometry.navigationRevision
    )
      return { ok: true, goal: { x, z } };
    const path = (goal: Point) =>
      p.personalJailed
        ? geometry.detention?.path(from, goal)
        : interior
          ? interior.path(from, goal)
          : s.mode === 'surf'
            ? geometry.surf?.path(from, goal)
            : routes
              ? routes.pathTo(goal.x, goal.y, from, true)
              : geometry.pathTo(goal.x, goal.y, from, true);
    let route = path(to),
      goal = { x, z };
    if (!route) {
      const snapped = nearestMinimapPoint(from, to, {
        step: 0.5,
        offset: 0,
        eligible: (point: { x: number; y: number }) =>
          p.personalJailed
            ? geometry.detention!.walkable(point.x + 0.5, point.y + 0.5)
            : interior
              ? interior.free(point.x, point.y)
              : s.mode === 'surf'
                ? !!geometry.surf?.water(point.x + 0.5, point.y + 0.5)
                : geometry.landClearAt(point.x, point.y),
        reachable: (point) => {
          const found = path(point);
          return (
            !!found &&
            (p.personalJailed ||
              !!interior ||
              found.every((n) =>
                guildMayEnter(
                  p,
                  geometry,
                  n.x + 0.5,
                  geometry.characterGround(n.x + 0.5, n.y + 0.5),
                  n.y + 0.5,
                ),
              ))
          );
        },
      });
      if (snapped) {
        route = path(snapped);
        goal = { x: snapped.x + 0.5, z: snapped.y + 0.5 };
      }
    }
    if (!route) {
      stop(p);
      return {
        ok: false,
        message: contentText('world-message.server.movement.there-is-no-reachable-ground-nearby'),
      };
    }
    if (
      !p.personalJailed &&
      !interior &&
      s.mode !== 'surf' &&
      route.some(
        (n) =>
          !guildMayEnter(
            p,
            geometry,
            n.x + 0.5,
            geometry.characterGround(n.x + 0.5, n.y + 0.5),
            n.y + 0.5,
          ),
      )
    )
      return {
        ok: false,
        message: contentText('world-message.server.movement.the-guild-admits-members-only'),
      };
    beginRoute(p, s, route, goal);
    return { ok: true, goal };
  }
  function beginRoute(
    p: ServerPlayer,
    s: MovementRuntime,
    route: Point[],
    goal: { x: number; z: number },
  ) {
    wake(p);
    s.route = route.map((n) => ({ ...n }));
    s.routeRevision = geometry.navigationRevision;
    s.checked = null;
    p.moveGoal = goal;
    p.mode = s.mode;
    p.moving = !!route.length;
    dirty(p);
  }
  function stopCombatRoute(p: ServerPlayer) {
    if (state(p).combatTarget) stop(p);
  }
  function approachCombat(p: ServerPlayer, target: CombatPoint, range: number) {
    const s = state(p);
    if (
      (p.boundUntil || 0) > now() ||
      !available(p) ||
      p.bomberActive ||
      s.ferrari?.state.riding ||
      s.rocket.state.active ||
      s.sutro.state.active ||
      (s.tahoeValue && s.tahoeValue.state.mode !== 'ground') ||
      s.mode === 'surf'
    )
      return false;
    if (
      s.combatTarget &&
      s.route.length &&
      s.routeRevision === geometry.navigationRevision &&
      Math.hypot(s.combatTarget.x - target.x, s.combatTarget.z - target.z) < 0.4
    )
      return true;
    const from = { x: p.x - 0.5, y: p.z - 0.5 };
    let route: Point[] | null = null;
    const lab = p.instance?.kind === LAB_INSTANCE.kind;
    const canTravel: NonNullable<typeof geometry.canTravel> = lab
      ? (ax, ay, bx, by) => LAB_NAV.segment({ x: ax, y: ay }, { x: bx, y: by })
      : geometry.canTravel!;
    const goal = combatApproach({
      from,
      target,
      range,
      free: lab ? LAB_NAV.free : geometry.landClearAt,
      ground: lab ? () => LAB_FLOOR + 0.025 : geometry.characterGround,
      lineClear: lab ? labSegment : (geometry.lineClear ?? (() => true)),
      canTravel,
      pathTo: (x, y, start) => {
        const candidate = lab
          ? LAB_NAV.path(start, { x, y })
          : routes
            ? routes.pathTo(x, y, start, true)
            : geometry.pathTo(x, y, start, true);
        if (
          !candidate?.length ||
          !canTravel(start.x, start.y, candidate[0].x, candidate[0].y, true) ||
          (!lab &&
            candidate.some(
              (n) =>
                !guildMayEnter(
                  p,
                  geometry,
                  n.x + 0.5,
                  geometry.characterGround(n.x + 0.5, n.y + 0.5),
                  n.y + 0.5,
                ),
            ))
        )
          return null;
        route = candidate;
        return route;
      },
    });
    if (!goal || !route) return false;
    park(p, s);
    s.mode = 'walk';
    beginRoute(p, s, route, { x: goal.x + 0.5, z: goal.y + 0.5 });
    s.combatTarget = { x: target.x, z: target.z };
    return true;
  }
  const atvExpiry = (p: ServerPlayer) =>
    Number(p.profile.playerState.activities.atvRentalUntil) || 0;
  const atvGround = (x: number, z: number) => {
    const hut = goblinRoofAt(x, z);
    return geometry.characterGround(x, z) + (hut ? rampRise(z, hut.z) : 0);
  };
  function atvSegment(from: { x: number; z: number }, to: { x: number; z: number }) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15));
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const z = from.z + ((to.z - from.z) * i) / steps;
      if (
        !geometry.marinLand?.onLand(x, z) ||
        (!goblinRoofAt(x, z) && !geometry.landClearAt(x - 0.5, z - 0.5))
      )
        return false;
    }
    return true;
  }
  function atvLanding(p: ServerPlayer) {
    const landing = geometry.landClearAt(p.x - 0.5, p.z - 0.5)
      ? p
      : geometry.nearestGround?.(p.x, p.z) || ATV_RENTAL.parking;
    return { x: landing.x, z: landing.z, y: geometry.characterGround(landing.x, landing.z) };
  }
  function dismountATV(p: ServerPlayer, s: MovementRuntime) {
    Object.assign(p, {
      ...atvLanding(p),
      mode: 'walk',
      gesture: '',
      phase: 0,
    });
    s.atv = undefined;
    s.mode = 'walk';
    stop(p);
    dirty(p);
  }
  function atvAction(p: ServerPlayer, s: MovementRuntime, args: Record<string, unknown>) {
    if (s.houseClimb) return { ok: false };
    if (args.kind === 'atvRent') {
      if (
        p.mode !== 'walk' ||
        s.atv ||
        !geometry.marinLand ||
        !nearbyServiceNPC(geometry, p, (n) => n.id === ATV_RENTAL.npcId)
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.movement.speak-to-the-industrious-goblin-on-foot',
          ),
        };
      const minutes = args.minutes;
      if (minutes !== 1 && minutes !== 10) return { ok: false };
      if (atvExpiry(p) > now())
        return {
          ok: false,
          message: contentText('world-message.server.movement.atv-rental-still-active'),
        };
      const price = ATV_RENTAL.prices[minutes];
      if (p.inventory.economy.state.coins < price)
        return {
          ok: false,
          message: contentText('world-message.server.movement.you-need-coins', {
            price: String(price),
          }),
        };
      p.inventory.economy.state.coins -= price;
      p.profile.playerState.activities.atvRentalUntil = now() + minutes * 60_000;
      p.inventory.save();
      return {
        ok: true,
        inventory: p.inventory.snapshot(),
        message: contentText('world-message.server.movement.atv-rental-ready'),
      };
    }
    if (args.kind === 'atvMount') {
      if (atvExpiry(p) <= now())
        return {
          ok: false,
          message: contentText('world-message.server.movement.rent-an-atv-first'),
        };
      const { x, z } = ATV_RENTAL.parking;
      const y = geometry.characterGround(x, z);
      if (
        p.mode !== 'walk' ||
        s.atv ||
        !geometry.marinLand ||
        Math.hypot(p.x - x, p.z - z) > ATV_RENTAL.mountRange ||
        Math.abs(p.y - y) > 1.25
      )
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-up-to-the-parked-atv'),
        };
      following.stop(p);
      p.attack = null;
      p.personalBattle = null;
      stop(p);
      Object.assign(p, { x, z, y, mode: 'atv', angle: Math.PI });
      s.mode = 'atv';
      s.atv = { air: null, donut: null, takeoffAngle: p.angle };
      dirty(p);
      return {
        ok: true,
        message: contentText(
          'world-message.server.movement.click-to-drive-right-click-for-the-roof-jump-donuts-and-air-tr',
        ),
      };
    }
    const atv = s.atv;
    if (!atv || atvExpiry(p) <= now()) return { ok: false };
    if (args.kind === 'atvDismount') {
      if (atv.air)
        return {
          ok: false,
          message: contentText('world-message.server.movement.land-before-dismounting'),
        };
      dismountATV(p, s);
      return { ok: true };
    }
    if (args.kind === 'atvTrick') {
      if (!atv.air || atv.air.trick || (args.trick !== 'roll' && args.trick !== 'spin'))
        return { ok: false };
      atv.air.trick = args.trick;
      atv.air.trickAt = atv.air.elapsed;
      return { ok: true };
    }
    if (atv.air || atv.donut) return { ok: false };
    if (args.kind === 'atvJump') {
      const hut =
        args.id === undefined ? GOBLIN_HUTS[0] : GOBLIN_HUTS.find((h) => h.id === args.id);
      if (!hut) return { ok: false };
      const { x, start, end } = goblinRampLane(hut);
      const entry = { x, z: start };
      const route = atvSegment(p, entry)
        ? [{ x: x - 0.5, y: start - 0.5 }]
        : geometry.marinLand?.path(
            { x: p.x - 0.5, y: p.z - 0.5 },
            { x: x - 0.5, y: start - 0.5 },
            () => null,
          );
      if (!route || !atvSegment(entry, { x, z: end }))
        return {
          ok: false,
          message: contentText(
            'world-message.server.movement.drive-closer-to-the-goblin-village-ramps',
          ),
        };
      atv.ramp = hut.id;
      beginRoute(p, s, [...route, { x: x - 0.5, y: end - 0.5 }], { x, z: end });
      return { ok: true };
    }
    if (args.kind === 'atvDonut') {
      const radius = 0.86,
        start = p.angle - Math.PI / 2;
      const center = { x: p.x - Math.cos(start) * radius, z: p.z - Math.sin(start) * radius };
      for (let i = 0; i < 20; i++) {
        const a = start + (i * Math.PI) / 10;
        const x = center.x + Math.cos(a) * radius,
          z = center.z + Math.sin(a) * radius;
        if (!geometry.landClearAt(x - 0.5, z - 0.5) || goblinRoofAt(x, z))
          return {
            ok: false,
            message: contentText(
              'world-message.server.movement.find-an-open-patch-of-ground-for-a-donut',
            ),
          };
      }
      s.route = [];
      atv.ramp = undefined;
      atv.donut = { center, start, elapsed: 0 };
      return { ok: true };
    }
    return { ok: false };
  }
  function tickATV(p: ServerPlayer, s: MovementRuntime, dt: number) {
    const atv = s.atv!;
    const expired = atvExpiry(p) <= now();
    if (expired && !atv.air) {
      dismountATV(p, s);
      send(p, {
        type: 'notice',
        message: contentText('world-message.server.movement.your-atv-rental-has-expired'),
      });
      return;
    }
    p.mode = 'atv';
    p.gesture = atv.air ? (atv.air.trick ? 'atv-trick' : 'atv-air') : atv.donut ? 'atv-donut' : '';
    p.gestureUntil = 0;
    p.phase = 0;
    p.moving = false;
    if (atv.donut) {
      const donut = atv.donut;
      donut.elapsed = Math.min(1, donut.elapsed + dt / 1.15);
      const a = donut.start + donut.elapsed * Math.PI * 2;
      p.x = donut.center.x + Math.cos(a) * 0.86;
      p.z = donut.center.z + Math.sin(a) * 0.86;
      p.angle = a + Math.PI * 0.63;
      p.phase = -0.25 * Math.sin(Math.PI * donut.elapsed);
      p.y = atvGround(p.x, p.z);
      p.moving = donut.elapsed < 1;
      if (!p.moving) {
        atv.donut = null;
        p.angle = donut.start + Math.PI / 2;
      }
    } else if (atv.air) {
      const air = atv.air;
      air.elapsed += dt;
      const x = p.x + Math.cos(atv.takeoffAngle) * ATV_SPEED * dt;
      const z = p.z + Math.sin(atv.takeoffAngle) * ATV_SPEED * dt;
      if (atvSegment(p, { x, z })) Object.assign(p, { x, z });
      const ground = atvGround(p.x, p.z);
      p.y += air.velocity * dt - 8.5 * dt * dt;
      air.velocity -= 17 * dt;
      p.moving = true;
      const trickAngle = air.trick
        ? Math.min(1, (air.elapsed - (air.trickAt || 0)) / 0.34) * Math.PI * 2
        : 0;
      p.phase = air.trick === 'roll' ? trickAngle : 0;
      p.angle = atv.takeoffAngle + (air.trick === 'spin' ? trickAngle : 0);
      if (p.y <= ground && air.velocity <= 0) {
        p.y = ground;
        p.angle = atv.takeoffAngle;
        p.phase = 0;
        atv.air = null;
        p.gesture = '';
        const aim = s.route[0];
        if (
          aim &&
          (aim.x + 0.5 - p.x) * Math.cos(p.angle) + (aim.y + 0.5 - p.z) * Math.sin(p.angle) <= 0
        )
          s.route.shift();
      }
    } else {
      let budget = ATV_SPEED * dt;
      while (budget > 1e-8 && s.route.length) {
        const aim = s.route[0];
        const dx = aim.x + 0.5 - p.x,
          dz = aim.y + 0.5 - p.z;
        const distance = Math.hypot(dx, dz),
          step = Math.min(distance, budget);
        if (distance < 1e-8) {
          s.route.shift();
          continue;
        }
        const x = p.x + (step * dx) / distance,
          z = p.z + (step * dz) / distance;
        if (!atvSegment(p, { x, z })) {
          s.route = [];
          break;
        }
        const hut = goblinRoofAt(x, z);
        const crest =
          hut &&
          (!atv.ramp || (atv.ramp === hut.id && s.route.length === 1)) &&
          Math.abs(dz) > distance * 0.4 &&
          (p.z - hut.z) * dz < 0 &&
          (z - hut.z) * dz >= 0;
        p.angle = Math.atan2(dz, dx);
        p.moving = true;
        Object.assign(p, { x, z, y: atvGround(x, z) });
        if (step >= distance) s.route.shift();
        if (crest) {
          atv.takeoffAngle = p.angle;
          atv.air = { velocity: 3.8, elapsed: 0 };
          p.gesture = 'atv-air';
          break;
        }
        budget -= step;
      }
    }
    if (!s.route.length) atv.ramp = undefined;
    p.motion = p.moving ? 1 : 0;
    dirty(p);
  }
  function activity(p: ServerPlayer, args: Record<string, unknown>) {
    const s = state(p);
    if (s.houseClimb || s.atv || s.mode === 'waymo' || p.mode === 'streetcar') return { ok: false };
    let mode = args.mode;
    if (typeof mode !== 'string') return { ok: false };
    if (!available(p)) return { ok: false };
    if (s.mode === 'swing' && mode !== 'walk') return { ok: false };
    const mudBath = mode === 'sit' && args.mudBath === true;
    const exit = { x: MUD_BATH.entry.x + 0.5, z: MUD_BATH.entry.y + 0.5 };
    if (
      mudBath &&
      (p.mode !== 'walk' ||
        p.instance.kind !== 'world' ||
        Math.hypot(p.x - exit.x, p.z - exit.z) > 0.5 ||
        Math.abs(p.y - geometry.characterGround(exit.x, exit.z)) > 0.35 ||
        !geometry.sights?.some((n) => n.id === MUD_BATH.id))
    )
      return { ok: false, message: contentText('world-message.mud-bath.approach') };
    if (p.training) leaveTraining(p);
    leaveConstruction(p);
    if (args.boost !== undefined) s.boost = args.boost === true;
    if (
      s.rocket.state.active ||
      (s.sutro.state.active && s.sutro.state.phase !== 'top') ||
      (s.tahoeValue && s.tahoeValue.state.mode !== 'ground')
    )
      return { ok: false };
    if (
      mode === 'sit' &&
      (!(['walk', 'dance', 'sit', 'bench'] satisfies [string, string, string, string]).includes(
        p.mode,
      ) ||
        s.sutro.state.active)
    )
      return {
        ok: false,
        message: contentText(
          'world-message.server.movement.find-a-safe-place-on-foot-before-sitting',
        ),
      };
    const chairId = args.chair === true ? 'ball-chair' : args.chair;
    const chair = mode === 'sit' && FACTORY_CHAIRS.find((item) => item.id === chairId);
    if (
      mode === 'sit' &&
      chairId &&
      (!chair || !p.inventory.economy.state.ownedEquipment.includes(chair.id))
    )
      return {
        ok: false,
        message: contentText('world-message.server.player-state.you-do-not-own-this-chair'),
      };
    if (mode === 'sit' && args.seat) {
      const site = geometry.sights?.find((n) => n.id === args.seat && n.kind === 'bench'),
        seat = site?.seat,
        exit = site ? { x: site.entry.x + 0.5, z: site.entry.y + 0.5 } : null;
      if (
        !seat ||
        !exit ||
        !site ||
        Math.hypot(p.x - exit.x, p.z - exit.z) > 1.15 ||
        !geometry.landClearAt(exit.x - 0.5, exit.z - 0.5) ||
        !geometry.canTravel!(p.x - 0.5, p.z - 0.5, exit.x - 0.5, exit.z - 0.5, true)
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.movement.walk-to-the-front-of-the-bench-first',
          ),
        };
      if ([...players.values()].some((other) => other !== p && other.seat?.id === site.id))
        return {
          ok: false,
          message: contentText('world-message.server.movement.somebody-is-already-sitting-there'),
        };
      following.stop(p);
      park(p, s);
      stop(p);
      s.mode = 'bench';
      p.mode = 'bench';
      if (chairForGesture(p.gesture)) p.gesture = '';
      p.seat = { id: site.id, exit };
      Object.assign(p, {
        x: seat.x,
        z: seat.z,
        y: seat.base + seat.height - 0.51,
        angle: seat.angle,
      });
      return { ok: true };
    }
    if (p.bomberActive) return { ok: mode !== 'sit' };
    if (p.personalJailed && !(['walk', 'sit'] satisfies [string, string]).includes(mode))
      return { ok: false, message: contentText('world-message.server.movement.you-are-detained') };
    if (mode === 'walk' || mode === 'dance' || mode === 'roll' || mode === 'sit') {
      leaveSeat(p);
      following.stop(p);
      if (s.mode === 'surf' && p.surfShore) {
        s.wave.stop();
        s.windsurf.cancelJump();
        Object.assign(p, {
          x: p.surfShore.x + 0.5,
          z: p.surfShore.y + 0.5,
          y: geometry.characterGround(p.surfShore.x + 0.5, p.surfShore.y + 0.5),
        });
        p.surfShore = null;
      }
      if (mode === 'roll' && s.mode === 'roll' && now() < s.rollUntil!)
        return {
          ok: false,
          message: contentText('world-message.server.movement.finish-your-current-roll-first'),
        };
      park(p, s);
      s.mode = mode;
      stop(p);
      p.mode = mode;
      if (chair) {
        p.gesture = chair.gesture;
        p.gestureUntil = 0;
      } else if (chairForGesture(p.gesture)) p.gesture = '';
      if (
        (
          ['windsurf', 'paddle', 'surfboard', 'bench', 'curl', 'squat', 'press'] satisfies [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
          ]
        ).includes(p.gesture)
      )
        p.gesture = '';
      if (mode === 'roll') {
        s.rollStartedAt! = now();
        s.rollUntil! = now() + FORWARD_ROLL_DURATION * 1000;
        p.phase = 0;
      }
      if (mudBath) {
        p.seat = { id: MUD_BATH.id, exit, soakSeconds: 0 };
        Object.assign(p, {
          x: MUD_BATH.x,
          z: MUD_BATH.z,
          y: geometry.characterGround(MUD_BATH.x, MUD_BATH.z) + 0.04,
          angle: 0,
        });
        return { ok: true, message: contentText('world-message.mud-bath.soaking') };
      }
      return { ok: true };
    }
    if (mode === 'bike') {
      const b = p.profile.bicycle || geometry.sights?.find((n) => n.kind === 'bike')?.entry;
      if (
        !b ||
        typeof b.x !== 'number' ||
        typeof b.y !== 'number' ||
        Math.hypot(p.x - b.x - 0.5, p.z - b.y - 0.5) > 3
      )
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-to-your-bicycle'),
        };
    } else if (mode === 'skateboard') {
      if (!p.profile.playerState.quests.theyLive.skateboard)
        return {
          ok: false,
          message: contentText('world-message.server.movement.earn-your-skateboard-first'),
        };
    } else if (mode === 'motorcycle') {
      const bike = json(p.profile.privateState['sf-motorcycle-v1']);
      if (
        !bike.rented ||
        typeof bike.x !== 'number' ||
        typeof bike.y !== 'number' ||
        Math.hypot(p.x - bike.x - 0.5, p.z - bike.y - 0.5) > 3
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.movement.rent-your-motorcycle-and-walk-to-it-first',
          ),
        };
    } else if (mode === 'ferrari') {
      const car = s.ferrari;
      if (!car) return { ok: false };
      const at = car.position;
      if (Math.hypot(p.x - at.x, p.z - at.z) > 4)
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-to-your-ferrari'),
        };
      car.mount();
    } else if (mode === 'surf') {
      const launch = args.pacifica
        ? geometry.pacificaSurfSite
        : geometry.sights?.find((n) => n.kind === 'windsurf');
      if (!launch || Math.hypot(p.x - launch.entry.x - 0.5, p.z - launch.entry.y - 0.5) > 5)
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-to-a-surf-launch-first'),
        };
      p.surfShore = { ...launch.entry };
      const water = args.pacifica ? geometry.pacificaSurfSite!.launch : geometry.surf?.state.launch;
      if (!water) return { ok: false };
      p.x = water.x + 0.5;
      p.z = water.y + 0.5;
      p.y = 0.1;
      s.surfKind = args.pacifica ? 'surf' : 'windsurf';
      s.windsurf.state.riding = true;
      if (args.pacifica) s.wave.start({ x: p.x, z: p.z });
    } else
      return {
        ok: false,
        message: contentText('world-message.server.movement.that-movement-activity-is-unavailable'),
      };
    s.mode = mode;
    p.mode = mode;
    stop(p);
    dirty(p);
    return { ok: true };
  }
  function streetcarLanding(car: ReturnType<typeof marketStreetcarPose>) {
    for (const offset of [1.25, -1.25, 0.85, -0.85, 0]) {
      const x = car.x - Math.sin(car.angle) * offset;
      const z = car.z + Math.cos(car.angle) * offset;
      if (geometry.landClearAt(x - 0.5, z - 0.5))
        return { x, z, y: geometry.characterGround(x, z) };
    }
    return null;
  }

  function streetcarTravel(p: ServerPlayer, s: MovementRuntime, exiting: boolean) {
    if (!geometry.streetcarRoute) return { ok: false };
    const car = marketStreetcarPose(geometry.streetcarRoute, now());
    if (exiting) {
      if (p.mode !== 'streetcar') return { ok: false };
      const landing = streetcarLanding(car);
      if (!landing) return { ok: false };
      Object.assign(p, landing, { mode: 'walk' });
      stop(p);
      dirty(p);
      send(p, { type: 'position', ...landing, reason: 'streetcarExit' });
      return { ok: true };
    }
    if (
      p.training ||
      s.rocket.state.active ||
      s.sutro.state.active ||
      (s.tahoeValue && s.tahoeValue.state.mode !== 'ground') ||
      !['walk', 'sit', 'bench', 'dance', 'skateboard'].includes(p.mode)
    )
      return { ok: false };
    if (Math.hypot(p.x - car.x, p.z - car.z) > STREETCAR_BOARD_RANGE)
      return { ok: false, retryApproach: true };
    following.stop(p);
    wake(p);
    stop(p);
    s.mode = 'walk';
    p.attack = null;
    p.personalBattle = null;
    const base = (geometry.terrainHeight || geometry.characterGround)(car.x, car.z);
    Object.assign(p, marketStreetcarRider(car, base), { mode: 'streetcar' });
    dirty(p);
    return { ok: true };
  }

  function travel(p: ServerPlayer, args: Record<string, unknown>) {
    if (
      !available(p) ||
      p.personalJailed ||
      p.bomberActive ||
      (p.instance?.kind || 'world') !== 'world'
    )
      return {
        ok: false,
        message: contentText(
          'world-message.server.movement.this-activity-starts-on-foot-in-the-city',
        ),
      };
    const s = state(p),
      near = (entry: Point | null | undefined) =>
        !!entry && Math.hypot(p.x - entry.x - 0.5, p.z - entry.y - 0.5) < 3;
    if (args.kind === 'streetcarBoard' || args.kind === 'streetcarExit')
      return streetcarTravel(p, s, args.kind === 'streetcarExit');
    if (p.mode === 'streetcar') return { ok: false };
    if (args.kind === 'swingExit') {
      if (p.mode !== 'swing' || (p.boundUntil || 0) > now()) return { ok: false };
      wake(p);
      dirty(p);
      return { ok: true };
    }
    if (s.mode === 'swing') return { ok: false };
    if (args.kind === 'swingBoard') return boardSwing(p, s, args.id);
    if (typeof args.kind === 'string' && args.kind.startsWith('waymo'))
      return waymo.action(p, s, args.kind);
    if (s.mode === 'waymo') return { ok: false };
    if (typeof args.kind === 'string' && args.kind.startsWith('atv')) return atvAction(p, s, args);
    if (s.atv) return { ok: false };
    if (args.kind === 'motorcycleTrick') {
      const trick = MOTORCYCLE_TRICKS.find(({ id }) => id === args.trick);
      const time = now();
      if (
        !trick ||
        s.mode !== 'motorcycle' ||
        p.mode !== 'motorcycle' ||
        (p.gestureUntil &&
          p.gestureUntil >= time &&
          MOTORCYCLE_TRICKS.some(({ id }) => id === p.gesture))
      )
        return { ok: false };
      p.gesture = trick.id;
      p.gestureUntil = time + trick.duration * 1000;
      return { ok: true };
    }
    if (args.kind === 'houseRoof') {
      if (s.houseClimb && p.mode !== 'roof') return { ok: false };
      const id = s.houseClimb?.id ?? args.id;
      if (typeof id !== 'string') return { ok: false };
      const climb = houseClimb(id);
      const house = climb && geometry.places?.find((place) => place.id === id);
      if (!house?.entry || !house.worldHeight || !climb) return { ok: false };
      const descending = p.mode === 'roof';
      const landing = { x: house.entry.x + 0.5, z: house.entry.y + 0.5 };
      if (
        !descending &&
        (!['walk', 'sit', 'bench', 'dance'].includes(p.mode) ||
          Math.hypot(p.x - landing.x, p.z - landing.z) > 0.9)
      )
        return {
          ok: false,
          message: contentText('world-message.server.movement.go-to-the-ladder-by-the-front-door'),
        };
      const foot = { ...climb.ladder, y: geometry.characterGround(landing.x, landing.z) };
      const roof = {
        ...climb.perch,
        y: geometry.characterGround(climb.perch.x, climb.perch.z) + house.worldHeight + 0.72,
      };
      following.stop(p);
      wake(p);
      stop(p);
      p.attack = null;
      p.personalBattle = null;
      s.houseClimb = {
        id,
        from: descending ? roof : foot,
        to: descending ? foot : roof,
        elapsed: 0,
        descending,
      };
      p.angle = climb.angle;
      p.mode = 'climb';
      return { ok: true };
    }
    if (s.houseClimb) return { ok: false };
    if (args.kind === 'catchWave') {
      if (s.mode !== 'surf' || s.surfKind !== 'surf') return { ok: false };
      return { ok: s.wave.catchWave({ x: p.x, z: p.z }, clock()) };
    }
    if (args.kind === 'surfTrick') return { ok: s.mode === 'surf' && s.wave.trick(args.id) };
    if (args.kind === 'surfJump') {
      if (
        s.mode !== 'surf' ||
        s.surfKind !== 'windsurf' ||
        !Number.isInteger(args.index) ||
        typeof args.index !== 'number' ||
        args.index < 0 ||
        args.index >= s.whales.count
      )
        return { ok: false };
      const target = s.whales.sample(clock() * 1000 + WHALE_JUMP_LEAD_MS, args.index);
      return { ok: s.windsurf.jumpOver({ x: p.x - 0.5, y: p.z - 0.5 }, target) };
    }
    if (
      s.rocket.state.active ||
      (s.sutro.state.active && args.kind !== 'descend') ||
      s.tahoeValue?.state.mode === 'gondola'
    )
      return { ok: false };
    if (args.kind === 'rocket') {
      const sites = [
          { ...SF_SPACEPORT, id: 'sf-spaceport' },
          ...(geometry.tahoe?.spaceport
            ? [{ ...geometry.tahoe.spaceport, id: 'tahoe-spaceport' }]
            : []),
        ],
        attendant = nearbyServiceNPC(
          geometry,
          p,
          (n) => n.kind === 'crew' && sites.some((s) => s.id === n.siteId),
        );
      const from = sites.find((s) => s.id === attendant?.siteId),
        to = sites.find((n) => n !== from);
      if (!from || !to)
        return {
          ok: false,
          message: contentText('world-message.server.movement.visit-the-spacex-attendant'),
        };
      const paid = p.inventory.economy.trade('rocket');
      if (!paid.ok) return paid;
      s.rocket.start(from, to, position(p));
      p.mode = 'hidden';
    } else if (args.kind === 'gondola') {
      const up = near(s.tahoe.baseEntry);
      if (!up && !near(s.tahoe.summitEntry))
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-to-the-gondola-station'),
        };
      s.tahoe.gondola(up);
      p.mode = 'gondola';
    } else if (args.kind === 'ski') {
      if (!near(s.tahoe.summitEntry) || !s.tahoe.state.rented || !s.tahoe.startSki())
        return {
          ok: false,
          message: contentText('world-message.server.movement.rent-skis-at-the-summit-first'),
        };
      p.mode = 'ski';
    } else if (args.kind === 'sutro') {
      const tower = geometry.objects?.find((n) => n.sight?.id === 'sutro'),
        from = { x: p.x - 0.5, y: p.z - 0.5 };
      // The landmark's general visitor entry is on a different side of
      // the hill. Validate the very same reachable ladder as the client.
      const ladder = tower && geometry.approaches?.sutro?.(from);
      if (
        !ladder ||
        !tower ||
        !hasPhysicalBounds(tower) ||
        Math.hypot(from.x - ladder.x, from.y - ladder.y) > 1.8 ||
        Math.abs(p.y - geometry.characterGround(p.x, p.z)) > 1.2 ||
        !geometry.canTravel!(from.x, from.y, ladder.x, ladder.y, true)
      )
        return {
          ok: false,
          message: contentText('world-message.server.movement.walk-to-the-sutro-service-ladder'),
        };
      if (
        !s.sutro.begin(
          { x: tower.x + tower.w / 2, z: tower.y + tower.d / 2, base: tower.base ?? 0 },
          position(p),
        )
      )
        return {
          ok: false,
          message: contentText('world-message.server.movement.you-are-already-on-the-sutro-ladder'),
        };
      p.mode = 'climb';
    } else if (args.kind === 'skiFlip') {
      return { ok: s.tahoe.flip() };
    } else if (args.kind === 'descend') {
      if (!s.sutro.descend())
        return {
          ok: false,
          message: contentText('world-message.server.movement.you-are-not-on-sutro-tower'),
        };
      s.mode = 'walk';
      p.mode = 'climb';
    } else
      return { ok: false, message: contentText('world-message.server.movement.unknown-journey') };
    if (
      (['rocket', 'gondola', 'sutro', 'ski'] satisfies [string, string, string, string]).includes(
        args.kind,
      )
    ) {
      following.stop(p);
      park(p, s);
      s.mode = 'walk';
      p.training = false;
      p.attack = null;
      p.personalBattle = null;
      s.travelReturn = position(p);
    }
    s.route = [];
    p.inventory.save();
    dirty(p);
    return { ok: true, ...(args.kind === 'rocket' ? { inventory: p.inventory.snapshot() } : {}) };
  }
  function boardSwing(p: ServerPlayer, s: MovementRuntime, id: unknown) {
    if (p.mode !== 'walk' || (p.boundUntil || 0) > now()) return { ok: false };
    const site = geometry.sights?.find((n) => n.kind === 'swing' && n.id === id);
    if (!site?.seat) return { ok: false };
    const { entry, seat } = site;
    const exit = { x: entry.x + 0.5, z: entry.y + 0.5 };
    if (
      Math.hypot(p.x - exit.x, p.z - exit.z) > SWING_RANGE ||
      !geometry.landClearAt(entry.x, entry.y) ||
      !geometry.canTravel!(p.x - 0.5, p.z - 0.5, entry.x, entry.y, true)
    )
      return { ok: false, message: contentText('world-message.swing.too-far') };
    if ([...players.values()].some((other) => other.seat?.id === site.id))
      return { ok: false, message: contentText('world-message.swing.occupied') };
    following.stop(p);
    stop(p);
    s.mode = 'swing';
    s.swingElapsed = 0;
    Object.assign(p, {
      mode: 'swing',
      seat: { id: site.id, exit },
      x: seat.x,
      z: seat.z,
      y: swingRiderGround(seat),
      angle: seat.angle,
      phase: 0,
      attack: null,
      personalBattle: null,
      gesture: '',
      gestureUntil: 0,
    });
    dirty(p);
    return { ok: true };
  }
  function tick(dt: number) {
    const car = geometry.streetcarRoute && marketStreetcarPose(geometry.streetcarRoute, now());
    for (const p of players.values()) {
      const s = state(p);
      if (p.mode === 'streetcar' && car && available(p)) {
        const base = (geometry.terrainHeight || geometry.characterGround)(car.x, car.z);
        const rider = marketStreetcarRider(car, base);
        if (rider.x !== p.x || rider.y !== p.y || rider.z !== p.z) {
          Object.assign(p, rider);
          dirty(p);
        }
        continue;
      }
      waymo.tick(p, s, dt);
      if (s.combatTarget && !p.attack) stopCombatRoute(p);
      if (!available(p) || (p.boundUntil || 0) > now() || following.owns(p)) {
        s.route = [];
        continue;
      }
      if (s.mode === 'swing' && p.mode === 'swing' && p.seat) {
        s.swingElapsed = (s.swingElapsed ?? 0) + dt;
        p.phase = swingAngle(s.swingElapsed);
        continue;
      }
      if (
        s.queuedWalk &&
        !s.rocket.state.active &&
        !s.sutro.state.active &&
        s.tahoeValue?.state.mode !== 'gondola'
      )
        move(p, s.queuedWalk);
      if (s.houseClimb) {
        const climb = s.houseClimb;
        if (p.mode === 'roof') continue;
        climb.elapsed = Math.min(1, climb.elapsed + dt / 2.4);
        const t = climb.elapsed;
        const horizontal = climb.descending
          ? Math.min(1, t / 0.28)
          : Math.max(0, (t - 0.72) / 0.28);
        const vertical = climb.descending ? Math.max(0, (t - 0.28) / 0.72) : Math.min(1, t / 0.72);
        p.x = climb.from.x + (climb.to.x - climb.from.x) * horizontal;
        p.z = climb.from.z + (climb.to.z - climb.from.z) * horizontal;
        p.y = climb.from.y + (climb.to.y - climb.from.y) * vertical;
        p.phase += dt * 13;
        p.moving = t < 1;
        p.motion = t < 1 ? 1 : 0;
        p.mode = t < 1 ? 'climb' : climb.descending ? 'walk' : 'roof';
        if (t === 1 && climb.descending) {
          const entry = geometry.places?.find((place) => place.id === climb.id)?.entry;
          if (entry) Object.assign(p, { x: entry.x + 0.5, z: entry.y + 0.5 });
          s.houseClimb = undefined;
        }
        dirty(p);
        continue;
      }
      if (s.atv) {
        tickATV(p, s, dt);
        continue;
      }
      if (p.bomberActive) {
        if (!s.bomber.state.active) s.bomber.board(position(p));
        s.bomber.update(dt, { boost: s.boost });
        Object.assign(p, s.bomber.state.position, {
          angle: s.bomber.state.heading,
          phase: s.bomber.state.bank + s.bomber.state.rollAngle,
          moving: s.bomber.state.speed > 0,
          motion: 0,
          mode: 'bomber',
        });
        continue;
      }
      if (s.bomber.state.active) s.bomber.stop();
      let v = null;
      if (s.rocket.state.active) {
        s.rocket.update(dt);
        const pose = s.rocket.state.pose!;
        v = { ...s.rocket.state.position, angle: pose.angle };
        p.phase = pose.phase;
        p.motion = pose.motion;
        p.moving = pose.motion > 1e-5;
        p.mode = s.rocket.state.active ? 'hidden' : 'walk';
      } else if (s.tahoeValue && s.tahoeValue.state.mode !== 'ground') {
        s.tahoe.update(dt);
        v = { ...s.tahoe.state.position, angle: s.tahoe.state.angle };
        p.mode =
          s.tahoe.state.mode === 'ski'
            ? 'ski'
            : s.tahoe.state.mode === 'ground'
              ? 'walk'
              : 'gondola';
        p.phase = s.tahoe.state.flipAngle || 0;
        p.motion = 0;
        p.moving = s.tahoe.state.mode !== 'ground';
      } else if (s.sutro.state.active) {
        const before = s.sutro.state.position!,
          event = s.sutro.update(dt),
          pose = s.sutro.state.pose!;
        v = { ...s.sutro.state.position, angle: pose.angle };
        p.moving = pose.motion > 0.00001;
        p.motion = pose.motion;
        p.phase =
          pose.mode === 'climb'
            ? (pose.ladderHeight * Math.PI * 2) / CHARACTER_CLIPS.climb.stride
            : p.phase +
              (Math.hypot(v.x! - before.x, v.z! - before.z) * Math.PI * 2) /
                CHARACTER_CLIPS.walk.stride;
        if (event === 'ground') s.mode = 'walk';
        p.mode =
          event === 'ground'
            ? 'walk'
            : s.sutro.state.phase === 'top' && s.mode === 'dance'
              ? 'dance'
              : 'climb';
      } else if (s.ferrari?.state.riding) {
        s.ferrari.update(dt);
        v = s.ferrari.position;
        p.mode = 'ferrari';
        p.moving = s.ferrari.state.speed > 0;
      }
      if (v) {
        if (p.mode === 'ferrari') {
          p.phase += Math.hypot(v.x! - p.x, v.z! - p.z) * Math.PI;
          p.motion = 0;
        }
        Object.assign(p, { x: v.x, y: v.y, z: v.z, angle: v.angle ?? p.angle });
        dirty(p);
        continue;
      }
      if (s.mode === 'surf') {
        p.gesture =
          s.surfKind === 'surf' ? (s.wave.state.ride ? 'surfboard' : 'paddle') : 'windsurf';
        p.gestureUntil = 0;
      }
      if (s.mode === 'surf' && s.windsurf.state.jump) {
        const jump = s.windsurf.state.jump,
          landed = s.windsurf.updateJump(dt);
        Object.assign(p, {
          x: jump.x + 0.5,
          z: jump.y + 0.5,
          y: 0.1 + jump.height,
          angle: jump.angle,
          phase: jump.pitch || 0,
          mode: 'surf',
          moving: !landed,
        });
        continue;
      }
      if (s.mode === 'surf' && s.surfKind === 'surf') {
        s.wave.update(dt);
        if (s.wave.state.ride && s.wave.state.position) {
          const at = s.wave.state.position;
          Object.assign(p, {
            x: at.x,
            z: at.z,
            y: 0.1 + s.wave.pose.height,
            angle: s.wave.state.angle,
            phase: s.wave.pose.roll || 0,
            mode: 'surf',
            moving: true,
          });
          continue;
        }
      }
      if (
        p.training ||
        s.mode === 'construction' ||
        p.personalBattle ||
        (['dance', 'sit', 'bench'] satisfies [string, string, string]).includes(s.mode)
      ) {
        p.moving = false;
        p.motion = 0;
        continue;
      }
      if (s.mode === 'roll' && now() > s.rollUntil!) {
        s.mode = 'walk';
        p.mode = 'walk';
      }
      let budget =
          dt *
          ((
            {
              walk: GAMEPLAY.walkSpeed,
              waymo: WAYMO_RENTAL.speed,
              roll: GAMEPLAY.rollSpeed,
              bike: 8.2,
              skateboard: 7.6,
              motorcycle: MOTORCYCLE_SPEED,
              surf: 7.2,
            } as Record<string, number>
          )[s.mode] || GAMEPLAY.walkSpeed),
        moved = 0;
      while (budget > 1e-8 && s.route.length) {
        const n = s.route[0],
          dx = n.x + 0.5 - p.x,
          dz = n.y + 0.5 - p.z,
          d = Math.hypot(dx, dz),
          step = Math.min(budget, d);
        if (d < 1e-8) {
          s.route.shift();
          continue;
        }
        const from = { x: p.x - 0.5, y: p.z - 0.5 },
          interior = interiorNavigation(p);
        if (s.checked !== n) {
          const valid = p.personalJailed
            ? geometry.detention?.path(from, n)
            : interior
              ? interior.segment(from, n)
              : s.mode === 'surf'
                ? geometry.surf?.segment(from, n)
                : geometry.canTravel!(from.x, from.y, n.x, n.y, true);
          if (!valid) {
            s.route = [];
            break;
          }
          s.checked = n;
        }
        const nextX = p.x + (dx / d) * step,
          nextZ = p.z + (dz / d) * step;
        if (!interior && !inFighterYard(p.x, p.z) && !fighterYardMayEnter(p, nextX, nextZ)) {
          s.route = [];
          send(p, {
            type: 'notice',
            message: contentText('world-message.fighter-yard.admission-required'),
          });
          break;
        }
        p.x = nextX;
        p.z = nextZ;
        p.y = p.personalJailed
          ? geometry.detention!.base + 0.18
          : interior
            ? (p.instance?.kind === LAB_INSTANCE.kind ? LAB_FLOOR : ILLUMINATI_CAVE.floor) + 0.025
            : s.mode === 'surf'
              ? 0.1
              : geometry.characterGround(p.x, p.z);
        p.angle = Math.atan2(dz, dx);
        moved += step;
        budget -= step;
        if (d <= step + 1e-8) s.route.shift();
      }
      p.moving = moved > 0;
      p.motion = p.moving ? 1 : 0;
      p.phase =
        s.mode === 'roll'
          ? Math.min(1, Math.max(0, (now() - s.rollStartedAt!) / (FORWARD_ROLL_DURATION * 1000))) *
            Math.PI *
            2
          : s.mode === 'surf'
            ? 0
            : p.phase + moved * Math.PI;
      p.mode = p.training ? 'train' : s.mode;
      if (moved) dirty(p);
    }
  }
  return {
    move,
    approachCombat,
    stopCombatRoute,
    activity,
    travel,
    activeATVRentalUntil: (p: ServerPlayer) => {
      const expiresAt = atvExpiry(p);
      return expiresAt > now() ? expiresAt : 0;
    },
    tick,
    stop,
    wake,
    state,
    position,
    leaveTraining,
    leaveConstruction,
    savePosition(p: ServerPlayer, fallback: import('../src/types/server.ts').NetworkPosition) {
      if (p.seat)
        return {
          ...p.seat.exit,
          y: geometry.characterGround(p.seat.exit.x, p.seat.exit.z),
          angle: p.angle,
          hp: p.hp,
        };
      if (p.depotLaunch)
        return { ...fallback, y: p.depotLaunch.base, hp: p.depotLaunch.trampoline ? p.hp : 1 };
      if (p.mode === 'streetcar' && geometry.streetcarRoute) {
        const car = marketStreetcarPose(geometry.streetcarRoute, now());
        return { ...(streetcarLanding(car) || fallback), angle: p.angle, hp: p.hp };
      }
      const s = active.get(p.id);
      if (s?.atv) return { ...atvLanding(p), angle: p.angle, hp: p.hp };
      if (s?.houseClimb) {
        const foot = s.houseClimb.descending ? s.houseClimb.to : s.houseClimb.from;
        const entry = geometry.places?.find((place) => place.id === s.houseClimb?.id)?.entry;
        return {
          ...foot,
          ...(entry && { x: entry.x + 0.5, z: entry.y + 0.5 }),
          angle: p.angle,
          hp: p.hp,
        };
      }
      if (s?.rocket.state.active) {
        const to = s.rocket.state.to!;
        return {
          x: to.entry.x + 0.5,
          z: to.entry.y + 0.5,
          y: to.base + 0.04,
          angle: p.angle,
          hp: p.hp,
        };
      }
      if (s?.sutro.state.active || (s?.tahoeValue && s.tahoeValue.state.mode !== 'ground'))
        return { ...(s.travelReturn || fallback), hp: p.hp };
      return fallback;
    },
    remove: (p: ServerPlayer) => {
      const s = active.get(p.id);
      if (s) park(p, s);
      active.delete(p.id);
    },
    barrelRoll: (p: ServerPlayer) => ({ ok: !!p.bomberActive && state(p).bomber.barrelRoll() }),
    clear: (p: ServerPlayer) => {
      leaveConstruction(p);
      state(p).waymo = undefined;
      leaveSeat(p);
      const s = active.get(p.id);
      if (s) park(p, s);
      stop(p);
      active.delete(p.id);
    },
  };
}
