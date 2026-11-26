import { equipmentOptions } from '../src/equipment-options.ts';
import { clothingSelection } from '../src/clothing.ts';
import { HAT_CATALOG } from '../src/hat-catalog.ts';
import { EQUIPMENT_IDS, ITEM_STATS, baseEquipmentId, equipmentOwned, normalizeBoots } from '../src/item-stats.ts';
import { UPGRADED_AKIMBO, UPGRADED_RAILGUN, baseWeaponId } from '../src/config/weapon-upgrades.ts';
import { isRecord } from '../src/types/json.ts';

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const object = (value: unknown) => (isRecord(value) ? value : {});
const eyewear = [
  { value: 'false', label: 'No eyewear' },
  { value: 'true', label: 'Sunglasses' },
];
const defaultOptions = equipmentOptions(
  { ownedEquipment: EQUIPMENT_IDS.filter((id) => baseWeaponId(id) === id), ownedHats: HAT_CATALOG.map((hat) => hat.id) },
  { cape: true },
);
export const adminEquipmentOptions = {
  ...defaultOptions,
  weapon: [
    ...defaultOptions.weapon,
    ...[UPGRADED_RAILGUN, UPGRADED_AKIMBO].map((value) => ({ value, label: ITEM_STATS[value].name })),
  ],
  sunglasses: eyewear,
};
export type AdminEquipmentSlot = Exclude<keyof typeof adminEquipmentOptions, 'iceTop' | 'icePants'>;
export type AdminEquipmentDraft = {
  player: Record<string, unknown>;
  inventory: Record<string, unknown>;
  quests: Record<string, unknown>;
};
export function unlockedEquipment({ inventory, quests }: AdminEquipmentDraft) {
  const economy = object(inventory.economy);
  const expeditions = object(quests.expeditions);
  return {
    ...equipmentOptions(
      {
        ownedEquipment: strings(economy.ownedEquipment),
        ownedHats: strings(economy.ownedHats),
      },
      {
        cape: expeditions.cape === true,
      },
    ),
    sunglasses: object(inventory.sunglasses).owned === true ? eyewear : eyewear.slice(0, 1),
  };
}

export function grantAndEquip(
  { player, inventory, quests }: AdminEquipmentDraft,
  slot: AdminEquipmentSlot,
  value: string,
) {
  const choices = adminEquipmentOptions[slot];
  if (!choices.some((item) => item.value === value)) return false;
  if (value !== choices[0].value) {
    if (slot === 'sunglasses') {
      inventory.sunglasses = { ...object(inventory.sunglasses), owned: true };
    } else if (slot === 'back' && value === 'cape') {
      quests.expeditions = { ...object(quests.expeditions), cape: true };
    } else {
      const economy = object(inventory.economy);
      const list = slot === 'hat' ? 'ownedHats' : 'ownedEquipment';
      const item = slot === 'boots' && value === 'true' ? 'combat-boots' : value;
      const owned = strings(economy[list]);
      const base = baseEquipmentId(item);
      if (base !== item) {
        inventory.economy = {
          ...economy,
          [list]: [...owned.filter((id) => baseEquipmentId(id) !== base), item],
        };
      } else if (!equipmentOwned({ ownedEquipment: owned }, item))
        inventory.economy = { ...economy, [list]: [...owned, item] };
    }
  }
  const appearance = { ...object(player.appearance) };
  appearance[slot] =
    slot === 'boots' ? normalizeBoots(value) : slot === 'sunglasses' ? value === 'true' : baseWeaponId(value);
  if (slot === 'torso' || slot === 'legs') Object.assign(appearance, clothingSelection(appearance));
  if (slot === 'back') appearance.cape = value === 'cape';
  player.appearance = appearance;
  return true;
}
