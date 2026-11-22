import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import {
  CONSTRUCTION_SITE,
  CONSTRUCTION_PAY_INTERVAL,
  CONSTRUCTION_SHIFT_SECONDS,
  CONSTRUCTION_COOLDOWN_MS,
} from './construction-layout.ts';
import type { Actor, RenderedSite, RuntimeDialogue, SignAtlas } from './types/world.ts';

export function constructionForemanDialogue(npc: Actor, start: () => void): RuntimeDialogue {
  return {
    ...npc,
    contentResolved: true,
    intro:
      'Grab a hammer at the workbench. You earn one coin every ' +
      CONSTRUCTION_PAY_INTERVAL +
      ' seconds while you work, even if you step away from the keyboard. ' +
      'You can stop and pick up where you left off. After ' +
      CONSTRUCTION_SHIFT_SECONDS / 60 +
      ' minutes of work, take a ' +
      CONSTRUCTION_COOLDOWN_MS / 60_000 +
      '-minute break.',
    choices: [{ label: 'Start work', accept: () => ({ ok: true, after: start }) }],
    decline: 'Leave',
  };
}

export function drawConstructionSite(
  mesh: Mesh,
  signs: SignAtlas,
  ground: (x: number, z: number) => number,
): RenderedSite {
  const { id, name, west, east, north, south, work } = CONSTRUCTION_SITE;
  const start = mesh.data.length;
  const timber = '#ba8650';
  const rect = (left: number, back: number, right: number, front: number) => [
    [left, back],
    [right, back],
    [right, front],
    [left, front],
  ];

  // Bare earth follows the hillside and stays within the green between the streets.
  const patches = Math.ceil((south - north) / 0.5);
  for (let i = 0; i < patches; i++)
    for (let j = 0; j < 8; j++) {
      const at = (u: number, v: number) => {
        const x = west + ((east - west) * u) / 8;
        const z = north + ((south - north) * v) / patches;
        return [x, ground(x, z) + 0.035, z];
      };
      mesh.quad(at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i), '#9c7958', 'dirt');
    }

  const left = west + 0.12,
    right = east - 1.68,
    back = north + 0.42,
    front = north + 4.0,
    width = right - left,
    depth = front - back;
  const corners = rect(left, back, right, front).map(([x, z]) => ground(x, z));
  const slab = Math.max(...corners) + 0.04;
  const foundation = Math.min(...corners) - 0.1;
  const floor = slab + 0.09;
  const eaves = floor + 1.5;
  const ridge = eaves + 0.56;
  mesh.box(left, foundation, back, width, slab - foundation, depth, '#94948e', 'stone');
  for (let i = 0; i < 12; i++) {
    const plank = width / 12;
    mesh.box(
      left + i * plank,
      slab,
      back,
      plank - 0.01,
      0.09,
      depth,
      i % 3 === 0 ? '#9e6f46' : '#b7895a',
      'wood',
    );
  }
  for (const z of [back + 0.06, front - 0.06]) {
    mesh.box(left, eaves - 0.07, z - 0.055, width, 0.095, 0.11, timber, 'wood');
    for (let i = 0; i <= 7; i++) {
      if (z > back + 0.06 && (i === 3 || i === 4)) continue;
      const x = left + 0.05 + ((width - 0.17) * i) / 7;
      mesh.box(x, floor, z - 0.047, 0.079, 1.46, 0.094, timber, 'wood');
    }
  }
  for (const x of [left + 0.06, right - 0.06]) {
    mesh.box(x - 0.04, eaves - 0.072, back, 0.09, 0.096, depth, timber, 'wood');
    for (const z of [back + 0.95, front - 0.95])
      mesh.box(x - 0.039, floor, z, 0.078, 1.46, 0.081, timber, 'wood');
  }
  const centerZ = (front + back) / 2;
  for (let i = 0; i < 8; i++) {
    const x = left + 0.07 + ((width - 0.14) * i) / 7;
    const peak = [x, ridge, centerZ];
    mesh.rod([x, eaves, back - 0.06], peak, 0.044, timber, 4, 'wood');
    mesh.rod(peak, [x, eaves, front + 0.06], 0.044, timber, 4, 'wood');
  }
  mesh.box(left, ridge - 0.03, centerZ - 0.028, width, 0.09, 0.056, timber, 'wood');
  for (let i = 0; i < 6; i++)
    mesh.box(left + 0.06, floor + i * 0.214, back, 1.06, 0.208, 0.043, '#98663f', 'wood');

  const benchX = work.x - 0.5;
  pose(mesh, benchX, ground(benchX, work.z), work.z, -Math.PI / 2, () => {
    for (const x of [-0.47, 0.39])
      for (const z of [-0.11, 0.11]) mesh.box(x, -0.08, z, 0.072, 0.86, 0.072, '#795438', 'wood');
    mesh.box(-0.55, 0.77, -0.18, 1.1, 0.073, 0.36, '#b78d61', 'wood');
    mesh.box(-0.39, 0.843, -0.055, 0.78, 0.05, 0.11, '#d4ab72', 'wood');
  });
  pose(mesh, right + 0.04, floor, centerZ, -Math.PI / 2, () => {
    mesh.box(-0.67, 1.21, -0.034, 1.34, 0.29, 0.07, '#634e36', 'wood');
    drawPlaque(mesh, signs, name, 0, 1.265, 0.04, 1.25, 0.15);
  });

  const stockpile = { x: west + 0.35, z: south - 2.4, w: 1.85, d: 1.95 };
  const pileCorners = rect(
    stockpile.x,
    stockpile.z,
    stockpile.x + stockpile.w,
    stockpile.z + stockpile.d,
  ).map(([x, z]) => ground(x, z));
  const pileBase = Math.max(...pileCorners) + 0.04;
  const pileFoot = Math.min(...pileCorners) - 0.04;
  for (const dx of [0.12, 1.55])
    mesh.box(
      stockpile.x + dx,
      pileFoot,
      stockpile.z,
      0.14,
      pileBase - pileFoot,
      1.95,
      '#83684b',
      'wood',
    );
  for (let row = 0; row < 5; row++)
    for (let i = 0; i < 4 - Math.floor(row / 2); i++)
      mesh.box(
        stockpile.x + 0.06 + row * 0.13 + i * 0.4,
        pileBase + row * 0.077,
        stockpile.z + (i % 2) * 0.06,
        0.35,
        0.065,
        1.84,
        row % 2 ? '#ad8056' : '#be965f',
        'wood',
      );

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < mesh.data.length; i += 11)
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], mesh.data[i + axis]);
      hi[axis] = Math.max(hi[axis], mesh.data[i + axis]);
    }
  return {
    id,
    kind: id,
    label: name,
    entry: { x: work.x - 0.5, y: work.z - 0.5 },
    start,
    count: mesh.data.length - start,
    description: 'A house frame under construction, with a workbench and stacks of lumber.',
    lo,
    hi,
    navigationPolygons: [
      rect(left, back - 0.07, right + 0.08, front + 0.07),
      rect(benchX - 0.18, work.z - 0.55, benchX + 0.18, work.z + 0.55),
      rect(stockpile.x, stockpile.z, stockpile.x + stockpile.w, stockpile.z + stockpile.d),
    ],
  };
}
