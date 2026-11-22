import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

import { FIGHTER_YARD } from './fighter-yard-layout.ts';

export function drawFighterYard(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, east, gateZ, entry } = FIGHTER_YARD;
  const start = m.data.length;
  const postOffsets = [-0.63, 0.63],
    postHalf = 0.065,
    gateHalf = 0.78;
  const groundAtGate = ground(east, gateZ);
  pose(m, east, groundAtGate, gateZ, -Math.PI / 2, () => {
    for (const x of postOffsets)
      m.box(x - postHalf, -0.1, -postHalf, postHalf * 2, 1.68, postHalf * 2, '#554832', 'wood');
    m.box(-gateHalf, 1.29, -0.08, gateHalf * 2, 0.3, 0.16, '#634e36', 'wood');
    drawPlaque(m, signs, name, 0, 1.35, 0.092, 1.4, 0.17);
  });
  return {
    id,
    kind: id,
    label: name,
    entry,
    start,
    count: m.data.length - start,
    description: 'An open lawn for paid bouts. Tyler collects admission at the gate.',
    lo: [east - 0.08, groundAtGate - 0.1, gateZ - gateHalf],
    hi: [east + 0.1, groundAtGate + 1.6, gateZ + gateHalf],
    navigationPolygons: postOffsets.map((offset) => {
      const z = gateZ - offset;
      return [
        [east - postHalf, z - postHalf],
        [east + postHalf, z - postHalf],
        [east + postHalf, z + postHalf],
        [east - postHalf, z + postHalf],
      ];
    }),
  };
}
