import { GOBLIN_BUSH_GUARD } from './goblin-bush.ts';
import { GOBLIN_CITY_HALL, GOBLIN_KING, INCUBATOR_GUARD, INCUBATOR_VETERAN } from './goblin-incubator-cave.ts';
import { drawGoblinHelmet } from './goblin-helmet-model.ts';
import { ONODA } from './onoda-island.ts';
import { GOBLIN_CATAPULT } from './config/goblin-catapult.ts';
import { requiredValue } from './types/assert.ts';
interface MonsterPose {
  id?: string | number;
  modelVariant?: 'mechanic' | 'scientist' | 'plumber' | 'founder' | 'farmer';
  combatKind: string;
  x: number;
  z: number;
  base: number;
  angle: number;
  phase?: number;
  motion?: number;
  affection?: number;
  attackAnimation?: number;
  rangedAnimation?: boolean;
  enemy?: string | number | null;
}
import { drawHumanNPC } from './human-npc.ts';
import type { Mesh } from './geometry.ts';
import { pose, rand } from './geometry.ts';
import { MONSTER_STATS } from './monster-drops.ts';
import { drawBison } from './bison-model.ts';
import { attackPulse, creatureLunge } from './creature-attack-pose.ts';
import { GOBLIN_INCUBATOR } from './goblin-town.ts';
import { IRON_ARMOR_COLORS } from './iron-armor-appearance.ts';
import type { Actor } from './types/world.ts';

export function goblinModelVariant(
  npc: Partial<Pick<Actor, 'id' | 'kind'>>,
): MonsterPose['modelVariant'] {
  if (npc.id === GOBLIN_INCUBATOR.founder.id || npc.id === GOBLIN_CITY_HALL.clerk.id) return 'founder';
  switch (npc.kind) {
    case 'atv-rental':
    case 'goblin-space-engineer':
      return 'mechanic';
    case 'goblin-industrialist':
    case 'goblin-scientist':
    case GOBLIN_CATAPULT.scientist.id:
      return 'scientist';
    case 'goblin-plumber':
      return 'plumber';
    case 'goblin-frog-farmer':
      return 'farmer';
  }
}

function goblinSkin(kind: string) {
  if (kind === 'goblin-veteran' || kind === INCUBATOR_VETERAN || kind === GOBLIN_KING)
    return '#536e48';
  return kind === 'goblin-guard' || kind === GOBLIN_BUSH_GUARD || kind === INCUBATOR_GUARD
    ? '#82944b' : '#6f9554';
}

function drawGoblinIronPlates(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  rings: readonly [height: number, widthRadius: number, depthRadius: number][],
  color: string,
) {
  const sides = 12;
  const meshRings = rings.map(([height, width, depth]) =>
    Array.from({ length: sides }, (_, side) => {
      const angle = (side * Math.PI * 2) / sides;
      return [x + width * Math.cos(angle), y + height, z + depth * Math.sin(angle)];
    }),
  );
  for (let ring = 1; ring < meshRings.length; ring++) {
    const lower = meshRings[ring - 1];
    const upper = meshRings[ring];
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      m.quad(lower[next], lower[side], upper[side], upper[next], color);
    }
  }
}

export function drawGoblinHead(m: Mesh, actor: MonsterPose) {
  pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
    const guard = actor.combatKind === 'goblin-guard' || actor.combatKind === GOBLIN_BUSH_GUARD ||
      actor.combatKind === INCUBATOR_GUARD;
    const veteran = actor.combatKind === 'goblin-veteran' || actor.combatKind === INCUBATOR_VETERAN;
    const plumber = actor.modelVariant === 'plumber';
    const green = goblinSkin(actor.combatKind);
    m.sphere(0, 1.03, 0.03, 0.24, 0.23, 0.19, green, 16, 10);
    m.sphere(0, 0.95, 0.156, 0.15, 0.103, 0.104, '#77934d', 13, 8);
    const smilePoint = (u: number) => {
      const x = u * 0.091;
      const y = 0.896 + 0.017 * u * u;
      const z = 0.156 + 0.104 * Math.sqrt(1 - (x / 0.15) ** 2 - ((y - 0.95) / 0.103) ** 2);
      return [x, y, z + 0.004];
    };
    for (let i = 0; i < 6; i++)
      m.rod(smilePoint(i / 3 - 1), smilePoint((i + 1) / 3 - 1), 0.007, '#536236', 6);
    m.sphere(0, 0.99, 0.23, 0.085, 0.075, 0.1, green, 10, 6);
    for (const s of [-1, 1] satisfies [number, number]) {
      m.tri(
        [s * 0.18, 1.12, 0] satisfies [number, number, number],
        [s * 0.5, 1.23, -0.03] satisfies [number, number, number],
        [s * 0.22, 0.98, 0.02] satisfies [number, number, number],
        green,
      );
      m.tri(
        [s * 0.22, 0.98, 0.02] satisfies [number, number, number],
        [s * 0.5, 1.23, -0.03] satisfies [number, number, number],
        [s * 0.18, 1.12, 0] satisfies [number, number, number],
        green,
      );
      m.sphere(s * 0.175, 1.01, 0.141, 0.073, 0.075, 0.053, '#8aa45e', 10, 7);
      m.rod([s * 0.064, 0.891, 0.233], [s * 0.081, 0.938, 0.25], 0.012, '#ddd0a2', 7);
      m.rod([s * 0.052, 1.12, 0.211], [s * 0.152, 1.138, 0.179], 0.022, '#4c603b', 7);
      m.sphere(s * 0.1, 1.08, 0.192, 0.04, 0.025, 0.015, '#e9c96e', 10, 6);
      m.sphere(s * 0.1, 1.08, 0.206, 0.013, 0.021, 0.009, '#242b24', 8, 4);
    }
    if (actor.modelVariant === 'mechanic' || plumber) {
      m.sphere(0, 1.185, 0.014, 0.255, 0.14, 0.216, plumber ? '#bd8347' : '#a57832', 14, 7);
      m.box(-0.182, 1.165, 0.09, 0.364, 0.045, 0.2, '#776441');
    }
    if (actor.modelVariant === 'farmer') {
      m.sphere(0, 1.174, 0.01, 0.35, 0.054, 0.27, '#b49a55', 16, 6, 'canvasWeave');
      m.cylinder(0, 1.175, 0.002, 0.201, 0.137, '#c4a665', 12, 0.164, 'canvasWeave');
      m.cylinder(0, 1.18, 0.002, 0.205, 0.036, '#755739', 12);
    }
    if (guard || veteran) drawGoblinHelmet(m, 1.16, 1, ['#41474a', '#50575a', '#565d60']);
    if (actor.combatKind === GOBLIN_KING) {
      const gold = '#dbad53', metal = { metal: 0.75 };
      m.cylinder(0, 1.206, 0, 0.226, 0.08, gold, 14, 0.249, metal);
      m.sphere(0, 1.258, 0, 0.217, 0.095, 0.202, '#842c51', 12, 6, 'canvasWeave');
      const point = (angle: number, h: number, r: number) => [Math.sin(angle) * r, h, Math.cos(angle) * r];
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        m.tri(point(a - 0.22, 1.275, 0.242), point(a + 0.22, 1.275, 0.242),
          point(a, 1.43 + (i === 0 ? 0.07 : 0), 0.255), gold, metal);
        const gem = point(a, 1.267, 0.252);
        m.sphere(gem[0], gem[1], gem[2], 0.026, 0.032, 0.02, i % 2 ? '#93bfa1' : '#d55765', 7, 5);
      }
    }
  });
}

/** A four-beat walk: each planted paw travels backward by exactly the
 * distance covered by the body, then lifts and swings forward to its next step. */
export function sampleBearWalk(phase: number, motion = 1, running = false) {
  const stride = MONSTER_STATS.bear.walkStride,
    stance = running ? 0.46 : 0.68,
    reach = stride * stance * (running ? 0.83 : 0.5),
    footLift = running ? 0.34 : 0.18;
  const paws = [];
  for (const side of [-1, 1] satisfies [number, number])
    for (const end of [-1, 1] satisfies [number, number]) {
      const offset = running
          ? (side === -1 ? 0 : 0.12) + (end === -1 ? 0.47 : 0)
          : (side === -1 ? 0 : 0.5) + (end === -1 ? 0.25 : 0),
        cycle = (((phase / (Math.PI * 2) + offset) % 1) + 1) % 1;
      const contact = cycle < stance,
        u = contact ? cycle / stance : (cycle - stance) / (1 - stance);
      const swing = u * u * (3 - 2 * u),
        z = (contact ? reach - 2 * reach * u : -reach + 2 * reach * swing) * motion;
      paws.push({
        side,
        end,
        x: side * 0.3,
        y: 0.1 + (contact ? 0 : Math.sin(Math.PI * u) * footLift) * motion,
        z: end * 0.39 + z,
        contact,
      });
    }
  return {
    paws,
    bob: (1 - Math.cos(phase * 2)) * (running ? 0.07 : 0.012) * motion,
    sway: Math.sin(phase) * 0.026 * motion,
    headBob: Math.sin(phase * 2 - 0.45) * 0.018 * motion,
  };
}

