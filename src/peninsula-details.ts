import { pose, type Mesh } from './geometry.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import { PACIFICA_PARK, PACIFICA_PARK_OBSTACLES } from './southern-expansion.ts';
import { drawPlaque } from './southern-district.ts';
import { TILE_TYPES } from './tiles.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';
import type { PlantTree } from './types/scenery.ts';
import { makeNeighborhoodBench } from './neighborhood-interactions.ts';
import { drawGardenFlowers, drawShrub } from './garden-plants.ts';

type Ground = (x: number, z: number) => number;
type PathPoint = readonly [number, number];

function drawGardenWalk(m: Mesh, ground: Ground, points: readonly PathPoint[], width: number) {
  const edge = points.map(([x, z], i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)],
      dx = after[0] - before[0],
      dz = after[1] - before[1],
      scale = width / (2 * Math.hypot(dx, dz));
    return [x, z, -dz * scale, dx * scale];
  });
  for (let i = 1; i < edge.length; i++) {
    const a = edge[i - 1],
      b = edge[i],
      steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 7);
    const point = (step: number, side: number) => {
      const t = step / steps,
        x = a[0] * (1 - t) + b[0] * t + side * (a[2] * (1 - t) + b[2] * t),
        z = a[1] * (1 - t) + b[1] * t + side * (a[3] * (1 - t) + b[3] * t);
      return [x, ground(x, z) + 0.028, z] satisfies [number, number, number];
    };
    for (let step = 0; step < steps; step++)
      m.quad(
        point(step, -1),
        point(step, 1),
        point(step + 1, 1),
        point(step + 1, -1),
        '#c7b99b',
        'dirt',
      );
  }
}

function drawSouthCoastPlanting(m: Mesh, ground: Ground) {
  const beds = [
    { x: 58.45, z: 211.14, rx: 0.56, rz: 0.36, colors: ['#edb63e', '#f1e9d2', '#da8e49'] },
    { x: 59.52, z: 212.03, rx: 0.79, rz: 0.33, colors: ['#c685a1', '#f1e9d2', '#a68ece'] },
    { x: 60.34, z: 210.99, rx: 0.63, rz: 0.43, colors: ['#987cbe', '#e7c96d', '#e49bba'] },
  ];
  for (const { x, z, rx, rz, colors } of beds) {
    const edge = (i: number) => {
      const a = (i * Math.PI) / 10,
        xx = x + Math.cos(a) * (rx + 0.08),
        zz = z + Math.sin(a) * (rz + 0.07);
      return [xx, ground(xx, zz) + 0.015, zz];
    };
    const center = [x, ground(x, z) + 0.019, z];
    for (let i = 0; i < 20; i++) m.tri(center, edge(i + 1), edge(i), '#9b8063', 'dirt');
    drawGardenFlowers(m, ground, x, z, rx, rz, colors);
  }
  for (const [x, z, size] of [
    [58.15, 210.43, 0.37],
    [58.92, 210.6, 0.48],
    [59.58, 210.3, 0.38],
    [60.23, 210.26, 0.33],
    [61.0, 211.22, 0.45],
    [60.62, 211.86, 0.3],
    [58.32, 211.94, 0.32],
  ])
    drawShrub(m, ground, x, z, size, x + z);
}

