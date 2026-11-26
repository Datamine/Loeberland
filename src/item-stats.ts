import type { Appearance, EconomyState } from './types/content.ts';
import { isOneOf } from './types/json.ts';
import { ITEM_STATS, EQUIPMENT_IDS } from './config/item-stats.ts';
import { sandwichStackLabel } from './ground-items.ts';
import { isDefenseArmor, isDefenseLegArmor } from './config/defense-workshop.ts';
import { WEAPON_UPGRADE_KIT, baseWeaponId, upgradedWeaponId } from './config/weapon-upgrades.ts';
import {
  HIKING_BACKPACK,
  HIKING_BACKPACK_UPGRADE_KIT,
  UPGRADED_HIKING_BACKPACK,
} from './config/hiking-backpack.ts';

export { ITEM_STATS, EQUIPMENT_IDS };
export { MISSILE_PRICE } from './config/item-stats.ts';
export const IRON_ARMOR_PIECES = ['iron-armor', 'iron-armor-legs'] as const;
export type IronArmorPiece = (typeof IRON_ARMOR_PIECES)[number];
export const TRIMMED_IRON_ARMOR = {
  'iron-armor': 'gold-trimmed-iron-armor',
  'iron-armor-legs': 'gold-trimmed-iron-armor-legs',
} as const;
export const isIronArmorTorso = (id: unknown): id is 'iron-armor' | 'gold-trimmed-iron-armor' =>
  id === 'iron-armor' || id === 'gold-trimmed-iron-armor';
export const isIronArmorLegs = (id: unknown): id is 'iron-armor-legs' | 'gold-trimmed-iron-armor-legs' =>
  id === 'iron-armor-legs' || id === 'gold-trimmed-iron-armor-legs';
const PROJECTILE_WEAPONS = ['railgun', 'akibo', 'missile-launcher'] as const;
export const isProjectileWeapon = (weapon: unknown) => isOneOf(PROJECTILE_WEAPONS, weapon);
export const PLAYER_WEAPONS = [
  'unarmed',
  'rolling-pin',
  'bowling-ball',
  'crowbar',
  'combat-lamp',
  'bayonet',
  'battleaxe',
  'katana',
  'railgun',
  'akibo',
  'missile-launcher',
  'lightsaber',
] as const;

