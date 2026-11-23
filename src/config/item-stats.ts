import itemSource from '../../content/items.json' with { type: 'json' };
import { CONTENT, subscribeContent } from '../content-runtime.ts';
import type { ContentBundle } from '../types/content.ts';

export interface ItemDefinition {
  name: string;
  slot?: string;
  description?: string;
  defense?: number;
  range?: number;
  interval?: number;
  min?: number;
  max?: number;
  minPerLevel?: number;
  maxPerLevel?: number;
  accuracy?: number;
  accuracyPerLevel?: number;
  accuracyCap?: number;
  price?: number;
  color?: string;
  trim?: string;
  healing?: number;
  pickupPrice?: number;
  deliveryPrice?: number;
  inNOutPrice?: number;
  pickup?: string;
  pickupMessageId?: string;
  hatId?: string;
  coins?: number;
}
function defineItems<T extends Record<string, ItemDefinition>>(
  items: T,
): Readonly<{ [K in keyof T]: T[K] & Partial<ItemDefinition> }> &
  Readonly<Record<string, ItemDefinition>> {
  const copies = Object.fromEntries(
    Object.entries(items).map(([id, item]) => [id, { ...item }]),
  ) as T;
  return Object.freeze(copies);
}
export const MISSILE_PRICE = 50;
export const ITEM_STATS = defineItems(itemSource.items);

function applyItemContent(catalog: ContentBundle) {
  for (const [id, defaults] of Object.entries(itemSource.items))
    Object.assign(ITEM_STATS[id], defaults, catalog.items?.items[id]);
}

applyItemContent(CONTENT);
subscribeContent(applyItemContent);

export const EQUIPMENT_IDS = Object.freeze([
  'tinfoil-suit',
  'railgun-upgrade',
  'combat-boots',
  'party-boots',
  'ball-chair',
  'eames-chair',
  'bertoia-chair',
  'marshmallow-sofa',
  'ovalia-chair',
  'bayonet',
  'railgun',
  'battleaxe',
  'rolling-pin',
  'crowbar',
  'ice-top',
  'ice-pants',
  'akibo',
  'backpack',
  'new-year-rocket',
  'clock-amulet',
  'recoil-amulet',
  'iron-armor',
  'iron-armor-legs',
  'gold-trimmed-iron-armor',
  'missile-launcher',
  'black-cloak-top',
  'black-cloak-bottom',
  'decorative-robe-top',
  'cashmere-turtleneck',
  'goose-corp-shirt',
  'goose-costume',
  'decorative-robe-bottom',
  'goblin-phone',
  'fighter-yard-pass',
] satisfies string[]);
