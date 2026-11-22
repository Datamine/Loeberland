import type { Appearance, EconomyState } from './types/content.ts';
import { isOneOf } from './types/json.ts';
import { ITEM_STATS, EQUIPMENT_IDS } from './config/item-stats.ts';

export { ITEM_STATS, EQUIPMENT_IDS };
export { MISSILE_PRICE } from './config/item-stats.ts';
const PROJECTILE_WEAPONS = ['railgun', 'akibo', 'missile-launcher'] as const;
export const isProjectileWeapon = (weapon: unknown) => isOneOf(PROJECTILE_WEAPONS, weapon);
export const PLAYER_WEAPONS = [
  'unarmed',
  'rolling-pin',
  'bayonet',
  'battleaxe',
  'railgun',
  'akibo',
  'missile-launcher',
] as const;

/** Runtime inventory helpers; editable definitions live in config/item-stats.js. */
export function itemById(id: PropertyKey) {
  return Object.hasOwn(ITEM_STATS, id) ? ITEM_STATS[String(id)] : null;
}
export function equipmentOwned(purse: { ownedEquipment: string | string[] }, id: string) {
  return !!purse?.ownedEquipment?.includes(id);
}
export function normalizeBoots(value: unknown): NonNullable<Appearance['boots']> {
  return value === 'party-boots' ? value : value === true || value === 'true';
}
export function ownedBoots(purse: Pick<EconomyState, 'ownedEquipment'>, look: Appearance) {
  const boots = normalizeBoots(look.boots);
  return equipmentOwned(purse, boots === 'party-boots' ? boots : 'combat-boots') ? boots : false;
}
export function weaponOwned(
  purse: Pick<EconomyState, 'ownedEquipment'> | undefined,
  id: string,
): id is (typeof PLAYER_WEAPONS)[number] {
  return id === 'unarmed' || (!!purse && isOneOf(PLAYER_WEAPONS, id) && equipmentOwned(purse, id));
}
export function selectedWeapon(
  preference: string = 'unarmed',
  purse: Pick<EconomyState, 'ownedEquipment'>,
) {
  return weaponOwned(purse, preference) ? preference : 'unarmed';
}
export function recoilDamage(
  purse: Pick<EconomyState, 'ownedEquipment'>,
  look: Appearance,
  damage: number,
) {
  return look.neck === 'recoil-amulet' && equipmentOwned(purse, 'recoil-amulet')
    ? Math.floor(damage / 5)
    : 0;
}
export function equipmentDefense(look: Appearance = {}) {
  return (
    (look.torso === 'iron-armor' || look.torso === 'gold-trimmed-iron-armor'
      ? ITEM_STATS[look.torso].defense || 0
      : 0) +
    (look.boots === true ? ITEM_STATS['combat-boots'].defense : 0) +
    (look.iceTop ? ITEM_STATS['ice-top'].defense : 0) +
    (look.icePants ? ITEM_STATS['ice-pants'].defense : 0)
  );
}
export function ownedEquipmentDefense(
  purse: Pick<EconomyState, 'ownedEquipment'>,
  look: Appearance = {},
) {
  return equipmentDefense({
    torso: look.torso && equipmentOwned(purse, look.torso) ? look.torso : undefined,
    boots: ownedBoots(purse, look),
    iceTop: look.iceTop && equipmentOwned(purse, 'ice-top'),
    icePants: look.icePants && equipmentOwned(purse, 'ice-pants'),
  });
}
export function itemLoot(id: string, amount = 1) {
  const item = itemById(id);
  return {
    lootKind: item?.slot === 'hat' ? 'hat' : EQUIPMENT_IDS.includes(id) ? 'equipment' : id,
    ...(EQUIPMENT_IDS.includes(id) ? { itemId: id } : {}),
    ...(item?.slot === 'hat' ? { hatId: item.hatId } : {}),
    amount,
    label: id === 'coins' ? amount + ' coins' : item?.name || id,
    description: item?.description || 'A well-made piece of equipment.',
  };
}

export const sandwichCapacity = (purse: Pick<EconomyState, 'ownedEquipment'>) =>
  equipmentOwned(purse, 'backpack') ? 20 : 5;

export function weaponAttackInterval(weapon: string, purse: { ownedEquipment: string | string[] }) {
  // Retain the saved equipment key for players who already earned the kit.
  const upgraded =
    (weapon === 'railgun' || weapon === 'akibo') && equipmentOwned(purse, 'railgun-upgrade');
  return (ITEM_STATS[weapon]?.interval ?? ITEM_STATS.unarmed.interval) / (upgraded ? 1.1 : 1);
}