/** Runtime inventory helpers for the editable item catalog. */
export function itemById(id: PropertyKey) {
  return Object.hasOwn(ITEM_STATS, id) ? ITEM_STATS[String(id)] : null;
}
export function equipmentOwned(purse: { ownedEquipment: string | string[] }, id: string) {
  const upgraded = id === HIKING_BACKPACK ? UPGRADED_HIKING_BACKPACK : upgradedWeaponId(id);
  return !!(
    purse?.ownedEquipment?.includes(id) ||
    (upgraded && purse?.ownedEquipment?.includes(upgraded))
  );
}
export function baseEquipmentId(id: string) {
  return id === UPGRADED_HIKING_BACKPACK ? HIKING_BACKPACK : baseWeaponId(id);
}
export function upgradeKitRequirement(kit: string, purse?: Pick<EconomyState, 'ownedEquipment'>) {
  if (kit === WEAPON_UPGRADE_KIT &&
    !(purse && (equipmentOwned(purse, 'railgun') || equipmentOwned(purse, 'akibo'))))
    return 'You need a Railgun or an Akimbo to collect a weapon upgrade kit.';
  if (kit === HIKING_BACKPACK_UPGRADE_KIT && !(purse && equipmentOwned(purse, HIKING_BACKPACK)))
    return 'You need a Hiking Backpack to collect this upgrade kit.';
}
export function canUpgradeWeapon(purse: Pick<EconomyState, 'ownedEquipment'>, weapon: string) {
  const upgraded = upgradedWeaponId(weapon);
  return !!upgraded &&
    purse.ownedEquipment.includes(weapon) &&
    !purse.ownedEquipment.includes(upgraded);
}
export function weaponDisplayName(weapon: string, purse: Pick<EconomyState, 'ownedEquipment'>) {
  const upgraded = upgradedWeaponId(weapon);
  const equipped = upgraded && purse.ownedEquipment.includes(upgraded) ? upgraded : weapon;
  return ITEM_STATS[equipped]?.name ?? ITEM_STATS.unarmed.name;
}
export function ownsIronArmorPiece(
  purse: Pick<EconomyState, 'ownedEquipment'>,
  id: IronArmorPiece,
) {
  return equipmentOwned(purse, id) || equipmentOwned(purse, TRIMMED_IRON_ARMOR[id]);
}
export function trimmableIronArmor(purse: Pick<EconomyState, 'ownedEquipment'>) {
  return IRON_ARMOR_PIECES.find((id) => equipmentOwned(purse, id) && !equipmentOwned(purse, TRIMMED_IRON_ARMOR[id]));
}
export function normalizeBoots(value: unknown): NonNullable<Appearance['boots']> {
  return value === 'party-boots' ? value : value === true || value === 'true';
}
export function normalizeNeck(value: unknown) {
  return typeof value === 'string' && itemById(value)?.slot === 'neck' ? value : 'none';
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
export function goblinCharmEquipped(
  purse: Pick<EconomyState, 'ownedEquipment'>,
  look: Appearance,
) {
  return look.neck === 'goblin-charm' && equipmentOwned(purse, look.neck);
}
export function invisibilityCloakEquipped(look?: Pick<Appearance, 'back'>) {
  return look?.back === 'invisibility-cloak';
}
export function equipmentDefense(look: Appearance = {}) {
  const neck = look.neck ? itemById(look.neck) : null;
  return (
    (look.hat === 'goblin-helmet' ||
    look.hat === 'upgraded-goblin-helmet' ||
    look.hat === 'bush-hat'
      ? ITEM_STATS[look.hat].defense
      : 0) +
    (look.torso === 'bush-top' ||
    look.torso === 'puffy-parka' ||
    look.torso === 'barrel' ||
    isDefenseArmor(look.torso) ||
    isIronArmorTorso(look.torso)
      ? ITEM_STATS[look.torso].defense
      : 0) +
    (isIronArmorLegs(look.legs) || look.legs === 'bush-legs' || isDefenseLegArmor(look.legs)
      ? ITEM_STATS[look.legs].defense
      : 0) +
    (look.boots === true ? ITEM_STATS['combat-boots'].defense : 0) +
    (look.iceTop ? ITEM_STATS['ice-top'].defense : 0) +
    (look.icePants ? ITEM_STATS['ice-pants'].defense : 0) +
    (neck?.slot === 'neck' ? (neck.defense ?? 0) : 0)
  );
}
export function ownedEquipmentDefense(
  purse: Pick<EconomyState, 'ownedEquipment'> & Partial<Pick<EconomyState, 'ownedHats'>>,
  look: Appearance = {},
) {
  return equipmentDefense({
    hat: look.hat && purse.ownedHats?.includes(look.hat) ? look.hat : undefined,
    torso: look.torso && equipmentOwned(purse, look.torso) ? look.torso : undefined,
    neck: look.neck && equipmentOwned(purse, look.neck) ? look.neck : undefined,
    legs: look.legs && equipmentOwned(purse, look.legs) ? look.legs : undefined,
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
    label:
      id === 'coins'
        ? amount + ' coins'
        : id === 'sandwich' && amount > 1
          ? sandwichStackLabel(amount)
          : item?.name || id,
    description: item?.description || 'A well-made piece of equipment.',
  };
}

export function sandwichCapacity(purse: Pick<EconomyState, 'ownedEquipment'>) {
  if (equipmentOwned(purse, UPGRADED_HIKING_BACKPACK)) return 25;
  return equipmentOwned(purse, HIKING_BACKPACK) ? 20 : 5;
}

export function weaponAttackInterval(weapon: string, purse: { ownedEquipment: string | string[] }) {
  const upgraded = upgradedWeaponId(weapon);
  const interval = ITEM_STATS[weapon]?.interval ?? ITEM_STATS.unarmed.interval;
  return upgraded && purse.ownedEquipment.includes(upgraded) ? interval / 1.1 : interval;
}
