import { rand, rgb, type Mesh } from './geometry.ts';
import { FIREWORKS_SECONDS } from './config/fireworks.ts';
import type { Vec3, WorldPoint } from './types/geometry.ts';

const TURN = 2 * Math.PI;
const COLORS = ['#ffd27a', '#76f2d8', '#ef9cfc', '#fb8298'];
const SLATE = rgb('#4b4056');
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function drawFireworks(
  m: Mesh,
  { x, y, z }: WorldPoint & { y: number },
  seed: number,
  age: number,
  reducedMotion = false,
) {
  if (age < 0 || age >= FIREWORKS_SECONDS) return;
  const rotation = rand(seed, 1) * TURN;
  const bursts = reducedMotion ? 2 : COLORS.length;
  for (let i = 0; i < bursts; i++) {
    const elapsed = age - i * 0.135;
    if (elapsed < 0) continue;
    const climb = 0.33 + (i % 2) * 0.08;
    const a = rotation + (i * TURN) / bursts;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const radius = 1.23 + rand(seed, i + 6) * 0.35;
    const height = 2.8 + (i % 3) * 0.43;
    const palette = COLORS[(seed + i) % COLORS.length];
    const center: Vec3 = [x + dx * radius, y + height, z + dz * radius];

    if (elapsed < climb) {
      const point = (t: number): Vec3 => [
        x + dx * (0.37 + (radius - 0.37) * t),
        y + 0.17 + (height - 0.17) * (1 - (1 - t) ** 1.5),
        z + dz * (0.37 + (radius - 0.37) * t),
      ];
      const t = elapsed / climb;
      const head = point(t);
      if (t > 0.01) m.rod(point(Math.max(0, t - 0.29)), head, 0.024, palette, 5, { emissive: 0.7 });
      m.sphere(...head, 0.052, 0.061, 0.052, '#fff2bf', 7, 4, { emissive: 0.75 });
      continue;
    }

    const progress = (elapsed - climb) / (0.95 + (i % 2) * 0.11);
    if (progress >= 1) continue;
    const sparks = reducedMotion ? 9 : 21;
    const color = rgb(palette);
    const scale = reducedMotion ? 0.79 : 1;
    for (let spark = 0; spark < sparks; spark++) {
      const lat = 1 - (2 * (spark + 0.5)) / sparks;
      const width = Math.sqrt(1 - lat * lat);
      const azimuth = a + spark * GOLDEN_ANGLE;
      const reach = (0.73 + rand(seed + i * 19, spark) * 0.56) * scale;
      const sparkle = 0.66 + 0.34 * Math.sin(progress * 31 + spark * 2.1) ** 2;
      const glow = (1 - progress) * sparkle;
      const trailColor = color.map(
        (channel, index) => SLATE[index] + (channel - SLATE[index]) * glow,
      );
      const point = (t: number): Vec3 => {
        const r = (0.12 + 1.52 * (1 - (1 - t) ** 2.5)) * reach;
        return [
          center[0] + Math.cos(azimuth) * width * r,
          center[1] + lat * r - 0.75 * t * t,
          center[2] + Math.sin(azimuth) * width * r,
        ];
      };
      const head = point(progress);
      if (progress > 0.01)
        m.rod(point(Math.max(0, progress - 0.13)), head, 0.021 * glow, trailColor, 4, {
          emissive: glow * 0.85,
        });
      const size = 0.055 * (0.38 + glow * 0.62);
      m.sphere(...head, size, size, size, trailColor, 5, 3, { emissive: glow * 0.8 });
    }
    if (progress < 0.24) {
      const core = (1 - progress / 0.24) * 0.14 + 0.04;
      m.sphere(...center, core, core, core, '#fff1cd', 8, 5, { emissive: 0.7 });
    }
  }
}
