import type { Point } from './types/geometry.ts';

export const MARKET_STREETCAR = {
  id: 'market-streetcar',
  kind: 'market-streetcar',
  label: 'Market Street Cable Car',
  description: 'Runs along Market Street to the Ferry Building and back.',
} as const;
export const STREETCAR_BOARD_RANGE = 2;
export const STREETCAR_DECK_OFFSET = 0.4;
export const STREETCAR_RIDER_OFFSET = 1.12;

type StreetcarRoute = { start: Point; end: Point; angle: number };

export function marketStreetcarRoute(points: readonly (readonly number[])[]): StreetcarRoute {
  const [[x, y], [endX, endY]] = points;
  const angle = Math.atan2(endY - y, endX - x);
  // Leave room for the platforms at both ends of the rails.
  const dx = Math.cos(angle) * 1.3;
  const dy = Math.sin(angle) * 1.3;
  return { start: { x: x + dx, y: y + dy }, end: { x: endX - dx, y: endY - dy }, angle };
}

export function marketStreetcarPose({ start, end, angle }: StreetcarRoute, time: number) {
  const travel = 68_000;
  const stop = 5_000;
  const leg = travel + stop;
  const phase = ((time % (2 * leg)) + 2 * leg) % (2 * leg);
  const progress = Math.min(1, Math.max(0, ((phase % leg) - stop) / travel));
  const f = phase < leg ? progress : 1 - progress;
  return { x: start.x + (end.x - start.x) * f, z: start.y + (end.y - start.y) * f, angle };
}

export function marketStreetcarRider(car: ReturnType<typeof marketStreetcarPose>, terrain: number) {
  return {
    x: car.x - Math.cos(car.angle) * STREETCAR_RIDER_OFFSET,
    z: car.z - Math.sin(car.angle) * STREETCAR_RIDER_OFFSET,
    y: terrain + STREETCAR_DECK_OFFSET,
    angle: car.angle,
  };
}
