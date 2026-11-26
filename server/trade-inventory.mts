import type { InventorySnapshot } from '../src/types/network.ts';
import type { GrowthPosition } from '../src/types/finance.ts';
import type { TradeItem, TradeLine } from '../src/types/trade.ts';
import { ITEM_STATS, EQUIPMENT_IDS, baseEquipmentId, sandwichCapacity, upgradeKitRequirement } from '../src/item-stats.ts';
import { UPGRADED_RAILGUN, WEAPON_UPGRADE_KIT } from '../src/config/weapon-upgrades.ts';
import { HIKING_BACKPACK_UPGRADE_KIT } from '../src/config/hiking-backpack.ts';
import { GROWTH_EQUITY } from '../src/config/finance.ts';
import { HAT_CATALOG } from '../src/hat-catalog.ts';
import { TABLET_PLACES } from '../src/teleport-tablets.ts';
import { TAHOE_PELTS } from '../src/config/tahoe-pelts.ts';

export interface TradeHoldings {
  inventory: InventorySnapshot;
  growth: GrowthPosition | null;
  grapplingHook: boolean;
}
type CountedItem = {
  name: string;
  read: (holdings: TradeHoldings) => number;
  write: (holdings: TradeHoldings, quantity: number) => void;
  max?: number;
};
const catalog = new Map<string, CountedItem>();
const boundEquipment = new Set(['bayonet', 'railgun', UPGRADED_RAILGUN, 'battleaxe', 'fighter-yard-pass', 'scooter', 'lightsaber']);
for (const [id, key, name] of [
  ['coins', 'coins', 'Coins'],
  ['startup-equity', 'equity', 'Startup equity'],
  ['fuel-can', 'fuelCans', 'Fuel cans'],
  ['fish', 'fish', 'Live fish'],
  ['mud', 'mud', 'Mud'],
  ['grain', 'grain', 'Grain'],
  ['bouquet', 'bouquets', 'Bouquets'],
  ['sand', 'sand', 'Ocean Beach sand'],
  ['software', 'softwareCopies', 'Sales software'],
] as const)
  catalog.set(id, {
    name,
    read: (h) => h.inventory.purse[key],
    write: (h, quantity) => {
      h.inventory.purse[key] = quantity;
    },
  });
for (const [id, key, name, max] of [
  ['peptides', 'peptides', 'Peptides'],
  ['sandwich', 'sandwiches', 'Sandwiches'],
  ['bison-hide', 'bisonHides', 'Bison hides'],
  ['uni', 'uni', 'Uni'],
  ['armor-trimming-kit', 'armorTrimmingKits', 'Armor trimming kits'],
  ['goblin-helmet-upgrade-kit', 'goblinHelmetUpgradeKits', 'Goblin helmet upgrade kits'],
  [WEAPON_UPGRADE_KIT, 'weaponUpgradeKits', 'Weaponry upgrade kit'],
  [HIKING_BACKPACK_UPGRADE_KIT, 'hikingBackpackUpgradeKits', ITEM_STATS[HIKING_BACKPACK_UPGRADE_KIT].name],
  ['light-crystal', 'lightCrystals', 'Light crystals'],
  ['bind-tablet', 'bindTablets', 'Bind Tablets'],
  ['akimbo-ammo', 'akimboAmmo', 'Akimbo rounds', 1_000_000],
  ['missile', 'missiles', 'Missiles', 1_000_000],
  ['railgun-battery', 'railgunBatteries', 'Railgun batteries', 1_000_000],
  ['coffee', 'coffee', 'Coffee', 1],
] as const)
  catalog.set(id, {
    name,
    max,
    read: (h) => h.inventory[key] ?? 0,
    write: (h, quantity) => {
      h.inventory[key] = quantity;
    },
  });
for (const id of TAHOE_PELTS)
  catalog.set(id, {
    name: ITEM_STATS[id].name,
    read: (h) => h.inventory.pelts?.[id] ?? 0,
    write: (h, quantity) => {
      (h.inventory.pelts ??= {})[id] = quantity;
    },
  });
for (const place of TABLET_PLACES)
  catalog.set(place + '-tablet', {
    name: ITEM_STATS[place + '-tablet'].name,
    max: 1_000_000,
    read: (h) => h.inventory.tablets[place] ?? 0,
    write: (h, quantity) => {
      h.inventory.tablets[place] = quantity;
    },
  });
function collectible(id: string, name: string, field: 'ownedEquipment' | 'ownedHats', key: string) {
  catalog.set(id, {
    name,
    max: 1,
    read: (h) => Number(h.inventory.purse[field].includes(key)),
    write: (h, quantity) => {
      const list = h.inventory.purse[field];
      h.inventory.purse[field] = quantity ? [...list, key] : list.filter((item) => item !== key);
    },
  });
}
for (const id of EQUIPMENT_IDS)
  if (!boundEquipment.has(id)) collectible(id, ITEM_STATS[id].name, 'ownedEquipment', id);
