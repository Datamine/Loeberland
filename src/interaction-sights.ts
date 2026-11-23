import type { InteractionSight, Site } from './types/world.ts';
import type { ExpeditionLoot } from './types/expeditions.ts';
import type { WorldPoint } from './types/geometry.ts';
import type { PickTarget } from './types/scene-state.ts';
export function hasSiteEntry(sight: InteractionSight): sight is Site {
  return !!sight.entry && typeof sight.entry.x === 'number' && typeof sight.entry.y === 'number';
}
export function isLootTarget(sight: InteractionSight): sight is ExpeditionLoot & Partial<Site> {
  return sight.kind === 'loot' && 'lootKind' in sight;
}

export function groundPickupsOnTile(
  targets: readonly Pick<PickTarget, 'sight' | 'lo' | 'hi'>[],
  point: WorldPoint,
  onDeck = false,
) {
  const x = Math.floor(point.x);
  const z = Math.floor(point.z);
  const pickups = new Map<string, InteractionSight>();
  for (const { sight, lo, hi } of targets) {
    if (!sight) continue;
    let position: WorldPoint | null | undefined;
    if (isLootTarget(sight)) position = onDeck ? sight.deck : sight.ship ? null : sight;
    else if (!onDeck && sight.kind === 'sunglasses')
      position = { x: (lo[0] + hi[0]) / 2, z: (lo[2] + hi[2]) / 2 };
    if (position && Math.floor(position.x) === x && Math.floor(position.z) === z)
      pickups.set(sight.id, sight);
  }
  return [...pickups.values()];
}
