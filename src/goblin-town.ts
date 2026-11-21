import type { Mesh } from './geometry.ts';
import { pose } from './geometry.ts';
import { ATV_JUMP_LANE, ATV_RENTAL, ATV_ROOF, rampRise } from './atv.ts';
import { drawATV } from './atv-model.ts';

export const FURNITURE_FACTORY = Object.freeze({
  name: 'Goblin Furniture Factory',
  x: 29.5,
  z: -30.9,
  width: 4.4,
  depth: 2.6,
});
export const FACTORY_CHAIRS = Object.freeze([
  { id: 'ball-chair', name: 'Ball Chair' },
  { id: 'eames-chair', name: 'Eames Chair' },
  { id: 'bertoia-chair', name: 'Bertoia Chair' },
]);
export const FACTORY_CHAIR_BUY = 200;
export const FACTORY_CHAIR_SELL = 220;

export const GOBLIN_TOWN = Object.freeze({ x: 30, z: -23, entry: { x: 29.5, y: -17.5 } });
export const GOBLIN_HUTS = Object.freeze([
  { x: 26.5, z: -21, color: '#9c6657' },
  { x: 33.5, z: -23, color: '#7d8757' },
  { x: 26.5, z: -26, color: '#8b7198' },
]);
export const GOBLIN_SPAWNS = Object.freeze([
  { id: 'tam-goblin-1', combatKind: 'goblin', x: 30, z: -19 },
  { id: 'tam-goblin-2', combatKind: 'goblin', x: 29, z: -23 },
  { id: 'tam-goblin-3', combatKind: 'goblin', x: 32, z: -26 },
  { id: 'tam-furniture-maker', combatKind: 'goblin-maker', x: 29.5, z: -27.5 },
  { id: 'south-lost-goblin', combatKind: 'lost-goblin', x: 74.5, z: 187.5 },
]);
export function goblinRoofAt(x: number, z: number) {
  return GOBLIN_HUTS.find(
    (hut) => Math.abs(x - hut.x) <= ATV_ROOF.halfWidth && rampRise(z, hut.z) > 0,
  );
}
export function goblinHutBlocks(x: number, z: number) {
  const factory = FURNITURE_FACTORY;
  return (
    (Math.abs(x - factory.x) < factory.width / 2 + 0.15 &&
      Math.abs(z - factory.z) < factory.depth / 2 + 0.15) ||
    GOBLIN_HUTS.some((h) => Math.abs(x - h.x) < 1.3 && Math.abs(z - h.z) < 1.45)
  );
}
export function drawBallChair(m: Mesh, x: number, base: number, z: number, angle = 0) {
  pose(m, x, base, z, angle - Math.PI / 2, () => {
    m.cylinder(0, 0.015, 0, 0.4, 0.065, '#d5dadd', 24, 0.36, { metal: 0.8 });
    m.cylinder(0, 0.08, 0, 0.07, 0.34, '#b8c4cd', 16, 0.1, { metal: 0.85 });
    // A hollow spherical shell with a broad circular opening toward +Z.
    const at = (theta: number, phi: number, r: number) =>
      [
        Math.sin(theta) * Math.cos(phi) * r,
        1.03 + Math.sin(theta) * Math.sin(phi) * r,
        Math.cos(theta) * r,
      ] satisfies [number, number, number];
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 32; j++) {
        const a = 0.95 + ((Math.PI - 0.95) * i) / 16,
          b = 0.95 + ((Math.PI - 0.95) * (i + 1)) / 16,
          c = (j * Math.PI) / 16,
          d = ((j + 1) * Math.PI) / 16;
        m.quad(at(a, c, 0.8), at(b, c, 0.8), at(b, d, 0.8), at(a, d, 0.8), '#eeeadd', {
          metal: 0.15,
        });
        m.quad(at(a, d, 0.75), at(b, d, 0.75), at(b, c, 0.75), at(a, c, 0.75), '#a93048');
        if (!i) m.quad(at(a, c, 0.8), at(a, d, 0.8), at(a, d, 0.75), at(a, c, 0.75), '#deded7');
      }
    m.sphere(0, 0.62, 0.04, 0.49, 0.11, 0.45, '#bc3d56', 24, 12);
  });
}
export function drawGoblinTown(m: Mesh, ground: (arg0: number, arg1: number) => number) {
  // The approach skirts the jail's east side before turning north into town.
  const points = [
    [33.7, -9] satisfies [number, number],
    [33.7, -15.5] satisfies [number, number],
    [30, -17] satisfies [number, number],
    [30, -28.8] satisfies [number, number],
  ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.ceil(length * 4),
      nx = (-(b[1] - a[1]) / length) * 0.55,
      nz = ((b[0] - a[0]) / length) * 0.55;
    const at = (t: number, side: number) => {
      const x = a[0] + (b[0] - a[0]) * t + nx * side,
        z = a[1] + (b[1] - a[1]) * t + nz * side;
      return [x, ground(x, z) + 0.065, z] satisfies [number, number, number];
    };
    for (let j = 0; j < n; j++)
      for (const side of [-1, 0]) {
        m.quad(
          at(j / n, side),
          at(j / n, side + 1),
          at((j + 1) / n, side + 1),
          at((j + 1) / n, side),
          '#ab9270',
          'dirt',
        );
      }
  }
  for (const hut of GOBLIN_HUTS) drawRampHouse(m, hut, ground);
  const bay = ATV_RENTAL.parking;
  drawATV(m, bay.x + 1.2, ground(bay.x + 1.2, bay.z), bay.z, Math.PI);
  for (const side of [-1, 1]) {
    const x = ATV_JUMP_LANE.x + side * 1.06,
      z = ATV_JUMP_LANE.start;
    const y = ground(x, z);
    m.rod([x, y, z], [x, y + 1, z], 0.029, '#827043', 8);
    m.tri([x, y + 1.05, z], [x, y + 0.78, z], [x + 0.38, y + 0.9, z], '#e6aa48');
  }
  drawFactory(m, ground);
}

