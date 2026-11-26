import { drawBushFoliage } from './goblin-bush.ts';
import type { CharacterAppearance } from './characters.ts';
import { Mesh } from './geometry.ts';
import type { Vec3 } from './types/geometry.ts';
import { addMeleeWeaponHalo, heldMeleeWeaponEmitter, heldMeleeWeapon } from './melee-weapon-models.ts';
import { rigidCharacterMesh } from './rendering/character-gpu.ts';
import {
  LAUNCHER_EXHAUST,
  LAUNCHER_MUZZLE,
  ONODA_MUZZLE,
  RAILGUN_MUZZLE,
} from './ranged-weapon-mounts.ts';

let heldRailgunMesh: number[] | null = null,
  heldOnodaRifleMesh: number[] | null = null,
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

let bushOutfitMesh: { top: number[]; left: number[]; right: number[] } | undefined;
function bushOutfit() {
  if (bushOutfitMesh) return bushOutfitMesh;
  const top = new Mesh(), left = new Mesh(), right = new Mesh();
  drawBushFoliage(top, 0, 1.11, -0.012, 0.395, 0.382, 0.317);
  drawBushFoliage(left, -0.174, 0.52, 0, 0.175, 0.275, 0.189);
  drawBushFoliage(right, 0.174, 0.52, 0, 0.175, 0.275, 0.189);
  return (bushOutfitMesh = { top: top.data, left: left.data, right: right.data });
}

let barrelArmorMesh: number[] | undefined;
function barrelArmor() {
  if (barrelArmorMesh) return barrelArmorMesh;
  const m = new Mesh(),
    staves = 20,
    oak = ['#a16d3e', '#b68150', '#9a6437', '#b07b47', '#a57340'],
    hoops = { metal: 0.45 };
  const at = (angle: number, t: number, offset = 0) => {
    const x = Math.sin(angle);
    const cutout = Math.max(0, (Math.abs(x) - 0.55) / 0.45);
    const y = 0.795 + t * (0.553 - 0.219 * cutout ** 1.6);
    const bulge = 4 * t * (1 - t);
    return [
      x * (0.224 + 0.075 * bulge + offset),
      y,
      Math.cos(angle) * (0.171 + 0.086 * bulge + offset),
    ];
  };
  for (let i = 0; i < staves; i++) {
    const a = ((i - 0.5) * Math.PI * 2) / staves;
    const b = ((i + 0.5) * Math.PI * 2) / staves;
    const levels = [0, 0.18, 0.5, 0.82, 1];
    const wood = oak[i % oak.length];
    for (let j = 1; j < levels.length; j++) {
      const lower = levels[j - 1],
        upper = levels[j];
      m.quad(at(a, lower), at(b, lower), at(b, upper), at(a, upper), wood, 'wood');
      m.quad(
        at(a, lower, 0.001),
        at(a + 0.014, lower, 0.001),
        at(a + 0.014, upper, 0.001),
        at(a, upper, 0.001),
        '#6d4327',
      );
    }
    for (const t of [0, 1]) {
      const rim = [at(a, t), at(b, t), at(b, t, -0.026), at(a, t, -0.026)];
      if (t === 0) rim.reverse();
      m.quad(rim[0], rim[1], rim[2], rim[3], '#7f5634', 'wood');
    }
    for (const [lower, upper] of [
      [0.08, 0.2],
      [0.49, 0.6],
      [0.82, 0.94],
    ]) {
      m.quad(
        at(a, lower, 0.01),
        at(b, lower, 0.01),
        at(b, upper, 0.01),
        at(a, upper, 0.01),
        '#535659',
        hoops,
      );
      m.quad(at(a, lower, 0.01), at(a, lower), at(b, lower), at(b, lower, 0.01), '#36393d', hoops);
      m.quad(at(a, upper), at(a, upper, 0.01), at(b, upper, 0.01), at(b, upper), '#74747a', hoops);
      if (i % 2 === 0) {
        const [x, y, z] = at((a + b) / 2, (lower + upper) / 2, 0.012);
        m.sphere(x, y, z, 0.011, 0.01, 0.011, '#99928b', 6, 4, hoops);
      }
    }
  }
  for (const side of [-1, 1]) {
    const x = side * 0.12;
    const strap = [
      [1.237, 0.206],
      [1.349, 0.147],
      [1.407, 0.047],
      [1.396, -0.06],
      [1.304, -0.174],
      [1.237, -0.206],
    ];
    for (let i = 1; i < strap.length; i++) {
      const [y, z] = strap[i - 1];
      const [top, back] = strap[i];
      const corners = [
        [x - 0.025, y, z],
        [x + 0.025, y, z],
        [x + 0.025, top, back],
        [x - 0.025, top, back],
      ];
      m.quad(corners[0], corners[1], corners[2], corners[3], '#58412e');
    }
    m.box(x - 0.027, 1.267, 0.195, 0.054, 0.031, 0.012, '#a49c85', hoops);
    m.box(x - 0.017, 1.276, 0.207, 0.034, 0.013, 0.003, '#58412e');
  }
  return (barrelArmorMesh = m.data);
}

