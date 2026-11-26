import type { Point, Ray } from './types/geometry.ts';
import type { Actor, Site, SignAtlas } from './types/world.ts';
import { requiredValue } from './types/assert.ts';
import { BURNING_MAN } from './burning-man.ts';
import { BERKELEY_HOUSE_SEARCHES } from './config/search-houses.ts';
import { WAYWARD_CAMP_CROSSINGS, WAYWARD_CAMP_PARCELS } from './config/wayward-camp.ts';
import { searchHome } from './search-houses.ts';
import { searchHouseFurniture } from './search-house-models.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import type { Mesh } from './geometry.ts';
import { pose, rayTriangle } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import { drawFacadeWindow } from './windows.ts';
import { makeSuburbanHome } from './suburban-homes.ts';
import { drawStreetLamp } from './lighting.ts';
import { EAST_BAY_GRASS_COLOR, EAST_BAY_SHORE, eastBayShoreX } from './geography.ts';
import { drawNeighborhoodFlag } from './neighborhood-flags.ts';
import { createNavigationGrid } from './navigation.ts';
import { LAB_SIGN } from './berkeley-lab.ts';
import { CHURCH_STAIRS_DOWN, CHURCH_STAIRWELL } from './church-basement-layout.ts';
import { drawChurchStairwell } from './church-basement.ts';
import {
  CEDAR_SAUNA,
  SAUNA_FLOOR_TOP,
  SAUNA_GUEST,
  SAUNA_OBSTACLES,
  drawCedarSauna,
} from './cedar-sauna.ts';
import {
  instituteWalkable,
  instituteWallRects,
  recordInstitutePart,
  drawInstituteWall,
  detachInstituteMesh,
} from './institute-interiors.ts';
import {
  BERKELEY_CAMPUS,
  BERKELEY_SIDEWALKS,
  BERKELEY_CHURCH_ROOM,
  BERKELEY_NEIGHBORHOOD,
  BERKELEY_INSTITUTE_ROOM,
  BERKELEY_HOMES,
  BERKELEY_LIFE_ROUTES,
  BERKELEY_SHORE_GATE,
  BERKELEY_VILLAGE_HOMES,
  MAD_HOUSE,
  HOT_TRAPDOOR,
  drawBerkeleyCampus,
  drawBerkeleyPlayground,
  berkeleyHomeFront,
} from './berkeley-campus.ts';

