import { drawCharacter, type CharacterAppearance } from './characters.ts';
import type { Mesh } from './geometry.ts';
import { pitchAroundPoint, transformMeshRange } from './rendering/mesh-transform.ts';
import type { RenderedSite, Site } from './types/world.ts';

const BOARD_HEIGHT = 0.555;
const PIVOT_HEIGHT = 2.1;
const RIDER_SEAT_HEIGHT = 0.51;
export const SWING_RANGE = 1;

type Ground = (x: number, z: number) => number;
type Seat = NonNullable<Site['seat']>;

export function swingAngle(elapsed: number) {
  return 0.53 * (1 - Math.exp(-elapsed * 1.5)) * Math.sin((elapsed * 2 * Math.PI) / 2.7);
}

export function swingRiderGround(seat: Seat) {
  return seat.base + seat.height - RIDER_SEAT_HEIGHT;
}

export function drawSwingRider(
  mesh: Mesh,
  { x, y, z, angle, phase }: { x: number; y: number; z: number; angle: number; phase: number },
  look: CharacterAppearance,
) {
  const start = mesh.data.length;
  drawCharacter(mesh, x, z, y, angle, 0, false, look.skin, look.shirt, {
    ...look,
    mode: 'sit',
    action: 'swing',
    ground: null,
    railgun: false,
    akibo: false,
    battleaxe: false,
    rollingPin: false,
    bayonet: false,
    phone: false,
  });
  transformMeshRange(
    mesh,
    start,
    pitchAroundPoint(x, y + RIDER_SEAT_HEIGHT - BOARD_HEIGHT + PIVOT_HEIGHT, z, angle, phase),
  );
}

export function drawSwingSeat(mesh: Mesh, seat: Seat, phase: number) {
  const { x, z, base, angle } = seat;
  const top = base + PIVOT_HEIGHT;
  const start = mesh.data.length;
  for (const side of [-0.255, 0.255]) {
    const rope = x + side;
    mesh.rod([rope, base + 0.505, z], [rope, top + 0.025, z], 0.024, '#e0c391', 8);
    mesh.sphere(rope, base + 0.57, z, 0.039, 0.058, 0.042, '#d3b680', 9, 6);
  }
  mesh.box(x - 0.34, base + 0.48, z - 0.14, 0.68, 0.075, 0.28, '#a27047', 'wood');
  if (phase) transformMeshRange(mesh, start, pitchAroundPoint(x, top, z, angle, phase));
}

function swingSite(
  mesh: Mesh,
  settings: { id: string; label: string; description: string; x: number; z: number; base: number },
  drawSupport: (top: number) => void = () => {},
): RenderedSite {
  const { id, label, description, x, z, base } = settings;
  const top = base + PIVOT_HEIGHT;
  const start = mesh.data.length;
  drawSupport(top);
  for (const offset of [-0.255, 0.255])
    mesh.sphere(x + offset, top + 0.04, z, 0.053, 0.057, 0.074, '#d3b680', 9, 6);
  return {
    id,
    kind: 'swing',
    label,
    description,
    entry: { x: x - 0.5, y: z },
    seat: { x, z, base, height: BOARD_HEIGHT, angle: Math.PI / 2 },
    start,
    count: mesh.data.length - start,
    base,
    lo: [x - 0.47, base + 0.48, z - 1.12],
    hi: [x + 0.47, top + 0.11, z + 0.2],
    navigationPolygons: [],
  };
}

export function drawTreeSwing(mesh: Mesh, ground: Ground) {
  const x = 45.5;
  const z = 79.5;
  const treeGround = ground(x, z - 1);
  return swingSite(
    mesh,
    {
      id: 'tree-swing',
      label: 'Tree swing',
      description: 'A worn wooden seat hangs from a low branch on two knotted ropes.',
      x,
      z,
      base: ground(x, z),
    },
    (top) => {
      mesh.rod([x, treeGround + 1.24, z - 1], [x, top - 0.16, z - 0.45], 0.098, '#7b5c41', 9);
      mesh.rod([x, top - 0.16, z - 0.45], [x, top, z + 0.07], 0.069, '#79583c', 9);
      mesh.rod([x - 0.38, top, z], [x + 0.38, top, z], 0.064, '#88664a', 9);
    },
  );
}

export function drawParkSwings(mesh: Mesh, ground: Ground) {
  const x = 44;
  const z = 45.25;
  const west = x - 0.65;
  const east = x + 0.65;
  const left = ground(west, z);
  const right = ground(east, z);
  const height = (at: number) =>
    left + ((at - west) / (east - west)) * (right - left) + PIVOT_HEIGHT + 0.035;
  const a = x - 1.33;
  const b = x + 1.33;
  for (const end of [a, b]) {
    for (const foot of [z - 0.58, z + 0.58])
      mesh.rod([end, ground(end, foot) - 0.04, foot], [end, height(end), z], 0.085, '#477470', 12);
  }
  mesh.rod([a - 0.1, height(a - 0.1), z], [b + 0.1, height(b + 0.1), z], 0.072, '#598b85', 12);
  return [west, east].map((seatX, i) =>
    swingSite(mesh, {
      id: i ? 'park-swing-east' : 'park-swing-west',
      label: i ? 'East park swing' : 'West park swing',
      description: 'One of two rope swings on a green frame in Golden Gate Park.',
      x: seatX,
      z,
      base: i ? right : left,
    }),
  );
}
