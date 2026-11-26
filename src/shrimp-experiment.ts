import { drawCharacter, type CharacterAppearance } from './characters.ts';
import { SHRIMP_EXPERIMENT } from './config/shrimp-experiment.ts';
import { pose, type Mesh } from './geometry.ts';
import { pitchAroundPoint, transformMeshRange } from './rendering/mesh-transform.ts';
import type { RenderedSite, Site } from './types/world.ts';

type Seat = NonNullable<Site['seat']>;
type Campus = Pick<
  ReturnType<typeof import('./alien-sites.ts').createEsotericCampus>,
  'point' | 'ground'
>;

const steel = '#485563';
const black = '#252c34';
const alloy = '#99afb7';
const amber = '#e5a04d';
const cyan = '#84e1e5';
const wheel = SHRIMP_EXPERIMENT.wheel;
const tankExamine = 'Their utility is being maximized.';

function campusAngle(campus: Campus) {
  const origin = campus.point(0, 0);
  const east = campus.point(1, 0);
  return Math.atan2(east.z - origin.z, east.x - origin.x);
}

export function shrimpScientist(campus: Campus) {
  const { scientist, vendor, entry } = SHRIMP_EXPERIMENT;
  const approach = campus.point(entry.u, entry.v);
  return {
    id: scientist,
    kind: scientist,
    label: 'Berkeley Scientist',
    name: 'Berkeley Scientist',
    ...campus.point(vendor.u, vendor.v),
    base: campus.ground(),
    angle: campusAngle(campus) + Math.PI,
    approach: { x: approach.x - 0.5, y: approach.z - 0.5 },
    regional: true,
    stationary: true,
    skin: '#bd936f',
    shirt: '#dce1d9',
    pants: '#424f59',
    hair: '#5c595b',
    hairstyle: 'side-part',
    coat: true,
    height: 1.87,
    description: 'The scientist checks the shrimp tank before looking up at you.',
  };
}

function drawWheelSupport(m: Mesh) {
  const hub = wheel.hub;
  for (const x of [-1.4, 1.4]) {
    for (const z of [-0.72, 0.38]) {
      m.box(x - 0.26, 0, z - 0.23, 0.52, 0.17, 0.46, '#656b68', 'stone');
      m.box(x - 0.19, 0.17, z - 0.15, 0.38, 0.11, 0.3, black, 'metal');
      m.rod([x, 0.24, z], [x * 0.52, hub, -0.48], 0.095, steel, 6);
      m.cylinder(x - 0.14, 0.28, z, 0.033, 0.028, alloy, 6);
      m.cylinder(x + 0.14, 0.28, z, 0.033, 0.028, alloy, 6);
    }
  }
  m.rod([-1.17, 0.26, -0.77], [1.17, 0.26, -0.77], 0.085, steel, 6);
  m.rod([-0.78, hub, -0.48], [0.78, hub, -0.48], 0.16, steel, 10);
  m.rod([0, hub, -0.63], [0, hub, 0.32], 0.18, black, 12);
  m.rod([0, hub, 0.25], [0, hub, 0.32], 0.23, alloy, 12);
  m.box(-0.62, 0, 0.57, 1.24, 0.11, 0.35, black, 'metal');
  m.box(-0.54, 0.11, 0.58, 1.08, 0.09, 0.25, steel, 'metal');
  for (let i = 0; i < 7; i++) m.box(-0.48 + i * 0.135, 0.201, 0.77, 0.06, 0.008, 0.044, amber);
  m.box(1.56, 0, -0.46, 0.48, 0.87, 0.44, black, 'metal');
  m.box(1.52, 0.86, -0.5, 0.55, 0.13, 0.52, steel, 'metal');
  m.box(1.61, 0.991, -0.43, 0.36, 0.013, 0.31, '#163639');
  for (let i = 0; i < 4; i++)
    m.box(1.655, 1.006, -0.38 + i * 0.049, 0.11 + 0.045 * i, 0.012, 0.021, cyan, {
      emissive: 0.45,
    });
}

