import { isRecord } from '../src/types/json.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { InventoryLedger, EconomyState } from '../src/types/content.ts';
import { COLLECTION_ITEMS } from '../src/config/collection.ts';
import { WEAPON_UPGRADE_KIT } from '../src/config/weapon-upgrades.ts';
import { HIKING_BACKPACK_UPGRADE_KIT } from '../src/config/hiking-backpack.ts';
import { baseEquipmentId } from '../src/item-stats.ts';

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
  for (const id of purse.ownedEquipment) {
    add(id, true);
    const base = baseEquipmentId(id);
    if (base !== id) add(base, true);
  }
  for (const [id, owned] of Object.entries({
    coins: purse.coins,
    sandwich: meta.sandwiches,
    uni: meta.uni,
    'armor-trimming-kit': meta.armorTrimmingKits,
    'goblin-helmet-upgrade-kit': meta.goblinHelmetUpgradeKits,
    [WEAPON_UPGRADE_KIT]: meta.weaponUpgradeKits,
    [HIKING_BACKPACK_UPGRADE_KIT]: meta.hikingBackpackUpgradeKits,
    'light-crystal': meta.lightCrystals,
    'bind-tablet': meta.bindTablets,
    fireworks: meta.fireworks,
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
