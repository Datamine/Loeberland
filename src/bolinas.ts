import { rand, type Mesh } from './geometry.ts';
import { MARIN_BOLINAS_SHORE, REFERENCE_SIZE, WORLD_SIZE } from './geography.ts';
import { adventureSite } from './adventure-sites.ts';
import { drawGardenFlowers, drawShrub } from './garden-plants.ts';

/** Coastal village reached on foot through the Marin headlands. */
export const BOLINAS = Object.freeze({ x: -8, z: -48, entry: { x: -7.5, y: -43.5 } });
export const BOLINAS_BEACH = Object.freeze({
  id: 'bolinas-beach',
  x: -6,
  z: -31,
  entry: { x: -5, y: -31.5 },
});
const mapScale = WORLD_SIZE / REFERENCE_SIZE;

function bolinasShoreX(z: number) {
  const { headland, north, south } = MARIN_BOLINAS_SHORE;
  const referenceZ = z / mapScale;
  const end = referenceZ < north[1] ? headland : south;
  const t = (referenceZ - north[1]) / (end[1] - north[1]);
  return (north[0] + (end[0] - north[0]) * t) * mapScale;
}

const beachPoint = (z: number, inland: number) => ({ x: bolinasShoreX(z) + inland, z });
export const BOLINAS_URCHINS = Object.freeze(
  [
    { x: BOLINAS_BEACH.x, z: BOLINAS_BEACH.z },
    beachPoint(-34.7, 1.45),
    beachPoint(-33.05, 2.55),
    beachPoint(-31.9, 1.15),
    beachPoint(-29.35, 1.42),
    beachPoint(-27.8, 2.2),
  ].map((position, i) => ({
    // Keep the existing encounter IDs so saved urchins follow the moved spawns.
    id: 'point-reyes-urchin-' + (i + 1),
    combatKind: 'sea-urchin',
    ...position,
  })),
);
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
export const SENIOR_EMF_DISCIPLES = [
  { id: 'bolinas-senior-emf-disciple-west', combatKind: 'senior-emf-disciple', x: -9.4, z: -56.7 },
  { id: 'bolinas-senior-emf-disciple-north', combatKind: 'senior-emf-disciple', x: -6.7, z: -58.2 },
  { id: 'bolinas-senior-emf-disciple-east', combatKind: 'senior-emf-disciple', x: -3.4, z: -57.3 },
] as const;
export const CULTIST_COTTAGE = { x: -3, z: -47, w: 3.4, d: 2.6, color: '#799b93' };
export const BOLINAS_CULTIST = {
  id: 'bolinas-cultist',
  combatKind: 'bolinas-cultist',
  x: -4.6,
  z: -44.8,
};
const VILLAGE_COTTAGES = [
  { x: -12, z: -45.5, color: '#9e6862', roof: '#526b6c', awning: '#a76254' },
  { x: -12, z: -51, color: '#c4ad79', roof: '#5c6273', awning: '#87734a' },
  { x: -2.5, z: -53, color: '#889577', roof: '#5f765d', awning: '#526b80' },
];
export const BOLINAS_HOMES = [
  {
    id: 'bolinas-poppy-cottage',
    label: 'Poppy Cottage',
    description:
      'A pale yellow cottage with poppies by the steps and seed packets drying on the windowsill.',
    x: 0,
    z: -42.5,
    color: '#d8bc79',
    roof: '#535b4a',
    awning: '#b56942',
  },
  {
    id: 'bolinas-driftwood-house',
    label: 'Driftwood House',
    description:
      'A salt-blue house with a weathered porch. Beachcombed wood is stacked beside the door.',
    x: 3.5,
    z: -47.25,
    color: '#729aa3',
    roof: '#4d5f70',
    awning: '#4f746e',
  },
] as const;
export const BOLINAS_COTTAGES = Object.freeze([
  ...VILLAGE_COTTAGES,
  CULTIST_COTTAGE,
  ...BOLINAS_HOMES,
]);
const BOLINAS_TRAIL_BEND = [-5, -39] satisfies [number, number];
export const BOLINAS_PATH = Object.freeze([
  [28, -2] satisfies [number, number],
  [22, -9] satisfies [number, number],
  [16, -17] satisfies [number, number],
  [10, -25] satisfies [number, number],
  [3, -33] satisfies [number, number],
  BOLINAS_TRAIL_BEND,
  [-7, -44] satisfies [number, number],
  [-7, -55] satisfies [number, number],
]);
const HILLSIDE_PATH = [
  BOLINAS_TRAIL_BEND,
  [-3.3, -39.45],
  [-1, -39.45],
  [0, -39.6],
  [1, -39.8],
  [2.7, -40.8],
  [3.5, -42.4],
  [3.5, -44.7],
  [1.9, -44.75],
  [0.35, -45.05],
  [-0.05, -46.8],
  [-0.38, -48.65],
  [-1.85, -49.75],
  [-4.4, -49.9],
  [-7, -49.8],
] as const;
const GARDEN_PATH = [
  [-7, -44],
  [-5.35, -43.95],
  [-3.3, -44],
  [-1, -44.2],
  [0.35, -45.05],
] as const;