export function drawNeighborhoodGreens(m: Mesh, ground: Ground, tree: PlantTree): RenderedSite[] {
  const parks = [
    {
      x: 39,
      z: 96,
      id: 'fountain-green',
      name: 'Fountain Green',
      benchX: 40.75,
      benchZ: 96.2,
      description: 'A stone fountain with gravel paths and a bench in the shade.',
    },
    {
      x: 32,
      z: 97,
      id: 'wildflower-green',
      name: 'Wildflower Green',
      benchX: 33.05,
      benchZ: 97.5,
      description: 'A winding path between beds of lupines, poppies and white daisies.',
    },
  ];
  const sites = parks.map((park, index) => {
    const { x, z, id, name, benchX, benchZ, description } = park;
    const start = m.data.length,
      base = ground(x, z),
      navigationPolygons: number[][][] = [];
    if (index === 0) {
      for (const side of [-1, 1]) {
        drawGardenWalk(
          m,
          ground,
          [
            [38.85, 95.2],
            [39 + side * 0.55, 95.32],
            [39 + side * 0.85, 95.78],
            [39 + side * 0.87, 96.27],
            [39 + side * 0.54, 96.68],
            [39.04, 96.89],
          ],
          0.44,
        );
      }
      drawGardenWalk(
        m,
        ground,
        [
          [39.04, 96.89],
          [38.84, 97.45],
          [38.85, 98.45],
        ],
        0.52,
      );
      m.cylinder(x, base - 0.13, z, 0.58, 0.39, '#a7aaa2', 24, 0.58, 'stone');
      m.cylinder(x, base + 0.26, z, 0.51, 0.018, '#6fa5a9', 24, 0.51, { water: 0.5 });
      m.cylinder(x, base + 0.27, z, 0.095, 0.48, '#c3bda4', 14, 0.055, 'stone');
      m.sphere(x, base + 0.73, z, 0.16, 0.055, 0.16, '#b3b49f', 14, 7, 'stone');
      const rim = Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return [x + Math.cos(a) * 0.58, z + Math.sin(a) * 0.58];
      });
      navigationPolygons.push(rim);
      for (const [dx, dz] of [
        [-1.55, 0.9],
        [1.46, -0.7],
        [1.37, 1.4],
        [-1.42, 1.8],
      ])
        drawShrub(m, ground, x + dx, z + dz, 0.34, dx + dz);
    } else {
      drawGardenWalk(
        m,
        ground,
        [
          [31.65, 95.53],
          [31.56, 96.18],
          [31.95, 96.74],
          [32.04, 97.32],
          [31.64, 97.94],
          [31.52, 98.46],
        ],
        0.57,
      );
      for (const [cx, cz] of [
        [30.75, 97.48],
        [32.84, 96.35],
        [33.24, 97.96],
      ])
        drawGardenFlowers(m, ground, cx, cz, 0.54, 0.32, ['#e5a142', '#aa8dc7', '#eee5cd']);
    }
    const count = m.data.length - start;
    const seatStart = m.data.length,
      seatBase = ground(benchX, benchZ),
      angle = Math.PI / 2;
    pose(m, benchX, seatBase, benchZ, angle, () => {
      for (const at of [-0.39, 0.34]) {
        m.box(at, -0.18, -0.16, 0.055, 0.55, 0.26, '#56685a', 'metal');
        m.box(at, 0.36, -0.22, 0.055, 0.34, 0.065, '#56685a', 'metal');
      }
      for (let slat = 0; slat < 4; slat++)
        m.box(-0.48, 0.35, -0.17 + slat * 0.092, 0.96, 0.05, 0.075, '#a98054', 'wood');
      for (const h of [0.49, 0.61]) m.box(-0.48, h, -0.2, 0.96, 0.085, 0.045, '#b08c61', 'wood');
    });
    const seat = makeNeighborhoodBench({
      id: id + '-bench',
      x: benchX,
      z: benchZ,
      angle,
      base: seatBase,
      start: seatStart,
      count: m.data.length - seatStart,
    });
    for (const [xx, zz] of index === 0
      ? [
          [37.38, 96.18],
          [40.63, 97.66],
        ]
      : [
          [30.31, 96.3],
          [33.77, 97.89],
        ])
      tree(xx - 0.5, zz - 0.5, index === 0 ? false : 3, true);
    return {
      id,
      kind: 'neighborhood-garden',
      label: name,
      description,
      solid: false,
      entry: { x: x - 0.5, y: 97.55 },
      mapPoint: { x, y: z },
      seats: [seat],
      navigationPolygons,
      start,
      count,
      lo: [x - 2, base - 0.35, 95.1],
      hi: [x + 2, base + 1.45, 98.55],
    };
  });
  for (const [x, z, size] of [
    [22.65, 96.74, 0.43],
    [23.34, 96.37, 0.41],
    [24.48, 96.45, 0.36],
    [25.19, 96.82, 0.52],
    [25.68, 97.48, 0.46],
    [22.75, 97.77, 0.36],
    [23.57, 98.11, 0.47],
    [24.78, 98.05, 0.36],
  ])
    drawShrub(m, ground, x, z, size, x);
  return sites;
}

