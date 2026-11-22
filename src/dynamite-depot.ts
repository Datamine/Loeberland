import { DYNAMITE_DEPOT } from './config/dynamite-depot.ts';
import type { Mesh } from './geometry.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export function drawDynamiteDepot(
  mesh: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, x, z } = DYNAMITE_DEPOT;
  const y = ground(x, z);
  const start = mesh.data.length;
  mesh.box(x - 0.72, y, z - 0.52, 1.44, 0.08, 1.04, '#6b5141', 'wood');
  for (let layer = 0; layer < 3; layer++) {
    const count = 6 - layer;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 0.145;
      const level = y + 0.145 + layer * 0.114;
      const a = [x + offset, level, z - 0.44 + (i % 3) * 0.045];
      const b = [x + offset - 0.11 + layer * 0.09, level + 0.018, z + 0.43 - (i % 2) * 0.09];
      mesh.rod(a, b, 0.068, i % 2 ? '#a83532' : '#ce493a', 8);
      for (const t of [0.28, 0.72]) {
        const band = (u: number) => a.map((v, j) => v + (b[j] - v) * u);
        mesh.rod(band(t), band(t + 0.11), 0.071, '#dbb991', 8);
      }
      mesh.rod(b, [b[0] + 0.034, b[1] + 0.095, b[2] + 0.13], 0.012, '#353035', 5);
    }
  }
  const signZ = z - 0.68;
  for (const side of [-1, 1])
    mesh.box(x + side * 0.57 - 0.033, y, signZ, 0.066, 0.94, 0.07, '#543e2e', 'wood');
  mesh.box(x - 0.76, y + 0.65, signZ - 0.03, 1.52, 0.32, 0.085, '#86552c', 'wood');
  const texture = signs.get(name);
  if (texture) {
    const front = signZ + 0.056;
    mesh.quad(
      [x - 0.72, y + 0.68, front],
      [x + 0.72, y + 0.68, front],
      [x + 0.72, y + 0.94, front],
      [x - 0.72, y + 0.94, front],
      '#fff',
      texture,
    );
  }
  return {
    id,
    kind: 'dynamite-depot',
    label: name,
    description: 'A heap of dynamite sticks. The sign says South Mission Dynamite Depot.',
    entry: { x: x - 0.5, y: z - 0.5 },
    start,
    count: mesh.data.length - start,
    lo: [x - 0.8, y, z - 0.74],
    hi: [x + 0.8, y + 1, z + 0.59],
  };
}
