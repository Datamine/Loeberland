/** North-facing shop just off the main Peninsula cross street. */
export const HABERDASHER = Object.freeze({
  x: 64,
  z: 128.9,
  w: 3,
  d: 1.8,
  base: 1.6,
  rotation: Math.PI,
  entry: Object.freeze({ x: 63.5, y: 127.1 }),
});
export function inHaberdasherGrounds(x: number, z: number, margin = 0) {
  const h = HABERDASHER;
  return Math.abs(x - h.x) < h.w / 2 + 0.15 + margin && Math.abs(z - h.z) < h.d / 2 + 0.2 + margin;
}
