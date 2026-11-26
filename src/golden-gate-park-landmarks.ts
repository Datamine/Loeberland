import { cross, pose, rand, sub, unit, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { Vec2, Vec3 } from './types/geometry.ts';
import type { SignAtlas } from './types/world.ts';

const copper = { metal: 0.24 };
const copperColors = ['#825044', '#93624e', '#9e6b53', '#885e4e', '#956451', '#745341'];
const glazing = { glass: 0.34 };
const paintedWood = '#f3edda';
const shadedWood = '#c4ccbd';

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function copperScreen(m: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, seed: number) {
  const width = Math.hypot(...sub(b, a));
  const height = Math.hypot(...sub(d, a));
  const normal = unit(cross(sub(d, a), sub(b, a)));
  const at = (u: number, v: number, offset: number): Vec3 => {
    const p = mix(mix(a, b, u), mix(d, c, u), v);
    return [p[0] + normal[0] * offset, p[1] + normal[1] * offset, p[2] + normal[2] * offset];
  };
  const patch = (u: number, v: number, w: number, h: number, color: string, offset: number) =>
    m.quad(
      at(u, v, offset),
      at(u, v + h, offset),
      at(u + w, v + h, offset),
      at(u + w, v, offset),
      color,
      copper,
    );

  m.quad(at(0, 0, -0.03), at(0, 1, -0.03), at(1, 1, -0.03), at(1, 0, -0.03), '#513d34', copper);
  const panels = Math.ceil(width / 0.16);
  const courses = Math.ceil(height / 0.22);
  const seamX = 0.0014 / width;
  const seamY = 0.0014 / height;
  for (let y = 0; y < courses; y++)
    for (let x = 0; x < panels; x++) {
      const color = copperColors[Math.floor(rand(x, y, seed) * copperColors.length)];
      patch(
        x / panels + seamX,
        y / courses + seamY,
        1 / panels - 2 * seamX,
        1 / courses - 2 * seamY,
        color,
        0.001,
      );
    }

  // Groups of different-sized marks give the copper the rhythm of a perforated screen.
  const columns = Math.ceil(width / 0.033);
  const rows = Math.ceil(height / 0.032);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const u = (x + 0.45 + 0.26 * (y % 2)) / columns;
      const v = (y + 0.5) / rows;
      const density = 0.45 + 0.22 * Math.sin(15 * u + 22 * v + seed) * Math.cos(11 * u - 13 * v);
      if (rand(x + 13, y, seed) > density) continue;
      const radius = 0.0035 + 0.003 * rand(x, y + 5, seed);
      patch(
        u - radius / width,
        v - radius / height,
        (2 * radius) / width,
        (2 * radius) / height,
        rand(x, y, seed + 9) < 0.8 ? '#47382f' : '#bc8d67',
        0.002,
      );
    }
}

function deYoungTower(m: Mesh) {
  const ring = (y: number, halfWidth: number, halfDepth: number, turn: number, shift: number) =>
    (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] satisfies Vec2[]
    ).map(([x, z]): Vec3 => [
      0.51 + shift + x * halfWidth * Math.cos(turn) - z * halfDepth * Math.sin(turn),
      y,
      -0.04 + x * halfWidth * Math.sin(turn) + z * halfDepth * Math.cos(turn),
    ]);
  const profiles = [
    ring(0.58, 0.205, 0.195, -0.08, -0.018),
    ring(1.35, 0.207, 0.194, 0.04, 0.012),
    ring(2.19, 0.222, 0.202, 0.27, 0.032),
    ring(2.55, 0.242, 0.212, 0.48, 0.039),
  ];
  for (let level = 1; level < profiles.length; level++)
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      const lower = profiles[level - 1],
        upper = profiles[level];
      copperScreen(m, lower[side], lower[next], upper[next], upper[side], 7 + side + level * 7);
    }

  const windowBase = profiles.at(-1)!;
  const windowTop = ring(2.82, 0.249, 0.22, 0.51, 0.039);
  const cap = ring(2.93, 0.258, 0.228, 0.51, 0.039);
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    m.quad(
      windowBase[side],
      windowTop[side],
      windowTop[next],
      windowBase[next],
      '#334641',
      'glass',
    );
    m.quad(windowTop[side], cap[side], cap[next], windowTop[next], '#946752', copper);
    m.rod(windowBase[side], windowBase[next], 0.014, '#987763', 4, copper);
    for (let i = 0; i < 6; i++)
      m.rod(
        mix(windowBase[side], windowBase[next], i / 6),
        mix(windowTop[side], windowTop[next], i / 6),
        0.007,
        '#54463d',
        4,
        copper,
      );
  }
  m.quad(cap[0], cap[3], cap[2], cap[1], '#a88065', copper);
}