function drawRobocop(m: Mesh, actor: MonsterPose, time: number, firing: number) {
  const motion = actor.motion ?? 0;
  const phase = actor.phase ?? 0;
  const aim = Math.min(1, firing * 2);
  const servo = Math.sin(time / 330);
  const bob = Math.abs(Math.sin(phase)) * motion * 0.065 + servo * 0.009;
  const alloy = { metal: 0.82 };
  const steel = '#a2b4be',
    dark = '#34444e',
    joint = '#263039';
  pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
    const hip = 0.89 + bob;
    m.box(-0.15, hip - 0.03, -0.23, 0.29, 0.17, 0.46, dark, alloy);
    m.box(-0.11, hip + 0.11, -0.176, 0.22, 0.25, 0.352, joint, alloy);
    m.sphere(0.055, hip + 0.38, 0, 0.21, 0.265, 0.28, steel, 14, 9, alloy);
    m.box(0.2, hip + 0.26, -0.17, 0.035, 0.15, 0.34, dark, alloy);
    for (const side of [-1, 1]) {
      const stride = phase + (side < 0 ? Math.PI : 0);
      const step = Math.cos(stride) * motion;
      const lift = Math.max(0, Math.sin(stride)) * motion * 0.17;
      const limbZ = side * 0.156;
      const knee = [0.11 + step * 0.16, 0.49 + lift * 0.46 + bob, limbZ] as const;
      const ankle = [step * 0.29 - 0.03, 0.13 + lift, limbZ];
      m.rod([0, hip, limbZ], knee, 0.106, dark, 9, alloy);
      m.rod(knee, ankle, 0.073, steel, 9, alloy);
      m.rod(
        [knee[0], knee[1], limbZ + side * 0.064],
        [ankle[0], ankle[1], limbZ + side * 0.064],
        0.027,
        dark,
        7,
        alloy,
      );
      m.sphere(...knee, 0.1, 0.104, 0.09, joint, 10, 7, alloy);
      m.box(ankle[0] - 0.095, lift + 0.02, limbZ - 0.092, 0.27, 0.13, 0.184, dark, alloy);

      const armZ = side * 0.29,
        raise = side === 1 ? aim : 0;
      const shoulder = [0, hip + 0.49, armZ];
      const elbow = [-step * 0.14 + raise * 0.24, hip + 0.23 + raise * 0.13, armZ + side * 0.048];
      const fist = [0.02 - step * 0.24 + raise * 0.55, hip - 0.01 + raise * 0.41, armZ] as const;
      m.rod(shoulder, elbow, 0.09, steel, 9, alloy);
      m.rod(elbow, fist, 0.077, dark, 9, alloy);
      m.sphere(0, hip + 0.49, armZ, 0.125, 0.105, 0.114, steel, 12, 7, alloy);
      m.sphere(...fist, 0.086, 0.072, 0.082, joint, 9, 6, alloy);
      if (side === 1) {
        const muzzle = [fist[0] + 0.08, fist[1], fist[2]] as const;
        m.rod(fist, muzzle, 0.061, dark, 9, alloy);
        m.sphere(...muzzle, 0.023, 0.041, 0.041, '#7deaff', 9, 6, {
          emissive: firing > 0.75 ? 1 : 0.35,
        });
      }
      m.box(
        0.24,
        hip + 0.34,
        armZ * 0.44 - 0.032,
        0.025,
        0.031,
        0.064,
        side > 0 ? '#719fe0' : '#d75850',
        { emissive: firing > 0 ? 0.85 : 0.42 },
      );
    }
    const head = hip + 0.77;
    const turn = servo * 0.14 * (1 - motion) * (1 - aim);
    pose(m, 0.05, head, 0, turn, () => {
      m.sphere(0, 0, 0, 0.16, 0.175, 0.166, steel, 14, 9, alloy);
      m.box(0.111, -0.038, -0.145, 0.06, 0.075, 0.29, joint, alloy);
      m.box(0.173, 0.006, -0.127, 0.014, 0.018, 0.254, '#f36e60', { emissive: 0.65 + servo * 0.2 });
      m.box(0.117, -0.114, -0.096, 0.046, 0.065, 0.192, dark, alloy);
    });
  });
}

