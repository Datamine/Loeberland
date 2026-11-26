import { cross, pose, rgb, sub, unit } from './geometry.ts';
import type { Mesh } from './geometry.ts';
import { PEQUOD } from './jurassic-layout.ts';
import type { KrakenAnimation } from './types/expeditions.ts';
import type { Vec3 } from './types/geometry.ts';

const RISE = 1.35;
const SINK = 1.85;
const LASH = 0.19;
const SEA_LEVEL = 0.025;
const DECK_X = PEQUOD.krakenDistance - 0.45;
const TURN = 2 * Math.PI;
const ARM_SEGMENTS = 13;
const ARM_SIDES = 8;

const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const blend = (a: Vec3, b: Vec3, t: number): Vec3 => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const color = (a: string, b: string, t: number) => rgb(a).map((v, i) => mix(v, rgb(b)[i], t));

export function sampleKraken(animation: Readonly<KrakenAnimation>, time: number, enraged = false) {
  const elapsed = time - (animation.emergedAt ?? time - RISE);
  const phaseAge = time - (animation.enragedAt ?? (enraged ? time - 1 : Infinity));
  const sinkAge = time - (animation.defeatedAt ?? Infinity);
  let swing = time - (animation.strikeAt ?? Infinity);
  let both = enraged;
  let index = animation.strikes;
  const last = animation.lastStrike;
  if (last && time - last.at < 0.67) {
    swing = time - last.at;
    both = last.enraged;
    index--;
  }
  const windup = both ? 0.98 : 1.28;
  const lowering = sinkAge >= 0;
  return {
    elapsed,
    phaseAge,
    sinkAge,
    swing,
    side: index % 2 === 0 ? 1 : -1,
    both,
    coil: lowering ? 0 : smooth((swing + windup) / (windup - LASH)),
    reach: lowering
      ? 0
      : swing < 0
        ? ((Math.max(-LASH, swing) + LASH) / LASH) ** 2
        : 1 - smooth((swing - 0.07) / (both ? 0.4 : 0.59)),
    fury: smooth(phaseAge / 0.92),
    rise: smooth(elapsed / RISE),
    sink: smooth(sinkAge / SINK),
    flinch: 1 - smooth((time - (animation.hitAt ?? -Infinity)) / 0.26),
  };
}

type Curve = readonly [Vec3, Vec3, Vec3, Vec3];

function curvePoint([a, b, c, d]: Curve, t: number): Vec3 {
  const s = 1 - t;
  const x = s ** 3,
    y = 3 * s * s * t,
    z = 3 * s * t * t,
    w = t ** 3;
  return [
    a[0] * x + b[0] * y + c[0] * z + d[0] * w,
    a[1] * x + b[1] * y + c[1] * z + d[1] * w,
    a[2] * x + b[2] * y + c[2] * z + d[2] * w,
  ];
}

