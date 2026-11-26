import { adventureSite, drawCampfire } from './adventure-sites.ts';
import { SLEEPING_HORSE_EXAMINE, WAYWARD_CAMP } from './config/wayward-camp.ts';
import { pose, type Mesh } from './geometry.ts';
import { drawBushFoliage } from './goblin-bush.ts';

function drawSpokedWheel(m: Mesh, x: number, z: number, radius: number) {
  const height = radius + 0.015;
  const at = (angle: number, r: number, offset: number) => [
    x + r * Math.cos(angle),
    height + r * Math.sin(angle),
    z + offset,
  ];
  const rim = radius - 0.075;
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI) / 9;
    const b = ((i + 1) * Math.PI) / 9;
    m.quad(
      at(a, radius, -0.052),
      at(a, radius, 0.052),
      at(b, radius, 0.052),
      at(b, radius, -0.052),
      '#494444',
      { metal: 0.6 },
    );
    for (const offset of [-0.053, 0.053])
      m.quad(
        at(a, radius, offset),
        at(b, radius, offset),
        at(b, rim, offset),
        at(a, rim, offset),
        '#825d3d',
        'wood',
      );
  }
  for (let i = 0; i < 9; i++)
    m.rod([x, height, z], at((i * 2 * Math.PI) / 9, rim + 0.025, 0), 0.035, '#926e47', 6, 'wood');
  m.rod([x, height, z - 0.11], [x, height, z + 0.11], 0.115, '#614f40', 12, 'wood');
}

function drawCoveredWagon(m: Mesh) {
  for (const [x, radius] of [
    [-0.96, 0.59],
    [0.9, 0.49],
  ]) {
    m.rod([x, radius + 0.015, -0.89], [x, radius + 0.015, 0.89], 0.075, '#473a32', 9, 'wood');
    for (const z of [-0.83, 0.83]) drawSpokedWheel(m, x, z, radius);
  }
  m.box(-1.49, 0.69, -0.65, 2.98, 0.12, 1.3, '#5f4437', 'wood');
  for (const z of [-0.65, 0.56]) {
    for (let i = 0; i < 3; i++)
      m.box(
        -1.49,
        0.81 + i * 0.138,
        z,
        2.98,
        0.129,
        0.09,
        ['#976342', '#9d6949', '#89573e'][i],
        'wood',
      );
    for (const x of [-1.35, 0, 1.33]) m.box(x, 0.76, z - 0.026, 0.1, 0.49, 0.13, '#684c39', 'wood');
  }
  m.box(-1.49, 0.81, -0.55, 0.09, 0.36, 1.1, '#8c5b3d', 'wood');
  m.box(1.07, 1.11, -0.57, 0.32, 0.11, 1.14, '#71513d', 'wood');
  m.box(1.33, 0.62, -0.61, 0.32, 0.075, 1.22, '#825d41', 'wood');
  m.rod([0.98, 0.47, 0], [2.25, 0.095, 0], 0.055, '#674934', 7, 'wood');
  m.rod([2.16, 0.12, -0.37], [2.16, 0.12, 0.37], 0.038, '#674934', 7, 'wood');
  m.box(-1.18, 0.81, -0.44, 0.48, 0.33, 0.61, '#766144', 'wood');
  m.sphere(-0.42, 1.02, 0.22, 0.34, 0.21, 0.25, '#8b8a63', 12, 7, 'canvasWeave');

  const hoops = [-1.53, -0.79, 0, 0.78, 1.46];
  const canvas = (x: number, panel: number, lift = 0) => {
    const t = (panel * Math.PI) / 14;
    return [x, 1.22 + Math.sin(t) * (1.02 + lift), Math.cos(t) * (0.7 + lift)];
  };
  for (let i = 1; i < hoops.length; i++)
    for (let panel = 0; panel < 14; panel++) {
      const a = canvas(hoops[i - 1], panel);
      const b = canvas(hoops[i], panel);
      const c = canvas(hoops[i], panel + 1);
      const d = canvas(hoops[i - 1], panel + 1);
      const cloth = i % 2 ? '#e2d4b8' : '#d7c7a9';
      m.quad(a, b, c, d, cloth, 'canvasWeave');
    }
  for (const station of hoops)
    for (let panel = 0; panel < 14; panel++)
      m.rod(
        canvas(station, panel, 0.007),
        canvas(station, panel + 1, 0.007),
        0.024,
        '#b7a789',
        6,
        'canvasWeave',
      );
  for (const z of [-0.7, 0.7]) {
    m.rod([-1.53, 1.22, z], [1.46, 1.22, z], 0.027, '#baa786', 7, 'canvasWeave');
    for (const x of [-1.34, -0.56, 0.34, 1.12])
      m.rod([x, 1.12, z * 0.93], [x + 0.035, 1.27, z], 0.011, '#cbb08c', 5, 'canvasWeave');
  }
}

