import { drawCharacter, type CharacterAppearance } from './characters.ts';
import { SCOOTER_BACKFLIP, SCOOTER_MANUFACTURER } from './config/scooter.ts';
import { Mesh, pose } from './geometry.ts';
import { drawKrakenCape } from './jurassic-models.ts';
import { pitchAroundPoint, transformMeshRange } from './rendering/mesh-transform.ts';
import type { AnimationFrame } from './types/animation.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';
import { drawPlaque } from './southern-district.ts';

const DECK_HEIGHT = 0.19;
const WHEEL_RADIUS = 0.143;
const ANODIZED = '#23949a';
const RUBBER = '#28383d';
const ALUMINUM = '#bfcbd0';

export function drawScooter(m: Mesh, x: number, y: number, z: number, angle: number, travel = 0, paint = ANODIZED) {
  pose(m, x, y, z, angle, () => {
    m.box(-0.48, 0.125, -0.145, 0.82, 0.055, 0.29, paint, { metal: 0.42 });
    m.box(-0.461, 0.18, -0.126, 0.76, 0.01, 0.252, RUBBER);
    for (const side of [-1, 1]) {
      m.rod([-0.467, 0.15, side * 0.147], [0.32, 0.15, side * 0.147], 0.011, '#83e1d3', 5);
      m.rod([-0.41, 0.158, side * 0.11], [-0.54, WHEEL_RADIUS, side * 0.07], 0.021, paint, 7);
      m.rod([0.34, 0.34, 0], [0.52, WHEEL_RADIUS, side * 0.072], 0.022, ALUMINUM, 8);
    }
    m.rod([0.26, 0.16, 0], [0.34, 0.4, 0], 0.057, paint, 10);
    m.rod([0.34, 0.35, 0], [0.36, DECK_HEIGHT + 1.04, 0], 0.025, ALUMINUM, 10, { metal: 0.5 });
    m.rod([0.34, 0.5, 0], [0.345, 0.65, 0], 0.043, paint, 8);
    m.rod(
      [0.36, DECK_HEIGHT + 1.04, -0.265],
      [0.36, DECK_HEIGHT + 1.04, 0.265],
      0.022,
      ALUMINUM,
      9,
    );
    for (const side of [-1, 1])
      m.rod(
        [0.36, DECK_HEIGHT + 1.04, side * 0.145],
        [0.36, DECK_HEIGHT + 1.04, side * 0.273],
        0.035,
        RUBBER,
        10,
      );
    m.rod([-0.62, 0.265, 0], [-0.43, 0.307, 0], 0.041, '#43565f', 8);

    for (const axle of [-0.54, 0.52]) {
      m.sphere(axle, WHEEL_RADIUS, 0, WHEEL_RADIUS, WHEEL_RADIUS, 0.057, RUBBER, 18, 8);
      for (const side of [-1, 1]) {
        m.sphere(axle, WHEEL_RADIUS, side * 0.05, 0.098, 0.098, 0.013, paint, 14, 6);
        m.sphere(axle, WHEEL_RADIUS, side * 0.069, 0.031, 0.031, 0.014, ALUMINUM, 9, 5);
        for (let spoke = 0; spoke < 5; spoke++) {
          const a = (spoke * Math.PI * 2) / 5 - travel / WHEEL_RADIUS;
          const z = side * 0.065;
          m.rod(
            [axle, WHEEL_RADIUS, z],
            [axle + Math.cos(a) * 0.092, WHEEL_RADIUS + Math.sin(a) * 0.092, z],
            0.008,
            '#a1f2e4',
            5,
          );
        }
      }
    }
  });
}

