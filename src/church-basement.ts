import { adventureSite } from './adventure-sites.ts';
import {
  BASEMENT_FURNITURE,
  BASEMENT_LANDING,
  CHURCH_BASEMENT,
  CHURCH_BASEMENT_ID,
  CHURCH_STAIRS_UP,
  CHURCH_STAIRWELL,
  basementFootprint,
  churchBasementPoint,
} from './church-basement-layout.ts';
import { pose, type Mesh } from './geometry.ts';
import {
  detachInstituteMesh,
  INSTITUTE_FLOOR_HEIGHT,
  recordInstitutePart,
} from './institute-interiors.ts';
import type { InteriorSection } from './types/interiors.ts';
import type { Site } from './types/world.ts';

type Rect = readonly [number, number, number, number];

function stairRails(m: Mesh, [left, back, right, front]: Rect, high: number, low: number) {
  for (const z of [back + 0.045, front - 0.045]) {
    for (const [x, y] of [
      [left + 0.07, high],
      [right - 0.07, low],
    ])
      m.rod([x, y, z], [x, y + 0.62, z], 0.044, '#59422e', 7, 'wood');
    m.rod(
      [left + 0.07, high + 0.62, z],
      [right - 0.07, low + 0.62, z],
      0.044,
      '#866343',
      8,
      'wood',
    );
  }
}

export function drawChurchStairwell(m: Mesh) {
  const { west, north, east, south } = CHURCH_STAIRWELL;
  const shaftTop = 0.23;
  const treads = 8;
  const run = (east - west) / treads;
  m.box(west, 0.016, north, east - west, 0.025, south - north, '#242226');
  for (let i = 1; i < treads; i++) {
    const x = west + run * i;
    const y = 0.048 + (shaftTop * i) / treads;
    m.box(x, y - 0.028, north + 0.07, run, 0.028, south - north - 0.14, '#69503c', 'wood');
    m.box(x, y, north + 0.065, 0.027, 0.014, south - north - 0.13, '#98704e', 'wood');
  }
  for (const z of [north - 0.05, south - 0.045])
    m.box(west - 0.04, 0.018, z, east - west + 0.09, 0.285, 0.095, '#a37d56', 'wood');
  m.box(west - 0.04, 0.018, north, 0.095, 0.285, south - north, '#a37d56', 'wood');
  stairRails(m, [west, north, east, south], 0.3, 0.3);
}

function drawBasementStairs(m: Mesh) {
  const stairs = BASEMENT_FURNITURE.stairs;
  const [left, back, right, front] = stairs;
  const count = 10;
  const run = (right - left) / count;
  const rise = 2.4 / count;
  for (let i = 0; i < count; i++) {
    const x = right - (i + 1) * run;
    const y = INSTITUTE_FLOOR_HEIGHT + (i + 1) * rise;
    m.box(x, 0, back, run + 0.01, y, front - back, '#675448', 'wood');
    m.box(x, y, back - 0.026, run + 0.041, 0.045, front - back + 0.052, '#9b724b', 'wood');
  }
  stairRails(m, stairs, 2.35, 0.12);
}

function drawGymEquipment(m: Mesh) {
  const steel = { metal: 0.66 };
  const x = 1.58;
  for (const z of [1.09, 2.82]) {
    m.box(x - 0.39, 0.022, z, 0.78, 0.065, 0.11, '#555053', steel);
    m.box(x - 0.047, 0.05, z, 0.094, 0.44, 0.105, '#5f5a5a', steel);
  }
  m.box(x - 0.26, 0.465, 1.02, 0.52, 0.11, 2.0, '#583939', 'canvasWeave');
  for (const side of [-1, 1]) {
    const support = x + 0.65 * side;
    m.box(support - 0.045, 0.02, 0.92, 0.09, 1.31, 0.12, '#685f5b', steel);
    m.box(support - 0.072, 1.24, 0.84, 0.144, 0.07, 0.25, '#444346', steel);
  }
  m.rod([x - 0.87, 1.327, 0.96], [x + 0.87, 1.327, 0.96], 0.025, '#a29c94', 10, steel);
  for (const dx of [-0.77, -0.64, 0.64, 0.77])
    m.rod(
      [x + dx - 0.045, 1.327, 0.96],
      [x + dx + 0.045, 1.327, 0.96],
      0.217,
      '#39363a',
      15,
      steel,
    );
  m.box(0.94, 0.37, 3.75, 2.4, 0.075, 0.58, '#514b47', steel);
  for (const u of [1.03, 3.18]) m.box(u, 0.02, 3.81, 0.11, 0.38, 0.44, '#665b50', steel);
  for (let i = 0; i < 5; i++) {
    const u = 1.2 + i * 0.43;
    m.rod([u - 0.14, 0.53, 4.01], [u + 0.14, 0.53, 4.01], 0.028, '#8d8580', 8, steel);
    for (const side of [-1, 1])
      m.rod(
        [u + 0.095 * side, 0.53, 4.01],
        [u + 0.145 * side, 0.53, 4.01],
        0.078 + i * 0.01,
        '#3d3b40',
        9,
        steel,
      );
  }
}

