import { drawBushFoliage } from './goblin-bush.ts';
import { drawNeighborhoodTree } from './neighborhood-tree.ts';
import { rand, rayTriangle, type Mesh } from './geometry.ts';
import { createRegionalNavigation } from './regional-navigation.ts';
import type { Point, Ray, Vec3 } from './types/geometry.ts';
import type { RenderedSite } from './types/world.ts';

const center = { x: -36.3, z: 62 };
const islandScale = Math.SQRT2;
const islandPoint = (x: number, z: number) => ({
  x: center.x + x * islandScale,
  z: center.z + z * islandScale,
});
const dockEntry = islandPoint(4.4, 0.75);
const dockLaunch = islandPoint(7.4, 0.75);
export const ONODA = { id: 'hiroo-onoda', ...islandPoint(-0.85, -0.45) } as const;
export const ONODA_DOCK = {
  id: 'onoda-island-dock',
  entry: { x: dockEntry.x - 0.5, y: dockEntry.z - 0.5 },
  launch: { x: dockLaunch.x - 0.5, y: dockLaunch.z - 0.5 },
  range: 1.4,
  offerRange: 12,
} as const;

export function nearOnodaLanding(point: Point) {
  const { launch, offerRange } = ONODA_DOCK;
  return Math.hypot(point.x - launch.x, point.y - launch.y) <= offerRange;
}

const edges = Array.from({ length: 20 }, (_, i) => {
  const a = (i * Math.PI * 2) / 20;
  const factor = 1 + 0.065 * Math.sin(a * 3 + 0.7) + 0.04 * Math.cos(a * 5);
  return [Math.cos(a) * 5.8 * factor * islandScale, Math.sin(a) * 4.55 * factor * islandScale];
});
export const ONODA_SHORE = edges.map(([x, z]) => [center.x + x, center.z + z]);
const trees = [
  [-4.15, -0.51, 1.23],
  [-3.6, 1.95, 1.05],
  [-3.2, -2.45, 1.11],
  [-1.72, 2.9, 1.2],
  [-1.7, -3.03, 1.17],
  [-0.02, 3.04, 1.27],
  [0.17, -3.13, 1.22],
  [1.52, 2.8, 1.15],
  [1.78, -2.63, 1.12],
  [2.65, -1.32, 1.22],
  [2.8, 2.07, 1.02],
  [3.59, 1.68, 1.15],
  [-4.75, 0.92, 1.31],
  [-4.46, -1.66, 1.2],
  [-3.8, -0.04, 1.52],
  [-3.33, 0.89, 1.14],
  [-2.94, -1.55, 1.34],
  [-2.5, 1.66, 1.42],
  [-2.28, -2.79, 1.04],
  [-1.34, 3.4, 0.95],
  [-1.31, -1.99, 1.18],
  [-1.02, 1.55, 1.52],
  [-0.22, -1.56, 1.34],
  [0.47, 2.22, 1.19],
  [0.82, -3.16, 1.14],
  [1.42, 1.18, 1.27],
  [1.78, -1.47, 1.45],
  [2.71, -2.4, 0.98],
  [3.58, -0.67, 1.38],
  [4.53, -1.54, 1.17],
  [4.45, 2.15, 0.97],
].map(([x, z, size]) => ({ ...islandPoint(x, z), size }));

const bounds = {
  west: Math.min(...ONODA_SHORE.map(([x]) => x)),
  east: Math.max(...ONODA_SHORE.map(([x]) => x)),
  north: Math.min(...ONODA_SHORE.map(([, z]) => z)),
  south: Math.max(...ONODA_SHORE.map(([, z]) => z)),
};

const ring = (fraction: number, height: number): Vec3[] =>
  edges.map(([x, z], i) => [
    center.x + x * fraction,
    height + 0.13 * fraction * (1 - fraction) * Math.sin(i * 1.38),
    center.z + z * fraction,
  ]);
const rings = [ring(1, 0.025), ring(0.85, 0.283), ring(0.58, 0.91), ring(0.28, 1.42)];
const colors = ['#baac82', '#8c9b59', '#758b4e', '#82945b'];
const triangles: { corners: [Vec3, Vec3, Vec3]; band: number }[] = [];
for (let i = 0; i < edges.length; i++) {
  const j = (i + 1) % edges.length;
  for (let k = 1; k < rings.length; k++) {
    const outer = rings[k - 1];
    const inner = rings[k];
    triangles.push({ corners: [outer[i], inner[i], inner[j]], band: k - 1 });
    triangles.push({ corners: [outer[i], inner[j], outer[j]], band: k - 1 });
  }
  triangles.push({
    corners: [[center.x - 0.3, 1.58, center.z - 0.25], rings[3][j], rings[3][i]],
    band: 3,
  });
}

export function raycastOnodaIsland(ray: Ray, maxDistance = Infinity) {
  let nearest = maxDistance;
  for (const { corners } of triangles) {
    const distance = rayTriangle(ray, ...corners);
    if (distance !== null && distance < nearest) nearest = distance;
  }
  return nearest < maxDistance ? { distance: nearest } : null;
}

