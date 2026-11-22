import { rand, type Mesh } from './geometry.ts';

/** Coastal village reached on foot through the Marin headlands. */
export const BOLINAS = Object.freeze({ x: -8, z: -48, entry: { x: -7.5, y: -43.5 } });
export const BOLINAS_BEACH = Object.freeze({
  id: 'bolinas-beach',
  entry: { x: -13.5, y: -48.5 },
});
export const EMF_WARRIOR = Object.freeze({
  id: 'bolinas-emf-warrior',
  combatKind: 'emf-warrior',
  x: -7,
  z: -53,
});
export const EMF_DISCIPLES = [
  { id: 'bolinas-emf-disciple-west', combatKind: 'emf-disciple', x: -9, z: -53.5 },
  { id: 'bolinas-emf-disciple-east', combatKind: 'emf-disciple', x: -4.5, z: -51 },
  { id: 'bolinas-emf-disciple-north', combatKind: 'emf-disciple', x: -7.5, z: -55 },
] as const;
export const CULTIST_COTTAGE = { x: -3, z: -47, w: 3.4, d: 2.6, color: '#799b93' };
export const BOLINAS_CULTIST = {
  id: 'bolinas-cultist',
  combatKind: 'bolinas-cultist',
  x: -4.6,
  z: -44.8,
};
export const BOLINAS_COTTAGES = Object.freeze([
  { x: -12, z: -45.5, color: '#9e6862' },
  CULTIST_COTTAGE,
  { x: -12, z: -51, color: '#c4ad79' },
  { x: -2.5, z: -53, color: '#889577' },
]);
export const BOLINAS_PATH = Object.freeze([
  [28, -2] satisfies [number, number],
  [22, -9] satisfies [number, number],
  [16, -17] satisfies [number, number],
  [10, -25] satisfies [number, number],
  [3, -33] satisfies [number, number],
  [-5, -39] satisfies [number, number],
  [-7, -44] satisfies [number, number],
  [-7, -55] satisfies [number, number],
]);
export function bolinasBeachBlend(x: number, z: number) {
  const shore = -12 + 0.3 * (z + 37.5);
  const inland = (x - shore) / 5.7;
  const length = Math.abs(z + 49.5) / 9;
  const weight = Math.max(0, Math.min(1, (1 - Math.max(inland, length)) * 3));
  return weight * weight * (3 - 2 * weight);
}
export function bolinasBeachHeight(x: number, z: number) {
  const shore = -12 + 0.3 * (z + 37.5);
  return 0.035 + Math.max(0, x - shore) * 0.115;
}
export function bolinasBlocks(x: number, z: number) {
  const cottage = CULTIST_COTTAGE,
    dx = Math.abs(x - cottage.x),
    dz = z - cottage.z,
    side = cottage.w / 2,
    front = cottage.d / 2;
  return (
    (Math.abs(x + 4.55) < 1.05 && Math.abs(z + 55.35) < 0.78) ||
    BOLINAS_COTTAGES.some(
      (h) => h !== cottage && Math.abs(x - h.x) < 1.65 && Math.abs(z - h.z) < 1.35,
    ) ||
    (dx < side + 0.15 &&
      Math.abs(dz) < front + 0.15 &&
      (dx > side - 0.16 || dz < -front + 0.16 || (dz > front - 0.16 && dx > 0.43)))
  );
}
export function drawBolinas(
  m: Mesh,
  ground: { (x: number, z: number): number; (arg0: number, arg1: number): number },
) {
  for (let i = 1; i < BOLINAS_PATH.length; i++) {
    const [ax, az] = BOLINAS_PATH[i - 1],
      [bx, bz] = BOLINAS_PATH[i],
      length = Math.hypot(bx - ax, bz - az),
      nx = (-(bz - az) / length) * 0.7,
      nz = ((bx - ax) / length) * 0.7,
      steps = Math.ceil(length * 4);
    const at = (t: number, side: number) => {
      const x = ax + (bx - ax) * t + nx * side,
        z = az + (bz - az) * t + nz * side;
      return [x, ground(x, z) + 0.065, z] satisfies [number, number, number];
    };
    for (let j = 0; j < steps; j++)
      for (const side of [-1, 0]) {
        m.quad(
          at(j / steps, side),
          at(j / steps, side + 1),
          at((j + 1) / steps, side + 1),
          at((j + 1) / steps, side),
          '#b5a080',
          'dirt',
        );
      }
  }
  for (const [index, h] of BOLINAS_COTTAGES.entries()) {
    if (h === CULTIST_COTTAGE) continue;
    const y = ground(h.x, h.z);
    m.box(h.x - 1.44, y - 0.38, h.z - 1.14, 2.88, 0.48, 2.28, '#888378', 'marinRock');
    m.box(h.x - 1.4, y, h.z - 1.1, 2.8, 1.8, 2.2, h.color, 'clapboard');
    for (const end of [-1, 1])
      m.tri(
        [h.x + end * 1.4, y + 1.75, h.z - 1.1],
        [h.x + end * 1.4, y + 1.75, h.z + 1.1],
        [h.x + end * 1.4, y + 2.65, h.z],
        h.color,
        'wood',
      );
    m.box(h.x - 0.97, y + 1.72, h.z - 0.62, 0.27, 0.73, 0.34, '#9b8070', 'brick');
    for (const side of [-1, 1] satisfies [number, number]) {
      m.quad(
        [h.x - 1.6, y + 1.75, h.z + side * 1.3] satisfies [number, number, number],
        [h.x + 1.6, y + 1.75, h.z + side * 1.3] satisfies [number, number, number],
        [h.x + 1.6, y + 2.65, h.z] satisfies [number, number, number],
        [h.x - 1.6, y + 2.65, h.z] satisfies [number, number, number],
        ['#526b6c', '#806450', '#5c6273', '#5f765d'][index],
        'roofTile',
      );
      const xx = h.x + side * 0.85;
      m.box(xx - 0.31, y + 0.78, h.z + 1.11, 0.62, 0.62, 0.05, '#d2bd96', 'wood');
      m.box(xx - 0.24, y + 0.85, h.z + 1.17, 0.48, 0.48, 0.03, '#c9b281', 'glass');
      m.box(xx - 0.025, y + 0.85, h.z + 1.2, 0.05, 0.48, 0.03, '#ebe2c8');
      m.box(xx - 0.34, y + 0.75, h.z + 1.15, 0.68, 0.095, 0.21, '#80664e', 'wood');
      for (let i = -1; i <= 1; i++)
        m.sphere(xx + i * 0.19, y + 0.86, h.z + 1.29, 0.11, 0.105, 0.095, '#789467', 7, 5);
    }
    m.box(h.x - 0.3, y, h.z + 1.12, 0.6, 1.3, 0.03, '#4f554b');
    m.box(h.x - 1.5, y - 0.02, h.z + 1.2, 3, 0.1, 0.6, '#b7a387', 'marinTimber');
    for (const end of [-1, 1]) {
      m.box(h.x + end * 1.43 - 0.035, y, h.z + 1.12, 0.07, 1.8, 0.07, '#c1b393', 'marinTimber');
      m.box(h.x + end * 1.1 - 0.09, y + 0.12, h.z + 1.45, 0.18, 0.21, 0.18, '#917659', 'marinRock');
    }
  }
  // A little village green, driftwood benches, a surf rack and a fenced garden.
  for (const z of [-44, -50] satisfies [number, number]) {
    const x = -9,
      y = ground(x, z);
    m.box(x - 0.7, y + 0.42, z - 0.15, 1.4, 0.09, 0.35, '#a08b67', 'wood');
    for (const dx of [-0.5, 0.5] satisfies [number, number])
      m.box(x + dx - 0.04, y, z - 0.1, 0.08, 0.42, 0.25, '#6b7060');
  }
  for (let i = 0; i < 3; i++) {
    const x = -0.7 + i * 0.27,
      z = -50,
      y = ground(x, z);
    m.sphere(
      x,
      y + 0.75,
      z,
      0.11,
      0.8,
      0.045,
      (['#d5b071', '#7ca8a7', '#bc6b66'] satisfies [string, string, string])[i],
      12,
      8,
    );
  }
  for (let i = 0; i < 9; i++) {
    const x = -14 + i * 0.5,
      z = -48.5,
      y = ground(x, z);
    m.box(x, y, z, 0.05, 0.6, 0.05, '#c6b78f', 'wood');
  }
  // Weathered boardwalk follows the cove without flattening its dunes.
  for (let i = 0; i < 28; i++) {
    const z = -44.5 - i * 0.34;
    const x = -14.25 + (z + 48) * 0.22;
    const y = ground(x, z);
    m.box(
      x - 0.37,
      y + 0.014,
      z,
      0.74,
      0.052,
      0.31,
      ['#a48b6b', '#b19b7c', '#927e62'][i % 3],
      'marinTimber',
    );
    if (i % 3 === 0) {
      m.box(x - 0.41, y, z, 0.06, 0.38, 0.06, '#74644f', 'wood');
      m.sphere(
        x + 0.59,
        ground(x + 0.59, z) + 0.08,
        z,
        0.21,
        0.15,
        0.24,
        '#817c6f',
        7,
        4,
        'marinRock',
      );
    }
  }
  // Porch awnings, driftwood planters and low coastal vegetation.
  for (const [i, cottage] of BOLINAS_COTTAGES.entries()) {
    if (cottage === CULTIST_COTTAGE) continue;
    const y = ground(cottage.x, cottage.z);
    for (let k = 0; k < 9; k++)
      m.box(
        cottage.x - 0.89 + k * 0.198,
        y + 1.57,
        cottage.z + 1.12,
        0.198,
        0.045,
        0.45,
        k % 2 ? '#d9c6a3' : ['#a76254', '#48756f', '#87734a', '#526b80'][i],
        'canvasWeave',
      );
    for (const dx of [-1.17, 1.17])
      m.box(
        cottage.x + dx - 0.09,
        y + 0.03,
        cottage.z + 1.35,
        0.18,
        0.23,
        0.22,
        '#b27c62',
        'brick',
      );
  }
  for (let i = 0; i < 56; i++) {
    const z = -43.5 - rand(i, 71) * 11.8;
    const x = -14.2 + rand(i, 37) * 4.2;
    if (bolinasBlocks(x, z) || Math.abs(x - (-14.25 + (z + 48) * 0.22)) < 0.62) continue;
    const y = ground(x, z);
    for (let n = 0; n < 4; n++) {
      const a = n * 1.57 + i;
      const dx = Math.cos(a) * 0.12,
        dz = Math.sin(a) * 0.12;
      m.tri(
        [x - 0.04, y, z],
        [x + dx, y + 0.21 + rand(i, n) * 0.2, z + dz],
        [x + 0.04, y, z + 0.04],
        ['#817d4b', '#aa9d5c', '#71805a'][i % 3],
      );
    }
  }
  drawWarriorCamp(m, ground);
  // An improvised antenna garden beside the warrior's patch of grass.
  for (const dx of [-1, 1] satisfies [number, number]) {
    const x = -7 + dx * 2,
      z = -56,
      y = ground(x, z);
    m.rod(
      [x, y, z] satisfies [number, number, number],
      [x, y + 2.7, z] satisfies [number, number, number],
      0.025,
      '#9ba7a8',
      8,
      { metal: 0.7 },
    );
    for (const h of [1.7, 2.2, 2.6] satisfies [number, number, number])
      m.rod(
        [x - 0.5, y + h, z] satisfies [number, number, number],
        [x + 0.5, y + h, z] satisfies [number, number, number],
        0.018,
        '#b6c2c3',
        6,
        { metal: 0.7 },
      );
  }
}

