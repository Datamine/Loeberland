import { createNavigationGrid } from './navigation.ts';
import type { Point, WorldPoint } from './types/geometry.ts';
import type { WildernessSpawn } from './types/monsters.ts';

const origin = -3600;
const width = 45;
const height = 39;
export const INCUBATOR_CRATES = [
  [4, 30, 2],
  [6, 16, 2],
  [12, 18, 1],
  [19, 21, 1],
  [28, 31, 3],
  [32, 32, 2],
  [34, 6, 1],
  [39, 9, 2],
] as const;
const POSTER_BOX_TILES = [
  [10, 32],
  [24, 7],
] as const;
export const INCUBATOR_THRONE = [39, 7] as const;
export const GOBLIN_CITY_HALL = {
  id: 'goblin-city-hall',
  name: 'Goblin City Hall',
  x: 54,
  z: -48,
  entry: { x: 53.5, y: -46 },
  clerk: { id: 'goblin-city-hall-clerk', name: 'Goblin City Hall Clerk', x: 55.25, z: -45.5 },
  clerkRange: 1.8,
  fishFee: 5,
} as const;
// The instance and sentry IDs stay stable for saved encounters.
export const INCUBATOR_CAVE = {
  id: 'goblin-incubator-cave',
  kind: 'goblin-incubator-cave',
  layer: -1,
  bounds: { west: origin, east: origin + width, north: origin, south: origin + height },
} as const;
export const INCUBATOR_FLOOR = -7;
export const GOBLIN_KING = 'goblin-king';
export const GOBLIN_CHARM = 'goblin-charm';
export const INCUBATOR_GUARD = 'incubator-goblin-guard';
export const INCUBATOR_VETERAN = 'incubator-goblin-veteran';
export const GOBLIN_ROCK = { range: 15, flight: 0.84, burst: 0.31, width: 3 } as const;

