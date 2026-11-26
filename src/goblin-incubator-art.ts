import { Mesh, pose, tint } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';
import {
  GOBLIN_CITY_HALL,
  INCUBATOR_ENTRANCE,
  INCUBATOR_FLOOR,
  INCUBATOR_TILES,
  incubatorFloorTile,
  incubatorPoint,
  INCUBATOR_CRATES,
  INCUBATOR_THRONE,
} from './goblin-incubator-cave.ts';
import { drawWildMonster } from './wilderness-models.ts';

export function drawGoblinCityHall(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, x, z, entry } = GOBLIN_CITY_HALL;
  const face = z + 1.23;
  const y = ground(x, face);
  const start = m.data.length;
  const rock = 'marinRock';
  m.sphere(x, y + 0.48, z - 0.45, 2.45, 1.05, 1.3, '#6d6857', 11, 6, rock);
  m.sphere(x - 1.48, y + 0.44, z + 0.12, 0.97, 0.94, 1.27, '#817a65', 9, 6, rock);
  m.sphere(x + 1.49, y + 0.39, z + 0.15, 1.04, 0.88, 1.22, '#736b59', 9, 5, rock);
  m.sphere(x + 0.14, y + 1.58, z - 0.05, 1.74, 0.82, 1.26, '#88816c', 9, 6, rock);

  const arch = (angle: number, radius: number, depth: number) =>
    [x + Math.cos(angle) * radius, y + 0.78 + Math.sin(angle) * radius, depth] as const;
  const shadow = '#29251f';
  const inner = 0.89;
  const outer = 1.2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    const b = ((i + 1) / 10) * Math.PI;
    m.tri([x, y + 0.78, face], arch(a, inner, face), arch(b, inner, face), shadow);
    m.quad(arch(a, inner, face), arch(a, outer, face + 0.08),
      arch(b, outer, face + 0.08), arch(b, inner, face), i % 2 ? '#786f5c' : '#857b65', rock);
  }
  m.quad([x - inner, y - 0.28, face], [x + inner, y - 0.28, face],
    [x + inner, y + 0.78, face], [x - inner, y + 0.78, face], shadow);
  for (const side of [-1, 1]) {
    m.box(x + side * 1.045 - 0.155, y - 0.34, face - 0.44, 0.31, 1.12, 0.53, '#766d5a', rock);
    m.box(x + side * 1.32 - 0.05, y + 0.9, face + 0.03, 0.1, 0.27, 0.08, '#55422d', 'wood');
    m.box(x + side * 1.32 - 0.08, y + 1.16, face + 0.035, 0.16, 0.19, 0.13, '#f3bd68', { emissive: 0.65 });
  }
  m.box(x - 1.17, y + 1.88, face + 0.025, 2.34, 0.34, 0.13, '#634a34', 'wood');
  drawPlaque(m, signs, name, x, y + 1.96, face + 0.16, 2.21, 0.18);
  return {
    id,
    kind: id,
    label: name,
    entry: { ...entry },
    solid: false,
    description: 'A stone entrance set into the hillside. A clerk stands beside the door.',
    start,
    count: m.data.length - start,
    lo: [x - 2.55, y - 0.65, z - 1.75],
    hi: [x + 2.55, y + 2.42, face + 0.17],
  };
}

const stone = ['#595047', '#494149', '#66574e', '#514940', '#716055'];
const hash = (x: number, z: number, salt = 0) => {
  const value = Math.sin(x * 47.13 + z * 18.57 + salt * 93.24) * 8216.569;
  return value - Math.floor(value);
};
const walls = [
  { dx: -1, dz: 0, start: [0, 1] },
  { dx: 1, dz: 0, start: [1, 0] },
  { dx: 0, dz: -1, start: [0, 0] },
  { dx: 0, dz: 1, start: [1, 1] },
].map((side) => ({
  ...side,
  edges: INCUBATOR_TILES.filter(({ x, z }) => !incubatorFloorTile(x + side.dx, z + side.dz)),
}));
const torches = walls.flatMap(({ dx, dz, edges }) =>
  edges
    .filter(({ x, z }) => hash(x, z) > 0.89)
    .map(({ x, z }) => {
      const point = incubatorPoint(x, z);
      return { x: point.x + dx * 0.35, z: point.z + dz * 0.35, dx, dz, phase: hash(x, z, 3) * 7 };
    }),
);
const pools = [
  [4, 28, 0.76],
  [8, 22, 0.58],
  [19, 24, 0.79],
  [27, 32, 0.95],
  [20, 10, 0.7],
  [36, 13, 0.87],
  [32, 8, 0.58],
];

