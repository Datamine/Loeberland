import type { NumericVector, Ray } from './types/geometry.ts';

import type { Parcel } from './types/parcels.ts';
import './picking.ts';
import { rayBox } from './geometry.ts';
import { SEARCH_HOUSE_PARCELS } from './southern-layout.ts';
import { CULTIST_WARDROBE, HOUSE_SEARCHES } from './config/search-houses.ts';
import { CULTIST_COTTAGE } from './bolinas.ts';

export function searchHousePoint(p: Readonly<Parcel>, u: number, v: number) {
  const c = Math.cos(p.rotation || 0),
    s = Math.sin(p.rotation || 0);
  return { x: p.x + u * c - v * s, z: p.z + u * s + v * c };
}
const CLIMBABLE_HOUSES = new Set(['explorable-home-1', 'explorable-home-4', 'explorable-home-6']);
export function houseClimb(id: string) {
  if (!CLIMBABLE_HOUSES.has(id)) return null;
  const house = SEARCH_HOMES.find((home) => home.id === id)!;
  const p = house.parcel;
  return {
    ladder: searchHousePoint(p, 0.64, p.d / 2 + 0.17),
    perch: searchHousePoint(p, 0, p.d / 2 - 0.52),
    angle: (p.rotation || 0) - Math.PI / 2,
  };
}
export function searchHome(id: string, p: Parcel, search: (typeof HOUSE_SEARCHES)[number]) {
  const inside = searchHousePoint(p, 0, p.d / 2 - 0.7),
    entry = searchHousePoint(p, 0, p.d / 2 + 0.45),
    sideYard = -p.w / 2 - 0.5,
    target =
      search.container === 'doghouse'
        ? searchHousePoint(p, sideYard, 0.15)
        : searchHousePoint(p, -p.w / 2 + 0.65, -p.d / 2 + 0.65),
    approach =
      search.container === 'doghouse'
        ? searchHousePoint(p, sideYard, 0.85)
        : searchHousePoint(p, -p.w / 2 + 0.95, -p.d / 2 + 1.3);
  return Object.freeze({
    id,
    parcel: p,
    search,
    inside: { x: inside.x - 0.5, y: inside.z - 0.5 },
    entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
    target,
    approach: { x: approach.x - 0.5, y: approach.z - 0.5 },
  });
}
export const SEARCH_HOMES = Object.freeze(
  SEARCH_HOUSE_PARCELS.map((p, i) =>
    searchHome('explorable-home-' + (i + 1), p, HOUSE_SEARCHES[i]),
  ),
);
export const CULTIST_HOME = searchHome(
  'bolinas-cultist-cottage',
  CULTIST_COTTAGE,
  CULTIST_WARDROBE,
);
export const ALL_SEARCH_HOMES = [...SEARCH_HOMES, CULTIST_HOME];

export function searchHomeContaining(
  x: number,
  z: number,
  homes: readonly ReturnType<typeof searchHome>[] = ALL_SEARCH_HOMES,
) {
  return homes.find((h) => {
    const p = h.parcel,
      dx = x - p.x,
      dz = z - p.z;
    if (Math.abs(dx) > 3.3 || Math.abs(dz) > 3.3) return false;
    const c = Math.cos(p.rotation || 0),
      s = Math.sin(p.rotation || 0);
    return Math.abs(dx * c + dz * s) < p.w / 2 && Math.abs(-dx * s + dz * c) < p.d / 2;
  });
}

/** A whole storage face is clickable, even when its triangles are also part
 * of the room mesh. A closer wall or furnishing still occludes the container. */
export function preferHouseStorage<
  H extends { place?: R },
  R extends { id: string; searchHome?: boolean },
  B extends { lo?: NumericVector; hi?: NumericVector },
>(
  ray: Ray,
  hit: H | null,
  distance: number,
  room: R | null,
  sites: readonly { houseId?: string; object?: B }[],
): H | B | null {
  if (!room?.searchHome || hit?.place !== room) return hit;
  let chosen: H | B | null = hit,
    nearest = distance + 0.08;
  for (const site of sites) {
    if (site.houseId !== room.id) continue;
    const box = site.object;
    if (!box?.lo || !box.hi) continue;
    const t = rayBox(
      ray,
      box.lo.map((v) => v - 0.035),
      box.hi.map((v) => v + 0.035),
    );
    if (t !== null && t <= nearest) {
      chosen = box;
      nearest = t;
    }
  }
  return chosen;
}
