import { rand, type Mesh } from './geometry.ts';

type Ground = (x: number, z: number) => number;

export function drawShrub(
  m: Mesh,
  ground: Ground,
  x: number,
  z: number,
  size: number,
  seed: number,
) {
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4 + seed,
      spread = size * (i ? 0.66 : 0.12),
      xx = x + Math.cos(angle) * spread,
      zz = z + Math.sin(angle) * spread,
      radius = size * (0.38 + 0.35 * rand(seed, i, 5));
    m.sphere(
      xx,
      ground(xx, zz) + radius * (i ? 0.73 : 1.1),
      zz,
      radius,
      radius * 0.85,
      radius,
      ['#567347', '#6d8a4e', '#829952'][i % 3],
      9,
      6,
    );
  }
}

export function drawGardenFlowers(
  m: Mesh,
  ground: Ground,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  colors: readonly string[],
  count = 24,
) {
  for (let i = 0; i < count; i++) {
    const angle = i * 2.4,
      r = Math.sqrt(i / count),
      x = cx + Math.cos(angle) * r * rx,
      z = cz + Math.sin(angle) * r * rz,
      h = ground(x, z),
      stem = 0.115 + rand(i, cx, 3) * 0.16;
    m.rod([x, h, z], [x + 0.018, h + stem, z], 0.012, '#648449', 5);
    m.sphere(x + 0.018, h + stem, z, 0.062, 0.042, 0.057, colors[i % colors.length], 7, 5);
  }
}
