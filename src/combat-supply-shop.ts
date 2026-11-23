import { MISSILE_PRICE } from './item-stats.ts';

export const COMBAT_SUPPLY_OFFERS = {
  buyAmmo: { price: 5, units: 20, inventoryKey: 'akimboAmmo', item: 'Akimbo rounds' },
  buyMissile: {
    price: MISSILE_PRICE,
    units: 1,
    inventoryKey: 'missiles',
    item: 'missiles',
    singular: 'missile',
  },
  buyBattery: {
    price: 20,
    units: 1,
    inventoryKey: 'railgunBatteries',
    item: 'railgun batteries',
    singular: 'railgun battery',
  },
} as const;

export type CombatSupplyPurchase = keyof typeof COMBAT_SUPPLY_OFFERS;

export function isCombatSupplyPurchase(op: string): op is CombatSupplyPurchase {
  return Object.hasOwn(COMBAT_SUPPLY_OFFERS, op);
}