function drawCrate(m: Mesh, x: number, y: number, z: number, w: number, d: number) {
  m.box(x, y, z, w, 0.09, d, '#64503d', 'wood');
  for (const side of [z, z + d - 0.06]) {
    m.box(x, y + 0.06, side, w, 0.35, 0.06, '#966f49', 'wood');
    for (const dx of [0.1, w - 0.18])
      m.box(x + dx, y, side - 0.012, 0.08, 0.41, 0.085, '#6e5038', 'wood');
  }
  for (const edge of [x, x + w - 0.06]) m.box(edge, y + 0.06, z, 0.06, 0.35, d, '#806349', 'wood');
}

function drawSupplies(m: Mesh) {
  drawCrate(m, 10.74, 0.02, 0.72, 1.03, 0.91);
  for (let i = 0; i < 4; i++) {
    const x = 10.9 + i * 0.2;
    m.rod([x, 0.23 + 0.04 * (i % 2), 0.85], [x, 0.48 + 0.045 * i, 1.47], 0.086, '#c0c6c9', 11, {
      metal: 0.75,
    });
    m.sphere(x, 0.48 + 0.045 * i, 1.47, 0.052, 0.053, 0.04, '#a38864', 8, 6);
  }
  drawCrate(m, 11.85, 0.02, 0.72, 0.92, 0.87);
  drawCrate(m, 10.84, 0.02, 1.8, 1.63, 1.02);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) {
      const x = 11.04 + i * 0.29;
      const z = 1.99 + row * 0.48;
      const y = 0.17 + 0.045 * ((i + row) % 3);
      m.cylinder(x, y, z, 0.094, 0.31, '#b7a092', 10, 0.094, { metal: 0.68 });
      m.cylinder(x, y + 0.07, z, 0.099, 0.18, i % 2 ? '#bd8053' : '#99533d', 10);
      m.cylinder(x, y + 0.31, z, 0.1, 0.022, '#d2c3aa', 10, 0.1, { metal: 0.6 });
    }
}

function drawLantern(m: Mesh, x: number, y: number, z: number) {
  m.cylinder(x, y, z, 0.13, 0.066, '#59442e', 10);
  m.sphere(x, y + 0.195, z, 0.09, 0.13, 0.09, '#ffbf62', 12, 8, { emissive: 0.96 });
  m.cylinder(x, y + 0.32, z, 0.134, 0.079, '#624730', 10, 0.084);
  for (const dx of [-0.099, 0.099])
    for (const dz of [-0.066, 0.066])
      m.rod([x + dx, y + 0.057, z + dz], [x + dx, y + 0.33, z + dz], 0.011, '#483629', 6);
  m.rod([x - 0.063, y + 0.378, z], [x + 0.063, y + 0.378, z], 0.017, '#74543b', 7);
}

