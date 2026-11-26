import type { SkinnedMesh } from './types/rendering.ts';
import type { Appearance } from './types/content.ts';
import { drawWearableAccessories } from './wearable-models.ts';
import { hatById } from './hat-catalog.ts';
import { ITEM_STATS, isIronArmorLegs, isIronArmorTorso } from './item-stats.ts';
import { IRON_ARMOR_COLORS } from './iron-armor-appearance.ts';
import { isDefenseArmor, isDefenseLegArmor } from './config/defense-workshop.ts';
import { LEATHER_JACKET } from './config/leather-jacket.ts';
import { getHatGeometry } from './hat-models.ts';
import type { Mesh } from './geometry.ts';
import { rgb } from './geometry.ts';
import { sampleForwardRoll } from './forward-roll.ts';
import { rocketHopPose } from './rocket-hop.ts';
import {
  AKIMBO_MUZZLE,
  AKIMBO_SHOT_GAP,
  EMF_LIGHTNING_HAND,
  FIRING_GESTURE_SECONDS,
} from './ranged-weapon-mounts.ts';
export interface CharacterFoot {
  point: number[];
  pitch: number;
  contact: boolean;
}
export interface CharacterPose {
  matrices: Float32Array;
  joints: Float32Array;
  rotations: number[][];
  feet: CharacterFoot[];
}
export interface CharacterAppearance extends Appearance {
  phase?: number;
  mode?: string;
  action?: string;
  motion?: number;
  run?: number;
  time?: number;
  actionT?: number;
  danceBlend?: number;
  sitBlend?: number;
  ground?: ((x: number, z: number) => number) | null;
  waiting?: { tap: number; watch: number; rightWrist: number[]; leftWrist: number[] } | null;
  curly?: boolean;
  phone?: boolean;
  carryingFish?: boolean;
  pushingStroller?: boolean;
  railgun?: boolean;
  launcher?: boolean;
  akibo?: boolean;
  chef?: boolean;
  backpack?: boolean;
  uniform?: boolean;
  camouflage?: boolean;
  onodaRifle?: boolean;
  alien?: boolean;
  bayonet?: boolean;
  battleaxe?: boolean;
  combatLamp?: boolean;
  katana?: boolean;
  lightsaber?: boolean;
  lightsaberColor?: import('./config/lightsaber.ts').LightsaberColor;
  rollingPin?: boolean;
  bowlingBall?: boolean;
  crowbar?: boolean;
  trim?: string;
  bag?: string;
  gilded?: boolean;
  height?: number;
  headOnly?: boolean | 'portrait';
  serverTime?: number;
  cpuSkinning?: boolean;
  pose?: CharacterPose;
  robeTop?: boolean;
  robeBottom?: boolean;
  turtleneck?: boolean;
  gooseShirt?: boolean;
}
type EquipmentMeshPart = 'top' | 'legs' | 'boots' | 'tie' | 'phone' | 'backpack' | 'akimbo';

export interface CharacterMesh extends SkinnedMesh {
  deformed: Float32Array;
  equipmentParts: Partial<Record<EquipmentMeshPart, [number, number][]>>;
  headIndices?: number[];
  portraitIndices?: number[];
  cloakIndices?: number[];
}

type Rig = number | ((p: number[]) => number[]);

// Original meshes and clips. Research notes: docs/REFERENCE.md. The joint groups,
// indexed bind mesh and reusable poses follow the approach of classic clients;
// no RuneScape models, cache data or animation frames are included.
export const CHARACTER_CLIPS = Object.freeze({
  walk: { stride: 0.92, stance: 0.56, lift: 0.15, hip: 0.855, arm: 0.34 },
  run: { stride: 2, stance: 0.35, lift: 0.32, hip: 0.795, arm: 0.62 },
  swim: {},
  cycle: { stride: Math.PI * 0.62 },
  climb: { stride: 0.56, stance: 0.6, lift: 0.1 },
  sit: {},
  surf: {},
  skate: { stride: 2.4 },
  motorcycle: {},
  scooter: {},
  idle: {},
});
export const CHARACTER_BONES = Object.freeze({
  pelvis: 0,
  spine: 1,
  chest: 2,
  head: 3,
  leftArm: 4,
  leftForearm: 5,
  leftHand: 6,
  rightArm: 7,
  rightForearm: 8,
  rightHand: 9,
  leftThigh: 10,
  leftShin: 11,
  leftFoot: 12,
  rightThigh: 13,
  rightShin: 14,
  rightFoot: 15,
});
const CHAR_BIND = [
  [0, 0.88, 0] satisfies [number, number, number],
  [0, 1.06, 0] satisfies [number, number, number],
  [0, 1.27, 0] satisfies [number, number, number],
  [0, 1.45, 0] satisfies [number, number, number],
  [-0.245, 1.32, 0] satisfies [number, number, number],
  [-0.245, 1.01, 0] satisfies [number, number, number],
  [-0.245, 0.735, 0] satisfies [number, number, number],
  [0.245, 1.32, 0] satisfies [number, number, number],
  [0.245, 1.01, 0] satisfies [number, number, number],
  [0.245, 0.735, 0] satisfies [number, number, number],
  [-0.11, 0.88, 0] satisfies [number, number, number],
  [-0.11, 0.47, 0] satisfies [number, number, number],
  [-0.11, 0.09, 0] satisfies [number, number, number],
  [0.11, 0.88, 0] satisfies [number, number, number],
  [0.11, 0.47, 0] satisfies [number, number, number],
  [0.11, 0.09, 0] satisfies [number, number, number],
];
const CHAR_SLOT = {
  skin: 0,
  shirt: 1,
  pants: 2,
  hair: 3,
  shoe: 4,
  trim: 5,
  eye: 6,
  white: 7,
  metal: 8,
  belt: 9,
  bag: 10,
  hat: 11,
  hatTrim: 12,
  hatGem: 13,
  phoneBody: 14,
  phoneScreen: 15,
  phoneGlyph: 16,
  rainbow: 17,
  legArmorTrim: 23,
};
const CAMOUFLAGE = ['#596444', '#454d36', '#828260', '#696049', '#373d31', '#77674b'];
const CHAR_TAU = Math.PI * 2;
const charClamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const charMix = (a: number, b: number, t: number) => a + (b - a) * t;
const charUnit = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const charCross = (a: number[], b: number[]) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] satisfies [
    number,
    number,
    number,
  ];