function railgunMesh() {
  if (heldRailgunMesh) return heldRailgunMesh;
  const m = new Mesh();
  const [x, y, end] = RAILGUN_MUZZLE;
  // Built in the right hand's bind pose, with the muzzle along character forward.
  m.box(0.165, 0.73, -0.11, 0.16, 0.14, 0.65, '#4c626b', { metal: 0.45 });
  for (const rail of [x - 0.117, x + 0.082]) {
    m.box(rail, 0.76, 0.07, 0.035, 0.045, end - 0.07, '#9cbabd', { metal: 0.5 });
    m.box(rail + 0.008, 0.805, 0.31, 0.019, 0.014, end - 0.33, '#6fd9ea', { emissive: 0.65 });
  }
  m.box(x - 0.04, y - 0.025, 0.26, 0.08, 0.05, end - 0.26, '#85ddeb', { emissive: 0.65 });
  m.box(0.2, 0.56, -0.06, 0.09, 0.2, 0.1, '#45535c');
  return (heldRailgunMesh = m.data);
}

function onodaRifleMesh() {
  if (heldOnodaRifleMesh) return heldOnodaRifleMesh;
  const m = new Mesh(), [x, muzzleY, end] = ONODA_MUZZLE, metal = { metal: 0.45 };
  m.box(x - 0.051, 0.699, -0.38, 0.102, 0.145, 0.31, '#513b27', 'wood');
  m.box(x - 0.047, 0.733, -0.09, 0.094, 0.078, 0.52, '#735438', 'wood');
  m.box(x - 0.041, 0.808, -0.133, 0.082, 0.061, 0.25, '#414749', metal);
  m.rod([x, muzzleY, 0.10], [x, muzzleY, end - 0.02], 0.022, '#353a3a', 9, metal);
  m.rod([x, muzzleY, end - 0.057], [x, muzzleY, end], 0.029, '#484d4d', 9, metal);
  for (const z of [-0.075, 0.09]) m.box(x - 0.021, 0.849, z, 0.042, 0.067, 0.028, '#363a3b', metal);
  m.rod([x, 0.924, -0.15], [x, 0.924, 0.17], 0.026, '#303635', 10, metal);
  m.rod([x, 0.924, 0.118], [x, 0.924, 0.2], 0.039, '#404544', 10, metal);
  m.rod([x, 0.924, 0.198], [x, 0.924, 0.202], 0.024, '#627d79', 10, metal);
  m.box(x - 0.035, 0.625, -0.052, 0.07, 0.115, 0.072, '#65492f', 'wood');
  return (heldOnodaRifleMesh = m.data);
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
let albatrossMesh: number[] | undefined;
function albatross() {
  if (albatrossMesh) return albatrossMesh;
  const m = new Mesh();
  const cream = '#eeeadd';
  const dark = '#46444a';
  for (const side of [-1, 1]) {
    const rope = [
      [0, 1.425, -0.071],
      [side * 0.071, 1.417, -0.035],
      [side * 0.089, 1.391, 0.06],
      [side * 0.076, 1.332, 0.128],
      [0, 1.263, 0.235],
    ];
    for (let i = 1; i < rope.length; i++) m.rod(rope[i - 1], rope[i], 0.012, '#9d784f', 7);
  }
  m.sphere(0, 1.268, 0.234, 0.026, 0.028, 0.025, '#795b3d', 9, 5);
  m.sphere(0, 1.117, 0.229, 0.119, 0.171, 0.099, cream, 16, 10);
  m.sphere(0.045, 0.998, 0.258, 0.068, 0.109, 0.064, '#f5efe1', 12, 8);
  m.sphere(0.09, 0.931, 0.283, 0.058, 0.065, 0.057, '#f8f2e5', 14, 9);
  m.sphere(0.156, 0.915, 0.307, 0.052, 0.023, 0.025, '#d4a172', 12, 6);
  m.sphere(0.193, 0.902, 0.314, 0.022, 0.025, 0.019, '#bd8968', 9, 6);
  m.rod([0.135, 0.911, 0.33], [0.199, 0.897, 0.329], 0.003, '#855943', 5);
  m.sphere(0.112, 0.956, 0.329, 0.014, 0.014, 0.012, '#29232a', 8, 6);
  m.sphere(0.117, 0.96, 0.338, 0.004, 0.004, 0.004, '#efe2c8', 6, 4);
  for (const side of [-1, 1]) {
    const x = (width: number) => side * width;
    const wing = [
      [x(0.065), 1.234, 0.267],
      [x(0.185), 1.173, 0.314],
      [x(0.236), 1.052, 0.305],
      [x(0.139), 1.047, 0.319],
    ];
    if (side > 0) wing.reverse();
    m.quad(wing[0], wing[1], wing[2], wing[3], dark);
    // Layer the long primaries below the wing coverts.
    for (let i = 0; i < 6; i++) {
      const root = 0.084 + i * 0.023;
      const y = 1.134 - i * 0.017;
      const tip = root + 0.053 - i * 0.005;
      const feather = [
        [x(root - 0.016), y, 0.315],
        [x(root + 0.021), y + 0.022, 0.32],
        [x(tip + 0.016), y - 0.122 + i * 0.007, 0.272],
        [x(tip - 0.004), y - 0.167 + i * 0.009, 0.254],
      ];
      if (side > 0) feather.reverse();
      m.quad(feather[0], feather[1], feather[2], feather[3], i % 2 ? '#545059' : '#39373e');
    }
    const heel = [x(0.046), 1.217, 0.305];
    const toes = [x(0.063), 1.277, 0.331];
    m.rod(heel, toes, 0.01, '#c5977e', 6);
    m.tri(toes, [x(0.072), 1.312, 0.337], [x(0.038), 1.297, 0.345], '#c89b85');
  }
  return (albatrossMesh = m.data);
}

let whiteScarfMesh: number[] | undefined;
function whiteScarf() {
  if (whiteScarfMesh) return whiteScarfMesh;
  const m = new Mesh();
  m.sphere(0, 1.401, -0.008, 0.109, 0.044, 0.093, '#e5e2d7', 18, 9);
  m.sphere(-0.013, 1.416, 0.022, 0.098, 0.027, 0.089, '#f5f1e7', 18, 8);
  m.sphere(0.04, 1.387, 0.094, 0.084, 0.033, 0.047, '#f8f3e8', 15, 8);
  for (const tail of [
    [
      [0.044, 1.39, 0.116, 0.046],
      [0.068, 1.32, 0.176, 0.05],
      [0.049, 1.236, 0.194, 0.044],
      [0.075, 1.148, 0.198, 0.043],
    ],
    [
      [0.005, 1.38, 0.115, 0.038],
      [-0.035, 1.318, 0.179, 0.044],
      [-0.052, 1.249, 0.187, 0.046],
    ],
  ]) {
    const cloth = ([x, y, z, width]: number[], edge: number) => [
      x + width * edge,
      y,
      z + (edge === 0 ? 0.013 : 0),
    ];
    for (let i = 1; i < tail.length; i++) {
      const top = tail[i - 1];
      const bottom = tail[i];
      m.quad(cloth(bottom, -1), cloth(bottom, 0), cloth(top, 0), cloth(top, -1), '#e3ded5');
      m.quad(cloth(bottom, 0), cloth(bottom, 1), cloth(top, 1), cloth(top, 0), '#f7f3e8');
    }
    const [x, y, z, width] = tail[tail.length - 1];
    for (let i = -3; i <= 3; i++) {
      const edge = x + (width * i) / 4;
      m.rod(
        [edge, y + 0.004, z + 0.003],
        [edge + 0.003, y - 0.024 + (i % 3) * 0.002, z + 0.006],
        0.0027,
        '#efe9dc',
        5,
      );
    }
  }
  return (whiteScarfMesh = m.data);
}

let goblinCharmMesh: number[] | undefined;
function goblinCharm() {
  if (goblinCharmMesh) return goblinCharmMesh;
  const m = new Mesh();
  for (const side of [-1, 1])
    m.rod([side * 0.11, 1.4, 0.088], [0, 1.245, 0.185], 0.009, '#ab813e', 7);
  m.sphere(0, 1.197, 0.186, 0.079, 0.077, 0.026, '#c99b4f', 12, 8, { metal: 0.6 });
  m.sphere(0, 1.196, 0.209, 0.045, 0.048, 0.018, '#9dcb75', 9, 6, { emissive: 0.28 });
  for (const side of [-1, 1])
    m.tri([0, 1.204, 0.228], [side * 0.06, 1.222, 0.211],
      [side * 0.035, 1.181, 0.222], '#58412c');
  return (goblinCharmMesh = m.data);
}

function recoilAmulet() {
  if (recoilMesh) return recoilMesh;
  const m = new Mesh();
  for (const side of [-1, 1])
    m.rod([side * 0.12, 1.4, 0.09], [0, 1.235, 0.181], 0.007, '#9ea6a9', 7);
  m.sphere(0, 1.225, 0.187, 0.077, 0.087, 0.022, '#6a697b', 12, 7, { metal: 0.62 });
  m.sphere(0, 1.225, 0.205, 0.05, 0.059, 0.016, '#e69589', 8, 5, { emissive: 0.32 });
  return (recoilMesh = m.data);
}

let defenceAmuletMesh: number[] | undefined;
function defenceAmulet() {
  if (defenceAmuletMesh) return defenceAmuletMesh;
  const m = new Mesh();
  const silver = '#bac9cf';
  const metal = { metal: 0.58 };
  for (const side of [-1, 1]) {
    m.rod([side * 0.108, 1.405, 0.092], [side * 0.067, 1.337, 0.155], 0.006, silver, 8, metal);
    m.rod([side * 0.067, 1.337, 0.155], [0, 1.292, 0.229], 0.006, silver, 8, metal);
  }
  m.sphere(0, 1.292, 0.231, 0.018, 0.013, 0.009, silver, 8, 6, metal);
  const outline = [[-0.064, 0.069], [0.064, 0.069], [0.067, 0.021], [0.046, -0.034],
    [0, -0.075], [-0.046, -0.034], [-0.067, 0.021]] as const;
  const point = (i: number, scale: number, z: number): Vec3 =>
    [outline[i][0] * scale, 1.215 + outline[i][1] * scale, z];
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    m.quad(point(i, 1, 0.207), point(next, 1, 0.207), point(next, 1, 0.227),
      point(i, 1, 0.227), '#67747d', metal);
    m.quad(point(next, 1, 0.227), point(i, 1, 0.227), point(i, 0.76, 0.243),
      point(next, 0.76, 0.243), silver, metal);
    m.tri([0, 1.229, 0.262], point(next, 0.76, 0.243), point(i, 0.76, 0.243),
      i < 4 ? '#577e9a' : '#709fb1', { metal: 0.27 });
    m.tri([0, 1.215, 0.207], point(i, 1, 0.207), point(next, 1, 0.207), '#69767b', metal);
  }
  return (defenceAmuletMesh = m.data);
}

