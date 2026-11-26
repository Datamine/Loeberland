import { combatDungeon } from '../src/combat-dungeons.ts';
import { CAVE_NAVIGATION, ILLUMINATI_INSTANCE, sameMapInstance } from '../src/map-instances.ts';
import type { Point } from '../src/types/geometry.ts';
import type { ServerGeometry, ServerPlayer } from '../src/types/server.ts';

export const PLAYER_INTERACTION_RANGE = 1.6;

export function interiorNavigation(player: ServerPlayer) {
  if (player.instance?.kind === ILLUMINATI_INSTANCE.kind) return CAVE_NAVIGATION;
  return combatDungeon(player.instance?.kind)?.nav ?? null;
}

export function playerSegmentClear(
  geometry: ServerGeometry,
  player: ServerPlayer,
  from: Point,
  to: Point,
) {
  const interior = interiorNavigation(player);
  return interior
    ? interior.segment(from, to)
    : (geometry.canTravel?.(from.x, from.y, to.x, to.y, true) ?? true);
}

export function playersWithinReach(geometry: ServerGeometry, a: ServerPlayer, b: ServerPlayer) {
  return (
    sameMapInstance(a, b) &&
    Math.hypot(a.x - b.x, a.z - b.z) <= PLAYER_INTERACTION_RANGE &&
    Math.abs(a.y - b.y) <= 1.5 &&
    playerSegmentClear(
      geometry,
      a,
      a.seat ? { x: a.seat.exit.x - 0.5, y: a.seat.exit.z - 0.5 } : { x: a.x - 0.5, y: a.z - 0.5 },
      b.seat ? { x: b.seat.exit.x - 0.5, y: b.seat.exit.z - 0.5 } : { x: b.x - 0.5, y: b.z - 0.5 },
    )
  );
}
