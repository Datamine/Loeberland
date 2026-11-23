import type { Mesh } from './geometry.ts';

/** The deciduous street tree used on San Francisco and Berkeley blocks. */
export function drawNeighborhoodTree(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  seed: number,
  size = 1,
  flat = false,
) {
  const bark = '#806044';
  m.cylinder(x, y, z, 0.075 * size, 1.45 * size, bark, 7, 0.05 * size);
  for (const [dx, dz, dy] of [
    [-0.35, 0.12, 1.45],
    [0.34, -0.12, 1.7],
    [0.05, 0.3, 1.9],
    [-0.08, -0.24, 2.08],
  ]) {
    const tx = x + dx * size,
      ty = y + dy * size,
      tz = z + dz * size;
    m.rod([x, y + size, z], [tx, ty, tz], 0.035 * size, bark, 5);
    m.sphere(
      tx,
      ty + 0.2 * size,
      tz,
      (0.5 + seed * 0.12) * size,
      (flat ? 0.25 : 0.43) * size,
      0.48 * size,
      seed > 0.5 ? '#739053' : '#69894e',
      8,
      4,
    );
  }
}