export const BOLINAS_TRAILS = [
  { points: BOLINAS_PATH, halfWidth: 0.7, color: '#b5a080' },
  { points: HILLSIDE_PATH, halfWidth: 0.52, color: '#bca783' },
  { points: GARDEN_PATH, halfWidth: 0.39, color: '#bb9f7a' },
  {
    points: [
      [0, -39.6],
      [0, -40.73],
    ],
    halfWidth: 0.29,
    color: '#c3ae8c',
  },
  {
    points: [
      [3.5, -44.7],
      [3.5, -45.48],
    ],
    halfWidth: 0.29,
    color: '#c3ae8c',
  },
] as const;

const BICYCLE_LOOP = [...HILLSIDE_PATH, GARDEN_PATH[0], HILLSIDE_PATH[0]] as const;
export const BOLINAS_LIFE_ROUTES = [
  { id: 'bolinas-hillside-cyclist', role: 'cyclist', points: BICYCLE_LOOP, seed: 0.12, loop: true },
  { id: 'bolinas-village-cyclist', role: 'cyclist', points: BICYCLE_LOOP, seed: 0.61, loop: true },
  { id: 'bolinas-garden-walker', role: 'walker', points: GARDEN_PATH, seed: 0.17 },
  { id: 'bolinas-cottage-walker', role: 'walker', points: HILLSIDE_PATH.slice(0, 8), seed: 0.3 },
  { id: 'bolinas-hill-walker', role: 'walker', points: HILLSIDE_PATH.slice(9), seed: 0.33 },
  { id: 'bolinas-village-walker', role: 'walker', points: GARDEN_PATH, seed: 0.67 },
] as const;

export function nearBolinasTrail(x: number, z: number) {
  return BOLINAS_TRAILS.some(({ points, halfWidth }) =>
    points.slice(1).some(([bx, bz], i) => {
      const [ax, az] = points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax - dx * t, z - az - dz * t) < halfWidth + 0.78;
    }),
  );
}
function smoothBeachBlend(amount: number) {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
}
function beachAlongshore(z: number) {
  return Math.min((z + 58.5) / 3, (-25 - z) / 2);
}
const coveBlend = (z: number) => smoothBeachBlend((z + 42) / 6);
export function bolinasBeachBlend(x: number, z: number) {
  const alongshore = beachAlongshore(z);
  if (alongshore <= 0) return 0;
  // Widen the sand where the beach leads into the village trail.
  const trail = smoothBeachBlend(1 - Math.abs(z - BOLINAS_TRAIL_BEND[1]) / 5);
  const width = 5.7 + 0.4 * coveBlend(z) + 2.75 * trail;
  const inland = (x - bolinasShoreX(z)) / width;
  return smoothBeachBlend(Math.min(alongshore, 3 * (1 - inland)));
}
export function bolinasBeachHeight(x: number, z: number) {
  return 0.035 + Math.max(0, x - bolinasShoreX(z)) * (0.115 - 0.02 * coveBlend(z));
}
export function bolinasWetSand(x: number, z: number) {
  const alongshore = smoothBeachBlend(beachAlongshore(z));
  if (alongshore === 0) return 0;
  const tideLine = 1.45 + 0.22 * Math.sin(z * 1.85);
  return alongshore * Math.max(0, Math.min(1, (tideLine - (x - bolinasShoreX(z))) / 1.2));
}

