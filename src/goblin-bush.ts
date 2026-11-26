import type { Mesh } from './geometry.ts';

export const GOBLIN_BUSH = {
  id: 'goblin-bush',
  label: 'Bush',
  x: 50,
  z: -31,
  entry: { x: 48.5, y: -31.5 },
} as const;
export const GOBLIN_BUSH_GUARD = 'goblin-bush-guard';
export const GOBLIN_BUSH_ALLY = 'goblin-bush-ally';
export const GOBLIN_BUSH_AMBUSH = {
  [GOBLIN_BUSH_GUARD]: { x: 51.5, z: -31.5, line: 'Hey! That is my private property!' },
  [GOBLIN_BUSH_ALLY]: { x: 49.75, z: -33, line: 'Stop violating his private property rights!' },
} as const;
export const isGoblinBushAmbusher = (kind?: string): kind is keyof typeof GOBLIN_BUSH_AMBUSH =>
  kind === GOBLIN_BUSH_GUARD || kind === GOBLIN_BUSH_ALLY;
export const GOBLIN_BUSH_REWARDS = ['bush-hat', 'bush-top', 'bush-legs'] as const;

export const BUSH_COLORS = ['#435e32', '#627d3d', '#81934b'] as const;

export function drawBushFoliage(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  colors: readonly string[] = BUSH_COLORS,
) {
  m.sphere(x, y, z, rx * 0.84, ry * 0.86, rz * 0.84, colors[0], 10, 7);
  for (let i = 0; i < 7; i++) {
    const a = (i * 2 * Math.PI) / 7;
    m.sphere(
      x + Math.cos(a) * rx * 0.59,
      y + (i % 2 ? -0.18 : 0.24) * ry,
      z + Math.sin(a) * rz * 0.59,
      rx * 0.45,
      ry * 0.57,
      rz * 0.45,
      colors[i % 3],
      7,
      5,
    );
  }
  m.sphere(x - rx * 0.14, y + ry * 0.59, z, rx * 0.53, ry * 0.44, rz * 0.53, colors[2], 8, 5);
}
