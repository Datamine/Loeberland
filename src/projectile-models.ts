import { CHARACTER_BONES, sampleCharacterPose } from './characters.ts';
import type { Mesh } from './geometry.ts';
import {
  ENERGY_BOLT_SECONDS,
  ONODA_RIFLE_SECONDS,
  MISSILE_BURST_SECONDS,
  MISSILE_EFFECT_SECONDS,
  MISSILE_FLIGHT_SECONDS,
  SCIENTIST_EXPLOSIVE,
} from './config/gameplay.ts';
import {
  AKIMBO_MUZZLE,
  AKIMBO_SHOT_GAP,
  FIRING_GESTURE_SECONDS,
  LAUNCHER_EXHAUST,
  LAUNCHER_MUZZLE,
  ONODA_MUZZLE,
  RAILGUN_MUZZLE,
  SHOT_BODY_HEIGHT,
} from './ranged-weapon-mounts.ts';
import type { ExpeditionBeam } from './types/expeditions.ts';
import { GOBLIN_ROCK } from './goblin-incubator-cave.ts';

type Point = ExpeditionBeam['from'];
type Vec = readonly [number, number, number];
const railgunTrace = 0.075;
const railgunLifetime = 0.29;
const energyImpact = 0.12;
const clamp = (t: number) => Math.min(1, Math.max(0, t));
const xyz = ({ x, y, z }: Point): Vec => [x, y, z];
const mix = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const offset = (p: Vec, v: Vec, distance: number): Vec => [
  p[0] + v[0] * distance,
  p[1] + v[1] * distance,
  p[2] + v[2] * distance,
];

function weaponMount(from: Point, angle: number, weapon: string, delay = 0) {
  const pose = sampleCharacterPose('idle', 0, {
    action: 'attack',
    actionT: delay / FIRING_GESTURE_SECONDS,
    akibo: weapon === 'akibo' || weapon === 'akimbo',
    railgun: weapon === 'railgun' || weapon === 'onoda-rifle',
    launcher: weapon === 'missile-launcher',
  });
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return (point: Vec, bone: number = CHARACTER_BONES.rightHand): Vec => {
    const i = bone * 12;
    const m = pose.matrices;
    const x = m[i] * point[0] + m[i + 1] * point[1] + m[i + 2] * point[2] + m[i + 3];
    const y = m[i + 4] * point[0] + m[i + 5] * point[1] + m[i + 6] * point[2] + m[i + 7];
    const z = m[i + 8] * point[0] + m[i + 9] * point[1] + m[i + 10] * point[2] + m[i + 11];
    return [from.x + x * sin + z * cos, from.y + y, from.z - x * cos + z * sin];
  };
}

function lifetime(weapon?: string) {
  switch (weapon) {
    case 'scientist-explosive':
      return SCIENTIST_EXPLOSIVE.flight + SCIENTIST_EXPLOSIVE.burst;
    case 'goblin-rock':
      return GOBLIN_ROCK.flight + GOBLIN_ROCK.burst;
    case 'missile-launcher':
      return MISSILE_EFFECT_SECONDS;
    case 'onoda-rifle':
      return ONODA_RIFLE_SECONDS + energyImpact;
    case 'akibo':
    case 'akimbo':
    case 'robocop-laser':
    case 'emf-lightning':
      return ENERGY_BOLT_SECONDS + energyImpact;
    default:
      return railgunLifetime;
  }
}

/** Snapshot each muzzle at its discharge pose so projectiles leave the weapon
 * behind when the shooter recoils or turns. NPC packets can also supply feet. */
