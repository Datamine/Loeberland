import { createRegionalNavigation } from './regional-navigation.ts';

export const CHURCH_BASEMENT_ID = 'unusual-church-basement';
export const CHURCH_STAIRS_DOWN = 'unusual-church-stairs-down';
export const CHURCH_STAIRS_UP = 'unusual-church-stairs-up';
export const BASEMENT_CHURCHGOER = 'basement-churchgoer';

// The church and its cellar share the public world. Separate horizontal
// coordinates let each floor use the normal movement and combat systems.
export const CHURCH_BASEMENT = {
  west: -520,
  east: -506.5,
  north: -520,
  south: -509.5,
  floor: -4.5,
} as const;

export const CHURCH_STAIRWELL = {
  west: -2.59,
  east: -0.43,
  north: -2.49,
  south: -1.57,
  landing: [0.04, -2.04],
} as const;

export const BASEMENT_FURNITURE = {
  gym: [0.62, 0.64, 3.65, 4.58],
  table: [4.71, 3.48, 9.23, 6.02],
  supplies: [10.64, 0.6, 12.87, 2.93],
  stairs: [0.37, 7.44, 2.63, 8.86],
} as const;

export function churchBasementPoint(x: number, z: number) {
  return { x: CHURCH_BASEMENT.west + x, z: CHURCH_BASEMENT.north + z };
}

export const BASEMENT_LANDING = churchBasementPoint(3.27, 8.13);
export const BASEMENT_CHURCHGOERS = [
  [5.45, 2.3],
  [11.62, 4.53],
  [8.45, 8.12],
].map(([x, z], i) => ({
  id: `${BASEMENT_CHURCHGOER}-${i + 1}`,
  combatKind: BASEMENT_CHURCHGOER,
  ...churchBasementPoint(x, z),
}));

export function inChurchBasement(x: number, z: number) {
  const { west, east, north, south } = CHURCH_BASEMENT;
  return x >= west && x < east && z >= north && z < south;
}

export const CHURCH_BASEMENT_NAV = createRegionalNavigation({
  ...CHURCH_BASEMENT,
  walkable: (x, z) => {
    const { west, east, north, south } = CHURCH_BASEMENT;
    return x > west + 0.38 && x < east - 0.38 && z > north + 0.38 && z < south - 0.38;
  },
});

export function basementFootprint(rect: readonly number[]) {
  const [left, back, right, front] = rect;
  return [
    [left, back],
    [right, back],
    [right, front],
    [left, front],
  ].map(([x, z]) => [CHURCH_BASEMENT.west + x, CHURCH_BASEMENT.north + z]);
}

CHURCH_BASEMENT_NAV.setObstacles(Object.values(BASEMENT_FURNITURE).map(basementFootprint));