const charSub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const charDot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function charEuler(x = 0, y = 0, z = 0) {
  const a = Math.cos(x),
    b = Math.sin(x),
    c = Math.cos(y),
    d = Math.sin(y),
    e = Math.cos(z),
    f = Math.sin(z);
  return [
    e * c,
    e * d * b - f * a,
    e * d * a + f * b,
    f * c,
    f * d * b + e * a,
    f * d * a - e * b,
    -d,
    c * b,
    c * a,
  ] satisfies [number, number, number, number, number, number, number, number, number];
}
function charMultiply(a: number[], b: number[]) {
  const r = new Array(9);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      r[y * 3 + x] = a[y * 3] * b[x] + a[y * 3 + 1] * b[x + 3] + a[y * 3 + 2] * b[x + 6];
  return r;
}
function charRotate(r: number[], p: number[]) {
  return [
    r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
    r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
    r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
  ] satisfies [number, number, number];
}
function charFrame(out: CharacterPose, id: number, p: number[], r: number[]) {
  const k = id * 12,
    b = CHAR_BIND[id];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) out.matrices[k + row * 4 + col] = r[row * 3 + col];
    out.matrices[k + row * 4 + 3] =
      p[row] - r[row * 3] * b[0] - r[row * 3 + 1] * b[1] - r[row * 3 + 2] * b[2];
    out.joints[id * 3 + row] = p[row];
  }
  out.rotations[id] = r;
}
function charJoint(out: CharacterPose, id: number) {
  return Array.from(out.joints.subarray(id * 3, id * 3 + 3));
}
function charChild(out: CharacterPose, id: number, parent: number, rotation: number[]) {
  const r = out.rotations[parent],
    offset = charRotate(r, charSub(CHAR_BIND[id], CHAR_BIND[parent])),
    p = charJoint(out, parent).map((v, i) => v + offset[i]);
  charFrame(out, id, p, charMultiply(r, rotation));
}
function charSegment(out: CharacterPose, id: number, start: number[], end: number[]) {
  const y = charUnit(charSub(start, end)),
    ref =
      Math.abs(y[2]) > 0.95
        ? ([0, 1, 0] satisfies [number, number, number])
        : ([0, 0, 1] satisfies [number, number, number]),
    x = charUnit(charCross(y, ref)),
    z = charCross(x, y);
  charFrame(out, id, start, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]] satisfies [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]);
}
function charIK(start: number[], target: number[], a: number, b: number, pole: number[]) {
  const v = charSub(target, start),
    length = Math.hypot(...v),
    d = charClamp(length, Math.abs(a - b) + 0.0001, a + b - 0.0001),
    axis = charUnit(v);
  let across = charSub(
    pole,
    axis.map((n) => n * charDot(pole, axis)),
  );
  if (Math.hypot(...across) < 0.0001)
    across = charCross(axis, [1, 0, 0] satisfies [number, number, number]);
  across = charUnit(across);
  const along = (a * a - b * b + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  return {
    knee: start.map((n, i) => n + axis[i] * along + across[i] * height),
    end: start.map((n, i) => n + axis[i] * d),
  };
}
function charHermite(a: number, b: number, da: number, db: number, t: number) {
  const t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * da + (-2 * t3 + 3 * t2) * b + (t3 - t2) * db
  );
}
function charEase(t: number) {
  const x = charClamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
function charStep(f: number, stride: number, stance: number, lift: number) {
  const reach = (stride * stance) / 2;
  if (f < stance)
    return {
      z: reach - stride * f,
      y: 0.1,
      pitch: charMix(-0.12, 0.18, f / stance),
      contact: true,
    };
  const t = (f - stance) / (1 - stance),
    travel = stride * (1 - stance);
  const turn = (0.3 / stance) * (1 - stance);
  return {
    z: charHermite(-reach, reach, -travel, -travel, t),
    y: 0.1 + Math.sin(Math.PI * t) ** 2 * lift,
    pitch: charHermite(0.18, -0.12, turn, turn, t) + 0.22 * Math.sin(Math.PI * t) ** 2,
    contact: false,
  };
}
export function createCharacterPose(): CharacterPose {
  return {
    matrices: new Float32Array(16 * 12),
    joints: new Float32Array(16 * 3),
    rotations: new Array(16),
    feet: [],
  };
}

/** Rock on the feet, drop into a one-handed kick-through, then recover. */
export function sampleBreakdancePose(phase: number, out = createCharacterPose()) {
  const progress = (((phase / CHAR_TAU) % 1) + 1) % 1;
  const floor = charEase((progress - 0.12) / 0.17) * (1 - charEase((progress - 0.75) / 0.18));
  const beat = phase * 4;
  const sway = Math.sin(beat);
  const scissor = Math.sin(phase * 3);
  const sweep = Math.cos(phase * 3);
  const blend = (a: number[], b: number[]) => a.map((value, i) => charMix(value, b[i], floor));
  const hips = blend([sway * 0.085, 0.79 + 0.035 * Math.cos(beat * 2), 0], [0.28, 0.61, 0]);
  const bodyRoll = charMix(-0.08 * sway, 1.52 + sweep * 0.16, floor);
  charFrame(out, 0, hips, charEuler(0.05, sway * 0.1, bodyRoll));
  charChild(out, 1, 0, charEuler(0.12 * (1 - floor)));
  charChild(out, 2, 1, charEuler(-0.09 * floor, -0.09 * sway));
  charChild(out, 3, 2, charEuler(-0.08, 0.24, -0.2 * floor));

  const feet: CharacterFoot[] = [];
  for (const side of [0, 1]) {
    const sign = side === 0 ? -1 : 1;
    const ankle = blend(
      [sign * 0.23, 0.095 + Math.max(0, sign * sway) ** 2 * 0.13, sign * 0.18 * sway],
      side === 0
        ? [0.76 - 0.16 * scissor, 0.43 + 0.23 * scissor, 0.26 + 0.24 * sweep]
        : [0.9 + 0.08 * scissor, 0.91 - 0.28 * scissor, -0.18 - 0.24 * sweep],
    );
    const thigh = side === 0 ? CHARACTER_BONES.leftThigh : CHARACTER_BONES.rightThigh;
    const hipOffset = charRotate(out.rotations[0], charSub(CHAR_BIND[thigh], CHAR_BIND[0]));
    const hip = hips.map((value, i) => value + hipOffset[i]);
    const leg = charIK(hip, ankle, 0.41, 0.38, [0, -0.24 * floor, 1]);
    charSegment(out, thigh, hip, leg.knee);
    charSegment(out, thigh + 1, leg.knee, leg.end);
    charFrame(
      out,
      thigh + 2,
      leg.end,
      charEuler(0.12 * sign * sway, 0, (0.78 + 0.18 * sign * sweep) * floor),
    );
    feet.push({ point: ankle, pitch: 0, contact: floor === 0 && ankle[1] === 0.095 });

    const arm = side === 0 ? CHARACTER_BONES.leftArm : CHARACTER_BONES.rightArm;
    const shoulderOffset = charRotate(out.rotations[2], charSub(CHAR_BIND[arm], CHAR_BIND[2]));
    const shoulder = charJoint(out, 2).map((value, i) => value + shoulderOffset[i]);
    const wrist =
      side === 0
        ? blend([-0.36, 0.9 + 0.15 * sway, 0.12], [-0.48, 0.075, 0.14])
        : blend([0.31, 1.01 + 0.035 * sway, 0.34], [0.13, 1.02, 0.4]);
    const limb = charIK(shoulder, wrist, 0.31, 0.275, [sign, -0.5, -0.16]);
    charSegment(out, arm, shoulder, limb.knee);
    charSegment(out, arm + 1, limb.knee, limb.end);
    charFrame(out, arm + 2, limb.end, charEuler(-Math.PI / 2, 0, 0));
  }
  out.feet = feet;
  return out;
}

/** Feet are pose targets. Two-bone IK preserves limb lengths and planted
 * contacts, including on slopes, instead of stretching cylinders between tips. */
export function sampleCharacterPose(
  mode = 'idle',
  phase = 0,
  options: CharacterAppearance = {},
  out = createCharacterPose(),
) {
  const motion = charClamp(options.motion ?? (mode === 'move' || mode === 'climb' ? 1 : 0), 0, 1),
    run = charClamp(options.run ?? 0, 0, 1),
    time = options.time || 0;
  const cycle = (((phase / CHAR_TAU) % 1) + 1) % 1,
    walk = CHARACTER_CLIPS.walk,
    jog = CHARACTER_CLIPS.run;
  const stride = charMix(walk.stride, jog.stride, run),
    stance = charMix(walk.stance, jog.stance, run),
    lift = charMix(walk.lift, jog.lift, run);
  let hip = charMix(0.86, charMix(walk.hip, jog.hip, run), motion),
    rootX = 0,
    rootZ = 0,
    lean = 0.025,
    roll = 0,
    twist = 0;
  const gesture = options.action,
    gestureT = charClamp(options.actionT || 0, 0, 1),
    gestureWeight = gestureT === 0 || gestureT === 1 ? 0 : Math.sin(Math.PI * gestureT);
  const launcherKick =
    options.launcher && gesture === 'attack'
      ? charEase(gestureT / 0.14) * (1 - charEase((gestureT - 0.14) / 0.59))
      : 0;
  const fireAge = gesture === 'attack' ? gestureT * FIRING_GESTURE_SECONDS : -1;
  const recoil = (delay: number) =>
    charEase(charClamp((fireAge - delay) / 0.028, 0, 1)) *
    (1 - charEase(charClamp((fireAge - delay - 0.028) / 0.15, 0, 1)));
  const longGunKick = options.railgun ? recoil(0) : 0;
  const usesMeleeGrip =
    options.bayonet ||
    options.crowbar ||
    options.battleaxe ||
    options.combatLamp ||
    options.katana ||
    options.lightsaber ||
    options.rollingPin;
  const meleeSwing = gesture === 'attack' && (usesMeleeGrip || options.bowlingBall);
  const swingLift = meleeSwing ? charEase(gestureT / 0.34) : 0,
    swingDown = meleeSwing ? charEase((gestureT - 0.34) / 0.25) : 0,
    swingBlend = swingLift * (1 - charEase((gestureT - 0.62) / 0.38)),
    swingLoad = swingBlend * (1 - swingDown),
    swingImpact = swingBlend * swingDown;
  const danceBeat = time * 7.2,
    rollTuck = gesture === 'forward-roll' ? sampleForwardRoll(gestureT).tuck : 0;
  const danceWeight = charClamp(options.danceBlend ?? 1, 0, 1);
  const hop = gesture === 'rocket-hop' ? rocketHopPose(gestureT) : null;
  const rest = mode === 'rest' ? charClamp(options.sitBlend ?? 1, 0, 1) : 0,
    restEase = rest * rest * (3 - 2 * rest);
  const feet: CharacterFoot[] = [];
  for (let side = 0; side < 2; side++) {
    const f = (cycle + side * 0.5) % 1,
      step = charStep(f, stride, stance, lift),
      sign = side ? 1 : -1,
      climbing =
        mode === 'climb'
          ? charStep(
              f,
              CHARACTER_CLIPS.climb.stride,
              CHARACTER_CLIPS.climb.stance,
              CHARACTER_CLIPS.climb.lift,
            )
          : null;
    let x = sign * 0.11,
      y = charMix(0.1, step.y, motion),
      z = step.z * motion,
      pitch = step.pitch * motion,
      danceLift = 0;
    if (mode === 'cycle') {
      x = sign * 0.13;
      y = 0.11 + Math.sin(-phase + side * Math.PI) * 0.17;
      z = 0.01 + Math.cos(-phase + side * Math.PI) * 0.17;
      pitch = -0.1;
    } else if (mode === 'motorcycle') {
      x = sign * 0.18;
      y = 0.16;
      z = 0.08;
      pitch = 0;
    } else if (mode === 'scooter') {
      x = sign * 0.07;
      y = 0.1;
      z = side ? -0.2 : 0.12;
      pitch = 0;
    } else if (mode === 'sit') {
      y = 0.1;
      z = 0.36;
      pitch = 0;
    } else if (mode === 'rest') {
      x = charMix(x, sign * 0.19, restEase);
      y = charMix(y, 0.1, restEase);
      z = charMix(z, 0.49, restEase);
      pitch = charMix(pitch, -0.07, restEase);
    } else if (mode === 'skate') {
      x = side ? 0.08 : -0.13;
      y = 0.1;
      z = side ? -0.24 : 0.22;
      pitch = 0;
      if (side && motion) {
        const push = Math.max(0, Math.sin(phase));
        y -= push * 0.2;
        z -= push * 0.25;
        x += push * 0.15;
      }
    } else if (mode === 'surf') {
      x = side ? -0.1 : -0.27;
      y = 0.1;
      z = side ? 0.17 : -0.18;
      pitch = 0;
    } else if (mode === 'surfboard') {
      x = sign * 0.13;
      y = 0.1;
      z = side ? -0.3 : 0.28;
      pitch = 0;
    } else if (climbing) {
      y = charMix(0.1, 0.25 + climbing.z, motion);
      z = charMix(0, 0.2 - (climbing.y - 0.1), motion);
      pitch = -0.1 * motion;
    }
    if (rollTuck) {
      x = charMix(x, sign * 0.13, rollTuck);
      y = charMix(y, 0.29, rollTuck);
      z = charMix(z, 0.22, rollTuck);
      pitch = charMix(pitch, -0.6, rollTuck);
    }
    if (hop) {
      y += hop.air * 0.1;
      z += hop.air * 0.05;
      pitch -= hop.air * 0.16;
    }
    if (gesture === 'squat') x = sign * 0.16;
    if (gesture === 'skate-trick') {
      y += 0.17 * gestureWeight;
      z = side ? -0.2 : 0.22;
      pitch = -0.1 * gestureWeight;
    }
    if (gesture === 'dance') {
      const beat = danceBeat + side * Math.PI;
      danceLift = Math.max(0, Math.sin(beat));
      x = charMix(x, sign * (0.16 + 0.09 * danceLift), danceWeight);
      y = charMix(y, 0.1 + 0.23 * danceLift ** 2, danceWeight);
      z = charMix(z, 0.045 * Math.cos(beat) + 0.18 * danceLift, danceWeight);
      pitch = charMix(pitch, -0.23 * danceLift, danceWeight);
    }
    if (options.ground && (mode === 'idle' || mode === 'move' || mode === 'rest')) {
      y += options.ground(x, z);
      pitch -= charClamp(
        Math.atan((options.ground(x, z + 0.14) - options.ground(x, z - 0.1)) / 0.24),
        -0.35,
        0.35,
      );
    }
    if (mode === 'move')
      y += Math.sin(Math.abs(step.pitch * motion)) * (step.pitch > 0 ? 0.22 : 0.09);
    if (options.waiting && side) {
      y += options.waiting.tap * 0.045;
      pitch -= options.waiting.tap * 0.16;
    }
    feet.push({
      point: [x, y, z] satisfies [number, number, number],
      pitch,
      contact:
        gesture === 'dance'
          ? danceLift < 1e-6
          : climbing
            ? !motion || climbing.contact
            : mode !== 'move' || !motion || step.contact,
    });
  }
  if (mode === 'cycle') {
    hip = 0.57;
    rootZ = -0.16;
    lean = 0.44;
  } else if (mode === 'motorcycle') {
    hip = 0.6;
    rootZ = -0.09;
    lean = 0.24;
  } else if (mode === 'scooter') {
    const tuck = gesture === 'scooter-backflip' ? Math.sin(Math.PI * gestureT) : 0;
    hip = 0.82 - tuck * 0.16;
    rootZ = -0.055;
    lean = 0.13 + tuck * 0.13;
  } else if (mode === 'sit') {
    hip = 0.57;
    lean = 0.035;
  } else if (mode === 'rest') {
    hip = charMix(0.86, 0.22, restEase);
    rootZ = -0.07 * restEase;
    lean = 0.025 + 0.11 * restEase;
  } else if (mode === 'skate') {
    hip = 0.79;
    lean = 0.12;
    twist = 0.27;
  } else if (mode === 'surf') {
    hip = 0.8;
    rootX = 0.035;
    rootZ = -0.025;
    lean = 0.12;
    roll = -0.12;
  } else if (mode === 'surfboard') {
    hip = 0.73;
    lean = 0.1;
    twist = 0.5;
    roll = Math.sin(time * 2) * 0.035;
  } else if (mode === 'climb') {
    hip = charMix(0.86, 0.84, motion);
    rootZ = -0.02 * motion;
    lean = 0.12 * motion;
    roll = Math.sin(phase) * 0.018 * motion;
  } else {
    const half = (cycle * 2) % 1;
    // A continuous rise and fall avoids a sharp body jolt at each footfall.
    const runBounce = 0.03 * (1 - Math.cos(half * CHAR_TAU));
    const bounce = charMix(0.016 * Math.sin(cycle * CHAR_TAU * 2), runBounce, run);
    hip += bounce * motion + 0.0025 * Math.sin(time * 1.7) * (1 - motion);
    rootX = Math.sin(cycle * CHAR_TAU) * 0.009 * motion;
    roll = Math.sin(cycle * CHAR_TAU) * 0.035 * motion;
    twist = Math.sin(cycle * CHAR_TAU) * 0.055 * motion;
    lean += run * motion * 0.14;
  }
  lean += 0.009 * Math.sin(time * 1.7) * (1 - motion);
  lean -= 0.08 * launcherKick + 0.06 * longGunKick;
  if (gesture === 'zombie') {
    lean += 0.13;
    roll += 0.055 * Math.sin(phase);
  }
  if (rollTuck) {
    hip -= 0.24 * rollTuck;
    lean += 0.65 * rollTuck;
    twist *= 1 - rollTuck;
    roll *= 1 - rollTuck;
  }
  if (hop) {
    hip -= hop.tuck;
    lean += hop.tuck * 0.3;
  }
  if (meleeSwing) {
    twist += -0.24 * swingLoad + 0.18 * swingImpact;
    lean += -0.12 * swingLoad + 0.22 * swingImpact;
    hip -= 0.065 * swingImpact;
    rootZ += -0.02 * swingLoad + 0.085 * swingImpact;
  } else if (gesture === 'attack') twist += 0.18 * gestureWeight;
  if (gesture === 'pet') {
    hip -= 0.34 * gestureWeight;
    lean += 0.28 * gestureWeight;
    rootZ += 0.1 * gestureWeight;
  }
  if (gesture === 'pet-bear') {
    hip -= 0.08 * gestureWeight;
    lean += 0.14 * gestureWeight;
    rootZ += 0.06 * gestureWeight;
  }
  if (gesture === 'flinch') {
    lean -= 0.15 * gestureWeight;
    hip -= 0.02 * gestureWeight;
  }
  if (gesture === 'skate-trick') {
    hip -= 0.16 * gestureWeight;
    lean = 0.08;
    twist = 0.2;
  }
  if (gesture === 'dance') {
    // Alternating knee lifts and broad arm pumps over a double-time bounce.
    // Shift weight toward the planted leg; IK keeps every limb connected.
    hip = charMix(hip, 0.78 + 0.065 * Math.cos(danceBeat * 2), danceWeight);
    rootX = charMix(rootX, Math.sin(danceBeat) * 0.095, danceWeight);
    rootZ = charMix(rootZ, 0.035 * Math.sin(danceBeat * 2), danceWeight);
    twist = charMix(twist, Math.sin(danceBeat) * 0.34, danceWeight);
    roll = charMix(roll, Math.cos(danceBeat) * 0.1, danceWeight);
    lean = charMix(lean, 0.06 + 0.055 * Math.sin(danceBeat * 2), danceWeight);
  }
  if (gesture === 'squat') {
    const depth = (1 + Math.sin(time)) / 2;
    hip -= depth * 0.27;
    lean = 0.04 + depth * 0.18;
    rootZ = -depth * 0.035;
  }
  // Lower the pelvis when a downhill foot needs more reach. All contacts
  // remain attached to the terrain instead of dangling above the road.
  const pelvisRotation = charEuler(0, twist, roll);
  for (const [side, foot] of feet.entries()) {
    const offset = charRotate(pelvisRotation, [side ? 0.11 : -0.11, 0, 0]),
      horizontal = Math.hypot(foot.point[0] - rootX - offset[0], foot.point[2] - rootZ - offset[2]);
    hip = Math.min(
      hip,
      foot.point[1] + Math.sqrt(Math.max(0.05, 0.788 ** 2 - horizontal ** 2)) - offset[1],
    );
  }
  charFrame(out, 0, [rootX, hip, rootZ] satisfies [number, number, number], pelvisRotation);
  charChild(out, 1, 0, charEuler(lean * 0.6, 0, 0));
  charChild(out, 2, 1, charEuler(lean * 0.4, -twist * 0.7, 0));
  charChild(
    out,
    3,
    2,
    charEuler(
      (options.waiting?.watch || 0) * 0.38 -
        lean * 0.35 +
        (gesture === 'dance' ? 0.07 * Math.sin(danceBeat * 2) * danceWeight : 0),
      gesture === 'dance'
        ? charMix(
            0.035 * Math.sin(time * 0.65) * (1 - motion),
            0.12 * Math.sin(danceBeat),
            danceWeight,
          )
        : 0.035 * Math.sin(time * 0.65) * (1 - motion),
      0,
    ),
  );
  for (let side = 0; side < 2; side++) {
    const thigh = side ? 13 : 10,
      shin = thigh + 1,
      footBone = thigh + 2,
      offset = charRotate(out.rotations[0], charSub(CHAR_BIND[thigh], CHAR_BIND[0])),
      start = charJoint(out, 0).map((v, i) => v + offset[i]);
    const leg = charIK(start, feet[side].point, 0.41, 0.38, [0, 0, 1] satisfies [
      number,
      number,
      number,
    ]);
    charSegment(out, thigh, start, leg.knee);
    charSegment(out, shin, leg.knee, leg.end);
    charFrame(out, footBone, leg.end, charEuler(feet[side].pitch, side ? -0.045 : 0.045, 0));
    feet[side].point = leg.end;
  }
  const launcherRotation = options.launcher ? charEuler(-0.035 - 0.17 * launcherKick) : null;
  const launcherGrip = launcherRotation
    ? [
        out.joints[CHARACTER_BONES.chest * 3] + 0.258,
        out.joints[CHARACTER_BONES.chest * 3 + 1] + 0.015 + 0.036 * launcherKick,
        0.22 - 0.085 * launcherKick,
      ]
    : null;
  for (let side = 0; side < 2; side++) {
    const arm = side ? 7 : 4,
      forearm = arm + 1,
      hand = arm + 2,
      sign = side ? 1 : -1;
    const pistolKick = options.akibo ? recoil(side ? 0 : AKIMBO_SHOT_GAP) : 0;
    const shoulder = charRotate(out.rotations[2], charSub(CHAR_BIND[arm], CHAR_BIND[2])).map(
      (v, i) => v + out.joints[2 * 3 + i],
    );
    let wrist: number[] | null = null,
      pole: number[] | null = null;
    if (options.waiting) wrist = side ? options.waiting.rightWrist : options.waiting.leftWrist;
    else if (gesture === 'zombie')
      wrist = [sign * 0.26, (side ? 1.16 : 1.04) + Math.sin(phase + sign) * 0.035, 0.36];
    else if (rollTuck)
      wrist = [sign * 0.17, charMix(0.77, 0.61, rollTuck), 0.33 * rollTuck] satisfies [
        number,
        number,
        number,
      ];
    else if (gesture === 'parachute')
      wrist = [sign * 0.34, 1.7, 0.1] satisfies [number, number, number];
    else if (gesture === 'teleport') {
      const raise = charClamp(options.actionT || 0, 0, 1);
      wrist = [sign * charMix(0.24, 0.36, raise), charMix(0.81, 1.92, raise), 0.1] satisfies [
        number,
        number,
        number,
      ];
    } else if (gesture === 'drink')
      wrist = side
        ? ([0.18, 0.96 + gestureWeight * 0.36, 0.22] satisfies [number, number, number])
        : ([-0.18, 0.81, 0.06] satisfies [number, number, number]);
    else if (gesture === 'throw-explosive' && side) {
      const reach = Math.sin(Math.PI * gestureT);
      wrist = [0.29, charMix(1.58, 0.91, gestureT) + 0.12 * reach, 0.15 + 0.43 * reach];
    } else if (gesture === 'emf-lightning') {
      const [x, y, z] = EMF_LIGHTNING_HAND;
      const settle = charClamp((gestureT - 0.48) / 0.52, 0, 1);
      wrist = side
        ? [x, charMix(y, 0.79, settle), charMix(z, 0.03, settle)]
        : [-0.27, charMix(1.0, 0.8, settle), 0.1];
    } else if (gesture === 'bottle-post')
      wrist = side
        ? ([
            0.16,
            0.94 + 0.12 * Math.sin(gestureT * Math.PI * 2),
            0.24 + 0.22 * Math.cos(gestureT * Math.PI * 2),
          ] satisfies [number, number, number])
        : ([-0.17, 1.0, 0.33] satisfies [number, number, number]);
    else if (gesture === 'ponder')
      wrist = side
        ? ([0.1, 1.34, 0.18] satisfies [number, number, number])
        : ([-0.16, 0.96, 0.12] satisfies [number, number, number]);
    else if (gesture === 'fish')
      wrist = [sign * 0.13, 0.97 + 0.13 * Math.sin(gestureT * Math.PI), 0.4] satisfies [
        number,
        number,
        number,
      ];
    else if (gesture === 'curl')
      wrist = [
        sign * 0.28,
        0.78 + (0.44 * (1 + Math.sin(time))) / 2,
        0.18 + 0.06 * Math.cos(time),
      ] satisfies [number, number, number];
    else if (gesture === 'press')
      wrist = [sign * 0.27, 1.25 + (0.46 * (1 + Math.sin(time))) / 2, 0.12] satisfies [
        number,
        number,
        number,
      ];
    else if (gesture === 'squat')
      wrist = [sign * 0.33, 1.3 - (0.27 * (1 + Math.sin(time))) / 2, -0.11] satisfies [
        number,
        number,
        number,
      ];
    else if (gesture === 'bench')
      wrist = [sign * 0.28, 1.3, 0.28 + 0.12 * Math.sin(time)] satisfies [number, number, number];
    else if (gesture === 'dance') {
      const beat = danceBeat + side * Math.PI;
      const upper = charMultiply(out.rotations[2], charEuler(0, 0, sign * 0.055)),
        lower = charMultiply(upper, charEuler(-0.12, 0, 0)),
        elbow = charRotate(upper, [0, -0.31, 0] satisfies [number, number, number]).map(
          (v, i) => v + shoulder[i],
        ),
        rest = charRotate(lower, [0, -0.275, 0] satisfies [number, number, number]).map(
          (v, i) => v + elbow[i],
        );
      const target = [
        sign * (0.33 + 0.105 * (1 + Math.cos(beat))),
        1.22 + 0.4 * Math.sin(beat),
        0.1 + 0.2 * Math.cos(beat),
      ] satisfies [number, number, number];
      wrist = rest.map((v, i) => charMix(v, target[i], danceWeight));
      pole = elbow.map((v, i) =>
        charMix(
          v - shoulder[i],
          ([sign * 0.7, -0.5, -0.15] satisfies [number, number, number])[i],
          danceWeight,
        ),
      );
    } else if (gesture === 'skate-trick')
      wrist = [sign * (0.36 + 0.2 * gestureWeight), 1.02 + 0.15 * gestureWeight, 0.06] satisfies [
        number,
        number,
        number,
      ];
    else if (gesture === 'caught') {
      const raise = charClamp(options.actionT || 0, 0, 1);
      wrist = [
        sign * charMix(0.24, 0.35, raise),
        charMix(0.81, 1.7, raise),
        charMix(0.04, 0.12, raise),
      ] satisfies [number, number, number];
    } else if (launcherGrip && launcherRotation) {
      const support = charRotate(launcherRotation, [-0.085, 0.068, 0.17]);
      wrist = side ? launcherGrip : launcherGrip.map((value, i) => value + support[i]);
      pole = [sign * 0.8, -0.62, -0.2];
    } else if (options.akibo) {
      wrist = [sign * (0.27 + 0.018 * pistolKick), 1.15 + 0.048 * pistolKick, 0.47 - 0.085 * pistolKick];
      pole = [sign * 0.82, -0.56, -0.18];
    } else if (options.railgun)
      wrist = [
        side ? 0.11 : 0.02,
        charMix(1.05, 0.6, mode === 'sit' ? 1 : restEase) + 0.056 * longGunKick,
        (side ? 0.21 : 0.49) - longGunKick * 0.09,
      ];
    else if (side && options.bowlingBall && !meleeSwing && (mode === 'idle' || mode === 'move'))
      wrist = [0.36, 0.87, 0.13];
    else if (side && options.phone && !meleeSwing)
      wrist = [0.23, 1.06, 0.24] satisfies [number, number, number];
    else if (!side && options.carryingFish)
      wrist = [-0.3, 0.86, 0.12] satisfies [number, number, number];
    else if (options.pushingStroller)
      wrist = [sign * 0.23, 0.94, 0.34] satisfies [number, number, number];
    else if (mode === 'swim')
      wrist = [
        sign * (0.38 + 0.1 * Math.sin(time * 1.8)),
        1.12 + 0.045 * Math.cos(time * 1.8),
        0.13 + 0.11 * Math.cos(time * 1.8),
      ] satisfies [number, number, number];
    else if (mode === 'paddle')
      wrist = [
        sign * 0.32,
        1.03 + 0.14 * Math.sin(time * 3 + side * Math.PI),
        0.12 + 0.18 * Math.cos(time * 3 + side * Math.PI),
      ] satisfies [number, number, number];
    else if (mode === 'surfboard')
      wrist = [sign * 0.43, 1.03 + 0.04 * Math.sin(time * 2), side ? 0.2 : -0.05];
    else if (mode === 'skate')
      wrist = [sign * 0.36, 0.9 + Math.sin(phase) * sign * 0.04, 0.1] satisfies [
        number,
        number,
        number,
      ];
    else if (mode === 'motorcycle')
      wrist = [sign * 0.21, 0.83, 0.4] satisfies [number, number, number];
    else if (mode === 'scooter') wrist = [sign * 0.21, 1.04, 0.36];
    else if (mode === 'cycle') wrist = [sign * 0.18, 0.73, 0.4] satisfies [number, number, number];
    else if (mode === 'rest')
      wrist = [
        sign * charMix(0.24, 0.2, restEase),
        charMix(0.8, 0.47, restEase),
        charMix(0.04, 0.25, restEase),
      ] satisfies [number, number, number];
    else if (gesture === 'swing')
      wrist = [sign * 0.255, 1.13, 0] satisfies [number, number, number];
    else if (mode === 'sit') wrist = [sign * 0.15, 0.81, 0.34] satisfies [number, number, number];
    else if (mode === 'surf') wrist = [-0.3, side ? 1.12 : 1.04, side ? 0.38 : 0.1];
    else if (mode === 'climb') {
      const step = charStep(
        (cycle + (side ? 0 : 0.5)) % 1,
        CHARACTER_CLIPS.climb.stride,
        CHARACTER_CLIPS.climb.stance,
        CHARACTER_CLIPS.climb.lift,
      );
      wrist = [
        sign * charMix(0.22, 0.13, motion),
        charMix(0.77, 1.4 + step.z, motion),
        charMix(0.04, 0.26 - (step.y - 0.1) * 0.6, motion),
      ] satisfies [number, number, number];
    }
    if (wrist) {
      if (gesture === 'eat' && side)
        wrist = wrist.map((v, i) =>
          charMix(v, ([0.1, 1.34, 0.19] satisfies [number, number, number])[i], gestureWeight),
        );
      const limb = charIK(
        shoulder,
        wrist,
        0.31,
        0.275,
        pole || ([sign * 0.7, -0.5, -0.15] satisfies [number, number, number]),
      );
      charSegment(out, arm, shoulder, limb.knee);
      charSegment(out, forearm, limb.knee, limb.end);
      charFrame(
        out,
        hand,
        limb.end,
        launcherRotation && side
          ? launcherRotation
          : options.akibo
            ? charEuler(-0.035 - 0.36 * pistolKick, -sign * 0.055, sign * 0.04)
            : options.railgun && side
              ? charEuler(-0.14 * longGunKick)
              : charEuler(-1.05, 0, side ? 0.12 : -0.12),
      );
    } else {
      const swing = Math.cos(cycle * CHAR_TAU) * sign * charMix(walk.arm, jog.arm, run) * motion;
      const upper = charMultiply(out.rotations[2], charEuler(swing, 0, sign * 0.055));
      const elbow = charRotate(upper, [0, -0.31, 0] satisfies [number, number, number]).map(
        (v, i) => v + shoulder[i],
      );
      const bend =
        -0.12 -
        run * 0.95 * motion -
        0.1 * Math.max(0, -Math.cos(cycle * CHAR_TAU) * sign) * motion;
      const lower = charMultiply(upper, charEuler(bend, 0, 0)),
        end = charRotate(lower, [0, -0.275, 0] satisfies [number, number, number]).map(
          (v, i) => v + elbow[i],
        );
      if (swingBlend > 0) {
        const arc = 4 * swingDown * (1 - swingDown);
        const meleeHand = side && usesMeleeGrip;
        const target = side
          ? [
              meleeHand ? charMix(0.5, 0.36, swingDown) : charMix(0.36, 0.24, swingDown),
              charMix(1.87, 1.06, swingDown) + 0.08 * arc,
              charMix(-0.11, 0.5, swingDown) + 0.26 * arc,
            ]
          : [charMix(-0.25, -0.42, swingDown), 1.1, charMix(0.23, 0.03, swingDown)];
        const goal = end.map((v, i) => charMix(v, target[i], swingBlend));
        const pole = meleeHand ? [0.1, -0.1, -1] : [sign * 0.72, -0.36, -0.2];
        const limb = charIK(shoulder, goal, 0.31, 0.275, pole);
        charSegment(out, arm, shoulder, limb.knee);
        charSegment(out, forearm, limb.knee, limb.end);
        if (meleeHand) {
          // Steer the swing while keeping the shaft perpendicular to the forearm.
          const up = charUnit(charSub(limb.knee, limb.end));
          const forward = charUnit(charCross(charRotate(lower, [1, 0, 0]), up));
          const right = charCross(up, forward);
          const grip = [
            right[0],
            up[0],
            forward[0],
            right[1],
            up[1],
            forward[1],
            right[2],
            up[2],
            forward[2],
          ];
          const turn = 0.28 * swingLoad + 2.14 * swingImpact;
          charFrame(out, hand, limb.end, charMultiply(grip, charEuler(0, turn)));
        } else {
          const wristPitch = side ? charMix(-0.28, 2.26, swingDown) : -0.32;
          charFrame(out, hand, limb.end, charMultiply(lower, charEuler(wristPitch * swingBlend)));
        }
      } else if (side === 1 && gesture === 'hammer') {
        const lift = (1 - Math.cos(time * 8)) / 2;
        const target = [0.19, 0.91 + lift * 0.42, 0.36 - lift * 0.14];
        const limb = charIK(shoulder, target, 0.31, 0.275, [0.7, -0.3, -0.1]);
        charSegment(out, arm, shoulder, limb.knee);
        charSegment(out, forearm, limb.knee, limb.end);
        charFrame(out, hand, limb.end, charEuler(-1.2 + lift, 0, 0));
      } else if (
        (side === 1 || hop) &&
        !(gesture === 'attack' && (options.railgun || options.akibo)) &&
        gestureWeight > 0 &&
        (
          ['attack', 'steal', 'talk', 'eat', 'pet', 'pet-bear', 'work', 'rocket-hop'] satisfies [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
          ]
        ).includes(gesture || '')
      ) {
        const target = hop
          ? ([sign * 0.36, 1, 0.12] satisfies [number, number, number])
          : gesture === 'eat'
            ? ([0.1, 1.34, 0.19] satisfies [number, number, number])
            : gesture === 'work'
              ? ([
                  0.1,
                  0.78 + Math.sin(time * 12) * 0.06,
                  0.43 + Math.sin(time * 12) * 0.08,
                ] satisfies [number, number, number])
              : gesture === 'pet-bear'
                ? ([
                    0.1,
                    0.94 + Math.sin(time * 9) * 0.025,
                    0.53 + Math.sin(time * 9) * 0.045,
                  ] satisfies [number, number, number])
                : gesture === 'pet'
                  ? ([
                      0.1,
                      0.48,
                      0.45 + Math.sin((options.actionT || 0) * Math.PI * 6) * 0.04,
                    ] satisfies [number, number, number])
                  : gesture === 'attack'
                    ? ([0.12, 1.23, 0.52] satisfies [number, number, number])
                    : gesture === 'steal'
                      ? ([0.12, 1.01, 0.43] satisfies [number, number, number])
                      : ([0.2, 1.18, 0.26] satisfies [number, number, number]);
        const goal = end.map((v, i) => charMix(v, target[i], gestureWeight)),
          limb = charIK(shoulder, goal, 0.31, 0.275, [sign * 0.7, -0.3, -0.1] satisfies [
            number,
            number,
            number,
          ]);
        charSegment(out, arm, shoulder, limb.knee);
        charSegment(out, forearm, limb.knee, limb.end);
        charFrame(out, hand, limb.end, charEuler(-gestureWeight, 0, 0));
      } else {
        charFrame(out, arm, shoulder, upper);
        charFrame(out, forearm, elbow, lower);
        charFrame(out, hand, end, lower);
      }
    }
  }
  out.feet = feet;
  return out;
}

class CharacterMeshBuilder {
  vertices: number[];
  indices: number[];
  bonesA: number[];
  bonesB: number[];
  weights: number[];
  slots: number[];
  shades: number[];
  lookup: Map<string, number>;
  equipmentParts: CharacterMesh['equipmentParts'] = {};
  constructor(private camouflage = false) {
    this.vertices = [];
    this.indices = [];
    this.bonesA = [];
    this.bonesB = [];
    this.weights = [];
    this.slots = [];
    this.shades = [];
    this.lookup = new Map();
  }
  tri(a: number[], b: number[], c: number[], slot: number, influence: Rig, tone = 1) {
    if (this.camouflage && (slot === CHAR_SLOT.shirt || slot === CHAR_SLOT.pants ||
      slot === CHAR_SLOT.shoe || slot === CHAR_SLOT.trim || slot === CHAR_SLOT.belt)) {
      if (Math.max(Math.hypot(...charSub(a, b)), Math.hypot(...charSub(b, c)),
        Math.hypot(...charSub(c, a))) > 0.19) {
        const midpoint = (p: number[], q: number[]) => p.map((v, i) => (v + q[i]) * 0.5);
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        this.tri(a, ab, ca, slot, influence, tone);
        this.tri(ab, b, bc, slot, influence, tone);
        this.tri(ca, bc, c, slot, influence, tone);
        this.tri(ab, bc, ca, slot, influence, tone);
        return;
      }
      const [x, y, z] = a.map((v, i) => (v + b[i] + c[i]) / 3);
      const patch = Math.floor(9 * x + Math.sin(17 * y) * 0.55) * 73856093 ^
        Math.floor(10 * y + Math.sin(26 * z) * 0.5) * 19349663 ^
        Math.floor(9 * z + Math.sin(31 * x) * 0.55) * 83492791;
      slot = CHAR_SLOT.rainbow + (patch >>> 0) % CAMOUFLAGE.length;
    }
    const normal = charUnit(charCross(charSub(b, a), charSub(c, a)));
    for (const p of [a, b, c]) {
      const rig =
        typeof influence === 'function'
          ? influence(p)
          : ([influence, influence, 0] satisfies [number, number, number]);
      const key =
        p
          .concat(normal)
          .map((v) => v.toFixed(6))
          .join(',') +
        ',' +
        rig.join(',') +
        ',' +
        slot +
        ',' +
        tone;
      let id = this.lookup.get(key);
      if (id === undefined) {
        id = this.bonesA.length;
        this.lookup.set(key, id);
        this.vertices.push(...p, ...normal);
        this.bonesA.push(rig[0]);
        this.bonesB.push(rig[1]);
        this.weights.push(rig[2]);
        this.slots.push(slot);
        this.shades.push(tone);
      }
      this.indices.push(id);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], slot: number, rig: Rig, tone = 1) {
    this.tri(a, b, c, slot, rig, tone);
    this.tri(a, c, d, slot, rig, tone);
  }
  loft(
    rings: number[][],
    slot: number,
    rig: Rig,
    segments = 8,
    cap = true,
    stripe?: { side: number; slot: number },
  ) {
    const stripeFace = stripe ? segments * (stripe.side > 0 ? 0.25 : 0.75) - stripe.side : -2;
    const at = (r: number[], i: number) => {
      const a = (i * CHAR_TAU) / segments;
      return [r[0] + Math.sin(a) * r[3], r[1], r[2] + Math.cos(a) * r[4]] satisfies [
        number,
        number,
        number,
      ];
    };
    for (let j = 0; j < rings.length - 1; j++)
      for (let i = 0; i < segments; i++)
        this.quad(
          at(rings[j], i),
          at(rings[j], i + 1),
          at(rings[j + 1], i + 1),
          at(rings[j + 1], i),
          stripe && Math.abs(i + 0.5 - stripeFace) <= 1 ? stripe.slot : slot,
          rig,
        );
    if (cap)
      for (let i = 0; i < segments; i++) {
        const a = rings[0],
          b = rings[rings.length - 1];
        this.tri(a.slice(0, 3), at(a, i + 1), at(a, i), slot, rig);
        this.tri(b.slice(0, 3), at(b, i), at(b, i + 1), slot, rig);
      }
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    slot: number,
    rig: Rig,
    tone = 1,
  ) {
    const a = [x, y, z] satisfies [number, number, number],
      b = [x + w, y, z] satisfies [number, number, number],
      c = [x + w, y, z + d] satisfies [number, number, number],
      e = [x, y, z + d] satisfies [number, number, number],
      A = [x, y + h, z] satisfies [number, number, number],
      B = [x + w, y + h, z] satisfies [number, number, number],
      C = [x + w, y + h, z + d] satisfies [number, number, number],
      E = [x, y + h, z + d] satisfies [number, number, number];
    this.quad(a, b, c, e, slot, rig, tone);
    this.quad(A, E, C, B, slot, rig, tone);
    this.quad(e, c, C, E, slot, rig, tone);
    this.quad(b, a, A, B, slot, rig, tone);
    this.quad(a, e, E, A, slot, rig, tone);
    this.quad(c, b, B, C, slot, rig, tone);
  }
  finish(): CharacterMesh {
    return {
      vertices: new Float32Array(this.vertices),
      indices: new Uint16Array(this.indices),
      bonesA: new Uint8Array(this.bonesA),
      bonesB: new Uint8Array(this.bonesB),
      weights: new Float32Array(this.weights),
      slots: new Uint8Array(this.slots),
      shades: new Float32Array(this.shades),
      deformed: new Float32Array(this.vertices.length),
      equipmentParts: this.equipmentParts,
    };
  }
  recordEquipment(part: EquipmentMeshPart, start: number) {
    const end = this.indices.length;
    if (end > start) (this.equipmentParts[part] ??= []).push([start, end]);
  }
}

const headRings = [
  [0, 1.46, 0.015, 0.069, 0.072],
  [0, 1.5, 0.007, 0.104, 0.101],
  [0, 1.59, 0, 0.123, 0.111],
  [0, 1.68, -0.006, 0.112, 0.105],
  [0, 1.727, -0.014, 0.074, 0.074],
];

const HEAD_SEGMENTS = 10;

function drawHumanSmile(m: CharacterMeshBuilder) {
  const halfWidth = 0.047;
  // The smile fits inside the two front facets of the jaw.
  const angle = CHAR_TAU / HEAD_SEGMENTS;
  const slope = (1 - Math.cos(angle)) / Math.sin(angle);
  const point = (u: number, edge: number) => {
    const x = u * halfWidth;
    const y = 1.49 + 0.014 * u * u + edge * (0.0032 - 0.0028 * u * u);
    const ring = y < headRings[1][1] ? 1 : 2;
    const lower = headRings[ring - 1];
    const upper = headRings[ring];
    const t = (y - lower[1]) / (upper[1] - lower[1]);
    const center = charMix(lower[2], upper[2], t);
    const width = charMix(lower[3], upper[3], t);
    const depth = charMix(lower[4], upper[4], t);
    return [x, y, center + depth * (1 - (slope * Math.abs(x)) / width) + 0.003];
  };
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const left = (2 * i) / segments - 1;
    const right = (2 * (i + 1)) / segments - 1;
    m.quad(
      point(left, -1),
      point(right, -1),
      point(right, 1),
      point(left, 1),
      CHAR_SLOT.skin,
      CHARACTER_BONES.head,
      0.62,
    );
  }
}

