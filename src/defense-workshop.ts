import type { Mesh } from './geometry.ts';
import type { BuildingDefinition } from './types/buildings.ts';

const metal = { metal: 0.62 };
const steel = '#9ba9a8';
const dark = '#323c3e';
const paint = '#416864';
const safety = '#d5a042';

function lathe(m: Mesh, x: number, y: number, z: number) {
  m.box(x, y, z, 1.35, 0.09, 0.58, dark, metal);
  for (const offset of [0.04, 1.01]) {
    m.box(x + offset, y + 0.09, z + 0.035, 0.3, 0.65, 0.45, paint, metal);
    m.box(x + offset + 0.06, y + 0.53, z + 0.487, 0.18, 0.025, 0.016, steel, metal);
  }
  m.box(x, y + 0.73, z + 0.05, 1.35, 0.085, 0.47, paint, metal);
  for (const rail of [0.12, 0.42])
    m.box(x + 0.22, y + 0.815, z + rail, 1.05, 0.035, 0.037, steel, metal);
  m.box(x + 0.024, y + 0.81, z + 0.095, 0.33, 0.35, 0.37, paint, metal);
  m.box(x + 0.36, y + 0.91, z + 0.12, 0.015, 0.19, 0.31, safety);
  m.box(x + 1.06, y + 0.825, z + 0.13, 0.24, 0.25, 0.29, paint, metal);
  for (const [from, to, radius, color] of [
    [0.365, 0.433, 0.114, '#5c676a'],
    [0.433, 0.735, 0.048, steel],
    [0.73, 1.06, 0.027, steel],
  ] as const)
    m.rod([x + from, y + 1.015, z + 0.28], [x + to, y + 1.015, z + 0.28], radius, color, 12, metal);
  for (const a of [0, 2.094, 4.189]) {
    const yy = y + 1.015 + Math.cos(a) * 0.081;
    const zz = z + 0.28 + Math.sin(a) * 0.081;
    m.box(x + 0.43, yy - 0.023, zz - 0.024, 0.045, 0.046, 0.048, steel, metal);
  }
  m.box(x + 0.63, y + 0.85, z + 0.15, 0.25, 0.095, 0.35, dark, metal);
  m.box(x + 0.66, y + 0.944, z + 0.32, 0.12, 0.09, 0.13, steel, metal);
  m.rod([x + 0.72, y + 0.989, z + 0.35], [x + 0.69, y + 1.009, z + 0.29], 0.011, dark, 6);
  m.rod([x + 0.755, y + 0.894, z + 0.5], [x + 0.755, y + 0.894, z + 0.56], 0.081, dark, 12, metal);
  m.box(x + 0.795, y + 0.91, z + 0.555, 0.025, 0.024, 0.038, steel, metal);
  m.box(x + 0.075, y + 0.98, z + 0.466, 0.16, 0.1, 0.02, dark);
  for (const [dx, color] of [
    [0.115, '#a3d2aa'],
    [0.195, '#c4453d'],
  ] as const)
    m.sphere(x + dx, y + 1.025, z + 0.49, 0.023, 0.021, 0.015, color, 8, 4);
}

function weldingBench(m: Mesh, x: number, y: number, z: number) {
  for (const dx of [0.045, 1.04])
    for (const dz of [0.05, 0.54]) m.box(x + dx, y, z + dz, 0.056, 0.78, 0.056, dark, metal);
  m.box(x, y + 0.74, z, 1.15, 0.062, 0.65, steel, metal);
  m.box(x + 0.04, y + 0.23, z + 0.045, 1.07, 0.045, 0.56, dark, metal);
  for (let col = 0; col < 11; col++)
    for (let row = 0; row < 5; row++)
      m.cylinder(
        x + 0.075 + col * 0.1,
        y + 0.801,
        z + 0.08 + row * 0.12,
        0.015,
        0.003,
        '#36474a',
        6,
      );
  m.box(x + 0.31, y + 0.804, z + 0.12, 0.42, 0.034, 0.31, '#58696a', metal);
  m.box(x + 0.31, y + 0.84, z + 0.12, 0.05, 0.19, 0.31, '#869696', metal);
  m.rod([x + 0.64, y + 0.852, z + 0.42], [x + 0.9, y + 0.85, z + 0.51], 0.028, dark, 8);
  m.rod(
    [x + 0.64, y + 0.852, z + 0.42],
    [x + 0.55, y + 0.824, z + 0.38],
    0.013,
    '#b68150',
    8,
    metal,
  );
  m.rod([x + 0.9, y + 0.85, z + 0.51], [x + 0.98, y + 0.37, z + 0.52], 0.009, dark, 6);
  m.box(x + 0.65, y + 0.28, z + 0.11, 0.34, 0.27, 0.4, '#b17c41', metal);
  m.box(x + 0.68, y + 0.32, z + 0.51, 0.28, 0.18, 0.013, dark);
  for (const py of [0.36, 0.39, 0.42])
    m.box(x + 0.71, y + py, z + 0.524, 0.11, 0.008, 0.009, steel);
  m.sphere(x + 0.9, y + 0.413, z + 0.53, 0.024, 0.023, 0.017, safety, 8, 5);
  m.box(x + 0.02, y + 1.24, z + 0.025, 0.35, 0.37, 0.14, dark);
  m.box(x + 0.086, y + 1.432, z + 0.166, 0.218, 0.09, 0.021, '#172e38', { metal: 0.45 });
  m.box(x + 0.07, y + 1.417, z + 0.185, 0.239, 0.012, 0.004, steel, metal);
}