export function drawWildMonster(m: Mesh, actor: MonsterPose, time = 0, reduced = false) {
  const attack = reduced ? 0 : (actor.attackAnimation ?? 0);
  const chasing = !reduced && actor.enemy != null;
  const progress = 1 - attack;
  const lunge = creatureLunge(actor.combatKind);
  const load = lunge
    ? attackPulse(progress, 0, 0.25, lunge.impact)
    : attackPulse(progress, 0, 0.16, 0.36);
  const strike = lunge
    ? attackPulse(progress, 0.23, lunge.impact, 0.94)
    : attackPulse(progress, 0.12, 0.39, 1);
  const stats = requiredValue(
    MONSTER_STATS[actor.combatKind],
    'Unknown monster model: ' + actor.combatKind,
  );
  if (stats.model === 'raccoon') {
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      const gray = '#777670',
        mask = '#312f30',
        cream = '#d4cdbc',
        phase = actor.phase || 0,
        reach = strike * 0.18,
        headX = 0.3 + reach,
        headY = 0.37 - strike * 0.055 + load * 0.03;
      m.sphere(-0.06, 0.285, 0, 0.31, 0.18, 0.17, gray, 14, 8);
      m.sphere(headX, headY, 0, 0.162, 0.132, 0.13, cream, 14, 8);
      m.sphere(headX + 0.113, headY - 0.042, 0, 0.093, 0.061, 0.075, cream, 12, 7);
      m.sphere(headX + 0.197, headY - 0.025, 0, 0.026, 0.02, 0.035, mask, 10, 6);
      for (const side of [-1, 1]) {
        const z = side * 0.102;
        m.sphere(headX - 0.085, headY + 0.11, z, 0.058, 0.073, 0.045, gray, 10, 7);
        m.sphere(headX - 0.062, headY + 0.126, z, 0.037, 0.05, 0.028, cream, 9, 6);
        m.sphere(headX + 0.053, headY + 0.028, z, 0.095, 0.052, 0.042, mask, 12, 7);
        m.sphere(
          headX + 0.097,
          headY + 0.041,
          z + side * 0.024,
          0.014,
          0.013,
          0.012,
          '#bbb288',
          8,
          5,
        );
        for (const end of [-1, 1]) {
          const swing = Math.sin(phase + (side === end ? 0 : Math.PI)),
            stride = (actor.motion || 0) * 0.087,
            root = end > 0 ? 0.14 : -0.23,
            toe = root + swing * stride + (end > 0 ? reach : 0),
            lift = Math.max(0, swing) * stride * 0.58;
          m.rod([root, 0.258, z], [toe, 0.05 + lift, z], 0.046, gray, 8);
          m.sphere(toe + 0.024, 0.047 + lift, z, 0.057, 0.036, 0.043, mask, 9, 6);
        }
      }
      const swish = Math.sin(time * 0.003 + phase);
      const tail = (i: number) => [-0.28 - i * 0.083, 0.285 + i * 0.015, swish * i * 0.012];
      for (let i = 0; i < 7; i++) {
        const color = i % 2 ? mask : gray,
          radius = 0.095 - i * 0.009;
        m.rod(tail(i), tail(i + 1), radius, color, 10);
      }
      const [x, y, z] = tail(7);
      m.sphere(x, y, z, 0.039, 0.038, 0.038, mask, 10, 6);
    });
    return;
  }
  if (stats.model === 'frog') {
    const stride = ((actor.phase || 0) / (Math.PI * 2)) % 1;
    const hop = (actor.motion || 0) * Math.sin(stride * Math.PI) + 0.85 * strike;
    const lunge = 0.24 * strike;
    const x = actor.x + Math.cos(actor.angle) * lunge;
    const z = actor.z + Math.sin(actor.angle) * lunge;
    pose(m, x, actor.base + 0.21 * hop, z, actor.angle, () => {
      const green = '#6b953c',
        dark = '#4d7330',
        belly = '#b3b96a';
      m.sphere(-0.105, 0.225, 0, 0.303, 0.19, 0.225, green, 14, 8);
      m.sphere(0.131, 0.215, 0, 0.244, 0.155, 0.245, green, 14, 8);
      m.sphere(0.193, 0.153, 0, 0.209, 0.086, 0.223, belly, 12, 7);
      m.rod([0.325, 0.194, -0.128], [0.366, 0.181, 0], 0.01, '#4b572b', 5);
      m.rod([0.366, 0.181, 0], [0.325, 0.194, 0.128], 0.01, '#4b572b', 5);
      for (const side of [-1, 1]) {
        const eyeZ = side * 0.149;
        m.sphere(0.15, 0.339, eyeZ, 0.113, 0.109, 0.105, dark, 12, 7);
        m.sphere(0.22, 0.368, eyeZ + 0.018 * side, 0.064, 0.063, 0.072, '#d8a347', 12, 7);
        m.sphere(0.265, 0.371, eyeZ + 0.034 * side, 0.027, 0.033, 0.05, '#252b20', 10, 6);
        const heel = -0.11 - 0.28 * hop;
        m.sphere(-0.22, 0.132 - 0.028 * hop, side * 0.223, 0.194, 0.129, 0.121, dark, 12, 7);
        m.rod([-0.31, 0.1, side * 0.25], [heel, 0.044, side * 0.29], 0.052, green, 7);
        m.rod([0.12, 0.15, side * 0.167], [0.244 + 0.08 * hop, 0.04, side * 0.21], 0.04, green, 7);
        for (let i = 0; i < 3; i++) {
          const toe = side * (0.178 + i * 0.035);
          m.rod(
            [0.239 + 0.08 * hop, 0.037, side * 0.21],
            [0.311 + 0.08 * hop, 0.025, toe],
            0.016,
            belly,
            5,
          );
          m.sphere(
            -0.03 - i * 0.083,
            0.38,
            side * (0.075 + (i % 2) * 0.047),
            0.035,
            0.02,
            0.04,
            dark,
            7,
            5,
          );
        }
      }
    });
    return;
  }
  if (stats.model === 'goat') {
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      const coat = '#d3c5a6';
      const dark = '#6b5947';
      const horn = '#a08c65';
      const ram = strike;
      const stride = (actor.motion || 0) * 0.14 * (1 - ram);
      m.sphere(-0.08 + 0.08 * ram, 0.65 - 0.06 * load, 0, 0.37, 0.207, 0.168, coat, 14, 8);
      m.sphere(-0.23, 0.68, 0, 0.22, 0.172, 0.171, '#ac9674', 12, 7);
      m.rod([-0.405, 0.74, 0], [-0.56, 0.86, 0.012], 0.047, dark, 8);
      m.rod([0.19, 0.65, 0], [0.345 + 0.09 * ram, 0.857 - 0.119 * ram, 0], 0.122, coat, 11);
      const hx = 0.375 + 0.28 * ram - 0.09 * load,
        hy = 0.89 - 0.27 * ram - 0.1 * load;
      m.sphere(hx, hy, 0, 0.137, 0.116, 0.113, coat, 12, 8);
      m.sphere(hx + 0.13, hy - 0.033, 0, 0.105, 0.067, 0.077, '#a99276', 12, 7);
      m.rod([hx + 0.08, hy - 0.077, 0], [hx + 0.033, hy - 0.22, 0], 0.04, dark, 7);
      for (const side of [-1, 1]) {
        m.sphere(hx - 0.04, hy - 0.012, side * 0.156, 0.09, 0.04, 0.075, '#b39478', 10, 6);
        m.sphere(hx + 0.049, hy + 0.03, side * 0.096, 0.024, 0.017, 0.016, '#d4a44d', 9, 5);
        m.box(hx + 0.036, hy + 0.028, side * 0.109 - 0.005, 0.033, 0.008, 0.01, '#362d25');
        m.rod(
          [hx - 0.05, hy + 0.08, side * 0.061],
          [hx - 0.107, hy + 0.224, side * 0.09],
          0.033,
          horn,
          8,
        );
        m.rod(
          [hx - 0.107, hy + 0.224, side * 0.09],
          [hx - 0.2, hy + 0.26, side * 0.1],
          0.021,
          horn,
          8,
        );
        for (const leg of [-1, 1]) {
          const x = leg < 0 ? -0.314 : 0.19;
          const swing = Math.sin((actor.phase || 0) + (leg === side ? 0 : Math.PI)) * stride;
          m.rod(
            [x, 0.604, side * 0.11],
            [x + 0.045 + swing * 0.4, 0.254, side * 0.119],
            0.048,
            coat,
            8,
          );
          m.rod(
            [x + 0.045 + swing * 0.4, 0.254, side * 0.119],
            [x + swing, 0.055, side * 0.119],
            0.026,
            dark,
            7,
          );
          m.box(x + swing - 0.035, 0.01, side * 0.119 - 0.04, 0.105, 0.07, 0.08, '#40372e');
        }
      }
    });
    return;
  }
  if (stats.model?.startsWith('legacy-')) {
    const spider = stats.model === 'legacy-spider',
      caterpillar = stats.model === 'legacy-caterpillar';
    const phase = actor.phase || 0,
      stride = actor.motion || 0;
    const body = spider ? '#514351' : caterpillar ? '#669747' : '#397579';
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      if (caterpillar) {
        for (let i = 0; i < 6; i++) {
          const y = 0.23 + 0.08 * Math.sin(phase + i * 0.6) * stride;
          m.sphere(0.46 - i * 0.17, y, 0, 0.18, 0.19, 0.18, i % 2 ? '#80a754' : body, 13, 7);
          for (const side of [-1, 1])
            m.sphere(0.46 - i * 0.17, 0.071, side * 0.137, 0.05, 0.058, 0.062, '#4b663a', 7, 5);
        }
      } else {
        m.sphere(-0.2, 0.29, 0, 0.38, spider ? 0.255 : 0.2, 0.28, body, 16, 9, { metal: 0.28 });
        m.sphere(0.14, 0.24, 0, 0.22, 0.17, 0.2, spider ? '#382f3c' : '#264f53', 13, 7);
        for (const side of [-1, 1])
          for (let leg = 0; leg < (spider ? 4 : 3); leg++) {
            const x = 0.19 - leg * 0.156;
            const swing = Math.cos(phase + leg * Math.PI + side * 1.5) * 0.11 * stride;
            const joint: [number, number, number] = [
              x + swing * 0.4,
              spider ? 0.42 : 0.25,
              side * 0.35,
            ];
            m.rod([x, 0.23, side * 0.125], joint, 0.035, body, 7);
            m.rod(
              joint,
              [x + swing - 0.09, 0.035, side * (spider ? 0.58 : 0.41)],
              0.024,
              '#443c46',
              7,
            );
          }
      }
      for (const side of [-1, 1]) {
        const x = caterpillar ? 0.6 : 0.32;
        m.sphere(
          x,
          caterpillar ? 0.32 : 0.27,
          side * 0.087,
          0.032,
          0.031,
          0.029,
          spider ? '#d99069' : '#242829',
          8,
          5,
        );
        if (!spider)
          m.rod([x - 0.06, 0.34, side * 0.08], [x + 0.07, 0.54, side * 0.14], 0.017, body, 6);
      }
    });
    return;
  }
  if (stats.model === 'sea-urchin') {
    const pulse = 1 + Math.sin((actor.phase || 0) * 2) * (actor.motion || 0) * 0.065;
    const advance = 0.94 * strike;
    const lift = 0.66 * attackPulse(progress, 0.14, 0.43, 0.96);
    const x = actor.x + Math.cos(actor.angle) * advance;
    const z = actor.z + Math.sin(actor.angle) * advance;
    pose(m, x, actor.base + lift, z, actor.angle, () => {
      m.sphere(0, 0.111, 0, 0.29 * pulse, 0.093, 0.28 * pulse, '#2d192c', 18, 7);
      m.sphere(0, 0.172, 0, 0.305 * pulse, 0.161, 0.291 * pulse, '#51283f', 20, 10);
      const rings = [
        [-0.23, 19],
        [0.16, 20],
        [0.55, 16],
        [0.94, 11],
        [1.32, 6],
      ];
      for (const [ring, [elevation, count]] of rings.entries()) {
        for (let i = 0; i < count; i++) {
          const angle = ((i + rand(i, ring, 17) * 0.48) * Math.PI * 2) / count + ring * 0.39;
          const tilt = elevation + (rand(i, ring, 18) - 0.5) * 0.18;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const horizontal = Math.cos(tilt);
          const vertical = Math.sin(tilt);
          const root = [
            0.298 * pulse * horizontal * c,
            0.172 + 0.157 * vertical,
            0.283 * pulse * horizontal * s,
          ];
          const length = (0.135 + rand(i, ring, 19) * 0.17) * pulse;
          const width = 0.012 + rand(i, ring, 20) * 0.006;
          const tip = [
            root[0] + length * horizontal * c,
            root[1] + length * vertical,
            root[2] + length * horizontal * s,
          ];
          const sides = [
            [root[0] - s * width, root[1], root[2] + c * width],
            [root[0] + s * width, root[1], root[2] - c * width],
            [
              root[0] - c * vertical * width,
              root[1] + horizontal * width,
              root[2] - s * vertical * width,
            ],
          ];
          m.tri(sides[0], sides[1], tip, '#462133');
          m.tri(sides[1], sides[2], tip, i % 4 ? '#a56588' : '#c48f97');
          m.tri(sides[2], sides[0], tip, '#733951');
          if (i % 3 === 0)
            m.sphere(root[0], root[1], root[2], 0.022, 0.016, 0.022, '#986276', 6, 4);
        }
      }
    });
    return;
  }
  if (stats.model === 'coyote' || stats.model === 'fox') {
    const fox = stats.model === 'fox';
    const phase = actor.phase || 0;
    const run = chasing ? (actor.motion || 0) * (1 - Math.max(load, strike)) : 0;
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      const fur = fox ? '#c16a39' : '#9a805f',
        back = fox ? '#9b4a30' : '#756956',
        cream = fox ? '#eadbc5' : '#d6c3a1',
        feet = fox ? '#3d3030' : cream,
        stride = (actor.motion || 0) * (0.13 + 0.21 * run) * (1 - strike),
        reach = (fox ? 0.55 : 0.6) * strike,
        chest = 0.32 * strike - 0.25 * load + (0.05 - 0.1 * Math.cos(phase)) * run,
        headX = 0.39 + reach - 0.21 * load,
        headY = 0.75 + chest - 0.13 * strike - 0.14 * run,
        gape = (fox ? 0.19 : 0.175) * attackPulse(progress, 0.07, 0.36, 0.53);
      m.sphere(
        -0.06 + reach * 0.34,
        0.57 + chest * 0.5,
        0,
        0.38 + reach * 0.13,
        0.18,
        0.15,
        fur,
        14,
        8,
      );
      m.sphere(
        -0.075 + reach * 0.34,
        0.64 + chest * 0.5,
        0,
        0.34 + reach * 0.13,
        0.119,
        0.126,
        back,
        14,
        8,
      );
      m.sphere(0.23 + reach * 0.63, 0.64 + chest, 0, 0.17 + reach * 0.14, 0.19, 0.14, fur, 12, 8);
      m.sphere(headX, headY, 0, 0.15, 0.115, 0.115, fur, 14, 8);
      m.sphere(headX + 0.12, headY - 0.034, 0, 0.14, 0.046, 0.072, cream, 12, 6);
      m.sphere(headX + 0.237, headY - 0.019, 0, 0.035, 0.029, 0.048, '#34312d', 10, 6);
      m.rod(
        [headX + 0.052, headY - 0.077, 0],
        [headX + 0.192, headY - 0.074 - gape, 0],
        0.029,
        back,
        8,
      );
      if (gape > 0.015) {
        m.sphere(
          headX + 0.132,
          headY - 0.063 - gape * 0.48,
          0,
          0.09,
          0.023 + gape * 0.32,
          0.045,
          '#412b26',
          9,
          5,
        );
        for (const side of [-1, 1])
          m.rod(
            [headX + 0.169, headY - 0.069, side * 0.044],
            [headX + 0.178, headY - 0.103, side * 0.041],
            0.01,
            '#f0e0b4',
            5,
          );
      }
      for (const side of [-1, 1]) {
        const earTip = [headX - 0.09 - 0.11 * load, headY + 0.241 - 0.11 * load, side * 0.104],
          earFront = [headX, headY + 0.06, side * 0.061],
          earBack = [headX - 0.15, headY + 0.066, side * 0.082];
        m.tri(earTip, earBack, earFront, back);
        m.tri(earTip, earFront, earBack, '#b49476');
        m.sphere(headX + 0.052, headY + 0.022, side * 0.095, 0.021, 0.015, 0.014, '#332a20', 8, 5);
        for (const front of [-1, 1]) {
          const footPhase =
              phase +
              (run > 0 ? (front > 0 ? 0 : Math.PI) + side * 0.25 : side === front ? 0 : Math.PI),
            swing = Math.sin(footPhase) * stride,
            leg = front > 0 ? 0.225 : -0.32,
            shoulderX = leg + (front > 0 ? reach * 0.65 : reach * 0.25),
            toe = leg + swing + (front > 0 ? reach * (side > 0 ? 1.2 : 0.83) : -0.1 * strike),
            stepLift = Math.max(0, Math.cos(footPhase)) * 0.24 * run,
            lift =
              stepLift +
              (front > 0 ? (side > 0 ? 0.31 : 0.22) * strike : 0.13 * strike - 0.018 * load),
            knee = (shoulderX + toe) / 2 + (front > 0 ? -0.024 : 0.07);
          m.rod(
            [shoulderX, 0.57 + chest * (front > 0 ? 1 : 0.45), side * 0.106],
            [knee, 0.255 + lift * 0.67, side * 0.107],
            0.056,
            fur,
            8,
          );
          m.rod(
            [knee, 0.255 + lift * 0.67, side * 0.107],
            [toe, 0.059 + lift, side * 0.108],
            0.032,
            feet,
            7,
          );
          m.sphere(
            toe + 0.025,
            0.045 + lift,
            side * 0.108,
            0.053,
            0.035,
            0.039,
            fox ? feet : back,
            8,
            5,
          );
        }
      }
      if (fox) {
        const swish = Math.sin(time * 0.003 + (actor.phase || 0)) * 0.08 + 0.14 * strike;
        m.rod([-0.34, 0.58, 0], [-0.63, 0.545 + 0.13 * load, swish * 0.6], 0.087, fur, 10);
        m.sphere(-0.69, 0.535 + 0.13 * load, swish * 0.85, 0.24, 0.095, 0.09, fur, 14, 8);
        m.sphere(-0.865, 0.514 + 0.17 * load, swish, 0.112, 0.06, 0.06, cream, 10, 7);
        m.sphere(0.253 + reach * 0.63, 0.536 + chest, 0, 0.114, 0.122, 0.117, cream, 10, 8);
      } else {
        m.rod([-0.37, 0.57, 0], [-0.67, 0.28 + 0.18 * strike, 0.035], 0.073, back, 10);
        m.rod(
          [-0.62, 0.33 + 0.15 * strike, 0.029],
          [-0.77, 0.19 + 0.28 * strike, 0.057],
          0.044,
          '#403a31',
          9,
        );
      }
    });
    return;
  }
  if (stats.model === 'seagull') {
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      const run = chasing ? actor.motion || 0 : 0;
      const step =
        Math.sin(actor.phase || 0) * (actor.motion || 0) * (0.08 + 0.045 * run) * (1 - strike);
      const hop = 0.62 * strike + Math.abs(step) * 0.45 * run,
        push = 0.42 * strike;
      const headX = push + 0.18 + 0.26 * strike - 0.12 * load;
      const headY = hop + 0.45 + 0.13 * load - 0.13 * strike;
      const flare = Math.max(run * 0.2, attackPulse(progress, 0, 0.4, 0.91));
      const upstroke = attackPulse(progress, 0.03, 0.28, 0.52);
      m.sphere(push, 0.3 + hop - 0.11 * load, 0, 0.25, 0.18, 0.15, '#e6e5dc', 14, 8);
      m.rod([push + 0.12, hop + 0.35, 0], [headX, headY - 0.025, 0], 0.074, '#efece1', 9);
      m.sphere(headX, headY, 0, 0.12, 0.13, 0.1, '#f5f0df', 12, 8);
      m.rod(
        [headX + 0.06, headY - 0.02, 0],
        [headX + 0.22, headY - 0.03 - 0.055 * strike, 0],
        0.035,
        '#d6a23c',
        6,
      );
      if (load > 0.02)
        m.rod(
          [headX + 0.065, headY - 0.05, 0],
          [headX + 0.17, headY - 0.05 - 0.09 * load, 0],
          0.024,
          '#b47b32',
          6,
        );
      for (const side of [-1, 1]) {
        m.sphere(
          push - 0.06,
          0.34 + hop,
          side * (0.13 + 0.07 * flare),
          0.22,
          0.055,
          0.035 + 0.07 * flare,
          '#89959c',
          12,
          6,
        );
        if (flare > 0.015) {
          const leading = [push + 0.11, 0.35 + hop, side * 0.13];
          const bend = [push - 0.13, 0.36 + hop + 0.27 * upstroke, side * (0.18 + flare * 0.37)];
          const tip = [
            push - 0.35,
            0.3 + hop + 0.41 * upstroke - 0.21 * strike,
            side * (0.2 + flare * 0.66),
          ];
          const trailing = [
            push - 0.22,
            0.32 + hop + 0.13 * upstroke,
            side * (0.13 + flare * 0.29),
          ];
          m.tri(leading, bend, trailing, '#9ba7ae');
          m.tri(trailing, bend, leading, '#d2d4ce');
          m.tri(bend, tip, trailing, '#4e585e');
          m.tri(trailing, tip, bend, '#707c84');
        }
        m.sphere(headX + 0.04, headY + 0.03, side * 0.085, 0.016, 0.017, 0.012, '#252d32', 8, 4);
        const toe = side * step + push * 0.68 - 0.08 * flare,
          lift = hop * 0.65;
        m.rod(
          [push, 0.22 + hop, side * 0.07],
          [toe, 0.04 + lift, side * 0.07],
          0.018,
          '#d9a943',
          6,
        );
        m.box(toe - 0.025, 0.02 + lift, side * 0.07 - 0.025, 0.12, 0.025, 0.07, '#d9a943');
      }
    });
    return;
  }
  if (stats.model === 'goblin') {
    const king = actor.combatKind === GOBLIN_KING;
    const throwing = king && actor.rangedAnimation;
    const shoulderLean = 0.16 * strike - 0.13 * load;
    pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
      const guard = actor.combatKind === 'goblin-guard' || actor.combatKind === GOBLIN_BUSH_GUARD ||
          actor.combatKind === INCUBATOR_GUARD,
        veteran = actor.combatKind === 'goblin-veteran' || actor.combatKind === INCUBATOR_VETERAN,
        armored = guard || veteran || king,
        plumber = actor.modelVariant === 'plumber',
        green = goblinSkin(actor.combatKind),
        cloth =
          actor.modelVariant === 'mechanic'
            ? '#a47738'
            : plumber
              ? '#426477'
              : actor.modelVariant === 'scientist'
                ? '#dad8c2'
                : actor.modelVariant === 'farmer'
                  ? '#887547'
                  : actor.modelVariant === 'founder' || actor.combatKind === 'goblin-maker'
                    ? '#805069'
                    : (stats.appearance?.shirt ?? '#83634a'),
        step = Math.sin(actor.phase || 0) * (actor.motion || 0) * 0.12;
      m.sphere(0, 0.67 - 0.07 * load, shoulderLean * 0.48, 0.25, 0.28, 0.17, cloth, 14, 8);
      const { plate, trim, knee } = king
        ? { plate: '#58394e', trim: '#c79441', knee: '#b27f46' }
        : IRON_ARMOR_COLORS;
      if (king) {
        for (const side of [-1, 1]) {
          m.quad([side * 0.25, 0.94, -0.11], [side * 0.34, 0.16, -0.26 - load * 0.09],
            [0, 0.10, -0.32 - load * 0.12], [0, 0.9, -0.16], '#691e43', 'canvasWeave');
          m.rod([side * 0.25, 0.94, -0.11], [side * 0.34, 0.16, -0.26 - load * 0.09],
            0.020, '#c79441', 7);
          m.sphere(side * 0.18, 0.855, 0.164 + shoulderLean, 0.04, 0.039, 0.024,
            '#dda64e', 9, 5, { metal: 0.77 });
        }
      }
      if (armored) {
        const chestY = 0.67 - 0.07 * load;
        const chestZ = shoulderLean * 0.48;
        drawGoblinIronPlates(
          m,
          0,
          chestY,
          chestZ,
          [
            [-0.05, 0.247, 0.178],
            [0.035, 0.26, 0.198],
            [0.142, 0.263, 0.193],
            [0.207, 0.214, 0.157],
            [0.252, 0.136, 0.115],
          ],
          plate,
        );
        drawGoblinIronPlates(
          m,
          0,
          chestY,
          chestZ,
          [
            [-0.053, 0.252, 0.182],
            [-0.024, 0.258, 0.19],
          ],
          trim,
        );
        drawGoblinIronPlates(
          m,
          0,
          chestY,
          chestZ,
          [
            [0.228, 0.181, 0.139],
            [0.253, 0.139, 0.12],
          ],
          trim,
        );
      } else {
        for (let i = 0; i < 4; i++) {
          const y = 0.49 + i * 0.079;
          m.rod([-0.19, y, 0.109], [-0.12, y + 0.032, 0.155], 0.01, '#bf9a6c', 5);
          m.rod([0.12, y + 0.032, 0.155], [0.19, y, 0.109], 0.01, '#c1a07a', 5);
        }
      }
      m.sphere(0, 0.89, -0.028, 0.171, 0.08, 0.155, '#c4a170', 13, 7);
      m.sphere(0, 0.585, 0, 0.247, 0.063, 0.174, '#423c2b', 14, 7, 'canvasWeave');
      m.box(-0.05, 0.561, 0.168, 0.1, 0.053, 0.04, '#b79b58', armored ? null : { metal: 0.55 });
      for (const s of [-1, 1]) {
        const handY = 0.428 + (throwing ? (s < 0 ? 0.72 * load + 0.37 * strike : 0.11) :
          s > 0 ? 0.39 * strike + 0.32 * load : (king ? 0.32 : 0.14) * strike);
        const handZ = s * step + (throwing ? (s < 0 ? 0.78 * strike - 0.21 * load : 0.08) :
          s > 0 ? 0.63 * strike - 0.18 * load : king ? 0.52 * strike : 0.13 * load);
        const handX = s * 0.34 - (s > 0 ? 0.22 * strike : 0);
        const shoulder = [s * 0.23, 0.8 - 0.07 * load, shoulderLean];
        const elbow = [
          s * 0.36,
          (shoulder[1] + handY) / 2 - 0.04,
          (shoulder[2] + handZ) / 2 - 0.04,
        ];
        m.rod(shoulder, elbow, 0.066, green, 8);
        m.rod(elbow, [handX, handY, handZ], 0.061, green, 8);
        m.rod(
          [s * 0.13, 0.55, 0] satisfies [number, number, number],
          [s * 0.14, 0.16, s * step] satisfies [number, number, number],
          0.075,
          '#3d4636',
          8,
        );
        m.sphere(handX, handY, handZ, 0.082, 0.086, 0.065, '#8ca968', 10, 7);
        if (king && s > 0) {
          const pitch = throwing ? 0.48 : 0.36 + 1.2 * strike - 0.48 * load;
          const at = (u: number, width = 0, thickness = 0) =>
            [handX + width, handY + Math.cos(pitch) * u - Math.sin(pitch) * thickness,
              handZ + Math.sin(pitch) * u + Math.cos(pitch) * thickness];
          m.rod(at(-0.2), at(0.23), 0.035, '#433247', 9);
          m.rod(at(0.17, -0.20), at(0.17, 0.20), 0.047, '#d2a352', 8, { metal: 0.76 });
          m.sphere(...(at(-0.215) as [number, number, number]), 0.054, 0.055, 0.054, '#aa7c36', 9, 6);
          for (const face of [-1, 1]) {
            const center = at(0.25, 0, face * 0.034);
            const flat = at(1.27, 0, face * 0.021);
            for (const edge of [-1, 1]) {
              m.quad(at(0.22, edge * 0.108), at(1.27, edge * 0.095), flat, center,
                edge === face ? '#e4d5ba' : '#8fa3aa', { metal: 0.87 });
              m.tri(at(1.27, edge * 0.095), at(1.47), flat, '#dce1d6', { metal: 0.87 });
            }
          }
        }
        m.rod([s * 0.142, 0.08, s * step], [s * 0.14, 0.265, s * step], 0.091, '#313433', 10);
        m.sphere(s * 0.14, 0.094, s * step + 0.062, 0.095, 0.082, 0.152, '#2a2b2b', 12, 7);
        if (armored) {
          const [shoulderX, shoulderY, shoulderZ] = shoulder;
          const pauldronX = shoulderX + s * 0.035;
          drawGoblinIronPlates(
            m,
            pauldronX,
            shoulderY,
            shoulderZ,
            [
              [-0.059, 0.11, 0.106],
              [0.008, 0.132, 0.127],
              [0.066, 0.1, 0.097],
              [0.097, 0.045, 0.049],
              [0.1, 0, 0],
            ],
            plate,
          );
          drawGoblinIronPlates(
            m,
            pauldronX,
            shoulderY,
            shoulderZ,
            [
              [-0.064, 0.114, 0.111],
              [-0.038, 0.123, 0.118],
            ],
            trim,
          );

          const shinZ = s * step;
          m.sphere(s * 0.14, 0.228, shinZ + 0.041, 0.089, 0.122, 0.09, plate, 10, 6);
          m.sphere(s * 0.14, 0.325, shinZ * 0.58 + 0.066, 0.077, 0.059, 0.063, knee, 10, 6);
          if (veteran)
            m.sphere(s * 0.132, 0.445, shinZ * 0.28 + 0.025, 0.089, 0.105, 0.086, plate, 10, 6);
        } else {
          for (const y of [0.12, 0.22] satisfies [number, number])
            m.box(s * 0.14 - 0.055, y, s * step + 0.195, 0.11, 0.035, 0.018, '#c4ced1', {
              metal: 0.8,
            });
        }
      }
      if (actor.modelVariant === 'mechanic' || plumber) {
        for (const side of [-1, 1])
          m.rod([side * 0.17, 0.5, 0.174], [side * 0.123, 0.84, 0.13], 0.021, '#443f35', 6);
      }
      if (plumber) {
        m.box(-0.095, 0.625, 0.153, 0.19, 0.125, 0.033, '#344b5c', 'canvasWeave');
        m.rod([0.25, 0.39, 0.19], [0.38, 0.63, 0.19], 0.024, '#a25642', 7);
        m.box(0.345, 0.61, 0.165, 0.1, 0.067, 0.05, '#9fa5a4', { metal: 0.65 });
      }
      if (actor.modelVariant === 'farmer') {
        m.box(-0.139, 0.48, 0.132, 0.278, 0.305, 0.044, '#6a5840', 'canvasWeave');
        for (const side of [-1, 1])
          m.rod([side * 0.104, 0.73, 0.161], [side * 0.156, 0.868, 0.115], 0.027, '#4f4631', 6);
      }
      if (actor.modelVariant === 'scientist') {
        m.box(-0.177, 0.6, 0.123, 0.116, 0.14, 0.032, '#827698', 'wood');
      }
      if (armored && !king) {
        m.sphere(
          -0.293,
          0.57,
          0.122,
          0.209,
          0.235,
          0.077,
          veteran ? '#913d50' : '#69704b',
          14,
          8,
          'wood',
        );
        m.sphere(-0.293, 0.565, 0.195, 0.064, 0.06, 0.034, '#c3a476', 10, 6);
      }
      if (actor.combatKind === 'goblin-maker') {
        m.box(-0.149, 0.45, 0.134, 0.298, 0.36, 0.047, '#b7814e', 'canvasWeave');
        m.box(-0.11, 0.469, 0.186, 0.22, 0.123, 0.025, '#90623f', 'wood');
        m.rod(
          [0.33, 0.44, 0.05] satisfies [number, number, number],
          [0.33, 0.76, 0.05] satisfies [number, number, number],
          0.035,
          '#ac8956',
          8,
        );
        m.box(0.19, 0.72, -0.02, 0.28, 0.16, 0.16, '#b4c1c2', { metal: 0.65 });
      }
    });
    drawGoblinHead(
      m,
      attack
        ? {
            ...actor,
            x: actor.x + Math.cos(actor.angle) * shoulderLean,
            z: actor.z + Math.sin(actor.angle) * shoulderLean,
            base: actor.base - 0.07 * load,
          }
        : actor,
    );
    return;
  }
  if (stats.model === 'bison') {
    drawBison(m, actor, time, strike, load);
    return;
  }
  if (stats.model === 'shark') {
    drawLandshark(m, actor, strike, load);
    return;
  }
  if (stats.model === 'robocop') {
    drawRobocop(m, actor, time, attack);
    return;
  }
  if (stats.model === 'terminator') {
    const firing = attack;
    drawHumanNPC(m, actor, time, {
      x: actor.x,
      z: actor.z,
      base: actor.base,
      angle: actor.angle,
      phase: actor.phase || 0,
      seated: false,
      skin: '#b3bfc0',
      shirt: '#333c41',
      appearance: {
        coat: true,
        backpack: false,
        akibo: true,
        hair: '#283034',
        pants: '#454d50',
        sunglasses: true,
        ...(firing > 0 && { action: 'attack', actionT: 1 - firing }),
        motion: actor.motion || 0,
        time: time * 0.001,
      },
      reduced: false,
    });
    pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
      m.sphere(-0.055, 1.6, 0.153, 0.036, 0.022, 0.018, '#ff4139', 12, 7, { emissive: 0.9 });
    });
    return;
  }
  if (stats.model === 'human' || stats.model === 'fighter') {
    const look = requiredValue(
      stats.appearance,
      'Human monster appearance is missing: ' + actor.combatKind,
    );
    const zombie = actor.combatKind === 'soma-zombie' || actor.combatKind === 'armed-zombie';
    const second = zombie && actor.id === 'soma-zombie-2';
    drawHumanNPC(m, actor, time, {
      x: actor.x,
      z: actor.z,
      base: actor.base,
      angle: actor.angle,
      phase: actor.phase || 0,
      seated: false,
      skin: second ? '#829460' : look.skin,
      shirt: second ? '#77794d' : look.shirt,
      appearance: {
        ...look,
        ...(actor.combatKind === ONODA.id && { camouflage: true, onodaRifle: true }),
        ...(zombie && { action: 'zombie', actionT: 0.5 }),
        ...(attack && {
          action:
            stats.attackEffect === 'explosive'
              ? 'throw-explosive'
              : stats.attackEffect === 'emf-lightning'
                ? 'emf-lightning'
                : 'attack',
          actionT: progress,
        }),
        ...(second && { female: true, hairstyle: 'bob', pants: '#695952' }),
        backpack: false,
        motion: actor.motion || 0,
        time: time * 0.001,
      },
      reduced: false,
    });
    if (actor.combatKind === 'emf-warrior')
      pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
        m.box(-0.24, 0.65, -0.23, 0.48, 0.55, 0.2, '#444e47', { metal: 0.4 });
        for (const side of [-1, 1] satisfies [number, number]) {
          m.rod(
            [side * 0.18, 1.12, -0.16] satisfies [number, number, number],
            [side * 0.25, 2.22, -0.16] satisfies [number, number, number],
            0.012,
            '#c4cccc',
            6,
            {
              metal: 0.8,
            },
          );
          m.sphere(side * 0.14, 0.94, -0.245, 0.04, 0.04, 0.015, '#d7a55c', 8, 5, {
            emissive: 0.4,
          });
        }
      });
    if (actor.combatKind === 'senior-emf-disciple')
      pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
        m.box(-0.23, 0.89, -0.29, 0.46, 0.38, 0.18, '#494455', { metal: 0.45 });
        for (const x of [-0.19, 0.19]) {
          m.cylinder(x, 1.18, -0.21, 0.055, 0.44, '#494455', 10);
          for (let i = 0; i < 5; i++)
            m.cylinder(x, 1.24 + 0.06 * i, -0.21, 0.093, 0.026, '#bb7950', 10, 0.093, {
              metal: 0.8,
            });
          m.sphere(x, 1.64, -0.21, 0.068, 0.059, 0.068, '#b6a0fd', 10, 6, {
            emissive: 0.35 + 0.65 * attack,
          });
        }
      });
    return;
  }
  const bear = actor.combatKind === 'bear' || stats.model === 'bear',
    ice = actor.combatKind === 'ice-giant',
    motion = actor.motion || 0,
    phase = actor.phase || 0;
  pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
    if (bear) {
      const blackBear = stats.model === 'bear',
        fur = blackBear ? '#433e3b' : '#80604a',
        light = blackBear ? '#897a68' : '#af8a63',
        walk = sampleBearWalk(
          phase,
          blackBear ? motion * (1 - strike) : motion,
          blackBear && chasing,
        ),
        rearUp = blackBear ? 0.46 * load : 0,
        forward = blackBear ? 0.45 * strike - 0.15 * load : 0,
        bob = walk.bob + 0.24 * load + 0.06 * strike,
        sway = walk.sway + 0.12 * load - 0.09 * strike;
      const affection = actor.affection ? Math.sin(time * 0.006) * 0.035 : 0,
        head = walk.headBob + affection + 0.11 * load - 0.17 * strike + rearUp;
      m.sphere(
        sway,
        0.79 + bob + rearUp * 0.4,
        forward * 0.6,
        0.47,
        0.49,
        0.67,
        fur,
        16,
        10,
        'stucco',
      );
      m.sphere(
        sway * 0.7,
        1.03 + bob + head,
        0.43 + forward,
        0.38,
        0.4,
        0.38,
        fur,
        16,
        10,
        'stucco',
      );
      m.sphere(sway * 0.7, 0.96 + bob + head, 0.72 + forward, 0.23, 0.17, 0.18, light, 14, 8);
      m.sphere(sway * 0.7, 1.02 + bob + head, 0.86 + forward, 0.1, 0.07, 0.06, '#303634', 12, 7);
      const snarl = blackBear ? attackPulse(progress, 0.03, 0.34, 0.64) : 0;
      if (snarl > 0.02) {
        const jawY = 0.817 + bob + head;
        m.sphere(
          sway * 0.7,
          jawY - snarl * 0.08,
          0.77 + forward,
          0.135,
          0.067 + snarl * 0.04,
          0.115,
          '#372627',
          12,
          6,
        );
        m.sphere(
          sway * 0.7,
          jawY - snarl * 0.17,
          0.755 + forward,
          0.16,
          0.068,
          0.142,
          light,
          12,
          7,
        );
      }
      for (const side of [-1, 1] satisfies [number, number]) {
        m.sphere(
          side * 0.25 + sway * 0.7,
          1.37 + bob + head,
          0.41 + forward,
          0.13,
          0.15,
          0.1,
          fur,
          12,
          7,
        );
        m.sphere(
          side * 0.25 + sway * 0.7,
          1.38 + bob + head,
          0.49 + forward,
          0.075,
          0.085,
          0.016,
          light,
          10,
          6,
        );
        m.sphere(
          side * 0.16 + sway * 0.7,
          1.15 + bob + head,
          0.73 + forward,
          0.035,
          0.036,
          0.022,
          '#282d29',
          10,
          6,
        );
        m.sphere(
          side * 0.17 + sway * 0.7,
          1.16 + bob + head,
          0.747 + forward,
          0.009,
          0.009,
          0.008,
          '#efe6d2',
          8,
          5,
        );
      }
      for (const paw of walk.paws) {
        const swipe = paw.side > 0 && paw.end > 0;
        const x = paw.x + (swipe ? 0.35 * load - 0.71 * strike : 0);
        const y =
          paw.y +
          (swipe ? 1.14 * load + 0.58 * strike : blackBear && paw.end > 0 ? 0.37 * load : 0);
        const z = paw.z + (swipe ? -0.28 * load + 0.96 * strike + forward : 0);
        const shoulder = [
            paw.side * 0.3 + sway,
            0.67 + bob + (paw.end > 0 ? rearUp : 0),
            paw.end * 0.39 + forward,
          ] satisfies [number, number, number],
          knee = [(paw.x + x) / 2, 0.33 + (y - 0.1) * 0.55, (paw.z + z) / 2 - 0.055] satisfies [
            number,
            number,
            number,
          ],
          ankle = [x, y + 0.04, z] satisfies [number, number, number];
        m.sphere(...shoulder, 0.18, 0.24, 0.2, fur, 12, 7, 'stucco');
        m.rod(shoulder, knee, 0.14, fur, 10);
        m.sphere(...knee, 0.145, 0.17, 0.155, fur, 12, 7, 'stucco');
        m.rod(knee, ankle, 0.115, fur, 10);
        m.sphere(x, y, z + 0.06, 0.17, 0.1, 0.22, '#614a3d', 12, 7);
        if (blackBear && swipe && load + strike > 0.05)
          for (const offset of [-0.09, 0, 0.09])
            m.rod(
              [x + offset, y + 0.01, z + 0.21],
              [x + offset, y - 0.04, z + 0.32],
              0.022,
              '#c8b59d',
              6,
            );
      }
      m.sphere(
        sway,
        0.85 + bob + rearUp * 0.4,
        -0.62 + forward * 0.6,
        0.13,
        0.13,
        0.13,
        fur,
        10,
        6,
      );
    } else {
      const skin = ice ? '#9dcfdf' : '#d1ddd8',
        shade = ice ? '#5b94b9' : '#8fabb5',
        frost = '#e1f3ee';
      const lean = 0.24 * strike - 0.1 * load;
      m.sphere(0, 1.85 - 0.12 * strike, lean, 0.7, 0.94, 0.43, skin, 16, 11, 'stucco');
      m.sphere(0, 2.83 - 0.12 * strike, 0.03 + lean, 0.39, 0.47, 0.32, skin, 14, 10);
      for (const side of [-1, 1] satisfies [number, number]) {
        const stride = Math.sin(phase + side * Math.PI) * motion * 0.25,
          hand = [
            side * (0.91 - 0.32 * strike),
            1.1 + stride + 1.75 * load + 0.29 * strike,
            0.08 + 1.1 * strike - 0.35 * load,
          ] satisfies [number, number, number];
        const elbow = [
          side * (0.91 - 0.09 * strike),
          1.75 + 0.85 * load,
          -stride + 0.51 * strike - 0.14 * load,
        ] satisfies [number, number, number];
        m.rod(
          [side * 0.31, 1.21, 0] satisfies [number, number, number],
          [side * 0.35, 0.58, -stride] satisfies [number, number, number],
          0.23,
          shade,
          12,
        );
        m.rod(
          [side * 0.35, 0.58, -stride] satisfies [number, number, number],
          [side * 0.36, 0.16, stride] satisfies [number, number, number],
          0.2,
          skin,
          12,
        );
        m.sphere(side * 0.36, 0.15, stride + 0.12, 0.23, 0.16, 0.34, shade, 12, 7);
        m.sphere(side * 0.64, 2.36 - 0.1 * strike, lean, 0.35, 0.39, 0.31, frost, 12, 8);
        m.rod(
          [side * 0.66, 2.3 - 0.1 * strike, lean] satisfies [number, number, number],
          elbow,
          0.22,
          skin,
          12,
        );
        m.rod(elbow, hand, 0.18, shade, 12);
        m.sphere(...hand, 0.23, 0.25, 0.21, skin, 12, 7);
        if (ice && side > 0) {
          const grip: [number, number, number] = [hand[0] + 0.13, hand[1], hand[2] + 0.07];
          const shaft = [0, Math.cos(strike * 1.18), Math.sin(strike * 1.18)];
          const along = (length: number) => grip.map((v, i) => v + length * shaft[i]);
          m.rod(along(-1), along(0.18), 0.055, shade, 10);
          const tip = along(0.35);
          m.sphere(tip[0], tip[1], tip[2], 0.17, 0.38, 0.17, '#a7e1ec', 6, 4, { emissive: 0.1 });
        } else if (!ice && side < 0)
          m.sphere(
            hand[0] - 0.03,
            hand[1] - 0.02,
            hand[2] + 0.09,
            0.32,
            0.32,
            0.3,
            '#d8e6df',
            12,
            8,
            'stucco',
          );
        m.sphere(
          side * 0.13,
          2.9 - 0.12 * strike,
          0.315 + lean,
          0.06,
          0.035,
          0.022,
          '#4b7488',
          10,
          5,
          { emissive: 0.22 },
        );
        for (let i = 0; i < 3; i++) {
          const x = side * (0.5 + i * 0.13),
            y = 2.55 - i * 0.03;
          m.tri(
            [x - 0.1, y, -0.1] satisfies [number, number, number],
            [x + 0.1, y, -0.1] satisfies [number, number, number],
            [x + side * 0.12, y + 0.43 - i * 0.06, 0] satisfies [number, number, number],
            frost,
          );
          m.tri(
            [x + 0.1, y, 0.1] satisfies [number, number, number],
            [x - 0.1, y, 0.1] satisfies [number, number, number],
            [x + side * 0.12, y + 0.43 - i * 0.06, 0] satisfies [number, number, number],
            skin,
          );
        }
      }
      m.sphere(0, 2.72 - 0.12 * strike, 0.35 + lean, 0.09, 0.11, 0.1, shade, 12, 6);
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.07;
        m.tri(
          [x - 0.045, 2.68 - 0.12 * strike, 0.3 + lean] satisfies [number, number, number],
          [x + 0.045, 2.68 - 0.12 * strike, 0.3 + lean] satisfies [number, number, number],
          [x, 2.32 - Math.abs(i - 2) * 0.05 - 0.12 * strike, 0.25 + lean] satisfies [
            number,
            number,
            number,
          ],
          frost,
        );
      }
    }
  });
}