function drawSweptBackHair(m: CharacterMeshBuilder, foreheadRise = 0) {
  // Start at the forehead, tuck past each ear, and follow the nape in back.
  const hairline = [
    1.679, 1.675, 1.665, 1.643, 1.625, 1.601, 1.575, 1.516, 1.48, 1.461, 1.448, 1.443, 1.442,
  ];
  const segments = (hairline.length - 1) * 2;
  const rings = [0, 0.26, 0.56, 0.81, 1].map((rise) =>
    Array.from({ length: segments }, (_, i) => {
      const angle = (i * CHAR_TAU) / segments;
      const forehead = foreheadRise * Math.max(0, Math.cos(angle)) ** 2;
      const y = charMix(hairline[Math.min(i, segments - i)] + forehead, 1.733, rise);
      const match = headRings.findIndex((ring) => ring[1] >= y);
      const upper = match < 0 ? headRings.length : match;
      const a = headRings[Math.max(0, upper - 1)];
      const b = headRings[upper] ?? a;
      const blend = a === b ? 0 : (y - a[1]) / (b[1] - a[1]);
      const thickness = charMix(0.012, 0.021, rise);
      return [
        Math.sin(angle) * (charMix(a[3], b[3], blend) + thickness),
        y,
        charMix(a[2], b[2], blend) + Math.cos(angle) * (charMix(a[4], b[4], blend) + thickness),
      ];
    }),
  );
  rings.push(
    ...[
      [1.76, 0.067, 0.067],
      [1.776, 0.025, 0.03],
    ].map(([y, rx, rz]) =>
      Array.from({ length: segments }, (_, i) => {
        const angle = (i * CHAR_TAU) / segments;
        return [Math.sin(angle) * rx, y, -0.018 + Math.cos(angle) * rz];
      }),
    ),
  );
  const { head } = CHARACTER_BONES;
  const { hair } = CHAR_SLOT;
  for (let row = 0; row < rings.length - 1; row++)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const tone = i % 3 === 1 ? 1.045 : 1;
      m.quad(
        rings[row][i],
        rings[row][next],
        rings[row + 1][next],
        rings[row + 1][i],
        hair,
        head,
        tone,
      );
    }
  const crown = rings[rings.length - 1];
  for (let i = 0; i < segments; i++)
    m.tri([0, 1.779, -0.018], crown[i], crown[(i + 1) % segments], hair, head);
}

function drawEinsteinHair(m: CharacterMeshBuilder) {
  const { head } = CHARACTER_BONES;
  const { hair } = CHAR_SLOT;
  // The crown lifts straight up while longer wisps flare behind the temples and ears.
  const layers = [
    { count: 9, y: 1.752, radius: 0.058, flare: 0.086, rise: 0.202, width: 0.042, gap: 0 },
    { count: 13, y: 1.708, radius: 0.106, flare: 0.143, rise: 0.143, width: 0.05, gap: 0.62 },
    { count: 13, y: 1.626, radius: 0.111, flare: 0.135, rise: 0.092, width: 0.047, gap: 0.94 },
  ];
  for (const [layer, { count, y, radius, flare, rise, width, gap }] of layers.entries()) {
    for (let i = 0; i < count; i++) {
      const variation = Math.sin(i * 4.8 + layer * 2.7);
      const angle = gap + ((i + 0.25 + 0.15 * variation) * (CHAR_TAU - 2 * gap)) / count;
      const height = rise * (0.88 + variation * 0.18);
      const spread = flare * (0.83 + 0.16 * Math.cos(i * 3.45 + layer));
      const bend = 0.32 * Math.sin(i * 5.1 + layer);
      const rootY = y + 0.015 * Math.cos(i * 3.2 + layer);
      const ring = (t: number, size: number) => {
        const distance = radius + spread * t;
        const direction = angle + bend * t * t;
        return [
          Math.sin(direction) * distance,
          rootY + height * t,
          -0.026 + Math.cos(direction) * distance * 0.86 - 0.038 * t * t,
          width * size,
          width * size * 0.76,
        ];
      };
      m.loft([ring(0, 0.76), ring(0.21, 1), ring(0.62, 0.53), ring(1, 0.025)], hair, head, 6);
    }
  }
}

export function hasMargeCrown({ hairstyle, hat, cap, chef, topHat, tinfoil }: CharacterAppearance) {
  return hairstyle === 'marge' && (!hat || hat === 'none') && !cap && !chef && !topHat && !tinfoil;
}

function drawMargeHair(m: CharacterMeshBuilder) {
  const { head } = CHARACTER_BONES;
  const { hair } = CHAR_SLOT;
  const segments = 18;
  // A rounded column of tight curls rises roughly the length of the torso.
  const profile = [
    [0, 1.716, -0.025, 0.111, 0.104],
    [0, 1.753, -0.028, 0.132, 0.12],
    [0.006, 1.804, -0.033, 0.145, 0.13],
    [0.009, 1.853, -0.04, 0.153, 0.138],
    [0.012, 1.903, -0.045, 0.157, 0.141],
    [0.014, 1.953, -0.053, 0.161, 0.14],
    [0.018, 2.005, -0.057, 0.165, 0.142],
    [0.022, 2.057, -0.06, 0.164, 0.144],
    [0.024, 2.109, -0.063, 0.162, 0.142],
    [0.025, 2.16, -0.067, 0.159, 0.14],
    [0.026, 2.212, -0.067, 0.153, 0.135],
    [0.027, 2.261, -0.068, 0.141, 0.128],
    [0.03, 2.306, -0.065, 0.123, 0.114],
    [0.031, 2.348, -0.064, 0.098, 0.092],
    [0.03, 2.378, -0.064, 0.066, 0.061],
    [0.028, 2.396, -0.066, 0.031, 0.028],
  ];
  const rings = profile.map(([x, y, z, rx, rz], row) =>
    Array.from({ length: segments }, (_, i) => {
      const angle = ((i + (row % 2) * 0.38) * CHAR_TAU) / segments;
      const radius = 1 + 0.045 * Math.sin(i * 4.7 + row * 3.9);
      return [
        x + Math.sin(angle) * rx * radius,
        y + 0.007 * Math.sin(i * 3.4 + row * 2.6),
        z + Math.cos(angle) * rz * radius,
      ];
    }),
  );
  for (let row = 0; row < rings.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = rings[row][i],
        b = rings[row][next],
        c = rings[row + 1][next],
        d = rings[row + 1][i];
      const normal = charUnit(charCross(charSub(b, a), charSub(d, a)));
      const curl = a.map(
        (v, k) =>
          (v + b[k] + c[k] + d[k]) / 4 + normal[k] * (0.013 + 0.004 * Math.sin(i + row * 2)),
      );
      const tone = 1 + 0.08 * Math.sin(i * 6.1 + row * 4.2);
      m.tri(a, b, curl, hair, head, tone);
      m.tri(b, c, curl, hair, head, tone);
      m.tri(c, d, curl, hair, head, tone);
      m.tri(d, a, curl, hair, head, tone);
    }
  }
  const crown = rings[rings.length - 1];
  for (let i = 0; i < segments; i++)
    m.tri([0.027, 2.404, -0.067], crown[i], crown[(i + 1) % segments], hair, head);
}

