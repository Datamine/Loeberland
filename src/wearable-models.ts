import type { CharacterAppearance } from './characters.ts';
import { Mesh } from './geometry.ts';
import { heldMeleeWeapon } from './melee-weapon-models.ts';
import { rigidCharacterMesh } from './rendering/character-gpu.ts';

let heldRailgunMesh: number[] | null = null,
  gooseCostumeMesh: { body: number[]; hood: number[] } | null = null,
  decorativeRocketMesh: number[] | null = null,
  clockSecond: number | null = null,
  clockData: number[] | null = null,
  flameFrame: number | null = null,
  flameData: number[] | null = null;
const wearablePalette = new Float32Array(17 * 4);

function gooseCostume() {
  if (gooseCostumeMesh) return gooseCostumeMesh;
  const body = new Mesh(),
    hood = new Mesh();
  body.sphere(0, 1.07, 0.02, 0.33, 0.36, 0.25, '#f2eee4', 18, 12);
  body.sphere(0, 1.03, -0.23, 0.18, 0.14, 0.24, '#ebe6d8', 14, 8);
  for (const side of [-1, 1])
    body.sphere(side * 0.27, 1.1, -0.03, 0.11, 0.24, 0.19, '#fffdf5', 12, 8);
  hood.sphere(0, 1.74, -0.02, 0.169, 0.21, 0.161, '#fffdf5', 18, 12);
  hood.sphere(0, 1.7, 0.15, 0.093, 0.044, 0.125, '#ed913e', 14, 8);
  for (const side of [-1, 1])
    hood.sphere(side * 0.107, 1.8, 0.101, 0.023, 0.026, 0.021, '#383233', 10, 6);
  return (gooseCostumeMesh = { body: body.data, hood: hood.data });
}

function railgunMesh() {
  if (heldRailgunMesh) return heldRailgunMesh;
  const m = new Mesh();
  // Built in the right hand's bind pose, with the muzzle along character forward.
  m.box(0.165, 0.73, -0.11, 0.16, 0.14, 0.65, '#4c626b', { metal: 0.45 });
  for (const x of [0.128, 0.327])
    m.box(x, 0.76, 0.07, 0.035, 0.045, 0.72, '#9cbabd', { metal: 0.5 });
  m.box(0.205, 0.775, 0.26, 0.08, 0.05, 0.56, '#85ddeb', { emissive: 0.65 });
  m.box(0.2, 0.56, -0.06, 0.09, 0.2, 0.1, '#45535c');
  return (heldRailgunMesh = m.data);
}

