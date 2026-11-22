import { rand, type Mesh } from './geometry.ts';

/** Continuous shoreline in map coordinates, from North Lake around South Lake. */
export const LAKE_MERCED_SHORE = [
  [15.6, 53.55],
  [16.25, 53.45],
  [16.85, 53.8],
  [17.34, 54.55],
  [17.52, 55.45],
  [17.36, 56.19],
  [17.62, 56.76],
  [18.25, 56.4],
  [18.88, 56.34],
  [19.45, 56.79],
  [19.88, 57.45],
  [20.07, 58.24],
  [19.84, 59.08],
  [19.34, 59.89],
  [18.7, 60.27],
  [17.94, 60.18],
  [17.41, 59.64],
  [17.08, 58.91],
  [16.94, 58.32],
  [16.44, 58.16],
  [15.78, 58.18],
  [15.17, 57.73],
  [14.67, 56.93],
  [14.42, 56.08],
  [14.52, 55.23],
  [14.8, 54.4],
  [15.18, 53.89],
];

export function distanceToLakeMerced(outline: number[][], x: number, z: number) {
  let inside = false,
    distance = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[j],
      [bx, bz] = outline[i];
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz));
    if (az > z !== bz > z && x < ax + (dx * (z - az)) / dz) inside = !inside;
  }
  return inside ? -distance : distance;
}

export function drawLakeMercedReeds(
  mesh: Mesh,
  outline: number[][],
  ground: (x: number, z: number) => number,
  grassyBank: (x: number, z: number) => boolean,
) {
  // Skip stretches of shoreline to leave open views between clumps.
  for (const edge of [0, 2, 4, 6, 8, 10, 12, 14, 16, 19, 21, 24]) {
    const [ax, az] = outline[edge];
    const [bx, bz] = outline[edge + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / length,
      tz = (bz - az) / length;
    const count = 5 + Math.floor(rand(edge, 11) * 5);
    for (let i = 0; i < count; i++) {
      const along = length * 0.5 + (rand(edge, i, 1) - 0.5) * 0.52;
      const offset = 0.18 + rand(edge, i, 2) * 0.24;
      const x = ax + tx * along + tz * offset,
        z = az + tz * along - tx * offset;
      if (distanceToLakeMerced(outline, x, z) < 0.1 || !grassyBank(x, z)) continue;

      const y = ground(x, z);
      const height = 0.39 + rand(edge, i, 3) * 0.37;
      const lean = (rand(edge, i, 4) - 0.5) * 0.19;
      const top = [x + tx * lean, y + height, z + tz * lean];
      mesh.rod([x, y - 0.015, z], top, 0.015, i % 2 ? '#687d42' : '#829451', 5);
      if (i % 3 !== 0) {
        mesh.rod(
          top,
          [top[0] + tx * lean * 0.2, top[1] + 0.12, top[2] + tz * lean * 0.2],
          0.028,
          '#674d36',
          6,
        );
      }
      const side = i % 2 ? -1 : 1;
      const leaf = [x + tx * lean * 0.4, y + height * 0.4, z + tz * lean * 0.4];
      const mid = [leaf[0] + tx * side * 0.13, leaf[1] + 0.17, leaf[2] + tz * side * 0.13];
      const tip = [leaf[0] + tx * side * 0.23, leaf[1] + 0.24, leaf[2] + tz * side * 0.23];
      mesh.quad(leaf, [mid[0], mid[1] - 0.045, mid[2]], tip, mid, '#8c9f59');
    }
  }
}