function drawCrate(m: Mesh, x: number, z: number, y: number, size: number) {
  m.box(x, y, z, size, size * 0.88, size, '#725135', 'wood');
  for (const at of [0.035, size - 0.095]) {
    m.box(x + at, y, z - 0.013, 0.065, size * 0.91, size + 0.026, '#9a7247', 'wood');
    m.box(x - 0.012, y + size * 0.76, z + at, size + 0.024, size * 0.155, 0.07, '#b48a57', 'wood');
  }
  m.rod(
    [x + 0.06, y + 0.08, z + size + 0.012],
    [x + size - 0.06, y + size * 0.82, z + size + 0.012],
    0.022,
    '#9b754c',
    5,
    'wood',
  );
}

export function drawIncubatorPosterBox(m: Mesh, x: number, z: number) {
  const y = INCUBATOR_FLOOR;
  m.box(x - 0.35, y, z - 0.28, 0.7, 0.07, 0.56, '#725135', 'wood');
  for (const edge of [-1, 1]) {
    m.box(x + edge * 0.32 - 0.03, y + 0.05, z - 0.28, 0.06, 0.35, 0.56, '#87623f', 'wood');
    m.box(x - 0.29, y + 0.05, z + edge * 0.25 - 0.03, 0.58, 0.33, 0.06, '#9c734b', 'wood');
  }
  for (const [offset, height, angle] of [
    [-0.17, 0.31, 0.04],
    [0.02, 0.43, -0.07],
    [0.17, 0.38, 0.08],
  ]) {
    m.rod(
      [x - 0.29, y + height, z + offset],
      [x + 0.3, y + height, z + offset + angle],
      0.065,
      '#eadcb2',
      10,
    );
    m.rod(
      [x - 0.285, y + height, z + offset],
      [x - 0.296, y + height, z + offset],
      0.038,
      '#a88a62',
      10,
    );
  }
  const front = z + 0.283;
  m.box(x - 0.23, y + 0.035, front, 0.46, 0.31, 0.014, '#eee1b8');
  m.box(x - 0.204, y + 0.063, front + 0.014, 0.408, 0.255, 0.002, '#364953');
  const ink = front + 0.021;
  m.sphere(x - 0.044, y + 0.14, ink, 0.108, 0.042, 0.003, '#fff1ca', 12, 5);
  m.rod([x + 0.018, y + 0.15, ink], [x + 0.051, y + 0.249, ink], 0.021, '#fff1ca', 8);
  m.sphere(x + 0.066, y + 0.25, ink, 0.038, 0.024, 0.004, '#fff1ca', 10, 5);
  m.tri(
    [x + 0.097, y + 0.259, ink + 0.003],
    [x + 0.097, y + 0.238, ink + 0.003],
    [x + 0.146, y + 0.243, ink + 0.003],
    '#e69748',
  );
  m.sphere(x + 0.075, y + 0.256, ink + 0.005, 0.006, 0.006, 0.002, '#364953', 6, 4);
}