function drawWarriorCamp(m: Mesh, ground: (x: number, z: number) => number) {
  const x = -4.55,
    z = -55.35,
    y = ground(x, z);
  const foil = { metal: 0.85 };
  m.box(x - 0.91, y - 0.26, z - 0.64, 1.82, 0.35, 1.28, '#6c6e62', 'stone');
  for (const side of [-1, 1]) {
    m.rod(
      [x + side * 0.8, y + 0.07, z + 0.48],
      [x + side * 0.8, y + 1.43, z + 0.48],
      0.045,
      '#8b6f55',
      8,
    );
    m.rod(
      [x + side * 0.8, y + 0.07, z - 0.5],
      [x + side * 0.8, y + 1.05, z - 0.51],
      0.045,
      '#8b6f55',
      8,
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = x - 0.9 + i * 0.2,
      b = a + 0.22,
      zig = i % 2 ? 0.07 : -0.055;
    const tint = i % 3 ? '#b9c6c6' : '#e3e0d5';
    m.tri(
      [a, y + 1.49 + zig, z + 0.62],
      [b, y + 1.49 - zig, z + 0.63],
      [a, y + 1.06, z - 0.62],
      tint,
      foil,
    );
    m.tri(
      [b, y + 1.49 - zig, z + 0.63],
      [b, y + 1.06, z - 0.62],
      [a, y + 1.06, z - 0.62],
      '#929e9f',
      foil,
    );
    m.quad(
      [a, y + 0.12, z - 0.57],
      [b, y + 0.12, z - 0.57],
      [b, y + 1.11, z - 0.57],
      [a, y + 1.03, z - 0.54],
      tint,
      foil,
    );
  }
  m.box(x - 0.62, y + 0.11, z - 0.35, 1.2, 0.3, 0.48, '#454e4d', 'wood');
  m.box(x - 0.51, y + 0.42, z - 0.34, 0.39, 0.26, 0.32, '#626963', { metal: 0.5 });
  for (let i = 0; i < 3; i++)
    m.sphere(
      x - 0.46 + i * 0.105,
      y + 0.57,
      z - 0.008,
      0.027,
      0.027,
      0.025,
      i === 1 ? '#d0ad63' : '#a67256',
      6,
      4,
      { emissive: 0.18 },
    );
  const dishX = -9.5,
    dishZ = -54.4,
    base = ground(dishX, dishZ);
  m.cylinder(dishX, base, dishZ, 0.1, 1.15, '#677376', 10, 0.08, foil);
  m.sphere(dishX, base + 1.22, dishZ, 0.74, 0.16, 0.74, '#9da9aa', 14, 7, foil);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    m.rod(
      [dishX + Math.cos(angle) * 0.67, base + 1.28, dishZ + Math.sin(angle) * 0.67],
      [dishX, base + 1.78, dishZ],
      0.014,
      '#6f7c7b',
      6,
    );
  }
  m.sphere(dishX, base + 1.78, dishZ, 0.09, 0.075, 0.09, '#545c52', 8, 5);
}
