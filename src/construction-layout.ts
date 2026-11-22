export const CONSTRUCTION_SITE = Object.freeze({
  id: 'construction-site',
  name: 'Construction Site',
  west: 57.6,
  east: 61.65,
  north: 106.65,
  south: 115.5,
  work: { x: 61.18, z: 109.6, angle: Math.PI },
  foreman: { id: 'construction-foreman', x: 61.1, z: 107.65 },
});

export const CONSTRUCTION_PAY_INTERVAL = 20;
export const CONSTRUCTION_SHIFT_SECONDS = 30 * 60;
export const CONSTRUCTION_COOLDOWN_MS = 60 * 60 * 1000;

export function inConstructionSite(x: number, z: number, pad = 0) {
  const { west, east, north, south } = CONSTRUCTION_SITE;
  return x >= west - pad && x <= east + pad && z >= north - pad && z <= south + pad;
}

export function overlapsConstructionSite({
  x,
  z,
  w,
  d,
  rotation = 0,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  rotation?: number | null;
}) {
  const { west, east, north, south } = CONSTRUCTION_SITE;
  const sin = Math.abs(Math.sin(rotation || 0));
  const cos = Math.abs(Math.cos(rotation || 0));
  const halfWidth = (cos * w + sin * d) / 2;
  const halfDepth = (sin * w + cos * d) / 2;
  return (
    x + halfWidth > west && x - halfWidth < east && z + halfDepth > north && z - halfDepth < south
  );
}
