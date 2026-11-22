import { pose, type Mesh } from './geometry.ts';
import { GIRARD_HOME } from './girard-layout.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export function drawGirardHouse(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, west, east, north, south, house } = GIRARD_HOME;
  const { x, z, w, d } = house;
  const base = ground(x, z);
  const start = m.data.length;
  const foundation = 0.13;
  const eaves = 1.83;
  const ridge = 2.53;

  pose(m, x, base, z, 0, () => {
    m.box(
      -w / 2 - 0.04,
      -0.17,
      -d / 2 - 0.04,
      w + 0.08,
      foundation + 0.17,
      d + 0.08,
      '#a59b87',
      'stone',
    );
    m.box(-w / 2, foundation, -d / 2, w, eaves - foundation, d, '#dad0ae', 'cedar');
    const left = -w / 2 - 0.12;
    const right = w / 2 + 0.12;
    const edge = d / 2 + 0.13;
    const tiles = '#625047';
    m.quad(
      [left, eaves, -edge],
      [left, ridge, 0],
      [right, ridge, 0],
      [right, eaves, -edge],
      tiles,
      'roof',
    );
    m.quad(
      [left, ridge, 0],
      [left, eaves, edge],
      [right, eaves, edge],
      [right, ridge, 0],
      tiles,
      'roof',
    );
    m.tri([-w / 2, eaves, d / 2], [-w / 2, ridge, 0], [-w / 2, eaves, -d / 2], '#c4b791', 'cedar');
    m.tri([w / 2, eaves, -d / 2], [w / 2, ridge, 0], [w / 2, eaves, d / 2], '#c4b791', 'cedar');
    m.box(-1.18, 1.92, -0.38, 0.36, 0.73, 0.32, '#986e58', 'brick');
    m.box(-1.22, 2.64, -0.42, 0.44, 0.08, 0.4, '#716057', 'stone');

    const front = d / 2;
    m.box(-0.3, foundation, front, 0.6, 1.26, 0.055, '#586957', 'wood');
    m.sphere(0.2, 0.77, front + 0.068, 0.025, 0.025, 0.021, '#d6ac69', 7, 5);
    m.box(-0.79, -0.03, front - 0.01, 1.58, 0.13, 0.37, '#afa48d', 'stone');
    m.box(-0.77, 1.45, front, 1.54, 0.25, 0.048, '#6a5541', 'wood');
    drawPlaque(m, signs, name, 0, 1.49, front + 0.049, 1.45, 0.16);
    for (const chairX of [-1.28, 1.28]) {
      const chairY = ground(x + chairX, z + front + 0.26) - base;
      for (const leg of [-0.13, 0.1])
        for (const depth of [0.14, 0.36])
          m.box(chairX + leg, chairY, front + depth, 0.045, 0.32, 0.045, '#82725a', 'wood');
      m.box(chairX - 0.155, chairY + 0.3, front + 0.112, 0.31, 0.05, 0.3, '#826548', 'wood');
      for (const slat of [0.42, 0.52, 0.62])
        m.box(chairX - 0.147, chairY + slat, front + 0.135, 0.294, 0.058, 0.045, '#826548', 'wood');
      for (const back of [-0.13, 0.1])
        m.box(chairX + back, chairY + 0.32, front + 0.14, 0.043, 0.36, 0.043, '#82725a', 'wood');
    }
    for (const windowX of [-1.14, 1.14]) {
      m.box(windowX - 0.29, 0.89, front, 0.58, 0.59, 0.035, '#ede3bf', 'wood');
      m.box(windowX - 0.25, 0.925, front + 0.036, 0.5, 0.52, 0.008, '#648282');
      m.box(windowX - 0.013, 0.925, front + 0.045, 0.026, 0.52, 0.013, '#eae1c1', 'wood');
      m.box(windowX - 0.25, 1.175, front + 0.045, 0.5, 0.023, 0.013, '#eae1c1', 'wood');
      m.box(windowX - 0.31, 0.85, front + 0.005, 0.62, 0.046, 0.12, '#ad8660', 'wood');
    }
  });

  const fenceColor = '#826d4d';
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    for (const height of [0.28, 0.51])
      m.rod(
        [ax, ground(ax, az) + height, az],
        [bx, ground(bx, bz) + height, bz],
        0.035,
        fenceColor,
        6,
        'wood',
      );
    const posts = Math.ceil(length / 0.85);
    for (let i = 0; i <= posts; i++) {
      const xx = ax + ((bx - ax) * i) / posts;
      const zz = az + ((bz - az) * i) / posts;
      m.box(xx - 0.047, ground(xx, zz) - 0.04, zz - 0.047, 0.094, 0.65, 0.094, fenceColor, 'wood');
    }
  };
  const gateZ = 171.35,
    gateHalf = 0.77,
    westFenceEnd = 172.05,
    eastFenceEnd = 172.75;
  fence(west, north, east, north);
  fence(west, north, west, westFenceEnd);
  fence(east, north, east, gateZ - gateHalf);
  fence(east, gateZ + gateHalf, east, eastFenceEnd);

  const trough = { x: 54.22, z: 170.32, w: 1, d: 0.46 };
  const troughBase = ground(trough.x, trough.z);
  pose(m, trough.x, troughBase, trough.z, 0, () => {
    for (const leg of [-0.39, 0.33]) m.box(leg, -0.1, -0.17, 0.075, 0.31, 0.34, '#796348', 'wood');
    m.box(-0.5, 0.17, -0.23, 1, 0.14, 0.46, '#977551', 'wood');
    m.box(-0.41, 0.312, -0.15, 0.82, 0.008, 0.3, '#789c8e', { water: 0.5 });
  });

  // The adjoining side and the open gate both lead to the backyard.
  const rect = (x1: number, z1: number, x2: number, z2: number) => [
    [x1, z1],
    [x2, z1],
    [x2, z2],
    [x1, z2],
  ];
  let bottom = Infinity,
    top = -Infinity;
  for (let i = start + 1; i < m.data.length; i += 11) {
    bottom = Math.min(bottom, m.data[i]);
    top = Math.max(top, m.data[i]);
  }
  return {
    id,
    kind: id,
    label: name,
    start,
    count: m.data.length - start,
    description:
      'Two identical chairs sit out front. A goat wanders around the fenced backyard, past a wooden water trough.',
    entry: { x: x - 0.5, y: south - 0.5 },
    lo: [west - 0.06, bottom, north - 0.06],
    hi: [east + 0.06, top, south],
    navigationPolygons: [
      rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2 + 0.1),
      rect(west - 0.056, north - 0.056, east + 0.056, north + 0.056),
      rect(west - 0.056, north, west + 0.056, westFenceEnd),
      rect(east - 0.056, north, east + 0.056, gateZ - gateHalf),
      rect(east - 0.056, gateZ + gateHalf, east + 0.056, eastFenceEnd),
      rect(
        trough.x - trough.w / 2,
        trough.z - trough.d / 2,
        trough.x + trough.w / 2,
        trough.z + trough.d / 2,
      ),
    ],
  };
}
