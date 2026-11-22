import { isRecord } from '../src/types/json.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { InventoryLedger, EconomyState } from '../src/types/content.ts';
import { COLLECTION_ITEMS } from '../src/config/collection.ts';

const collectionIDs = new Set(COLLECTION_ITEMS.map((item) => item.id));
const parse = (value: string | undefined): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
export function discoverCollection(
  profile: Pick<PlayerProfile, 'privateState'> &
    Partial<Pick<PlayerProfile, 'collection' | 'growth' | 'grapplingHook'>>,
  purse: EconomyState,
  meta: Partial<InventoryLedger>,
) {
  const found = new Set((profile.collection || []).filter((id) => collectionIDs.has(id))),
    add = (id: unknown, owned: unknown) => {
      if (owned && typeof id === 'string' && collectionIDs.has(id)) found.add(id);
    };
  add('unarmed', true);
  for (const id of purse.ownedHats) add('hat:' + id, true);
  for (const id of purse.ownedEquipment) add(id, true);
  for (const [id, owned] of Object.entries({
    coins: purse.coins,
    sandwich: meta.sandwiches,
    uni: meta.uni,
    'armor-trimming-kit': meta.armorTrimmingKits,
    'bind-tablet': meta.bindTablets,
    peptides: meta.peptides,
    'bison-hide': meta.bisonHides,
    coffee: meta.coffee,
    iphone: purse.iphoneOwned,
    grain: purse.grain,
    fish: purse.fish,
    mud: purse.mud,
    sand: purse.sand,
    bouquet: purse.bouquets,
    letter: purse.saltLetters,
    software: purse.softwareCopies,
    equity: purse.equity,
    growth: profile.growth?.cost,
    'grappling-hook': profile.grapplingHook,
    'fuel-can': purse.fuelCans,
  }))
    add(id, owned);
  for (const [id, count] of Object.entries(meta.pelts || {})) add(id, count);
  for (const [id, count] of Object.entries(meta.tablets || {})) add(id + '-tablet', count);
  const state = profile.privateState,
    quest = parse(state['sf-quests-v1']),
    live = isRecord(quest.theyLive) ? quest.theyLive : {},
    expedition = parse(state['sf-expeditions-v1']);
  add('sunglasses', parse(state['sf-sunglasses-v1']).owned);
  add('monkey', quest.monkey === 'carrying' || quest.monkey === 'completed');
  add('stochastic-parrot', ['carrying', 'proof', 'sold'].includes(String(quest.stochasticParrot)));
  add('collatz-proof', quest.stochasticParrot === 'proof' || quest.stochasticParrot === 'sold');
  add('certificate', live.certificate || live.evidence);
  add('permit', live.permit);
  add('skateboard', live.completed);
  add('raptor', expedition.raptor === 'carrying' || expedition.raptor === 'completed');
  add('cape', expedition.cape);
  add('kraken', expedition.krakenDefeated);
  profile.collection = [...found];
  return profile.collection;
}
