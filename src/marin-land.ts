import type { Point, Ray } from './types/geometry.ts';
interface MarinPickGroup {
  lo: number[];
  hi: number[];
  faces: number[];
}
import { drawBolinas, bolinasBlocks, BOLINAS_PATH } from './bolinas.ts';
import { drawGoblinTown, goblinHutBlocks } from './goblin-town.ts';
import { ATV_JUMP_LANE, ATV_RENTAL } from './atv.ts';
import { createNavigationGrid } from './navigation.ts';
import { Mesh, unit, rayTriangle, rayBox, rand } from './geometry.ts';

const marinInside = (x: number, z: number, poly: number[][]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
};
function drawMarinSurface(
  m: Mesh,
  polygon: number[][],
  scale: number,
  height: (x: number, z: number) => number,
) {
  const marinHeight = height,
    mapPosition = (v: number) => v * scale,
    MARIN = polygon,
    fineNorth = mapPosition(-40);
  // Clip boundary cells to the actual headland polygon, keeping the shore
  // continuous rather than exposing a checkerboard of whole terrain cells.
  // Distant northern ridges use a coarse mesh; the visible headlands keep
  // finer contours without a rectangular land edge behind them.
  for (let z = mapPosition(-65); z < mapPosition(3.2);) {
    const step = z < fineNorth ? 2.4 : 0.6;
    for (let x = mapPosition(-20); x < mapPosition(65); x += step) {
      const points = [],
        insideCell = (p: number[]) =>
          p[0] >= x - 1e-8 &&
          p[0] <= x + step + 1e-8 &&
          p[1] >= z - 1e-8 &&
          p[1] <= z + step + 1e-8;
      for (const p of [
        [x, z] satisfies [number, number],
        [x + step, z] satisfies [number, number],
        [x + step, z + step] satisfies [number, number],
        [x, z + step] satisfies [number, number],
      ])
        if (marinInside(...p, MARIN)) points.push(p);
      // Match the fine row's vertices at the terrain LOD seam.
      if (step > 1 && z + step >= fineNorth)
        for (let dx = 0.6; dx < step - 0.01; dx += 0.6) {
          const p = [x + dx, z + step] satisfies [number, number];
          if (marinInside(...p, MARIN)) points.push(p);
        }
      for (let i = 0; i < MARIN.length; i++) {
        const a = MARIN[i],
          b = MARIN[(i + 1) % MARIN.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        if (insideCell(a)) points.push(a);
        for (const xx of [x, x + step] satisfies [number, number])
          if (Math.abs(dx) > 1e-9) {
            const t = (xx - a[0]) / dx,
              p = [xx, a[1] + dz * t] satisfies [number, number];
            if (t >= 0 && t <= 1 && insideCell(p)) points.push(p);
          }
        for (const zz of [z, z + step] satisfies [number, number])
          if (Math.abs(dz) > 1e-9) {
            const t = (zz - a[1]) / dz,
              p = [a[0] + dx * t, zz] satisfies [number, number];
            if (t >= 0 && t <= 1 && insideCell(p)) points.push(p);
          }
      }
      const unique = [
        ...new Map(points.map((p) => [p.map((v) => v.toFixed(6)).join(','), p])).values(),
      ];
      if (unique.length < 3) continue;
      const center = unique.reduce(
        (a, p) =>
          [a[0] + p[0] / unique.length, a[1] + p[1] / unique.length] satisfies [number, number],
        [0, 0] satisfies [number, number],
      );
      unique.sort(
        (a, b) =>
          Math.atan2(a[1] - center[1], a[0] - center[0]) -
          Math.atan2(b[1] - center[1], b[0] - center[0]),
      );
      for (let i = 0; i < unique.length; i++) {
        const a = unique[i],
          b = unique[(i + 1) % unique.length];
        const start = m.data.length,
          h = marinHeight(center[0], center[1]),
          slope =
            Math.hypot(
              marinHeight(center[0] + 0.2, center[1]) - h,
              marinHeight(center[0], center[1] + 0.2) - h,
            ) / 0.2;
        const exposed = slope > 0.53 + 0.1 * Math.sin(center[0] * 0.71 + center[1] * 0.52);
        m.tri(
          [center[0], h, center[1]],
          [b[0], marinHeight(b[0], b[1]), b[1]],
          [a[0], marinHeight(a[0], a[1]), a[1]],
          '#899775',
          exposed ? 'marinRock' : 'marinScrub',
        );
        for (let v = start; v < m.data.length; v += 11) {
          const x = m.data[v],
            z = m.data[v + 2],
            n = unit([
              -(marinHeight(x + 0.1, z) - marinHeight(x - 0.1, z)) / 0.2,
              1,
              -(marinHeight(x, z + 0.1) - marinHeight(x, z - 0.1)) / 0.2,
            ] satisfies [number, number, number]),
            dry =
              0.5 +
              0.27 * Math.sin(x * 0.22 + z * 0.1) +
              0.15 * Math.sin(z * 0.53 - x * 0.19) +
              0.08 * Math.sin(x * 1.21 - z * 0.72),
            coastal = Math.min(1, Math.max(0, (-x + 12) / 29)),
            rock = exposed ? Math.min(0.92, 0.48 + 0.6 * (slope - 0.45)) : 0,
            grass = [
              0.4 + dry * 0.25 + coastal * 0.035,
              0.48 + dry * 0.12,
              0.31 + dry * 0.11 + coastal * 0.028,
            ] satisfies [number, number, number];
          for (let k = 0; k < 3; k++) {
            m.data[v + 3 + k] = n[k];
            m.data[v + 6 + k] =
              grass[k] * (1 - rock) +
              ([0.67, 0.62, 0.53] satisfies [number, number, number])[k] * rock;
          }
        }
      }
    }
    z += step;
  }
}
/** Grass and rocky headlands use a native adjacency graph, sharing their coast
 * and prison footprint with collision. Coordinates exposed here are logical
 * x/y; rendered coordinates are half a tile higher in x/z. */
export function createMarinLand({
  polygon,
  scale = 1.5,
  detention,
  gate,
  resolution = 2,
  prepared = null,
}: {
  polygon: number[][];
  scale?: number;
  detention: Pick<
    ReturnType<typeof import('./encounters.ts').createDetentionSite>,
    'terrain' | 'walkable' | 'path' | 'x' | 'z' | 'w' | 'd'
  >;
  gate: import('./types/geometry.ts').Point;
  resolution?: number;
  prepared?: import('./types/navigation.ts').NavigationGraphData | null;
}) {
  const west = Math.floor(Math.min(...polygon.map((p) => p[0]))),
    north = Math.floor(Math.min(...polygon.map((p) => p[1]))),
    width = Math.ceil((Math.max(...polygon.map((p) => p[0])) - west) * resolution) + 1,
    height = Math.ceil((Math.max(...polygon.map((p) => p[1])) - north) * resolution) + 1;
  const onLand = (x: number, z: number) => marinInside(x, z, polygon),
    ground = detention.terrain;
  const freeWorld = (x: number, z: number) =>
    onLand(x, z) &&
    !goblinHutBlocks(x, z) &&
    !bolinasBlocks(x, z) &&
    ![
      [-0.18, 0] satisfies [number, number],
      [0.18, 0] satisfies [number, number],
      [0, -0.18] satisfies [number, number],
      [0, 0.18] satisfies [number, number],
    ].some(([dx, dz]) => !onLand(x + dx, z + dz)) &&
    !(
      Math.abs(x - detention.x) < detention.w / 2 + 0.2 &&
      Math.abs(z - detention.z) < detention.d / 2 + 0.2
    );
  const point = (p: Point) => ({ x: p.x + 0.5 - west, y: p.y + 0.5 - north }),
    logical = (p: Point) => ({ x: p.x + west - 0.5, y: p.y + north - 0.5 });
  const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2));
    for (let i = 0; i <= steps; i++)
      if (
        !freeWorld(west + a.x + ((b.x - a.x) * i) / steps, north + a.y + ((b.y - a.y) * i) / steps)
      )
        return false;
    return true;
  };
  const mask =
      prepared?.mask ||
      Uint8Array.from({ length: width * height }, (_, i) =>
        freeWorld(
          west + ((i % width) + 0.5) / resolution,
          north + (Math.floor(i / width) + 0.5) / resolution,
        )
          ? 1
          : 0,
      ),
    graph = createNavigationGrid({ width, height, resolution, mask, canTraverse: clear, prepared });
  const contains = (x: number, z: number) => freeWorld(x, z) && graph.free(x - west, z - north),
    segment = (a: Point, b: Point) => graph.segment(point(a), point(b));
  function internal(a: { x: number; y: number }, b: { x: number; y: number }) {
    return graph.path(point(a), point(b))?.map(logical) || null;
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
    const head = a ? internal(from, gate) : basePath(from, gate),
      tail = b ? internal(gate, to) : basePath(gate, to);
    return head && tail ? [...head, ...tail] : null;
  }
  function nearest(
    x: number,
    y: number,
    radius = 3,
    predicate: (value0: number, value1: number) => boolean = () => true,
  ) {
    const p = point({ x, y }),
      found = graph.nearest(p.x, p.y, radius, (a, b) => {
        const q = logical({ x: a, y: b });
        return predicate(q.x, q.y);
      });
    return found ? logical(found) : null;
  }
  let surface: Mesh | null = null,
    pickLength = 0;
  function surfaceMesh() {
    if (!surface) {
      surface = new Mesh();
      drawMarinSurface(surface, polygon, scale, ground);
      drawGoblinTown(surface, ground);
      drawBolinas(surface, ground);
      // Shrubs and canopies are visual scenery. Walking clicks project to
      // the terrain underneath them.
      pickLength = surface.data.length;
      for (const patch of [
        { x: 30, z: -24, width: 31, depth: 29, count: 400, coastal: false },
        { x: -7, z: -47, width: 28, depth: 29, count: 390, coastal: true },
        { x: 38, z: -5, width: 39, depth: 17, count: 145, coastal: false },
      ]) {
        for (let i = 0; i < patch.count; i++) {
          const seed = i * 9 + (patch.coastal ? 4180 : 1610 + patch.x * 29),
            x = patch.x + (rand(seed, 73) - 0.5) * patch.width,
            z = patch.z + (rand(seed + 1, 73) - 0.5) * patch.depth;
          if (
            !freeWorld(x, z) ||
            !freeWorld(x + 0.36, z - 0.35) ||
            !freeWorld(x - 0.36, z + 0.35) ||
            (Math.abs(x - ATV_JUMP_LANE.x) < 1.84 &&
              z > ATV_JUMP_LANE.start - 1 &&
              z < ATV_JUMP_LANE.end + 2.3) ||
            Math.hypot(x - ATV_RENTAL.parking.x, z - ATV_RENTAL.parking.z) < 2.4 ||
            BOLINAS_PATH.slice(1).some(([bx, bz], j) => {
              const [ax, az] = BOLINAS_PATH[j],
                dx = bx - ax,
                dz = bz - az,
                t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
              return Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.48;
            }) ||
            (!patch.coastal &&
              ((Math.abs(x - 30) < 1.8 && z > -29.4 && z < -16.3) ||
                (Math.abs(x - 33.7) < 1.55 && z > -17 && z < -8))) ||
            (patch.coastal && x > -10.5 && x < -2 && z > -58 && z < -43)
          )
            continue;
          const y = ground(x, z),
            size = 0.17 + 0.39 * rand(seed + 2, 73),
            palette = patch.coastal
              ? ['#657b59', '#a5a26d', '#6f8763']
              : ['#445e42', '#687647', '#809059'],
            color = palette[Math.floor(rand(seed + 3, 73) * palette.length)];
          if (i % 23 === 0) {
            drawMarinTree(surface, x, y, z, size, patch.coastal, color, seed);
          } else if (i % 13 === 0) {
            surface.sphere(
              x,
              y + size * 0.08,
              z,
              size * 1.28,
              size * 0.49,
              size * 0.78,
              i % 2 ? '#99927f' : '#817f70',
              7,
              4,
              'marinRock',
            );
            surface.sphere(
              x + size * 0.48,
              y + size * 0.12,
              z - size * 0.12,
              size * 0.39,
              size * 0.29,
              size * 0.42,
              '#bab09b',
              7,
              4,
              'marinRock',
            );
          } else {
            for (let stem = 0; stem < 3; stem++) {
              const a = rand(seed + stem + 5, 73) * Math.PI * 2,
                dx = Math.cos(a) * size * 0.53,
                dz = Math.sin(a) * size * 0.53;
              surface.sphere(
                x + dx,
                y + size * 0.32,
                z + dz,
                size * 0.62,
                size * (0.49 + 0.13 * stem),
                size * 0.6,
                stem === 1 ? palette[1] : color,
                7,
                4,
              );
              if (patch.coastal && i % 11 === 0)
                surface.sphere(
                  x + dx,
                  y + size * 0.98,
                  z + dz,
                  0.035,
                  0.041,
                  0.035,
                  '#d9b466',
                  6,
                  4,
                );
            }
            if (i % 4 === 0)
              for (let blade = 0; blade < 5; blade++) {
                const a = blade * Math.PI * 0.4;
                const dx = Math.cos(a) * size * 0.34,
                  dz = Math.sin(a) * size * 0.34;
                surface.tri(
                  [x - 0.035, y, z],
                  [x + 0.035, y, z + 0.027],
                  [x + dx, y + size * (0.52 + blade * 0.12), z + dz],
                  blade % 2 ? '#9a915d' : '#d0b87a',
                );
              }
          }
        }
      }
    }
    return surface;
  }
  // Group terrain faces once. Ordinary city clicks reject every headland
  // box without allocating or testing tens of thousands of triangles.
  let pickGroups: MarinPickGroup[] | null = null;
  function raycast(ray: Ray) {
    const data = surfaceMesh().data;
    if (!pickGroups) {
      const bins = new Map<string, MarinPickGroup>();
      for (let i = 0; i < pickLength; i += 33) {
        const key = Math.floor(data[i] / 8) + ',' + Math.floor(data[i + 2] / 8);
        let b = bins.get(key);
        if (!b) {
          b = {
            lo: [Infinity, Infinity, Infinity] satisfies [number, number, number],
            hi: [-Infinity, -Infinity, -Infinity] satisfies [number, number, number],
            faces: [],
          };
          bins.set(key, b);
        }
        b.faces.push(i);
        for (const j of [0, 11, 22] satisfies [number, number, number])
          for (let k = 0; k < 3; k++) {
            b.lo[k] = Math.min(b.lo[k], data[i + j + k]);
            b.hi[k] = Math.max(b.hi[k], data[i + j + k]);
          }
      }
      pickGroups = [...bins.values()];
    }
    let best = Infinity;
    for (const b of pickGroups) {
      const near = rayBox(ray, b.lo, b.hi);
      if (near === null || near > best) continue;
      for (const i of b.faces) {
        const hit = rayTriangle(
          ray,
          [data[i], data[i + 1], data[i + 2]] satisfies [number, number, number],
          [data[i + 11], data[i + 12], data[i + 13]] satisfies [number, number, number],
          [data[i + 22], data[i + 23], data[i + 24]] satisfies [number, number, number],
        );
        if (hit !== null && hit < best) best = hit;
      }
    }
    return best < Infinity
      ? { distance: best, point: ray.origin.map((v, i) => v + ray.dir[i] * best) }
      : null;
  }
  return {
    graph,
    gate,
    onLand,
    contains,
    height: ground,
    segment,
    path,
    nearest,
    raycast,
    draw(m: { data: number[] }) {
      for (const v of surfaceMesh().data) m.data.push(v);
    },
  };
}