function drawSleepingHorse(m: Mesh) {
  const coat = '#986240';
  const warm = '#a96e48';
  const dark = '#493429';
  m.sphere(-0.27, 0.53, 0, 0.87, 0.52, 0.46, coat, 18, 11);
  m.sphere(-0.81, 0.47, 0, 0.45, 0.45, 0.43, '#885439', 16, 10);
  m.sphere(0.38, 0.55, 0, 0.41, 0.46, 0.39, warm, 16, 9);
  m.rod([0.34, 0.66, 0], [1.01, 0.28, 0.025], 0.25, coat, 12);
  m.sphere(0.72, 0.46, 0, 0.37, 0.272, 0.25, warm, 15, 9);
  m.sphere(1.04, 0.28, 0.018, 0.32, 0.24, 0.219, coat, 16, 10);
  m.sphere(1.31, 0.13, 0.035, 0.235, 0.124, 0.165, '#6f5146', 14, 8);
  for (const z of [-0.12, 0.12]) {
    m.tri([0.86, 0.45, z - 0.051], [0.81, 0.7, z], [1, 0.46, z + 0.038], coat);
    m.tri([1, 0.46, z + 0.038], [0.81, 0.7, z], [0.86, 0.45, z - 0.051], warm);
    m.rod([0.88, 0.33, z * 1.76], [1.03, 0.305, z * 1.96], 0.014, '#362c28', 7);
    m.sphere(1.455, 0.155, 0.035 + z * 0.74, 0.028, 0.022, 0.019, dark, 8, 5);
  }
  m.tri([0.99, 0.505, -0.06], [0.995, 0.508, 0.075], [1.335, 0.252, 0.036], '#e9d6b9');
  for (let i = 0; i < 6; i++)
    m.sphere(0.33 + i * 0.101, 0.932 - i * 0.066, -0.027, 0.18, 0.109, 0.13, dark, 10, 6);
  for (const z of [-0.3, 0.36]) {
    m.rod([0.42, 0.4, z], [0.71, 0.14, z + 0.065], 0.145, warm, 10);
    m.rod([0.71, 0.14, z + 0.065], [0.29, 0.106, z + 0.13], 0.089, coat, 9);
    m.sphere(0.256, 0.09, z + 0.13, 0.126, 0.075, 0.095, dark, 10, 6);
    m.rod([-0.72, 0.39, z], [-0.41, 0.15, z + 0.085], 0.16, coat, 10);
    m.rod([-0.41, 0.15, z + 0.085], [-0.81, 0.093, z + 0.14], 0.092, warm, 9);
    m.sphere(-0.87, 0.082, z + 0.144, 0.127, 0.074, 0.093, dark, 10, 6);
  }
  m.rod([-1.04, 0.56, -0.01], [-1.25, 0.13, 0.14], 0.115, dark, 9);
  m.rod([-1.25, 0.13, 0.14], [-1.52, 0.051, 0.39], 0.071, dark, 8);
}

export function drawWaywardCamp(m: Mesh, ground: (x: number, z: number) => number) {
  const { fire, horse, wagon } = WAYWARD_CAMP;
  const center = [fire.x - 0.45, ground(fire.x - 0.45, fire.z) + 0.013, fire.z];
  const dirtEdge = (i: number) => {
    const angle = (i * Math.PI) / 12;
    const scallop = 1 + 0.065 * Math.sin(i * 2.4);
    const x = center[0] + Math.cos(angle) * 3.65 * scallop;
    const z = center[2] + Math.sin(angle) * 2.3 * scallop;
    return [x, ground(x, z) + 0.012, z];
  };
  for (let i = 0; i < 24; i++) m.tri(center, dirtEdge(i + 1), dirtEdge(i), '#a19572', 'dirt');
  for (const [x, z, size] of [
    [125.8, -21.45, 0.64], [126.2, -22.2, 0.42], [127.1, -23, 0.56],
    [128.55, -23.78, 0.81], [129.25, -23.36, 0.44], [130.4, -24.1, 0.69],
    [134.7, -23.9, 0.65], [135.3, -23.65, 0.43], [136.1, -22.78, 0.77],
    [137.05, -21.9, 0.41], [136.75, -19.7, 0.54], [135.4, -17.9, 0.43],
  ]) {
    const base = ground(x, z);
    drawBushFoliage(m, x, base + size * 0.47, z, size, size * 0.71, size * 0.81);
  }
  return [
    {
      prop: wagon,
      label: 'Covered Wagon',
      description: 'The patched canvas is still holding. The travel plans are another matter.',
      draw: drawCoveredWagon,
    },
    {
      prop: fire,
      label: 'Campfire',
      description: 'A fire burns low between a ring of stones.',
      draw: (mesh: Mesh) => drawCampfire(mesh, 0, 0, 0),
    },
    {
      prop: horse,
      label: 'Sleeping Horse',
      description: SLEEPING_HORSE_EXAMINE,
      draw: drawSleepingHorse,
    },
  ].map(({ prop, label, description, draw }) => {
    const { id, x, z, w, d } = prop;
    const base = ground(x, z) + 0.015;
    const start = m.data.length;
    pose(m, x, base, z, 0, draw);
    return adventureSite(m, start, {
      id,
      kind: id,
      label,
      description,
      base,
      entry: { x: x - 0.5, y: z + d / 2 + 0.65 - 0.5 },
      navigationPolygons: [
        [
          [x - w / 2, z - d / 2],
          [x + w / 2, z - d / 2],
          [x + w / 2, z + d / 2],
          [x - w / 2, z + d / 2],
        ],
      ],
    });
  });
}