function rocketMesh() {
  if (decorativeRocketMesh) return decorativeRocketMesh;
  const m = new Mesh(),
    z = -0.34;
  m.cylinder(0, 0.78, z, 0.17, 1.1, '#f0e5c6', 24);
  for (const y of [0.83, 1.1, 1.4, 1.7] satisfies [number, number, number, number])
    m.cylinder(0, y, z, 0.174, 0.12, '#c85e58', 24);
  m.cylinder(0, 1.88, z, 0.21, 0.42, '#c45a55', 24, 0);
  m.cylinder(0, 0.72, z, 0.12, 0.1, '#657c80', 20, 0.09);
  m.rod(
    [0.13, 0.22, z] satisfies [number, number, number],
    [0.13, 1.75, z] satisfies [number, number, number],
    0.025,
    '#b59362',
    8,
  );
  for (const side of [-1, 1] satisfies [number, number]) {
    m.tri(
      [side * 0.14, 0.83, z] satisfies [number, number, number],
      [side * 0.36, 0.65, z] satisfies [number, number, number],
      [side * 0.15, 1.15, z] satisfies [number, number, number],
      '#426e87',
    );
    m.tri(
      [side * 0.15, 1.15, z + 0.025] satisfies [number, number, number],
      [side * 0.36, 0.65, z + 0.025] satisfies [number, number, number],
      [side * 0.14, 0.83, z + 0.025] satisfies [number, number, number],
      '#6b9aa5',
    );
  }
  for (const y of [1.02, 1.5] satisfies [number, number])
    m.box(-0.22, y, z - 0.19, 0.44, 0.04, 0.38, '#9d865c', 'wood');
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    m.sphere(
      Math.sin(a) * 0.12,
      1.56 + Math.cos(a) * 0.1,
      z - 0.17,
      0.025,
      0.025,
      0.012,
      '#e8c66e',
      8,
      5,
      { emissive: 0.12 },
    );
  }
  return (decorativeRocketMesh = m.data);
}
let recoilMesh: number[] | undefined, launcherMesh: number[] | undefined;
function recoilAmulet() {
  if (recoilMesh) return recoilMesh;
  const m = new Mesh();
  for (const side of [-1, 1])
    m.rod([side * 0.12, 1.4, 0.09], [0, 1.235, 0.181], 0.007, '#9ea6a9', 7);
  m.sphere(0, 1.225, 0.187, 0.077, 0.087, 0.022, '#6a697b', 12, 7, { metal: 0.62 });
  m.sphere(0, 1.225, 0.205, 0.05, 0.059, 0.016, '#e69589', 8, 5, { emissive: 0.32 });
  return (recoilMesh = m.data);
}
function missileLauncher() {
  if (launcherMesh) return launcherMesh;
  const m = new Mesh();
  // Build around the right-hand bind position. The tube sits over the grip.
  const x = 0.245,
    y = 0.875;
  m.rod([x, y, -0.57], [x, y, 0.35], 0.092, '#56634d', 12, { metal: 0.5 });
  for (const z of [-0.5, -0.1, 0.29])
    m.rod([x, y, z - 0.032], [x, y, z + 0.032], 0.104, '#323c3f', 12, { metal: 0.55 });
  m.rod([x, y, 0.351], [x, y, 0.355], 0.066, '#1b252a', 12);
  m.box(x - 0.03, 0.67, -0.034, 0.06, 0.15, 0.068, '#333c36');
  m.rod([x, 0.81, 0.17], [x - 0.085, 0.756, 0.17], 0.034, '#333c36', 8);
  m.box(x - 0.023, y + 0.09, 0.09, 0.046, 0.06, 0.09, '#353c41');
  m.box(x - 0.015, y + 0.11, 0.086, 0.03, 0.023, 0.01, '#ecc172', { emissive: 0.55 });
  return (launcherMesh = m.data);
}
function clockMesh(time: number) {
  const second = Math.floor(time);
  if (clockSecond === second) return clockData!;
  clockSecond = second;
  time = second;
  const m = new Mesh(),
    gold = '#c7a45d',
    z = 0.175;
  for (const side of [-1, 1] satisfies [number, number])
    m.rod(
      [side * 0.105, 1.4, 0.09] satisfies [number, number, number],
      [0, 1.3, z] satisfies [number, number, number],
      0.008,
      gold,
      7,
    );
  m.sphere(0, 1.23, z, 0.115, 0.125, 0.025, gold, 20, 10, { metal: 0.3 });
  m.sphere(0, 1.23, z + 0.024, 0.095, 0.105, 0.008, '#eee4be', 20, 10);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    m.rod(
      [Math.sin(a) * 0.077, 1.23 + Math.cos(a) * 0.085, z + 0.035] satisfies [
        number,
        number,
        number,
      ],
      [Math.sin(a) * 0.086, 1.23 + Math.cos(a) * 0.095, z + 0.035] satisfies [
        number,
        number,
        number,
      ],
      0.0035,
      '#6b6453',
      5,
    );
  }
  for (const [angle, length, width, color] of [
    [(time / 43200) * Math.PI * 2, 0.052, 0.005, '#4d5f62'] satisfies [
      number,
      number,
      number,
      string,
    ],
    [(time / 3600) * Math.PI * 2, 0.079, 0.004, '#4d5f62'] satisfies [
      number,
      number,
      number,
      string,
    ],
    [(time * Math.PI * 2) / 60, 0.083, 0.002, '#b9685c'] satisfies [number, number, number, string],
  ])
    m.rod(
      [0, 1.23, z + 0.04] satisfies [number, number, number],
      [Math.sin(angle) * length, 1.23 + Math.cos(angle) * length, z + 0.04] satisfies [
        number,
        number,
        number,
      ],
      width,
      color,
      6,
    );
  m.sphere(0, 1.23, z + 0.044, 0.01, 0.01, 0.006, gold, 8, 5);
  clockData = m.data;
  return clockData;
}
/** Reuse the body's bone matrices so accessories follow sitting, dancing,
 * recoil and climbing. Only the flame and clock hands require fresh triangles. */
