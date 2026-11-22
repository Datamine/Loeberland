import type { Mesh } from './geometry.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';
import { drawPlaque } from './southern-district.ts';
import { WAYMO_RENTAL } from './waymo-rental.ts';

export const WAYMO_DISPATCH_NAME = 'Waymo Dispatch';

export function drawWaymoDispatch(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { x, z } = WAYMO_RENTAL.dispatch;
  const centerX = x - 1.2,
    centerZ = z + 2.65;
  const base = ground(centerX, centerZ);
  const start = m.data.length;
  m.box(centerX - 1.25, base - 0.15, centerZ - 0.8, 2.5, 0.16, 1.6, '#5c6363', 'asphalt');
  m.box(centerX - 1.12, base, centerZ + 0.59, 2.24, 1.18, 0.14, '#b8c2bb', 'steel');
  for (const side of [-1, 1]) {
    m.box(centerX + side * 1.04 - 0.04, base, centerZ - 0.7, 0.08, 1.2, 0.08, '#647978', 'steel');
    m.box(
      centerX + side * 0.46 - 0.025,
      base + 0.013,
      centerZ - 0.71,
      0.05,
      0.013,
      1.14,
      '#dfd496',
    );
  }
  m.box(centerX - 1.23, base + 1.16, centerZ - 0.83, 2.46, 0.16, 1.64, '#618b88', 'roof');
  drawPlaque(
    m,
    signs,
    WAYMO_DISPATCH_NAME,
    centerX,
    base + 1.02,
    centerZ - 0.845,
    2.17,
    0.26,
    false,
  );
  return {
    id: 'waymo-dispatch',
    kind: 'waymo-dispatch',
    label: WAYMO_DISPATCH_NAME,
    description:
      'A dispatch bay for Waymos. Call a Waymo from your travel controls to request pickup.',
    entry: { x: x - 0.5, y: z - 0.5 },
    start,
    count: m.data.length - start,
    lo: [centerX - 1.25, base - 0.15, centerZ - 0.85],
    hi: [centerX + 1.25, base + 1.33, centerZ + 0.82],
  };
}