export function projectileEffect(
  weapon: string | undefined,
  from: Point,
  to: Point,
  shooter?: Point,
): ExpeditionBeam {
  const shot = { weapon, from, to, ttl: lifetime(weapon) };
  if (weapon === 'scientist-explosive' || weapon === 'goblin-rock' ||
    weapon === 'robocop-laser' || weapon === 'emf-lightning')
    return shot;
  const feet = shooter ?? { ...from, y: from.y - SHOT_BODY_HEIGHT + 0.07 };
  const angle = Math.atan2(to.z - feet.z, to.x - feet.x);
  const mount = weaponMount(feet, angle, weapon ?? 'railgun');
  if (weapon === 'akibo' || weapon === 'akimbo') {
    const [x, y, z] = AKIMBO_MUZZLE;
    const offhand = weaponMount(feet, angle, weapon, AKIMBO_SHOT_GAP);
    return {
      ...shot,
      muzzles: [mount(AKIMBO_MUZZLE), offhand([-x, y, z], CHARACTER_BONES.leftHand)],
    };
  }
  if (weapon === 'missile-launcher')
    return { ...shot, muzzles: [mount(LAUNCHER_MUZZLE)], exhaust: mount(LAUNCHER_EXHAUST) };
  return { ...shot, muzzles: [mount(weapon === 'onoda-rifle' ? ONODA_MUZZLE : RAILGUN_MUZZLE)] };
}

function direction(a: Vec, b: Vec): Vec {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return d > 1e-6 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d] : [1, 0, 0];
}

function sideways(a: Vec, b: Vec): Vec {
  const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return d > 1e-6 ? [-(b[2] - a[2]) / d, 0, (b[0] - a[0]) / d] : [0, 0, 1];
}

function glow(m: Mesh, at: Vec, radius: number, color: string, stretch = 1) {
  m.sphere(...at, radius, radius * stretch, radius, color, 8, 5, { emissive: 1 });
}

function muzzleFlash(m: Mesh, muzzle: Vec, forward: Vec, age: number, color: string, size: number) {
  const fade = 1 - clamp(age / 0.065);
  if (fade <= 0) return;
  glow(m, muzzle, size * (0.45 + fade * 0.55), color, 0.85);
  m.rod(
    muzzle,
    offset(muzzle, forward, size * (1 + 2.6 * fade)),
    size * fade * 0.53,
    '#fff2ce',
    6,
    {
      emissive: 1,
    },
  );
}

function sparks(m: Mesh, at: Vec, t: number, color: string, spread: number, count: number) {
  const fade = 1 - clamp(t);
  if (fade <= 0) return;
  glow(m, at, spread * (0.16 + 0.32 * fade), '#fff4dc');
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996;
    const ray: Vec = [Math.cos(a), 0.15 + (i % 3) * 0.41, Math.sin(a)];
    const r = spread * (0.32 + t * 1.27);
    m.rod(offset(at, ray, r * 0.52), offset(at, ray, r), 0.012 * fade, color, 4, { emissive: 1 });
  }
}

function drawAkimbos(m: Mesh, beam: ExpeditionBeam, elapsed: number) {
  const target = xyz(beam.to);
  const side = sideways(xyz(beam.from), target);
  const muzzles = beam.muzzles ?? projectileEffect('akibo', beam.from, beam.to).muzzles!;
  for (const [i, start] of muzzles.entries()) {
    const age = elapsed - i * AKIMBO_SHOT_GAP;
    if (age < -1e-8) continue;
    const duration = ENERGY_BOLT_SECONDS - AKIMBO_SHOT_GAP;
    const hand = i === 0 ? -1 : 1;
    const end = offset(target, side, hand * 0.11);
    muzzleFlash(m, start, direction(start, end), age, '#ff5c45', 0.106);
    if (age >= duration) {
      sparks(m, end, (age - duration) / energyImpact, '#ff6f61', 0.31, 5);
      continue;
    }
    const path = (t: number) =>
      offset(mix(start, end, t), side, hand * 0.13 * Math.sin(Math.PI * t));
    const progress = clamp(age / duration);
    const blob = path(progress);
    if (progress > 0.01) {
      const tail = path(Math.max(0, progress - 0.18));
      m.rod(tail, blob, 0.036, '#ed392e', 6, { emissive: 0.92 });
      m.rod(mix(tail, blob, 0.48), blob, 0.018, '#ffac87', 6, { emissive: 1 });
    }
    glow(m, blob, 0.091, '#ff443a', 0.87);
    glow(m, [blob[0], blob[1] + 0.039, blob[2]], 0.047, '#ffe5ca');
    for (let j = 0; j < 3; j++) {
      const turn = elapsed * 49 + hand * j * 2.094;
      const thorn: Vec = [side[0] * Math.cos(turn), Math.sin(turn), side[2] * Math.cos(turn)];
      const knot = offset(blob, thorn, 0.089);
      const tip = offset(path(Math.max(0, progress - 0.095)), thorn, 0.142);
      m.rod(blob, knot, 0.011, '#fff1bb', 4, { emissive: 1 });
      m.rod(knot, tip, 0.008, '#fa6e7a', 4, { emissive: 1 });
    }
  }
}

