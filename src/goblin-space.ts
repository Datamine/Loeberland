import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { RenderedSite, SignAtlas, Site } from './types/world.ts';
import { LAB_SIGN } from './berkeley-lab.ts';
import { drawCagedGoose } from './illuminati-models.ts';
import { HANGAR_GOOSE } from './map-instances.ts';
import {
  GOBLIN_SPACE_PROGRAM,
  MUD_BATH,
  VILLAGE_GOOSE,
  VILLAGE_POSTERS,
} from './goblin-space-layout.ts';

type Ground = (x: number, z: number) => number;

function finishSite(m: Mesh, start: number, site: Site): RenderedSite {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < m.data.length; i += 11)
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], m.data[i + axis]);
      hi[axis] = Math.max(hi[axis], m.data[i + axis]);
    }
  return { ...site, start, count: m.data.length - start, lo, hi };
}

export function drawVillageGoose(m: Mesh, ground: Ground): RenderedSite {
  const { x, z } = VILLAGE_GOOSE;
  const base = ground(x, z);
  const start = m.data.length;
  drawCagedGoose(m, x, base, z);
  return finishSite(m, start, { ...HANGAR_GOOSE, ...VILLAGE_GOOSE, base });
}

export function drawVillagePosters(m: Mesh, signs: SignAtlas, ground: Ground): RenderedSite {
  const { x, z } = VILLAGE_POSTERS;
  const base = ground(x, z);
  const start = m.data.length;
  pose(m, x, base, z, 0, () => {
    m.box(-0.43, -0.12, -0.34, 0.86, 0.47, 0.68, '#675146', 'wood');
    for (let i = 0; i < 8; i++)
      pose(m, 0, 0.35 + i * 0.009, 0, Math.sin(i * 2) * 0.09, () => {
        m.box(-0.34, 0, -0.26, 0.68, 0.009, 0.52, i % 2 ? '#dbd7cb' : '#eee9dc');
      });
    const uv = signs.get(LAB_SIGN);
    if (uv) {
      m.quad(
        [-0.315, 0.424, 0.236],
        [0.315, 0.424, 0.236],
        [0.315, 0.424, -0.236],
        [-0.315, 0.424, -0.236],
        '#474858',
      );
      m.quad(
        [-0.3, 0.425, 0.22],
        [0.3, 0.425, 0.22],
        [0.3, 0.425, -0.22],
        [-0.3, 0.425, -0.22],
        '#ffffff',
        uv,
      );
    }
  });
  return finishSite(m, start, {
    ...VILLAGE_POSTERS,
    kind: 'poster',
    label: 'Goose Corp posters',
    base,
    description: 'A stack of identical Goose Corp posters. Each one reads “Trust the Simulation.”',
  });
}

export function drawGoblinSpaceProgram(m: Mesh, signs: SignAtlas, ground: Ground): RenderedSite {
  const { x, z, id, name, entry } = GOBLIN_SPACE_PROGRAM;
  const base = ground(x, z);
  const start = m.data.length;
  pose(m, x, base, z, 0, () => {
    const finishes = ['#845c39', '#a37a4a', '#60462f', '#ba935d'];
    for (let i = 0; i < 13; i++) {
      const tier = Math.floor(i / 4);
      pose(m, (i % 4) * 0.26 - 0.38, tier * 0.14, (i % 3) * 0.27 - 0.26, i * 1.17, () => {
        m.box(
          -0.88 + tier * 0.08,
          0.01,
          -0.12,
          1.76 - tier * 0.16,
          0.14,
          0.24,
          finishes[i % 4],
          'wood',
        );
      });
    }
    for (const side of [-1, 1])
      m.rod([side * 0.23, 0.39, 0.47], [side * 0.23, 2.36, -0.19], 0.04, '#a77a4a', 6);
    for (let rung = 0; rung < 7; rung++) {
      const height = 0.59 + rung * 0.25;
      const depth = 0.47 - ((height - 0.39) * 0.66) / 1.97;
      m.rod([-0.24, height, depth], [0.24, height, depth], 0.029, '#bd975e', 6);
    }
    m.box(-1.1, -0.25, 0.88, 0.1, 0.9, 0.1, '#634426', 'wood');
    m.box(0.99, -0.25, 0.88, 0.1, 0.9, 0.1, '#634426', 'wood');
    m.box(-1.24, 0.37, 0.85, 2.48, 0.34, 0.12, '#422d24', 'wood');
    drawPlaque(m, signs, name, 0, 0.435, 0.973, 2.27, 0.21);
  });
  return finishSite(m, start, {
    id,
    label: name,
    kind: id,
    x,
    z,
    base,
    entry,
    description: 'A pile of planks and a short wooden ladder. The Moon remains quite far away.',
  });
}

export function drawMudBath(m: Mesh, signs: SignAtlas, ground: Ground): RenderedSite {
  const { x, z, id, name, entry } = MUD_BATH;
  const base = ground(x, z);
  const start = m.data.length;
  pose(m, x, base, z, 0, () => {
    const edge = (a: number, scale: number) => {
      const u = Math.cos(a) * 1.16 * scale,
        v = Math.sin(a) * 0.91 * scale;
      return [u, ground(x + u, z + v) - base, v] as [number, number, number];
    };
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n,
        b = ((i + 1) * Math.PI * 2) / n;
      const outer = edge(a, 1),
        outerNext = edge(b, 1);
      const inner = edge(a, 0.84),
        innerNext = edge(b, 0.84);
      inner[1] = innerNext[1] = 0.14;
      outer[1] += 0.015;
      outerNext[1] += 0.015;
      m.quad(inner, innerNext, outerNext, outer, ['#795342', '#87654b', '#8c6e52'][i % 3], 'dirt');
      m.tri([0, 0.14, 0], innerNext, inner, ['#685041', '#6b5344', '#6e5645'][i % 3], 'dirt');
      if (i % 2 === 0 && Math.cos(a) < 0.48) {
        const [u, y, v] = edge(a, 0.93);
        m.sphere(u, Math.max(y, 0.03) + 0.1, v, 0.14, 0.09, 0.11, '#8b867a', 7, 4);
      }
    }
    for (let i = 0; i < 10; i++) {
      const u = Math.sin(i * 2.4) * 0.63,
        v = Math.cos(i * 2.4) * 0.58;
      m.sphere(u, 0.142, v, 0.025 + (i % 3) * 0.014, 0.017, 0.031, '#98745c', 7, 4);
    }
    const boardGround = ground(x - 0.63, z + 0.93) - base;
    m.box(-0.7, boardGround - 0.1, 0.88, 0.1, 0.77, 0.09, '#70533a', 'wood');
    m.box(-1.08, boardGround + 0.48, 0.86, 0.87, 0.23, 0.11, '#644430', 'wood');
    drawPlaque(m, signs, name, -0.645, boardGround + 0.53, 0.974, 0.78, 0.13);
  });
  return finishSite(m, start, {
    id,
    label: name,
    kind: id,
    x,
    z,
    base,
    entry,
    description: 'A shallow mud bath. Sit in it to collect one mud every five seconds.',
  });
}
