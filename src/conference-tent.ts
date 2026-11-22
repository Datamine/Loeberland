import type { Mesh } from './geometry.ts';
import type { RoomGeometry } from './types/interiors.ts';
import type { SignAtlas } from './types/world.ts';
import { CONFERENCE_PANELS, conferenceRimPoint, socialLocalPoint } from './social-layout.ts';
import { drawPlaque } from './southern-district.ts';

const CANVAS_STRIPES = ['#c63e57', '#f5e2b2', '#c63e57', '#f5e2b2'];
const PENNANTS = ['#edb743', '#46b69d', '#d84b73', '#4e86c6', '#9a63b3'];
const EAVE = 2.45;
const inner = 0.95;

function point(room: RoomGeometry, i: number, radius: number, y: number) {
  const [x, z] = conferenceRimPoint(room, i, radius);
  return [x, y, z] as const;
}

const wallSide = (i: number) =>
  [1, 3, 0, 2][Math.floor((i + 0.5 + CONFERENCE_PANELS / 8) / (CONFERENCE_PANELS / 4)) % 4];
const doorway = (i: number) => i === 0 || i === CONFERENCE_PANELS - 1;

export function conferenceWallPolygons(room: RoomGeometry) {
  return Array.from({ length: CONFERENCE_PANELS }, (_, i) => i)
    .filter((i) => !doorway(i))
    .map((i) =>
      [
        point(room, i, 1, 0),
        point(room, i + 1, 1, 0),
        point(room, i + 1, inner, 0),
        point(room, i, inner, 0),
      ].map(([u, , v]) => {
        const p = socialLocalPoint(room, u, v);
        return [p.x, p.z];
      }),
    );
}

function pennant(
  mesh: Mesh,
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  color: string,
) {
  mesh.tri(a, b, c, color, 'canvasWeave');
  mesh.tri(b, a, c, color, 'canvasWeave');
}

export function drawConferenceFloor(mesh: Mesh, room: RoomGeometry) {
  for (let i = 0; i < CONFERENCE_PANELS; i++) {
    mesh.tri(
      [0, 0.015, 0],
      point(room, i, 1, 0.015),
      point(room, i + 1, 1, 0.015),
      '#b59a80',
      'wood',
    );
    mesh.tri(
      [0, 0.022, 0],
      point(room, i, 0.55, 0.022),
      point(room, i + 1, 0.55, 0.022),
      '#7f3e55',
      'canvasWeave',
    );
    mesh.quad(
      point(room, i, 0.55, 0.022),
      point(room, i, 0.59, 0.022),
      point(room, i + 1, 0.59, 0.022),
      point(room, i + 1, 0.55, 0.022),
      i % 2 ? '#d08e5f' : '#e6b961',
      'canvasWeave',
    );
  }
}

export function drawConferenceWall(mesh: Mesh, room: RoomGeometry, side: number, signs: SignAtlas) {
  for (let i = 0; i < CONFERENCE_PANELS; i++) {
    if (wallSide(i) !== side || doorway(i)) continue;
    const color = CANVAS_STRIPES[i % CANVAS_STRIPES.length];
    mesh.quad(
      point(room, i, 1, 0.015),
      point(room, i + 1, 1, 0.015),
      point(room, i + 1, 1, EAVE),
      point(room, i, 1, EAVE),
      color,
      'canvasWeave',
    );
    mesh.quad(
      point(room, i + 1, inner, 0.015),
      point(room, i, inner, 0.015),
      point(room, i, inner, EAVE),
      point(room, i + 1, inner, EAVE),
      color,
      'canvasWeave',
    );
    mesh.rod(point(room, i, 1, 0.015), point(room, i, 1, EAVE), 0.018, '#c99b65', 5);
    const a = point(room, i + 0.08, inner - 0.012, 2.13);
    const b = point(room, i + 0.55, inner - 0.012, 2.04);
    pennant(mesh, a, b, point(room, i + 0.34, inner - 0.04, 1.78), PENNANTS[i % PENNANTS.length]);
  }
  if (side === 0)
    drawPlaque(
      mesh,
      signs,
      'SELL MORE SALES SOFTWARE',
      0,
      1.7,
      (-room.d / 2) * inner + 0.04,
      2.3,
      0.19,
    );
  if (side === 1) {
    const [x, z] = conferenceRimPoint(room, 1);
    for (const s of [-1, 1]) {
      mesh.rod([x * s, 0.02, z], [x * s, EAVE + 0.06, z], 0.046, '#bb9a61', 7);
      mesh.sphere(x * s, EAVE + 0.09, z, 0.068, 0.068, 0.068, '#edba58', 8, 6);
    }
    mesh.box(-0.84, 2.09, z - 0.018, 1.68, 0.29, 0.1, '#81334c', 'wood');
    drawPlaque(mesh, signs, 'SOFTWARE SALES CONFERENCE', 0, 2.16, z + 0.084, 1.56, 0.16);
  }
}

export function drawConferenceRoof(mesh: Mesh, room: RoomGeometry) {
  const rings = [
    [1.08, EAVE],
    [0.76, 2.72],
    [0.36, 3.27],
    [0.105, 3.94],
  ];
  for (let i = 0; i < CONFERENCE_PANELS; i++) {
    const color = CANVAS_STRIPES[i % CANVAS_STRIPES.length];
    for (let j = 0; j < rings.length - 1; j++) {
      const [outerRadius, outerHeight] = rings[j];
      const [innerRadius, innerHeight] = rings[j + 1];
      mesh.quad(
        point(room, i, outerRadius, outerHeight),
        point(room, i + 1, outerRadius, outerHeight),
        point(room, i + 1, innerRadius, innerHeight),
        point(room, i, innerRadius, innerHeight),
        color,
        'canvasWeave',
      );
    }
    mesh.tri(
      point(room, i, 0.105, 3.94),
      point(room, i + 1, 0.105, 3.94),
      [0, 4.12, 0],
      '#d8a349',
      'canvasWeave',
    );
    const a = point(room, i + 0.06, 1.08, EAVE - 0.025);
    const b = point(room, i + 0.76, 1.08, EAVE - 0.025);
    pennant(mesh, a, b, point(room, i + 0.47, 1.09, EAVE - 0.32), PENNANTS[i % PENNANTS.length]);
  }
  mesh.rod([0, 4.08, 0], [0, 4.99, 0], 0.028, '#be9861', 7);
  mesh.sphere(0, 5.02, 0, 0.055, 0.055, 0.055, '#e4b957', 7, 5);
  for (let i = 0; i < 3; i++) {
    const y = 4.93 - i * 0.21;
    pennant(
      mesh,
      [0.014, y, 0],
      [0.014, y - 0.18, 0],
      [0.82 - i * 0.14, y - 0.04, 0.22 + i * 0.04],
      PENNANTS[i],
    );
  }
}