const CHURCH_NOTICEBOARD = 'CHURCH NOTICEBOARD';
export const ALIEN_SITE_SIGNS = Object.freeze([
  'AMERICAN INDUSTRIAL CENTER',
  'BERKELEY INSTITUTE\nFOR ESOTERIC STUDIES',
  CHURCH_NOTICEBOARD,
] satisfies [string, string, string]);
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
  const campParcels = WAYWARD_CAMP_PARCELS.map(({ x, z, w, d }) => ({
    ...local(x, z),
    halfWidth: w / 2 + 0.18,
    halfDepth: d / 2 + 0.18,
  }));
  const shore = point(BERKELEY_SHORE_GATE, 0);
  const regionalGates = [
    gate,
    ...[shore, ...WAYWARD_CAMP_CROSSINGS].map(({ x, z }) => ({ x: x - 0.5, y: z - 0.5 })),
  ];
  const inRect = (u: number, v: number, [a, b, d, e]: number[], pad = 0) =>
    u >= a - pad - 1e-8 && u <= d + pad + 1e-8 && v >= b - pad - 1e-8 && v <= e + pad + 1e-8;
  const inStrip = (u: number, v: number, strip: number[][]) =>
    strip.every(([a, b], i) => {
      const [x, z] = strip[(i + 1) % strip.length];
      return (x - a) * (v - b) - (z - b) * (u - a) <= 1e-8;
    });
  const groundRects = [
    ...layout.grounds,
    layout.highwayShoulders,
    ...layout.paths,
    ...layout.roads,
  ];
  const coversLocal = (u: number, v: number) =>
    inRect(u, v, layout.bounds) &&
    (groundRects.some((rect) => inRect(u, v, rect)) ||
      layout.dirtPaths.some((strip) => inStrip(u, v, strip)));
  const coversGround = (x: number, z: number) => {
    const { u, v } = local(x, z);
    return coversLocal(u, v);
  };
  // Give the campus and countryside grids overlapping walkable land at the
  // campus edge so short walks can cross it in a single navigation graph.
  const shoreOverlap = 3;
  const connectsToShore = (u: number, v: number) => {
    if (!inRect(u, v, layout.bounds, shoreOverlap)) return false;
    if (!groundRects.some((rect) => inRect(u, v, rect, shoreOverlap))) return false;
    const { x, z } = point(u, v);
    return x >= eastBayShoreX(z) + EAST_BAY_SHORE.walkClearance;
  };
  const searchableResidences = BERKELEY_VILLAGE_HOMES.flatMap((house) => {
    const search = BERKELEY_HOUSE_SEARCHES[house.id as keyof typeof BERKELEY_HOUSE_SEARCHES];
    if (!search) return [];
    const [left, top, right, bottom] = house.rect;
    const u = (left + right) / 2,
      v = (top + bottom) / 2,
      w = right - left,
      d = bottom - top,
      doorway = berkeleyHomeFront(house),
      direction = house.facing === 'north' ? -1 : 1,
      furniture = Object.values(searchHouseFurniture(w, d));
    return [
      {
        house,
        home: searchHome(
          house.id,
          { ...point(u, v), w, d, rotation: p.angle + doorway.rotation },
          search,
        ),
        walkable(x: number, z: number) {
          const dx = (x - u) * direction,
            roomX = dx + w / 2,
            roomZ = (z - v) * direction + d / 2;
          if (Math.abs(dx) <= 0.34 && roomZ >= d - 0.25) return true;
          return (
            roomX >= 0.23 &&
            roomX <= w - 0.23 &&
            roomZ >= 0.23 &&
            roomZ <= d - 0.23 &&
            !furniture.some((rect) => inRect(roomX, roomZ, rect, 0.1))
          );
        },
      },
    ];
  });
  const searchableById = new Map(
    searchableResidences.map((residence) => [residence.house.id, residence]),
  );
  const roomWalls = [MAD_HOUSE, BERKELEY_CHURCH_ROOM].map((room) => ({
    room,
    walls: [0, 1, 2, 3].flatMap((side) => instituteWallRects(room, side)),
  }));
  const churchPews = [-1.45, -0.55, 0.35, 1.25].flatMap((v) =>
    [-2.3, 0.92].map((u) => ({ u, v, w: 1.38, d: 0.38 })),
  );
  const clearRoom = (id: string, u: number, v: number) => {
    const residence = searchableById.get(id);
    if (residence) return residence.walkable(u, v);
    const entry = roomWalls.find(({ room }) => room.id === id);
    if (!entry) return id === 'institute' && instituteWalkable(BERKELEY_INSTITUTE_ROOM, u, v);
    const { room, walls } = entry;
    const x = u - room.x,
      z = v - room.z;
    return (
      !walls.some((wall) =>
        inRect(x, z, [wall.x, wall.z, wall.x + wall.w, wall.z + wall.d], 0.16),
      ) &&
      (id !== BERKELEY_CHURCH_ROOM.id ||
        (!inRect(
          x,
          z,
          [CHURCH_STAIRWELL.west, CHURCH_STAIRWELL.north, CHURCH_STAIRWELL.east, CHURCH_STAIRWELL.south],
          0.16,
        ) &&
          !churchPews.some((pew) => inRect(x, z, [pew.u, pew.v, pew.u + pew.w, pew.v + pew.d], 0.16))))
    );
  };
  const clearLocal = (u: number, v: number) => {
    if (!coversLocal(u, v) && !connectsToShore(u, v)) return false;
    if (campParcels.some((parcel) =>
      Math.abs((u - parcel.u) * c - (v - parcel.v) * s) <= parcel.halfWidth &&
      Math.abs((u - parcel.u) * s + (v - parcel.v) * c) <= parcel.halfDepth,
    )) return false;
    if (Math.hypot(u - BURNING_MAN.u, v - BURNING_MAN.v) < 0.59) return false;
    if (SAUNA_OBSTACLES.some((rect) => inRect(u - CEDAR_SAUNA.x, v - CEDAR_SAUNA.z, rect, 0.16)))
      return false;
    for (const b of layout.buildings)
      if (b.id !== CEDAR_SAUNA.id && inRect(u, v, b.rect, 0.16) && !clearRoom(b.id, u, v))
        return false;
    if (layout.obstacles.some((o) => Math.hypot(u - o.u, v - o.v) < o.r + 0.16)) return false;
    return !layout.trees.some(([x, z]) => Math.hypot(u - x, v - z) < 0.3);
  };
  const contains = (x: number, z: number) => {
    const q = local(x, z);
    return clearLocal(q.u, q.v);
  };
  const ground = () => base + 0.015;
  const resolution = 4,
    west = layout.bounds[0] - shoreOverlap,
    north = layout.bounds[1] - shoreOverlap,
    width = (layout.bounds[2] + shoreOverlap - west) * resolution,
    height = (layout.bounds[3] + shoreOverlap - north) * resolution;
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
  function nearest(
    x: number,
    y: number,
    radius = 3,
    predicate: (x: number, y: number) => boolean = () => true,
  ) {
    const origin = graphPoint(local(x + 0.5, y + 0.5));
    const found = graph.nearest(origin.x, origin.y, radius, (x, y) => {
      const at = worldPoint({ x, y });
      return predicate(at.x, at.y);
    });
    return found && worldPoint(found);
  }
  function segment(a: { x: number; y: number }, b: { x: number; y: number }) {
    return graph.segment(
      graphPoint(local(a.x + 0.5, a.y + 0.5)),
      graphPoint(local(b.x + 0.5, b.y + 0.5)),
    );
  }
  function internal(a: Point, b: Point) {
    const route = graph.path(
      graphPoint(local(a.x + 0.5, a.y + 0.5)),
      graphPoint(local(b.x + 0.5, b.y + 0.5)),
    );
    return (
      route?.map((waypoint, index) => (index === route.length - 1 ? b : worldPoint(waypoint))) ??
      null
    );
  }
  function path(
    from: { x: number; y: number },
    to: { x: number; y: number },
    basePath: (from: Point, to: Point) => Point[] | null | undefined,
    onCountryside?: (point: Point) => boolean,
  ) {
    const a = contains(from.x + 0.5, from.y + 0.5),
      b = contains(to.x + 0.5, to.y + 0.5);
    if (!a && !b) return basePath(from, to);
    if (a && b) return internal(from, to);
    const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
    const routeDistance = (route: Point[]) =>
      route.reduce((total, point, i) => total + distance(i ? route[i - 1] : from, point), 0);
    // Walk through the overlap directly when the countryside graph serves both ends.
    let shortest = onCountryside?.(from) && onCountryside(to) ? basePath(from, to) ?? null : null;
    let bestDistance = shortest ? routeDistance(shortest) : Infinity;
    const crossings = regionalGates
      .map((entry) => ({ entry, lowerBound: distance(from, entry) + distance(entry, to) }))
      .sort((p, q) => p.lowerBound - q.lowerBound);
    for (const { entry, lowerBound } of crossings) {
      if (lowerBound >= bestDistance) break;
      const head = a ? internal(from, entry) : basePath(from, entry);
      if (!head) continue;
      const tail = b ? internal(entry, to) : basePath(entry, to);
      if (!tail) continue;
      const route = [...head, ...tail];
      const distanceWalked = routeDistance(route);
      if (distanceWalked < bestDistance) {
        shortest = route;
        bestDistance = distanceWalked;
      }
    }
    return shortest;
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
  const footprint = (rect: readonly number[]) => quad(rect).map(([x, , z]) => [x, z]);
  const saunaFootprints = SAUNA_OBSTACLES.map(([left, back, right, front]) =>
    footprint([
      CEDAR_SAUNA.x + left,
      CEDAR_SAUNA.z + back,
      CEDAR_SAUNA.x + right,
      CEDAR_SAUNA.z + front,
    ]),
  );
  const wallFootprints = (
    room: typeof MAD_HOUSE | typeof BERKELEY_CHURCH_ROOM | typeof BERKELEY_INSTITUTE_ROOM,
  ) =>
    [0, 1, 2, 3]
      .flatMap((side) => instituteWallRects(room, side))
      .map(({ x, z, w, d }) => footprint([room.x + x, room.z + z, room.x + x + w, room.z + z + d]));
  const groundQuads = layout.grounds.map(quad);
  const stripQuad = (polygon: number[][]) =>
    polygon.map(([u, v]) => {
      const q = point(u, v);
      return [q.x, ground(), q.z];
    });
  const quads = [...groundRects.map(quad), ...layout.dirtPaths.map(stripQuad)];
  const mapFeatures = [
    ...groundQuads.map((polygon) => ({ polygon, color: '#879c78' })),
    ...layout.parks.map((rect) => ({ polygon: quad(rect), color: '#729063' })),
    ...layout.paths.map((rect) => ({ polygon: quad(rect), color: '#c8c6b1' })),
    ...layout.crookedWalks.map((strip) => ({ polygon: stripQuad(strip), color: '#c8c6b1' })),
    ...layout.dirtPaths.map((strip) => ({ polygon: stripQuad(strip), color: '#ae9870' })),
    ...layout.roads.map((rect) => ({ polygon: quad(rect), color: '#727573' })),
    ...layout.crookedRoads.map((strip) => ({ polygon: stripQuad(strip), color: '#727573' })),
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
    // Use the same world-space projection as the surrounding East Bay grass.
    for (const polygon of groundQuads) {
      const [a, b, c, d] = polygon.map(([x, , z]) => [x, base, z]);
      m.quad(a, b, c, d, EAST_BAY_GRASS_COLOR, 'grass');
    }
    for (const [left, , right] of layout.crossings) {
      const a = car.sample(p.distance + left + 0.14),
        b = car.sample(p.distance + right - 0.14);
      for (const v of [-0.37, -0.13, 0.11, 0.35]) {
        const stripe = (at: typeof a, offset: number) => [
          at.x - offset * s,
          at.y + 0.008,
          at.z + offset * c,
        ];
        m.quad(stripe(a, v), stripe(a, v + 0.07), stripe(b, v + 0.07), stripe(b, v), '#e0d9bf');
      }
    }
    let definition: ReturnType<typeof drawBerkeleyCampus> | undefined;
    pose(m, p.x, base, p.z, p.angle, () => {
      definition = drawBerkeleyCampus(m, signs, ALIEN_SITE_SIGNS[1]);
    });
    const instituteGeometry = requiredValue(definition, 'Berkeley interior definition');
    const start = instituteGeometry.start;
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
          navigationPolygons: [
            ...wallFootprints(BERKELEY_INSTITUTE_ROOM),
            ...layout.buildings
              .filter(({ id }) => ['campanile', 'library', 'reading-room'].includes(id))
              .map(({ rect }) => footprint(rect)),
          ],
          label: contentText('alien-sites.draw.label-3', {}),
          entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
          base,
          description: contentText('alien-sites.draw.description-4', {}),
        },
      );
    if (separateInterior) {
      site.interior = detachInstituteMesh(m, instituteGeometry);
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
  const residentialRoutes = BERKELEY_SIDEWALKS.map(([a, b, c, d]) =>
    c - a > d - b
      ? [a + 0.1, (b + d) / 2, c - 0.1, (b + d) / 2]
      : [(a + c) / 2, b + 0.1, (a + c) / 2, d - 0.1],
  );
  const routes = [
    ...residentialRoutes,
    [-5, 4, -5, 14.6] satisfies [number, number, number, number],
    [5, 4, 5, 14.6] satisfies [number, number, number, number],
    [-5, 12.4, 5, 12.4] satisfies [number, number, number, number],
    [9.6, 4, 9.6, 17.1] satisfies [number, number, number, number],
    [-9.97, 4, -9.97, 17.1] satisfies [number, number, number, number],
  ].map(([u, v, x, z], i) => ({
    name: contentText('alien-sites.createEsotericCampus.name-8', { v0: i }),
    kind: 'path',
    halfWidth: v < 0 ? 0 : i >= residentialRoutes.length + 3 ? 0.22 : 0.4,
    points: [[u, v] satisfies [number, number], [x, z] satisfies [number, number]].map(([a, b]) => {
      const q = point(a, b);
      return [q.x, q.z];
    }),
  }));
  const lampPosts = layout.streetLamps.map(({ u, v, angle, style }) => ({
    ...point(u, v),
    angle: p.angle + angle,
    style,
  }));
  function drawStreetlights(m: Mesh) {
    return lampPosts.flatMap(({ x, z, angle, style }) =>
      drawStreetLamp(m, x, ground(), z, angle, style),
    );
  }
  function drawPlayground(m: Mesh) {
    const start = m.data.length;
    pose(m, p.x, base, p.z, p.angle, () => drawBerkeleyPlayground(m));
    const entry = point(...layout.playground.entry);
    return alienSiteBounds(m, start, {
      id: layout.playground.id,
      kind: 'park',
      label: layout.playground.label,
      description: 'A little neighborhood playground with swings, a yellow slide and a sandpit.',
      entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
      solid: false,
      base,
    });
  }
  const lifeRoutes = BERKELEY_LIFE_ROUTES.map((route) => ({
    ...route,
    points: route.points.map(([u, v]) => {
      const world = point(u, v);
      return [world.x, world.z];
    }),
  }));
  const homesWithFlags = new Set([
    'bay-victorian-blue',
    'bay-victorian-coral',
    'bay-victorian-mint',
  ]);
  function drawHomes(m: Mesh) {
    const homes: import('./types/world.ts').RenderedSite[] = [];
    for (const [i, home] of [
      ...BERKELEY_HOMES,
      ...BERKELEY_NEIGHBORHOOD,
      ...BERKELEY_VILLAGE_HOMES,
    ].entries()) {
      if (searchableById.has(home.id)) continue;
      const start = m.data.length;
      const [west, north, east, south] = home.rect,
        x = (west + east) / 2,
        z = (north + south) / 2;
      const sideways = home.facing === 'east' || home.facing === 'west',
        w = sideways ? south - north : east - west,
        d = sideways ? east - west : south - north,
        left = x - w / 2,
        right = x + w / 2,
        front = z - d / 2,
        back = z + d / 2,
        roof = ['#596966', '#824f46', '#605b55', '#5b666e'][i % 4];
      const isLab = home.id === MAD_HOUSE.id;
      const style = home.style;
      const lowRise = style === 'bungalow' || style === 'craftsman' || style === 'eichler';
      const victorian = style === 'victorian';
      const stories = victorian ? 2.75 + (i % 3) * 0.1 : 1.75;
      const roofRise = victorian ? 0.62 + (i % 3) * 0.13 : 0.78;
      const parts: import('./types/interiors.ts').InteriorSection[] = [];
      let interiorStart = 0,
        interiorEnd = 0;
      const drawHouse = () => {
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
          m.box(left, 0.13, front, w, stories, d, home.color, 'clapboard');
          if (victorian) {
            const trim = '#f3e5d0';
            const bay = x + (i % 2 ? -0.51 : 0.51);
            const step = x - (i % 2 ? -0.51 : 0.51);
            m.box(left - 0.035, 0.13, front - 0.028, w + 0.07, 0.34, 0.08, '#948875', 'stone');
            for (const y of [1.51, stories + 0.01]) {
              m.box(left - 0.05, y, front - 0.035, w + 0.1, 0.09, 0.12, trim, 'wood');
              for (let u = left + 0.12; u < right - 0.06; u += 0.21)
                m.box(u, y - 0.15, front - 0.078, 0.058, 0.16, 0.097, trim, 'wood');
            }
            for (const y of [0.52, 1.69]) {
              m.box(bay - 0.29, y - 0.08, front - 0.23, 0.58, 0.98, 0.26, home.color, 'clapboard');
              drawFacadeWindow(m, {
                plane: front - 0.241,
                along: bay,
                y: y + 0.065,
                w: 0.42,
                h: 0.69,
                far: true,
                trim,
                seed: i,
              });
              for (const side of [-1, 1]) {
                const outer = bay + side * 0.46,
                  inner = bay + side * 0.29;
                m.quad(
                  [outer, y - 0.08, front],
                  [inner, y - 0.08, front - 0.23],
                  [inner, y + 0.9, front - 0.23],
                  [outer, y + 0.9, front],
                  trim,
                  'wood',
                );
                m.rod(
                  [inner, y + 0.03, front - 0.235],
                  [outer, y + 0.03, front - 0.006],
                  0.023,
                  trim,
                  5,
                );
              }
            }
            drawFacadeWindow(m, {
              plane: front - 0.018,
              along: step,
              y: 1.75,
              w: 0.52,
              h: 0.67,
              far: true,
              trim,
              seed: i + 1,
            });
            m.box(step - 0.27, 0.42, front - 0.047, 0.54, 1.0, 0.072, '#584e47', 'wood');
            m.box(step - 0.195, 1.01, front - 0.055, 0.39, 0.32, 0.032, '#879c9b', 'glass');
            m.sphere(step + 0.16, 0.86, front - 0.063, 0.027, 0.027, 0.027, '#bb9a59', 8, 5);
            m.box(step - 0.34, 1.42, front - 0.25, 0.68, 0.11, 0.31, trim, 'wood');
            for (let n = 0; n < 3; n++)
              m.box(
                step - 0.34,
                0.023 + n * 0.13,
                front - 0.57 + n * 0.15,
                0.68,
                0.13,
                0.58 - n * 0.15,
                '#a59782',
                'stone',
              );
            if (homesWithFlags.has(home.id))
              drawNeighborhoodFlag(m, {
                x,
                y: 1.44,
                z: front - 0.034,
                angle: Math.PI,
                width: 0.67,
              });
            const atticY = stories + 0.24;
            drawFacadeWindow(m, {
              plane: front - 0.019,
              along: x,
              y: atticY,
              w: 0.35,
              h: 0.34,
              far: true,
              trim,
              seed: i + 2,
            });
            for (const side of [-1, 1])
              m.rod(
                [x + side * (w / 2 + 0.14), stories + 0.14, front - 0.14],
                [x, stories + 0.12 + roofRise, front - 0.14],
                0.03,
                trim,
                6,
              );
            for (const [plane, far] of [
              [left - 0.012, true],
              [right + 0.012, false],
            ] as const)
              for (const y of [0.65, 1.76])
                drawFacadeWindow(m, {
                  isX: true,
                  plane,
                  along: z + 0.35,
                  y,
                  w: 0.44,
                  h: 0.63,
                  far,
                  trim,
                  seed: i,
                });
            for (const dx of [-0.49, 0.49])
              drawFacadeWindow(m, {
                plane: back + 0.012,
                along: x + dx,
                y: 1.76,
                w: 0.46,
                h: 0.63,
                trim,
                seed: i,
              });
          }
          if (style === 'commune') {
            for (const dx of [-1.45, 1.45])
              m.box(
                x + dx - 0.22,
                1.5,
                front - 0.075,
                0.44,
                0.17,
                0.1,
                dx < 0 ? '#ab655b' : '#739d85',
                'wood',
              );
            for (let j = 0; j < 6; j++) {
              const u = left + 0.25 + j * 0.21,
                z = back - 0.16,
                y = 0.64 + (j % 3) * 0.11;
              m.rod([u, 0.18, z], [u, y, z], 0.018, '#5f7b45', 5);
              m.sphere(u, y, z, 0.11, 0.11, 0.043, '#d6ab45', 9, 5);
              m.sphere(u, y, z - 0.042, 0.053, 0.057, 0.022, '#715039', 8, 4);
            }
            m.box(left + 0.1, 0.065, back - 0.29, 1.38, 0.2, 0.35, '#8b714d', 'wood');
          }
          if (!victorian) {
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
        }
        const roofY = isLab ? 2.33 : stories + 0.12;
        const drawRoof = () => {
          for (const side of [-1, 1]) {
            const edge = x + side * (w / 2 + 0.18);
            m.quad(
              [edge, roofY, front - 0.2],
              [edge, roofY, back + (victorian ? 0.045 : 0.16)],
              [x, roofY + roofRise, back + (victorian ? 0.045 : 0.16)],
              [x, roofY + roofRise, front - 0.2],
              roof,
              'shingles',
            );
          }
          for (const edge of [front - 0.01, back + 0.01])
            m.tri(
              [left, roofY, edge],
              [right, roofY, edge],
              [x, roofY + roofRise - 0.01, edge],
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
      };
      const doorway = berkeleyHomeFront(home, isLab ? 0.44 : 0.64);
      pose(m, p.x, base, p.z, p.angle, () => {
        if (lowRise)
          makeSuburbanHome(
            m,
            {
              x,
              z,
              w,
              d,
              seed: 0.13 + (i % 7) * 0.107,
              rotation: doorway.rotation,
              lowRiseStyle: style,
            },
            { height: () => 0, cutPlot: () => {} },
            home.color,
          );
        else if (style === 'sauna') pose(m, x, 0, z, 0, drawCedarSauna);
        else if (isLab) drawHouse();
        else {
          const turn = doorway.rotation + Math.PI;
          const c = Math.cos(turn),
            s = Math.sin(turn);
          pose(m, x - x * c + z * s, 0, z - x * s - z * c, turn, drawHouse);
        }
      });
      const approach = point(doorway.u, doorway.v),
        inside = point(x, back - 0.68);
      const site = alienSiteBounds(m, start, {
        id: home.id,
        kind: isLab ? 'mad-scientist-house' : 'berkeley-house',
        label: home.label,
        navigationPolygons: isLab
          ? wallFootprints(MAD_HOUSE)
          : style === 'sauna'
            ? saunaFootprints
            : [footprint(home.rect)],
        entry: { x: approach.x - 0.5, y: approach.z - 0.5 },
        description: isLab
          ? 'A weathered Craftsman house. Warm air escapes through its foundation.'
          : style === 'sauna'
            ? CEDAR_SAUNA.description
            : style === 'commune'
              ? 'The residents share a big kitchen, a garden and the porch. Painted shutters mark the rooms.'
              : victorian
                ? 'A narrow painted Victorian with a bay window, gingerbread trim and a steep roof.'
                : style === 'eichler'
                  ? 'A single-storey Eichler with a shallow roof, wide windows and a planted front yard.'
                  : 'A modest Berkeley house with a front walk and a planted porch.',
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
    const door = point(MAD_HOUSE.x + 0.66, MAD_HOUSE.z - 0.37);
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
  const pastorSpawn = {
    id: 'unusual-pastor',
    combatKind: 'unusual-pastor',
    ...point(BERKELEY_CHURCH_ROOM.x, BERKELEY_CHURCH_ROOM.z - 1.48),
  };
  function drawChurch(m: Mesh, signs: SignAtlas) {
    const start = m.data.length;
    const room = BERKELEY_CHURCH_ROOM;
    const center = point(room.x, room.z);
    const parts: import('./types/interiors.ts').InteriorSection[] = [];
    const left = -room.w / 2,
      right = room.w / 2,
      front = room.d / 2,
      back = -front;
    const stair = CHURCH_STAIRWELL;
    pose(m, center.x, base, center.z, p.angle, () => {
      recordInstitutePart(m, parts, 'floor', null, () => {
        for (const [x, z, w, d] of [
          [left, back, room.w, stair.north - back],
          [left, stair.south, room.w, front - stair.south],
          [left, stair.north, stair.west - left, stair.south - stair.north],
          [stair.east, stair.north, right - stair.east, stair.south - stair.north],
        ]) m.box(x, -0.03, z, w, 0.045, d, '#aa8662', 'wood');
        m.box(-0.78, 0.016, stair.south, 1.56, 0.008, front - stair.south, '#86565e', 'canvasWeave');
        m.box(-0.65, 0.002, front, 1.3, 0.033, 0.5, '#a6987c', 'stone');
      });
      recordInstitutePart(m, parts, CHURCH_STAIRS_DOWN, null, () => drawChurchStairwell(m));
      const geometry = { ...room, x: 0, z: 0 };
      for (const side of [0, 1, 2, 3])
        recordInstitutePart(m, parts, 'wall', side, () => {
          const openings = (side < 2 ? [] : [-1.55, 0, 1.55]).map((along) => ({
            x: along - 0.275,
            y: 1.05,
            w: 0.55,
            h: 1.37,
            arch: true,
          }));
          drawInstituteWall(m, geometry, side, 2.85, '#e3d7bc', '#c6ab83', { openings });
          for (const r of instituteWallRects(geometry, side))
            m.box(r.x, 0, r.z, r.w, 0.2, r.d, '#b6a083', 'stone');
          const windowX = side === 2 ? left + 0.06 : right - 0.06;
          for (const { x, y, w, h } of openings) {
            m.box(windowX - 0.016, y, x, 0.032, h - 0.27, w, '#758e9e', 'glass');
            m.box(windowX - 0.023, y + 0.46, x, 0.046, 0.035, w, '#c9a86d', 'wood');
            m.box(windowX - 0.023, y, x + w / 2 - 0.019, 0.046, h - 0.27, 0.038, '#c9a86d', 'wood');
          }
        });
      recordInstitutePart(m, parts, 'furniture', null, () => {
        for (const pew of churchPews) {
          m.box(pew.u, 0.43, pew.v, pew.w, 0.095, pew.d, '#9b6a47', 'wood');
          m.box(pew.u, 0.51, pew.v + pew.d - 0.085, pew.w, 0.35, 0.085, '#89593e', 'wood');
          for (const dx of [0.07, pew.w - 0.15])
            m.box(pew.u + dx, 0.017, pew.v + 0.06, 0.075, 0.41, 0.26, '#80583b', 'wood');
        }
        m.box(1.88, 1.05, back + 0.19, 0.81, 0.82, 0.064, '#78614c', 'wood');
        drawPlaque(m, signs, CHURCH_NOTICEBOARD, 2.285, 1.68, back + 0.258, 0.73, 0.28);
        for (const x of [-1.25, 1.25])
          drawPlaque(m, signs, LAB_SIGN, x, 1.28, back + 0.24, 1.36, 0.87);
      });
      recordInstitutePart(m, parts, 'roof', null, () => {
        for (const side of [-1, 1]) {
          const x = side * (right + 0.2);
          m.quad(
            [x, 2.84, back - 0.2],
            [x, 2.84, front + 0.2],
            [0, 4.02, front + 0.2],
            [0, 4.02, back - 0.2],
            '#5d6463',
            'shingles',
          );
        }
        for (const z of [back, front])
          m.tri([left, 2.84, z], [right, 2.84, z], [0, 4.02, z], '#e3d7bc', 'clapboard');
        m.box(-0.36, 3.65, front - 1, 0.72, 0.87, 0.72, '#d7c6a9', 'clapboard');
        m.cylinder(0, 4.49, front - 0.64, 0.57, 1.17, '#5d6463', 4, 0.018, 'shingles');
        m.rod([0, 5.5, front - 0.64], [0, 5.92, front - 0.64], 0.032, '#6e6659', 6);
        m.rod([-0.14, 5.79, front - 0.64], [0.14, 5.79, front - 0.64], 0.027, '#6e6659', 6);
      });
    });
    const end = m.data.length;
    const entry = point(room.x, room.z + front + 0.65);
    const inside = point(room.x, room.z + front - 0.75);
    const stairLanding = point(room.x + stair.landing[0], room.z + stair.landing[1]);
    const site = alienSiteBounds(m, start, {
      id: room.id,
      kind: 'unusual-church',
      label: 'Unusual Church',
      navigationPolygons: [
        ...wallFootprints(room),
        footprint([room.x + stair.west, room.z + stair.north, room.x + stair.east, room.z + stair.south]),
      ],
      description: 'A clapboard chapel with an open door and a Goose Corp service schedule.',
      entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
      inside: { x: inside.x - 0.5, y: inside.z - 0.5 },
      enterableInstitute: true,
      details: [
        {
          id: CHURCH_STAIRS_DOWN,
          kind: CHURCH_STAIRS_DOWN,
          section: CHURCH_STAIRS_DOWN,
          label: 'Church basement stairs',
          description: 'Narrow wooden stairs lead down under the chapel.',
          entry: { x: stairLanding.x - 0.5, y: stairLanding.z - 0.5 },
        },
      ],
      base,
    });
    const interior = detachInstituteMesh(m, { start, end, parts, spec: room });
    interior.spec = { ...room, ...center, base, rotation: p.angle };
    return { ...site, count: m.data.length - start, interior };
  }
  const residents: import('./types/world.ts').Actor[] = BERKELEY_HOMES.map((home, i) => {
    const [left, north, right, south] = home.rect;
    const u = (left + right) / 2 - 0.84;
    const front = home.facing === 'north' ? north : south;
    const direction = home.facing === 'north' ? -1 : 1;
    const approach = point(u + 0.55, front + direction * 1.08);
    const female = i % 2 === 0;
    return {
      id: home.id + '-resident',
      kind: 'berkeley-resident',
      name: female ? 'Woman' : 'Man',
      label: female ? 'Woman' : 'Man',
      ...point(u, front + direction * 0.72),
      approach: { x: approach.x - 0.5, y: approach.z - 0.5 },
      female,
      regional: true,
      stationary: true,
      base: ground(),
      height: 1.75,
      angle: p.angle,
      skin: ['#a77353', '#d1a47f', '#7a4b37', '#b98874', '#c19672'][i],
      shirt: ['#ac747a', '#567b7a', '#a9915f', '#727f62', '#81738d'][i],
      description: 'A resident of ' + home.label + '.',
    };
  });
  const saunaEntry = point(CEDAR_SAUNA.x, CEDAR_SAUNA.z + CEDAR_SAUNA.d / 2 + 0.64);
  const saunaGuest: Actor = {
    ...point(CEDAR_SAUNA.x + SAUNA_GUEST.x, CEDAR_SAUNA.z + SAUNA_GUEST.z),
    id: SAUNA_GUEST.id,
    kind: SAUNA_GUEST.kind,
    name: SAUNA_GUEST.name,
    label: SAUNA_GUEST.name,
    description: SAUNA_GUEST.description,
    neighborLine: SAUNA_GUEST.line,
    siteId: CEDAR_SAUNA.id,
    approach: { x: saunaEntry.x - 0.5, y: saunaEntry.z - 0.5 },
    base: base + SAUNA_FLOOR_TOP,
    angle: p.angle + Math.PI / 4,
    skin: '#a77459',
    shirt: '#e3e0cd',
    pants: '#708e87',
    hair: '#493934',
    height: 1.55,
    seated: true,
    stationary: true,
    regional: true,
  };
  const churchgoers: Actor[] = [
    {
      id: 'berkeley-churchgoer-1',
      label: 'Churchgoer',
      name: 'Mara',
      u: BERKELEY_CHURCH_ROOM.x + 1.0,
      v: BERKELEY_CHURCH_ROOM.z - 2,
      female: true,
      skin: '#a9745a',
      shirt: '#77898a',
    },
    {
      id: 'berkeley-churchgoer-2',
      label: 'Churchgoer',
      name: 'Elias',
      u: 0.6,
      v: -8.12,
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
    const { u, v } = local(x, z);
    if (!clearLocal(u, v)) return 'building';
    if (
      layout.roads.some((rect) => inRect(u, v, rect)) ||
      layout.crookedRoads.some((strip) => inStrip(u, v, strip))
    )
      return 'road';
    if (
      layout.paths.some((rect) => inRect(u, v, rect)) ||
      layout.crookedWalks.some((strip) => inStrip(u, v, strip))
    )
      return 'sidewalk';
    return 'grass';
  };
  return {
    gate,
    base,
    point,
    local,
    contains,
    coversGround,
    ground,
    nearest,
    segment,
    path,
    raycast,
    draw,
    drawChurch,
    drawHomes,
    drawPlayground,
    drawStreetlights,
    lampPosts,
    madScientistSpawn,
    pastorSpawn,
    residents,
    saunaGuest,
    groundQuads,
    churchgoers,
    npc,
    quads,
    mapFeatures,
    routes,
    lifeRoutes,
    searchableResidences,
    searchHomes: searchableResidences.map(({ home }) => home),
    surfaceType,
    layout,
    graph,
    life: null as ReturnType<typeof import('./life.ts').createCityLife> | null,
  };
}
