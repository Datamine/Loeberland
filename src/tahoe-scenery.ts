import { rand, type Mesh } from './geometry.ts';

// Small faceted crowns and erratics keep silhouette detail within the terrain budget.
function drawClump(
  mesh: Mesh,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  color: string,
  seed: number,
  stone = false,
) {
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 + seed;
    const variation = 0.8 + 0.32 * rand(seed, i + 6);
    return {
      lower: [x + Math.cos(a) * rx * variation, y - ry * 0.29, z + Math.sin(a) * rz * variation],
      upper: [
        x + Math.cos(a + 0.23) * rx * 0.66,
        y + ry * (0.43 + variation * 0.2),
        z + Math.sin(a + 0.23) * rz * 0.66,
      ],
    };
  });
  const top = [x + rx * 0.14, y + ry, z - rz * 0.12];
  const bottom = [x, y - ry * 0.75, z];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const material = stone ? 'stone' : null;
    mesh.quad(b.lower, a.lower, a.upper, b.upper, color, material);
    mesh.tri(b.upper, a.upper, top, color, material);
    mesh.tri(a.lower, b.lower, bottom, color, material);
  }
}

export function drawTahoeTree(
  mesh: Mesh,
  { x, z, h, seed, aspen }: { x: number; z: number; h: number; seed: number; aspen: boolean },
) {
  const scale = 0.7 + rand(seed, 31) * 0.85;
  const height = (aspen ? 2.7 : 3.7) * scale;
  mesh.cylinder(x, h - 0.04, z, 0.075 * scale, height, aspen ? '#c7bdab' : '#66523e', 7, 0.03);
  if (aspen) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + seed;
      const xx = x + Math.cos(a) * scale * 0.29;
      const zz = z + Math.sin(a) * scale * 0.29;
      const yy = h + height * (0.66 + rand(seed, i + 41) * 0.29);
      mesh.rod([x, h + height * 0.49, z], [xx, yy, zz], scale * 0.029, '#b4a994', 6);
      drawClump(
        mesh,
        xx,
        yy,
        zz,
        0.38 * scale,
        0.47 * scale,
        0.37 * scale,
        ['#8a9b60', '#a9ac62', '#c1a460'][i % 3],
        seed + i,
      );
    }
    return;
  }
  const fir = rand(seed, 13) > 0.53;
  for (let i = 0; i < 4; i++) {
    const y = h + scale * (0.53 + i * 0.72);
    const radius = scale * (fir ? 0.73 - i * 0.134 : 0.88 - i * 0.18);
    const lean = Math.sin(seed + i) * 0.09 * scale;
    const greens = fir ? ['#405e54', '#4d7160', '#557a6a'] : ['#465f4a', '#547355', '#648361'];
    mesh.cylinder(
      x + lean,
      y,
      z - lean / 2,
      radius,
      scale * (fir ? 1.54 : 1.07),
      greens[i % 3],
      9,
      0,
    );
    if (h > 37 && i > 0)
      mesh.cylinder(
        x + lean,
        y + scale * (fir ? 0.42 : 0.28),
        z - lean / 2,
        radius * 0.78,
        scale * (fir ? 1.16 : 0.82),
        '#d9e5de',
        9,
        0,
      );
  }
}

export function drawTahoeGroundCover(
  mesh: Mesh,
  x: number,
  y: number,
  z: number,
  seed: number,
  rocky: boolean,
) {
  const s = 0.45 + rand(seed, 27) * 0.96;
  if (rocky) {
    drawClump(mesh, x, y + s * 0.15, z, s * 0.6, s * 0.32, s * 0.49, '#a4a79e', seed, true);
    drawClump(
      mesh,
      x + s * 0.49,
      y + s * 0.055,
      z - s * 0.23,
      s * 0.29,
      s * 0.16,
      s * 0.24,
      '#858d80',
      seed + 1,
      true,
    );
    return;
  }
  const greens = ['#697b54', '#7d8a54', '#8d9061'];
  for (let j = 0; j < 3; j++) {
    const direction = j * 2.4 + seed;
    const xx = x + Math.cos(direction) * s * 0.17;
    const zz = z + Math.sin(direction) * s * 0.18;
    drawClump(mesh, xx, y + s * 0.15, zz, s * 0.19, s * 0.2, s * 0.16, greens[j], seed + j);
    if (seed % 6 === 0) mesh.sphere(xx, y + s * 0.32, zz, 0.04, 0.043, 0.04, '#8e7da5', 6, 4);
  }
}
