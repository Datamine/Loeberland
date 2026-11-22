// World coordinates along the diagonal street grid in South Beach.
const BALLPARK_WEST_TIP = { x: 81.5, z: 55.25 };
const BALLPARK_SIZE = 3;

export const SOUTH_BEACH_BALLPARK = {
  x: BALLPARK_WEST_TIP.x + BALLPARK_SIZE * Math.SQRT1_2,
  z: BALLPARK_WEST_TIP.z,
  size: BALLPARK_SIZE,
  angle: -Math.PI / 4,
  approach: { x: 84.8, z: 56.75 },
};

export const SOUTH_BEACH_WATERFRONT = [
  [83.5, 53.25],
  [86, 53.25],
  [88, 54.5],
  [88, 57.75],
  [86, 59],
  [83.25, 57.5],
];

export const SOUTH_BEACH_LAWN = [
  [75.1, 50.5],
  [80.9, 44.7],
  [84.6, 48.4],
  [85, 52.1],
  [80.05, 54.15],
  [78, 53.85],
];

export const SOUTH_BEACH_BENCHES = [
  { id: 'south-beach-bench-west', x: 77.55, z: 49.25, angle: -Math.PI / 2 },
  { id: 'south-beach-bench-north', x: 79.9, z: 47.1, angle: -Math.PI / 8 },
  { id: 'south-beach-bench-bay', x: 81.45, z: 48.25, angle: -Math.PI * 0.68 },
  { id: 'south-beach-bench-south', x: 79.65, z: 52, angle: Math.PI * 0.85 },
];

export const SOUTH_BEACH_SHINGLE = [
  [81.5, 45.3],
  [83.8, 45.1],
  [86.2, 52.3],
  [83.55, 52.6],
  [82.6, 51.45],
  [81.85, 50.7],
  [82.15, 48.6],
  [81.95, 47.45],
];

export const SOUTH_BEACH_PIER = { west: 82, east: 86.25, north: 49, south: 50.5, deck: 0.47 };

export function onSouthBeachPier(x: number, z: number) {
  const { west, east, north, south } = SOUTH_BEACH_PIER;
  return x >= west && x < east && z >= north && z < south;
}