export function drawDefenseWorkshop(m: Mesh, b: BuildingDefinition, base: number) {
  const { x, y: z, w, d } = b;
  m.box(x + 0.11, base - 0.034, z + 0.11, w - 0.22, 0.036, d - 0.22, '#77807b', 'stone');
  for (const offset of [0.88, 1.62, 2.36])
    m.box(x + 0.13, base + 0.003, z + offset, w - 0.26, 0.006, 0.013, '#5e6965');
  for (let i = 0; i < 11; i++)
    m.box(x + 0.2 + i * 0.122, base + 0.012, z + 0.81, 0.074, 0.007, 0.026, safety);
  lathe(m, x + 0.19, base, z + 0.18);
  weldingBench(m, x + w - 1.38, base, z + 0.17);

  // Pegboard and inspection counter in the gap between the two machines.
  m.box(x + 1.64, base + 0.76, z + 0.13, 1.12, 0.81, 0.082, '#806449', 'wood');
  m.box(x + 1.67, base, z + 0.17, 1.04, 0.67, 0.38, '#536568', metal);
  m.box(x + 1.62, base + 0.67, z + 0.14, 1.14, 0.052, 0.48, '#8e7252', 'wood');
  for (let col = 0; col < 9; col++)
    for (let row = 0; row < 6; row++)
      m.box(
        x + 1.73 + col * 0.115,
        base + 0.86 + row * 0.11,
        z + 0.213,
        0.012,
        0.012,
        0.005,
        '#453e37',
      );
  for (let i = 0; i < 6; i++) {
    const xx = x + 1.77 + i * 0.133;
    const top = base + 1.4 - (i % 3) * 0.057;
    m.rod(
      [xx, top, z + 0.239],
      [xx + 0.024, top - 0.29 + i * 0.021, z + 0.249],
      0.013,
      steel,
      6,
      metal,
    );
    m.rod(
      [xx - 0.025, top, z + 0.239],
      [xx + 0.025, top, z + 0.239],
      0.017,
      i % 2 ? dark : steel,
      6,
      metal,
    );
  }
  m.box(x + 2.28, base + 0.727, z + 0.37, 0.32, 0.009, 0.16, '#d6c8a7');
  m.box(x + 1.76, base + 0.727, z + 0.34, 0.26, 0.037, 0.17, '#566e69');
  m.box(x + 1.76, base + 1.62, z + 0.15, 0.9, 0.045, 0.18, '#cde8dc', { emissive: 0.75 });

  // Stock rack, cut bars and strapped shielding-gas cylinders.
  const rackX = x + w - 0.43,
    rackZ = z + 1.13;
  for (const end of [0, 1.35])
    m.box(rackX + 0.24, base, rackZ + end, 0.04, 1.57, 0.055, dark, metal);
  for (const height of [0.31, 0.77, 1.23]) {
    m.box(rackX, base + height, rackZ, 0.3, 0.035, 1.4, dark, metal);
    for (let i = 0; i < 4; i++) {
      const xx = rackX + 0.033 + 0.055 * i;
      m.rod(
        [xx, base + height + 0.05, rackZ + 0.13],
        [xx, base + height + 0.05, rackZ + 1.27 - 0.11 * i],
        0.022,
        i === 0 ? '#b28654' : steel,
        6,
        metal,
      );
    }
  }
  for (const [dx, bottleColor] of [
    [0.27, '#4c6865'],
    [0.54, '#50677b'],
  ] as const) {
    const xx = x + dx,
      zz = z + 1.22;
    m.cylinder(xx, base, zz, 0.104, 0.79, bottleColor, 12);
    m.cylinder(xx, base + 0.79, zz, 0.103, 0.12, bottleColor, 12, 0.043);
    m.cylinder(xx, base + 0.91, zz, 0.033, 0.09, '#a68c55', 8);
    m.rod([xx - 0.065, base + 1, zz], [xx + 0.065, base + 1, zz], 0.02, dark, 8);
    m.cylinder(xx, base + 0.55, zz, 0.108, 0.044, '#383b37', 12);
  }
  b.interiorObstacles = [
    [0.19, 0.18, 1.35, 0.58],
    [1.62, 0.14, 1.14, 0.48],
    [w - 1.38, 0.17, 1.15, 0.65],
    [w - 0.43, 1.13, 0.3, 1.4],
    [0.15, 1.105, 0.51, 0.24],
  ].map(([u, v, width, depth]) => [
    [x + u, z + v],
    [x + u + width, z + v],
    [x + u + width, z + v + depth],
    [x + u, z + v + depth],
  ]);
}
