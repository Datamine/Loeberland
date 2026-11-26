import type { Mesh } from './geometry.ts';
import type { BuildingDefinition } from './types/buildings.ts';
import type { FacadeWindow } from './windows.ts';

export function rickWindow(
  side: number,
  {
    isX,
    plane,
    along,
    span,
    far,
    base,
  }: {
    isX: boolean;
    plane: number;
    along: number;
    span: number;
    far: boolean;
    base: number;
  },
): FacadeWindow {
  const front = side === 1;
  return {
    isX,
    plane,
    far,
    along: along + span * (front ? 0.11 : 0.18),
    y: base + (front ? 0.5 : 1.45),
    w: span * (front ? 0.22 : 0.64),
    h: front ? 1.23 : 0.28,
    trim: '#22282e',
    style: 'ribbon',
    transparent: true,
  };
}

export function drawRickEntrance(m: Mesh, b: BuildingDefinition, base: number, door: number) {
  const front = b.y + b.d;
  for (const x of [door - 0.13, door + 1])
    m.box(x, base, front, 0.13, 1.8, 0.19, '#464d55', 'granite');
  m.box(door - 0.13, base + 1.78, front, 1.26, 0.16, 0.42, '#666d75', 'granite');
  m.box(door - 0.09, base + 1.803, front + 0.421, 1.18, 0.026, 0.008, '#bbd9e1', {
    emissive: 0.36,
  });
  m.box(door - 0.12, base - 0.035, front, 1.24, 0.072, 0.19, '#525b61', 'granite');
}

export function drawRickRoof(m: Mesh, b: BuildingDefinition, y: number) {
  const { x, y: z, w, d } = b;
  m.box(x - 0.09, y, z - 0.08, w + 0.18, 0.065, d + 0.29, '#283039', 'granite');
  m.box(x - 0.13, y + 0.064, z - 0.08, w + 0.26, 0.16, d + 0.39, '#7c8286', 'granite');
  m.box(x + w * 0.57, y + 0.224, z + 0.18, w * 0.38, 0.11, d - 0.37, '#59616a', 'granite');
}

export function drawRickInterior(m: Mesh, b: BuildingDefinition, base: number) {
  const { x, y: z, w, d } = b;
  m.box(x + 0.1, base - 0.025, z + 0.1, w - 0.2, 0.028, d - 0.2, '#7c8388', 'granite');
  for (const offset of [0.33, 0.66])
    m.box(x + w * offset, base + 0.003, z + 0.12, 0.013, 0.004, d - 0.24, '#535a61');

  const pedestals = [
    { x: x + w - 1.26, z: z + 0.19, w: 1.05, d: 0.43, h: 0.66 },
    { x: x + 0.19, z: z + 0.25, w: 0.4, d: 0.82, h: 0.46 },
  ];
  for (const slab of pedestals) {
    m.box(slab.x, base, slab.z, slab.w, slab.h, slab.d, '#515960', 'granite');
    m.box(
      slab.x - 0.035,
      base + slab.h,
      slab.z - 0.035,
      slab.w + 0.07,
      0.055,
      slab.d + 0.07,
      '#a0a6aa',
      'granite',
    );
  }
  const scanPanel = pedestals[0];
  m.box(
    scanPanel.x + 0.19,
    base + scanPanel.h + 0.056,
    scanPanel.z + 0.13,
    0.64,
    0.013,
    0.16,
    '#222e35',
  );
  m.box(
    scanPanel.x + 0.24,
    base + scanPanel.h + 0.071,
    scanPanel.z + 0.19,
    0.48,
    0.005,
    0.023,
    '#a5d8df',
    { emissive: 0.45 },
  );
  b.interiorObstacles = pedestals.map((p) => [
    [p.x - 0.035, p.z - 0.035],
    [p.x + p.w + 0.035, p.z - 0.035],
    [p.x + p.w + 0.035, p.z + p.d + 0.035],
    [p.x - 0.035, p.z + p.d + 0.035],
  ]);
}
