import { Mesh } from './geometry.ts';
import { transformMeshRange } from './rendering/mesh-transform.ts';
import type { Material, Vec2, Vec3 } from './types/geometry.ts';

const steel = { metal: 0.55 };
const polished = { metal: 0.83 };
const brass = { metal: 0.45 };

// Each model is authored upright with the center of the grip at the origin.
function bevel(
  m: Mesh,
  outline: readonly Vec2[],
  face: readonly Vec2[],
  halfThickness: number,
  faceColor: string,
  edgeColor: string,
) {
  const edge = outline.map(([x, y]): Vec3 => [x, y, 0]);
  const front = face.map(([x, y]): Vec3 => [x, y, halfThickness]);
  const back = face.map(([x, y]): Vec3 => [x, y, -halfThickness]);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    m.quad(edge[i], edge[j], front[j], front[i], edgeColor, polished);
    m.quad(edge[j], edge[i], back[i], back[j], edgeColor, polished);
  }
  for (let i = 1; i < face.length - 1; i++) {
    m.tri(front[0], front[i], front[i + 1], faceColor, steel);
    m.tri(back[0], back[i + 1], back[i], faceColor, steel);
  }
}

// The swept octagon makes an oval wooden spindle or a flattened bar with continuous bends.
function profile(
  m: Mesh,
  sections: readonly (readonly [x: number, y: number, halfWidth: number, halfDepth: number])[],
  color: string,
  material: Material = null,
  segments = 8,
) {
  const rings = sections.map(([x, y, width, depth], i) => {
    const before = sections[Math.max(0, i - 1)];
    const after = sections[Math.min(sections.length - 1, i + 1)];
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy);
    return Array.from({ length: segments }, (_, j): Vec3 => {
      const angle = (j * Math.PI * 2) / segments;
      const across = Math.cos(angle) * width;
      return [x + (dy / length) * across, y - (dx / length) * across, Math.sin(angle) * depth];
    });
  });
  for (let i = 1; i < rings.length; i++)
    for (let j = 0; j < segments; j++) {
      const next = (j + 1) % segments;
      m.quad(rings[i - 1][next], rings[i - 1][j], rings[i][j], rings[i][next], color, material);
    }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let j = 1; j < segments - 1; j++) {
    m.tri(first[0], first[j], first[j + 1], color, material);
    m.tri(last[0], last[j + 1], last[j], color, material);
  }
}

function bayonet(m: Mesh) {
  profile(
    m,
    [
      [0, -0.16, 0.039, 0.029],
      [0, -0.137, 0.038, 0.03],
      [0, -0.09, 0.032, 0.028],
      [0, 0.054, 0.034, 0.029],
      [0, 0.095, 0.04, 0.031],
    ],
    '#342e2a',
  );
  for (const y of [-0.113, -0.083, -0.053, -0.023, 0.007, 0.037, 0.067])
    m.cylinder(0, y, 0, 0.039, 0.01, '#55443a', 8, 0.038);
  m.box(-0.035, -0.16, -0.026, 0.07, 0.025, 0.052, '#62686a', steel);
  m.box(-0.064, 0.087, -0.032, 0.126, 0.029, 0.064, '#646d71', steel);
  // Open muzzle ring at the end of the guard.
  for (let i = 0; i < 10; i++) {
    const point = (k: number): Vec3 => {
      const angle = (k * Math.PI * 2) / 10;
      return [0.069 + Math.cos(angle) * 0.034, 0.104 + Math.sin(angle) * 0.034, 0];
    };
    m.rod(point(i), point(i + 1), 0.008, '#909ca1', 5, steel);
  }
  bevel(
    m,
    [
      [-0.058, 0.115],
      [0.045, 0.115],
      [0.045, 0.438],
      [0.01, 0.576],
      [-0.057, 0.495],
    ],
    [
      [-0.036, 0.115],
      [0.034, 0.115],
      [0.034, 0.426],
      [0.011, 0.543],
      [-0.035, 0.477],
    ],
    0.017,
    '#829198',
    '#d0dce0',
  );
  for (const z of [-0.0175, 0.0175])
    m.quad(
      [-0.013, 0.155, z],
      [0.015, 0.169, z],
      [0.012, 0.447, z],
      [-0.011, 0.466, z],
      '#4c5d66',
      steel,
    );
}

