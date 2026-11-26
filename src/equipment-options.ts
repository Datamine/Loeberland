import { ITEM_STATS, PLAYER_WEAPONS, weaponDisplayName, weaponOwned } from './item-stats.ts';
import { HAT_CATALOG } from './hat-catalog.ts';
import { DEFENSE_TORSOS, DEFENSE_LEGS } from './config/defense-workshop.ts';
import { HIKING_BACKPACK, UPGRADED_HIKING_BACKPACK } from './config/hiking-backpack.ts';
/** Wardrobe choices expose owned finds, never an unavailable-item checklist. */
export function equipmentOptions(
  {
    ownedEquipment = [],
    ownedHats = [],
  }: { ownedEquipment?: string[]; ownedHats?: string[] } | undefined = {},
  progress: { cape?: boolean } = {},
) {
  const owns = (id: string) => ownedEquipment.includes(id),
    option = (value: string, label: string) => ({ value, label });
  return {
    hat: [
      option('none', 'No hat'),
      ...HAT_CATALOG.filter((h) => ownedHats.includes(h.id)).map((h) => option(h.id, h.name)),
    ],
    weapon: [
      option('unarmed', 'Fist'),
      ...PLAYER_WEAPONS.filter((id) => id !== 'unarmed')
        .filter((id) => weaponOwned({ ownedEquipment }, id))
        .map((id) => option(id, weaponDisplayName(id, { ownedEquipment }))),
    ],
    back: [
      option('none', 'Nothing on back'),
      ...([HIKING_BACKPACK, UPGRADED_HIKING_BACKPACK, 'new-year-rocket', 'invisibility-cloak'] satisfies string[])
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
      ...(progress.cape ? [option('cape', 'Kraken cape')] : []),
    ],
    neck: [
      option('none', 'Nothing on neck'),
      ...(owns('black-tie') ? [option('black-tie', ITEM_STATS['black-tie'].name)] : []),
      ...(owns('white-scarf') ? [option('white-scarf', ITEM_STATS['white-scarf'].name)] : []),
      ...(owns('recoil-amulet') ? [option('recoil-amulet', ITEM_STATS['recoil-amulet'].name)] : []),
      ...(owns('defence-amulet') ? [option('defence-amulet', ITEM_STATS['defence-amulet'].name)] : []),
      ...(owns('goblin-charm') ? [option('goblin-charm', ITEM_STATS['goblin-charm'].name)] : []),
      ...(owns('clock-amulet') ? [option('clock-amulet', ITEM_STATS['clock-amulet'].name)] : []),
      ...(owns('albatross') ? [option('albatross', ITEM_STATS.albatross.name)] : []),
    ],
    torso: [
      option('shirt', 'Regular shirt'),
      ...(
        [
          'ice-top',
          'black-cloak-top',
          'tinfoil-suit',
          'decorative-robe-top',
          'charcoal-suit',
          'silk-kimono',
          'techwear-top',
          'yellow-top',
          'bush-top',
          'cashmere-turtleneck',
          'puffy-parka',
          'leather-jacket',
          'barrel',
          'goose-corp-shirt',
          'goose-costume',
          'iron-armor',
          'gold-trimmed-iron-armor',
          ...DEFENSE_TORSOS,
        ] as const
      )
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
    ],
    legs: [
      option('trousers', 'Regular trousers'),
      ...(
        [
          'ice-pants',
          'black-cloak-bottom',
          'decorative-robe-bottom',
          'yellow-pants',
          'blue-jeans',
          'techwear-bottoms',
        'bush-legs',
          'iron-armor-legs',
          'gold-trimmed-iron-armor-legs',
          ...DEFENSE_LEGS,
        ] as const
      )
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
    ],
    boots: [
      option('false', 'Regular shoes'),
      ...(owns('combat-boots') ? [option('true', 'Combat boots')] : []),
      ...(owns('party-boots') ? [option('party-boots', ITEM_STATS['party-boots'].name)] : []),
    ],
    iceTop: [
      option('false', 'Regular shirt'),
      ...(owns('ice-top') ? [option('true', ITEM_STATS['ice-top'].name)] : []),
    ],
    icePants: [
      option('false', 'Regular trousers'),
      ...(owns('ice-pants') ? [option('true', ITEM_STATS['ice-pants'].name)] : []),
    ],
  };
}
export function fillEquipmentSelect(
  field: HTMLSelectElement,
  options: readonly { value: string; label: string }[],
  value: string | boolean,
) {
  field.replaceChildren();
  for (const choice of options) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    field.append(option);
  }
  field.value = options.some((o) => o.value === String(value)) ? String(value) : options[0].value;
}