/** A horizontal shark mesh, facing +X like the authoritative movement vector.
 * Its pectoral fins shuffle on land while the forked tail swings behind it. */
function drawLandshark(m: Mesh, actor: MonsterPose, strike: number, load: number) {
  const motion = actor.motion || 0,
    phase = actor.phase || 0,
    bob = Math.sin(phase * 2) * 0.035 * motion;
  const back = '#647f8c',
    side = '#90a6ad',
    belly = '#dce1d4',
    dark = '#293e49';
  pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
    const profiles = [
      [-1.25, 0.1, 0.11] satisfies [number, number, number],
      [-0.95, 0.22, 0.24] satisfies [number, number, number],
      [-0.5, 0.37, 0.36] satisfies [number, number, number],
      [0, 0.42, 0.4] satisfies [number, number, number],
      [0.52, 0.35, 0.34] satisfies [number, number, number],
      [0.92, 0.25, 0.26] satisfies [number, number, number],
      [1.23, 0.13, 0.15] satisfies [number, number, number],
      [1.42, 0.045, 0.055] satisfies [number, number, number],
    ];
    const headX = (x: number) => x + Math.max(0, x + 0.35) * (0.37 * strike - 0.15 * load);
    const at = (p: readonly number[], i: number) => {
      const a = (i * Math.PI) / 12;
      return [headX(p[0]), 0.66 + Math.cos(a) * p[1] + bob, Math.sin(a) * p[2]];
    };
    for (let j = 1; j < profiles.length; j++)
      for (let i = 0; i < 24; i++) {
        const y = Math.cos(((i + 0.5) * Math.PI) / 12),
          color = y < -0.2 ? belly : y > 0.5 ? back : side;
        m.quad(
          at(profiles[j - 1], i),
          at(profiles[j - 1], i + 1),
          at(profiles[j], i + 1),
          at(profiles[j], i),
          color,
        );
      }
    for (const [p, reverse] of [
      [profiles[0], false],
      [profiles.at(-1)!, true],
    ] as const)
      for (let i = 0; i < 24; i++) {
        const a = at(p, i),
          b = at(p, i + 1);
        m.tri([headX(p[0]), 0.66 + bob, 0], reverse ? b : a, reverse ? a : b, side);
      }
    const fin = (a: number[], b: number[], c: number[], color = back) => {
      const thickness = 0.024,
        A = [a[0], a[1] + bob, a[2] - thickness] satisfies [number, number, number],
        B = [b[0], b[1] + bob, b[2] - thickness] satisfies [number, number, number],
        C = [c[0], c[1] + bob, c[2] - thickness] satisfies [number, number, number],
        D = [a[0], a[1] + bob, a[2] + thickness] satisfies [number, number, number],
        E = [b[0], b[1] + bob, b[2] + thickness] satisfies [number, number, number],
        F = [c[0], c[1] + bob, c[2] + thickness] satisfies [number, number, number];
      m.tri(A, B, C, color);
      m.tri(D, F, E, color);
      m.quad(A, D, E, B, color);
      m.quad(B, E, F, C, color);
      m.quad(C, F, D, A, color);
    };
    fin(
      [-0.55, 0.96, 0] satisfies [number, number, number],
      [0.38, 1.02, 0] satisfies [number, number, number],
      [-0.18, 1.64, 0] satisfies [number, number, number],
    );
    for (const s of [-1, 1] satisfies [number, number]) {
      const step = Math.sin(phase + (s * Math.PI) / 2) * motion;
      for (const end of [-1, 1] satisfies [number, number]) {
        const stride = step * end * 0.2,
          x = end * 0.49;
        const lift = Math.max(0, -step * end) * 0.09;
        const knee = [x + 0.1 + stride * 0.34, 0.25 + lift + bob, s * 0.36];
        const ankle = [x + stride, 0.08 + lift, s * 0.39];
        m.sphere(x, 0.405 + bob, s * 0.25, 0.13, 0.144, 0.115, side, 8, 5);
        m.rod([x, 0.41 + bob, s * 0.24], knee, 0.102, side, 10);
        m.sphere(knee[0], knee[1], knee[2], 0.098, 0.094, 0.093, back, 8, 5);
        m.rod(knee, ankle, 0.064, back, 10);
        m.sphere(ankle[0] + 0.038, 0.068 + lift, ankle[2], 0.146, 0.062, 0.093, dark, 9, 6);
        for (let toe = -1; toe <= 1; toe++)
          m.sphere(
            ankle[0] + 0.13,
            0.049 + lift,
            ankle[2] + toe * 0.05,
            0.083 - Math.abs(toe) * 0.015,
            0.034,
            0.027,
            side,
            6,
            4,
          );
      }
      fin(
        [0.25, 0.44, s * 0.29] satisfies [number, number, number],
        [-0.55, 0.4, s * 0.28] satisfies [number, number, number],
        [-0.35 + step * 0.16, 0.07 + Math.max(0, step) * 0.14, s * 0.83] satisfies [
          number,
          number,
          number,
        ],
        side,
      );
      fin(
        [-0.72, 0.46, s * 0.18] satisfies [number, number, number],
        [-1, 0.45, s * 0.16] satisfies [number, number, number],
        [-0.91, 0.26, s * 0.43] satisfies [number, number, number],
        back,
      );
      // Eyes, tiny highlights, and five recessed gill slits.
      m.sphere(headX(0.86), 0.77 + bob, s * 0.235, 0.045, 0.043, 0.018, '#162a32', 12, 7);
      m.sphere(headX(0.875), 0.783 + bob, s * 0.251, 0.011, 0.012, 0.005, '#f6f0d8', 8, 5);
      for (let i = 0; i < 5; i++)
        m.rod(
          [headX(0.42 - i * 0.09), 0.77 + bob, s * (0.35 + i * 0.012)] satisfies [
            number,
            number,
            number,
          ],
          [headX(0.38 - i * 0.09), 0.49 + bob, s * (0.32 + i * 0.009)] satisfies [
            number,
            number,
            number,
          ],
          0.012,
          dark,
          5,
        );
      // Crescent mouth, with small individual ivory teeth.
      m.tri(
        [headX(0.7), 0.48 + bob, s * 0.26] satisfies [number, number, number],
        [headX(1.29), 0.55 + bob, s * 0.11] satisfies [number, number, number],
        [headX(1), 0.35 + bob - 0.13 * strike - 0.14 * load, s * 0.18] satisfies [
          number,
          number,
          number,
        ],
        dark,
      );
      for (let i = 0; i < 5; i++) {
        const x = headX(0.8 + i * 0.075),
          z = s * (0.24 - i * 0.022),
          y = 0.49 + i * 0.007 + bob;
        m.tri(
          [x - 0.022, y, z] satisfies [number, number, number],
          [x + 0.022, y, z] satisfies [number, number, number],
          [x + 0.008, y - 0.07, z] satisfies [number, number, number],
          belly,
        );
      }
    }
    const tail = Math.sin(phase) * 0.18 * motion;
    fin(
      [-1.21, 0.73, 0] satisfies [number, number, number],
      [-1.95, 1.43, tail] satisfies [number, number, number],
      [-1.64, 0.68, tail] satisfies [number, number, number],
    );
    fin(
      [-1.21, 0.62, 0] satisfies [number, number, number],
      [-1.64, 0.68, tail] satisfies [number, number, number],
      [-1.86, 0.2, tail] satisfies [number, number, number],
    );
  });
}