function drawMarinTree(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  size: number,
  coastal: boolean,
  color: string,
  seed: number,
) {
  const height = 0.8 + size * (coastal ? 2.6 : 1.7);
  const bend = coastal ? size * 0.85 : (rand(seed + 4, 73) - 0.5) * 0.56;
  const trunk = coastal ? '#5a5545' : '#854c38';
  m.rod(
    [x, y - 0.08, z],
    [x + bend * 0.28, y + height * 0.54, z],
    size * 0.16,
    trunk,
    8,
    'marinTimber',
  );
  for (let branch = 0; branch < 4; branch++) {
    const a = branch * Math.PI * 0.5 + rand(seed + 7, 73);
    const ox = x + bend + Math.cos(a) * size * 0.74,
      oz = z + Math.sin(a) * size * 0.65;
    const top = y + height * (0.7 + branch * 0.09);
    m.rod([x + bend * 0.26, y + height * 0.48, z], [ox, top, oz], size * 0.075, trunk, 6);
    m.sphere(
      ox,
      top,
      oz,
      size * (coastal ? 1.5 : 0.92),
      size * (coastal ? 0.55 : 0.8),
      size * 0.94,
      branch % 2 ? color : coastal ? '#526849' : '#6b8253',
      9,
      5,
    );
  }
}
