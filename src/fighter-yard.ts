import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

import { FIGHTER_YARD } from './fighter-yard-layout.ts';

export function drawFighterYard(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, west, east, north, south, gateZ, entry } = FIGHTER_YARD;
  const start = m.data.length;
  const navigationPolygons: number[][][] = [];
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    const dx = ((bz - az) * 0.09) / length;
    const dz = ((ax - bx) * 0.09) / length;
    navigationPolygons.push([
      [ax - dx, az - dz],
      [bx - dx, bz - dz],
      [bx + dx, bz + dz],
      [ax + dx, az + dz],
    ]);
    for (const h of [0.29, 0.59])
      m.rod(
        [ax, ground(ax, az) + h, az],
        [bx, ground(bx, bz) + h, bz],
        0.041,
        '#756548',
        7,
        'wood',
      );
    const count = Math.ceil(length / 1.25);
    for (let i = 0; i <= count; i++) {
      const x = ax + ((bx - ax) * i) / count,
        z = az + ((bz - az) * i) / count;
      m.box(x - 0.055, ground(x, z) - 0.08, z - 0.055, 0.11, 0.81, 0.11, '#554832', 'wood');
    }
  };
  fence(west, north, east, north);
  fence(west, south, east, south);
  fence(west, north, west, south);
  fence(east, north, east, gateZ - 0.63);
  fence(east, gateZ + 0.63, east, south);
  const groundAtGate = ground(east, gateZ);
  pose(m, east, groundAtGate, gateZ, -Math.PI / 2, () => {
    for (const x of [-0.63, 0.63])
      m.box(x - 0.065, -0.1, -0.065, 0.13, 1.68, 0.13, '#554832', 'wood');
    m.box(-0.78, 1.29, -0.08, 1.56, 0.3, 0.16, '#634e36', 'wood');
    drawPlaque(m, signs, name, 0, 1.35, 0.092, 1.4, 0.17);
  });
  const corners = [
    ground(west, north),
    ground(east, north),
    ground(west, south),
    ground(east, south),
  ];
  return {
    id,
    kind: id,
    label: name,
    entry,
    start,
    count: m.data.length - start,
    description: 'A fenced lawn for paid bouts. Tyler collects admission at the gate.',
    lo: [west - 0.15, Math.min(...corners) - 0.15, north - 0.15],
    hi: [east + 0.16, Math.max(...corners, groundAtGate + 1.6), south + 0.15],
    navigationPolygons,
  };
}