export function drawExperimentRotor(m: Mesh, seat: Seat, phase: number, time: number) {
  const { x, z, base, angle } = seat;
  pose(m, x, base, z, angle, () => {
    const start = m.data.length;
    const point = (i: number, depth: number, radius = wheel.radius) => {
      const a = (i * Math.PI) / 12;
      return [radius * Math.cos(a), wheel.hub + radius * Math.sin(a), depth];
    };
    const front = 0.17;
    const back = -0.11;
    for (let i = 0; i < 24; i++) {
      const a = point(i, front);
      const b = point(i + 1, front);
      m.rod(a, b, 0.078, i % 6 < 3 ? steel : alloy, 6);
      m.rod(point(i, back), point(i + 1, back), 0.049, steel, 5);
      if (i % 2 === 0) {
        m.rod(a, point(i, back), 0.048, alloy, 5);
        const light = i % 4 === 0 ? cyan : amber;
        m.sphere(a[0], a[1], front + 0.083, 0.058, 0.058, 0.045, light, 8, 5, {
          emissive: 0.27 + 0.35 * Math.max(0, Math.cos(time * 0.005 + i * 0.5)),
        });
      }
      if (i % 6 === 1) m.rod([0, wheel.hub, back], point(i, back), 0.068, steel, 6);
    }
    // Standing platform, padded back, and alloy restraint bars.
    m.box(-0.37, wheel.deck - 0.075, -0.12, 0.74, 0.075, 0.62, steel, 'metal');
    m.box(-0.29, wheel.deck + 0.015, -0.072, 0.58, 1.46, 0.11, black);
    for (const side of [-1, 1]) {
      const at = side * 0.3;
      m.rod([at, wheel.deck, 0.035], [at, wheel.deck + 1.56, 0.035], 0.048, alloy, 7);
      m.rod([at, wheel.deck + 1.36, 0.035], [at * 0.66, wheel.deck + 1.2, 0.39], 0.062, amber, 8);
      m.rod(
        [at * 0.66, wheel.deck + 1.2, 0.39],
        [at * 0.56, wheel.deck + 0.81, 0.41],
        0.062,
        amber,
        8,
      );
    }
    m.rod([-0.25, wheel.deck + 0.76, 0.37], [0.25, wheel.deck + 0.76, 0.37], 0.067, black, 8);
    m.box(-0.08, wheel.deck + 0.7, 0.42, 0.16, 0.13, 0.043, alloy, 'metal');
    if (phase) transformMeshRange(m, start, pitchAroundPoint(0, wheel.hub, 0, 0, phase));
  });
}

export function drawExperimentRider(
  m: Mesh,
  { x, y, z, angle, phase }: { x: number; y: number; z: number; angle: number; phase: number },
  look: CharacterAppearance,
) {
  const start = m.data.length;
  const heading = angle - Math.PI / 2;
  const forwardX = -Math.sin(heading) * 0.23;
  const forwardZ = Math.cos(heading) * 0.23;
  drawCharacter(m, x + forwardX, z + forwardZ, y, angle, 0, false, look.skin, look.shirt, {
    ...look,
    ground: null,
    mode: 'idle',
    backpack: false,
    phone: false,
    railgun: false,
    launcher: false,
    akibo: false,
    bayonet: false,
    battleaxe: false,
    combatLamp: false,
    katana: false,
    rollingPin: false,
    bowlingBall: false,
    crowbar: false,
  });
  transformMeshRange(m, start, pitchAroundPoint(x, y + wheel.hub - wheel.deck, z, heading, phase));
}