function drawGooseBlueprint(m: Mesh) {
  const [west, north, east, south] = BASEMENT_FURNITURE.table;
  const top = 0.91;
  m.box(west, top - 0.13, north, east - west, 0.13, south - north, '#785339', 'wood');
  for (const x of [west + 0.14, east - 0.29])
    for (const z of [north + 0.16, south - 0.32])
      m.box(x, 0.02, z, 0.16, top - 0.13, 0.16, '#523c2f', 'wood');
  const x = west + 0.29;
  const z = north + 0.21;
  m.box(x, top, z, 3.92, 0.016, 2.1, '#28506b', 'canvasWeave');
  const ink = (points: number[][], color = '#d4f0ea', width = 0.012) => {
    for (let i = 1; i < points.length; i++)
      m.rod(
        [x + points[i - 1][0], top + 0.022, z + points[i - 1][1]],
        [x + points[i][0], top + 0.022, z + points[i][1]],
        width,
        color,
        4,
        { emissive: 0.45 },
      );
  };
  for (let u = 0.18; u < 3.75; u += 0.2)
    ink(
      [
        [u, 0.12],
        [u, 1.97],
      ],
      '#598394',
      0.0035,
    );
  for (let v = 0.16; v < 1.97; v += 0.2)
    ink(
      [
        [0.12, v],
        [3.8, v],
      ],
      '#598394',
      0.0035,
    );
  ink(
    [
      [0.12, 0.12],
      [3.8, 0.12],
      [3.8, 1.97],
      [0.12, 1.97],
      [0.12, 0.12],
    ],
    '#94bbca',
    0.009,
  );
  // Side elevation, from the bill through the curved neck and down to the feet.
  ink([
    [0.32, 0.58],
    [0.61, 0.49],
    [0.73, 0.38],
    [0.9, 0.32],
    [1.07, 0.37],
    [1.14, 0.48],
    [1.06, 0.6],
    [1.06, 0.81],
    [1.21, 1.07],
    [1.49, 1.22],
    [1.83, 1.18],
    [2.29, 1.05],
    [2.8, 1.09],
    [3.17, 1.18],
    [3.59, 1.08],
    [3.33, 1.39],
    [2.93, 1.56],
    [2.52, 1.63],
    [1.82, 1.64],
    [1.46, 1.55],
    [1.16, 1.41],
    [0.99, 1.21],
    [0.87, 0.95],
    [0.8, 0.69],
    [0.62, 0.59],
    [0.32, 0.58],
  ]);
  ink([
    [0.36, 0.55],
    [0.63, 0.54],
    [0.75, 0.51],
  ]);
  ink([
    [0.81, 0.47],
    [0.855, 0.45],
    [0.88, 0.47],
    [0.855, 0.5],
    [0.81, 0.47],
  ]);
  ink([
    [1.46, 1.37],
    [1.8, 1.26],
    [2.29, 1.18],
    [2.73, 1.23],
    [3.21, 1.31],
    [2.75, 1.45],
    [2.27, 1.51],
    [1.79, 1.47],
    [1.46, 1.37],
  ]);
  for (let i = 0; i < 6; i++)
    ink(
      [
        [1.83 + i * 0.155, 1.29 - 0.005 * i],
        [2.18 + i * 0.13, 1.365],
        [2.52 + i * 0.092, 1.43],
      ],
      '#98c6d3',
      0.008,
    );
  ink(
    [
      [2.05, 1.63],
      [2.11, 1.76],
      [2.05, 1.84],
      [1.85, 1.87],
      [2.14, 1.89],
    ],
    '#bce1df',
  );
  ink(
    [
      [2.26, 1.63],
      [2.34, 1.77],
      [2.32, 1.87],
      [2.13, 1.92],
      [2.44, 1.92],
    ],
    '#bce1df',
  );
  for (const [edge, caption] of [
    [
      [0.95, 0.49],
      [1.5, 0.27],
    ],
    [
      [1.16, 0.92],
      [1.71, 0.61],
    ],
    [
      [2.48, 1.28],
      [2.88, 0.5],
    ],
  ]) {
    ink(
      [edge, [caption[0] - 0.2, caption[1]], caption, [caption[0] + 0.32, caption[1]]],
      '#82bfd0',
      0.006,
    );
    for (let line = 1; line <= 2; line++)
      ink(
        [
          [caption[0], caption[1] + line * 0.045],
          [caption[0] + 0.24, caption[1] + line * 0.045],
        ],
        '#98c6d3',
        0.006,
      );
  }
  drawLantern(m, west + 0.15, top, north + 0.18);
  drawLantern(m, east - 0.14, top, south - 0.18);
}