export function drawDeYoungMuseum(m: Mesh, signs: SignAtlas, x: number, base: number, z: number) {
  pose(m, x, base, z, 0, () => {
    m.box(-0.985, -0.06, -0.48, 1.97, 0.14, 0.965, '#9e9786', 'stone');
    // A glazed entrance and recessed ground floor run under the three copper roof bands.
    m.box(-0.92, 0.08, -0.425, 1.83, 0.38, 0.695, '#574b3e');
    m.box(-0.46, 0.115, 0.264, 0.81, 0.278, 0.013, '#395452', 'glass');
    for (let i = 0; i <= 8; i++)
      m.box(-0.466 + 0.102 * i, 0.11, 0.276, 0.012, 0.29, 0.014, '#afa58d', copper);
    m.box(-0.49, 0.089, 0.27, 0.88, 0.022, 0.138, '#c3b8a3', 'stone');
    m.box(-0.59, 0.08, 0.282, 0.07, 0.38, 0.07, '#6e6253');
    m.box(0.42, 0.08, 0.257, 0.07, 0.36, 0.07, '#6e6253');
    const galleries = [
      {
        roof: [
          [-0.986, -0.455],
          [-0.438, -0.47],
          [-0.426, 0.317],
          [-0.66, 0.399],
          [-0.982, 0.321],
        ],
        low: 0.351,
        high: 0.61,
      },
      {
        roof: [
          [-0.41, -0.491],
          [0.34, -0.42],
          [0.407, 0.416],
          [-0.21, 0.493],
          [-0.453, 0.365],
        ],
        low: 0.405,
        high: 0.715,
      },
      {
        roof: [
          [0.365, -0.47],
          [0.977, -0.399],
          [0.984, 0.248],
          [0.824, 0.39],
          [0.44, 0.32],
        ],
        low: 0.378,
        high: 0.675,
      },
    ];
    for (const [seed, { roof, low, high }] of galleries.entries()) {
      for (let side = 0; side < roof.length; side++) {
        const [ax, az] = roof[side],
          [bx, bz] = roof[(side + 1) % roof.length];
        copperScreen(
          m,
          [ax, low, az],
          [bx, low, bz],
          [bx, high, bz],
          [ax, high, az],
          2 + side + 7 * seed,
        );
      }
      for (let i = 1; i < roof.length - 1; i++)
        m.tri(
          [roof[0][0], high, roof[0][1]],
          [roof[i + 1][0], high, roof[i + 1][1]],
          [roof[i][0], high, roof[i][1]],
          '#a07d66',
          copper,
        );
    }
    for (const [sx, sy, sz, length] of [
      [-0.9, 0.61, -0.305, 0.36],
      [-0.31, 0.715, -0.18, 0.49],
      [-0.26, 0.715, 0.03, 0.46],
      [0.665, 0.675, 0.105, 0.238],
    ]) {
      m.box(sx, sy, sz, length, 0.033, 0.073, '#785d4b', copper);
      m.box(sx + 0.015, sy + 0.033, sz + 0.012, length - 0.03, 0.011, 0.049, '#546c66', 'glass');
    }
    m.box(-0.24, 0.32, 0.276, 0.44, 0.069, 0.021, '#443c35', copper);
    drawPlaque(m, signs, 'de Young', -0.02, 0.336, 0.299, 0.36, 0.041);
    deYoungTower(m);
  });
}

