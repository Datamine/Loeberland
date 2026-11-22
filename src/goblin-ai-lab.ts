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
  });
  return {
    id,
    kind: id,
    label: name,
    description:
      'A mud hut built around a steam engine. The Goblin Plumbers are hoping to teach it calculus.',
    entry,
    start,
    count: m.data.length - start,
    lo: [x - 2.3, foundation, z - 1.62],
    hi: [x + 2.3, base + 3.1, z + 1.7],
  };
}
