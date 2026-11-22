import { pose, rand, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';

export const GOBLIN_AI_LAB = {
  id: 'goblin-ai-lab',
  name: 'Goblin AI Lab',
  x: 39,
  z: -24,
  width: 4,
  depth: 2.8,
  entry: { x: 38.5, y: -22 },
};

const SCRAP_BAY = { x: 2.78, z: -0.18, width: 1.56, depth: 2 };

export function goblinAILabScrapBlocks(x: number, z: number) {
  return (
    Math.abs(x - GOBLIN_AI_LAB.x - SCRAP_BAY.x) < SCRAP_BAY.width / 2 + 0.15 &&
    Math.abs(z - GOBLIN_AI_LAB.z - SCRAP_BAY.z) < SCRAP_BAY.depth / 2 + 0.15
  );
}

export const GOBLIN_PLUMBERS = [
  {
    id: 'goblin-plumber-boiler',
    x: 37.65,
    z: -21.7,
    line: 'One day this boiler will power an AI that can solve a really difficult integral. Today we taught it to hold pressure.',
  },
  {
    id: 'goblin-plumber-pipes',
    x: 40.6,
    z: -21.9,
    line: 'I want an AI that can solve the triple integrals nobody in the village will touch. I’m fitting the third pipe now.',
  },
];

export function drawGoblinAILab(
  m: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, x, z, width, depth, entry } = GOBLIN_AI_LAB;
  const halfWidth = width / 2,
    halfDepth = depth / 2,
    base = ground(x, z + halfDepth),
    foundation =
      Math.min(
        ...[-halfWidth, halfWidth].flatMap((dx) =>
          [-halfDepth, halfDepth].map((dz) => ground(x + dx, z + dz)),
        ),
      ) - 0.18,
    start = m.data.length;
  const iron = { metal: 0.72 },
    brass = { metal: 0.52 },
    mud = '#926747';
  pose(m, x, base, z, 0, () => {
    const roofHeight = (offset: number) => 2.54 - (Math.abs(offset) * 0.75) / (halfWidth + 0.22);
    m.box(
      -halfWidth,
      foundation - base,
      -halfDepth,
      width,
      base - foundation + 0.12,
      depth,
      '#765b43',
      'dirt',
    );
    m.box(-halfWidth, 0.12, -halfDepth, width, 1.69, 0.27, mud, 'dirt');
    for (const side of [-1, 1]) {
      const wall = side * (halfWidth - 0.16);
      m.box(wall - 0.16, 0.12, -halfDepth, 0.32, 1.7, depth, mud, 'dirt');
      for (let i = 0; i < 12; i++) {
        const y = 0.24 + 1.45 * rand(i, side + 17),
          offset = 0.1 + 0.24 * rand(i, side + 29);
        m.sphere(
          side * (halfWidth - offset),
          y,
          halfDepth - 0.035,
          0.09,
          0.075,
          0.046,
          i % 2 ? '#bd9870' : '#7b573c',
          7,
          5,
        );
      }
      const eave = side * (halfWidth + 0.22);
      const roof = [
        [eave, 1.79, -1.58],
        [0, 2.54, -1.58],
        [0, 2.54, 1.62],
        [eave, 1.79, 1.62],
      ];
      if (side < 0) roof.reverse();
      m.quad(roof[0], roof[1], roof[2], roof[3], '#736643', 'wood');
      m.rod([eave, 1.78, 1.61], [0, 2.53, 1.61], 0.07, '#523d2c', 8);
    }
    m.tri([-halfWidth, 1.77, 1.58], [halfWidth, 1.77, 1.58], [0, 2.49, 1.58], mud);
    m.box(-1.04, 1.75, 1.6, 2.08, 0.32, 0.09, '#69452d', 'wood');
    drawPlaque(m, signs, name, 0, 1.79, 1.698, 1.98, 0.24);

    // Patch the wooden roof with strips cut from whatever sheet metal was on hand.
    for (const [left, right, north, south, color] of [
      [-1.96, -1.28, -1.46, -0.22, '#7a8076'],
      [-0.92, -0.38, -0.38, 0.71, '#a27459'],
      [0.78, 1.53, -1.2, -0.3, '#7f8a7f'],
      [1.2, 2.16, 0.36, 1.47, '#87664f'],
    ] as const) {
      const panel = (dx: number, dz: number) => [dx, roofHeight(dx) + 0.025, dz];
      m.quad(
        panel(left, north),
        panel(left, south),
        panel(right, south),
        panel(right, north),
        color,
        iron,
      );
      for (let rib = left + 0.09; rib < right - 0.03; rib += 0.16)
        m.rod(panel(rib, north), panel(rib, south), 0.022, color, 5, iron);
    }
    const mast = [0.72, roofHeight(0.72), -0.71];
    m.rod(mast, [0.82, 3.48, -0.67], 0.035, '#625849', 7, iron);
    m.rod([0.29, 3.33, -0.91], [1.32, 3.47, -0.36], 0.025, '#695345', 6, iron);
    for (let i = 0; i < 3; i++) {
      const dx = 0.47 + i * 0.32,
        y = 3.355 + i * 0.043,
        dz = -0.81 + i * 0.17;
      m.rod([dx - 0.16, y, dz + 0.28], [dx + 0.16, y, dz - 0.28], 0.018, '#897f71', 5, iron);
    }

    // A riveted firebox, handwheel and exposed flywheel face the open front.
    const boilerA = [-0.65, 0.73, -0.96],
      boilerB = [-0.65, 0.73, 0.66];
    m.box(-1.32, 0.12, -1.05, 2.65, 0.24, 2.04, '#45413a', 'brick');
    m.rod(boilerA, boilerB, 0.57, '#41484a', 20, iron);
    for (const z of [-0.7, 0.16, 0.57])
      m.rod([-0.65, 0.73, z], [-0.65, 0.73, z + 0.08], 0.59, '#856646', 20, brass);
    m.rod(boilerB, [-0.65, 0.73, 0.76], 0.34, '#2d2b29', 16, iron);
    m.box(-0.91, 0.48, 0.76, 0.52, 0.13, 0.05, '#dd6e29');
    for (const x of [-0.88, -0.77, -0.66, -0.55, -0.44])
      m.rod([x, 0.47, 0.83], [x, 0.62, 0.83], 0.025, '#39332a', 6, iron);
    m.rod([-0.65, 1.19, -0.56], [-0.65, 3, -0.56], 0.17, '#51433b', 14, iron);
    m.rod([-0.65, 2.94, -0.56], [-0.65, 3.09, -0.56], 0.22, '#302f2a', 14, iron);

    const wheelX = 0.73,
      wheelY = 0.81,
      wheelZ = 0.84;
    const rim = (angle: number) => [
      wheelX + 0.58 * Math.cos(angle),
      wheelY + 0.58 * Math.sin(angle),
      wheelZ,
    ];
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12;
      m.rod(rim(angle), rim(angle + Math.PI / 12), 0.054, '#a05439', 7, iron);
      if (i % 4 === 0) m.rod([wheelX, wheelY, wheelZ], rim(angle), 0.032, '#96553d', 7, iron);
    }
    m.rod([wheelX, wheelY, -0.47], [wheelX, wheelY, 0.99], 0.12, '#545959', 12, iron);
    m.rod([-0.65, 1.25, 0.11], [0.73, 1.25, 0.11], 0.075, '#b18345', 10, brass);
    m.rod([0.73, 1.25, 0.11], [0.73, 0.8, 0.11], 0.075, '#b18345', 10, brass);
    m.rod([-0.35, 1.39, 0.11], [-0.35, 1.39, 0.21], 0.145, '#9c784b', 16, brass);
    m.rod([-0.35, 1.39, 0.21], [-0.35, 1.39, 0.24], 0.115, '#e4d4aa', 16);
    m.rod([-0.35, 1.39, 0.248], [-0.29, 1.46, 0.248], 0.013, '#4d3529', 6);

    // The salvaged switchboard is propped against the front wall beside the flywheel.
    m.box(1.37, 0.12, 0.37, 0.3, 1.3, 0.62, '#605242', 'wood');
    m.box(1.27, 0.8, 0.92, 0.52, 0.61, 0.13, '#4a6258', iron);
    m.box(1.34, 1.14, 1.05, 0.38, 0.19, 0.015, '#27352f');
    for (let i = 0; i < 3; i++) {
      const dx = 1.39 + i * 0.135;
      m.sphere(dx, 1.23, 1.065, 0.034, 0.035, 0.026, ['#8fab6c', '#cead56', '#9d6145'][i], 7, 5);
      m.rod([dx, 0.99, 1.048], [dx + 0.032, 1.02, 1.11], 0.018, '#b28e5e', 6, brass);
    }
    for (let i = 0; i < 3; i++) {
      const dz = 1.02 + i * 0.093;
      m.rod([-1.56, 0.185, dz], [-1.08 + i * 0.065, 0.185, dz + 0.025], 0.039, '#866049', 7, iron);
    }

    const floor = (dx: number, dz: number) => ground(x + dx, z + dz) - base;
    const tankX = SCRAP_BAY.x - 0.09,
      tankZ = SCRAP_BAY.z - 0.54,
      tankY = floor(tankX, tankZ);
    m.cylinder(tankX, tankY - 0.13, tankZ, 0.33, 1.45, '#6b7769', 14, 0.33, iron);
    m.sphere(tankX, tankY + 1.31, tankZ, 0.33, 0.18, 0.33, '#778677', 14, 8, iron);
    for (const height of [0.07, 0.86, 1.23])
      m.cylinder(tankX, tankY + height, tankZ, 0.345, 0.065, '#92674b', 14, 0.345, iron);
    const pipeY = tankY + 1.72;
    m.rod([tankX, tankY + 1.39, tankZ], [tankX, pipeY, tankZ], 0.058, '#ba8660', 10, brass);
    m.rod([tankX + 0.02, pipeY, tankZ], [1.94, pipeY, tankZ], 0.058, '#ba8660', 10, brass);
    m.sphere(tankX, pipeY, tankZ, 0.071, 0.071, 0.071, '#ba8660', 10, 6, brass);
    m.rod(
      [tankX, tankY + 1.04, tankZ + 0.329],
      [tankX, tankY + 1.04, tankZ + 0.4],
      0.11,
      '#a38051',
      12,
      brass,
    );
    m.rod(
      [tankX, tankY + 1.04, tankZ + 0.4],
      [tankX, tankY + 1.04, tankZ + 0.412],
      0.087,
      '#ded1ad',
      12,
    );
    m.rod(
      [tankX, tankY + 1.04, tankZ + 0.418],
      [tankX - 0.046, tankY + 1.072, tankZ + 0.418],
      0.009,
      '#463e32',
      6,
    );

    // Barrels, a cable reel, and a crate of pipe offcuts clutter the side of the hut.
    for (const [dx, dz, height, color] of [
      [3.25, 0.09, 0.55, '#a06343'],
      [2.32, 0.15, 0.39, '#747664'],
    ] as const) {
      const y = floor(dx, dz);
      m.cylinder(dx, y - 0.08, dz, 0.263, height + 0.08, color, 12, 0.263, iron);
      for (const band of [0.04, height - 0.055])
        m.cylinder(dx, y + band, dz, 0.275, 0.035, '#514b42', 12, 0.275, iron);
    }
    const crateY = floor(2.77, 0.6);
    m.box(2.53, crateY - 0.13, 0.42, 0.57, 0.32, 0.39, '#765336', 'wood');
    m.box(2.57, crateY + 0.19, 0.46, 0.49, 0.014, 0.31, '#4e3a2d', 'wood');
    for (let i = 0; i < 4; i++)
      m.rod(
        [2.59 + 0.11 * i, crateY + 0.23, 0.49],
        [2.62 + 0.11 * i, crateY + 0.32 + i * 0.048, 0.72],
        0.039,
        i % 2 ? '#965a3c' : '#686967',
        8,
        iron,
      );
    const reelY = floor(3.27, -0.63) + 0.22;
    m.rod([3.16, reelY, -0.63], [3.34, reelY, -0.63], 0.175, '#785641', 12, brass);
    for (const dx of [3.13, 3.34])
      m.rod([dx, reelY, -0.63], [dx + 0.042, reelY, -0.63], 0.22, '#846345', 12, 'wood');
  });
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < m.data.length; i += 11)
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], m.data[i + axis]);
      hi[axis] = Math.max(hi[axis], m.data[i + axis]);
    }
  return {
    id,
    kind: id,
    label: name,
    description:
      'A mud hut full of salvage, with a steam engine wired to a salvaged switchboard. The Goblin Plumbers are hoping to teach it calculus.',
    entry,
    start,
    count: m.data.length - start,
    lo,
    hi,
  };
}
