import type { Point, WorldPoint } from './types/geometry.ts';
import { createNavigationGrid } from './navigation.ts';
import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { SignAtlas } from './types/world.ts';
import type { WildernessSpawn } from './types/monsters.ts';

const origin = -3000;
// The old stair and intake rooms occupy the west side. Follow the marked
// thresholds east through specimen storage, then south to the reactor.
// Equipment tiles are benches (b), vats (v), cabinets (t), control panels (i),
// power coils (p), and the reactor (r).
export const LAB_MAP = [
  '##########################',
  '#..t.......t..###i.v.v.t.#',
  '#.............|.|........#',
  '#.bbb.....bbb.|.|........#',
  '#.............###........#',
  '#.............###bt....v.#',
  '######...############---##',
  '#.v..#...#..v..######---##',
  '#..............##i.pt...p#',
  '#....#...#.....##........#',
  '######...########........#',
  '######.e.########p....pp.#',
  '#################.......p#',
  '##################---#####',
  '##################---#####',
  '###############b........t#',
  '###############p........p#',
  '###############..........#',
  '###############p........p#',
  '################tb.pri.pv#',
  '##########################',
] as const;
const width = LAB_MAP[0].length;
const height = LAB_MAP.length;
export const LAB_INSTANCE = {
  id: 'berkeley-lab',
  kind: 'berkeley-lab',
  layer: -1,
  bounds: { west: origin, east: origin + width, north: origin, south: origin + height },
} as const;
export const LAB_FLOOR = -5;
export const LAB_SIGN = 'GOOSE CORP\nTRUST THE SIMULATION';
export const labPoint = (x: number, z: number) => ({ x: origin + x + 0.5, z: origin + z + 0.5 });
export const LAB_ENTRANCE = labPoint(7, 11);
export const LAB_EXIT = {
  id: 'berkeley-lab-exit',
  kind: 'lab-exit',
  label: 'Laboratory stairs',
  entry: { x: LAB_ENTRANCE.x - 0.5, y: LAB_ENTRANCE.z - 0.5 },
  description: 'The stairs return to the scientist’s house.',
};
export const LAB_POSTER = {
  id: 'berkeley-lab-poster',
  kind: 'poster',
  label: 'Goose Corp poster',
  description:
    'A Goose Corp poster reads “Trust the Simulation.” Someone has underlined the word “trust” three times.',
};
export const LAB_SPAWNS: readonly WildernessSpawn[] = [
  ...[
    [2, 2, 8],
    [12, 12, 8],
    [13, 4, 2],
    [14, 13, 4],
    [15, 23, 3],
    [16, 23, 7],
    [17, 19, 10],
    [18, 17, 16],
  ].map(([id, x, z]) => ({
    id: `berkeley-mad-cultist-${id}`,
    combatKind: 'mad-cultist',
    ...labPoint(x, z),
  })),
  { id: 'berkeley-madder-scientist-7', combatKind: 'madder-scientist', ...labPoint(22, 17) },
];
export const inBerkeleyLab = (x: number, z: number) => {
  const b = LAB_INSTANCE.bounds;
  return x >= b.west && x < b.east && z >= b.north && z < b.south;
};
const tileAt = (x: number, z: number) => LAB_MAP[z]?.[x] || '#';
export const labTileWalkable = (tile: string) =>
  tile === '.' || tile === 'e' || tile === '-' || tile === '|';
const grid = createNavigationGrid({
  width,
  height,
  offset: 0.5,
  mask: Array.from(
    { length: width * height },
    (_, i) => +labTileWalkable(tileAt(i % width, Math.floor(i / width))),
  ),
});
const local = ({ x, y }: Point) => ({ x: x - origin, y: y - origin });
const world = ({ x, y }: Point) => ({ x: x + origin, y: y + origin });
export const LAB_NAV = {
  free: (x: number, y: number) => grid.free(x - origin, y - origin),
  segment: (a: Point, b: Point) => grid.segment(local(a), local(b)),
  path: (a: Point, b: Point) => grid.path(local(a), local(b))?.map(world) ?? null,
  nearest(x: number, y: number, from: Point) {
    const point = grid.nearest(x - origin, y - origin, 24, (a, b) =>
      grid.connected(local(from), { x: a, y: b }),
    );
    return point ? world(point) : null;
  },
};
export const labSegment = (a: WorldPoint, b: WorldPoint) =>
  LAB_NAV.segment({ x: a.x - 0.5, y: a.z - 0.5 }, { x: b.x - 0.5, y: b.z - 0.5 });

