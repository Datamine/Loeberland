import itemSource from '../../content/items.json' with { type: 'json' };
import { CONTENT, subscribeContent } from '../content-runtime.ts';
import type { ContentBundle } from '../types/content.ts';
import { DEFENSE_TORSOS, DEFENSE_LEGS } from './defense-workshop.ts';
import { UPGRADED_AKIMBO, UPGRADED_RAILGUN } from './weapon-upgrades.ts';
import { HIKING_BACKPACK, UPGRADED_HIKING_BACKPACK } from './hiking-backpack.ts';

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
  accuracyFalloff?: number;
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
export const MISSILE_PRICE = 9;
export const ITEM_STATS = defineItems(itemSource.items);

function applyItemContent(catalog: ContentBundle) {
  for (const [id, defaults] of Object.entries(itemSource.items))
    Object.assign(ITEM_STATS[id], defaults, catalog.items?.items[id]);
}

applyItemContent(CONTENT);
subscribeContent(applyItemContent);

export const EQUIPMENT_IDS = Object.freeze([
  'tinfoil-suit',
  'combat-boots',
  'party-boots',
  'ball-chair',
  'eames-chair',
  'bertoia-chair',
  'marshmallow-sofa',
  'ovalia-chair',
  'bayonet',
  'railgun',
  UPGRADED_RAILGUN,
  'battleaxe',
  'combat-lamp',
  'katana',
  'lightsaber',
  'rolling-pin',
  'bowling-ball',
  'crowbar',
  'ice-top',
  'ice-pants',
  'akibo',
  UPGRADED_AKIMBO,
  HIKING_BACKPACK,
  UPGRADED_HIKING_BACKPACK,
  'new-year-rocket',
  'invisibility-cloak',
  'clock-amulet',
  'recoil-amulet',
  'defence-amulet',
  'goblin-charm',
  'albatross',
  'iron-armor',
  'iron-armor-legs',
  'gold-trimmed-iron-armor',
  'gold-trimmed-iron-armor-legs',
  ...DEFENSE_TORSOS,
  ...DEFENSE_LEGS,
  'missile-launcher',
  'black-cloak-top',
  'black-cloak-bottom',
  'decorative-robe-top',
  'cashmere-turtleneck',
  'puffy-parka',
  'leather-jacket',
  'spoon',
  'barrel',
  'goose-corp-shirt',
  'goose-costume',
  'decorative-robe-bottom',
  'charcoal-suit',
  'black-tie',
  'white-scarf',
  'blue-jeans',
  'silk-kimono',
  'techwear-top',
  'techwear-bottoms',
  'yellow-top',
  'yellow-pants',
  'bush-top',
  'bush-legs',
  'goblin-phone',
  'scooter',
  'fighter-yard-pass',
] satisfies string[]);
