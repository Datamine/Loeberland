import type { Point, Ray } from './types/geometry.ts';
import type { Site, SignAtlas } from './types/world.ts';
import { requiredValue } from './types/assert.ts';
import { BURNING_MAN } from './burning-man.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import type { Mesh } from './geometry.ts';
import { pose, rayTriangle } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import { drawFacadeWindow } from './windows.ts';
import { createNavigationGrid } from './navigation.ts';
import {
  instituteWalkable,
  instituteWallRects,
  recordInstitutePart,
  drawInstituteWall,
  detachInstituteMesh,
} from './institute-interiors.ts';
import {
  BERKELEY_CAMPUS,
  BERKELEY_INSTITUTE_ROOM,
  BERKELEY_HOMES,
  MAD_HOUSE,
  HOT_TRAPDOOR,
  drawBerkeleyCampus,
} from './berkeley-campus.ts';

export const ALIEN_SITE_SIGNS = Object.freeze([
  'AMERICAN INDUSTRIAL CENTER',
  'BERKELEY INSTITUTE\nFOR ESOTERIC STUDIES',
] satisfies [string, string]);
export const INDUSTRIAL_CENTER = Object.freeze({
  x: 84.8,
  z: 77.3,
  w: 3.8,
  d: 3.3,
  angle: Math.PI / 2,
});
function alienSiteBounds<T extends Site>(m: Mesh, start: number, site: T) {
  const lo = [Infinity, Infinity, Infinity] satisfies [number, number, number],
    hi = [-Infinity, -Infinity, -Infinity] satisfies [number, number, number];
  for (let i = start; i < m.data.length; i += 11)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], m.data[i + k]);
      hi[k] = Math.max(hi[k], m.data[i + k]);
    }
  return { ...site, start, count: m.data.length - start, lo, hi };
}
export function drawIndustrialCenter(m: Mesh, signs: SignAtlas, { base }: { base: number }) {
  const c = INDUSTRIAL_CENTER,
    start = m.data.length;
  pose(m, c.x, base, c.z, c.angle, () => {
    m.box(-c.w / 2, -0.04, -c.d / 2, c.w, 2.1, c.d, '#a27e67', 'brick');
    for (let i = 0; i < 3; i++) {
      const z = -c.d / 2 + (i * c.d) / 3;
      m.quad(
        [-c.w / 2, 2.1, z] satisfies [number, number, number],
        [-c.w / 2, 2.6, z + 0.78] satisfies [number, number, number],
        [c.w / 2, 2.6, z + 0.78] satisfies [number, number, number],
        [c.w / 2, 2.1, z] satisfies [number, number, number],
        '#718783',
        'roof',
      );
      m.quad(
        [-c.w / 2, 2.6, z + 0.78] satisfies [number, number, number],
        [-c.w / 2, 2.1, z + c.d / 3] satisfies [number, number, number],
        [c.w / 2, 2.1, z + c.d / 3] satisfies [number, number, number],
        [c.w / 2, 2.6, z + 0.78] satisfies [number, number, number],
        '#739397',
        'glass',
      );
      for (const side of [-1, 1] satisfies [number, number]) {
        const points = [
          [(side * c.w) / 2, 2.1, z] satisfies [number, number, number],
          [(side * c.w) / 2, 2.6, z + 0.78] satisfies [number, number, number],
          [(side * c.w) / 2, 2.1, z + c.d / 3] satisfies [number, number, number],
        ];
        if (side < 0) points.reverse();
        m.tri(points[0], points[1], points[2], '#a27e67', 'brick');
      }
    }
    m.box(-0.65, 0.02, c.d / 2 + 0.01, 1.3, 1.4, 0.035, '#6a7770', { metal: 0.18 });
    for (let j = 0; j < 12; j++)
      m.box(-0.62, 0.08 + j * 0.105, c.d / 2 + 0.05, 1.24, 0.018, 0.018, '#a1aaa0');
    for (const x of [-1.45, 1.08] satisfies [number, number])
      drawFacadeWindow(m, {
        plane: c.d / 2 + 0.012,
        along: x,
        y: 0.65,
        w: 0.5,
        h: 0.65,
        style: 'office',
        trim: '#c6c4ab',
        seed: x,
      });
    m.box(-1.84, 1.55, c.d / 2 + 0.025, 3.68, 0.4, 0.04, '#3e5654');
    drawPlaque(m, signs, ALIEN_SITE_SIGNS[0], 0, 1.61, c.d / 2 + 0.07, 3.45, 0.26);
    for (const x of [-1.6, 1.6] satisfies [number, number]) {
      m.box(x - 0.1, 0.03, c.d / 2 + 0.13, 0.2, 0.53, 0.2, '#b8ad76');
      m.box(x - 0.1, 0.29, c.d / 2 + 0.14, 0.2, 0.09, 0.2, '#4d5851');
    }
  });
  return alienSiteBounds(m, start, {
    id: 'american-industrial-center',
    kind: 'industrial-center',
    label: contentText('alien-sites.drawIndustrialCenter.label-1', {}),
    base,
    entry: { x: 82, y: 76.8 },
    description: contentText('alien-sites.drawIndustrialCenter.description-2', {}),
  });
}

