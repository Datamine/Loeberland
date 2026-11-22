import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export const GOBLIN_INDUSTRIALIST = Object.freeze({
  id: 'goblin-industrialist',
  hutId: 'goblin-phone-hut',
  name: 'Goblin Phone Campus',
  x: 37.8,
  z: -31.2,
  width: 4.2,
  depth: 4.2,
  vendor: { x: 37.8, z: -28.65 },
  entry: { x: 37.3, y: -28.2 },
});
export const GOBLIN_PHONE_BUYER = 'market-farmer-0';
export const GOBLIN_PHONE_RESALE = 35;
export const ROBE_SELLER = 'decorative-robe-seller';
export const ROBE_ITEMS = ['decorative-robe-top', 'decorative-robe-bottom'] as const;
export const CLOTHIER_ITEMS = [...ROBE_ITEMS, 'cashmere-turtleneck'] as const;

export function drawGoblinPhoneHut(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { x, z, name, hutId, entry } = GOBLIN_INDUSTRIALIST;
  const y = ground(x, z + 1.8),
    start = m.data.length;
  pose(m, x, y, z, 0, () => {
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        b = ((i + 1) * Math.PI) / 16;
      const pt = (angle: number, radius: number, h: number) => [
        Math.cos(angle) * radius,
        h,
        Math.sin(angle) * radius,
      ];
      const open = i >= 6 && i <= 9;
      if (!open) {
        m.quad(
          pt(a, 1.95, -0.45),
          pt(b, 1.95, -0.45),
          pt(b, 1.33, 1.45),
          pt(a, 1.33, 1.45),
          '#95684c',
          'dirt',
        );
        m.quad(
          pt(b, 1.25, -0.45),
          pt(a, 1.25, -0.45),
          pt(a, 1.11, 1.37),
          pt(b, 1.11, 1.37),
          '#b88961',
          'dirt',
        );
      }
      m.quad(
        pt(b, 2.05, 1.08),
        pt(a, 2.05, 1.08),
        pt(a, 1.36, 1.62),
        pt(b, 1.36, 1.62),
        '#aa8256',
        'roof',
      );
    }
    for (const side of [-1, 1])
      m.rod([side * 0.63, -0.05, 1.72], [side * 0.63, 1.34, 1.72], 0.075, '#61462f', 8);
    m.box(-0.97, 1.18, 1.78, 1.94, 0.3, 0.065, '#62482f', 'wood');
    drawPlaque(m, signs, name, 0, 1.24, 1.855, 1.86, 0.15);
    m.box(0.52, 0.09, 0.85, 0.68, 0.59, 0.49, '#a37146', 'wood');
    for (let i = 0; i < 3; i++)
      m.box(0.58 + i * 0.19, 0.69, 1, 0.13, 0.09, 0.26, '#b97451', 'brick');
  });
  return {
    id: hutId,
    label: name,
    kind: hutId,
    entry,
    start,
    count: m.data.length - start,
    description:
      'A circular mud hut modeled after Tim Apple’s campus. Its showroom has three bricks.',
    lo: [x - 2.1, y - 0.45, z - 2.1],
    hi: [x + 2.1, y + 1.65, z + 2.1],
  };
}
