import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import { CONSTRUCTION_SITE } from './construction-layout.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export function drawConstructionSite(
  mesh: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, west, east, north, south, work } = CONSTRUCTION_SITE;
  const start = mesh.data.length;
  const slab = ground((west + east) / 2, 105.75) + 0.08;
  const timber = '#ba8650';
  const floor = slab + 0.09;
  const eaves = floor + 1.5;
  const ridge = eaves + 0.56;
  const back = 105.09;
  const front = 106.18;

  mesh.box(
    west,
    slab - 0.22,
    back - 0.09,
    east - west,
    0.22,
    front - back + 0.18,
    '#94948e',
    'stone',
  );
  for (let i = 0; i < 14; i++) {
    const color = i % 3 === 0 ? '#9e6f46' : '#b7895a';
    mesh.box(
      west + 0.06 + i * 0.192,
      slab,
      back - 0.02,
      0.187,
      0.09,
      front - back + 0.04,
      color,
      'wood',
    );
  }
  for (const z of [back, front]) {
    mesh.box(west + 0.09, eaves - 0.07, z - 0.055, 2.62, 0.095, 0.11, timber, 'wood');
    for (let i = 0; i <= 8; i++) {
      if (z === front && i === 4) continue;
      const x = west + 0.1 + i * 0.317;
      mesh.box(x, floor, z - 0.047, 0.079, 1.46, 0.094, timber, 'wood');
    }
  }
  for (const x of [west + 0.12, east - 0.15]) {
    mesh.box(x - 0.04, eaves - 0.072, back, 0.09, 0.096, front - back, timber, 'wood');
    mesh.box(x - 0.039, floor, 105.62, 0.078, 1.46, 0.081, timber, 'wood');
  }
  for (let i = 0; i < 8; i++) {
    const x = west + 0.11 + i * 0.37;
    const peak: [number, number, number] = [x, ridge, (front + back) / 2];
    mesh.rod([x, eaves, back - 0.1], peak, 0.044, timber, 4, 'wood');
    mesh.rod(peak, [x, eaves, front + 0.1], 0.044, timber, 4, 'wood');
  }
  mesh.box(
    west + 0.07,
    ridge - 0.03,
    (front + back) / 2 - 0.028,
    2.67,
    0.09,
    0.056,
    timber,
    'wood',
  );
  for (let i = 0; i < 6; i++)
    mesh.box(west + 0.08, floor + i * 0.214, back - 0.081, 1.06, 0.208, 0.043, '#98663f', 'wood');
  mesh.box(west + 0.13, floor + 0.92, front - 0.105, 0.83, 0.062, 0.16, timber, 'wood');

  const benchBase = ground(work.x, work.z);
  pose(mesh, work.x - 0.5, benchBase, work.z, -Math.PI / 2, () => {
    for (const x of [-0.47, 0.39])
      for (const z of [-0.11, 0.11]) mesh.box(x, -0.08, z, 0.072, 0.86, 0.072, '#795438', 'wood');
    mesh.box(-0.55, 0.77, -0.18, 1.1, 0.073, 0.36, '#b78d61', 'wood');
    mesh.box(-0.39, 0.843, -0.055, 0.78, 0.05, 0.11, '#d4ab72', 'wood');
  });
  pose(mesh, east - 0.04, floor, (front + back) / 2, -Math.PI / 2, () => {
    mesh.box(-0.57, 1.21, -0.034, 1.14, 0.29, 0.07, '#634e36', 'wood');
    drawPlaque(mesh, signs, name, 0, 1.265, 0.04, 1.05, 0.15);
  });
  for (let i = 0; i < 4; i++)
    mesh.box(east - 0.55, slab + i * 0.058, 106.29, 0.5, 0.055, 0.36, '#bd935c', 'wood');

  const benchEdge = work.x - 0.32;
  return {
    id,
    kind: id,
    label: name,
    entry: { x: work.x - 0.5, y: work.z - 0.5 },
    start,
    count: mesh.data.length - start,
    description:
      'Help build a house and earn a coin every 20 seconds. After 30 minutes of work, take an hour off.',
    lo: [west, Math.min(slab - 0.24, benchBase - 0.09), north],
    hi: [benchEdge, ridge + 0.08, south],
    navigationPolygons: [
      [
        [west, north],
        [benchEdge, north],
        [benchEdge, south],
        [west, south],
      ],
    ],
  };
}