export function drawIncubatorCave(m: Mesh) {
  for (const { x, z } of INCUBATOR_TILES) {
    const center = incubatorPoint(x, z);
    const y = INCUBATOR_FLOOR;
    const light = torches.reduce(
      (nearest, t) => Math.min(nearest, Math.hypot(center.x - t.x, center.z - t.z)),
      5,
    );
    const warmth = 0.04 * Math.sin(x * 0.64 + z * 0.28) + 0.13 * Math.max(0, 1 - light / 3);
    const a = [center.x - 0.5, y, center.z - 0.5];
    const b = [center.x - 0.5, y, center.z + 0.5];
    const c = [center.x + 0.5, y, center.z + 0.5];
    const d = [center.x + 0.5, y, center.z - 0.5];
    m.quad(a, b, c, d, tint('#615748', -6 + warmth * 85 + hash(x, z, 2) * 6), 'marinRock');
    if (hash(x, z, 4) > 0.78)
      for (let chip = 0; chip < 3; chip++) {
        const r = 0.025 + 0.058 * hash(x, z, chip + 5);
        m.sphere(
          center.x + hash(x, z, chip + 8) * 0.64 - 0.32,
          y + 0.018,
          center.z + hash(x, z, chip + 12) * 0.64 - 0.32,
          r,
          r * 0.52,
          r * 0.85,
          '#7b6d62',
          6,
          4,
          'stone',
        );
      }
  }
  for (const [x, z, radius] of pools) {
    const p = incubatorPoint(x, z);
    m.sphere(p.x, INCUBATOR_FLOOR + 0.021, p.z, radius, 0.019, radius * 0.65, '#425238', 15, 5, {
      metal: 0.35,
    });
    m.sphere(
      p.x - radius * 0.18,
      INCUBATOR_FLOOR + 0.033,
      p.z + 0.04,
      radius * 0.52,
      0.01,
      radius * 0.27,
      '#687b43',
      12,
      4,
      { metal: 0.5 },
    );
    m.rod(
      [p.x - 0.68, INCUBATOR_FLOOR + 0.04, p.z + 0.26],
      [p.x + 0.34, INCUBATOR_FLOOR + 0.09, p.z + 0.43],
      0.035,
      '#443421',
      6,
      'wood',
    );
    m.rod(
      [p.x - 0.19, INCUBATOR_FLOOR + 0.073, p.z + 0.35],
      [p.x - 0.11, INCUBATOR_FLOOR + 0.09, p.z + 0.66],
      0.021,
      '#59432a',
      6,
      'wood',
    );
  }
  for (const [x, z, count] of INCUBATOR_CRATES) {
    const p = incubatorPoint(x, z);
    drawCrate(m, p.x - 0.3, p.z - 0.2, INCUBATOR_FLOOR, 0.52);
    if (count > 1) drawCrate(m, p.x - 0.18, p.z - 0.12, INCUBATOR_FLOOR + 0.46, 0.36);
    if (count > 2) drawCrate(m, p.x + 0.28, p.z - 0.15, INCUBATOR_FLOOR, 0.38);
  }
  for (const torch of torches) {
    const { x, z, dx, dz } = torch;
    m.rod(
      [x + 0.22 * dx, INCUBATOR_FLOOR + 0.65, z + 0.22 * dz],
      [x, INCUBATOR_FLOOR + 1.56, z],
      0.058,
      '#493325',
      7,
      'wood',
    );
    m.cylinder(x, INCUBATOR_FLOOR + 1.48, z, 0.083, 0.09, '#664931', 8);
  }
  const throne = incubatorPoint(...INCUBATOR_THRONE);
  pose(m, throne.x, INCUBATOR_FLOOR, throne.z, Math.PI / 2, () => {
    m.box(-0.48, 0, -0.49, 0.96, 0.25, 0.97, '#6b5548', 'stone');
    m.box(-0.51, 0.24, -0.4, 1.02, 0.91, 0.21, '#735346', 'stone');
    m.box(-0.4, 0.41, -0.21, 0.8, 0.09, 0.5, '#7f2946', 'canvasWeave');
    for (const side of [-1, 1])
      m.box(side * 0.45 - 0.12, 0.25, -0.26, 0.24, 0.37, 0.56, '#816150', 'stone');
  });
  return walls.map(({ dx, dz, start, edges }) => {
    const mesh = new Mesh();
    for (const { x, z } of edges) {
      const p = incubatorPoint(x, z);
      const sx = p.x - 0.5 + start[0],
        sz = p.z - 0.5 + start[1];
      const jitter = hash(x, z, 19);
      const at = (u: number, h: number, thickness: number) => [
        sx - dz * u + dx * thickness,
        INCUBATOR_FLOOR + h,
        sz + dx * u + dz * thickness,
      ];
      // Adjacent rock faces share exactly the same ridge and strata at the seams.
      const stratum = (u: number, salt: number) => {
        const [px, , pz] = at(u, 0, 0);
        return hash(Math.round(px * 3), Math.round(pz * 3), salt);
      };
      const ridge = (u: number) => 1.65 + stratum(u, 18) * 1.35;
      const swell = (u: number) => 0.03 + stratum(u, 16) * 0.25;
      const rim = (u: number) => at(u, ridge(u), 0.36 + swell(u));
      for (let i = 0; i < 3; i++) {
        const l = i / 3,
          r = (i + 1) / 3;
        const color = stone[Math.floor(hash(x + i, z, 21) * stone.length)];
        const lower = at(l, 0.94, swell(l));
        const upper = at(r, 0.94, swell(r));
        mesh.quad(at(l, 0, 0), at(r, 0, 0), upper, lower, color, 'marinRock');
        mesh.quad(lower, upper, rim(r), rim(l), '#574b48', 'marinRock');
        mesh.quad(
          rim(l),
          rim(r),
          at(r, ridge(r) - 0.16, 0.85),
          at(l, ridge(l) - 0.16, 0.85),
          '#3d3638',
          'marinRock',
        );
      }
      if (jitter > 0.51)
        mesh.sphere(
          sx - dz * 0.53 + dx * 0.21,
          INCUBATOR_FLOOR + 0.59,
          sz + dx * 0.53 + dz * 0.21,
          0.31 + Math.abs(dx) * 0.21,
          0.62 + jitter * 0.53,
          0.29 + Math.abs(dz) * 0.21,
          stone[Math.floor(jitter * stone.length)],
          7,
          5,
          'marinRock',
        );
      if (jitter > 0.75)
        mesh.rod(
          at(0.28, ridge(0.28) - 0.36, 0.48),
          at(0.33, ridge(0.33) + 0.64, 0.71),
          0.22,
          '#77695e',
          6,
          'marinRock',
        );
    }
    return { dx, dz, mesh };
  });
}