export function drawWearableAccessories(
  target: Mesh,
  look: CharacterAppearance,
  mat: Float32Array,
  {
    x,
    z,
    base,
    angle,
    height = 1,
    time = 0,
    cpu = false,
  }: {
    x: number;
    z: number;
    base: number;
    angle: number;
    height: number;
    time: number;
    cpu?: boolean;
  },
) {
  const goose = look.torso === 'goose-costume';
  if (
    look.headOnly ||
    (!goose &&
      !look.railgun &&
      !look.launcher &&
      !look.bayonet &&
      !look.crowbar &&
      !look.rollingPin &&
      !look.battleaxe &&
      look.back !== 'new-year-rocket' &&
      look.neck !== 'clock-amulet' &&
      look.neck !== 'recoil-amulet')
  )
    return;
  const si = Math.sin(angle),
    co = Math.cos(angle),
    attach = (data: number[] | Float32Array, bone: number, cacheKey: string) => {
      if (target.characters && !cpu) {
        target.characters.add(
          target,
          rigidCharacterMesh(data, bone, cacheKey),
          mat,
          wearablePalette,
          { x, z, base, angle, height },
        );
        return;
      }
      const k = bone * 12;
      for (let i = 0; i < data.length; i += 11) {
        const px =
            mat[k] * data[i] + mat[k + 1] * data[i + 1] + mat[k + 2] * data[i + 2] + mat[k + 3],
          py =
            (mat[k + 4] * data[i] +
              mat[k + 5] * data[i + 1] +
              mat[k + 6] * data[i + 2] +
              mat[k + 7]) *
            height,
          pz =
            mat[k + 8] * data[i] +
            mat[k + 9] * data[i + 1] +
            mat[k + 10] * data[i + 2] +
            mat[k + 11],
          nx = mat[k] * data[i + 3] + mat[k + 1] * data[i + 4] + mat[k + 2] * data[i + 5],
          ny =
            (mat[k + 4] * data[i + 3] + mat[k + 5] * data[i + 4] + mat[k + 6] * data[i + 5]) /
            height,
          nz = mat[k + 8] * data[i + 3] + mat[k + 9] * data[i + 4] + mat[k + 10] * data[i + 5];
        target.data.push(
          x + px * si + pz * co,
          base + py,
          z - px * co + pz * si,
          nx * si + nz * co,
          ny,
          -nx * co + nz * si,
          data[i + 6],
          data[i + 7],
          data[i + 8],
          data[i + 9],
          data[i + 10],
        );
      }
    };
  if (look.railgun) attach(railgunMesh(), 9, 'held-railgun');
  if (look.bayonet) attach(heldMeleeWeapon('bayonet'), 9, 'held-bayonet');
  if (look.crowbar) attach(heldMeleeWeapon('crowbar'), 9, 'held-crowbar');
  if (look.rollingPin) attach(heldMeleeWeapon('rolling-pin'), 9, 'held-rolling-pin');
  if (look.battleaxe) attach(heldMeleeWeapon('battleaxe'), 9, 'held-battleaxe');
  if (look.back === 'new-year-rocket') {
    attach(rocketMesh(), 1, 'wearable-rocket');
    if ((look.rocketBurnUntil || 0) > (look.serverTime ?? Date.now())) {
      const frame = Math.floor(time * 30);
      if (frame !== flameFrame) {
        flameFrame = frame;
        const flame = new Mesh(),
          pulse = 0.82 + 0.18 * Math.sin(time * 37),
          tail = 0.56 * pulse;
        flame.cylinder(0, 0.73 - tail, -0.34, 0.015, tail, '#ee9148', 14, 0.12, { emissive: 0.9 });
        flame.cylinder(0, 0.73 - tail * 0.7, -0.34, 0.005, tail * 0.7, '#ffe4a0', 12, 0.072, {
          emissive: 1,
        });
        for (let i = 0; i < 4; i++) {
          const t = (time * 1.8 + i * 0.27) % 1;
          flame.sphere(
            Math.sin(i * 2.4) * 0.08,
            0.72 - t * 0.65,
            -0.34 + Math.cos(i * 2.4) * 0.05,
            0.013,
            0.027,
            0.013,
            '#f5ca70',
            7,
            5,
            { emissive: 0.8 },
          );
        }
        flameData = flame.data;
      }
      attach(flameData!, 1, 'wearable-flame');
    }
  }
  if (goose) {
    const { body, hood } = gooseCostume();
    attach(body, 2, 'wearable-goose-body');
    attach(hood, 3, 'wearable-goose-hood');
  }
  if (look.neck === 'recoil-amulet') attach(recoilAmulet(), 2, 'wearable-recoil');
  if (look.launcher) attach(missileLauncher(), 9, 'wearable-launcher');
  if (look.neck === 'clock-amulet')
    attach(clockMesh((look.serverTime ?? Date.now()) / 1000), 2, 'wearable-clock');
}