function drawLabEquipment(m: Mesh, tile: string, accent: string) {
  const metal = { metal: 0.45 };
  const light = { emissive: 0.65 };
  if (tile === 't') {
    m.box(0.06, 0, 0.08, 0.88, 1.27, 0.79, '#3c4b59', metal);
    m.box(0.04, 1.27, 0.06, 0.92, 0.09, 0.83, '#8f9c9f', metal);
    for (const h of [0.2, 0.55, 0.9]) {
      m.box(0.13, h, 0.86, 0.74, 0.26, 0.03, '#26353c', metal);
      m.box(0.2, h + 0.16, 0.89, 0.28, 0.035, 0.035, '#b6c7c3', metal);
      m.box(0.73, h + 0.16, 0.89, 0.06, 0.04, 0.035, accent, light);
    }
  }
  if (tile === 'i') {
    m.box(0.1, 0, 0.1, 0.8, 0.24, 0.8, '#505d62', metal);
    m.box(0.24, 0.24, 0.23, 0.52, 0.77, 0.42, '#314252', metal);
    m.box(0.16, 1.01, 0.19, 0.68, 0.11, 0.57, '#9aa9aa', metal);
    m.box(0.28, 0.73, 0.65, 0.44, 0.2, 0.025, '#132830');
    for (const h of [0.77, 0.85]) m.box(0.34, h, 0.681, 0.25, 0.025, 0.013, accent, light);
    m.rod([0.3, 0.16, 0.4], [0.3, 0.16, -0.14], 0.07, '#ba8c59', 8);
    m.rod([0.7, 0.16, 0.4], [0.7, 0.16, -0.14], 0.07, '#ba8c59', 8);
  }
  if (tile === 'p' || tile === 'r') {
    const reactor = tile === 'r';
    const top = reactor ? 2.45 : 1.35;
    m.box(0.04, 0, 0.04, 0.92, 0.22, 0.92, '#364350', metal);
    m.cylinder(0.5, 0.22, 0.5, 0.23, top - 0.22, accent, 12, 0.23, light);
    for (let h = 0.26; h < top; h += 0.23)
      m.cylinder(0.5, h, 0.5, 0.35, 0.085, '#62737e', 12, 0.35, metal);
    for (const x of [0.17, 0.83])
      m.rod([x, 0.16, 0.65], [x, top + 0.1, 0.65], 0.028, '#b5a38b', 6, metal);
    m.cylinder(0.5, top, 0.5, 0.4, 0.16, '#9babb0', 12, 0.33, metal);
  }
}