function drawPonytail(m: CharacterMeshBuilder) {
  const { head } = CHARACTER_BONES;
  const { hair, trim } = CHAR_SLOT;
  const path = [
    [0, 1.648, -0.116, 0.032, 0.024],
    [0, 1.664, -0.142, 0.031, 0.028],
    [0, 1.678, -0.151, 0.03, 0.027],
    [0, 1.706, -0.164, 0.023, 0.021],
    [0.002, 1.746, -0.184, 0.027, 0.022],
    [0.006, 1.775, -0.219, 0.031, 0.024],
    [0.012, 1.767, -0.253, 0.034, 0.025],
    [0.021, 1.729, -0.278, 0.037, 0.025],
    [0.032, 1.672, -0.292, 0.041, 0.024],
    [0.041, 1.589, -0.292, 0.041, 0.023],
    [0.045, 1.5, -0.281, 0.036, 0.022],
    [0.048, 1.408, -0.263, 0.028, 0.017],
    [0.046, 1.326, -0.243, 0.017, 0.013],
    [0.042, 1.259, -0.232, 0.007, 0.006],
    [0.035, 1.23, -0.236, 0.001, 0.001],
  ];
  const sides = 12;
  // Angle each cross-section along the strand so it can rise and turn over the tie.
  const rings = path.map(([x, y, z, width, thickness], i) => {
    const before = path[Math.max(0, i - 1)];
    const after = path[Math.min(i + 1, path.length - 1)];
    const dy = after[1] - before[1];
    const dz = after[2] - before[2];
    const radius = thickness / Math.hypot(dy, dz);
    return Array.from({ length: sides }, (_, side) => {
      const angle = (side * CHAR_TAU) / sides;
      const offset = Math.sin(angle) * radius;
      return [x + Math.cos(angle) * width, y - dz * offset, z + dy * offset];
    });
  });
  for (let i = 0; i < rings.length - 1; i++)
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      m.quad(
        rings[i][side],
        rings[i + 1][side],
        rings[i + 1][next],
        rings[i][next],
        i === 1 ? trim : hair,
        head,
        i !== 1 && side % 4 === 1 ? 1.05 : 1,
      );
    }
  const tip = rings[rings.length - 1];
  for (let side = 0; side < sides; side++)
    m.tri([0.035, 1.23, -0.236], tip[(side + 1) % sides], tip[side], hair, head);
}

function drawBraid(m: CharacterMeshBuilder) {
  const { head } = CHARACTER_BONES;
  const { hair, trim } = CHAR_SLOT;
  for (let strand = 0; strand < 3; strand++) {
    const rings = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      const angle = CHAR_TAU * (3.5 * t + strand / 3);
      const taper = charMix(0.52, 1, t);
      return [
        0.04 * (1 - t) + Math.cos(angle) * 0.024 * taper,
        charMix(1.18, 1.638, t),
        charMix(-0.218, -0.115, t ** 2) + Math.sin(angle) * 0.022 * taper,
        0.031 * taper,
        0.029 * taper,
      ];
    });
    m.loft(rings, hair, head, 7);
  }
  m.loft(
    [
      [0.048, 1.109, -0.211, 0.009, 0.012],
      [0.044, 1.15, -0.215, 0.024, 0.022],
      [0.04, 1.186, -0.218, 0.027, 0.025],
    ],
    hair,
    head,
    8,
  );
  m.loft(
    [
      [0.041, 1.178, -0.218, 0.029, 0.027],
      [0.04, 1.193, -0.218, 0.03, 0.028],
    ],
    trim,
    head,
    8,
    false,
  );
}

const charMeshCache = new Map<string, CharacterMesh>();
function charBlend(a: number, b: number, t: number) {
  return [a, b, charClamp(t, 0, 1)] satisfies [number, number, number];
}
function charTorsoRig(p: number[]) {
  return p[1] < 1.12
    ? charBlend(0, 1, (p[1] - 0.91) / 0.21)
    : charBlend(1, 2, (p[1] - 1.12) / 0.19);
}
const jacketDepth = [
  [0.81, 0.139],
  [0.95, 0.132],
  [1.11, 0.145],
  [1.25, 0.159],
  [1.34, 0.135],
  [1.405, 0.086],
];
function garmentFront(x: number, y: number, depth: number[][], lift = 0.006) {
  const row = Math.max(
    1,
    depth.findIndex(([height]) => height >= y),
  );
  const [low, back] = depth[row - 1],
    [high, front] = depth[row];
  return [
    x,
    y,
    charMix(back, front, charClamp((y - low) / (high - low), 0, 1)) - 0.11 * Math.abs(x) + lift,
  ];
}

function drawLeatherJacket(m: CharacterMeshBuilder, waist: number, shoulder: number) {
  const S = CHAR_SLOT;
  const rings = [
    [0.84, 0.18, 0.139],
    [0.93, waist + 0.028, 0.141],
    [1.1, waist + 0.043, 0.151],
    [1.25, shoulder + 0.021, 0.167],
    [1.34, shoulder + 0.012, 0.152],
    [1.405, 0.105, 0.095],
  ];
  m.loft(rings.map(([y, width, depth]) => [0, y, 0, width - 0.015, depth - 0.021]),
    S.eye, charTorsoRig, 16);
  const opening = [0.53, 0.43, 0.33, 0.28, 0.36, 0.56];
  const shell = (row: number, segment: number) => {
    const [y, width, depth] = rings[row];
    const angle = charMix(opening[row], CHAR_TAU - opening[row], segment / 16);
    return [Math.sin(angle) * width, y, Math.cos(angle) * depth];
  };
  for (let row = 0; row < rings.length - 1; row++) {
    for (let segment = 0; segment < 16; segment++)
      m.quad(shell(row, segment), shell(row, segment + 1), shell(row + 1, segment + 1),
        shell(row + 1, segment), S.shirt, charTorsoRig);
    for (const segment of [0, 16]) {
      const a = shell(row, segment), b = shell(row + 1, segment);
      m.quad(a, [a[0], a[1], a[2] - 0.024], [b[0], b[1], b[2] - 0.024], b,
        S.trim, charTorsoRig);
    }
  }
  const at = (x: number, y: number, lift = 0.011) => {
    const row = Math.max(1, rings.findIndex(([height]) => height >= y));
    const [low, lowWidth, lowDepth] = rings[row - 1];
    const [high, highWidth, highDepth] = rings[row];
    const blend = (y - low) / (high - low);
    const width = charMix(lowWidth, highWidth, blend);
    const depth = charMix(lowDepth, highDepth, blend);
    return [x, y, depth * Math.sqrt(Math.max(0, 1 - (x / width) ** 2)) + lift];
  };
  const pull = at(0.081, 1.073);
  m.box(pull[0] - 0.006, pull[1] - 0.024, pull[2], 0.012, 0.025, 0.008, S.white, charTorsoRig, 0.56);
  for (const side of [-1, 1]) {
    const collar = [
      at(side * 0.066, 1.4, 0.016),
      at(side * 0.18, 1.33, 0.022),
      at(side * 0.096, 1.265, 0.027),
    ];
    if (side > 0) collar.reverse();
    m.tri(collar[0], collar[1], collar[2], S.shirt, charTorsoRig, 1.44);
    const stud = at(side * 0.103, 1.307, 0.026);
    m.box(stud[0] - 0.006, stud[1], stud[2], 0.012, 0.012, 0.008, S.white, charTorsoRig, 0.56);
    const base = at(side * 0.082, 0.983);
    const top = at(side * 0.166, 1.09);
    m.quad(
      base,
      [base[0] + 0.012, base[1], base[2]],
      [top[0] + 0.012, top[1], top[2]],
      top,
      S.trim,
      charTorsoRig,
      0.72,
    );
  }
}

function drawSuitFront(m: CharacterMeshBuilder) {
  const S = CHAR_SLOT;
  const at = (x: number, y: number, lift?: number) => garmentFront(x, y, jacketDepth, lift);
  const shirtWidth = (y: number) => (y - 1.11) * 0.32;
  for (const [y, top] of [
    [1.11, 1.25],
    [1.25, 1.34],
    [1.34, 1.405],
  ]) {
    const a = shirtWidth(y),
      b = shirtWidth(top);
    m.quad(at(-a, y), at(a, y), at(b, top), at(-b, top), S.white, charTorsoRig);
  }

  for (const side of [-1, 1]) {
    const p = (x: number, y: number, lift = 0.01) => at(side * x, y, lift);
    // Two faces form each notched lapel. The fold follows the chest rig.
    const lapel = [p(0.017, 1.115), p(0.108, 1.248), p(0.158, 1.322), p(0.083, 1.394)];
    if (side < 0) lapel.reverse();
    m.quad(lapel[0], lapel[1], lapel[2], lapel[3], S.shirt, charTorsoRig, 1.34);
    m.tri(p(0.108, 1.248), p(0.123, 1.317), p(0.158, 1.322), S.shirt, charTorsoRig, 0.76);
    m.tri(
      p(0, 1.385, 0.012),
      p(0.062, 1.404, 0.012),
      p(0.044, 1.346, 0.015),
      S.white,
      charTorsoRig,
      1.12,
    );

    const pocket = [p(0.082, 0.936), p(0.16, 0.947), p(0.16, 0.96), p(0.082, 0.95)];
    if (side < 0) pocket.reverse();
    m.quad(pocket[0], pocket[1], pocket[2], pocket[3], S.shirt, charTorsoRig, 1.27);
  }
  // A white pocket square and an angled top welt.
  m.quad(
    at(0.108, 1.213, 0.016),
    at(0.17, 1.223, 0.015),
    at(0.163, 1.252, 0.016),
    at(0.122, 1.24, 0.016),
    S.white,
    charTorsoRig,
  );
  m.quad(
    at(0.101, 1.209, 0.019),
    at(0.176, 1.22, 0.019),
    at(0.176, 1.229, 0.019),
    at(0.101, 1.219, 0.019),
    S.shirt,
    charTorsoRig,
    0.74,
  );
  for (const y of [0.93, 1.023, 1.108]) {
    const z = at(0, y)[2];
    m.box(-0.012, y, z, 0.024, 0.021, 0.009, S.eye, charTorsoRig, 0.63);
  }
}

const shirtDepth = [
  [0.96, 0.112],
  [1.1, 0.125],
  [1.25, 0.146],
  [1.34, 0.115],
  [1.39, 0.078],
];
function drawBlackTie(m: CharacterMeshBuilder, suit: boolean) {
  const at = (x: number, y: number, fold = 0) =>
    garmentFront(x, y, suit ? jacketDepth : shirtDepth, 0.026 + fold);
  const slot = CHAR_SLOT.eye;
  m.quad(
    at(-0.023, 1.37),
    at(-0.016, 1.337, 0.006),
    at(0.016, 1.337, 0.006),
    at(0.023, 1.37),
    slot,
    charTorsoRig,
    0.74,
  );
  const blade = [
    [1.342, 0.012],
    [1.25, 0.015],
    [1.13, 0.024],
  ];
  for (let i = 1; i < blade.length; i++) {
    const [y, width] = blade[i - 1],
      [top, spread] = blade[i];
    m.quad(
      at(-spread, top),
      at(0, top, 0.008),
      at(0, y, 0.006),
      at(-width, y),
      slot,
      charTorsoRig,
      0.53,
    );
    m.quad(
      at(0, top, 0.008),
      at(spread, top),
      at(width, y),
      at(0, y, 0.006),
      slot,
      charTorsoRig,
      0.89,
    );
  }
  m.tri(at(-0.024, 1.13), at(0, 1.097, 0.005), at(0.024, 1.13), slot, charTorsoRig, 0.7);
}
function drawDefenseArmor(m: CharacterMeshBuilder, torso: string, waist: number, shoulder: number) {
  const S = CHAR_SLOT;
  const chainmail = torso === 'steel-chainmail';
  const icy = torso === 'icy-kevlar-vest';
  const profile = [
    [chainmail ? 0.81 : 0.902, waist + 0.038, 0.139],
    [0.985, waist + 0.032, 0.145],
    [1.17, shoulder + 0.016, 0.162],
    [1.302, shoulder + 0.018, 0.147],
    [1.382, shoulder * 0.79, 0.109],
    [1.424, 0.094, 0.084],
  ];
  m.loft(
    profile.map(([y, width, depth]) => [0, y, 0, width, depth]),
    S.shirt,
    charTorsoRig,
    16,
  );
  const [hem, width, depth] = profile[0];
  m.loft(
    [
      [0, hem + 0.004, 0, width + 0.009, depth + 0.009],
      [0, hem + 0.028, 0, width + 0.008, depth + 0.01],
    ],
    S.belt,
    charTorsoRig,
    16,
    false,
  );
  const point = (angle: number, y: number, rise: number) => {
    const top = profile.findIndex(([height]) => height >= y);
    const [loY, loW, loD] = profile[Math.max(0, top - 1)];
    const [hiY, hiW, hiD] = profile[top < 0 ? profile.length - 1 : top];
    const t = charClamp((y - loY) / (hiY - loY || 1), 0, 1);
    return [
      Math.sin(angle) * (charMix(loW, hiW, t) + rise),
      y,
      Math.cos(angle) * (charMix(loD, hiD, t) + rise),
    ];
  };
  if (chainmail) {
    const across = 22;
    for (let row = 0; row < 10; row++)
      for (let column = 0; column < across; column++) {
        const a = ((column + (row % 2) * 0.5) * CHAR_TAU) / across;
        const y = 0.868 + row * 0.05;
        const ring = (i: number, scale: number) => {
          const t = (i * CHAR_TAU) / 6;
          return point(
            a + Math.cos(t) * 0.149 * scale,
            y + Math.sin(t) * 0.025 * scale,
            0.006 + 0.006 * scale,
          );
        };
        for (let i = 0; i < 6; i++)
          m.quad(
            ring(i, 0.59),
            ring(i, 1),
            ring(i + 1, 1),
            ring(i + 1, 0.59),
            (column + row + i) % 4 === 0 ? S.shirt : S.trim,
            charTorsoRig,
            i < 3 ? 1.03 : 0.76,
          );
      }
    m.loft(
      [
        [0, 1.383, 0, 0.176, 0.111],
        [0, 1.429, 0, 0.098, 0.09],
      ],
      S.belt,
      charTorsoRig,
      16,
      false,
    );
    return;
  }

  for (const center of [0, Math.PI]) {
    for (const side of [-1, 1]) {
      const at = (a: number, y: number, rise = 0.02) => point(center + side * a, y, rise);
      const panel = (
        inner: number,
        outer: number,
        bottom: number,
        top: number,
        slot: number,
        shade = 1,
      ) => {
        const vertices = [at(inner, bottom), at(outer, bottom), at(outer, top), at(inner, top)];
        if (side < 0) vertices.reverse();
        m.quad(vertices[0], vertices[1], vertices[2], vertices[3], slot, charTorsoRig, shade);
      };
      if (icy) {
        const shoulderEdge = [at(0.32, 1.337), at(0.44, 1.235), at(1.06, 1.275),
          at(1.22, 1.344), at(0.81, 1.402), at(0.36, 1.392)];
        const ridge = at(0.7, 1.337, 0.045);
        for (let i = 0; i < shoulderEdge.length; i++) {
          const a = shoulderEdge[i], b = shoulderEdge[(i + 1) % shoulderEdge.length];
          m.tri(side > 0 ? a : b, side > 0 ? b : a, ridge, i >= 3 ? S.trim : S.shirt,
            charTorsoRig, i === 4 ? 1.15 : 0.85);
        }
        panel(0.41, 0.91, 1.248, 1.266, S.trim);
      } else {
        panel(0.37, 0.85, 1.2, 1.382, S.eye, 0.49);
        panel(0.44, 0.77, 1.288, 1.307, S.eye, 0.79);
      }
      for (let i = 0; i < 3; i++) {
        const y = 0.963 + i * 0.073;
        if (!icy) {
          panel(0.13, 1.09, y, y + 0.052, S.belt, 1.19);
          for (const stitch of [0.21, 0.55, 0.89])
            panel(stitch, stitch + 0.035, y + 0.011, y + 0.045, S.trim, 0.85);
        } else {
          const edge = [
            at(0.07, y + 0.02),
            at(0.84, y - 0.006),
            at(1.15, y + 0.047),
            at(0.91, y + 0.087),
            at(0.16, y + 0.082),
          ];
          if (side < 0) edge.reverse();
          const ridge = at(0.5, y + 0.044, 0.033);
          for (let j = 0; j < edge.length; j++)
            m.tri(
              edge[j],
              edge[(j + 1) % edge.length],
              ridge,
              j === 2 ? S.trim : S.shirt,
              charTorsoRig,
              0.72 + j * 0.085,
            );
        }
      }
    }
    m.quad(
      point(center - 0.035, 0.939, 0.031),
      point(center + 0.035, 0.939, 0.031),
      point(center + 0.035, 1.252, 0.027),
      point(center - 0.035, 1.252, 0.027),
      S.belt,
      charTorsoRig,
    );
  }
}