export function drawBolinasBeach(m: Mesh, ground: (x: number, z: number) => number) {
  // Shallow pools and flat stones sit just above the wash, away from the urchins' route.
  for (const z of [-35.25, -32.85, -30.15, -27.45]) {
    const { x } = beachPoint(z, 0.55);
    const rim = Array.from({ length: 9 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 9;
      const px = x + Math.cos(angle) * (0.2 + 0.065 * rand(i, z, 21));
      const pz = z + Math.sin(angle) * 0.32;
      return [px, ground(px, pz) + 0.018, pz] as const;
    });
    for (const [i, point] of rim.entries()) {
      m.tri([x, ground(x, z) + 0.018, z], rim[(i + 1) % rim.length], point, '#52716e');
      if (i % 2 === 0)
        m.sphere(point[0], point[1], point[2], 0.12, 0.048, 0.11, '#75776b', 7, 4, 'marinRock');
    }
  }
  for (const [z, inland, length] of [
    [-34.4, 3.9, 1.15],
    [-28.55, 3.55, 0.95],
  ]) {
    const { x } = beachPoint(z, inland);
    const y = ground(x, z);
    const end = [x + length, ground(x + length, z + 0.32) + 0.07, z + 0.32];
    m.rod([x, y + 0.11, z], end, 0.085, '#8d7962', 9, 'marinTimber');
    m.rod(
      [x + 0.32, ground(x + 0.32, z + 0.1) + 0.11, z + 0.1],
      [x + 0.52, ground(x + 0.52, z - 0.29) + 0.1, z - 0.29],
      0.039,
      '#b2a085',
      7,
      'marinTimber',
    );
  }
  for (let i = 0; i < 38; i++) {
    const z = BOLINAS_BEACH.z + (rand(i, 61) - 0.5) * 10.2;
    const { x } = beachPoint(z, 0.35 + rand(i, 62) * 4.1);
    const size = 0.04 + rand(i, 63) * 0.09;
    m.sphere(
      x,
      ground(x, z) + size * 0.12,
      z,
      size,
      size * 0.43,
      size * 0.76,
      ['#948f7f', '#d7c6a4', '#686e61'][i % 3],
      7,
      4,
      'marinRock',
    );
    if (i % 2 === 0) {
      const tuft = beachPoint(z, 4.4 + rand(i, 64) * 0.87);
      const y = ground(tuft.x, z);
      for (let blade = 0; blade < 5; blade++) {
        const dz = (blade - 2) * 0.085;
        m.tri(
          [tuft.x - 0.027, y, z + dz * 0.3],
          [tuft.x + 0.11 + rand(i, blade, 65) * 0.12, y + 0.15 + rand(i, blade, 66) * 0.2, z + dz],
          [tuft.x + 0.028, y, z + dz * 0.3],
          ['#888757', '#ab9f63', '#70794e'][blade % 3],
        );
      }
    }
  }
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
type Ground = (x: number, z: number) => number;

function drawBolinasCottage(m: Mesh, h: (typeof VILLAGE_COTTAGES)[number], ground: Ground) {
  const y = ground(h.x, h.z);
  const footing = Math.min(
    y - 0.38,
    ground(h.x - 1.44, h.z - 1.14) - 0.1,
    ground(h.x + 1.44, h.z - 1.14) - 0.1,
    ground(h.x - 1.44, h.z + 1.14) - 0.1,
    ground(h.x + 1.44, h.z + 1.14) - 0.1,
  );
  m.box(h.x - 1.44, footing, h.z - 1.14, 2.88, y + 0.1 - footing, 2.28, '#888378', 'marinRock');
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
      h.roof,
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
    const x = h.x + end * 1.36;
    const support = Math.min(y - 0.02, ground(x, h.z + 1.7) - 0.04);
    m.box(x - 0.055, support, h.z + 1.64, 0.11, y - support, 0.12, '#756952', 'marinTimber');
    m.box(h.x + end * 1.43 - 0.035, y, h.z + 1.12, 0.07, 1.8, 0.07, '#c1b393', 'marinTimber');
    m.box(h.x + end * 1.1 - 0.09, y + 0.12, h.z + 1.45, 0.18, 0.21, 0.18, '#917659', 'marinRock');
  }
  for (let k = 0; k < 9; k++)
    m.box(
      h.x - 0.89 + k * 0.198,
      y + 1.57,
      h.z + 1.12,
      0.198,
      0.045,
      0.45,
      k % 2 ? '#d9c6a3' : h.awning,
      'canvasWeave',
    );
  for (const dx of [-1.17, 1.17])
    m.box(h.x + dx - 0.09, y + 0.03, h.z + 1.35, 0.18, 0.23, 0.22, '#b27c62', 'brick');
}