export function onodaIslandHeight(x: number, z: number) {
  if (x < bounds.west || x > bounds.east || z < bounds.north || z > bounds.south) return null;
  const hit = raycastOnodaIsland({ origin: [x, 4, z], dir: [0, -1, 0] });
  return hit === null ? null : 4 - hit.distance;
}

export const onodaIslandNavigation = createRegionalNavigation({
  ...bounds,
  walkable: (x, z) =>
    (onodaIslandHeight(x, z) ?? 0) > 0.105 &&
    !trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 0.23 * tree.size),
});

export function drawOnodaIsland(m: Mesh) {
  for (const { corners, band } of triangles)
    m.tri(...corners, colors[band], band === 0 ? 'sand' : 'grass');

  const cover = trees.map(({ x, z, size }, i) => {
    const base = onodaIslandHeight(x, z) ?? 0.13;
    const r = 0.102 * size;
    drawNeighborhoodTree(m, x, base, z, rand(i, 17), size, i % 5 === 2);
    return {
      x: x - r,
      y: z - r,
      w: r * 2,
      d: r * 2,
      base,
      solid: true,
      preserveGround: true,
      lo: [x - r, base, z - r],
      hi: [x + r, base + 1.45 * size, z + r],
    };
  });
  const shrubColors = [
    ['#3c5838', '#587445', '#768f52'],
    ['#536038', '#727f47', '#8f9e59'],
    ['#405b42', '#577a5b', '#7a9465'],
  ];
  for (let i = 0; i < 112; i++) {
    const a = i * 2.39996 + rand(i, 2) * 0.45;
    const distance = 0.2 + 0.66 * Math.sqrt((i + rand(i, 13)) / 112);
    const { x, z } = islandPoint(5.8 * distance * Math.cos(a), 4.55 * distance * Math.sin(a));
    if (x > dockEntry.x - 1.7 && Math.abs(z - dockEntry.z) < 1.05) continue;
    if (Math.hypot(x - ONODA.x, z - ONODA.z) < 0.9) continue;
    const base = onodaIslandHeight(x, z);
    if (base !== null) {
      const size = 0.24 + rand(i, 5) * 0.36;
      drawBushFoliage(m, x, base + size * 0.44, z, size, size * 0.77, size, shrubColors[i % 3]);
    }
  }
  for (let i = 0; i < 18; i++) {
    const a = ((i + rand(i, 51)) * Math.PI * 2) / 18;
    const distance = 0.89 + rand(i, 61) * 0.065;
    const { x, z } = islandPoint(5.8 * distance * Math.cos(a), 4.55 * distance * Math.sin(a));
    if (x > dockEntry.x - 1.7 && Math.abs(z - dockEntry.z) < 1.05) continue;
    const base = onodaIslandHeight(x, z);
    if (base !== null) {
      const size = 0.23 + rand(i, 69) * 0.31;
      m.sphere(x, base + size * 0.05, z, size, size * 0.44, size * 0.72, '#8a8978', 7, 4, 'stone');
    }
  }

  const start = m.data.length;
  const { z } = dockEntry;
  const dockX = dockEntry.x - 0.2 * islandScale;
  for (let i = 0; i < 12; i++)
    m.box(
      dockX + i * 0.167 * islandScale,
      0.3,
      z - 0.49,
      0.158 * islandScale,
      0.074,
      0.98,
      '#86714b',
      'wood',
    );
  for (const offset of [0.08, 1.83])
    for (const side of [-1, 1]) {
      const x = dockX + offset * islandScale;
      m.cylinder(x, -0.18, z + side * 0.45, 0.066, 0.77, '#635534', 8);
      m.cylinder(x, 0.44, z + side * 0.45, 0.068, 0.043, '#c5b68c', 8);
    }
  const boardX = dockX + 0.43 * islandScale;
  m.sphere(boardX, 0.48, z - 0.37, 0.45, 0.063, 0.14, '#b88649', 12, 6);
  m.rod([boardX, 0.47, z - 0.37], [boardX + 0.02, 1.43, z - 0.37], 0.014, '#5c5241', 8);
  const sail: [Vec3, Vec3, Vec3] = [
    [boardX + 0.02, 1.43, z - 0.37],
    [boardX + 0.03, 0.54, z - 0.37],
    [boardX - 0.43, 0.61, z - 0.37],
  ];
  m.tri(sail[0], sail[1], sail[2], '#d9be83');
  m.tri(sail[0], sail[2], sail[1], '#d9be83');
  const dock: RenderedSite = {
    ...ONODA_DOCK,
    kind: ONODA_DOCK.id,
    label: 'Onoda Island landing',
    description: 'A small windsurf landing beside a wooded island west of the humpbacks.',
    navigationAccess: 'windsurf',
    solid: false,
    start,
    count: m.data.length - start,
    lo: [dockX - 0.05, -0.18, z - 0.52],
    hi: [dockX + 2.01 * islandScale, 1.45, z + 0.52],
  };
  return { cover, dock };
}