/** The campus uses a small precomputed adjacency graph on the same ground
 * parcels as its models, picking surface, and minimap. */
export function createEsotericCampus(
  car: Pick<ReturnType<typeof import('./ferrari.ts').createFerrari>, 'sample' | 'dealer'>,
  {
    prepared = null,
  }: { prepared?: import('./types/navigation.ts').NavigationGraphData | null } = {},
) {
  const p = car.sample(car.dealer + 24),
    c = Math.cos(p.angle),
    s = Math.sin(p.angle),
    base = p.y,
    gate = { x: p.x - 0.5, y: p.z - 0.5 },
    layout = BERKELEY_CAMPUS;
  const local = (x: number, z: number) => {
    const dx = x - p.x,
      dz = z - p.z;
    return { u: dx * c + dz * s, v: -dx * s + dz * c };
  };
  const point = (u: number, v: number) => ({ x: p.x + u * c - v * s, z: p.z + u * s + v * c });
  const inRect = (u: number, v: number, [a, b, d, e]: number[], pad = 0) =>
    u >= a - pad - 1e-8 && u <= d + pad + 1e-8 && v >= b - pad - 1e-8 && v <= e + pad + 1e-8;
  const madHouseWalls = [0, 1, 2, 3].flatMap((side) => instituteWallRects(MAD_HOUSE, side));
  const madHouseClear = (u: number, v: number) =>
    !madHouseWalls.some((wall) =>
      inRect(
        u - MAD_HOUSE.x,
        v - MAD_HOUSE.z,
        [wall.x, wall.z, wall.x + wall.w, wall.z + wall.d],
        0.16,
      ),
    );
  const clearLocal = (u: number, v: number) => {
    if (!inRect(u, v, layout.bounds) && !inRect(u, v, layout.paths[0])) return false;
    if (Math.hypot(u - BURNING_MAN.u, v - BURNING_MAN.v) < 0.59) return false;
    for (const b of layout.buildings)
      if (inRect(u, v, b.rect, 0.16)) {
        if (b.id === MAD_HOUSE.id) {
          if (!madHouseClear(u, v)) return false;
        } else if (b.id !== 'institute' || !instituteWalkable(BERKELEY_INSTITUTE_ROOM, u, v))
          return false;
      }
    if (layout.obstacles.some((o) => Math.hypot(u - o.u, v - o.v) < o.r + 0.16)) return false;
    return !layout.trees.some(([x, z]) => Math.hypot(u - x, v - z) < 0.3);
  };
  const contains = (x: number, z: number) => {
    const q = local(x, z);
    return clearLocal(q.u, q.v);
  };
  const ground = () => base + 0.015;
  const resolution = 4,
    west = layout.bounds[0],
    north = -0.25,
    width = (layout.bounds[2] - west) * resolution,
    height = 75;
  const graphPoint = (q: { u: number; v: number }) => ({ x: q.u - west, y: q.v - north }),
    worldPoint = (q: { x: number; y: number }) => {
      const at = point(q.x + west, q.y + north);
      return { x: at.x - 0.5, y: at.z - 0.5 };
    };
  const clearGraphLine = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 0.06));
    for (let i = 0; i <= n; i++)
      if (!clearLocal(west + a.x + ((b.x - a.x) * i) / n, north + a.y + ((b.y - a.y) * i) / n))
        return false;
    return true;
  };
  const mask =
    prepared?.mask ||
    Uint8Array.from({ length: width * height }, (_, id) =>
      clearLocal(
        west + ((id % width) + 0.5) / resolution,
        north + (Math.floor(id / width) + 0.5) / resolution,
      )
        ? 1
        : 0,
    );
  const graph = createNavigationGrid({
    width,
    height,
    resolution,
    mask,
    canTraverse: clearGraphLine,
    canLink: clearGraphLine,
    prepared,
  });
  function segment(a: { x: number; y: number }, b: { x: number; y: number }) {
    return graph.segment(
      graphPoint(local(a.x + 0.5, a.y + 0.5)),
      graphPoint(local(b.x + 0.5, b.y + 0.5)),
    );
  }
  function internal(a: Point, b: Point) {
    return (
      graph
        .path(graphPoint(local(a.x + 0.5, a.y + 0.5)), graphPoint(local(b.x + 0.5, b.y + 0.5)))
        ?.map(worldPoint) || null
    );
  }
  function path(
    from: { x: number; y: number },
    to: { x: number; y: number },
    basePath: (from: Point, to: Point) => Point[] | null | undefined,
  ) {
    const a = contains(from.x + 0.5, from.y + 0.5),
      b = contains(to.x + 0.5, to.y + 0.5);
    if (!a && !b) return basePath(from, to);
    if (a && b) return internal(from, to);
    const entry = a ? internal(from, gate) : basePath(from, gate),
      exit = b ? internal(gate, to) : basePath(gate, to);
    return entry && exit ? [...entry, ...exit] : null;
  }
  const quad = (rect: readonly number[]) => {
    const [a, b, c, d] = rect;
    return [
      [a, b],
      [a, d],
      [c, d],
      [c, b],
    ].map(([u, v]) => {
      const q = point(u, v);
      return [q.x, ground(), q.z];
    });
  };
  const quads = [quad(layout.bounds), quad(layout.paths[0])];
  const mapFeatures = [
    { polygon: quad(layout.bounds), color: '#879c78' },
    ...layout.paths.map((rect) => ({ polygon: quad(rect), color: '#c8c6b1' })),
    ...layout.buildings.map((b) => ({ polygon: quad(b.rect), color: b.color })),
  ];
  function raycast(ray: Ray) {
    let best = Infinity;
    for (const q of quads)
      for (const tri of [
        [q[0], q[1], q[2]],
        [q[0], q[2], q[3]],
      ]) {
        const d = rayTriangle(ray, tri[0], tri[1], tri[2]);
        if (d !== null) best = Math.min(best, d);
      }
    return Number.isFinite(best)
      ? { distance: best, point: ray.origin.map((v, i) => v + ray.dir[i] * best) }
      : null;
  }
  function draw(m: Mesh, signs: SignAtlas, { separateInterior = false } = {}) {
    const start = m.data.length;
    let definition: ReturnType<typeof drawBerkeleyCampus> | undefined;
    pose(m, p.x, base, p.z, p.angle, () => {
      definition = drawBerkeleyCampus(m, signs, ALIEN_SITE_SIGNS[1]);
    });
    const entry = point(0.8, 2.65);
    const inside = point(0, 7.25),
      site: Site & { start: number; count: number; lo: number[]; hi: number[] } = alienSiteBounds(
        m,
        start,
        {
          enterableInstitute: true,
          inside: { x: inside.x - 0.5, y: inside.z - 0.5 },
          id: 'berkeley-esoteric',
          kind: 'esoteric-institute',
          label: contentText('alien-sites.draw.label-3', {}),
          entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
          base,
          description: contentText('alien-sites.draw.description-4', {}),
        },
      );
    if (separateInterior) {
      site.interior = detachInstituteMesh(
        m,
        requiredValue(definition, 'Berkeley interior definition'),
      );
      const center = point(BERKELEY_INSTITUTE_ROOM.x, BERKELEY_INSTITUTE_ROOM.z);
      site.interior.spec = {
        ...BERKELEY_INSTITUTE_ROOM,
        x: center.x,
        z: center.z,
        base,
        rotation: p.angle,
      };
      site.count = m.data.length - start;
    }
    return site;
  }
  const n = point(0.6, 7.6),
    a = point(-0.3, 7.4);
  const npc: import('./types/world.ts').Actor = {
    id: 'esoteric-professor',
    name: contentText('alien-sites.createEsotericCampus.name-5', {}),
    label: contentText('alien-sites.createEsotericCampus.label-6', {}),
    questRole: 'esoteric',
    x: n.x,
    z: n.z,
    base: ground(),
    skin: '#b58c6d',
    shirt: '#6e8c83',
    hair: '#b6b5a3',
    female: true,
    longHair: true,
    angle: p.angle + Math.PI,
    regional: true,
    approach: { x: a.x - 0.5, y: a.z - 0.5 },
    description: contentText('alien-sites.createEsotericCampus.description-7', {}),
  };
  const routes = [
    [-5, 4, -5, 14.6] satisfies [number, number, number, number],
    [5, 4, 5, 14.6] satisfies [number, number, number, number],
    [-5, 12.4, 5, 12.4] satisfies [number, number, number, number],
  ].map(([u, v, x, z], i) => ({
    name: contentText('alien-sites.createEsotericCampus.name-8', { v0: i }),
    kind: 'path',
    halfWidth: 0.4,
    points: [[u, v] satisfies [number, number], [x, z] satisfies [number, number]].map(([a, b]) => {
      const q = point(a, b);
      return [q.x, q.z];
    }),
  }));
  function drawHomes(m: Mesh) {
    const homes: import('./types/world.ts').RenderedSite[] = [];
    for (const [i, home] of BERKELEY_HOMES.entries()) {
      const start = m.data.length;
      const [left, front, right, back] = home.rect,
        x = (left + right) / 2,
        z = (front + back) / 2;
      const w = right - left,
        d = back - front,
        roof = i % 2 ? '#596966' : '#824f46';
      const isLab = home.id === MAD_HOUSE.id;
      const parts: import('./types/interiors.ts').InteriorSection[] = [];
      let interiorStart = 0,
        interiorEnd = 0;
      pose(m, p.x, base, p.z, p.angle, () => {
        m.box(left - 0.16, 0.015, front - 0.45, w + 0.32, 0.12, d + 0.56, '#978b74', 'brick');
        if (isLab) {
          interiorStart = m.data.length;
          for (const side of [0, 1, 2, 3])
            recordInstitutePart(m, parts, 'wall', side, () =>
              drawInstituteWall(m, MAD_HOUSE, side, 2.34, home.color, '#dfd3b3'),
            );
          recordInstitutePart(m, parts, 'furniture', null, () => {
            m.box(left + 0.38, 0.14, back - 0.82, 1.12, 0.69, 0.41, '#725e50', 'wood');
            m.cylinder(left + 0.65, 0.83, back - 0.61, 0.12, 0.33, '#9daea6', 10, 0.09, 'glass');
          });
        } else {
          m.box(left, 0.13, front, w, 1.75, d, home.color, 'clapboard');
          m.box(x - 0.28, 0.14, front - 0.038, 0.56, 1.18, 0.05, '#54483d', 'wood');
          m.box(x - 0.72, 1.42, front - 0.48, 1.44, 0.085, 0.58, roof, 'shingles');
          for (const dx of [-0.62, 0.62])
            m.box(x + dx - 0.027, 0.13, front - 0.44, 0.054, 1.31, 0.054, '#dfd1af', 'wood');
          for (const dx of [-w * 0.31, w * 0.31])
            drawFacadeWindow(m, {
              plane: front - 0.012,
              along: x + dx,
              y: 0.64,
              w: 0.58,
              h: 0.74,
              style: 'office',
              trim: '#f4dfb6',
              seed: i + dx,
            });
        }
        const roofY = isLab ? 2.33 : 1.87;
        const drawRoof = () => {
          for (const side of [-1, 1]) {
            const edge = x + side * (w / 2 + 0.18);
            m.quad(
              [edge, roofY, front - 0.2],
              [edge, roofY, back + 0.16],
              [x, roofY + 0.78, back + 0.16],
              [x, roofY + 0.78, front - 0.2],
              roof,
              'shingles',
            );
          }
          for (const edge of [front - 0.01, back + 0.01])
            m.tri(
              [left, roofY, edge],
              [right, roofY, edge],
              [x, roofY + 0.77, edge],
              home.color,
              'clapboard',
            );
          m.box(right - 0.54, roofY - 0.15, z + 0.38, 0.39, 1.02, 0.44, '#8f6c57', 'brick');
          m.box(right - 0.6, roofY + 0.85, z + 0.32, 0.51, 0.12, 0.56, '#a78d73', 'stone');
        };
        if (isLab) {
          recordInstitutePart(m, parts, 'roof', null, drawRoof);
          interiorEnd = m.data.length;
        } else drawRoof();
        for (const dx of [-w * 0.37, w * 0.37]) {
          m.box(x + dx - 0.29, 0.1, front - 0.4, 0.58, 0.18, 0.23, '#996750', 'brick');
          for (let j = 0; j < 5; j++) {
            const u = x + dx - 0.22 + j * 0.11;
            m.sphere(
              u,
              0.31,
              front - 0.28,
              0.12,
              0.13 + (j % 2) * 0.07,
              0.13,
              j % 2 ? '#587b54' : '#7c9560',
              7,
              5,
            );
            m.sphere(
              u,
              0.46 + (j % 2) * 0.06,
              front - 0.28,
              0.042,
              0.034,
              0.046,
              j % 2 ? '#bb89b2' : '#e5c674',
              6,
              4,
            );
          }
        }
      });
      const approach = point(x, front - (isLab ? 0.34 : 0.64)),
        inside = point(x, front + 0.68);
      const site = alienSiteBounds(m, start, {
        id: home.id,
        kind: isLab ? 'mad-scientist-house' : 'berkeley-house',
        label: isLab
          ? 'Scientist’s House'
          : ['Claremont Bungalow', '', 'Berkeley Craftsman', 'Eucalyptus Cottage', 'Oak Bungalow'][
              i
            ],
        entry: { x: approach.x - 0.5, y: approach.z - 0.5 },
        description: isLab
          ? 'A weathered Craftsman house. Warm air escapes through its foundation.'
          : 'A modest Berkeley house with a brick front walk and a planted porch.',
        ...(isLab && {
          inside: { x: inside.x - 0.5, y: inside.z - 0.5 },
          enterableInstitute: true,
        }),
        base,
      });
      const room = point(MAD_HOUSE.x, MAD_HOUSE.z);
      const interior = isLab
        ? detachInstituteMesh(m, { start: interiorStart, end: interiorEnd, parts, spec: MAD_HOUSE })
        : null;
      if (interior) {
        interior.spec = { ...MAD_HOUSE, x: room.x, z: room.z, base, rotation: p.angle };
        site.count = m.data.length - start;
      }
      homes.push({ ...site, ...(interior ? { interior } : {}) });
    }
    const door = point(MAD_HOUSE.x + 0.94, MAD_HOUSE.z + 0.78);
    const start = m.data.length;
    pose(m, door.x, base + 0.15, door.z, p.angle, () => {
      m.box(-0.36, 0, -0.4, 0.72, 0.055, 0.8, '#9a4e35', { metal: 0.6 });
      for (const x of [-0.23, 0, 0.23])
        m.box(x - 0.036, 0.057, -0.3, 0.072, 0.012, 0.6, '#d48b45', { emissive: 0.25 });
      m.rod([-0.15, 0.12, 0.24], [0.15, 0.12, 0.24], 0.03, '#414449', 6);
    });
    homes.push(
      alienSiteBounds(m, start, {
        id: HOT_TRAPDOOR,
        kind: 'hot-trapdoor',
        label: 'Hot trapdoor',
        entry: { x: door.x - 0.5, y: door.z - 0.5 },
        base,
        description: 'Heat radiates from the iron trapdoor.',
      }),
    );
    return homes;
  }
  const madScientistSpawn = {
    id: 'berkeley-mad-scientist',
    combatKind: 'mad-scientist',
    ...point(MAD_HOUSE.x - 0.75, MAD_HOUSE.z + 0.3),
  };
  function drawChurch(m: Mesh) {
    const start = m.data.length;
    const church = layout.buildings.find((building) => building.id === 'unusual-church')!;
    const [left, front, right, back] = church.rect;
    const center = (left + right) / 2;
    pose(m, p.x, base, p.z, p.angle, () => {
      m.box(left, 0, front, right - left, 1.85, back - front, '#ddd0b5', 'clapboard');
      for (const [a, b] of [
        [left - 0.08, center],
        [right + 0.08, center],
      ]) {
        m.quad(
          [a, 1.83, front - 0.12],
          [a, 1.83, back + 0.12],
          [b, 2.64, back + 0.12],
          [b, 2.64, front - 0.12],
          '#5c6663',
          'shingles',
        );
      }
      for (const z of [front, back])
        m.tri([left, 1.8, z], [right, 1.8, z], [center, 2.62, z], '#e3d6ba', 'clapboard');
      m.box(center - 0.34, 0.075, front - 0.042, 0.68, 1.25, 0.05, '#56453b', 'wood');
      m.box(center - 0.48, 0.015, front - 0.35, 0.96, 0.1, 0.36, '#ab9e87', 'stone');
      m.box(center - 0.19, 2.47, front + 0.22, 0.38, 0.39, 0.38, '#dfd4bd', 'wood');
      m.cylinder(center, 2.85, front + 0.41, 0.3, 0.75, '#565e5b', 4, 0.018, 'roof');
      m.rod([center, 3.52, front + 0.41], [center, 3.95, front + 0.41], 0.027, '#6e6659', 6);
      m.rod(
        [center - 0.13, 3.81, front + 0.41],
        [center + 0.13, 3.81, front + 0.41],
        0.025,
        '#6e6659',
        6,
      );
      for (const direction of [-1, 1]) {
        const x = center + direction * 0.78;
        m.box(x - 0.15, 0.78, front - 0.031, 0.3, 0.67, 0.04, '#6c6655', 'wood');
        m.box(
          x - 0.105,
          0.825,
          front - 0.04,
          0.21,
          0.58,
          0.035,
          direction === -1 ? '#879ba6' : '#b49c67',
          'glass',
        );
      }
      m.box(right - 0.38, 0.36, front - 0.18, 0.25, 0.52, 0.17, '#807055', 'wood');
      m.box(right - 0.35, 0.53, front - 0.191, 0.19, 0.29, 0.025, '#e6dbbc');
    });
    const entry = point(center, front - 0.63);
    return alienSiteBounds(m, start, {
      id: church.id,
      kind: 'unusual-church',
      label: 'Unusual Church',
      description:
        'A plain chapel with a service schedule by the door. In the fine print, you spot “Printed with support from the Powerful and Evil Goose Corporation.”',
      entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
      base,
      navigationPolygons: [quad(church.rect).map(([x, , z]) => [x, z])],
    });
  }
  const churchgoers: import('./types/world.ts').Actor[] = [
    {
      id: 'berkeley-churchgoer-1',
      label: 'Churchgoer',
      name: 'Mara',
      u: -6.55,
      v: 11.8,
      female: true,
      skin: '#a9745a',
      shirt: '#77898a',
    },
    {
      id: 'berkeley-churchgoer-2',
      label: 'Churchgoer',
      name: 'Elias',
      u: -5.85,
      v: 15.65,
      skin: '#c69d76',
      shirt: '#736d80',
    },
  ].map(({ u, v, ...person }) => {
    const approach = point(u + 0.94, v);
    return {
      ...person,
      ...point(u, v),
      approach: { x: approach.x - 0.5, y: approach.z - 0.5 },
      kind: 'churchgoer',
      base: ground(),
      angle: p.angle + Math.PI / 2,
      regional: true,
      stationary: true,
      height: 1.85,
      description: 'They carry a folded order of service from the chapel.',
    };
  });
  const surfaceType = (x: number, z: number) => {
    const q = local(x, z);
    return !clearLocal(q.u, q.v)
      ? 'building'
      : layout.paths.some((r) => inRect(q.u, q.v, r))
        ? 'sidewalk'
        : 'grass';
  };
  return {
    gate,
    base,
    point,
    local,
    contains,
    ground,
    segment,
    path,
    raycast,
    draw,
    drawChurch,
    drawHomes,
    madScientistSpawn,
    churchgoers,
    npc,
    quads,
    mapFeatures,
    routes,
    surfaceType,
    layout,
    graph,
    life: null as ReturnType<typeof import('./life.ts').createCityLife> | null,
  };
}