function drawTechwearTop(m: CharacterMeshBuilder, waist: number, shoulder: number) {
  const S = CHAR_SLOT;
  const profile = [
    [0.851, waist + 0.014, 0.121],
    [0.944, waist - 0.005, 0.119],
    [1.103, waist + 0.01, 0.133],
    [1.248, shoulder - 0.016, 0.146],
    [1.338, shoulder - 0.02, 0.125],
    [1.409, 0.092, 0.079],
  ];
  m.loft(
    profile.map(([y, width, depth]) => [0, y, 0, width, depth]),
    S.shirt,
    charTorsoRig,
    16,
  );
  m.loft(
    [
      [0, 1.385, 0, 0.093, 0.087],
      [0, 1.442, 0, 0.078, 0.073],
    ],
    S.belt,
    2,
    12,
  );
  function front(x: number, y: number, lift = 0.004) {
    const row = Math.max(
      1,
      profile.findIndex(([height]) => height >= y),
    );
    const [low, narrow, shallow] = profile[row - 1];
    const [high, wide, deep] = profile[row];
    const t = charClamp((y - low) / (high - low), 0, 1);
    const across = charClamp(x / charMix(narrow, wide, t), -1, 1);
    return [x, y, charMix(shallow, deep, t) * Math.sqrt(1 - across * across) + lift];
  }
  // The segmented zipper follows the taper of the torso.
  const zipper = [
    [0.014, 0.861],
    [0.012, 0.944],
    [0.025, 1.103],
    [0.054, 1.248],
    [0.075, 1.338],
    [0.057, 1.401],
  ];
  for (const [i, [x, y]] of zipper.slice(1).entries()) {
    const [lowerX, lowerY] = zipper[i];
    m.quad(
      front(lowerX - 0.014, lowerY),
      front(lowerX + 0.014, lowerY),
      front(x + 0.014, y),
      front(x - 0.014, y),
      S.belt,
      charTorsoRig,
    );
    m.quad(
      front(lowerX - 0.003, lowerY, 0.008),
      front(lowerX + 0.003, lowerY, 0.008),
      front(x + 0.003, y, 0.008),
      front(x - 0.003, y, 0.008),
      S.metal,
      charTorsoRig,
      0.81,
    );
  }
  m.box(0.051, 1.36, front(0.061, 1.36)[2] - 0.003, 0.019, 0.029, 0.016, S.metal, charTorsoRig);

  const plates = [
    [-0.149, -0.031, 1.278, 0.018],
    [-0.14, -0.039, 1.224, 0.016],
    [-0.128, -0.047, 1.169, 0.014],
    [0.085, 0.155, 1.17, -0.022],
    [0.064, 0.143, 1.111, -0.021],
  ];
  for (const [left, right, y, slope] of plates) {
    m.quad(
      front(left, y),
      front(right, y + slope),
      front(right, y + slope + 0.035),
      front(left, y + 0.035),
      S.belt,
      charTorsoRig,
    );
    m.quad(
      front(left + 0.012, y + 0.01, 0.011),
      front(right - 0.012, y + slope + 0.01, 0.011),
      front(right - 0.012, y + slope + 0.021, 0.011),
      front(left + 0.012, y + 0.021, 0.011),
      S.metal,
      charTorsoRig,
    );
    const rivet = front(left + 0.014, y + 0.013);
    m.box(
      rivet[0] - 0.006,
      rivet[1],
      rivet[2] - 0.005,
      0.012,
      0.013,
      0.016,
      S.metal,
      charTorsoRig,
      1.28,
    );
  }
  for (const side of [-1, 1]) {
    const x = side * 0.104;
    const anchors = [
      front(x - 0.011, 0.929),
      front(x + 0.011, 0.929),
      front(x + 0.028, 1.012),
      front(x + 0.006, 1.012),
    ];
    m.quad(anchors[0], anchors[1], anchors[2], anchors[3], S.belt, charTorsoRig);
    m.box(x - 0.008, 0.95, front(x, 0.95)[2] - 0.003, 0.016, 0.02, 0.012, S.metal, charTorsoRig);
  }
}

function drawTechwearCargo(m: CharacterMeshBuilder, x: number, rig: Rig) {
  const S = CHAR_SLOT;
  const side = Math.sign(x);
  m.loft(
    [
      [x, 0.108, 0, 0.081, 0.088],
      [x, 0.186, -0.003, 0.098, 0.104],
      [x, 0.344, -0.009, 0.113, 0.115],
      [x, 0.478, 0.003, 0.111, 0.124],
      [x, 0.592, 0.009, 0.124, 0.128],
      [x, 0.764, 0.003, 0.132, 0.131],
      [x, 0.899, 0, 0.106, 0.111],
    ],
    S.pants,
    rig,
    12,
  );
  // Gusseted pockets project from the outside face of each thigh.
  const pocket = x + side * 0.074;
  m.loft(
    [
      [pocket, 0.535, 0.073, 0.057, 0.056],
      [pocket + side * 0.008, 0.565, 0.071, 0.072, 0.076],
      [pocket + side * 0.012, 0.712, 0.067, 0.076, 0.077],
      [pocket, 0.75, 0.066, 0.062, 0.063],
    ],
    S.pants,
    rig,
    8,
    true,
  );
  m.box(pocket - 0.056, 0.697, 0.104, 0.122, 0.043, 0.05, S.belt, rig);
  for (const dx of [-0.034, 0.033]) {
    const latch = pocket + dx;
    m.box(latch - 0.013, 0.644, 0.121, 0.026, 0.07, 0.028, S.belt, rig);
    m.box(latch - 0.017, 0.669, 0.149, 0.034, 0.026, 0.011, S.metal, rig);
    m.box(latch - 0.009, 0.676, 0.159, 0.018, 0.011, 0.004, S.belt, rig);
  }
  for (const [y, width, depth] of [
    [0.224, 0.106, 0.113],
    [0.326, 0.117, 0.116],
  ]) {
    m.loft(
      [
        [x, y, -0.006, width, depth],
        [x, y + 0.023, -0.006, width, depth],
      ],
      S.belt,
      rig,
      12,
      false,
    );
    m.box(x + side * 0.029 - 0.018, y - 0.001, depth - 0.011, 0.036, 0.025, 0.016, S.metal, rig);
  }
}

function drawSilkKimono(m: CharacterMeshBuilder, shoulder: number) {
  const S = CHAR_SLOT;
  const profile = [
    [0.725, 0.234, 0.171],
    [0.832, 0.225, 0.164],
    [0.975, 0.184, 0.138],
    [1.102, 0.197, 0.143],
    [1.248, shoulder + 0.01, 0.154],
    [1.344, shoulder + 0.012, 0.128],
    [1.408, 0.105, 0.082],
  ];
  const depth = profile.map(([y, , z]) => [y, z]);
  const at = (x: number, y: number, lift?: number) => garmentFront(x, y, depth, lift);
  m.loft(
    profile.map(([y, width, z]) => [0, y, 0, width, z]),
    S.shirt,
    charTorsoRig,
    14,
  );
  m.loft(
    [
      [0, 0.726, 0, 0.236, 0.175],
      [0, 0.754, 0, 0.237, 0.175],
    ],
    S.trim,
    charTorsoRig,
    14,
    false,
  );
  m.loft(
    [
      [0, 0.891, 0, 0.215, 0.164],
      [0, 0.916, 0, 0.213, 0.163],
      [0, 0.981, 0, 0.197, 0.155],
      [0, 1.005, 0, 0.197, 0.154],
    ],
    S.eye,
    charTorsoRig,
    14,
    false,
  );
  for (const [y, width, z] of [
    [0.899, 0.216, 0.166],
    [0.982, 0.199, 0.156],
  ])
    m.loft(
      [
        [0, y, 0, width, z],
        [0, y + 0.01, 0, width, z],
      ],
      S.trim,
      charTorsoRig,
      14,
      false,
    );
  m.box(-0.049, 0.919, 0.161, 0.102, 0.047, 0.024, S.shirt, charTorsoRig, 1.25);
  m.box(-0.018, 0.916, 0.182, 0.039, 0.052, 0.013, S.trim, charTorsoRig);

  function binding(points: number[][], width: number, slot: number, shade = 1) {
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i - 1];
      const [u, v] = points[i];
      m.quad(
        at(u - width, v, 0.01),
        at(u + width, v, 0.01),
        at(x + width, y, 0.01),
        at(x - width, y, 0.01),
        slot,
        charTorsoRig,
        shade,
      );
    }
  }
  binding(
    [
      [0.078, 1.398],
      [0.034, 1.314],
      [-0.043, 1.199],
    ],
    0.026,
    S.shirt,
    0.58,
  );
  binding(
    [
      [-0.076, 1.398],
      [-0.028, 1.311],
      [0.035, 1.21],
      [0.114, 1.094],
      [0.127, 1.01],
    ],
    0.028,
    S.shirt,
    0.54,
  );
  binding(
    [
      [-0.066, 1.397],
      [-0.019, 1.311],
      [0.045, 1.21],
      [0.124, 1.094],
      [0.136, 1.009],
    ],
    0.0065,
    S.trim,
  );

  for (const [x, y, size] of [
    [-0.091, 1.138, 0.034],
    [-0.13, 1.098, 0.02],
    [0.088, 0.814, 0.035],
    [0.135, 0.78, 0.023],
  ]) {
    const core = at(x, y, 0.012);
    for (let petal = 0; petal < 5; petal++) {
      const angle = (petal * Math.PI * 2) / 5;
      const p = (radius: number, offset: number) =>
        at(x + Math.cos(angle + offset) * radius, y + Math.sin(angle + offset) * radius, 0.012);
      m.quad(
        core,
        p(size * 0.7, -0.37),
        p(size, 0),
        p(size * 0.7, 0.37),
        S.trim,
        charTorsoRig,
        1.13,
      );
    }
    m.box(
      x - size * 0.14,
      y - size * 0.14,
      core[2],
      size * 0.28,
      size * 0.28,
      0.007,
      S.white,
      charTorsoRig,
    );
  }
}

function drawBlueJeans(m: CharacterMeshBuilder, x: number, rig: Rig) {
  const S = CHAR_SLOT;
  const side = Math.sign(x);
  m.loft(
    [
      [x, 0.103, -0.006, 0.069, 0.077],
      [x, 0.183, -0.004, 0.082, 0.085],
      [x, 0.372, -0.009, 0.086, 0.092],
      [x, 0.509, 0.003, 0.087, 0.098],
      [x, 0.665, 0.004, 0.105, 0.114],
      [x, 0.803, 0.003, 0.111, 0.111],
      [x, 0.9, 0, 0.105, 0.107],
    ],
    S.pants,
    rig,
    12,
  );
  m.loft(
    [
      [x, 0.111, -0.004, 0.073, 0.082],
      [x, 0.156, -0.003, 0.08, 0.088],
    ],
    S.pants,
    rig,
    12,
    false,
  );
  const seam = [
    [0.16, 0.083],
    [0.37, 0.087],
    [0.51, 0.088],
    [0.67, 0.106],
    [0.81, 0.112],
  ];
  for (let i = 1; i < seam.length; i++) {
    const [y, width] = seam[i - 1];
    const [top, next] = seam[i];
    m.quad(
      [x + width * side, y, -0.012],
      [x + width * side, y, 0.009],
      [x + next * side, top, 0.009],
      [x + next * side, top, -0.012],
      S.pants,
      rig,
      0.65,
    );
    m.quad(
      [x + width * side, y, 0.008],
      [x + width * side, y, 0.013],
      [x + next * side, top, 0.013],
      [x + next * side, top, 0.008],
      S.white,
      rig,
      0.7,
    );
  }
  m.quad(
    [x - 0.018, 0.415, 0.089],
    [x + 0.028, 0.415, 0.089],
    [x + 0.044, 0.598, 0.109],
    [x - 0.036, 0.598, 0.109],
    S.pants,
    rig,
    1.26,
  );
  m.quad(
    [x - 0.036, 0.598, 0.109],
    [x + 0.044, 0.598, 0.109],
    [x + 0.024, 0.731, 0.117],
    [x - 0.031, 0.728, 0.117],
    S.pants,
    rig,
    1.18,
  );
  const pocket = x + side * 0.021;
  m.quad(
    [pocket + 0.051, 0.87, -0.108],
    [pocket - 0.051, 0.87, -0.108],
    [pocket - 0.037, 0.753, -0.111],
    [pocket + 0.037, 0.75, -0.111],
    S.pants,
    rig,
    0.79,
  );
  m.box(pocket - 0.043, 0.847, 0.106, 0.016, 0.016, 0.01, S.metal, rig);
}

