import { pose, rand, type Mesh } from './geometry.ts';
import type { WorldObject } from './types/world.ts';

interface StreetBlock {
  id: string;
  kind: string;
  a: readonly number[];
  b: readonly number[];
}

interface Flag {
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
}

export function planNeighborhoodFlags(
  blocks: readonly StreetBlock[],
  buildings: readonly Pick<WorldObject, 'arch' | 'rotation' | 'houses'>[],
) {
  const frontages = blocks
    .filter((block) => block.kind === 'road')
    .map(({ id, a, b }) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return {
        id,
        a,
        length,
        ux: (b[0] - a[0]) / length,
        uz: (b[1] - a[1]) / length,
        rank: rand((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 272),
      };
    });
  const candidates = new Map<string, { flag: Flag; houseRank: number; blockRank: number }>();
  for (const building of buildings) {
    if (building.arch !== 'townhomes') continue;
    const angle = building.rotation ?? 0;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    for (const house of building.houses ?? []) {
      if (!house.frontWindow) continue;
      const { x, y, z, width } = house.frontWindow;
      let closest: (typeof frontages)[number] | undefined;
      let best = 3;
      // A corner house belongs to the block its front window faces.
      for (const block of frontages) {
        const dx = x - block.a[0];
        const dz = z - block.a[1];
        const along = dx * block.ux + dz * block.uz;
        const offset = dz * block.ux - dx * block.uz;
        const facing = sin * block.uz + cos * block.ux;
        if (
          along < 0 ||
          along >= block.length ||
          offset * facing >= 0 ||
          Math.abs(facing) < 0.9 ||
          Math.abs(offset) >= best
        )
          continue;
        best = Math.abs(offset);
        closest = block;
      }
      if (!closest) continue;
      const houseRank = rand(x, z, 271);
      const previous = candidates.get(closest.id);
      if (previous && previous.houseRank <= houseRank) continue;
      candidates.set(closest.id, {
        houseRank,
        blockRank: closest.rank,
        flag: {
          x,
          y: y - 0.12,
          z,
          angle,
          width: Math.min(0.56, width * 1.15),
        },
      });
    }
  }
  return [...candidates.values()]
    .sort((a, b) => a.blockRank - b.blockRank)
    .slice(0, Math.round(candidates.size / 6))
    .map(({ flag }) => flag);
}

export function drawNeighborhoodFlag(mesh: Mesh, { x, y, z, angle, width }: Flag) {
  const height = width * 0.57;
  pose(mesh, x, y, z, angle, (m) => {
    const front = 0.245;
    const edge = width / 2 + 0.02;
    const pole = '#b7b8ae';
    m.rod([-edge, 0, 0], [-edge, 0, front], 0.012, pole, 5);
    m.rod([edge, 0, 0], [edge, 0, front], 0.012, pole, 5);
    m.rod([-edge, 0, front], [edge, 0, front], 0.012, pole, 6);

    const canton = 0.4;
    const point = (u: number, v: number, lift = 0) => [
      (u - 0.5) * width,
      -v * height,
      front + v * 0.035 * Math.sin(u * 2 * Math.PI) + lift,
    ];
    const panel = (left: number, top: number, right: number, bottom: number, color: string) =>
      m.quad(point(left, top), point(left, bottom), point(right, bottom), point(right, top), color);
    for (let stripe = 0; stripe < 13; stripe++) {
      const top = stripe / 13;
      const bottom = (stripe + 1) / 13;
      const color = stripe % 2 ? '#faf5ea' : '#bf2539';
      panel(0, top, canton, bottom, stripe < 7 ? '#294377' : color);
      panel(canton, top, 0.72, bottom, color);
      panel(0.72, top, 1, bottom, color);
    }
    for (let row = 0; row < 9; row++) {
      const count = row % 2 ? 5 : 6;
      for (let col = 0; col < count; col++) {
        const u = (canton * (col + (row % 2 ? 1 : 0.5))) / 6;
        const v = ((row + 0.5) * 7) / (9 * 13);
        m.quad(
          point(u, v - 0.019, 0.015),
          point(u - 0.009, v, 0.015),
          point(u, v + 0.019, 0.015),
          point(u + 0.009, v, 0.015),
          '#faf5ea',
        );
      }
    }
  });
}
