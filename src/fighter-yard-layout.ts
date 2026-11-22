export const FIGHTER_YARD = Object.freeze({
  id: 'fighter-yard',
  name: 'Fighter Yard',
  west: 67.95,
  east: 72.2,
  north: 110.08,
  south: 112.93,
  gateZ: 111.52,
  tyler: { id: 'fighter-yard-tyler', x: 72.72, z: 111.02 },
  entry: { x: 72.93, y: 111.02 },
  inside: { x: 71.25, y: 111.02 },
  pass: 'fighter-yard-pass',
  price: 10,
});
export const FIGHTER_LEVELS = [3, 5, 8, 12, 16, 20] as const;
const fighterSpots = [
  [71.36, 110.64],
  [71.14, 112.37],
  [70.17, 110.62],
  [69.84, 112.33],
  [68.68, 110.7],
  [68.62, 112.35],
];
export const FIGHTER_SPAWNS = Object.freeze(
  FIGHTER_LEVELS.map((level, i) => ({
    id: 'fighter-yard-' + level,
    combatKind: 'fighter-' + level,
    x: fighterSpots[i][0],
    z: fighterSpots[i][1],
  })),
);
export function inFighterYard(x: number, z: number) {
  const { west, east, north, south } = FIGHTER_YARD;
  return x > west && x < east && z > north && z < south;
}
export function isYardFighter(kind?: string) {
  return FIGHTER_SPAWNS.some((spawn) => spawn.combatKind === kind);
}