function greenhouseWing(m: Mesh, start: number, end: number) {
  const back = -0.39,
    front = 0.273,
    spring = 0.433,
    ridge = 0.293;
  const bays = 5,
    segments = 10;
  const at = (bay: number, arc: number): Vec3 => {
    const theta = (Math.PI * arc) / segments;
    return [
      start + ((end - start) * bay) / bays,
      spring + Math.sin(theta) * ridge,
      (front + back) / 2 + (Math.cos(theta) * (front - back)) / 2,
    ];
  };
  for (let bay = 0; bay < bays; bay++)
    for (let arc = 0; arc < segments; arc++) {
      const hue = (bay + arc) % 3;
      const glass = ['#cfdfd7', '#b4cbbf', '#d8e7db'][hue];
      m.quad(
        at(bay, arc),
        at(bay + 1, arc),
        at(bay + 1, arc + 1),
        at(bay, arc + 1),
        glass,
        glazing,
      );
    }
  for (let bay = 0; bay <= bays; bay++) {
    const x = at(bay, 0)[0];
    for (let arc = 0; arc < segments; arc++)
      m.rod(at(bay, arc), at(bay, arc + 1), 0.009, paintedWood, 4);
    for (const z of [back, front]) {
      m.box(x - 0.008, 0.098, z - 0.008, 0.016, spring - 0.098, 0.016, paintedWood);
      if (bay === bays) continue;
      const next = at(bay + 1, 0)[0];
      const wall: [Vec3, Vec3, Vec3, Vec3] = [
        [x, 0.11, z],
        [next, 0.11, z],
        [next, spring, z],
        [x, spring, z],
      ];
      if (z === back) wall.reverse();
      m.quad(...wall, '#abc9ba', glazing);
    }
  }
  for (const arc of [0, 2, 5, 8, 10])
    m.rod(at(0, arc), at(bays, arc), arc === 5 ? 0.013 : 0.008, paintedWood, 5);
  for (const z of [back, front]) {
    m.box(start, 0.093, z - 0.01, end - start, 0.038, 0.02, shadedWood);
    m.box(start, 0.248, z - 0.008, end - start, 0.014, 0.016, paintedWood);
    m.box(start, spring - 0.015, z - 0.016, end - start, 0.027, 0.032, paintedWood);
  }

  // Close both ends with glazed arches and vertical glazing bars.
  for (const bay of [0, bays]) {
    const x = at(bay, 0)[0];
    const center: Vec3 = [x, 0.112, (front + back) / 2];
    for (let arc = 0; arc < segments; arc++) {
      const a = at(bay, arc),
        b = at(bay, arc + 1);
      m.tri(center, bay ? b : a, bay ? a : b, '#abc4b8', glazing);
      if (arc % 2 === 0) m.rod([x, 0.11, a[2]], a, 0.008, paintedWood, 4);
    }
    m.tri(center, [x, 0.112, front], [x, spring, front], '#c1d4c4', glazing);
    m.tri(center, [x, spring, back], [x, 0.112, back], '#c1d4c4', glazing);
  }
}

function palmHouse(m: Mesh) {
  const dome = [
    [0.323, 0.687],
    [0.321, 0.9],
    [0.294, 0.951],
    [0.277, 0.994],
    [0.26, 1.091],
    [0.229, 1.17],
    [0.175, 1.227],
    [0.101, 1.267],
    [0.069, 1.281],
  ];
  const sectors = 16;
  const at = (band: number, i: number): Vec3 => {
    const [radius, y] = dome[band];
    const angle = (i * Math.PI * 2) / sectors;
    return [radius * Math.sin(angle), y, -0.052 + radius * Math.cos(angle)];
  };
  for (let band = 1; band < dome.length; band++)
    for (let i = 0; i < sectors; i++) {
      const a = at(band - 1, i),
        b = at(band - 1, i + 1);
      const c = at(band, i + 1),
        d = at(band, i);
      m.quad(a, b, c, d, (i + band) % 3 ? '#c5d9cf' : '#e0ebe0', glazing);
      m.rod(a, d, i % 2 ? 0.007 : 0.011, paintedWood, 4);
      if ([1, 2, 4, 6, 8].includes(band)) m.rod(d, c, band < 3 ? 0.013 : 0.007, paintedWood, 4);
    }

  m.cylinder(0, 1.277, -0.052, 0.085, 0.037, paintedWood, 10, 0.063);
  m.cylinder(0, 1.314, -0.052, 0.045, 0.09, '#99b8ad', 8);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    m.cylinder(
      0.046 * Math.cos(a),
      1.319,
      -0.052 + 0.046 * Math.sin(a),
      0.008,
      0.086,
      paintedWood,
      5,
    );
  }
  m.cylinder(0, 1.401, -0.052, 0.067, 0.049, paintedWood, 10, 0.025);
  m.rod([0, 1.436, -0.052], [0, 1.572, -0.052], 0.01, paintedWood, 6);
  m.sphere(0, 1.538, -0.052, 0.021, 0.022, 0.021, '#c1a573', 8, 4);
}

function conservatoryPlants(m: Mesh) {
  for (const [x, z, height] of [
    [-0.79, -0.09, 0.49],
    [-0.5, -0.1, 0.43],
    [0.77, -0.06, 0.48],
    [0.48, -0.12, 0.45],
    [0.055, -0.06, 0.94],
  ]) {
    m.rod([x, 0.13, z], [x - 0.025, height, z], 0.018, '#6f7250', 5);
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const length = 0.075 + height * 0.09;
      const dx = Math.cos(a) * length,
        dz = Math.sin(a) * length;
      const root: Vec3 = [x - 0.025, height, z];
      const tip: Vec3 = [root[0] + dx, height - 0.025, z + dz];
      m.quad(
        root,
        [root[0] + dx * 0.5 + dz * 0.27, height + 0.038, z + dz * 0.5 - dx * 0.27],
        tip,
        [root[0] + dx * 0.5 - dz * 0.27, height + 0.029, z + dz * 0.5 + dx * 0.27],
        i % 2 ? '#758b4f' : '#476c4d',
      );
    }
  }
}

