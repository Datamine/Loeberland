import type { Mesh } from './geometry.ts';

export function drawGoblinHelmet(
  m: Mesh,
  y: number,
  scale: number,
  [shell, rim, spike]: readonly [string, string, string],
  reinforced = false,
) {
  const metal = { metal: 0.65 };
  m.sphere(
    0,
    y + 0.01 * scale,
    0,
    0.254 * scale,
    0.18 * scale,
    0.222 * scale,
    shell,
    16,
    10,
    metal,
  );
  m.sphere(
    0,
    y,
    0,
    0.262 * scale,
    (reinforced ? 0.047 : 0.033) * scale,
    0.228 * scale,
    rim,
    16,
    8,
    metal,
  );
  m.sphere(
    0,
    y - 0.015 * scale,
    0.193 * scale,
    0.207 * scale,
    0.025 * scale,
    0.112 * scale,
    shell,
    16,
    8,
    metal,
  );
  m.sphere(
    0,
    y - 0.027 * scale,
    -0.153 * scale,
    0.22 * scale,
    0.036 * scale,
    0.116 * scale,
    shell,
    16,
    8,
    metal,
  );
  m.cylinder(0, y + 0.177 * scale, 0, 0.069 * scale, 0.023 * scale, rim, 12, 0.059 * scale, metal);
  m.cylinder(0, y + 0.2 * scale, 0, 0.045 * scale, 0.113 * scale, spike, 12, 0.003 * scale, metal);
  if (reinforced)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      m.sphere(
        Math.sin(a) * 0.259 * scale,
        y,
        Math.cos(a) * 0.227 * scale,
        0.018 * scale,
        0.018 * scale,
        0.018 * scale,
        spike,
        8,
        5,
        metal,
      );
    }
}