export const PENINSULA_SIGNS = Object.freeze(['PACIFICA COMMONS', 'BUS'] satisfies [
  string,
  string,
]);
export function drawPeninsulaDetails(
  m: Mesh,
  terrain: { height: (arg0: number, arg1: number) => number },
  signs: SignAtlas,
  tree: (arg0: number, arg1: number, arg2: number | boolean, arg3: boolean) => void,
) {
  const p = PACIFICA_PARK,
    start = m.data.length;
  for (const o of PACIFICA_PARK_OBSTACLES) {
    const h = terrain.height(o.x, o.z);
    if (o.kind === 'tree') {
      tree(o.x - 0.5, o.z - 0.5, o.z < 131 ? 3 : true, true);
      continue;
    }
    if (o.kind === 'bench') {
      pose(m, o.x, h, o.z, o.rotation, () => {
        for (const x of [-0.3, 0.3])
          m.box(x, -0.1, -0.12, 0.045, 0.56, 0.26, '#60736e', { metal: 0.2 });
        for (let i = 0; i < 4; i++)
          m.box(-0.43, 0.44, -0.22 + i * 0.105, 0.86, 0.05, 0.08, '#b59a72', 'wood');
        m.box(-0.43, 0.49, -0.24, 0.86, 0.42, 0.045, '#b59a72', 'wood');
      });
    } else if (o.kind === 'fountain') {
      m.cylinder(o.x, h - 0.18, o.z, 0.59, 0.38, '#a5b1a6', 32, 0.59, 'stone');
      m.cylinder(o.x, h + 0.2, o.z, 0.5, 0.025, '#83b6ba', 32, 0.5, { water: 0.5 });
      m.cylinder(o.x, h + 0.22, o.z, 0.07, 0.46, '#c9c6ac', 16);
      m.sphere(o.x, h + 0.7, o.z, 0.16, 0.08, 0.16, '#d1d2b6', 16, 8);
    }
  }
  const signHeight = terrain.height(25, 128.55);
  for (const x of [24.25, 25.75] satisfies [number, number])
    m.cylinder(x, signHeight, 128.55, 0.035, 0.95, '#607d72', 10);
  m.box(24.08, signHeight + 0.56, 128.5, 1.84, 0.4, 0.08, '#547263');
  drawPlaque(m, signs, 'PACIFICA COMMONS', 25, signHeight + 0.6, 128.59, 1.72, 0.28);
  for (const [x, z] of [
    [23.1, 128.7] satisfies [number, number],
    [26.8, 134.25] satisfies [number, number],
  ])
    for (let i = 0; i < 7; i++) {
      const xx = x + i * 0.065,
        h = terrain.height(xx, z);
      m.rod(
        [xx, h, z] satisfies [number, number, number],
        [xx, h + 0.16, z] satisfies [number, number, number],
        0.008,
        '#72925c',
        5,
      );
      m.sphere(xx, h + 0.18, z, 0.045, 0.04, 0.045, i % 2 ? '#cfb56d' : '#b28ba6', 8, 5);
    }
  // No separate slab: the park inherits the same rolling terrain and textures.
  const site = {
    id: p.id,
    label: p.label,
    kind: 'park',
    entry: { ...p.entry },
    description: contentText('peninsula-details.drawPeninsulaDetails.description-2', {}),
    start,
    count: m.data.length - start,
    lo: [
      p.west,
      Math.min(...PACIFICA_PARK_OBSTACLES.map((o) => terrain.height(o.x, o.z))) - 0.2,
      p.north,
    ] satisfies [number, number, number],
    hi: [
      p.east,
      Math.max(...PACIFICA_PARK_OBSTACLES.map((o) => terrain.height(o.x, o.z))) + 3.5,
      p.south,
    ] satisfies [number, number, number],
  };
  for (const [x, z] of [
    [53, 98.25] satisfies [number, number],
    [36.8, 130] satisfies [number, number],
  ]) {
    const h = terrain.height(x, z);
    for (const xx of [-0.75, 0.75] satisfies [number, number])
      m.rod(
        [x + xx, h, z] satisfies [number, number, number],
        [x + xx, h + 2, z] satisfies [number, number, number],
        0.035,
        '#788e91',
        10,
      );
    m.box(x - 0.9, h + 2, z - 0.33, 1.8, 0.09, 0.66, '#87a5a1', { metal: 0.2 });
    m.box(x - 0.8, h + 0.45, z + 0.08, 1.6, 0.06, 0.22, '#a4b6ae');
    for (let i = 0; i < 4; i++)
      m.box(x - 0.8 + i * 0.4, h + 0.7, z + 0.31, 0.025, 1.2, 0.03, '#a5b9b9');
    m.rod(
      [x + 1.1, h, z] satisfies [number, number, number],
      [x + 1.1, h + 2.3, z] satisfies [number, number, number],
      0.024,
      '#91a29d',
      10,
    );
    drawPlaque(m, signs, 'BUS', x + 1.1, h + 1.8, z + 0.03, 0.45, 0.3);
  }
  for (const [x, z] of [
    [49.5, 99.5] satisfies [number, number],
    [35.5, 119.5] satisfies [number, number],
    [28.5, 127.5] satisfies [number, number],
    [28.5, 135.5] satisfies [number, number],
  ])
    for (let bar = 0; bar < 4; bar++) {
      const a = x - 0.42 + bar * 0.23,
        b = z + 0.95,
        w = 0.13,
        d = 0.72;
      for (let zz = b; zz < b + d - 1e-9; zz += 0.125) {
        const end = Math.min(b + d, zz + 0.125),
          at = (xx: number, yy: number) =>
            [xx, terrain.height(xx, yy) + TILE_TYPES.road.height + 0.006, yy] satisfies [
              number,
              number,
              number,
            ];
        m.quad(at(a, zz), at(a, end), at(a + w, end), at(a + w, zz), '#d5d6bc');
      }
    }
  drawSouthCoastPlanting(m, terrain.height);
  return site;
}
