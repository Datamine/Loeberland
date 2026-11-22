import { ITEM_STATS } from './item-stats.ts';
import { HAT_CATALOG } from './hats.ts';
export const COLLECTION_GROUPS = {
  wearables: 'Wearables',
  quest: 'Quest items',
  other: 'Other',
} as const;
type CollectionGroup = keyof typeof COLLECTION_GROUPS;
const questItems = new Set([
  'raptor',
  'kraken',
  'letter',
  'monkey',
  'certificate',
  'permit',
  'stochastic-parrot',
  'collatz-proof',
  'burning-man-water',
]);
const wearables = new Set(['sunglasses', 'cape']);
function collectionGroup(id: string, slot?: string): CollectionGroup {
  if (questItems.has(id)) return 'quest';
  if (wearables.has(id) || (slot && slot !== 'weapon')) return 'wearables';
  return 'other';
}

export const COLLECTION_ITEMS = Object.freeze(
  [
    ...Object.entries(ITEM_STATS)
      .filter(([, item]) => item.slot !== 'hat' && item.pickup !== 'disintegrate')
      .map(([id, item]) => ({
        id,
        name: item.name,
        group: collectionGroup(id, item.slot),
      })),
    ...HAT_CATALOG.map((h) => ({ id: 'hat:' + h.id, name: h.name, group: 'wearables' as const })),
    ...Object.entries({
      sunglasses: 'Sunglasses',
      skateboard: 'Skateboard',
      cape: 'Kraken cape',
      iphone: 'iPhone',
      coffee: 'Coffee',
      grain: 'Grain',
      fish: 'Live fish',
      mud: 'Mud',
      sand: 'Ocean Beach sand',
      bouquet: 'Bouquet',
      letter: 'Conservation letter',
      software: 'Sales software',
      equity: 'Startup equity',
      growth: 'Growth equity',
      monkey: 'Monkey',
      certificate: 'Alien Evidence Certificate',
      permit: 'Alien permit',
      'stochastic-parrot': 'Stochastic parrot',
      'collatz-proof': 'Proof of the Collatz conjecture',
      'burning-man-water': 'Cup of water',
      'fuel-can': 'Fuel can',
      'grappling-hook': 'Grappling hook',
    }).map(([id, name]) => ({ id, name, group: collectionGroup(id) })),
  ].map((value) => Object.freeze(value)),
);