function drawShrimp(m: Mesh, x: number, y: number, z: number, angle: number, tint: string) {
  pose(m, x, y, z, angle, () => {
    m.sphere(0.09, 0.029, 0, 0.12, 0.079, 0.062, tint, 10, 7);
    for (let i = 0; i < 5; i++) {
      const r = 0.058 - i * 0.006;
      m.sphere(0.014 - i * 0.052, 0.038 - i * i * 0.0046, 0, 0.063 - i * 0.005, r, r, tint, 8, 5);
    }
    for (const side of [-1, 1]) {
      m.sphere(0.181, 0.071, side * 0.037, 0.019, 0.019, 0.019, black, 7, 5);
      m.rod([0.163, 0.056, side * 0.032], [0.325, 0.114, side * 0.08], 0.008, '#ffd3a5', 5);
      m.rod([0.325, 0.114, side * 0.08], [0.415, 0.109, side * 0.133], 0.006, '#ffd3a5', 5);
      for (let i = 0; i < 3; i++) {
        const at = 0.137 - i * 0.064;
        m.rod([at, -0.015, side * 0.029], [at + 0.04, -0.08, side * 0.075], 0.011, tint, 5);
      }
      m.sphere(-0.21, -0.04, side * 0.031, 0.067, 0.021, 0.036, tint, 8, 5);
    }
  });
}

function drawTank(m: Mesh) {
  m.box(-1.05, 0, -0.53, 2.1, 0.72, 1.06, black, 'metal');
  m.box(-1.14, 0.69, -0.6, 2.28, 0.15, 1.2, steel, 'metal');
  m.box(-1.03, 0.84, -0.49, 2.06, 0.08, 0.98, '#697d6f', 'gravel');
  for (const x of [-1.07, 1.02]) {
    for (const z of [-0.53, 0.48]) m.box(x, 0.84, z, 0.05, 0.91, 0.05, alloy, 'metal');
    m.box(x, 1.73, -0.53, 0.05, 0.055, 1.06, steel, 'metal');
  }
  for (const z of [-0.53, 0.48]) m.box(-1.07, 1.73, z, 2.14, 0.055, 0.05, steel, 'metal');
  m.box(-1.02, 0.92, -0.48, 2.04, 0.7, 0.96, '#63b7af', { glass: 0.12 });
  drawShrimp(m, -0.66, 1.035, 0.15, -0.24, '#eb926a');
  drawShrimp(m, -0.16, 1.11, -0.15, 0.44, '#cf624b');
  drawShrimp(m, 0.48, 1.22, 0.11, 2.86, '#ed9e73');
  drawShrimp(m, 0.75, 1.02, -0.28, 2.4, '#e47855');
  m.rod([0.89, 0.91, -0.36], [0.89, 1.62, -0.36], 0.032, '#427679', 8);
  for (let i = 0; i < 7; i++)
    m.sphere(
      0.89 + Math.sin(i * 1.7) * 0.049,
      0.96 + i * 0.08,
      -0.36,
      0.022 + i * 0.002,
      0.028,
      0.022,
      '#a8e5db',
      8,
      5,
    );
  m.box(-0.89, 0.41, 0.532, 1.14, 0.19, 0.09, '#334b54', 'metal');
  for (let i = 0; i < 5; i++)
    m.box(-0.75 + i * 0.2, 0.49, 0.624, 0.085, 0.038, 0.012, i % 3 === 0 ? amber : cyan, {
      emissive: 0.42,
    });
  for (const x of [-0.97, 0.93]) {
    m.rod([x, 1.74, -0.45], [x, 2.33, -0.45], 0.038, alloy, 8);
    m.rod([x, 2.33, -0.46], [x, 2.33, 0.2], 0.026, steel, 8);
  }
  m.box(-1.01, 2.3, 0.14, 2.02, 0.07, 0.13, steel, 'metal');
  m.box(-0.98, 2.296, 0.169, 1.96, 0.016, 0.067, '#dcb4ff', { emissive: 0.83 });
  m.box(-0.99, 1.76, -0.53, 1.98, 0.16, 0.54, '#364c51', 'metal');
  for (let i = 0; i < 6; i++) {
    const x = -0.78 + i * 0.31;
    m.cylinder(x, 1.88, -0.27, 0.1, 0.09, '#34312d', 10);
    m.rod([x, 1.94, -0.27], [x + 0.025, 2.15, -0.29], 0.014, '#548749', 6);
    for (const side of [-1, 1])
      m.sphere(x + side * 0.06, 2.035 + (i % 2) * 0.045, -0.28,
        0.085, 0.036, 0.056, side > 0 ? '#84b84c' : '#478751', 8, 5);
    m.rod([x, 1.77, -0.08], [x, 1.46, -0.08], 0.012, '#85af91', 6);
  }
  m.rod([-0.88, 1.81, 0.045], [0.95, 1.81, 0.045], 0.026, '#69a6ad', 8);
  m.rod([0.95, 1.81, 0.045], [0.95, 1.04, 0.045], 0.027, '#69a6ad', 8);
}