export function drawBerkeleyLab(m: Mesh) {
  pose(m, origin, LAB_FLOOR, origin, 0, () => {
    for (let z = 0; z < height; z++)
      for (let x = 0; x < width; x++) {
        const tile = tileAt(x, z),
          wall = tile === '#';
        if (
          wall &&
          [
            [-1, 0],
            [1, 0],
            [0, 1],
            [0, -1],
          ].every(([dx, dz]) => tileAt(x + dx, z + dz) === '#')
        )
          continue;
        const accent = z >= 15 ? '#f78c74' : x >= 17 && z >= 8 ? '#7abefc' : '#9aedaf';
        const floor =
          z >= 15
            ? ['#554657', '#655468']
            : x >= 17 && z >= 8
              ? ['#435469', '#52647a']
              : ['#52666a', '#65777b'];
        m.box(
          x,
          -0.1,
          z,
          1,
          wall ? 0.95 : 0.1,
          1,
          wall ? '#475b60' : floor[(x + z) % 2],
          wall ? 'concrete' : 'stone',
        );
        if (wall) m.box(x, 0.74, z, 1, 0.1, 1, '#81978f', { metal: 0.5 });
        if (tile === '-' || tile === '|') {
          const across = tile === '-';
          m.box(x, 0.004, z, 1, 0.013, 1, '#36434a', { metal: 0.6 });
          for (const n of [0.08, 0.38, 0.68])
            m.box(
              x + (across ? n : 0.27),
              0.018,
              z + (across ? 0.27 : n),
              across ? 0.14 : 0.46,
              0.012,
              across ? 0.46 : 0.14,
              '#e0b759',
            );
        }
        if (tile === 'b') {
          m.box(x + 0.07, 0, z + 0.12, 0.86, 0.53, 0.76, '#464b60', { metal: 0.45 });
          m.box(x + 0.04, 0.53, z + 0.07, 0.92, 0.1, 0.86, '#c1cdc2', { metal: 0.4 });
          m.box(x + 0.18, 0.63, z + 0.28, 0.36, 0.2, 0.31, '#25383e');
          m.box(x + 0.22, 0.67, z + 0.59, 0.27, 0.13, 0.02, '#a4eca5', { emissive: 0.6 });
        }
        if (tile === 'v') {
          m.cylinder(x + 0.5, 0, z + 0.5, 0.39, 0.22, '#384957', 12);
          m.cylinder(x + 0.5, 0.22, z + 0.5, 0.31, 1.13, '#69cfa6', 16, 0.31, {
            emissive: 0.43,
          });
          m.cylinder(x + 0.5, 1.35, z + 0.5, 0.31, 0.3, '#91b5a8', 16, 0.31, {
            metal: 0.34,
          });
          for (const side of [-1, 1]) {
            m.rod(
              [x + 0.5 + side * 0.28, 0.19, z + 0.68],
              [x + 0.5 + side * 0.28, 1.67, z + 0.68],
              0.025,
              '#5e746f',
              6,
            );
          }
          m.rod([x + 0.6, 0.31, z + 0.795], [x + 0.6, 1.24, z + 0.795], 0.022, '#bff1c9', 7, {
            emissive: 0.65,
          });
          m.cylinder(x + 0.5, 1.65, z + 0.5, 0.4, 0.14, '#566877', 12);
          m.rod([x + 0.5, 1.72, z + 0.5], [x + 0.5, 1.72, z - 0.22], 0.073, '#b68b57', 9);
        }
        if (tile === 't' || tile === 'i' || tile === 'p' || tile === 'r')
          pose(m, x, 0, z, 0, () => drawLabEquipment(m, tile, accent));
      }
    for (const x of [6, 8]) m.box(x + 0.15, 0.005, 6.1, 0.09, 0.012, 4.6, '#e6c765');
    for (const z of [15.08, 18.87])
      m.box(16.06, 0.008, z, 7.88, 0.012, 0.055, '#e27560', { emissive: 0.25 });
    for (const x of [16.06, 23.885])
      m.box(x, 0.008, 15.08, 0.055, 0.012, 3.845, '#e27560', { emissive: 0.25 });
  });
}
export function drawLabPoster(m: Mesh, signs: SignAtlas) {
  const p = labPoint(7, 0);
  pose(m, p.x, LAB_FLOOR, p.z + 0.51, 0, () => {
    m.box(-0.52, 0.35, -0.04, 1.04, 0.65, 0.055, '#3c343d');
    drawPlaque(m, signs, LAB_SIGN, 0, 0.44, 0.02, 0.94, 0.42);
  });
}
export function drawLabExit(m: Mesh) {
  pose(m, LAB_ENTRANCE.x, LAB_FLOOR, LAB_ENTRANCE.z + 0.27, 0, () => {
    for (let i = 0; i < 4; i++)
      m.box(-0.48, 0, 0.08 * i, 0.96, 0.16 * (i + 1), 0.08, '#a1a9a5', { metal: 0.3 });
    m.rod([-0.48, 0.48, 0], [-0.48, 0.92, 0.32], 0.035, '#d6aa55', 6);
    m.rod([0.48, 0.48, 0], [0.48, 0.92, 0.32], 0.035, '#d6aa55', 6);
  });
}