export const SCOOTER_BILLBOARD = 'SCOOTERS';
export function drawScooterYard(m: Mesh, signs: SignAtlas, ground: (x: number, z: number) => number): RenderedSite {
  const start = m.data.length;
  const { x, z } = SCOOTER_MANUFACTURER;
  const paints = ['#259a9b', '#b75243', '#db964a', '#4e74a8', '#809854', '#7971a5', '#ba687c', '#667b77'];
  for (const [i, paint] of paints.entries()) {
    const px = x + 1.08 + (i % 4) * 0.85;
    const pz = z + (i < 4 ? -0.95 : 0.97);
    drawScooter(m, px, ground(px, pz), pz, Math.PI * 0.5, 0, paint);
    const stripeX = px + 0.36;
    const stripe = (dx: number, dz: number) => [stripeX + dx, ground(stripeX + dx, pz + dz) + 0.04, pz + dz];
    m.quad(stripe(0, -0.62), stripe(0, 0.62), stripe(0.055, 0.62), stripe(0.055, -0.62), '#cfbd8c');
  }
  const bx = x + 1.45, bz = z + 2.08, by = ground(bx, bz);
  for (const px of [bx - 1.28, bx + 1.28])
    m.box(px - 0.085, ground(px, bz) - 0.05, bz - 0.09, 0.17,
      by + 4.45 - ground(px, bz), 0.18, '#49595a', { metal: 0.5 });
  m.box(bx - 2.2, by + 3.27, bz - 0.12, 4.4, 2.67, 0.24, '#343b39');
  for (const side of [-1, 1]) {
    m.box(bx - 2.105, by + 3.36, bz + side * 0.125 - 0.006, 4.21, 2.49, 0.012, '#ebd8a6');
    m.box(bx - 2.105, by + 5.37, bz + side * 0.138 - 0.004, 4.21, 0.48, 0.008, '#306e70');
    drawPlaque(m, signs, SCOOTER_BILLBOARD, bx, by + 5.43, bz + side * 0.158, 2.3, 0.28, side > 0);
    const relief = new Mesh();
    drawScooter(relief, 0, 0, 0, 0);
    transformMeshRange(relief, 0, [side * 2.05, 0, 0, 0, 0, 1.44, 0, 0,
      0, 0, side * 0.2, 0, bx, by + 3.48, bz + side * 0.2, 1]);
    for (const value of relief.data) m.data.push(value);
  }
  return {
    id: 'scooter-yard', kind: 'scooter-yard', label: 'Scooter yard',
    description: 'Rows of new scooters sit under a billboard with a full-size scooter mounted to it.',
    entry: { x: x - 0.5, y: z - 1.1 }, solid: false, start, count: m.data.length - start,
    lo: [x - 0.8, by - 0.7, z - 1.65], hi: [x + 4.25, by + 5.95, bz + 0.3],
  };
}

export function drawScooterRider(
  m: Mesh,
  { x, y, z, angle, phase }: { x: number; y: number; z: number; angle: number; phase: number },
  look: CharacterAppearance,
  time: number,
  signs: SignAtlas,
  trick?: Pick<AnimationFrame, 'action' | 'actionT'>,
) {
  const start = m.data.length;
  const progress = trick?.action === SCOOTER_BACKFLIP.id ? trick.actionT : 0;
  const rise = 1.75 * Math.sin(Math.PI * progress);
  const base = y + rise;
  drawScooter(m, x, base, z, angle, phase / Math.PI);
  drawCharacter(m, x, z, base + DECK_HEIGHT, angle, phase, false, look.skin, look.shirt, {
    ...look,
    mode: 'scooter',
    ground: null,
    crowbar: false,
    onodaRifle: false,
    action: progress ? SCOOTER_BACKFLIP.id : undefined,
    actionT: progress,
    time: time / 1000,
  });
  if (look.cape) drawKrakenCape(m, x, z, base + DECK_HEIGHT, angle, time, signs);
  if (progress > 0 && progress < 1) {
    const spin = -2 * Math.PI * progress * progress * (3 - 2 * progress);
    transformMeshRange(m, start, pitchAroundPoint(x, base + 0.84, z, angle, spin));
  }
}