function drawRailgun(m: Mesh, start: Vec, end: Vec, age: number) {
  const head = mix(start, end, clamp(age / railgunTrace));
  const fade = 1 - clamp((age - railgunTrace) / (railgunLifetime - railgunTrace));
  muzzleFlash(m, start, direction(start, end), age, '#54dfff', 0.157);
  if (age > 0.005 && fade > 0) {
    m.rod(start, head, 0.049 * fade, '#269cff', 9, { emissive: 0.9 });
    m.rod(start, head, 0.018 * fade, '#e7fcff', 7, { emissive: 1 });
    const side = sideways(start, end);
    for (let i = 1; i <= 5; i++) {
      const mid = mix(start, head, (i - 0.5) / 5);
      const zig = offset(mid, side, (i % 2 ? 1 : -1) * fade * 0.11);
      m.rod(mix(start, head, (i - 1) / 5), zig, 0.009 * fade, '#99f8ff', 4, { emissive: 1 });
      m.rod(zig, mix(start, head, i / 5), 0.007 * fade, '#4a98ff', 4, { emissive: 1 });
    }
  }
  if (age >= railgunTrace) sparks(m, end, (age - railgunTrace) / 0.19, '#9cefff', 0.48, 8);
}

function drawMissile(m: Mesh, start: Vec, end: Vec, exhaust: Vec | undefined, age: number) {
  const forward = direction(start, end);
  const side = sideways(start, end);
  muzzleFlash(m, start, forward, age, '#ff914d', 0.15);
  if (exhaust && age < 0.22) {
    const exitDirection = direction(start, exhaust);
    for (let i = 0; i < 4; i++) {
      const puff = offset(exhaust, exitDirection, (0.2 + i * 0.21) * clamp(age / 0.09));
      const radius = (0.062 + i * 0.018) * (1 - age / 0.29);
      if (age < 0.058) glow(m, puff, radius, i % 2 ? '#ff8246' : '#fff1a4');
      else m.sphere(...puff, radius, radius, radius, '#c9baa4', 7, 4);
    }
  }
  if (age >= MISSILE_FLIGHT_SECONDS) {
    const impact = clamp((age - MISSILE_FLIGHT_SECONDS) / MISSILE_BURST_SECONDS);
    sparks(m, end, impact, '#ffb05a', 0.75, 10);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const spread = 0.16 + 0.52 * impact;
      const puff = offset(end, [Math.cos(angle), 0.45 + 0.2 * (i % 2), Math.sin(angle)], spread);
      const radius = (0.14 + 0.19 * impact) * (1 - impact * 0.7);
      m.sphere(
        ...puff,
        radius,
        radius * 0.86,
        radius,
        impact < 0.48 ? '#ff984c' : '#9a8271',
        8,
        5,
        {
          emissive: Math.max(0, 0.76 - impact),
        },
      );
    }
    return;
  }
  const path = (t: number): Vec => {
    const at = mix(start, end, t);
    return [at[0], at[1] + Math.sin(t * Math.PI) * 0.34, at[2]];
  };
  const progress = clamp(age / MISSILE_FLIGHT_SECONDS);
  const flightDistance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const segment = Math.min(0.32, 0.33 / Math.max(0.4, flightDistance));
  const tail = path(Math.max(0, progress - segment));
  const nose = path(Math.max(segment, progress));
  for (let i = 0; i < 9; i++) {
    const ahead = progress - segment * (1 + i * 0.7);
    if (ahead < 0) break;
    const at = path(ahead);
    const radius = 0.063 + i * 0.016;
    m.sphere(
      at[0],
      at[1] + i * 0.017,
      at[2],
      radius,
      radius,
      radius,
      i < 3 ? '#d3c4ae' : '#a49787',
      7,
      4,
    );
  }
  for (const vane of [side, [0, 1, 0] as const])
    for (const sign of [-1, 1])
      m.tri(tail, offset(tail, vane, sign * 0.14), mix(tail, nose, 0.61), '#aa7449', {
        metal: 0.55,
      });
  m.rod(tail, nose, 0.068, '#b7aea0', 10, { metal: 0.7 });
  glow(m, nose, 0.066, '#ffa04f');
  glow(m, offset(tail, forward, -0.07), 0.078, '#ff953e');
  glow(m, offset(tail, forward, -0.13), 0.04, '#fff0ad');
}

