import { drawGardenFlowers, drawShrub } from './garden-plants.ts';
import type { Mesh } from './geometry.ts';

// Shore bluff, sauna lawn, and grass verges around the west end of Berkeley.
const shrubs = [
  [117, -7, 0.37],
  [120, -5, 0.42],
  [117, -3, 0.34],
  [120, -1, 0.43],
  [132, -3, 0.32],
  [136, 0, 0.37],
  [133, 3, 0.31],
  [119, 2, 0.36],
  [122, 3, 0.42],
  [125, 4, 0.38],
  [118, 6, 0.33],
  [121, 6, 0.39],
  [129, 6, 0.33],
  [119, 8, 0.35],
  [122, 9, 0.47],
  [126, 11, 0.42],
  [132, 11, 0.34],
  [119, 12, 0.42],
  [120, 14, 0.45],
  [128, 14, 0.42],
  [133, 15, 0.33],
  [123, 17, 0.42],
  [129, 18, 0.37],
];

const flowerPatches = [
  [119, -8, 0.33],
  [118, -6, 0.49],
  [119, -4, 0.48],
  [135, -4, 0.34],
  [131, -2, 0.34],
  [122, -1, 0.46],
  [124, 1, 0.34],
  [132, 2, 0.32],
  [135, 2, 0.34],
  [123, 3, 0.34],
  [120, 4, 0.34],
  [128, 4, 0.34],
  [125, 5, 0.5],
  [128, 7, 0.34],
  [121, 9, 0.33],
  [130, 9, 0.34],
  [119, 10, 0.5],
  [123, 10, 0.34],
  [122, 12, 0.53],
  [129, 12, 0.34],
  [117, 14, 0.34],
  [131, 14, 0.34],
  [125, 15, 0.48],
  [120, 17, 0.49],
  [127, 17, 0.33],
];

const flowerColors = [
  ['#f2ad43', '#ed873d', '#f4c760'],
  ['#b783bc', '#9b84cb', '#f2d5e3'],
  ['#e8e1c7', '#df9f8f', '#f1c767'],
];

export function drawBerkeleyPlanting(m: Mesh, ground: (x: number, z: number) => number) {
  for (const [x, z, size] of shrubs) drawShrub(m, ground, x, z, size, x + z);
  for (const [i, [x, z, radius]] of flowerPatches.entries())
    drawGardenFlowers(
      m,
      ground,
      x,
      z,
      radius,
      radius * 0.78,
      flowerColors[i % flowerColors.length],
      Math.round(25 * radius) + 3,
    );
}
