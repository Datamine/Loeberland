import { equipmentOptions } from '../src/equipment-options.ts';
import { clothingSelection } from '../src/clothing.ts';
import { HAT_CATALOG } from '../src/hat-catalog.ts';
import { EQUIPMENT_IDS, railgunUnlocked } from '../src/item-stats.ts';
import { isRecord } from '../src/types/json.ts';

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const object = (value: unknown) => (isRecord(value) ? value : {});
const eyewear = [
  { value: 'false', label: 'No eyewear' },
  { value: 'true', label: 'Sunglasses' },
];
export const adminEquipmentOptions = {
  ...equipmentOptions(
    { ownedEquipment: [...EQUIPMENT_IDS], ownedHats: HAT_CATALOG.map((hat) => hat.id) },
    { bayonet: true, railgun: true, cape: true },
  ),
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
  const aliens = object(quests.theyLive);
  const expeditions = object(quests.expeditions);
  return {
    ...equipmentOptions(
      {
        ownedEquipment: strings(economy.ownedEquipment),
        ownedHats: strings(economy.ownedHats),
      },
      {
        bayonet: [aliens.started, aliens.evidence, aliens.permit, aliens.bayonet].every(
          (flag) => flag === true,
        ),
        railgun: railgunUnlocked(expeditions),
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
    } else if (slot === 'weapon' && value === 'bayonet') {
      quests.theyLive = {
        ...object(quests.theyLive),
        started: true,
        evidence: true,
        permit: true,
        bayonet: true,
      };
    } else if (slot === 'weapon' && value === 'railgun') {
      const expedition = { ...object(quests.expeditions), railgun: true, equipped: true };
      if (!railgunUnlocked(expedition)) Object.assign(expedition, { raptor: 'escaped' });
      quests.expeditions = expedition;
    } else {
      const economy = object(inventory.economy);
      const list = slot === 'hat' ? 'ownedHats' : 'ownedEquipment';
      const item = slot === 'boots' ? 'combat-boots' : value;
      const owned = strings(economy[list]);
      if (!owned.includes(item)) inventory.economy = { ...economy, [list]: [...owned, item] };
    }
  }
  const appearance = { ...object(player.appearance) };
  appearance[slot] = slot === 'boots' || slot === 'sunglasses' ? value === 'true' : value;
  if (slot === 'torso' || slot === 'legs') Object.assign(appearance, clothingSelection(appearance));
  if (slot === 'back') appearance.cape = value === 'cape';
  player.appearance = appearance;
  return true;
}
