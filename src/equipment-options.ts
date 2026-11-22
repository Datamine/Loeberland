import { ITEM_STATS, PLAYER_WEAPONS } from './item-stats.ts';
import { HAT_CATALOG } from './hat-catalog.ts';
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
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
    ],
    back: [
      option('none', 'Nothing on back'),
      ...(['backpack', 'new-year-rocket'] satisfies [string, string])
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
      ...(progress.cape ? [option('cape', 'Kraken cape')] : []),
    ],
    neck: [
      option('none', 'No necklace'),
      ...(owns('recoil-amulet') ? [option('recoil-amulet', ITEM_STATS['recoil-amulet'].name)] : []),
      ...(owns('clock-amulet') ? [option('clock-amulet', ITEM_STATS['clock-amulet'].name)] : []),
    ],
    torso: [
      option('shirt', 'Regular shirt'),
      ...(
        [
          'ice-top',
          'black-cloak-top',
          'tinfoil-suit',
          'decorative-robe-top',
          'cashmere-turtleneck',
          'goose-corp-shirt',
          'goose-costume',
          'iron-armor',
          'gold-trimmed-iron-armor',
        ] as const
      )
        .filter(owns)
        .map((id) => option(id, ITEM_STATS[id].name)),
    ],
    legs: [
      option('trousers', 'Regular trousers'),
      ...(['ice-pants', 'black-cloak-bottom', 'decorative-robe-bottom', 'iron-armor-legs'] as const)
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