function drawTracer(m: Mesh, start: Vec, end: Vec, elapsed: number, rifle: boolean) {
  const travel = rifle ? ONODA_RIFLE_SECONDS : ENERGY_BOLT_SECONDS;
  const color = rifle ? '#ffbf69' : '#50dfff';
  muzzleFlash(m, start, direction(start, end), elapsed, color, rifle ? 0.095 : 0.11);
  if (elapsed >= travel) {
    sparks(m, end, (elapsed - travel) / energyImpact, color, rifle ? 0.25 : 0.33, 5);
    return;
  }
  const t = clamp(elapsed / travel);
  const tip = mix(start, end, t);
  if (t > 0.005) {
    const tail = mix(start, end, Math.max(0, t - (rifle ? 0.22 : 0.18)));
    m.rod(tail, tip, rifle ? 0.021 : 0.043, color, 6, { emissive: 0.93 });
    m.rod(mix(tail, tip, 0.35), tip, 0.013, '#fff7db', 5, { emissive: 1 });
  }
  glow(m, tip, rifle ? 0.034 : 0.052, color);
}

function drawLightning(m: Mesh, start: Vec, end: Vec, age: number) {
  const color = '#9d89ff';
  const progress = clamp(age / ENERGY_BOLT_SECONDS);
  const afterImpact = Math.max(0, age - ENERGY_BOLT_SECONDS);
  const fade = 1 - clamp(afterImpact / energyImpact);
  const tip = mix(start, end, progress);
  const side = sideways(start, end);
  const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const segments = Math.max(2, Math.ceil(2.8 * progress * length));
  const glowMaterial = { emissive: 1 };
  if (age < 0.065) glow(m, start, 0.105 * fade, '#cfb8ff');
  if (progress > 0.01 && fade > 0) {
    let previous = start;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const envelope = Math.sin(t * Math.PI);
      const kink = Math.sin(i * 4.73 + age * 78) * 0.21 * envelope;
      const [x, y, z] = offset(mix(start, tip, t), side, kink);
      const next: Vec = [x, y + Math.cos(i * 2.91 + age * 60) * 0.18 * envelope, z];
      m.rod(previous, next, 0.028 * fade, '#e3d8ff', 5, glowMaterial);
      if (i % 3 === 2 && i < segments) {
        const sign = i % 2 ? 1 : -1;
        const fork = offset(next, [side[0], 0.86 * sign, side[2]], sign * 0.22);
        const tail = offset(
          mix(start, tip, Math.min(1, t + 0.09)),
          [side[0], 0.82 * sign, side[2]],
          sign * 0.33,
        );
        m.rod(next, fork, 0.019 * fade, '#7688ff', 4, glowMaterial);
        m.rod(fork, tail, 0.009 * fade, '#b9b3ff', 4, glowMaterial);
      }
      previous = next;
    }
  }
  if (progress < 1) glow(m, tip, 0.06, '#d7cfff');
  else sparks(m, end, afterImpact / energyImpact, color, 0.43, 8);
}