function drawPuffyParka(m: CharacterMeshBuilder) {
  const S = CHAR_SLOT;
  // The narrower rings are the seams between quilted baffles.
  const rings = [
    [0, 0.785, 0, 0.21, 0.141],
    [0, 0.837, 0, 0.243, 0.17],
    [0, 0.895, 0, 0.226, 0.15],
    [0, 0.956, 0, 0.249, 0.178],
    [0, 1.01, 0, 0.228, 0.155],
    [0, 1.075, 0, 0.266, 0.187],
    [0, 1.13, 0, 0.249, 0.164],
    [0, 1.192, 0, 0.284, 0.195],
    [0, 1.24, 0, 0.266, 0.172],
    [0, 1.296, 0, 0.29, 0.181],
    [0, 1.35, 0, 0.262, 0.149],
    [0, 1.4, 0, 0.112, 0.097],
  ];
  m.loft(rings, S.shirt, charTorsoRig, 12);
  m.loft(
    [
      [0, 1.3, -0.123, 0.183, 0.112],
      [0, 1.39, -0.12, 0.161, 0.12],
      [0, 1.48, -0.101, 0.117, 0.081],
    ],
    S.shirt,
    2,
    12,
  );
  m.loft(
    [
      [0, 1.373, 0, 0.113, 0.105],
      [0, 1.443, 0, 0.093, 0.09],
    ],
    S.trim,
    2,
    12,
    false,
  );
  for (let i = 1; i < rings.length; i++) {
    const [, y, , , z] = rings[i - 1],
      [, top, , , end] = rings[i];
    m.quad(
      [-0.009, y, z + 0.004],
      [0.009, y, z + 0.004],
      [0.009, top, end + 0.004],
      [-0.009, top, end + 0.004],
      S.trim,
      charTorsoRig,
    );
  }
  m.box(-0.011, 1.329, 0.153, 0.022, 0.022, 0.011, S.metal, charTorsoRig);
  for (const side of [-1, 1]) {
    const near = side * 0.088,
      far = side * 0.151;
    m.quad(
      [near, 1.047, 0.176],
      [far, 0.936, 0.148],
      [far, 0.953, 0.15],
      [near, 1.064, 0.181],
      S.trim,
      charTorsoRig,
    );
  }
}
function charBuildMesh({
  female,
  longHair,
  curly,
  hairstyle,
  cap,
  topHat,
  chef,
  backpack,
  coat,
  uniform,
  camouflage,
  sunglasses,
  alien,
  akibo,
  boots,
  iceTop,
  icePants,
  torso,
  legs,
  tinfoil,
  cloakTop,
  cloakBottom,
  robeTop,
  robeBottom,
  turtleneck,
  gooseShirt,
  neck,
  hat,
  phone,
}: CharacterAppearance) {
  const m = new CharacterMeshBuilder(camouflage),
    S = CHAR_SLOT,
    waist = female ? 0.142 : 0.164,
    shoulder = female ? 0.222 : 0.238,
    parka = torso === 'puffy-parka',
    leatherJacket = torso === LEATHER_JACKET.item,
    defenseArmor = isDefenseArmor(torso),
    formalSuit = torso === 'charcoal-suit',
    techwearTop = torso === 'techwear-top',
    techwearCargo = legs === 'techwear-bottoms',
    kimono = torso === 'silk-kimono',
    blueJeans = legs === 'blue-jeans',
    formalTrousers = formalSuit && !legs && !icePants && !cloakBottom,
    yellowTop = torso === 'yellow-top',
    yellowPants = legs === 'yellow-pants',
    ironTop = isIronArmorTorso(torso),
    ironLegs = isIronArmorLegs(legs);
  let start = m.indices.length;
  if (techwearTop) drawTechwearTop(m, waist, shoulder);
  else if (kimono) drawSilkKimono(m, shoulder);
  else if (parka) drawPuffyParka(m);
  else if (leatherJacket) drawLeatherJacket(m, waist, shoulder);
  else if (defenseArmor) drawDefenseArmor(m, torso, waist, shoulder);
  else if (formalSuit) {
    const widths = [0.179, waist + 0.02, waist + 0.031, shoulder + 0.015, shoulder, 0.102];
    m.loft(
      jacketDepth.map(([y, depth], i) => [0, y, 0, widths[i], depth]),
      S.shirt,
      charTorsoRig,
      12,
    );
  } else if (ironTop) {
    m.loft(
      [
        [0, 0.86, 0, 0.185, 0.145],
        [0, 0.98, 0, waist + 0.027, 0.146],
        [0, 1.18, 0.008, shoulder - 0.005, 0.177],
        [0, 1.33, 0, shoulder + 0.024, 0.156],
        [0, 1.425, 0, 0.096, 0.088],
      ],
      S.shirt,
      charTorsoRig,
      10,
    );
    m.loft(
      [
        [0, 0.882, 0, 0.19, 0.152],
        [0, 0.916, 0, 0.191, 0.154],
      ],
      S.trim,
      charTorsoRig,
      10,
      false,
    );
    m.loft(
      [
        [0, 1.4, 0, 0.144, 0.116],
        [0, 1.428, 0, 0.098, 0.09],
      ],
      S.trim,
      2,
      10,
      false,
    );
    for (const side of [-1, 1]) {
      const x = side * shoulder;
      const upperArm = side > 0 ? 7 : 4;
      m.loft(
        [
          [x + side * 0.035, 1.245, 0, 0.111, 0.115],
          [x + side * 0.025, 1.343, 0, 0.123, 0.139],
          [x, 1.439, 0, 0.076, 0.089],
        ],
        S.shirt,
        upperArm,
      );
      m.loft(
        [
          [x + side * 0.035, 1.242, 0, 0.113, 0.118],
          [x + side * 0.032, 1.27, 0, 0.118, 0.126],
        ],
        S.trim,
        upperArm,
        8,
        false,
      );
    }
  } else if (cloakTop)
    m.loft(
      [
        [0, 0.72, 0, 0.29, 0.2] satisfies [number, number, number, number, number],
        [0, 0.94, 0, 0.275, 0.19] satisfies [number, number, number, number, number],
        [0, 1.13, 0, 0.29, 0.19] satisfies [number, number, number, number, number],
        [0, 1.31, 0, 0.32, 0.17] satisfies [number, number, number, number, number],
        [0, 1.39, 0, 0.105, 0.08] satisfies [number, number, number, number, number],
      ],
      S.shirt,
      charTorsoRig,
      12,
    );
  else
    m.loft(
      [
        [0, coat ? 0.78 : 0.87, 0, 0.18, 0.119],
        [0, 0.96, 0, waist, 0.112],
        [0, 1.1, 0, waist + 0.017, 0.125] satisfies [number, number, number, number, number],
        [0, 1.25, 0, shoulder, 0.137],
        [0, 1.34, 0, shoulder * 0.94, 0.115] satisfies [number, number, number, number, number],
        [0, 1.39, 0, 0.1, 0.078] satisfies [number, number, number, number, number],
      ],
      S.shirt,
      charTorsoRig,
      8,
    );
  m.recordEquipment('top', start);
  start = m.indices.length;
  m.loft(
    [
      [0, 0.82, 0, 0.167, 0.106] satisfies [number, number, number, number, number],
      [0, 0.9, 0, 0.172, 0.119] satisfies [number, number, number, number, number],
      [0, 0.95, 0, 0.16, 0.11] satisfies [number, number, number, number, number],
    ],
    S.pants,
    0,
    8,
  );
  if (!cloakBottom && !ironTop && !ironLegs && !yellowPants && !formalSuit) {
    m.loft(
      [
        [0, 0.89, 0, 0.176, 0.121] satisfies [number, number, number, number, number],
        [0, 0.935, 0, 0.17, 0.116] satisfies [number, number, number, number, number],
      ],
      S.belt,
      0,
      8,
    );
    m.box(-0.027, 0.897, 0.12, 0.054, 0.031, 0.012, S.metal, 0);
  }
  if (!cloakBottom) m.recordEquipment('legs', start);
  start = m.indices.length;
  if (robeTop)
    for (let i = 0; i < 6; i++) {
      const y = 0.723 + i * 0.012;
      m.loft(
        [
          [0, y, 0, 0.295, 0.205],
          [0, y + 0.012, 0, 0.295, 0.205],
        ],
        S.rainbow + i,
        charTorsoRig,
        12,
        false,
      );
    }
  // Collar, a placket and sleeve cuffs add readable clothing planes.
  if (formalSuit) drawSuitFront(m);
  else if (yellowTop) {
    const zipper = [
      [0.875, 0.122],
      [0.96, 0.115],
      [1.1, 0.128],
      [1.25, 0.14],
      [1.34, 0.118],
      [1.39, 0.081],
    ];
    for (let i = 1; i < zipper.length; i++) {
      const [y, z] = zipper[i - 1],
        [top, front] = zipper[i];
      m.quad(
        [-0.009, y, z],
        [0.009, y, z],
        [0.009, top, front],
        [-0.009, top, front],
        S.eye,
        charTorsoRig,
      );
    }
    m.box(-0.012, 1.337, 0.12, 0.024, 0.027, 0.013, S.metal, charTorsoRig);
  } else if (
    !techwearTop &&
    !kimono &&
    !parka &&
    !leatherJacket &&
    !cloakTop &&
    !turtleneck &&
    !gooseShirt &&
    !defenseArmor &&
    !ironTop
  ) {
    m.quad(
      [-0.1, 1.39, 0.07] satisfies [number, number, number],
      [0, 1.27, 0.14] satisfies [number, number, number],
      [-0.042, 1.31, 0.142] satisfies [number, number, number],
      [-0.14, 1.35, 0.1] satisfies [number, number, number],
      S.trim,
      2,
    );
    m.quad(
      [0.1, 1.39, 0.07] satisfies [number, number, number],
      [0.14, 1.35, 0.1] satisfies [number, number, number],
      [0.042, 1.31, 0.142] satisfies [number, number, number],
      [0, 1.27, 0.14] satisfies [number, number, number],
      S.trim,
      2,
    );
    m.box(-0.011, 1.0, 0.126, 0.022, 0.24, 0.012, S.trim, charTorsoRig, 0.78);
    for (const y of [1.06, 1.15, 1.24] satisfies [number, number, number])
      m.box(-0.009, y, 0.143, 0.018, 0.018, 0.008, S.metal, charTorsoRig, 0.7);
  }
  m.recordEquipment('top', start);
  if (neck === 'black-tie') {
    start = m.indices.length;
    drawBlackTie(m, formalSuit);
    m.recordEquipment('tie', start);
  }
  start = m.indices.length;
  if (gooseShirt) {
    const logo = (outline: number[][], slot: number) => {
      const [a, b, c, d] = outline.map(([x, y]) => [x, y, 0.138 - Math.abs(x) * 0.12]);
      m.quad(a, b, c, d, slot, charTorsoRig);
    };
    logo(
      [
        [-0.075, 1.166],
        [0.026, 1.165],
        [0.057, 1.199],
        [-0.105, 1.208],
      ],
      S.white,
    );
    logo(
      [
        [0.025, 1.17],
        [0.058, 1.192],
        [0.059, 1.266],
        [0.032, 1.283],
      ],
      S.white,
    );
    logo(
      [
        [0.031, 1.254],
        [0.077, 1.252],
        [0.077, 1.279],
        [0.035, 1.283],
      ],
      S.white,
    );
    logo(
      [
        [0.076, 1.254],
        [0.104, 1.258],
        [0.105, 1.27],
        [0.076, 1.271],
      ],
      S.rainbow + 1,
    );
  }
  m.recordEquipment('top', start);
  m.loft(
    [
      [0, 1.37, 0, 0.061, 0.06] satisfies [number, number, number, number, number],
      [0, 1.49, 0, 0.057, 0.057] satisfies [number, number, number, number, number],
    ],
    S.skin,
    (p: number[]) => charBlend(2, 3, (p[1] - 1.39) / 0.08),
    8,
  );
  if (turtleneck) {
    start = m.indices.length;
    const collarRig = (p: number[]) => charBlend(2, 3, (p[1] - 1.39) / 0.08);
    m.loft(
      [
        [0, 1.365, 0, 0.105, 0.096],
        [0, 1.397, 0, 0.087, 0.082],
        [0, 1.458, 0, 0.08, 0.074],
      ],
      S.shirt,
      collarRig,
      12,
    );
    m.loft(
      [
        [0, 1.425, 0, 0.085, 0.08],
        [0, 1.465, 0, 0.083, 0.077],
      ],
      S.trim,
      collarRig,
      12,
    );
    m.recordEquipment('top', start);
  }
  for (let side = 0; side < 2; side++) {
    const x = side ? 0.11 : -0.11,
      thigh = side ? 13 : 10,
      shin = thigh + 1,
      foot = thigh + 2;
    const legRig = (p: number[]) => charBlend(thigh, shin, (0.55 - p[1]) / 0.15);
    start = m.indices.length;
    if (techwearCargo) drawTechwearCargo(m, x, legRig);
    else if (blueJeans) drawBlueJeans(m, x, legRig);
    else
      m.loft(
        [
          [x, 0.1, 0, 0.065, 0.075],
          [x, 0.18, -0.005, 0.071, 0.077],
          [x, 0.38, -0.006, 0.079, 0.087],
          [x, 0.47, 0, 0.081, 0.092],
          [x, 0.55, 0.008, 0.091, 0.106],
          [x, 0.75, 0.003, 0.101, 0.108],
          [x, 0.9, 0, 0.097, 0.099],
        ].map(([x, y, z, width, depth]) =>
          yellowPants ? [x, y, z, width * 0.91, depth * 0.94] : [x, y, z, width, depth],
        ),
        S.pants,
        legRig,
        yellowPants ? 20 : 8,
        true,
        yellowPants ? { side: side ? 1 : -1, slot: S.eye } : undefined,
      );
    if (formalTrousers) {
      const seam = [
        [0.12, 0.077],
        [0.38, 0.084],
        [0.55, 0.116],
        [0.8, 0.11],
      ];
      for (let i = 1; i < seam.length; i++) {
        const [y, front] = seam[i - 1],
          [top, end] = seam[i];
        m.quad(
          [x - 0.004, y, front],
          [x + 0.004, y, front],
          [x + 0.004, top, end],
          [x - 0.004, top, end],
          S.pants,
          legRig,
          1.38,
        );
      }
    }
    if (ironLegs) {
      m.loft(
        [
          [x, 0.52, 0.012, 0.101, 0.124],
          [x, 0.69, 0.006, 0.108, 0.127],
          [x, 0.855, 0.002, 0.108, 0.12],
        ],
        S.pants,
        legRig,
      );
      m.loft(
        [
          [x, 0.155, 0.008, 0.077, 0.098],
          [x, 0.32, 0.014, 0.092, 0.117],
          [x, 0.438, 0.017, 0.102, 0.129],
          [x, 0.53, 0.024, 0.103, 0.127],
        ],
        S.pants,
        legRig,
      );
      m.loft(
        [
          [x, 0.414, 0.049, 0.078, 0.1],
          [x, 0.49, 0.054, 0.094, 0.115],
          [x, 0.559, 0.04, 0.075, 0.098],
        ],
        S.metal,
        legRig,
      );
      if (legs === 'gold-trimmed-iron-armor-legs')
        for (const [y, width, depth, offset] of [
          [0.78, 0.109, 0.126, 0.002], [0.528, 0.106, 0.133, 0.016],
          [0.46, 0.091, 0.116, 0.054], [0.22, 0.086, 0.109, 0.012],
        ])
          m.loft([[x, y - 0.008, offset, width, depth], [x, y + 0.008, offset, width, depth]],
            S.legArmorTrim, legRig);
    }
    if (isDefenseLegArmor(legs)) {
      const icy = legs === 'icy-kevlar-pants';
      m.loft(
        [
          [x, 0.554, 0.022, 0.071, 0.093],
          [x, 0.61, 0.02, 0.096, 0.109],
          [x, 0.78, 0.013, 0.105, 0.111],
          [x, 0.844, 0.012, 0.087, 0.094],
        ],
        S.pants, legRig, 10,
      );
      const rim = [[x - 0.055, 0.415, 0.092], [x + 0.048, 0.409, 0.094],
        [x + 0.079, 0.502, 0.096], [x + 0.047, 0.574, 0.105],
        [x - 0.052, 0.578, 0.106], [x - 0.078, 0.503, 0.101]];
      for (let i = 0; i < rim.length; i++)
        m.tri(rim[i], rim[(i + 1) % rim.length], [x, 0.503, 0.146],
          icy && i !== 2 && i !== 3 ? S.pants : S.legArmorTrim, legRig);
      const outer = x + (side ? 0.072 : -0.072);
      m.quad([outer - 0.01, 0.617, 0.107], [outer + 0.01, 0.617, 0.107],
        [outer + 0.007, 0.795, 0.11], [outer - 0.007, 0.795, 0.11],
        S.legArmorTrim, legRig);
    }
    if (!cloakBottom) m.recordEquipment('legs', start);
    start = m.indices.length;
    if (boots === true) {
      m.loft(
        [
          [x, 0.1, 0.015, 0.084, 0.104],
          [x, 0.19, -0.005, 0.086, 0.094],
          [x, 0.34, -0.012, 0.098, 0.105],
          [x, 0.51, 0.001, 0.105, 0.118],
          [x, 0.6, 0.006, 0.106, 0.118],
          [x, 0.63, 0.007, 0.103, 0.113],
        ],
        S.shoe,
        legRig,
        12,
      );
      m.loft(
        [
          [x, 0.565, 0.003, 0.109, 0.12],
          [x, 0.61, 0.008, 0.109, 0.121],
          [x, 0.636, 0.008, 0.104, 0.115],
        ],
        S.belt,
        legRig,
        12,
      );
      for (let row = 0; row < 6; row++) {
        const y = 0.195 + row * 0.06,
          front = 0.092 + row * 0.005;
        for (const side of [-1, 1]) {
          const eye = x + side * 0.043;
          m.box(eye - 0.009, y - 0.008, front, 0.018, 0.017, 0.014, S.metal, legRig);
          if (row < 5)
            m.quad(
              [eye, y - 0.004, front + 0.016],
              [eye, y + 0.004, front + 0.016],
              [x - side * 0.043, y + 0.064, front + 0.021],
              [x - side * 0.043, y + 0.056, front + 0.021],
              S.trim,
              legRig,
            );
        }
      }
      m.loft(
        [
          [x, 0.009, 0.063, 0.088, 0.155],
          [x, 0.044, 0.065, 0.089, 0.157],
          [x, 0.065, 0.066, 0.08, 0.153],
        ],
        S.belt,
        foot,
        12,
      );
      for (let lug = 0; lug < 5; lug++)
        for (const side of [-1, 1])
          m.box(
            x + side * 0.072 - 0.016,
            0.008,
            -0.05 + lug * 0.054,
            0.032,
            0.028,
            0.032,
            S.belt,
            foot,
          );
    }
    if (boots === 'party-boots') {
      for (let band = 0; band < 6; band++) {
        const y = 0.14 + band * 0.092;
        const radius = 0.085 + band * 0.004;
        m.loft(
          [
            [x, y, 0.004, radius, radius + 0.016],
            [x, y + 0.094, 0.004, radius + 0.003, radius + 0.019],
          ],
          S.rainbow + band,
          legRig,
          12,
        );
        for (const dx of [-0.057, 0, 0.057])
          m.box(
            x + dx - 0.011,
            y + 0.032,
            radius + 0.01 - Math.abs(dx) * 0.24,
            0.022,
            0.023,
            0.021,
            S.metal,
            legRig,
          );
      }
      for (let layer = 0; layer < 4; layer++) {
        const y = -0.15 + layer * 0.045;
        m.loft(
          [
            [x, y, 0.064, 0.087, 0.158],
            [x, y + 0.046, 0.064, 0.089, 0.161],
          ],
          layer === 0 ? S.belt : S.rainbow + (side ? 6 - layer : layer),
          foot,
          12,
        );
      }
    }
    // A beveled, forward-facing shoe with a distinct heel and toe.
    m.loft(
      [
        [x, 0.015, 0.061, 0.077, 0.144],
        [x, 0.045, 0.068, 0.08, 0.154],
        [x, 0.107, 0.038, 0.071, 0.12],
        [x, 0.145, -0.007, 0.064, 0.073],
      ],
      S.shoe,
      foot,
      8,
    );
    m.box(x - 0.069, 0.013, -0.065, 0.138, 0.018, 0.25, S.belt, foot);
    m.box(x - 0.044, 0.113, 0.056, 0.088, 0.014, 0.042, S.trim, foot, 0.65);
    if (boots) m.recordEquipment('boots', start);
    const arm = side ? 7 : 4,
      forearm = arm + 1,
      hand = arm + 2,
      ax = side ? 0.245 : -0.245;
    const armRig = (p: number[]) =>
      p[1] > 1.27
        ? charBlend(arm, 2, (p[1] - 1.27) / 0.14)
        : charBlend(arm, forearm, (1.09 - p[1]) / 0.15);
    start = m.indices.length;
    if (leatherJacket)
      m.loft(
        [
          [ax, 0.738, 0, 0.057, 0.068],
          [ax, 0.805, -0.002, 0.063, 0.075],
          [ax, 0.982, 0, 0.073, 0.077],
          [ax, 1.071, 0.007, 0.076, 0.083],
          [ax, 1.22, 0, 0.089, 0.095],
          [ax, 1.326, 0, 0.096, 0.097],
          [ax, 1.382, 0, 0.052, 0.063],
        ],
        S.shirt,
        armRig,
        12,
      );
    else if (parka)
      m.loft(
        [
          [ax, 0.741, 0, 0.065, 0.074],
          [ax, 0.829, 0, 0.098, 0.1],
          [ax, 0.898, 0, 0.08, 0.085],
          [ax, 0.987, 0, 0.107, 0.103],
          [ax, 1.064, 0, 0.09, 0.095],
          [ax, 1.153, 0, 0.117, 0.113],
          [ax, 1.222, 0, 0.104, 0.103],
          [ax, 1.311, 0, 0.12, 0.119],
          [ax, 1.389, 0, 0.059, 0.063],
        ],
        S.shirt,
        armRig,
        10,
      );
    else if (kimono) {
      m.loft(
        [
          [ax, 0.809, -0.015, 0.138, 0.144],
          [ax, 0.88, -0.013, 0.147, 0.142],
          [ax, 1.063, -0.01, 0.127, 0.13],
          [ax, 1.249, 0.002, 0.103, 0.107],
          [ax, 1.388, 0, 0.064, 0.073],
        ],
        S.shirt,
        armRig,
        12,
      );
      m.loft(
        [
          [ax, 0.809, -0.015, 0.141, 0.146],
          [ax, 0.834, -0.015, 0.147, 0.149],
        ],
        S.trim,
        armRig,
        12,
        false,
      );
    } else
      m.loft(
        cloakTop
          ? [
              [ax, 0.73, 0, 0.09, 0.105],
              [ax, 0.86, 0, 0.115, 0.115],
              [ax, 1.04, 0, 0.14, 0.135],
              [ax, 1.22, 0, 0.15, 0.145],
              [ax, 1.36, 0, 0.1, 0.095],
            ]
          : gooseShirt
            ? [
                [ax, 1.152, 0, 0.079, 0.079],
                [ax, 1.2, 0, 0.082, 0.081],
                [ax, 1.32, 0, 0.09, 0.086],
                [ax, 1.38, 0, 0.053, 0.056],
              ]
            : [
                [ax, 0.75, 0, 0.052, 0.061],
                [ax, 0.84, 0, 0.057, 0.063],
                [ax, 0.98, 0, 0.066, 0.067],
                [ax, 1.035, 0, 0.069, 0.072],
                [ax, 1.2, 0, 0.082, 0.081],
                [ax, 1.32, 0, 0.09, 0.086],
                [ax, 1.38, 0, 0.053, 0.056],
              ],
        defenseArmor && torso !== 'steel-chainmail' ? S.eye : S.shirt,
        armRig,
        yellowTop ? 20 : cloakTop ? 10 : 8,
        true,
        yellowTop ? { side: side ? 1 : -1, slot: S.eye } : undefined,
      );
    if (gooseShirt || kimono) {
      m.recordEquipment('top', start);
      m.loft(
        [
          [ax, 0.731, 0, 0.039, 0.04],
          [ax, 0.9, 0, 0.055, 0.055],
          [ax, 1.05, 0, 0.056, 0.056],
          [ax, 1.156, 0, 0.069, 0.07],
        ],
        S.skin,
        armRig,
        8,
      );
      start = m.indices.length;
    } else
      m.loft(
        [
          [
            ax,
            0.731,
            0,
            cloakTop ? 0.09 : parka ? 0.067 : 0.055,
            cloakTop ? 0.105 : parka ? 0.076 : 0.063,
          ],
          [
            ax,
            0.77,
            0,
            cloakTop ? 0.1 : parka ? 0.078 : 0.056,
            cloakTop ? 0.11 : parka ? 0.085 : 0.063,
          ],
        ],
        cloakTop ? S.shirt : formalSuit ? S.white : S.trim,
        forearm,
        8,
      );
    if (robeTop)
      for (let i = 0; i < 6; i++) {
        const y = 0.73 + i * 0.008;
        m.loft(
          [
            [ax, y, 0, 0.101, 0.113],
            [ax, y + 0.008, 0, 0.101, 0.113],
          ],
          S.rainbow + i,
          forearm,
          10,
          false,
        );
      }
    if (techwearTop) {
      for (const [y, radius] of [
        [0.795, 0.061],
        [0.888, 0.066],
        [1.196, 0.087],
      ]) {
        m.loft(
          [
            [ax, y, 0, radius, radius + 0.005],
            [ax, y + 0.024, 0, radius + 0.001, radius + 0.006],
          ],
          S.belt,
          armRig,
          12,
          false,
        );
        m.box(ax - 0.021, y - 0.002, radius - 0.004, 0.042, 0.028, 0.017, S.metal, armRig);
        m.box(ax - 0.011, y + 0.006, radius + 0.013, 0.022, 0.011, 0.004, S.belt, armRig);
      }
    }
    if (!ironTop && (!defenseArmor || torso === 'steel-chainmail')) m.recordEquipment('top', start);
    m.loft(
      [
        [ax, 0.615, 0.016, 0.044, 0.037],
        [ax, 0.65, 0.022, 0.051, 0.045],
        [ax, 0.72, 0.006, 0.044, 0.04],
        [ax, 0.75, 0, 0.036, 0.033],
      ],
      S.skin,
      hand,
      6,
    );
    m.box(ax + (side ? -0.053 : 0.031), 0.65, 0.005, 0.022, 0.048, 0.033, S.skin, hand, 0.94);
  }
  // Smaller head, cheek and jaw contours, separate ears, and a modeled nose.
  m.loft(headRings, S.skin, CHARACTER_BONES.head, HEAD_SEGMENTS);
  if (alien) {
    // The human disguise becomes an articulated skull, with deep eye
    // sockets, cheek ridges, exposed teeth and a narrow nasal opening.
    for (const side of [-1, 1] satisfies [number, number]) {
      const x = side * 0.055;
      m.box(x - 0.036, 1.579, 0.105, 0.072, 0.051, 0.024, S.eye, 3, 0.7);
      m.loft(
        [
          [side * 0.086, 1.542, 0.102, 0.033, 0.028] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
          [side * 0.1, 1.569, 0.101, 0.039, 0.025] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
        ],
        S.white,
        3,
        6,
      );
      m.box(x - 0.037, 1.635, 0.096, 0.074, 0.021, 0.031, S.skin, 3, 1.12);
    }
    m.tri(
      [0, 1.583, 0.14] satisfies [number, number, number],
      [-0.018, 1.548, 0.142] satisfies [number, number, number],
      [0.018, 1.548, 0.142] satisfies [number, number, number],
      S.eye,
      3,
    );
    m.box(-0.052, 1.496, 0.113, 0.104, 0.039, 0.02, S.eye, 3, 0.7);
    for (let i = 0; i < 7; i++)
      m.box(-0.047 + i * 0.014, 1.503, 0.135, 0.01, 0.023, 0.008, S.white, 3);
    m.loft(
      [
        [0, 1.46, 0.03, 0.065, 0.071] satisfies [number, number, number, number, number],
        [0, 1.49, 0.023, 0.08, 0.089] satisfies [number, number, number, number, number],
      ],
      S.skin,
      3,
      8,
    );
  } else {
    for (const side of [-1, 1] satisfies [number, number]) {
      m.loft(
        [
          [side * 0.12, 1.54, 0, 0.018, 0.023] satisfies [number, number, number, number, number],
          [side * 0.126, 1.58, 0, 0.024, 0.026] satisfies [number, number, number, number, number],
          [side * 0.118, 1.62, -0.003, 0.018, 0.02] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
        ],
        S.skin,
        3,
        6,
      );
      const x = side * 0.047;
      m.box(x - 0.019, 1.601, 0.107, 0.038, 0.018, 0.008, S.white, 3, 0.86);
      m.box(x - 0.007, 1.6, 0.116, 0.014, 0.019, 0.006, S.eye, 3);
      m.box(x - 0.025, 1.632, 0.103, 0.047, 0.011, 0.014, S.hair, 3, 0.9);
    }
    m.tri(
      [-0.024, 1.6, 0.111] satisfies [number, number, number],
      [0, 1.536, 0.168] satisfies [number, number, number],
      [0.024, 1.6, 0.111] satisfies [number, number, number],
      S.skin,
      3,
      1.04,
    );
    m.tri(
      [-0.024, 1.6, 0.111] satisfies [number, number, number],
      [-0.022, 1.536, 0.119] satisfies [number, number, number],
      [0, 1.536, 0.168] satisfies [number, number, number],
      S.skin,
      3,
      0.93,
    );
    m.tri(
      [0.024, 1.6, 0.111] satisfies [number, number, number],
      [0, 1.536, 0.168] satisfies [number, number, number],
      [0.022, 1.536, 0.119] satisfies [number, number, number],
      S.skin,
      3,
      0.98,
    );
    drawHumanSmile(m);
  }
  if (sunglasses) {
    for (const side of [-1, 1] satisfies [number, number]) {
      const x = side * 0.061;
      m.box(x - 0.052, 1.575, 0.122, 0.104, 0.064, 0.018, S.eye, 3, 0.65);
      m.box(x - 0.042, 1.584, 0.142, 0.084, 0.045, 0.005, S.eye, 3, 1.15);
      m.box(side < 0 ? -0.132 : 0.117, 1.61, -0.035, 0.015, 0.016, 0.17, S.eye, 3, 0.7);
      m.box(x - 0.031, 1.615, 0.149, 0.025, 0.006, 0.003, S.white, 3, 0.5);
    }
    m.box(-0.014, 1.609, 0.141, 0.028, 0.014, 0.014, S.eye, 3, 0.6);
  }
  // Hair is a fitted polygon cap. Longer styles have side and back locks.
  const broccoli = hairstyle === 'broccoli',
    einstein = hairstyle === 'einstein',
    marge = hairstyle === 'marge',
    crop = hairstyle === 'crop' || broccoli;
  if (hairstyle === 'ponytail' || hairstyle === 'braid' || marge || einstein) {
    drawSweptBackHair(m, einstein ? 0.042 : 0);
    if (hairstyle === 'ponytail') drawPonytail(m);
    else if (hairstyle === 'braid') drawBraid(m);
    else if (einstein && !hat && !cap && !chef && !topHat && !tinfoil) drawEinsteinHair(m);
    else if (hasMargeCrown({ hairstyle, hat, cap, chef, topHat, tinfoil })) drawMargeHair(m);
  } else {
    m.loft(
      [
        [0, 1.655, -0.024, 0.124, 0.104] satisfies [number, number, number, number, number],
        [0, 1.713, -0.022, 0.112, 0.102] satisfies [number, number, number, number, number],
        [0, crop ? 1.733 : 1.758, -0.024, 0.076, 0.075],
        [0, crop ? 1.742 : 1.773, -0.027, 0.016, 0.02],
      ],
      S.hair,
      3,
      10,
    );
    if (broccoli)
      m.loft(
        [
          [0, 1.653, -0.024, 0.124, 0.104],
          [0, 1.69, -0.024, 0.128, 0.108],
        ],
        S.hair,
        3,
        10,
        false,
      );
    else m.box(-0.108, 1.626, -0.106, 0.216, 0.077, 0.035, S.hair, 3);
  }
  if (longHair || curly) {
    m.loft(
      [
        [0, 1.37, -0.079, 0.116, 0.052] satisfies [number, number, number, number, number],
        [0, 1.51, -0.071, 0.133, 0.063] satisfies [number, number, number, number, number],
        [0, 1.65, -0.04, 0.131, 0.079] satisfies [number, number, number, number, number],
      ],
      S.hair,
      3,
      10,
      false,
    );
    for (const side of [-1, 1] satisfies [number, number])
      m.loft(
        [
          [side * 0.112, curly ? 1.35 : 1.4, -0.027, 0.035, 0.055],
          [side * 0.132, 1.48, -0.019, curly ? 0.053 : 0.036, 0.06],
          [side * 0.13, 1.63, -0.022, 0.035, 0.059] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
        ],
        S.hair,
        3,
        curly ? 7 : 6,
      );
  }
  if (hairstyle === 'side-part') {
    m.loft(
      [
        [-0.035, 1.7, 0.025, 0.1, 0.075] satisfies [number, number, number, number, number],
        [-0.025, 1.77, 0.01, 0.1, 0.07] satisfies [number, number, number, number, number],
        [0.015, 1.806, -0.005, 0.065, 0.045] satisfies [number, number, number, number, number],
      ],
      S.hair,
      3,
      10,
    );
    m.quad(
      [-0.115, 1.708, 0.05] satisfies [number, number, number],
      [0.09, 1.705, 0.073] satisfies [number, number, number],
      [0.065, 1.659, 0.108] satisfies [number, number, number],
      [-0.1, 1.646, 0.095] satisfies [number, number, number],
      S.hair,
      3,
      0.93,
    );
  }
  if (hairstyle === 'short-curls')
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996,
        r = 0.034 + Math.sqrt(i / 12) * 0.066,
        x = Math.cos(a) * r,
        z = -0.025 + Math.sin(a) * r,
        y = 1.72 + Math.sqrt(Math.max(0, 1 - (r * r) / 0.014)) * 0.055;
      m.loft(
        [
          [x, y - 0.025, z, 0.035, 0.033] satisfies [number, number, number, number, number],
          [x, y + 0.022, z, 0.043, 0.038] satisfies [number, number, number, number, number],
          [x, y + 0.047, z, 0.018, 0.019] satisfies [number, number, number, number, number],
        ],
        S.hair,
        3,
        7,
      );
    }
  // A close taper leaves the wider, roughly curled crown as the silhouette.
  if (broccoli && !hat && !cap && !chef && !topHat)
    for (let i = 0; i < 19; i++) {
      const angle = i * 2.39996,
        spread = Math.sqrt(i / 18),
        x = Math.cos(angle) * spread * 0.113,
        z = 0.018 + Math.sin(angle) * spread * 0.09,
        y = 1.798 - spread * 0.035 + (i % 4) * 0.007,
        radius = 0.046 + (i % 3) * 0.007;
      m.loft(
        [
          [x, y - 0.071, z, radius * 0.58, radius * 0.6],
          [x, y - 0.022, z, radius, radius * 0.93],
          [x + 0.007, y + 0.018, z + 0.009, radius * 0.91, radius * 0.85],
          [x + 0.012, y + 0.044, z + 0.015, radius * 0.34, radius * 0.37],
        ],
        S.hair,
        3,
        7,
      );
    }
  if (hairstyle === 'bob') {
    m.loft(
      [
        [0, 1.463, -0.067, 0.126, 0.066] satisfies [number, number, number, number, number],
        [0, 1.52, -0.054, 0.144, 0.082] satisfies [number, number, number, number, number],
        [0, 1.66, -0.025, 0.132, 0.105] satisfies [number, number, number, number, number],
      ],
      S.hair,
      3,
      12,
      false,
    );
    for (const side of [-1, 1] satisfies [number, number])
      m.loft(
        [
          [side * 0.119, 1.47, 0.002, 0.036, 0.052] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
          [side * 0.137, 1.59, -0.005, 0.037, 0.067] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
          [side * 0.113, 1.69, 0.005, 0.034, 0.056] satisfies [
            number,
            number,
            number,
            number,
            number,
          ],
        ],
        S.hair,
        3,
        8,
      );
  }
  if (cap && !hat) {
    m.loft(
      [
        [0, 1.698, -0.019, 0.13, 0.116] satisfies [number, number, number, number, number],
        [0, 1.75, -0.023, 0.116, 0.109] satisfies [number, number, number, number, number],
        [0, 1.78, -0.025, 0.076, 0.073] satisfies [number, number, number, number, number],
      ],
      uniform ? S.pants : S.shirt,
      3,
      10,
    );
    m.box(-0.1, 1.696, 0.06, 0.2, 0.024, 0.13, uniform ? S.pants : S.shirt, 3, 0.8);
    if (uniform) m.box(-0.022, 1.728, 0.103, 0.044, 0.03, 0.014, S.metal, 3);
  }
  if (topHat && !hat) {
    const felt = topHat === 'shirt' ? S.shirt : S.hair;
    m.loft(
      [
        [0, 1.755, -0.02, 0.21, 0.17] satisfies [number, number, number, number, number],
        [0, 1.79, -0.02, 0.21, 0.17] satisfies [number, number, number, number, number],
      ],
      felt,
      3,
      16,
    );
    m.loft(
      [
        [0, 1.79, -0.02, 0.13, 0.11] satisfies [number, number, number, number, number],
        [0, 2.1, -0.02, 0.145, 0.12] satisfies [number, number, number, number, number],
      ],
      felt,
      3,
      16,
    );
    m.loft(
      [
        [0, 1.8, -0.02, 0.133, 0.113] satisfies [number, number, number, number, number],
        [0, 1.87, -0.02, 0.137, 0.116] satisfies [number, number, number, number, number],
      ],
      S.metal,
      3,
      16,
    );
  }
  if (chef && !hat) {
    m.loft(
      [
        [0, 1.71, -0.02, 0.13, 0.12] satisfies [number, number, number, number, number],
        [0, 1.81, -0.02, 0.14, 0.12] satisfies [number, number, number, number, number],
        [0, 1.9, -0.02, 0.19, 0.16] satisfies [number, number, number, number, number],
        [0, 2.02, -0.02, 0.17, 0.15] satisfies [number, number, number, number, number],
        [0, 2.055, -0.02, 0.06, 0.06] satisfies [number, number, number, number, number],
      ],
      S.white,
      3,
      16,
    );
    for (const side of [-1, 1] satisfies [number, number])
      for (let row = 0; row < 3; row++)
        m.box(side * 0.07 - 0.012, 1.08 + row * 0.085, 0.138, 0.024, 0.024, 0.012, S.belt, 2);
  }
  if (hat && getHatGeometry(hat)) {
    const model = getHatGeometry(hat)!,
      data = model.mesh.data;
    for (let i = 0; i < data.length; i += 33) {
      const points = ([0, 11, 22] satisfies [number, number, number]).map((k) => [
        data[i + k],
        data[i + k + 1] + 1.715,
        data[i + k + 2] - 0.02,
      ]);
      m.tri(
        points[0],
        points[1],
        points[2],
        ([S.hat, S.hatTrim, S.hatGem] satisfies [number, number, number])[model.channels[i / 33]],
        3,
      );
    }
  }
  if (phone) {
    start = m.indices.length;
    m.box(0.2, 0.64, 0.038, 0.09, 0.18, 0.016, S.phoneBody, 9);
    m.box(0.207, 0.656, 0.056, 0.076, 0.14, 0.004, S.phoneScreen, 9);
    for (let i = 0; i < 4; i++)
      m.box(
        0.214,
        0.677 + i * 0.024,
        0.061,
        0.052 - (i % 2) * 0.016,
        0.006,
        0.002,
        S.phoneGlyph,
        9,
      );
    m.box(0.233, 0.787, 0.062, 0.026, 0.005, 0.002, S.phoneBody, 9);
    m.recordEquipment('phone', start);
  }
  if (backpack) {
    start = m.indices.length;
    m.loft(
      [
        [0, 1.0, -0.19, 0.145, 0.06] satisfies [number, number, number, number, number],
        [0, 1.13, -0.205, 0.157, 0.085] satisfies [number, number, number, number, number],
        [0, 1.27, -0.185, 0.125, 0.065] satisfies [number, number, number, number, number],
      ],
      S.bag,
      1,
      8,
    );
    for (const side of [-1, 1] satisfies [number, number])
      m.box(side * 0.147 - 0.017, 1.01, 0.116, 0.034, 0.27, 0.02, S.bag, charTorsoRig, 0.8);
    m.box(-0.09, 1.04, -0.294, 0.18, 0.1, 0.025, S.bag, 1, 0.85);
    m.recordEquipment('backpack', start);
  }
  if (akibo) {
    start = m.indices.length;
    for (const side of [-1, 1] satisfies [number, number]) {
      const [grip, barrel, muzzle] = AKIMBO_MUZZLE;
      const x = side * grip,
        hand = side < 0 ? 6 : 9;
      m.box(x - 0.035, 0.627, -0.066, 0.07, 0.143, 0.082, S.belt, hand);
      m.box(x - 0.051, 0.747, -0.102, 0.102, 0.089, 0.242, S.metal, hand);
      m.box(x - 0.043, 0.82, -0.081, 0.086, 0.025, 0.2, S.belt, hand);
      m.box(x - 0.034, barrel - 0.031, 0.124, 0.068, 0.062, muzzle - 0.124, S.belt, hand);
      for (const rail of [-1, 1]) {
        m.box(x + rail * 0.043 - 0.005, 0.775, 0.045, 0.01, 0.032, 0.19, S.metal, hand);
        m.box(x + rail * 0.049 - 0.004, 0.782, 0.055, 0.008, 0.013, 0.17, S.eye, hand);
      }
      m.box(x - 0.024, barrel - 0.024, muzzle - 0.017, 0.048, 0.048, 0.017, S.metal, hand);
      m.box(x - 0.013, barrel - 0.013, muzzle - 0.006, 0.026, 0.026, 0.007, S.eye, hand);
    }
    m.recordEquipment('akimbo', start);
  }
  if (cloakBottom) {
    start = m.indices.length;
    const drape = (p: number[]) =>
      charBlend(0, p[0] < 0 ? 12 : 15, Math.max(0, Math.min(1, (0.86 - p[1]) / 0.79)));
    m.loft(
      [
        [0, 0.065, 0, 0.41, 0.29] satisfies [number, number, number, number, number],
        [0, 0.23, 0, 0.39, 0.28] satisfies [number, number, number, number, number],
        [0, 0.49, 0, 0.31, 0.23] satisfies [number, number, number, number, number],
        [0, 0.77, 0, 0.23, 0.16] satisfies [number, number, number, number, number],
        [0, 0.92, 0, 0.18, 0.125] satisfies [number, number, number, number, number],
      ],
      S.pants,
      drape,
      16,
    );
    if (robeBottom)
      for (let i = 0; i < 6; i++) {
        const y = 0.065 + i * 0.014;
        m.loft(
          [
            [0, y, 0, 0.413, 0.294],
            [0, y + 0.014, 0, 0.413, 0.294],
          ],
          S.rainbow + i,
          drape,
          16,
          false,
        );
      }
    m.recordEquipment('legs', start);
  }
  if (tinfoil) {
    start = m.indices.length;
    m.loft(
      [
        [0.015, 1.72, 0.012, 0.158, 0.138],
        [-0.018, 1.84, -0.016, 0.158, 0.135],
        [0.032, 1.94, 0.008, 0.102, 0.094],
        [-0.032, 2.055, 0.015, 0.012, 0.012],
      ],
      S.metal,
      3,
      7,
    );
    for (const side of [-1, 1]) {
      const arm = side > 0 ? 7 : 4,
        thigh = side > 0 ? 13 : 10;
      for (let i = 0; i < 4; i++) {
        const y = 0.92 + i * 0.115,
          xx = side * (0.17 + i * 0.019);
        m.tri(
          [0, y - 0.035, 0.151],
          [xx, y + 0.04, 0.122],
          [xx * 0.54, y + 0.119, 0.167],
          i % 2 ? S.trim : S.metal,
          charTorsoRig,
          0.94,
        );
        m.tri(
          [side * 0.23, y - 0.02, 0.079],
          [side * 0.332, y + 0.05, 0.062],
          [side * 0.26, y + 0.08, 0.1],
          S.metal,
          arm,
        );
        m.tri(
          [side * 0.046, y - 0.53, 0.092],
          [side * 0.199, y - 0.48, 0.095],
          [side * 0.143, y - 0.412, 0.117],
          i % 2 ? S.trim : S.metal,
          (p) => charBlend(thigh, thigh + 1, (0.55 - p[1]) / 0.15),
        );
      }
    }
    m.recordEquipment('top', start);
  }
  if (iceTop) {
    start = m.indices.length;
    m.loft(
      [
        [0, 0.97, 0, 0.17, 0.132] satisfies [number, number, number, number, number],
        [0, 1.16, 0, 0.21, 0.15] satisfies [number, number, number, number, number],
        [0, 1.31, 0, 0.235, 0.146] satisfies [number, number, number, number, number],
      ],
      S.shirt,
      charTorsoRig,
      8,
      false,
    );
    for (const side of [-1, 1] satisfies [number, number]) {
      const x = side * 0.24,
        rig = side > 0 ? 7 : 4;
      m.loft(
        [
          [x, 1.25, 0, 0.1, 0.1] satisfies [number, number, number, number, number],
          [x, 1.37, 0, 0.13, 0.12] satisfies [number, number, number, number, number],
          [x, 1.45, 0, 0.045, 0.045] satisfies [number, number, number, number, number],
        ],
        S.trim,
        rig,
        6,
      );
      m.tri(
        [x - 0.065, 1.37, 0.1] satisfies [number, number, number],
        [x + 0.065, 1.37, 0.1] satisfies [number, number, number],
        [x, 1.57, 0.06] satisfies [number, number, number],
        S.white,
        rig,
      );
    }
    for (const x of [-0.075, 0, 0.075] satisfies [number, number, number])
      m.tri(
        [x - 0.025, 1.1, 0.154] satisfies [number, number, number],
        [x + 0.025, 1.1, 0.154] satisfies [number, number, number],
        [x, 1.27, 0.16] satisfies [number, number, number],
        S.white,
        2,
      );
    m.recordEquipment('top', start);
  }
  if (icePants) {
    start = m.indices.length;
    for (const side of [-1, 1] satisfies [number, number]) {
      const x = side * 0.11,
        rig = side > 0 ? 14 : 11;
      m.loft(
        [
          [x, 0.2, 0.015, 0.079, 0.094] satisfies [number, number, number, number, number],
          [x, 0.47, 0.022, 0.09, 0.113] satisfies [number, number, number, number, number],
          [x, 0.57, 0.018, 0.065, 0.09] satisfies [number, number, number, number, number],
        ],
        S.pants,
        rig,
        6,
      );
      m.tri(
        [x - 0.05, 0.42, 0.127] satisfies [number, number, number],
        [x + 0.05, 0.42, 0.127] satisfies [number, number, number],
        [x, 0.61, 0.11] satisfies [number, number, number],
        S.white,
        rig,
      );
    }
    m.recordEquipment('legs', start);
  }
  if (uniform) {
    m.box(-0.13, 1.214, 0.137, 0.071, 0.086, 0.018, S.metal, 2);
    m.box(0.07, 1.14, 0.14, 0.09, 0.065, 0.012, S.pants, 2, 0.8);
  }
  return m.finish();
}
export function getCharacterMesh(appearance: CharacterAppearance = {}) {
  const flags = {
    phone: !!appearance.phone,
    hat: hatById(appearance.hat)?.id || '',
    female: !!appearance.female,
    hairstyle: appearance.hairstyle || '',
    longHair: !!appearance.longHair,
    curly: appearance.hairstyle === 'curly',
    cap: !!appearance.cap,
    topHat: appearance.topHat || false,
    chef: !!appearance.chef,
    backpack: appearance.backpack !== false,
    coat: !!appearance.coat,
    uniform: !!appearance.uniform,
    camouflage: !!appearance.camouflage,
    sunglasses: !!appearance.sunglasses,
    alien: !!appearance.alien,
    akibo: !!appearance.akibo,
    boots: appearance.boots || false,
    iceTop: !!appearance.iceTop,
    torso: isDefenseArmor(appearance.torso)
      ? appearance.torso
      : isIronArmorTorso(appearance.torso)
        ? 'iron-armor'
        : appearance.torso === 'yellow-top' ||
            appearance.torso === 'charcoal-suit' ||
            appearance.torso === 'techwear-top' ||
            appearance.torso === 'silk-kimono' ||
            appearance.torso === LEATHER_JACKET.item ||
            appearance.torso === 'puffy-parka'
          ? appearance.torso
          : '',
    legs:
      isIronArmorLegs(appearance.legs) ||
      isDefenseLegArmor(appearance.legs) ||
      appearance.legs === 'yellow-pants' ||
      appearance.legs === 'techwear-bottoms' ||
      appearance.legs === 'blue-jeans' ||
      (appearance.torso === 'charcoal-suit' && appearance.legs !== 'trousers')
        ? appearance.legs || ''
        : '',
    neck: appearance.neck === 'black-tie' ? appearance.neck : '',
    tinfoil: !!appearance.tinfoil,
    icePants: !!appearance.icePants,
    cloakTop: !!appearance.cloakTop || appearance.torso === 'decorative-robe-top',
    cloakBottom: !!appearance.cloakBottom || appearance.legs === 'decorative-robe-bottom',
    robeTop: appearance.torso === 'decorative-robe-top',
    robeBottom: appearance.legs === 'decorative-robe-bottom',
    turtleneck: !!appearance.turtleneck || appearance.torso === 'cashmere-turtleneck',
    gooseShirt: appearance.torso === 'goose-corp-shirt',
  };
  const key = Object.values(flags)
    .map((v) => (typeof v === 'boolean' ? Number(v) : v))
    .join('|');
  if (!charMeshCache.has(key)) charMeshCache.set(key, charBuildMesh(flags));
  return charMeshCache.get(key)!;
}
const charScratch = createCharacterPose(),
  characterPalettes = new Map<string, Float32Array>();
