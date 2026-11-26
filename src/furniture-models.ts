import { pose, type Mesh } from './geometry.ts';

function drawSofaCushion(m: Mesh, x: number, y: number, z: number, pitch: number) {
  const profile: [number, number][] = [
    [0.178, -0.064],
    [0.208, -0.041],
    [0.208, 0.041],
    [0.173, 0.068],
  ];
  const sides = 16;
  const vertex = (radius: number, height: number, segment: number) => {
    const a = (segment * Math.PI * 2) / sides;
    const depth = Math.sin(a) * radius;
    return [
      x + Math.cos(a) * radius,
      y + height * Math.cos(pitch) + depth * Math.sin(pitch),
      z - height * Math.sin(pitch) + depth * Math.cos(pitch),
    ];
  };
  for (let i = 0; i < sides; i++) {
    for (let j = 1; j < profile.length; j++)
      m.quad(
        vertex(...profile[j - 1], i + 1),
        vertex(...profile[j - 1], i),
        vertex(...profile[j], i),
        vertex(...profile[j], i + 1),
        j === 2 ? '#a83130' : '#cc4a44',
      );
    m.tri(vertex(0, 0.073, i), vertex(0.173, 0.068, i + 1), vertex(0.173, 0.068, i), '#cd4742');
    m.tri(vertex(0, -0.064, i), vertex(0.178, -0.064, i), vertex(0.178, -0.064, i + 1), '#87322e');
  }
}

export function drawMarshmallowSofa(m: Mesh, x: number, y: number, z: number, angle: number) {
  pose(m, x, y, z, angle, () => {
    const steel = '#797b7b';
    for (const side of [-0.83, 0.83]) {
      m.rod([side, 0.04, 0.34], [side, 0.47, 0.22], 0.026, '#292a2b', 8);
      m.rod([side, 0.04, -0.42], [side, 0.44, -0.29], 0.026, '#292a2b', 8);
      m.rod([side, 0.44, -0.29], [side, 1.13, -0.53], 0.027, steel, 8);
      m.rod([side, 0.44, -0.29], [side, 0.47, 0.3], 0.028, steel, 8);
    }
    // The seat and back each have two staggered rows of individual discs.
    for (const { count, height, depth, pitch } of [
      { count: 4, height: 0.51, depth: 0.3, pitch: 0 },
      { count: 5, height: 0.49, depth: -0.09, pitch: 0 },
      { count: 5, height: 0.76, depth: -0.4, pitch: -1.3 },
      { count: 4, height: 1.14, depth: -0.51, pitch: -1.3 },
    ]) {
      const frameDepth = depth - (pitch ? 0.085 : 0);
      const frameY = height - (pitch ? 0.024 : 0.082);
      m.rod([-0.88, frameY, frameDepth], [0.88, frameY, frameDepth], 0.024, steel, 8);
      for (let i = 0; i < count; i++)
        drawSofaCushion(m, (i - (count - 1) / 2) * 0.436, height, depth, pitch);
    }
  });
}

export function drawOvaliaChair(m: Mesh, x: number, y: number, z: number, angle: number) {
  pose(m, x, y, z, angle, () => {
    const aluminum = { metal: 0.85 };
    m.cylinder(0, 0.02, -0.1, 0.43, 0.04, '#a9adae', 24, 0.41, aluminum);
    m.cylinder(0, 0.06, -0.1, 0.41, 0.12, '#bfc4c4', 24, 0.12, aluminum);
    m.cylinder(0, 0.18, -0.1, 0.12, 0.16, '#a4a9aa', 16, 0.14, aluminum);
    // Taper the crown and keep the mouth open so the upholstery sits inside the egg.
    const point = (theta: number, azimuth: number, scale: number) => {
      const u = Math.sin(theta) * Math.sin(azimuth);
      return [
        Math.sin(theta) * Math.cos(azimuth) * (0.68 - 0.1 * u) * scale,
        1.12 + u * 0.91 * scale,
        Math.cos(theta) * 0.64 * scale - 0.09 - 0.13 * u,
      ];
    };
    const rim = 1.12;
    const outer = { metal: 0.22 };
    for (let ring = 0; ring < 14; ring++)
      for (let side = 0; side < 28; side++) {
        const a = rim + ((Math.PI - rim) * ring) / 14;
        const b = rim + ((Math.PI - rim) * (ring + 1)) / 14;
        const c = (side * Math.PI * 2) / 28;
        const d = ((side + 1) * Math.PI * 2) / 28;
        m.quad(point(a, c, 1), point(b, c, 1), point(b, d, 1), point(a, d, 1), '#622448', outer);
        m.quad(
          point(a, d, 0.916),
          point(b, d, 0.916),
          point(b, c, 0.916),
          point(a, c, 0.916),
          '#702f54',
          'canvasWeave',
        );
        if (ring === 0)
          m.quad(
            point(a, c, 1),
            point(a, d, 1),
            point(a, d, 0.916),
            point(a, c, 0.916),
            '#91425f',
            outer,
          );
      }
    m.sphere(0, 0.54, 0.025, 0.43, 0.098, 0.41, '#963e64', 18, 8, 'canvasWeave');
    m.sphere(0, 1.03, -0.44, 0.39, 0.48, 0.11, '#873552', 18, 10, 'canvasWeave');
  });
}
