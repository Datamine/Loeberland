import { rand, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export const FROG_FARM = {
  id: 'goblin-frog-farm',
  name: 'Goblin Frog Farm',
  x: 47,
  // Extend north so the south gate and the path to the scientist stay in place.
  z: -23.1,
  w: 5,
  d: 6.6,
  entry: { x: 46.5, y: -19.4 },
  farmer: { id: 'goblin-frog-farmer', x: 48.45, z: -19 },
};

const farm = FROG_FARM;
const west = farm.x - farm.w / 2,
  east = farm.x + farm.w / 2,
  north = farm.z - farm.d / 2,
  south = farm.z + farm.d / 2;
const rails = [
  [west, north, east, north],
  [west, north, west, south],
  [east, north, east, south],
  [west, south, farm.x - 0.88, south],
  [farm.x + 0.88, south, east, south],
] as const;
const trough = { x: farm.x, z: north + 0.48, w: 1.32, d: 0.58 };

export const FROG_SPAWNS = [
  [45.65, -23.14],
  [48.35, -23.14],
  [45.65, -20.93],
  [48.35, -20.93],
  [45.65, -25.03],
  [48.35, -25.03],
].map(([x, z], i) => ({ id: 'farm-frog-' + (i + 1), combatKind: 'frog', x, z }));

export function inFrogFarm(x: number, z: number, margin = 0) {
  return x > west - margin && x < east + margin && z > north - margin && z < south + margin;
}

export function frogFarmBlocks(x: number, z: number) {
  return (
    (Math.abs(x - trough.x) < trough.w / 2 + 0.16 &&
      Math.abs(z - trough.z) < trough.d / 2 + 0.16) ||
    rails.some(
      ([ax, az, bx, bz]) => x > ax - 0.13 && x < bx + 0.13 && z > az - 0.13 && z < bz + 0.13,
    )
  );
}

export function frogFarmGrade(x: number, z: number, natural: number) {
  const distance = Math.max(west - x, x - east, north - z, z - south, 0);
  if (distance >= 1.65) return natural;
  const blend = 1 - distance / 1.65;
  const grade = 5.48 - (x - farm.x) * 0.12 + (z - farm.z) * 0.025;
  return natural + (grade - natural) * blend ** 2 * (3 - 2 * blend);
}

export function drawFrogFarm(
  mesh: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const start = mesh.data.length;
  for (const [ax, az, bx, bz] of rails) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.15);
    const posts = Array.from({ length: steps + 1 }, (_, i) => {
      const x = ax + ((bx - ax) * i) / steps,
        z = az + ((bz - az) * i) / steps;
      return { x, z, y: ground(x, z) };
    });
    for (const { x, y, z } of posts)
      mesh.box(x - 0.062, y - 0.08, z - 0.062, 0.124, 0.88, 0.124, '#82664c', 'marinTimber');
    for (const [i, a] of posts.slice(0, -1).entries()) {
      const b = posts[i + 1];
      for (const h of [0.24, 0.57])
        mesh.rod([a.x, a.y + h, a.z], [b.x, b.y + h, b.z], 0.046, '#a48a65', 6, 'marinTimber');
    }
  }

  const { x, z, w, d } = trough;
  const rim = Math.max(ground(x - w / 2, z), ground(x + w / 2, z)) + 0.24;
  mesh.box(x - w / 2, rim - 0.4, z - d / 2, w, 0.31, d, '#757765', 'stone');
  for (const side of [-1, 1]) {
    mesh.box(
      x - w / 2,
      rim - 0.13,
      z + side * (d / 2 - 0.047) - 0.047,
      w,
      0.13,
      0.094,
      '#9a9984',
      'stone',
    );
    mesh.box(
      x + side * (w / 2 - 0.047) - 0.047,
      rim - 0.13,
      z - d / 2,
      0.094,
      0.13,
      d,
      '#9a9984',
      'stone',
    );
  }
  mesh.box(x - w / 2 + 0.085, rim - 0.092, z - d / 2 + 0.085, w - 0.17, 0.019, d - 0.17, '#5c9182');
  for (const [dx, dz] of [
    [-0.35, 0.07],
    [0.06, -0.09],
    [0.29, 0.065],
  ])
    mesh.cylinder(x + dx, rim - 0.071, z + dz, 0.082, 0.012, '#779856', 9);

  const signX = farm.x - 1.47,
    signY = ground(signX, south);
  mesh.box(signX - 0.04, signY - 0.1, south - 0.07, 0.08, 1.29, 0.12, '#604934', 'wood');
  mesh.box(signX - 0.58, signY + 0.78, south - 0.025, 1.16, 0.32, 0.1, '#735438', 'wood');
  drawPlaque(mesh, signs, farm.name, signX, signY + 0.84, south + 0.08, 1.09, 0.19);

  const bushes = [
    [43.8, north - 0.57, 0.51],
    [45.9, north - 0.9, 0.56],
    [48.15, north - 0.92, 0.45],
    [50.17, north, 0.61],
    [50.21, -21.7, 0.46],
    [49.9, -18.95, 0.49],
    [44.72, -18.44, 0.47],
  ];
  for (const [i, [bx, bz, r]] of bushes.entries()) {
    const y = ground(bx, bz);
    for (let lobe = 0; lobe < 5; lobe++) {
      const a = (lobe * Math.PI * 2) / 5 + i;
      mesh.sphere(
        bx + Math.cos(a) * r * 0.52,
        y + r * (0.39 + 0.24 * rand(i, lobe)),
        bz + Math.sin(a) * r * 0.48,
        r * 0.62,
        r * 0.57,
        r * 0.57,
        ['#607649', '#7d8e57', '#526a45'][lobe % 3],
        8,
        5,
        'marinScrub',
      );
    }
    for (let j = 0; j < 5; j++) {
      const a = (j * Math.PI * 2) / 5;
      mesh.sphere(
        bx + Math.cos(a) * r * 0.49,
        y + r * 0.85,
        bz + Math.sin(a) * r * 0.52,
        0.032,
        0.034,
        0.033,
        '#a66a4e',
        6,
        5,
      );
    }
  }
  for (const [cx, cz] of [
    [trough.x - 0.85, trough.z - 0.01],
    [trough.x + 0.83, trough.z - 0.08],
    [49.16, -21.12],
    [44.94, -22.55],
  ]) {
    const y = ground(cx, cz);
    for (let i = 0; i < 6; i++) {
      const a = 2.4 * i,
        dx = Math.sin(a) * 0.16,
        dz = Math.cos(a) * 0.16;
      mesh.tri(
        [cx + dx - 0.025, y - 0.02, cz + dz],
        [cx + dx + 0.025, y - 0.02, cz + dz],
        [cx + dx * 1.7, y + 0.24 + 0.11 * rand(cx, i), cz + dz * 1.7],
        i % 2 ? '#748b50' : '#95a063',
      );
    }
  }

  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < mesh.data.length; i += 11)
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], mesh.data[i + axis]);
      hi[axis] = Math.max(hi[axis], mesh.data[i + axis]);
    }
  return {
    id: farm.id,
    label: farm.name,
    kind: farm.id,
    entry: farm.entry,
    start,
    count: mesh.data.length - start,
    lo,
    hi,
    description: 'A fenced patch of hillside with a stone trough and a clutch of sturdy frogs.',
  };
}