export function drawBolinasHomes(m: Mesh, ground: Ground) {
  return BOLINAS_HOMES.map((home) => {
    const start = m.data.length;
    drawBolinasCottage(m, home, ground);
    const base = ground(home.x, home.z);
    const step = ground(home.x, home.z + 1.89) - 0.05;
    m.box(
      home.x - 0.46,
      step,
      home.z + 1.76,
      0.92,
      (base - step) / 2 + 0.06,
      0.26,
      '#978568',
      'marinTimber',
    );
    if (home.id === 'bolinas-poppy-cottage') {
      for (const [i, color] of ['#d89f51', '#d5c6a4', '#c17c64'].entries()) {
        const x = home.x - 1.03 + i * 0.13;
        m.box(x, base + 0.85, home.z + 1.26, 0.1, 0.16, 0.024, color);
        m.box(x + 0.025, base + 0.91, home.z + 1.285, 0.05, 0.05, 0.005, '#6c7855');
      }
    } else {
      const x = home.x + 0.78;
      const z = home.z + 1.47;
      for (const [offset, height, length] of [
        [0, 0.15, 0.49],
        [0.12, 0.15, 0.53],
        [0.06, 0.23, 0.47],
      ])
        m.rod(
          [x - 0.25, base + height, z + offset],
          [x - 0.25 + length, base + height + 0.02, z + offset],
          0.046,
          '#8e7760',
          7,
          'marinTimber',
        );
    }
    return adventureSite(m, start, {
      id: home.id,
      kind: 'house',
      label: home.label,
      description: home.description,
      entry: { x: home.x - 0.5, y: home.z + 1.5 },
    });
  });
}

export function drawBolinasGardens(m: Mesh, ground: Ground) {
  const poppies = ['#ee9c35', '#df7743', '#f5bc56'];
  const coastalFlowers = ['#b995c8', '#e9ded0', '#e4a7ad'];
  for (const [x, z, rx, rz, colors] of [
    [-1.25, -40.39, 0.66, 0.26, poppies],
    [1.24, -40.42, 0.6, 0.23, poppies],
    [-2.52, -43.22, 0.77, 0.29, poppies],
    [-0.85, -44.93, 0.62, 0.34, poppies],
    [-4.63, -42.99, 0.65, 0.27, coastalFlowers],
    [2.72, -42.63, 0.22, 0.64, coastalFlowers],
    [4.62, -43.93, 0.54, 0.39, coastalFlowers],
    [4.8, -45.34, 0.55, 0.33, coastalFlowers],
    [-0.97, -48.1, 0.24, 0.5, coastalFlowers],
  ] as const)
    drawGardenFlowers(m, ground, x, z, rx, rz, colors, 14);
  drawShrub(m, ground, 2.1, -43.12, 0.36, 31);
  drawShrub(m, ground, 5.24, -44.91, 0.43, 39);
}

export function drawBolinas(m: Mesh, ground: Ground) {
  for (const [index, { points, halfWidth, color }] of BOLINAS_TRAILS.entries()) {
    const edges = points.slice(1).map(([bx, bz], i) => {
      const [ax, az] = points[i];
      const length = Math.hypot(bx - ax, bz - az);
      return [-(bz - az) / length, (bx - ax) / length];
    });
    // Share the same edges across adjoining segments so bends have no gaps.
    const offsets = points.map((_, i) => {
      const a = edges[i - 1] ?? edges[i];
      const b = edges[i] ?? a;
      const scale = halfWidth / (1 + a[0] * b[0] + a[1] * b[1]);
      return [(a[0] + b[0]) * scale, (a[1] + b[1]) * scale];
    });
    const rise = 0.065 + index * 0.007;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1],
        [bx, bz] = points[i],
        [anx, anz] = offsets[i - 1],
        [bnx, bnz] = offsets[i],
        length = Math.hypot(bx - ax, bz - az),
        steps = Math.ceil(length * 4);
      const at = (t: number, side: number) => {
        const x = ax + (bx - ax) * t + (anx + (bnx - anx) * t) * side,
          z = az + (bz - az) * t + (anz + (bnz - anz) * t) * side;
        return [x, ground(x, z) + rise, z] satisfies [number, number, number];
      };
      for (let j = 0; j < steps; j++)
        for (const side of [-1, 0]) {
          m.quad(
            at(j / steps, side),
            at(j / steps, side + 1),
            at((j + 1) / steps, side + 1),
            at((j + 1) / steps, side),
            color,
            'dirt',
          );
        }
    }
  }
  for (const cottage of VILLAGE_COTTAGES) drawBolinasCottage(m, cottage, ground);
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
