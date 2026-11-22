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
