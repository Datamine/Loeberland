import { pose, type Mesh } from './geometry.ts';

export const CEDAR_SAUNA = {
  id: 'bay-sauna',
  label: 'Cedar Sauna',
  color: '#a2744d',
  x: -15,
  z: -12.1,
  w: 2.7,
  d: 2.15,
  description: 'The cedar door is propped open. Warm air drifts out past a stack of firewood.',
};

export const SAUNA_GUEST = {
  id: 'bay-sauna-guest',
  kind: 'sauna-guest',
  name: 'Sauna Guest',
  x: -0.64,
  z: 0.68,
  description: 'A neighbor relaxing on the cedar bench.',
  line: 'Come in. I propped the door open to let in a little bay air.',
};

const halfWidth = CEDAR_SAUNA.w / 2;
const halfDepth = CEDAR_SAUNA.d / 2;
const wallDepth = 0.11;
const doorLeft = -0.93;
const doorRight = 0.62;
const doorWidth = doorRight - doorLeft;
const doorDepth = 0.065;
const floorTop = 0.11;
const doorTop = 2.08;
const wallTop = 2.22;
const bench = [-1.19, -0.73, -0.45, 0.89];
const stove = [0.43, -0.83, 1.01, -0.23];
const walls = [
  [-halfWidth, -halfDepth, halfWidth, -halfDepth + wallDepth],
  [-halfWidth, -halfDepth + wallDepth, -halfWidth + wallDepth, halfDepth - wallDepth],
  [halfWidth - wallDepth, -halfDepth + wallDepth, halfWidth, halfDepth - wallDepth],
  [-halfWidth, halfDepth - wallDepth, doorLeft, halfDepth],
  [doorRight, halfDepth - wallDepth, halfWidth, halfDepth],
];
export const SAUNA_OBSTACLES = [
  ...walls,
  bench,
  stove,
  [doorLeft - doorDepth, halfDepth, doorLeft, halfDepth + doorWidth],
];
export const SAUNA_FLOOR_TOP = floorTop;

export function drawCedarSauna(m: Mesh) {
  const { w, d, color } = CEDAR_SAUNA;
  const trim = '#c89963';
  const darkCedar = '#775239';
  const metal = { metal: 0.55 };
  m.box(-halfWidth - 0.05, 0.015, -halfDepth - 0.05, w + 0.1, 0.07, d + 0.19, '#8c8271', 'stone');
  m.box(-halfWidth, 0.085, -halfDepth, w, floorTop - 0.085, d + 0.11, trim, 'wood');
  for (const [left, back, right, front] of walls)
    m.box(left, floorTop, back, right - left, wallTop - floorTop, front - back, color, 'wood');
  m.box(
    doorLeft,
    doorTop,
    halfDepth - wallDepth,
    doorWidth,
    wallTop - doorTop,
    wallDepth,
    color,
    'wood',
  );
  for (const x of [doorLeft - 0.068, doorRight])
    m.box(x, floorTop, halfDepth - 0.015, 0.068, doorTop - floorTop, 0.05, trim, 'wood');
  m.box(doorLeft - 0.068, doorTop, halfDepth - 0.015, doorWidth + 0.136, 0.08, 0.05, trim, 'wood');

  // The door is hinged on the left and rests open along the porch.
  pose(m, doorLeft, floorTop + 0.02, halfDepth, Math.PI / 2, () => {
    const height = doorTop - floorTop - 0.04;
    const plank = doorWidth / 8;
    for (let i = 0; i < 8; i++)
      m.box(i * plank, 0, 0, plank - 0.009, height, doorDepth, i % 2 ? color : darkCedar, 'wood');
    for (const y of [0.27, height - 0.32]) {
      m.box(0.02, y, -0.024, doorWidth - 0.04, 0.09, 0.027, trim, 'wood');
      m.box(-0.02, y + 0.02, -0.038, 0.17, 0.053, 0.033, '#473d37', metal);
    }
    m.rod([doorWidth - 0.16, 0.83, -0.05], [doorWidth - 0.16, 1.03, -0.05], 0.026, trim, 8, 'wood');
  });

  const [benchLeft, benchBack, benchRight, benchFront] = bench;
  const seatTop = floorTop + 0.49;
  for (const z of [benchBack + 0.05, benchFront - 0.16])
    m.box(
      benchLeft + 0.04,
      floorTop,
      z,
      benchRight - benchLeft - 0.08,
      seatTop - floorTop,
      0.11,
      darkCedar,
      'wood',
    );
  for (let i = 0; i < 6; i++)
    m.box(
      benchLeft + i * 0.123,
      seatTop - 0.072,
      benchBack,
      0.111,
      0.072,
      benchFront - benchBack,
      trim,
      'wood',
    );
  for (const y of [seatTop + 0.13, seatTop + 0.29])
    m.box(benchLeft - 0.05, y, benchBack, 0.07, 0.1, benchFront - benchBack, trim, 'wood');

  const [stoveLeft, stoveBack, stoveRight, stoveFront] = stove;
  const pipeX = (stoveLeft + stoveRight) / 2;
  const pipeZ = (stoveBack + stoveFront) / 2;
  m.box(
    stoveLeft,
    floorTop,
    stoveBack,
    stoveRight - stoveLeft,
    0.6,
    stoveFront - stoveBack,
    '#48403a',
    metal,
  );
  for (const [x, z, size] of [
    [pipeX - 0.15, pipeZ - 0.13, 0.13],
    [pipeX + 0.09, pipeZ + 0.17, 0.16],
    [pipeX - 0.12, pipeZ + 0.12, 0.12],
  ])
    m.sphere(x, 0.73, z, size, 0.11, size * 0.85, '#655b55', 7, 4, 'stone');
  m.cylinder(pipeX, 0.71, pipeZ, 0.084, 2.5, '#514944', 10, 0.084, metal);
  m.cylinder(pipeX, 3.21, pipeZ, 0.138, 0.07, '#514944', 12, 0.12, metal);
  m.sphere(0.14, 1.72, -halfDepth + wallDepth + 0.05, 0.15, 0.079, 0.068, '#ffda9a', 10, 6, {
    emissive: 0.65,
  });

  const ridge = wallTop + 0.55;
  for (const x of [-halfWidth - 0.14, halfWidth + 0.14])
    m.quad(
      [x, wallTop, -halfDepth - 0.14],
      [x, wallTop, halfDepth + 0.07],
      [0, ridge, halfDepth + 0.07],
      [0, ridge, -halfDepth - 0.14],
      '#635550',
      'shingles',
    );
  for (const z of [-halfDepth, halfDepth])
    m.tri([-halfWidth, wallTop, z], [halfWidth, wallTop, z], [0, ridge, z], color, 'wood');
  for (let i = 0; i < 5; i++) {
    const x = 0.82 + (i % 3) * 0.135;
    const y = 0.12 + Math.floor(i / 3) * 0.11;
    m.rod([x, y, halfDepth + 0.025], [x, y, halfDepth + 0.28], 0.065, '#ac8057', 7, 'wood');
  }
}