function drawRampHouse(
  m: Mesh,
  hut: (typeof GOBLIN_HUTS)[number],
  ground: (x: number, z: number) => number,
) {
  const { x, z } = hut;
  const at = (u: number, v: number, roof: boolean) => {
    const xx = x + ATV_ROOF.halfWidth * u,
      zz = z + ATV_ROOF.run * v;
    return [xx, ground(xx, zz) + (roof ? rampRise(zz, z) + 0.018 : -0.09), zz] as const;
  };
  const strips = 12;
  for (let i = 0; i < strips; i++) {
    const a = -1 + (2 * i) / strips,
      b = -1 + (2 * (i + 1)) / strips;
    for (const [left, right, color] of [
      [-1, -0.7, '#626b4d'],
      [-0.7, 0, '#837557'],
      [0, 0.7, '#837557'],
      [0.7, 1, '#696e4d'],
    ] as const)
      m.quad(
        at(left, a, true),
        at(left, b, true),
        at(right, b, true),
        at(right, a, true),
        color,
        Math.abs(left) === 1 || Math.abs(right) === 1 ? 'marinScrub' : 'marinTimber',
      );
    for (const side of [-1, 1]) {
      const start = side < 0 ? a : b,
        end = side < 0 ? b : a;
      m.quad(
        at(side, start, false),
        at(side, end, false),
        at(side, end, true),
        at(side, start, true),
        hut.color,
        'clapboard',
      );
    }
  }
  const doorX = x + ATV_ROOF.halfWidth;
  const y = ground(doorX, z);
  m.box(doorX - 0.02, y - 0.05, z - 0.28, 0.08, 0.94, 0.56, '#4c3b2c', 'wood');
  m.box(doorX + 0.055, y + 0.06, z - 0.21, 0.026, 0.77, 0.42, '#867353', 'clapboard');
  m.sphere(doorX + 0.1, y + 0.42, z + 0.14, 0.032, 0.033, 0.033, '#c5a35c', 8, 5);
  for (const end of [-1, 1]) {
    const zw = z + end * 0.64;
    m.box(doorX, ground(doorX, zw) + 0.35, zw - 0.16, 0.065, 0.3, 0.32, '#63503a', 'wood');
    m.box(doorX + 0.069, ground(doorX, zw) + 0.4, zw - 0.12, 0.026, 0.2, 0.24, '#edba68', {
      emissive: 0.14,
    });
  }
}

function drawEamesChair(m: Mesh, x: number, y: number, z: number, angle: number) {
  pose(m, x, y, z, angle, () => {
    m.cylinder(0, 0, 0, 0.065, 0.43, '#393a3b', 10);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      m.rod([0, 0.09, 0], [Math.cos(a) * 0.38, 0.035, Math.sin(a) * 0.38], 0.027, '#636567', 8);
    }
    for (const [height, depth, tilt] of [
      [0.44, 0.08, 0.05],
      [0.76, -0.22, 0.15],
      [1.03, -0.29, 0.13],
    ]) {
      const seat = height < 0.5;
      m.sphere(
        0,
        height,
        depth,
        0.39,
        seat ? 0.085 : tilt,
        seat ? 0.36 : 0.085,
        '#8e573b',
        16,
        9,
        'wood',
      );
      m.sphere(
        0,
        height + (seat ? 0.055 : 0),
        depth + (seat ? 0 : 0.065),
        0.34,
        seat ? 0.104 : tilt,
        seat ? 0.32 : 0.09,
        '#2d2827',
        16,
        9,
      );
    }
    for (const side of [-1, 1]) {
      m.rod([side * 0.3, 0.49, -0.06], [side * 0.36, 0.66, 0.01], 0.04, '#806047', 8);
      m.sphere(side * 0.36, 0.66, 0.06, 0.07, 0.05, 0.21, '#2c2928', 12, 7);
    }
  });
}