function crowbar(m: Mesh) {
  profile(
    m,
    [
      [-0.018, -0.225, 0.026, 0.027],
      [0, -0.19, 0.032, 0.028],
      [0, 0.391, 0.033, 0.029],
      [-0.009, 0.469, 0.033, 0.031],
    ],
    '#a3372e',
    { metal: 0.34 },
  );
  profile(
    m,
    [
      [-0.009, 0.464, 0.033, 0.031],
      [-0.035, 0.526, 0.032, 0.031],
      [-0.085, 0.565, 0.033, 0.031],
      [-0.153, 0.565, 0.036, 0.031],
      [-0.207, 0.532, 0.036, 0.028],
      [-0.227, 0.484, 0.032, 0.034],
    ],
    '#94342c',
    { metal: 0.42 },
  );
  // The two steel tines spread apart towards the tip to leave a visible nail slot.
  bevel(
    m,
    [
      [-0.274, 0.399],
      [-0.249, 0.404],
      [-0.222, 0.488],
      [-0.252, 0.505],
    ],
    [
      [-0.268, 0.418],
      [-0.25, 0.42],
      [-0.23, 0.488],
      [-0.248, 0.498],
    ],
    0.018,
    '#829092',
    '#c0c9c8',
  );
  bevel(
    m,
    [
      [-0.229, 0.404],
      [-0.202, 0.415],
      [-0.193, 0.488],
      [-0.223, 0.501],
    ],
    [
      [-0.224, 0.423],
      [-0.208, 0.428],
      [-0.201, 0.484],
      [-0.219, 0.494],
    ],
    0.018,
    '#829092',
    '#c0c9c8',
  );
  profile(
    m,
    [
      [-0.018, -0.225, 0.026, 0.027],
      [-0.028, -0.267, 0.033, 0.02],
      [-0.047, -0.315, 0.045, 0.005],
    ],
    '#a1adae',
    polished,
  );
  for (const y of [-0.132, 0.235, 0.26])
    m.box(0.007, y, 0.025, 0.014, 0.01, 0.005, '#d37e69', steel);
}

function rollingPin(m: Mesh) {
  const maple = '#c99962';
  profile(
    m,
    [
      [0, -0.14, 0.024, 0.024],
      [0, -0.113, 0.046, 0.046],
      [0, -0.07, 0.042, 0.042],
      [0, -0.025, 0.035, 0.035],
      [0, 0.079, 0.026, 0.026],
    ],
    '#825333',
    'wood',
    12,
  );
  profile(
    m,
    [
      [0, 0.468, 0.025, 0.025],
      [0, 0.508, 0.029, 0.029],
      [0, 0.56, 0.042, 0.042],
      [0, 0.607, 0.046, 0.046],
      [0, 0.635, 0.025, 0.025],
    ],
    '#825333',
    'wood',
    12,
  );
  profile(
    m,
    [
      [0, 0.085, 0.058, 0.058],
      [0, 0.105, 0.087, 0.087],
      [0, 0.134, 0.101, 0.101],
      [0, 0.234, 0.105, 0.105],
      [0, 0.349, 0.105, 0.105],
      [0, 0.445, 0.101, 0.101],
      [0, 0.472, 0.086, 0.086],
      [0, 0.49, 0.058, 0.058],
    ],
    maple,
    'wood',
    16,
  );
  for (const y of [0.067, 0.484]) m.cylinder(0, y, 0, 0.046, 0.024, '#b38a53', 12, 0.046, brass);
  for (const y of [0.132, 0.442]) m.cylinder(0, y, 0, 0.1015, 0.008, '#a37347', 16, 0.1015, 'wood');
}

