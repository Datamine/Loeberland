export const LEGACY_SOFTWARE = {
  id: 'legacy-software-company',
  label: 'Legacy Software Company',
  sign: 'LEGACY SOFTWARE COMPANY',
  x: 25,
  z: 165.61,
  w: 5.45,
  d: 2.68,
  base: 7.35,
  front: -1,
  rotation: 0,
  entry: { x: 24.5, y: 163.52 },
  inside: { x: 24.5, y: 164.46 },
  developer: { id: 'legacy-software-developer', x: 26.05, z: 163.99 },
};
export function inLegacySoftwareGrounds(x: number, z: number, margin = 0) {
  return (
    Math.abs(x - LEGACY_SOFTWARE.x) < LEGACY_SOFTWARE.w / 2 + margin &&
    Math.abs(z - LEGACY_SOFTWARE.z) < LEGACY_SOFTWARE.d / 2 + margin
  );
}
export const LEGACY_BUGS = [
  [2, -1.81, -0.66, 'caterpillar'],
  [5, 1.85, -0.58, 'beetle'],
  [9, -1.06, 0.18, 'spider'],
  [14, 1.08, 0.18, 'caterpillar'],
  [20, -1.91, 0.68, 'beetle'],
  [26, 1.95, 0.69, 'spider'],
] as const;
export function legacyBugSpawns() {
  return LEGACY_BUGS.map(([level, dx, dz]) => ({
    id: 'legacy-bug-' + level,
    combatKind: 'legacy-bug-' + level,
    x: LEGACY_SOFTWARE.x + dx,
    z: LEGACY_SOFTWARE.z + dz,
  }));
}