function drawArm(
  m: Mesh,
  curve: Curve,
  angle: number,
  width: number,
  skin: ReturnType<typeof armPalette>,
) {
  const across = [-Math.sin(angle), 0, Math.cos(angle)];
  let previous: Vec3[] = [];
  for (let step = 0; step <= ARM_SEGMENTS; step++) {
    const t = step / ARM_SEGMENTS;
    const center = curvePoint(curve, t);
    const axis = unit(
      sub(curvePoint(curve, Math.min(1, t + 0.025)), curvePoint(curve, Math.max(0, t - 0.025))),
    );
    const top = unit(cross(across, axis));
    const side = unit(cross(axis, top));
    const radius = width * (0.04 + 0.96 * (1 - t) ** 0.8);
    const ring: Vec3[] = [];
    for (let i = 0; i < ARM_SIDES; i++) {
      const roll = (i * TURN) / ARM_SIDES;
      const up = Math.cos(roll) * radius;
      const out = Math.sin(roll) * radius;
      ring.push([
        center[0] + top[0] * up + side[0] * out,
        center[1] + top[1] * up + side[1] * out,
        center[2] + top[2] * up + side[2] * out,
      ]);
    }
    if (step) {
      for (let i = 0; i < ARM_SIDES; i++) {
        const j = (i + 1) % ARM_SIDES;
        m.quad(previous[i], previous[j], ring[j], ring[i], skin.bands[i]);
      }
    }
    if (step >= 3 && step % 2 === 1 && step < ARM_SEGMENTS - 1 && center[1] > 0.08) {
      // Two rows of cupped suckers face inward as each arm curls.
      for (const row of [3, 5]) {
        const normal = unit(sub(ring[row], center));
        const tangent = unit(cross(normal, axis));
        const size = radius * 0.37;
        const point = (r: number, offset: number, a: number): Vec3 => [
          ring[row][0] +
            normal[0] * offset +
            r * (axis[0] * Math.cos(a) + tangent[0] * Math.sin(a)),
          ring[row][1] +
            normal[1] * offset +
            r * (axis[1] * Math.cos(a) + tangent[1] * Math.sin(a)),
          ring[row][2] +
            normal[2] * offset +
            r * (axis[2] * Math.cos(a) + tangent[2] * Math.sin(a)),
        ];
        const well = point(0, 0, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i * TURN) / 6,
            b = ((i + 1) * TURN) / 6;
          const innerA = point(size * 0.54, size * 0.33, a);
          const innerB = point(size * 0.54, size * 0.33, b);
          m.quad(
            point(size, size * 0.18, a),
            point(size, size * 0.18, b),
            innerB,
            innerA,
            skin.rim,
          );
          m.tri(well, innerA, innerB, skin.cup);
        }
      }
    }
    previous = ring;
  }
  for (let i = 1; i < ARM_SIDES - 1; i++)
    m.tri(previous[0], previous[i], previous[i + 1], skin.bands[1]);
}

function armPalette(fury: number) {
  const back = color('#548d80', '#9c4768', fury);
  const sides = color('#396968', '#643650', fury);
  const underside = color('#83a898', '#b96675', fury);
  return {
    bands: [back, sides, sides, underside, underside, sides, sides, back],
    rim: color('#bbccb0', '#e8a28b', fury),
    cup: color('#62766b', '#874050', fury),
  };
}

function wash(
  m: Mesh,
  x: number,
  z: number,
  age: number,
  radius: number,
  strength: number,
  direction = 0,
  spread = TURN,
  reduced = false,
) {
  const life = age / (0.95 + strength * 0.12);
  if (life < 0 || life >= 1) return;
  const fade = 1 - smooth(life);
  const outer = radius + life * strength * 1.55;
  const segments = spread < TURN ? 14 : 30;
  const angle = (i: number) => direction - spread / 2 + (i / segments) * spread;
  const onWater = (r: number, a: number): Vec3 => [
    x + Math.cos(a) * r,
    SEA_LEVEL + 0.02,
    z + Math.sin(a) * r * 0.86,
  ];
  const foam = color('#729e9c', '#d4efe1', fade);
  for (let i = 0; i < segments; i++) {
    if (i % 5 === 3) continue;
    const a = angle(i),
      b = angle(i + 0.92);
    const r = outer + 0.08 * Math.sin(i * 2.4) * fade;
    const inner = r - (0.045 + 0.11 * strength) * fade;
    m.quad(onWater(inner, a), onWater(inner, b), onWater(r, b), onWater(r, a), foam);
  }
  const drops = reduced ? 7 : 21;
  for (let i = 0; i < drops; i++) {
    const t = age - (i % 4) * 0.039;
    if (t < 0 || t > 0.72) continue;
    const a = angle((((i * 13) % drops) / drops) * segments);
    const r = radius + t * (0.75 + (i % 5) * 0.21) * strength;
    const height = t * (2.1 + (i % 7) * 0.33) * strength - 5.8 * t * t;
    if (height < 0) continue;
    const size = (0.041 + (i % 4) * 0.016) * (1 - t / 0.8);
    m.sphere(
      x + Math.cos(a) * r,
      SEA_LEVEL + height,
      z + Math.sin(a) * r * 0.86,
      size,
      size * 1.65,
      size,
      foam,
      5,
      3,
    );
  }
}

