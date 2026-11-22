import type { Mesh } from './geometry.ts';
import type { RenderedSite } from './types/world.ts';

export const TRAMPOLINE = {
  id: 'peninsula-trampoline',
  x: 53.55,
  z: 149.78,
  radius: 0.52,
  height: 3.2,
  duration: 1.25,
};
type Ground = (x: number, z: number) => number;

export function drawBackyardDetails(m: Mesh, ground: Ground) {
  const poolX = 40.48,
    poolZ = 154.75,
    y = ground(poolX, poolZ);
  m.box(poolX - 0.98, y - 0.04, poolZ - 1.25, 1.96, 0.15, 2.5, '#cdc3a6', 'wood');
  for (const side of [-1, 1]) {
    m.box(poolX + side * 0.64 - 0.055, y + 0.1, poolZ - 0.96, 0.11, 0.21, 1.92, '#eee0bb', 'stone');
    m.box(poolX - 0.59, y + 0.1, poolZ + side * 0.91 - 0.055, 1.18, 0.21, 0.11, '#eee0bb', 'stone');
  }
  m.box(poolX - 0.585, y + 0.09, poolZ - 0.854, 1.17, 0.15, 1.708, '#428f9d', 'poolMosaic');
  for (let i = 0; i < 6; i++) {
    const z = poolZ - 0.7 + i * 0.27;
    m.box(poolX - 0.45 + (i % 2) * 0.22, y + 0.244, z, 0.53, 0.004, 0.012, '#85c7c7');
  }
  for (const x of [poolX - 0.28, poolX + 0.28]) {
    m.rod([x, y + 0.14, poolZ - 0.72], [x, y + 0.52, poolZ - 0.72], 0.019, '#9caeb1', 8, {
      metal: 0.56,
    });
    m.rod([x, y + 0.52, poolZ - 0.72], [x, y + 0.27, poolZ - 1.0], 0.019, '#9caeb1', 8, {
      metal: 0.56,
    });
  }

  const shedX = 39.76,
    shedZ = 149.8,
    shedY = ground(shedX, shedZ);
  m.box(shedX - 0.52, shedY - 0.13, shedZ - 0.4, 1.04, 1.19, 0.8, '#7e8b6c', 'clapboard');
  m.box(shedX - 0.25, shedY + 0.015, shedZ + 0.401, 0.5, 0.84, 0.032, '#514739', 'cedar');
  m.sphere(shedX + 0.14, shedY + 0.43, shedZ + 0.45, 0.046, 0.019, 0.022, '#bca16c', 8, 5);
  for (const side of [-1, 1])
    m.quad(
      [shedX - 0.6, shedY + 1.04, shedZ + side * 0.49],
      [shedX + 0.6, shedY + 1.04, shedZ + side * 0.49],
      [shedX + 0.6, shedY + 1.32, shedZ],
      [shedX - 0.6, shedY + 1.32, shedZ],
      '#694c46',
      'shingles',
    );
  for (const x of [shedX - 0.52, shedX + 0.52])
    m.tri(
      [x, shedY + 1.04, shedZ - 0.4],
      [x, shedY + 1.04, shedZ + 0.4],
      [x, shedY + 1.32, shedZ],
      '#7e8b6c',
      'clapboard',
    );

  for (let j = 0; j < 3; j++) {
    const x = 44.7 + j * 0.54,
      z = 149.6 + (j % 2) * 0.48,
      base = ground(x, z);
    m.box(x - 0.2, base - 0.07, z - 0.28, 0.42, 0.26, 0.58, '#9c7656', 'cedar');
    m.box(x - 0.17, base + 0.17, z - 0.25, 0.36, 0.029, 0.52, '#594932', 'dirt');
    for (let i = 0; i < 4; i++) {
      const az = z - 0.18 + i * 0.12;
      m.sphere(x, base + 0.27, az, 0.095, 0.12, 0.08, i % 2 ? '#789455' : '#5a7546', 7, 5);
      m.sphere(x + 0.035, base + 0.35, az, 0.04, 0.028, 0.04, j % 2 ? '#b96c72' : '#d9ac61', 6, 5);
    }
  }
}
export function drawTrampoline(m: Mesh, ground: Ground): RenderedSite {
  const { id, x, z, radius: r } = TRAMPOLINE,
    base = ground(x, z),
    start = m.data.length;
  m.cylinder(x, base + 0.29, z, r, 0.038, '#3a575e', 20);
  m.cylinder(x, base + 0.32, z, r * 0.79, 0.013, '#2a3035', 20);
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI) / 9,
      c = Math.cos(a),
      s = Math.sin(a);
    m.rod(
      [x + r * 0.8 * c, base + 0.338, z + r * 0.8 * s],
      [x + r * 0.98 * c, base + 0.338, z + r * 0.98 * s],
      0.011,
      '#a3b7b6',
      6,
      { metal: 0.5 },
    );
    if (i % 3 === 0)
      m.rod(
        [x + r * 0.89 * c, base + 0.31, z + r * 0.89 * s],
        [x + r * c, ground(x + r * c, z + r * s), z + r * s],
        0.021,
        '#65767a',
        7,
        { metal: 0.5 },
      );
  }
  return {
    id,
    kind: 'trampoline',
    label: 'Trampoline',
    description: 'A backyard trampoline with well-worn springs.',
    entry: { x: x - 0.5, y: z - 0.5 },
    start,
    count: m.data.length - start,
    base,
    lo: [x - r, base - 0.14, z - r],
    hi: [x + r, base + 0.36, z + r],
    navigationPolygons: [],
  };
}
export function drawHydrant(m: Mesh, x: number, y: number, z: number) {
  m.cylinder(x, y, z, 0.075, 0.06, '#a2362e', 9);
  m.cylinder(x, y + 0.055, z, 0.053, 0.22, '#ba4436', 10);
  m.sphere(x, y + 0.28, z, 0.064, 0.048, 0.064, '#ce5743', 10, 6, { metal: 0.34 });
  m.rod([x - 0.103, y + 0.17, z], [x + 0.103, y + 0.17, z], 0.033, '#d86148', 9, { metal: 0.36 });
  m.rod([x, y + 0.18, z], [x, y + 0.18, z + 0.074], 0.034, '#a63d30', 8, { metal: 0.36 });
}