/** Color changes reuse the same geometry. The fourth channel is a surface
 * kind: 0 cloth/skin, 1 metal, 2 phone glow. Cache palettes separately. */
export function characterPalette(appearance: CharacterAppearance, skin: string, shirt: string) {
  const hat = hatById(appearance.hat),
    outerwear =
      isDefenseArmor(appearance.torso) || appearance.torso === LEATHER_JACKET.item
        ? ITEM_STATS[appearance.torso]
        : null,
    parka = appearance.torso === 'puffy-parka',
    techwearTop = appearance.torso === 'techwear-top',
    techwearCargo = appearance.legs === 'techwear-bottoms',
    legArmor = isDefenseLegArmor(appearance.legs) ? ITEM_STATS[appearance.legs] : null,
    kimono = appearance.torso === 'silk-kimono',
    blueJeans = appearance.legs === 'blue-jeans',
    techwear = techwearTop || techwearCargo,
    formalSuit = appearance.torso === 'charcoal-suit',
    formalTrousers = formalSuit && (!appearance.legs || appearance.legs === 'trousers'),
    ironTop = isIronArmorTorso(appearance.torso),
    ironLegs = isIronArmorLegs(appearance.legs),
    trimmedIronLegs = appearance.legs === 'gold-trimmed-iron-armor-legs',
    colors = [
      appearance.alien ? '#a4b797' : skin,
      outerwear
        ? outerwear.color
        : kimono
          ? ITEM_STATS['silk-kimono'].color
          : techwearTop
            ? ITEM_STATS['techwear-top'].color
            : parka
              ? ITEM_STATS['puffy-parka'].color
              : formalSuit
                ? ITEM_STATS['charcoal-suit'].color
                : ironTop
                  ? IRON_ARMOR_COLORS.plate
                  : appearance.torso === 'yellow-top'
                    ? ITEM_STATS['yellow-top'].color
                    : appearance.tinfoil
                      ? '#c5d0d2'
                      : appearance.torso === 'decorative-robe-top'
                        ? '#e373a8'
                        : appearance.torso === 'cashmere-turtleneck'
                          ? '#efe1c3'
                          : appearance.torso === 'goose-corp-shirt'
                            ? '#292b32'
                            : appearance.cloakTop
                              ? '#1b1e23'
                              : appearance.iceTop
                                ? ITEM_STATS['ice-top'].color
                                : shirt,
      legArmor
        ? legArmor.color
        : blueJeans
        ? ITEM_STATS['blue-jeans'].color
        : techwearCargo
          ? ITEM_STATS['techwear-bottoms'].color
          : formalTrousers
            ? ITEM_STATS['charcoal-suit'].color
            : ironLegs
              ? IRON_ARMOR_COLORS.plate
              : appearance.legs === 'yellow-pants'
                ? ITEM_STATS['yellow-pants'].color
                : appearance.tinfoil
                  ? '#b1bec2'
                  : appearance.legs === 'decorative-robe-bottom'
                    ? '#e373a8'
                    : appearance.cloakBottom
                      ? '#181b20'
                      : appearance.icePants
                        ? ITEM_STATS['ice-pants'].color
                        : appearance.pants || '#626955',
      appearance.hair || '#453a30',
      appearance.boots || formalTrousers ? '#171a21' : appearance.shoes || '#3c3d36',
      outerwear
        ? outerwear.trim
        : kimono
          ? ITEM_STATS['silk-kimono'].trim
          : techwearTop
            ? '#4b606b'
            : parka
              ? ITEM_STATS['puffy-parka'].trim
              : ironTop
                ? appearance.torso === 'gold-trimmed-iron-armor'
                  ? '#dbab4c'
                  : IRON_ARMOR_COLORS.trim
                : appearance.torso === 'yellow-top'
                  ? ITEM_STATS['yellow-top'].trim
                  : appearance.iceTop
                    ? ITEM_STATS['ice-top'].trim
                    : appearance.torso === 'cashmere-turtleneck'
                      ? '#e2d1ad'
                      : appearance.trim || '#c9c7b4',
      '#282c29',
      '#e1dfca',
      ironLegs ? IRON_ARMOR_COLORS.knee : techwear ? '#a6b7c2' : '#c7aa67',
      '#45483c',
      appearance.bag || '#886d4b',
      ...(hat?.colors || (['#888888', '#aaaaaa', '#cccccc'] satisfies [string, string, string])),
      '#485961',
      '#91bdc5',
      '#e4ece1',
      ...(appearance.camouflage ? CAMOUFLAGE :
        ['#e94870', '#ff9855', '#f7d54a', '#76d783', '#64b5ef', '#a789dc']),
      trimmedIronLegs ? '#dbab4c' : legArmor?.trim || '#a3e3eb',
    ];
  const key =
    colors.join('|') +
    '|' +
    Number(!!appearance.gilded) +
    Number(!!appearance.tinfoil) * 2 +
    Number(ironTop) * 4 +
    Number(ironLegs) * 8 +
    Number(techwear) * 16 +
    Number(appearance.torso === 'steel-chainmail') * 32 +
    '|' +
    Number(!!hat?.metal) +
    '|' +
    Number(!!hat?.trimMetal) +
    '|' +
    Number(!!hat?.gem);
  if (characterPalettes.has(key)) return characterPalettes.get(key)!;
  const palette = new Float32Array(colors.length * 4);
  for (let slot = 0; slot < colors.length; slot++) {
    palette.set(rgb(colors[slot]), slot * 4);
    const gilded =
      (appearance.gilded &&
        (
          [CHAR_SLOT.shirt, CHAR_SLOT.pants, CHAR_SLOT.metal] satisfies [number, number, number]
        ).includes(slot)) ||
      (appearance.tinfoil &&
        (
          [CHAR_SLOT.shirt, CHAR_SLOT.pants, CHAR_SLOT.trim] satisfies [number, number, number]
        ).includes(slot)) ||
      (ironTop && (slot === CHAR_SLOT.shirt || slot === CHAR_SLOT.trim)) ||
      (ironLegs && (slot === CHAR_SLOT.pants || slot === CHAR_SLOT.metal)) ||
      (trimmedIronLegs && slot === CHAR_SLOT.legArmorTrim) ||
      (appearance.torso === 'steel-chainmail' && slot === CHAR_SLOT.trim) ||
      (techwear && slot === CHAR_SLOT.metal) ||
      (hat &&
        ((slot === CHAR_SLOT.hat && hat.metal) ||
          (slot === CHAR_SLOT.hatTrim && hat.trimMetal) ||
          slot === CHAR_SLOT.hatGem));
    palette[slot * 4 + 3] = gilded ? 1 : slot === CHAR_SLOT.phoneScreen ? 2 : 0;
  }
  if (characterPalettes.size >= 256)
    characterPalettes.delete(characterPalettes.keys().next().value!);
  characterPalettes.set(key, palette);
  return palette;
}