function drawGrenade(m: Mesh, beam: ExpeditionBeam) {
  const a = beam.from;
  const b = beam.to;
  const rock = beam.weapon === 'goblin-rock';
  const { flight, burst, width } = rock ? GOBLIN_ROCK : SCIENTIST_EXPLOSIVE;
  const half = width / 2;
  if (beam.ttl > burst) {
    const t = 1 - (beam.ttl - burst) / flight;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * (rock ? 2.4 : 0.9);
    const z = a.z + (b.z - a.z) * t;
    if (rock) {
      m.sphere(x, y, z, 0.43, 0.34, 0.37, '#74625d', 7, 5, 'stone');
      m.sphere(x + Math.cos(t * 12) * 0.24, y + Math.sin(t * 12) * 0.22, z + 0.1,
        0.18, 0.15, 0.19, '#917c6c', 5, 4, 'stone');
    } else {
      m.sphere(x, y, z, 0.11, 0.12, 0.11, '#383f45', 11, 7, { metal: 0.4 });
      m.sphere(x, y + 0.12, z, 0.038, 0.038, 0.038, '#ffc077', 8, 4, { emissive: 0.95 });
    }
    const glow = { emissive: 0.35 + t * 0.45 };
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const corner = [b.x + dx * half, b.y, b.z + dz * half];
        m.rod(corner, [corner[0] - dx * 0.42, b.y, corner[2]], 0.025, '#ffb25d', 5, glow);
        m.rod(corner, [corner[0], b.y, corner[2] - dz * 0.42], 0.025, '#ffb25d', 5, glow);
      }
    }
  } else {
    const progress = 1 - beam.ttl / burst;
    const reach = (width - 1) / 2;
    const spread = 0.58 + 0.52 * progress;
    const puff = 0.28 + 0.12 * progress;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        m.sphere(
          b.x + dx * spread,
          b.y + 0.12 + 0.45 * progress,
          b.z + dz * spread,
          puff,
          puff * 0.82,
          puff,
          rock ? '#aa9281' : progress < 0.45 ? '#ffab56' : '#8b8374',
          8,
          5,
          { emissive: (rock ? 0.22 : 0.8) * (1 - progress) },
        );
        if (rock && (dx || dz))
          m.sphere(b.x + dx * (0.35 + progress), b.y + Math.sin(progress * Math.PI) * 0.72,
            b.z + dz * (0.35 + progress), 0.105, 0.075, 0.11, '#67564d', 5, 4, 'stone');
      }
    }
  }
}

export function drawBeam(m: Mesh, beam: ExpeditionBeam) {
  if (beam.weapon === 'scientist-explosive' || beam.weapon === 'goblin-rock') {
    drawGrenade(m, beam);
    return;
  }
  const age = Math.max(0, lifetime(beam.weapon) - beam.ttl);
  if (beam.weapon === 'akibo' || beam.weapon === 'akimbo') {
    drawAkimbos(m, beam, age);
    return;
  }
  const start = beam.muzzles?.[0] ?? xyz(beam.from);
  const end = xyz(beam.to);
  if (beam.weapon === 'missile-launcher') drawMissile(m, start, end, beam.exhaust, age);
  else if (beam.weapon === 'emf-lightning') drawLightning(m, start, end, age);
  else if (beam.weapon === 'onoda-rifle' || beam.weapon === 'robocop-laser')
    drawTracer(m, start, end, age, beam.weapon === 'onoda-rifle');
  else drawRailgun(m, start, end, age);
}