export function drawKraken(
  m: Mesh,
  n: { x: number; z: number; enraged?: boolean; animation?: Readonly<KrakenAnimation> },
  time: number,
  reduced = false,
) {
  const animation = n.animation ?? { strikes: 0 };
  const p = sampleKraken(animation, time, n.enraged);
  if (p.sinkAge >= SINK) return null;
  let bodyEnd = m.data.length;
  pose(m, n.x, SEA_LEVEL, n.z, 0, () => {
    const motion = reduced ? 0.28 : 1;
    const roar = smooth(p.phaseAge / 0.32) * (1 - smooth((p.phaseAge - 0.32) / 0.67));
    const recoil = p.flinch * (1 - p.reach) * (1 - p.sink);
    const heave = -3.1 * (1 - p.rise) - 4.8 * p.sink;
    const sway = Math.sin(time * 1.68) * 0.11 * motion;
    const headX = -0.32 - p.coil * (1 - p.reach) * 0.24 + p.reach * 0.47 - recoil * 0.15;
    const headZ = sway * (1 + p.fury) - p.side * p.reach * (p.both ? 0.04 : 0.13);
    const headY =
      1.2 +
      heave +
      0.39 * p.fury +
      0.41 * roar -
      0.19 * p.reach +
      Math.sin(time * 2.4) * 0.075 * motion;
    const skin = armPalette(p.fury);
    const mantle = color('#527c75', '#77435f', p.fury);
    const collar = color('#3f645e', '#52364d', p.fury);
    const crest = color('#669c88', '#a45676', p.fury);
    const eye = color('#dfce8b', '#ffad51', p.fury);

    m.sphere(headX, headY, headZ, 1.08 + p.reach * 0.09, 1.11 + roar * 0.13, 0.87, mantle, 22, 12);
    m.sphere(headX + 0.4, headY - 0.52, headZ, 0.81, 0.55, 0.83, collar, 16, 9);
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      m.sphere(
        headX - 0.88 + t * 1.47,
        headY + 0.42 + Math.sin(t * Math.PI) * 0.69,
        headZ,
        0.17,
        0.12 + Math.sin(t * Math.PI) * (0.085 + p.fury * 0.12),
        0.19,
        crest,
        8,
        5,
      );
    }

    const blink =
      smooth((((time + 0.72) % 4.2) - 3.91) / 0.12) *
      (1 - smooth((((time + 0.72) % 4.2) - 4.03) / 0.14));
    for (const side of [-1, 1]) {
      const x = headX + 0.78;
      const y = headY + 0.25 + p.coil * (1 - p.reach) * 0.06;
      const z = headZ + side * 0.55;
      const opening = (0.18 + roar * 0.035 - 0.02 * p.fury) * (1 - blink * 0.88);
      m.sphere(x - 0.025, y, z, 0.26, 0.24, 0.18, collar, 12, 8);
      m.sphere(x + 0.06, y, z + side * 0.041, 0.18, opening, 0.13, eye, 14, 8, { emissive: 0.65 });
      m.sphere(x + 0.179, y, z + side * 0.099, 0.043, opening * 0.8, 0.052, '#223034', 10, 6);
      m.rod(
        [x - 0.1, y + 0.23, z + side * 0.071],
        [x + 0.28, y + 0.19 - 0.11 * p.fury, z + side * 0.05],
        0.085,
        crest,
        8,
      );
      for (let i = 0; i < 5; i++) {
        const along = i / 4;
        m.sphere(
          headX + 0.65 - along * 1.34,
          headY - 0.06 + along * 0.58,
          headZ + side * (0.66 + Math.sin(along * Math.PI) * 0.18),
          0.08,
          0.048,
          0.055,
          crest,
          6,
          4,
        );
      }
    }

    for (let arm = 0; arm < 8; arm++) {
      const a = (arm * TURN) / 8;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      const ripple = Math.sin(time * 2.8 - arm * 1.25) * motion;
      const whip = Math.sin(time * 6.1 - arm * 1.75) * p.fury * motion;
      const yaw = a + ripple * 0.14 + whip * 0.16;
      const side = dz < 0 ? -1 : 1;
      const root: Vec3 = [headX * 0.42 + dx * 0.63, 0.22 + heave * 0.56, headZ + dz * 0.67];
      const spread = 2.55 + (arm % 3) * 0.23 + p.fury * 0.27;
      const lift = 0.4 + 0.24 * (arm % 3) + 0.45 * p.fury;
      const rest: Curve = [
        root,
        [dx * 1.01, heave + 1.19 + ripple * 0.29 + roar * 0.68, dz * 1.32],
        [
          Math.cos(yaw) * (spread + 0.4),
          heave + lift + ripple * 0.53 + whip * 0.63 + roar * 1.37,
          Math.sin(yaw) * (spread + 0.4),
        ],
        [
          Math.cos(yaw + 0.27) * spread,
          heave + 0.12 + ripple * 0.41 + whip * 0.68 + roar * 0.64,
          Math.sin(yaw + 0.27) * spread,
        ],
      ];
      let curve = rest;
      if ((arm === 1 || arm === 7) && (side === p.side || p.both)) {
        const high = p.both ? p.fury : 0;
        const coil: Curve = [
          root,
          [0.64, 1.45 + heave, side * 2.05],
          [0.57, 4.5 + 1.4 * high + heave, side * (2.84 + 0.45 * high)],
          [1.46, 2.98 + 0.84 * high + heave, side * 2.39],
        ];
        const lash: Curve = [
          root,
          [1.46, 2.12 + 0.47 * high + heave, side * 1.22],
          [3.01, 2.82 + 0.25 * high + heave, side * (1.43 - 0.63 * high)],
          [
            DECK_X + (side === p.side ? 0.16 : -0.29),
            PEQUOD.deck + 0.03 + heave,
            side * (p.both ? -0.49 : 0.62),
          ],
        ];
        // The tip reaches the deck on the hit, then the arm folds back out to sea.
        const active = side === p.side ? 1 : Math.max(smooth(p.phaseAge / 0.27), p.reach);
        const curled =
          p.coil * (1 - p.reach) * (p.swing > 0 ? 1 - smooth(p.swing / 0.55) : 1) * active;
        const point = (i: 1 | 2 | 3) => blend(blend(rest[i], coil[i], curled), lash[i], p.reach);
        curve = [root, point(1), point(2), point(3)];
      }
      drawArm(m, curve, a, 0.254 + p.fury * 0.047, skin);
    }
    bodyEnd = m.data.length;

    wash(m, 0, 0, p.elapsed - 0.22, 0.93, 1.7, 0, TURN, reduced);
    wash(m, 0, 0, p.phaseAge - 0.15, 1.17, 2.05, 0, TURN, reduced);
    wash(m, 0, 0, p.sinkAge - 0.38, 0.89, 1.55, 0, TURN, reduced);
    const last = animation.lastStrike;
    if (last) {
      const impactAge = time - last.at;
      const side = (animation.strikes - 1) % 2 === 0 ? 1 : -1;
      wash(
        m,
        DECK_X - 0.55,
        side * 1.28,
        impactAge,
        0.17,
        0.99,
        (side * Math.PI) / 2,
        2.45,
        reduced,
      );
      if (last.enraged)
        wash(
          m,
          DECK_X - 0.93,
          -side * 1.12,
          impactAge + 0.035,
          0.18,
          1.2,
          (-side * Math.PI) / 2,
          2.65,
          reduced,
        );
    }
  });
  return bodyEnd;
}