export function drawChurchBasement(m: Mesh) {
  const start = m.data.length;
  const { west, east, north, south, floor } = CHURCH_BASEMENT;
  const w = east - west;
  const d = south - north;
  const landing = { x: BASEMENT_LANDING.x - 0.5, y: BASEMENT_LANDING.z - 0.5 };
  const parts: InteriorSection[] = [];
  const detail = (id: string, label: string, description: string, x: number, z: number) => {
    const at = churchBasementPoint(x, z);
    return {
      id,
      section: id,
      kind: id,
      label,
      description,
      entry: { x: at.x - 0.5, y: at.z - 0.5 },
    };
  };
  const details = [
    {
      ...detail(
        CHURCH_STAIRS_UP,
        'Basement stairs',
        'The stairs lead back up to the chapel.',
        3.27,
        8.13,
      ),
      entry: landing,
    },
    detail('church-basement-gym', 'Gym equipment', "Someone's Getting Strong?", 4.23, 2.65),
    detail(
      'church-basement-blueprint',
      'Goose blueprint',
      'A measured side elevation of a goose, with its bill, neck, and wing picked out in white ink.',
      7.1,
      6.56,
    ),
    detail(
      'church-basement-supplies',
      'Tinfoil and beans',
      'Rolls of tinfoil and unlabelled tins of beans are stacked in open crates.',
      11.75,
      3.58,
    ),
  ] satisfies (Site & { section: string })[];
  const meshes = [drawBasementStairs, drawGymEquipment, drawGooseBlueprint, drawSupplies];
  pose(m, west, floor, north, 0, () => {
    recordInstitutePart(m, parts, 'floor', null, () => {
      m.box(0, -0.14, 0, w, 0.14 + INSTITUTE_FLOOR_HEIGHT, d, '#837369', 'stone');
      m.box(0.53, INSTITUTE_FLOOR_HEIGHT, 0.44, w - 1.06, 0.009, 0.06, '#a29176');
    });
    const walls = [
      [0, 0, w, 0.24],
      [0, d - 0.24, w, 0.24],
      [0, 0.24, 0.24, d - 0.48],
      [w - 0.24, 0.24, 0.24, d - 0.48],
    ];
    for (const [side, [x, z, width, depth]] of walls.entries())
      recordInstitutePart(m, parts, 'wall', side, () => {
        m.box(x, 0, z, width, 2.94, depth, '#9c8975', 'brick');
        m.box(x, 0.075, z, width, 0.16, depth, '#76645b', 'stone');
        m.box(x, 2.63, z, width, 0.18, depth, '#6e5846', 'wood');
        if (side === 0)
          for (const u of [1.48, 5.4, 8.95, 12.03]) {
            m.box(u - 0.14, 1.34, 0.234, 0.28, 0.053, 0.26, '#634f41', 'wood');
            drawLantern(m, u, 1.39, 0.39);
          }
      });
    details.forEach(({ section }, i) =>
      recordInstitutePart(m, parts, section, null, () => meshes[i](m)),
    );
    recordInstitutePart(m, parts, 'furniture', null, () => {
      // A floor lamp points down at the drafting table.
      m.cylinder(9.42, 0.015, 3.25, 0.18, 0.05, '#5c4b3b', 12, 0.18, { metal: 0.48 });
      m.rod([9.42, 0.06, 3.25], [9.42, 1.94, 3.25], 0.029, '#86745a', 9, { metal: 0.6 });
      m.rod([9.42, 1.94, 3.25], [8.95, 1.94, 3.58], 0.028, '#86745a', 9, { metal: 0.6 });
      m.cylinder(8.95, 1.69, 3.58, 0.19, 0.22, '#a3865e', 12, 0.07);
      m.sphere(8.95, 1.69, 3.58, 0.07, 0.038, 0.07, '#ffe7aa', 9, 6, { emissive: 0.95 });
    });
  });
  const site = adventureSite(m, start, {
    id: CHURCH_BASEMENT_ID,
    label: 'Unusual Church basement',
    kind: CHURCH_BASEMENT_ID,
    description: 'A lamplit stone room under the Unusual Church.',
    entry: landing,
    base: floor,
    enterableInstitute: true,
    navigationPolygons: Object.values(BASEMENT_FURNITURE).map(basementFootprint),
    details,
  });
  const spec = { id: CHURCH_BASEMENT_ID, x: west + w / 2, z: north + d / 2, w, d, base: floor };
  const interior = detachInstituteMesh(m, { start, end: m.data.length, parts, spec });
  return { ...site, count: m.data.length - start, interior };
}