/** Copy the equipped item's bind geometry and palette without the wearer. */
export function characterEquipmentMesh(part: EquipmentMeshPart, appearance: CharacterAppearance) {
  const look = { backpack: false, ...appearance };
  const mesh = getCharacterMesh(look);
  const palette = characterPalette(look, '#bd9369', '#707b4b');
  const data: number[] = [];
  for (const [start, end] of mesh.equipmentParts[part] ?? [])
    for (let at = start; at < end; at++) {
      const id = mesh.indices[at];
      const i = id * 6;
      const slot = mesh.slots[id] * 4;
      const shade = mesh.shades[id];
      const surface = palette[slot + 3];
      data.push(
        mesh.vertices[i],
        mesh.vertices[i + 1],
        mesh.vertices[i + 2],
        mesh.vertices[i + 3],
        mesh.vertices[i + 4],
        mesh.vertices[i + 5],
        palette[slot] * shade,
        palette[slot + 1] * shade,
        palette[slot + 2] * shade,
        surface === 1 ? -1.4 : surface === 2 ? -1.25 : -1,
        surface === 1 ? 0.4 : surface === 2 ? 0.22 : -1,
      );
    }
  return data;
}

export function characterIndices(
  mesh: CharacterMesh,
  headOnly: CharacterAppearance['headOnly'] = false,
  invisible = false,
) {
  if (invisible && !headOnly) {
    if (!mesh.cloakIndices) {
      mesh.cloakIndices = [];
      const { head, leftHand, rightHand, leftFoot, rightFoot } = CHARACTER_BONES;
      const visibleBones: readonly number[] = [head, leftHand, rightHand, leftFoot, rightFoot];
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const tri = mesh.indices.subarray(i, i + 3);
        if (tri.every((id) => visibleBones.includes(mesh.bonesA[id]) &&
          visibleBones.includes(mesh.bonesB[id]))) mesh.cloakIndices.push(...tri);
      }
    }
    return mesh.cloakIndices;
  }
  if (!headOnly) return mesh.indices;
  const { chest, head } = CHARACTER_BONES;
  const cache = headOnly === 'portrait' ? 'portraitIndices' : 'headIndices';
  if (!mesh[cache]) {
    const indices = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const triangle = mesh.indices.subarray(i, i + 3);
      if (
        triangle.every((id) => mesh.bonesA[id] === head && mesh.bonesB[id] === head) ||
        (headOnly === 'portrait' &&
          triangle.every((id) => mesh.bonesA[id] === chest && mesh.bonesB[id] === head))
      )
        indices.push(...triangle);
    }
    mesh[cache] = indices;
  }
  return mesh[cache];
}

/** Submit the cached bind mesh and a small pose to the GPU batch. Ordinary
 * Mesh instances retain the CPU reference for previews, tests and rare rolls. */
export function drawCharacter(
  m: Mesh,
  x: number,
  z: number,
  base: number,
  angle = 0,
  phase = 0,
  seated = false,
  skin = '#bd9369',
  shirt = '#707b4b',
  appearance: CharacterAppearance = {},
) {
  if (appearance.launcher === undefined && appearance.weapon === 'missile-launcher')
    appearance = { ...appearance, launcher: true };
  // These clips need both hands. Stowed equipment must not replace their
  // handlebars, ladder grips, exercise poses or board-balancing arms.
  if (
    (
      ['cycle', 'motorcycle', 'scooter', 'skate', 'surf', 'surfboard', 'paddle', 'climb', 'swim']
    ).includes(appearance.mode || '') ||
    (
      [
        'bench',
        'curl',
        'squat',
        'press',
        'teleport',
        'parachute',
        'forward-roll',
        'dance',
        'rocket-hop',
      ] satisfies [string, string, string, string, string, string, string, string, string]
    ).includes(appearance.action || '')
  )
    appearance = {
      ...appearance,
      railgun: false,
      launcher: false,
      akibo: false,
      battleaxe: false,
      combatLamp: false,
      katana: false,
      lightsaber: false,
      rollingPin: false,
      bowlingBall: false,
      bayonet: false,
      phone: false,
    };
  if (appearance.railgun || appearance.launcher || appearance.akibo) {
    if (
      appearance.action !== 'attack' &&
      (appearance.carryingFish || ['caught', 'drink', 'eat', 'fish', 'work'].includes(appearance.action || ''))
    )
      appearance = { ...appearance, railgun: false, launcher: false, akibo: false };
    else if (appearance.phone || appearance.carryingFish)
      appearance = { ...appearance, phone: false, carryingFish: false };
  }
  if ((appearance.lightsaber || appearance.combatLamp) &&
      ['caught', 'drink', 'eat', 'fish', 'work', 'swing'].includes(appearance.action || ''))
    appearance = { ...appearance, lightsaber: false, combatLamp: false };
  if (appearance.lightsaber && appearance.carryingFish)
    appearance = { ...appearance, lightsaber: false };
  if ((appearance.bowlingBall || appearance.lightsaber || appearance.combatLamp) && appearance.phone)
    appearance = { ...appearance, phone: false };
  const mesh = getCharacterMesh(appearance),
    height = appearance.height || 1,
    co = Math.cos(angle),
    si = Math.sin(angle);
  const mode = appearance.mode || (seated ? 'sit' : phase ? 'move' : 'idle');
  const sampleGround = appearance.ground;
  const ground =
    sampleGround && (mode === 'idle' || mode === 'move' || mode === 'rest')
      ? (lx: number, lz: number) =>
          (sampleGround!(x + lx * si + lz * co, z - lx * co + lz * si) - base) / height - 0.015
      : null;
  const pose =
      appearance.pose ||
      sampleCharacterPose(
        mode,
        phase,
        {
          motion: appearance.motion,
          run: appearance.run,
          sitBlend: appearance.sitBlend,
          danceBlend: appearance.danceBlend,
          time: appearance.time,
          action: appearance.action,
          actionT: appearance.actionT,
          carryingFish: appearance.carryingFish,
          pushingStroller: appearance.pushingStroller,
          railgun: appearance.railgun || appearance.onodaRifle,
          launcher: appearance.launcher,
          akibo: appearance.akibo,
          bayonet: appearance.bayonet,
          battleaxe: appearance.battleaxe,
          combatLamp: appearance.combatLamp,
          katana: appearance.katana,
          lightsaber: appearance.lightsaber,
          rollingPin: appearance.rollingPin,
          bowlingBall: appearance.bowlingBall,
          crowbar: appearance.crowbar,
          phone: appearance.phone,
          ground,
        },
        charScratch,
      ),
    mat = pose.matrices,
    v = mesh.vertices,
    work = mesh.deformed;
  const palette = characterPalette(appearance, skin, shirt),
    indices = characterIndices(mesh, appearance.headOnly, appearance.back === 'invisibility-cloak');
  if (
    appearance.boots === 'party-boots' &&
    !appearance.headOnly &&
    (mode === 'idle' || mode === 'move')
  )
    base += 0.15 * height;
  const cpu =
    appearance.cpuSkinning ||
    (['caught', 'forward-roll'] satisfies [string, string]).includes(appearance.action || '');
  if (m.characters && !cpu) {
    if (indices.length)
      m.characters.add(m, mesh, mat, palette, { x, z, base, angle, height, indices });
    drawWearableAccessories(m, appearance, mat, {
      x,
      z,
      base,
      angle,
      height,
      time: appearance.time || 0,
    });
    return;
  }
  for (let id = 0; indices.length && id < mesh.bonesA.length; id++) {
    const i = id * 6,
      a = mesh.bonesA[id] * 12,
      b = mesh.bonesB[id] * 12,
      w = mesh.weights[id],
      q = 1 - w;
    for (let row = 0; row < 3; row++) {
      const A = a + row * 4,
        B = b + row * 4;
      work[i + row] =
        (mat[A] * v[i] + mat[A + 1] * v[i + 1] + mat[A + 2] * v[i + 2] + mat[A + 3]) * q +
        (mat[B] * v[i] + mat[B + 1] * v[i + 1] + mat[B + 2] * v[i + 2] + mat[B + 3]) * w;
      work[i + 3 + row] =
        (mat[A] * v[i + 3] + mat[A + 1] * v[i + 4] + mat[A + 2] * v[i + 5]) * q +
        (mat[B] * v[i + 3] + mat[B + 1] * v[i + 4] + mat[B + 2] * v[i + 5]) * w;
    }
  }
  for (const id of indices) {
    const i = id * 6,
      px = work[i],
      py = work[i + 1] * height,
      pz = work[i + 2],
      nx = work[i + 3],
      ny = work[i + 4] / height,
      nz = work[i + 5],
      slot = mesh.slots[id] * 4,
      shade = mesh.shades[id],
      surface = palette[slot + 3];
    m.data.push(
      x + px * si + pz * co,
      base + py,
      z - px * co + pz * si,
      nx * si + nz * co,
      ny,
      -nx * co + nz * si,
      palette[slot] * shade,
      palette[slot + 1] * shade,
      palette[slot + 2] * shade,
      surface === 1 ? -1.4 : surface === 2 ? -1.25 : -1,
      surface === 1 ? 0.4 : surface === 2 ? 0.22 : -1,
    );
  }
  drawWearableAccessories(m, appearance, mat, {
    x,
    z,
    base,
    angle,
    height,
    time: appearance.time || 0,
    cpu: true,
  });
}