export function drawShrimpExperiment(m: Mesh, campus: Campus): RenderedSite[] {
  const { id, tank, entry } = SHRIMP_EXPERIMENT;
  const base = campus.ground();
  const yaw = campusAngle(campus);
  const access = campus.point(entry.u, entry.v);
  const entryPoint = { x: access.x - 0.5, y: access.z - 0.5 };
  const at = campus.point(wheel.u, wheel.v);
  const seat = { ...at, base, height: wheel.deck, angle: yaw };
  const wheelStart = m.data.length;
  pose(m, at.x, base, at.z, yaw, () => drawWheelSupport(m));
  const wheelCount = m.data.length - wheelStart;
  const aquarium = campus.point(tank.u, tank.v);
  const feed = campus.point(tank.u - 1.46, tank.v - 0.28);
  const tankStart = m.data.length;
  pose(m, aquarium.x, base, aquarium.z, yaw, () => {
    drawTank(m);
    const pipes = [
      [1.03, 0.62, 0.12],
      [1.3, 0.62, 0.12],
      [1.3, 0.19, 0.12],
      [1.3, 0.19, 2.23],
      [0.83, 0.19, 2.23],
      [0.83, 0.4, 2.27],
    ];
    for (let i = 1; i < pipes.length; i++) {
      m.rod(pipes[i - 1], pipes[i], 0.047, '#568b89', 8);
      const [x, y, z] = pipes[i];
      m.sphere(x, y, z, 0.058, 0.058, 0.058, alloy, 8, 5);
    }
  });
  const feedStart = m.data.length;
  pose(m, feed.x, base, feed.z, yaw, () => {
    m.box(-0.22, 0, -0.18, 0.44, 0.72, 0.36, steel, 'metal');
    m.box(-0.23, 0.72, -0.2, 0.46, 0.06, 0.41, alloy, 'metal');
    m.cylinder(0, 0.78, 0, 0.155, 0.33, '#9d6947', 12);
    m.cylinder(0, 1.11, 0, 0.164, 0.055, '#648980', 12);
    m.box(-0.094, 0.888, 0.122, 0.188, 0.103, 0.036, '#eddbab');
    m.rod([-0.048, 0.94, 0.162], [0.048, 0.94, 0.162], 0.009, '#8c5140', 6);
  });
  const extensions = (x: number, z: number, radius: number, height: number) => ({
    lo: [x - radius, base, z - radius],
    hi: [x + radius, base + height, z + radius],
  });
  return [
    {
      ...at,
      ...extensions(at.x, at.z, 2.05, 3.97),
      base,
      id,
      kind: id,
      seat,
      label: 'Scientific Experiment',
      description:
        'A motorized wheel with a standing harness, status lights, and a hose to the shrimp tank.',
      entry: entryPoint,
      solid: false,
      start: wheelStart,
      count: wheelCount,
    },
    {
      ...aquarium,
      ...extensions(aquarium.x, aquarium.z, 1.25, 2.4),
      base,
      id: 'shrimp-welfare-tank',
      kind: 'shrimp-welfare-tank',
      label: 'Shrimp Welfare Tank',
      description: tankExamine,
      entry: entryPoint,
      solid: false,
      start: tankStart,
      count: feedStart - tankStart,
    },
    {
      ...feed,
      ...extensions(feed.x, feed.z, 0.32, 1.18),
      base,
      id: 'shrimp-feed',
      kind: 'shrimp-feed',
      label: 'Shrimp Feed',
      description: 'Tiny algae pellets. The lid has markings for each shrimp’s daily ration.',
      entry: entryPoint,
      solid: false,
      start: feedStart,
      count: m.data.length - feedStart,
    },
  ];
}
