/** South-facing shop just off the main Peninsula cross street. */
export const HABERDASHER = Object.freeze({
  x: 68,
  z: 124.5,
  w: 3,
  d: 1.8,
  base: 1.6,
  rotation: 0,
  entry: Object.freeze({ x: 67.5, y: 126.3 }),
});
export function inHaberdasherGrounds(x: number, z: number, margin = 0) {
  const h = HABERDASHER;
  return Math.abs(x - h.x) < h.w / 2 + 0.15 + margin && Math.abs(z - h.z) < h.d / 2 + 0.2 + margin;
}