const chambers = [
  [8, 30, 6.2, 4.9],
  [9, 18, 5.6, 4.8],
  [21, 22, 6.0, 5.2],
  [30, 30, 5.5, 4.6],
  [23, 9, 5.5, 4.8],
  [35, 10, 7.1, 6.4],
];
const tunnels = [
  [
    [7, 36],
    [7, 27],
    [5, 24],
    [6, 20],
    [9, 18],
  ],
  [
    [9, 18],
    [14, 18],
    [17, 23],
    [21, 22],
  ],
  [
    [21, 22],
    [26, 24],
    [26, 28],
    [30, 30],
  ],
  [
    [21, 22],
    [23, 17],
    [20, 13],
    [23, 9],
  ],
  [
    [23, 9],
    [26, 6],
    [30, 5],
    [33, 9],
    [35, 10],
  ],
];
function passageDistance(x: number, z: number, a: number[], b: number[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export function incubatorFloorTile(x: number, z: number) {
  if (x < 1 || x >= width - 1 || z < 1 || z >= height - 1) return false;
  const ripple = Math.sin(x * 1.87 + z * 2.51) * 0.055;
  return (
    chambers.some(
      ([cx, cz, rx, rz]) => ((x + 0.5 - cx) / rx) ** 2 + ((z + 0.5 - cz) / rz) ** 2 < 1 + ripple,
    ) ||
    tunnels.some((path) =>
      path.slice(1).some((b, i) => passageDistance(x + 0.5, z + 0.5, path[i], b) < 1.79 + ripple),
    )
  );
}
const obstructed = new Set([
  ...[...INCUBATOR_CRATES, ...POSTER_BOX_TILES].map(([x, z]) => z * width + x),
  INCUBATOR_THRONE[1] * width + INCUBATOR_THRONE[0],
]);
export const INCUBATOR_TILES = Array.from({ length: width * height }, (_, i) => {
  const x = i % width,
    z = Math.floor(i / width);
  return { x, z, floor: incubatorFloorTile(x, z), walkable: !obstructed.has(i) };
}).filter(({ floor }) => floor);
const grid = createNavigationGrid({
  width,
  height,
  offset: 0.5,
  mask: Array.from({ length: width * height }, (_, i) =>
    Number(incubatorFloorTile(i % width, Math.floor(i / width)) && !obstructed.has(i)),
  ),
});
const local = ({ x, y }: Point) => ({ x: x - origin, y: y - origin });
const world = ({ x, y }: Point) => ({ x: x + origin, y: y + origin });
export const INCUBATOR_NAV = {
  free: (x: number, y: number) => grid.free(x - origin, y - origin),
  segment: (a: Point, b: Point) => grid.segment(local(a), local(b)),
  path: (a: Point, b: Point) => grid.path(local(a), local(b))?.map(world) ?? null,
  nearest(x: number, y: number, from: Point) {
    const point = grid.nearest(x - origin, y - origin, 45, (a, b) =>
      grid.connected(local(from), { x: a, y: b }),
    );
    return point ? world(point) : null;
  },
};
export const incubatorPoint = (x: number, z: number): WorldPoint => ({
  x: origin + x + 0.5,
  z: origin + z + 0.5,
});
export const INCUBATOR_ENTRANCE = incubatorPoint(7, 36);
export const INCUBATOR_EXIT = {
  id: 'goblin-incubator-exit',
  kind: 'goblin-incubator-exit',
  label: 'City Hall stairs',
  entry: { x: INCUBATOR_ENTRANCE.x - 0.5, y: INCUBATOR_ENTRANCE.z - 0.5 },
  description: 'The stairs climb back to the entrance of Goblin City Hall.',
};
export const INCUBATOR_POSTER_BOXES = POSTER_BOX_TILES.map(([x, z], index) => ({
  ...incubatorPoint(x, z),
  id: 'incubator-goose-posters-' + (index + 1),
  kind: 'incubator-goose-posters',
  label: 'Box of Goose posters',
  description: 'The box is stuffed with rolled posters of a goose striking a stately pose.',
}));

const roster = [
  [4, 31],
  [6, 29],
  [9, 31],
  [10, 28],
  [12, 29],
  [7, 27],
  [6, 19],
  [8, 17],
  [10, 15],
  [11, 18],
  [12, 20],
  [7, 15],
  [10, 21],
  [17, 21],
  [19, 18],
  [20, 24],
  [22, 21],
  [24, 20],
  [23, 24],
  [25, 22],
  [27, 29],
  [29, 27],
  [31, 28],
  [32, 31],
  [29, 32],
  [33, 29],
  [27, 31],
  [20, 10],
  [21, 7],
  [22, 11],
  [23, 6],
  [25, 10],
  [24, 12],
  [27, 8],
  [30, 10],
  [32, 7],
  [32, 12],
  [35, 13],
  [38, 10],
  [36, 7],
  [34, 8],
  [37, 5],
  [37, 11],
  [38, 12],
];
export const INCUBATOR_SPAWNS: readonly WildernessSpawn[] = [
  ...roster.map(([x, z], i) => ({
    id: 'goblin-incubator-sentry-' + (i + 1),
    combatKind: i % 3 === 0 ? INCUBATOR_VETERAN : INCUBATOR_GUARD,
    ...incubatorPoint(x, z),
  })),
  { id: GOBLIN_KING, combatKind: GOBLIN_KING, ...incubatorPoint(38, 7) },
];
export const INCUBATOR_GUARD_LINES = [
  "You can't be in here!",
  'Defend our King!',
  "That's our rightfully elected monarch!",
  'Attacking the King is against our Constitution!',
] as const;
export const INCUBATOR_DEATH_LINES = [
  'This is an electoral emergency!',
  'Unprecedented in hundreds of years!',
  "I'm filing a Goose Council petition!",
  'I find this very troubling.',
  'A dark day for our kingdom',
  "I knew we should've elected the other, stronger candidate",
] as const;
