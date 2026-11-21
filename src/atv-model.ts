import { pose, type Mesh } from './geometry.ts';
import { drawCharacter, type CharacterAppearance } from './characters.ts';

export function drawATV(m: Mesh, x: number, y: number, z: number, angle: number) {
  pose(m, x, y, z, angle, () => {
    const steel = { metal: 0.72 };
    m.box(-0.64, 0.25, -0.24, 1.29, 0.22, 0.48, '#44494a', steel);
    m.box(-0.38, 0.45, -0.25, 0.8, 0.23, 0.5, '#c48327');
    m.box(-0.48, 0.67, -0.205, 0.69, 0.11, 0.41, '#292c2d', 'asphalt');
    m.box(0.31, 0.53, -0.24, 0.45, 0.22, 0.48, '#997046');
    for (const end of [-1, 1])
      for (const side of [-1, 1]) {
        const axle = end * 0.57,
          wheel = side * 0.42;
        m.rod([axle, 0.262, 0], [axle, 0.262, wheel], 0.055, '#686f71', 8, steel);
        m.rod(
          [axle, 0.262, wheel - 0.11],
          [axle, 0.262, wheel + 0.11],
          0.258,
          '#292d2d',
          18,
          'asphalt',
        );
        m.rod([axle, 0.262, wheel], [axle, 0.262, side * 0.55], 0.126, '#b7a792', 12, steel);
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const u = axle + Math.cos(a) * 0.246,
            v = 0.262 + Math.sin(a) * 0.246;
          m.rod([u, v, wheel - 0.11], [u, v, wheel + 0.11], 0.026, '#383c39', 5);
        }
        m.box(axle - 0.26, 0.527, wheel - 0.18, 0.52, 0.088, 0.36, '#be7526');
        m.box(
          end * 0.77 - 0.025,
          0.575,
          side * 0.178 - 0.05,
          0.06,
          0.08,
          0.1,
          end > 0 ? '#f5e7a4' : '#c34b35',
          { emissive: 0.3 },
        );
      }
    m.rod([0.42, 0.65, 0], [0.24, 1.02, 0], 0.031, '#909a9b', 8, steel);
    m.rod([0.23, 1.02, -0.33], [0.23, 1.02, 0.33], 0.027, '#343837', 8, steel);
    for (const side of [-1, 1]) {
      m.rod([-0.83, 0.69, side * 0.29], [-0.4, 0.69, side * 0.29], 0.022, '#4a4c46', 7, steel);
      m.box(-0.33, 0.34, side * 0.28 - 0.08, 0.52, 0.04, 0.16, '#474846', steel);
    }
  });
}

export function drawATVRider(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  angle: number,
  roll: number,
  look: CharacterAppearance,
) {
  const start = m.data.length;
  drawATV(m, x, y, z, angle);
  drawCharacter(m, x, z, y + 0.16, angle, 0, false, look.skin, look.shirt, {
    ...look,
    mode: 'motorcycle',
    motion: 0,
    cpuSkinning: true,
    railgun: false,
    akibo: false,
    battleaxe: false,
    rollingPin: false,
    bayonet: false,
    phone: false,
  });
  if (!roll) return;
  const c = Math.cos(roll),
    s = Math.sin(roll),
    sx = -Math.sin(angle),
    sz = Math.cos(angle);
  for (let i = start; i < m.data.length; i += 11) {
    const side = (m.data[i] - x) * sx + (m.data[i + 2] - z) * sz;
    const vertical = m.data[i + 1] - y - 0.36;
    const shift = side * c - vertical * s - side;
    m.data[i] += shift * sx;
    m.data[i + 1] = y + 0.36 + vertical * c + side * s;
    m.data[i + 2] += shift * sz;
    const normal = m.data[i + 3] * sx + m.data[i + 5] * sz;
    const dy = m.data[i + 4];
    const shiftNormal = normal * c - dy * s - normal;
    m.data[i + 3] += shiftNormal * sx;
    m.data[i + 4] = dy * c + normal * s;
    m.data[i + 5] += shiftNormal * sz;
  }
}
