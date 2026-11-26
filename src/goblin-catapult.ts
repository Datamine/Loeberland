import { drawCharacter, type CharacterAppearance } from './characters.ts';
import {
  catapultArmAngle,
  catapultSeat,
  GOBLIN_CATAPULT,
  type CatapultRig,
} from './config/goblin-catapult.ts';
import { pose, type Mesh } from './geometry.ts';
import type { RenderedSite } from './types/world.ts';

const oak = '#80634a';
const endGrain = '#a08663';
const iron = '#444d4a';
const brass = '#ac8857';
const metal = { metal: 0.56 };

export function drawCatapultFrame(
  m: Mesh,
  ground: (x: number, z: number) => number,
  landing: { x: number; z: number },
): RenderedSite {
  const { x, z, id, name, description, scientist } = GOBLIN_CATAPULT;
  const base = ground(x, z) + 0.23;
  const angle = Math.atan2(landing.z - z, landing.x - x);
  const start = m.data.length;
  pose(m, x, base, z, angle - Math.PI / 2, () => {
    for (const side of [-1, 1]) {
      const s = side * 0.64;
      for (const f of [-0.88, 0.78]) {
        m.box(s - 0.18, -0.68, f - 0.15, 0.36, 0.7, 0.31, '#66645a', 'stone');
        m.rod([s, 0.15, f], [s, 0.95, 0], 0.082, oak, 4, 'marinTimber');
        m.box(s - 0.105, 0.11, f - 0.048, 0.21, 0.057, 0.096, iron, metal);
      }
      m.box(s - 0.125, 0, -1.14, 0.25, 0.16, 2.22, oak, 'marinTimber');
      m.box(s - 0.093, 0.16, -0.1, 0.186, 0.94, 0.2, endGrain, 'marinTimber');
      m.rod([s - 0.14, 0.97, 0], [s + 0.14, 0.97, 0], 0.15, iron, 12, metal);
      m.rod([s - 0.155, 0.97, 0], [s + 0.155, 0.97, 0], 0.082, brass, 12, metal);
    }
    for (const f of [-0.74, 0.61]) m.box(-0.68, 0.074, f, 1.36, 0.13, 0.18, oak, 'marinTimber');
    m.rod([-0.71, 0.97, 0], [0.71, 0.97, 0], 0.093, iron, 12, metal);
    // A little panel made from an old ship's instrument.
    m.box(0.84, -0.37, -0.63, 0.19, 1.04, 0.23, oak, 'marinTimber');
    m.box(0.74, 0.65, -0.7, 0.38, 0.31, 0.41, '#44655e', metal);
    m.rod([0.93, 0.805, -0.7], [0.93, 0.805, -0.724], 0.099, brass, 14, metal);
    m.rod([0.93, 0.805, -0.723], [0.93, 0.805, -0.73], 0.074, '#ded1a7', 14);
    m.rod([0.93, 0.805, -0.737], [0.977, 0.823, -0.737], 0.009, '#a24436', 6);
    m.sphere(0.98, 0.984, -0.505, 0.046, 0.046, 0.046, '#adc982', 9, 6, { emissive: 0.42 });
    m.rod([0.91, 0.64, -0.48], [0.72, 0.25, -0.31], 0.024, '#9a6652', 7, metal);
  });
  return {
    id,
    kind: id,
    label: name,
    description,
    entry: { ...scientist.approach },
    seat: { x, z, base, angle, height: GOBLIN_CATAPULT.pivot },
    start,
    count: m.data.length - start,
    lo: [x - 1.9, base - 0.68, z - 1.24],
    hi: [x + 1.55, base + 2.7, z + 1.24],
  };
}

export function drawCatapultArm(m: Mesh, rig: CatapultRig, elapsed: number) {
  const angle = catapultArmAngle(elapsed);
  const { y, z } = catapultSeat(angle);
  const pivot = GOBLIN_CATAPULT.pivot;
  pose(m, rig.x, rig.base, rig.z, rig.angle - Math.PI / 2, () => {
    for (const side of [-1, 1]) {
      const x = side * 0.085;
      m.rod(
        [x, pivot - Math.sin(angle) * 0.61, Math.cos(angle) * 0.61],
        [x, y, z],
        0.07,
        endGrain,
        4,
        'marinTimber',
      );
      m.rod([x, pivot, 0], [side * 0.32, y - 0.06, z], 0.044, iron, 7, metal);
    }
    // Offset seat with chipped upholstery and side handholds.
    m.box(-0.34, y - 0.11, z - 0.28, 0.68, 0.11, 0.59, oak, 'marinTimber');
    m.box(-0.28, y - 0.014, z - 0.228, 0.56, 0.067, 0.44, '#a17d51');
    m.box(-0.31, y, z - 0.28, 0.62, 0.46, 0.071, '#707f65');
    m.box(-0.288, y + 0.39, z - 0.28, 0.575, 0.075, 0.082, brass, metal);
    for (const x of [-0.308, 0.308]) {
      m.rod([x, y, z - 0.19], [x, y + 0.21, z - 0.12], 0.025, iron, 8, metal);
      m.rod([x, y + 0.21, z - 0.12], [x, y + 0.16, z + 0.24], 0.027, iron, 8, metal);
    }
  });
}

export function drawCatapultRider(
  m: Mesh,
  { x, y, z, angle, phase }: { x: number; y: number; z: number; angle: number; phase: number },
  look: CharacterAppearance,
) {
  const mounting = phase < GOBLIN_CATAPULT.mountSeconds;
  const seated = !mounting && phase < GOBLIN_CATAPULT.releaseSeconds;
  drawCharacter(
    m,
    x,
    z,
    y + (seated ? -0.37 : 0.045),
    angle,
    mounting ? phase * 13 : 0,
    seated,
    look.skin,
    look.shirt,
    {
      ...look,
      mode: mounting ? 'move' : seated ? 'sit' : 'idle',
      combatLamp: false,
      ground: null,
      motion: mounting ? 0.85 : 0,
      carryingFish: false,
      action: mounting || seated ? '' : 'rocket-hop',
      actionT:
        0.28 + 0.67 * ((phase - GOBLIN_CATAPULT.releaseSeconds) / GOBLIN_CATAPULT.flightSeconds),
    },
  );
}
