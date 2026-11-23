import { contentText } from '../src/content-runtime.ts';
import { isSafeInteger, isRecord } from '../src/types/json.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { InventorySnapshot } from '../src/types/network.ts';

export interface InventoryGrant {
  lootKind: string;
  amount: number;
  itemId?: string;
  hatId?: string;
  transfer?: boolean;
}
import { createEconomy } from '../src/economy.ts';
import { hatById } from '../src/hat-catalog.ts';
import { discoverCollection } from './collection.mts';
import { EQUIPMENT_IDS, sandwichCapacity } from '../src/item-stats.ts';
import { tabletCounts } from '../src/teleport-tablets.ts';
import { isTahoePelt, TAHOE_PELTS } from '../src/config/tahoe-pelts.ts';
import { sandwichStackLabel } from '../src/ground-items.ts';

const inventoryParse = (value: string | undefined): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
export const INVENTORY_KEYS = new Set(['sf-purse-v1', 'sf-deli-v1'] satisfies [string, string]);

/** Owner-private finances, with server revisions and a death epoch. Client
 * checkpoints never overwrite this ledger or resurrect a pre-death balance. */
export function createInventoryAccount(profile: PlayerProfile) {
  profile.privateState ??= {};
  const economy = createEconomy(inventoryParse(profile.privateState['sf-purse-v1'])),
    savedFood = inventoryParse(profile.privateState['sf-deli-v1']);
  // Older saves recorded weapon awards on the quests instead of in the purse.
  const { theyLive, expeditions } = profile.playerState.quests;
  const owned = economy.state.ownedEquipment;
  if (theyLive.bayonet === true && !owned.includes('bayonet')) owned.push('bayonet');
  if (
    expeditions.railgun === true &&
    ['escaped', 'carrying', 'completed'].includes(expeditions.raptor) &&
    !owned.includes('railgun')
  )
    owned.push('railgun');
  const meta = (profile.inventory ??= {
    epoch: 0,
    revision: 0,
    sandwiches: isSafeInteger(savedFood.sandwiches) ? Math.max(0, savedFood.sandwiches) : 0,
    deliveryPending: savedFood.pending === true,
    peptides: 0,
    bisonHides: 0,
    akimboAmmo: 0,
    missiles: 0,
    railgunCharge: 0,
    railgunBatteries: 0,
    coffee: 0,
    tablets: {},
  });
  if (!Number.isSafeInteger(meta.peptides) || meta.peptides < 0) meta.peptides = 0;
  if (!Number.isSafeInteger(meta.bisonHides) || meta.bisonHides < 0) meta.bisonHides = 0;
  for (const key of ['akimboAmmo', 'railgunCharge', 'railgunBatteries', 'missiles'] as const) {
    const count = meta[key];
    meta[key] =
      isSafeInteger(count) && count >= 0
        ? Math.min(count, key === 'railgunCharge' ? 25 : 1000000)
        : 0;
  }
  meta.coffee = meta.coffee === 1 ? 1 : 0;
  meta.tablets = tabletCounts(meta.tablets);
  const pelts: NonNullable<InventorySnapshot['pelts']> = {};
  for (const kind of TAHOE_PELTS) {
    const count = meta.pelts?.[kind];
    if (isSafeInteger(count) && count > 0) pelts[kind] = count;
  }
  meta.pelts = pelts;
  meta.uni = isSafeInteger(meta.uni) && meta.uni > 0 ? meta.uni : 0;
  const consumables = {
    'armor-trimming-kit': 'armorTrimmingKits',
    'bind-tablet': 'bindTablets',
  } as const;
  for (const key of Object.values(consumables)) {
    const count = meta[key];
    meta[key] = isSafeInteger(count) && count > 0 ? count : 0;
  }
  function save(change = true) {
    discoverCollection(profile, economy.state, meta);
    if (change) meta.revision++;
    profile.privateState['sf-purse-v1'] = JSON.stringify(economy.state);
    profile.privateState['sf-deli-v1'] = JSON.stringify({
      sandwiches: meta.sandwiches,
      pending: meta.deliveryPending,
    });
  }
  function snapshot(): InventorySnapshot {
    return {
      epoch: meta.epoch,
      revision: meta.revision,
      purse: structuredClone(economy.state),
      sandwiches: meta.sandwiches,
      capacity: sandwichCapacity(economy.state),
      collection: [...profile.collection],
      decorativeRocket: {
        readyAt: profile.decorativeRocketReadyAt || 0,
        burningUntil: profile.decorativeRocketBurnUntil || 0,
        hopStartedAt: profile.decorativeRocketHopAt || 0,
      },
      deliveryPending: meta.deliveryPending,
      peptides: meta.peptides,
      bisonHides: meta.bisonHides,
      pelts: { ...pelts },
      uni: meta.uni,
      armorTrimmingKits: meta.armorTrimmingKits,
      bindTablets: meta.bindTablets,
      coffee: meta.coffee,
      akimboAmmo: meta.akimboAmmo,
      missiles: meta.missiles,
      railgunCharge: meta.railgunCharge,
      railgunBatteries: meta.railgunBatteries,
      tablets: { ...meta.tablets },
    };
  }
  const sandwichSpace = () =>
    Math.max(0, sandwichCapacity(economy.state) - meta.sandwiches - (meta.deliveryPending ? 1 : 0));
  function canReceive(item: InventoryGrant) {
    if (item.lootKind === 'sandwich' && item.amount > sandwichSpace())
      return {
        ok: false,
        message: contentText('world-message.server.inventory.your-sandwich-bag-is-full', {
          value1: String(sandwichCapacity(economy.state)),
        }),
      };
    if (
      item.lootKind === 'equipment' &&
      (!EQUIPMENT_IDS.includes(item.itemId || '') ||
        economy.state.ownedEquipment.includes(item.itemId || ''))
    )
      return {
        ok: false,
        message: contentText(
          'world-message.server.inventory.you-already-own-this-equipment-or-it-is-unavailable',
        ),
      };
    if (
      item.lootKind === 'hat' &&
      (!hatById(item.hatId || '') || economy.state.ownedHats.includes(item.hatId || ''))
    )
      return {
        ok: false,
        message: contentText('world-message.server.inventory.you-already-own-that-hat'),
      };
    if (item.lootKind === 'iphone' && economy.state.iphoneOwned)
      return {
        ok: false,
        message: contentText('world-message.server.inventory.you-already-own-an-iphone'),
      };
    if (item.lootKind === 'peptides' && !Number.isSafeInteger(meta.peptides + item.amount))
      return {
        ok: false,
        message: contentText('world-message.server.inventory.your-peptide-case-is-full'),
      };
    if (item.lootKind === 'bison-hide' && !Number.isSafeInteger(meta.bisonHides + item.amount))
      return {
        ok: false,
        message: contentText(
          'world-message.server.inventory.you-cannot-carry-any-more-bison-hides',
        ),
      };
    if (
      isTahoePelt(item.lootKind) &&
      !Number.isSafeInteger((pelts[item.lootKind] || 0) + item.amount)
    )
      return { ok: false, message: contentText('world-message.tahoe-pelts.inventory-full') };
    const consumable = consumables[item.lootKind as keyof typeof consumables];
    if (consumable && !Number.isSafeInteger((meta[consumable] || 0) + item.amount))
      return { ok: false, message: contentText('world-message.loot.item-full') };
    if (item.lootKind === 'uni' && !Number.isSafeInteger((meta.uni || 0) + item.amount))
      return { ok: false, message: contentText('world-message.uni.inventory-full') };
    if (item.lootKind === 'sand-bucket' && !Number.isSafeInteger(economy.state.sand + item.amount))
      return { ok: false, message: contentText('world-message.berkeley-lab.sand-full') };
    if (item.lootKind === 'coins' && !Number.isSafeInteger(economy.state.coins + item.amount))
      return {
        ok: false,
        message: contentText('world-message.server.inventory.your-coin-purse-is-full'),
      };
    return { ok: true };
  }
  function receive(item: InventoryGrant) {
    const result = canReceive(item);
    if (!result.ok) return result;
    const consumable = consumables[item.lootKind as keyof typeof consumables];
    if (consumable) meta[consumable] = (meta[consumable] || 0) + item.amount;
    else if (item.lootKind === 'coins') {
      if (item.transfer) economy.state.coins += item.amount;
      else economy.credit(item.amount);
    } else if (item.lootKind === 'sandwich') meta.sandwiches += item.amount;
    else if (item.lootKind === 'iphone') {
      economy.state.iphoneOwned = true;
      economy.state.iphoneEquipped = false;
    } else if (item.lootKind === 'hat') economy.state.ownedHats.push(item.hatId!);
    else if (item.lootKind === 'peptides') meta.peptides += item.amount;
    else if (item.lootKind === 'bison-hide') meta.bisonHides += item.amount;
    else if (item.lootKind === 'uni') meta.uni = (meta.uni || 0) + item.amount;
    else if (item.lootKind === 'sand-bucket') {
      economy.state.sand += item.amount;
      if (!profile.collection.includes(item.lootKind)) profile.collection.push(item.lootKind);
    } else if (isTahoePelt(item.lootKind))
      pelts[item.lootKind] = (pelts[item.lootKind] || 0) + item.amount;
    else if (item.lootKind === 'equipment') economy.state.ownedEquipment.push(item.itemId!);
    else return { ok: true };
    save();
    return { ok: true, inventory: snapshot() };
  }
  function deathDrops() {
    const purse = economy.state,
      items = [];
    if (purse.coins)
      items.push({ lootKind: 'coins', amount: purse.coins, label: purse.coins + ' coins' });
    if (meta.sandwiches)
      items.push({
        lootKind: 'sandwich',
        amount: meta.sandwiches,
        label: sandwichStackLabel(meta.sandwiches),
      });
    if (purse.iphoneOwned) items.push({ lootKind: 'iphone', amount: 1, label: 'iPhone' });
    purse.coins = 0;
    purse.iphoneOwned = false;
    purse.iphoneEquipped = false;
    purse.incomeQuarters = 0;
    meta.sandwiches = 0;
    meta.epoch++;
    save();
    return items;
  }
  function installTrade(draft: InventorySnapshot) {
    Object.assign(economy.state, draft.purse);
    for (const key of [
      'sandwiches',
      'peptides',
      'bisonHides',
      'uni',
      'armorTrimmingKits',
      'bindTablets',
      'coffee',
      'akimboAmmo',
      'missiles',
      'railgunBatteries',
    ] as const)
      meta[key] = draft[key] ?? 0;
    for (const kind of TAHOE_PELTS) {
      const quantity = draft.pelts?.[kind] ?? 0;
      if (quantity) pelts[kind] = quantity;
      else delete pelts[kind];
    }
    meta.tablets = { ...draft.tablets };
    save();
  }
  save(false);
  return {
    economy,
    meta,
    snapshot,
    sandwichSpace,
    canReceive,
    receive,
    deathDrops,
    save,
    installTrade,
  };
}