function missileLauncher() {
  if (launcherMesh) return launcherMesh;
  const m = new Mesh();
  // Build around the right-hand bind position. The tube sits over the grip.
  const [x, y, end] = LAUNCHER_MUZZLE;
  m.rod(LAUNCHER_EXHAUST, [x, y, end - 0.006], 0.092, '#56634d', 12, { metal: 0.5 });
  for (const z of [-0.5, -0.1, 0.29])
    m.rod([x, y, z - 0.032], [x, y, z + 0.032], 0.104, '#323c3f', 12, { metal: 0.55 });
  m.rod([x, y, end - 0.005], LAUNCHER_MUZZLE, 0.066, '#1b252a', 12);
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
/** Bind meshes shared between worn accessories and ground items. */
export function wearableEquipmentMeshes(id: string): readonly number[][] | undefined {
  switch (id) {
    case 'goose-costume': {
      const { body, hood } = gooseCostume();
      return [body, hood];
    }
    case 'bush-top':
      return [bushOutfit().top];
    case 'bush-legs': {
      const { left, right } = bushOutfit();
      return [left, right];
    }
    case 'barrel':
      return [barrelArmor()];
    case 'railgun':
      return [railgunMesh()];
    case 'missile-launcher':
      return [missileLauncher()];
    case 'new-year-rocket':
      return [rocketMesh()];
    case 'white-scarf':
      return [whiteScarf()];
    case 'albatross':
      return [albatross()];
    case 'recoil-amulet':
      return [recoilAmulet()];
    case 'defence-amulet':
      return [defenceAmulet()];
    case 'goblin-charm':
      return [goblinCharm()];
    case 'clock-amulet':
      return [clockMesh(0)];
  }
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
  if (look.back === 'invisibility-cloak')
    look = { ...look, torso: undefined, legs: undefined, neck: undefined };
  const goose = look.torso === 'goose-costume',
    barrel = look.torso === 'barrel',
    bushTop = look.torso === 'bush-top',
    bushLegs = look.legs === 'bush-legs';
  if (
    look.headOnly ||
    (!goose &&
      !barrel &&
      !bushTop &&
      !bushLegs &&
      !look.railgun &&
      !look.onodaRifle &&
      !look.launcher &&
      !look.bayonet &&
      !look.crowbar &&
      !look.rollingPin &&
      !look.bowlingBall &&
      !look.battleaxe &&
      !look.combatLamp &&
      !look.katana &&
      !look.lightsaber &&
      look.back !== 'new-year-rocket' &&
      look.neck !== 'clock-amulet' &&
      look.neck !== 'albatross' &&
      look.neck !== 'white-scarf' &&
      look.neck !== 'goblin-charm' &&
      look.neck !== 'defence-amulet' &&
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
  if (bushTop) attach(bushOutfit().top, 2, 'bush-top');
  if (barrel) attach(barrelArmor(), 2, 'barrel');
  if (bushLegs) {
    const { left, right } = bushOutfit();
    attach(left, 10, 'bush-leg-left');
    attach(right, 13, 'bush-leg-right');
  }
  if (look.railgun) attach(railgunMesh(), 9, 'held-railgun');
  if (look.onodaRifle) attach(onodaRifleMesh(), 9, 'held-onoda-rifle');
  if (look.bayonet) attach(heldMeleeWeapon('bayonet'), 9, 'held-bayonet');
  if (look.crowbar) attach(heldMeleeWeapon('crowbar'), 9, 'held-crowbar');
  if (look.rollingPin) attach(heldMeleeWeapon('rolling-pin'), 9, 'held-rolling-pin');
  if (look.bowlingBall) attach(heldMeleeWeapon('bowling-ball'), 9, 'held-bowling-ball');
  if (look.battleaxe) attach(heldMeleeWeapon('battleaxe'), 9, 'held-battleaxe');
  if (look.katana) attach(heldMeleeWeapon('katana'), 9, 'held-katana');
  function attachLitWeapon(id: 'combat-lamp' | 'lightsaber', color?: CharacterAppearance['lightsaberColor']) {
    const hand = 9;
    attach(heldMeleeWeapon(id, color), hand, 'held-' + id + (color ? '-' + color : ''));
    const emitter = target.halos && heldMeleeWeaponEmitter(id, color);
    if (emitter) {
      const [ex, ey, ez] = emitter;
      const k = hand * 12;
      const px = mat[k] * ex + mat[k + 1] * ey + mat[k + 2] * ez + mat[k + 3];
      const py = mat[k + 4] * ex + mat[k + 5] * ey + mat[k + 6] * ez + mat[k + 7];
      const pz = mat[k + 8] * ex + mat[k + 9] * ey + mat[k + 10] * ez + mat[k + 11];
      addMeleeWeaponHalo(target, id, x + px * si + pz * co, base + py * height, z - px * co + pz * si);
    }
  }
  if (look.combatLamp) attachLitWeapon('combat-lamp');
  if (look.lightsaber) attachLitWeapon('lightsaber', look.lightsaberColor || 'blue');
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
  if (look.neck === 'albatross') attach(albatross(), 2, 'wearable-albatross');
  if (look.neck === 'white-scarf') attach(whiteScarf(), 2, 'wearable-white-scarf');
  if (look.neck === 'recoil-amulet') attach(recoilAmulet(), 2, 'wearable-recoil');
  if (look.neck === 'defence-amulet') attach(defenceAmulet(), 2, 'wearable-defence-amulet');
  if (look.neck === 'goblin-charm') attach(goblinCharm(), 2, 'wearable-goblin-charm');
  if (look.launcher) attach(missileLauncher(), 9, 'wearable-launcher');
  if (look.neck === 'clock-amulet')
    attach(clockMesh((look.serverTime ?? Date.now()) / 1000), 2, 'wearable-clock');
}