export function drawConservatory(m: Mesh, signs: SignAtlas, x: number, base: number, z: number) {
  pose(m, x, base, z, 0, () => {
    m.box(-0.984, -0.06, -0.449, 1.968, 0.155, 0.831, '#a4aa96', 'stone');
    m.box(-0.966, 0.08, -0.41, 1.932, 0.047, 0.745, paintedWood);
    greenhouseWing(m, -0.955, -0.294);
    greenhouseWing(m, 0.294, 0.955);
    conservatoryPlants(m);
    const front = 0.285,
      back = -0.389;
    for (const z of [front, back]) {
      m.quad(
        [-0.302, 0.12, z],
        [0.302, 0.12, z],
        [0.302, 0.72, z],
        [-0.302, 0.72, z],
        '#c4d7cc',
        glazing,
      );
      m.box(-0.324, 0.67, z - 0.018, 0.648, 0.064, 0.036, paintedWood);
      for (const dx of [-0.303, -0.212, -0.133, 0, 0.133, 0.212, 0.303])
        m.box(dx - 0.011, 0.121, z - 0.013, 0.022, 0.56, 0.026, paintedWood);
    }
    for (const x of [-0.302, 0.302]) {
      m.quad(
        [x, 0.4, back],
        [x, 0.4, front],
        [x, 0.72, front],
        [x, 0.72, back],
        '#bfcec6',
        glazing,
      );
      m.box(x - 0.018, 0.67, back, 0.036, 0.064, front - back, paintedWood);
    }
    palmHouse(m);

    // A projecting entrance with a pediment, divided fanlight, and shallow stone steps.
    m.box(-0.209, -0.025, 0.332, 0.418, 0.077, 0.155, '#a4a591', 'stone');
    m.box(-0.184, 0.044, 0.317, 0.368, 0.067, 0.132, '#d4d0ba', 'stone');
    m.box(-0.145, 0.11, 0.296, 0.29, 0.37, 0.066, '#4d685d', 'glass');
    for (const dx of [-0.154, 0, 0.154])
      m.box(dx - 0.012, 0.107, 0.35, 0.024, 0.43, 0.045, paintedWood);
    m.box(-0.163, 0.432, 0.388, 0.326, 0.041, 0.018, shadedWood);
    m.tri([-0.195, 0.509, 0.414], [0.195, 0.509, 0.414], [0, 0.681, 0.414], paintedWood);
    m.quad(
      [-0.202, 0.513, 0.416],
      [0, 0.69, 0.416],
      [0, 0.69, 0.268],
      [-0.202, 0.513, 0.268],
      shadedWood,
    );
    m.quad(
      [0, 0.69, 0.268],
      [0, 0.69, 0.416],
      [0.202, 0.513, 0.416],
      [0.202, 0.513, 0.268],
      paintedWood,
    );
    m.rod([-0.196, 0.513, 0.419], [0, 0.687, 0.419], 0.014, paintedWood, 5);
    m.rod([0, 0.687, 0.419], [0.196, 0.513, 0.419], 0.014, paintedWood, 5);
    m.box(-0.149, 0.514, 0.414, 0.298, 0.061, 0.01, '#687969');
    drawPlaque(m, signs, 'Conservatory', 0, 0.53, 0.426, 0.27, 0.027);
    m.sphere(0, 0.608, 0.419, 0.039, 0.033, 0.008, '#92b6aa', 10, 4);
    m.rod([-0.031, 0.608, 0.428], [0.031, 0.608, 0.428], 0.004, paintedWood, 4);
    m.rod([0, 0.58, 0.428], [0, 0.637, 0.428], 0.004, paintedWood, 4);

    for (const side of [-1, 1]) {
      const bed = side * 0.61;
      m.box(bed - 0.32, 0.094, 0.344, 0.64, 0.034, 0.125, '#78834f');
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 13; i++) {
          const xx = bed - 0.279 + i * 0.046 + 0.012 * rand(i, row);
          const zz = 0.363 + row * 0.038;
          const hue = (row + Math.floor(i / 4)) % 3;
          const flower = ['#db6956', '#f1c559', '#b97aa1'][hue];
          const height = 0.141 + 0.014 * rand(i, row, 2);
          m.tri(
            [xx - 0.018, height - 0.004, zz - 0.006],
            [xx + 0.018, height, zz - 0.009],
            [xx, height + 0.004, zz + 0.016],
            flower,
          );
          m.tri(
            [xx, height - 0.014, zz + 0.014],
            [xx, height + 0.012, zz],
            [xx - 0.013, height - 0.012, zz - 0.012],
            flower,
          );
        }
    }
  });
}