function battleaxe(m: Mesh) {
  profile(
    m,
    [
      [-0.02, -0.271, 0.048, 0.036],
      [-0.02, -0.23, 0.04, 0.031],
      [-0.02, -0.189, 0.037, 0.03],
    ],
    '#8d603b',
    'wood',
    10,
  );
  profile(
    m,
    [
      [0.005, 0.149, 0.035, 0.029],
      [0.012, 0.361, 0.043, 0.033],
      [0.012, 0.65, 0.04, 0.033],
    ],
    '#8d603b',
    'wood',
    10,
  );
  profile(
    m,
    [
      [-0.02, -0.19, 0.045, 0.038],
      [0, -0.07, 0.041, 0.034],
      [0, 0.08, 0.04, 0.033],
      [0.005, 0.15, 0.042, 0.036],
    ],
    '#3b2c25',
  );
  for (const [x, y] of [
    [-0.018, -0.19],
    [0, -0.075],
    [0, -0.041],
    [0, -0.007],
    [0, 0.027],
    [0, 0.133],
  ])
    m.cylinder(x, y, 0, 0.044, 0.012, '#634537', 8);
  for (const side of [-1, 1]) {
    const wing = (points: readonly Vec2[]) => {
      const mirrored = points.map(([x, y]): Vec2 => [x * side, y]);
      return side < 0 ? mirrored.reverse() : mirrored;
    };
    bevel(
      m,
      wing([
        [0.015, 0.425],
        [0.14, 0.398],
        [0.242, 0.334],
        [0.302, 0.384],
        [0.348, 0.489],
        [0.345, 0.606],
        [0.302, 0.693],
        [0.212, 0.652],
        [0.015, 0.598],
      ]),
      wing([
        [0.015, 0.448],
        [0.141, 0.425],
        [0.238, 0.371],
        [0.265, 0.405],
        [0.296, 0.49],
        [0.295, 0.594],
        [0.274, 0.651],
        [0.201, 0.623],
        [0.015, 0.574],
      ]),
      0.033,
      '#72838c',
      '#c7d7dc',
    );
  }
  profile(
    m,
    [
      [0.012, 0.394, 0.051, 0.047],
      [0.012, 0.422, 0.069, 0.056],
      [0.012, 0.598, 0.069, 0.056],
      [0.012, 0.625, 0.051, 0.047],
    ],
    '#414e54',
    steel,
  );
  for (const y of [0.397, 0.604]) m.cylinder(0.012, y, 0, 0.059, 0.024, '#ac8048', 8, 0.059, brass);
  for (const y of [0.467, 0.555])
    for (const z of [-0.055, 0.055])
      m.sphere(0.012, y, z, 0.019, 0.019, 0.009, '#ca9d56', 8, 4, brass);
}

const builders = { bayonet, crowbar, 'rolling-pin': rollingPin, battleaxe };
export type MeleeWeaponModel = keyof typeof builders;
export function hasMeleeWeaponModel(id: string | undefined): id is MeleeWeaponModel {
  return id !== undefined && Object.hasOwn(builders, id);
}

const meshes = new Map<MeleeWeaponModel, { held: number[]; ground: number[] }>();
function weaponMeshes(id: MeleeWeaponModel) {
  const previous = meshes.get(id);
  if (previous) return previous;
  const mesh = new Mesh();
  builders[id](mesh);

  const held = new Mesh();
  held.data = mesh.data.slice();
  // Splay away from the chest and tip forward so long blades clear the forearm.
  const pitch = 0.25,
    roll = -0.16;
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  transformMeshRange(held, 0, [
    cr,
    sr * cp,
    sr * sp,
    0,
    -sr,
    cr * cp,
    cr * sp,
    0,
    0,
    -sp,
    cp,
    0,
    0.245,
    0.678,
    0.033,
    1,
  ]);

  const ground = new Mesh();
  ground.data = mesh.data;
  let clearance = 0;
  for (let i = 2; i < ground.data.length; i += 11) clearance = Math.max(clearance, ground.data[i]);
  const c = Math.cos(0.62),
    s = Math.sin(0.62);
  transformMeshRange(ground, 0, [
    c,
    0,
    -s,
    0,
    s,
    0,
    c,
    0,
    0,
    -1,
    0,
    0,
    -s * 0.15,
    clearance + 0.008,
    -c * 0.15,
    1,
  ]);
  const result = { held: held.data, ground: ground.data };
  meshes.set(id, result);
  return result;
}

export const heldMeleeWeapon = (id: MeleeWeaponModel) => weaponMeshes(id).held;

export function drawDroppedMeleeWeapon(
  m: Mesh,
  id: MeleeWeaponModel,
  x: number,
  y: number,
  z: number,
) {
  const model = weaponMeshes(id).ground;
  for (let i = 0; i < model.length; i += 11)
    m.data.push(
      x + model[i],
      y + model[i + 1],
      z + model[i + 2],
      model[i + 3],
      model[i + 4],
      model[i + 5],
      model[i + 6],
      model[i + 7],
      model[i + 8],
      model[i + 9],
      model[i + 10],
    );
}