export function drawIncubatorLife(
  m: Mesh,
  time: number,
  reduced: boolean,
  viewerX: number,
  viewerZ: number,
) {
  for (const { x, z, phase } of torches) {
    if (Math.hypot(x - viewerX, z - viewerZ) > 19) continue;
    const sway = reduced ? 0 : Math.sin(time * 0.013 + phase);
    m.sphere(
      x + sway * 0.042,
      INCUBATOR_FLOOR + 1.65,
      z,
      0.095,
      0.17 + sway * 0.035,
      0.09,
      '#ff892f',
      8,
      5,
      { emissive: 0.94 },
    );
    m.sphere(x, INCUBATOR_FLOOR + 1.59, z + 0.023, 0.06, 0.1, 0.06, '#ffe89f', 8, 5, {
      emissive: 1,
    });
  }
  for (const [i, [x, z]] of pools.entries()) {
    const p = incubatorPoint(x, z);
    if (Math.hypot(p.x - viewerX, p.z - viewerZ) > 17) continue;
    drawWildMonster(
      m,
      {
        ...p,
        z: p.z - 0.24,
        base: INCUBATOR_FLOOR + 0.028,
        combatKind: 'frog',
        angle: i * 1.4,
        phase: reduced ? 0 : time * 0.002 + i,
        motion: 0.3,
      },
      time,
      reduced,
    );
  }
}

export function drawIncubatorExit(m: Mesh) {
  const { x, z } = INCUBATOR_ENTRANCE;
  for (const side of [-1, 1])
    m.rod(
      [x + side * 0.36, INCUBATOR_FLOOR, z + 0.48],
      [x + side * 0.36, INCUBATOR_FLOOR + 2.25, z + 0.89],
      0.046,
      '#67482d',
      6,
      'wood',
    );
  for (let i = 0; i < 8; i++)
    m.rod(
      [x - 0.37, INCUBATOR_FLOOR + 0.14 + i * 0.275, z + 0.49 + i * 0.05],
      [x + 0.37, INCUBATOR_FLOOR + 0.14 + i * 0.275, z + 0.49 + i * 0.05],
      0.036,
      '#a47a45',
      6,
      'wood',
    );
}