for (const hat of HAT_CATALOG) collectible('hat:' + hat.id, hat.name, 'ownedHats', hat.id);
catalog.set('iphone', {
  name: 'iPhone',
  max: 1,
  read: (h) => Number(h.inventory.purse.iphoneOwned),
  write: (h, quantity) => {
    h.inventory.purse.iphoneOwned = quantity === 1;
    h.inventory.purse.iphoneEquipped = false;
    h.inventory.purse.incomeQuarters = 0;
    h.inventory.purse.incomeExtraTwentieths = 0;
  },
});
catalog.set('grappling-hook', {
  name: 'Grappling hook',
  max: 1,
  read: (h) => Number(h.grapplingHook),
  write: (h, quantity) => {
    h.grapplingHook = quantity === 1;
  },
});
const growthId = 'growth-equity';
export function tradeStock(h: TradeHoldings): TradeItem[] {
  const list = [...catalog.entries()].flatMap(([id, item]) => {
    const quantity = item.read(h);
    return quantity > 0 ? [{ id, name: item.name, quantity }] : [];
  });
  if (h.growth) list.splice(2, 0, describeTradeItem({ id: growthId, quantity: h.growth.cost }, h));
  return list;
}
export function describeTradeItem(line: TradeLine, h?: TradeHoldings): TradeItem {
  return line.id === growthId
    ? {
        ...line,
        name:
          h?.growth?.phase === 'listed'
            ? 'Growth equity (listed principal)'
            : 'Growth equity (principal)',
        wholeHolding: h?.growth?.phase === 'listed',
      }
    : { ...line, name: catalog.get(line.id)!.name };
}
export function validTradeLine(h: TradeHoldings, { id, quantity }: TradeLine) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return false;
  if (id === growthId)
    return (
      !!h.growth &&
      quantity <= h.growth.cost &&
      (h.growth.phase !== 'listed' || quantity === h.growth.cost)
    );
  const item = catalog.get(id);
  return !!item && item.read(h) >= quantity;
}
function privateHolding(cost: number): GrowthPosition {
  return { phase: 'private', cost, value: cost, fee: Math.ceil(cost * GROWTH_EQUITY.fee) };
}
function take(h: TradeHoldings, offer: TradeLine[]) {
  let growth: GrowthPosition | null = null;
  for (const { id, quantity } of offer) {
    if (id === growthId) {
      const position = h.growth!;
      growth = position.phase === 'listed' ? position : privateHolding(quantity);
      h.growth = position.cost === quantity ? null : privateHolding(position.cost - quantity);
    } else {
      const item = catalog.get(id)!;
      item.write(h, item.read(h) - quantity);
    }
  }
  return growth;
}
function add(h: TradeHoldings, offer: TradeLine[], growth: GrowthPosition | null) {
  for (const { id, quantity } of offer) {
    if (id === growthId) {
      if (!h.growth) h.growth = growth;
      else {
        if (!growth || h.growth.phase !== 'private' || growth.phase !== 'private') return false;
        const total = h.growth.cost + growth.cost;
        if (total > GROWTH_EQUITY.maxPrincipal) return false;
        h.growth = privateHolding(total);
      }
    } else {
      const item = catalog.get(id)!;
      const total = item.read(h) + quantity;
      if (!Number.isSafeInteger(total) || total > (item.max ?? Number.MAX_SAFE_INTEGER))
        return false;
      item.write(h, total);
    }
  }
  const purse = h.inventory.purse;
  return (
    new Set(purse.ownedEquipment.map(baseEquipmentId)).size === purse.ownedEquipment.length &&
    mayReceiveUpgradeKit(h, offer) &&
    h.inventory.sandwiches + Number(h.inventory.deliveryPending) <=
    sandwichCapacity(purse)
  );
}
function mayReceiveUpgradeKit(h: TradeHoldings, incoming: readonly TradeLine[]) {
  return incoming.every(({ id }) => !upgradeKitRequirement(id, h.inventory.purse));
}
export function swapHoldings(
  a: TradeHoldings,
  b: TradeHoldings,
  offerA: TradeLine[],
  offerB: TradeLine[],
) {
  if (
    !offerA.every((line) => validTradeLine(a, line)) ||
    !offerB.every((line) => validTradeLine(b, line)) ||
    !mayReceiveUpgradeKit(a, offerB) ||
    !mayReceiveUpgradeKit(b, offerA)
  )
    return null;
  const draftA = structuredClone(a),
    draftB = structuredClone(b);
  const growthA = take(draftA, offerA),
    growthB = take(draftB, offerB);
  return add(draftA, offerB, growthB) && add(draftB, offerA, growthA)
    ? ([draftA, draftB] as const)
    : null;
}