function drawBertoiaChair(m: Mesh, x: number, y: number, z: number, angle: number) {
  pose(m, x, y, z, angle, () => {
    const steel = '#b5c1c2';
    for (const side of [-1, 1]) {
      m.rod([side * 0.3, 0.03, -0.35], [side * 0.3, 0.03, 0.32], 0.023, steel, 7);
      m.rod([side * 0.3, 0.03, 0.32], [side * 0.23, 0.49, 0.23], 0.023, steel, 7);
      m.rod([side * 0.3, 0.03, -0.35], [side * 0.23, 0.49, -0.21], 0.023, steel, 7);
    }
    for (let i = -6; i <= 6; i++) {
      const xx = i * 0.055,
        outer = Math.abs(i) / 6,
        top = 1.16 - outer * 0.28;
      m.rod([xx, 0.54, 0.29], [xx * 0.85, 0.46, -0.18], 0.014, steel, 6);
      m.rod([xx * 0.85, 0.46, -0.18], [xx * 1.55, top, -0.35], 0.014, steel, 6);
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6,
        half = Math.min(0.51, 0.34 + t * 0.29);
      m.rod(
        [-half, 0.46 + t * 0.69, -0.18 - t * 0.17],
        [half, 0.46 + t * 0.69, -0.18 - t * 0.17],
        0.015,
        '#87989e',
        6,
      );
    }
    m.sphere(0, 0.52, 0.1, 0.29, 0.046, 0.23, '#be6047', 13, 8, 'canvasWeave');
  });
}

function drawFactory(m: Mesh, ground: (x: number, z: number) => number) {
  const { x, z, width, depth } = FURNITURE_FACTORY;
  const y = ground(x, z),
    left = x - width / 2,
    back = z - depth / 2,
    front = z + depth / 2;
  m.box(left, y - 0.45, back, width, 0.55, depth, '#6c6e63', 'stone');
  m.box(left, y + 0.1, back, width, 2.1, 0.15, '#695446', 'brick');
  for (const side of [left, left + width - 0.15])
    m.box(side, y + 0.1, back, 0.15, 2.1, depth, '#795849', 'brick');
  m.box(left - 0.12, y + 1.98, front - 0.15, width + 0.24, 0.4, 0.24, '#463831', 'wood');
  for (let i = 0; i < 4; i++) {
    const xx = left + (width * i) / 3;
    m.box(xx - 0.07, y + 0.1, front - 0.11, 0.14, 1.95, 0.18, '#6d4935', 'wood');
    m.rod([xx, y + 2.08, back], [xx, y + 2.08, front], 0.05, '#725441', 8);
  }
  for (let i = 0; i < 3; i++) {
    const a = left - 0.16 + ((width + 0.32) * i) / 3;
    const b = a + (width + 0.32) / 3;
    m.quad(
      [a, y + 2.31, back - 0.23],
      [a, y + 2.31, front + 0.18],
      [b, y + 2.82, front + 0.18],
      [b, y + 2.82, back - 0.23],
      '#697e75',
      'roof',
    );
    m.quad(
      [b, y + 2.31, back - 0.23],
      [b, y + 2.82, back - 0.23],
      [b, y + 2.82, front + 0.18],
      [b, y + 2.31, front + 0.18],
      '#97aeb0',
      'glass',
    );
  }
  m.cylinder(x + 1.62, y + 2.43, back + 0.4, 0.15, 0.9, '#636b64', 12);
  m.cylinder(x + 1.62, y + 3.28, back + 0.4, 0.22, 0.09, '#333d39', 12);
  m.box(x - 1.8, y + 0.76, back + 0.29, 1.6, 0.13, 0.56, '#96694a', 'wood');
  for (const dx of [-1.68, -0.36]) m.box(x + dx, y + 0.1, back + 0.39, 0.12, 0.7, 0.35, '#525d50');
  m.box(x - 1.52, y + 0.89, back + 0.42, 0.52, 0.1, 0.28, '#6e7b72', { metal: 0.5 });
  m.sphere(x - 1.24, y + 1.05, back + 0.57, 0.16, 0.16, 0.035, '#b9c2ba', 18, 8, { metal: 0.85 });
  for (let i = 0; i < 8; i++)
    m.box(
      x + 0.75 + (i % 2) * 0.13,
      y + 0.12 + i * 0.067,
      back + 0.33,
      1.05,
      0.045,
      0.38,
      i % 2 ? '#b38b5e' : '#956946',
      'wood',
    );
  drawEamesChair(m, x - 1.34, y + 0.1, front - 0.57, -0.25);
  drawBertoiaChair(m, x + 0.18, y + 0.1, front - 0.55, 0.25);
  drawBallChair(m, x + 1.53, y + 0.1, front - 0.66, Math.PI / 2);
}
