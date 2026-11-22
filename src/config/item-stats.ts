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
  return Object.freeze(items);
}
// CONTENT-BINDINGS-MIGRATED
import { contentText } from '../content-runtime.ts';
/** Edit item balance, prices, equipment colors and descriptions here. */
export const MISSILE_PRICE = 50;
export const ITEM_STATS = defineItems({
  'tinfoil-suit': {
    name: contentText('config.item-stats.module.name-1', {}),
    slot: 'top',
    description: contentText('config.item-stats.module.description-2', {}),
  },
  'railgun-upgrade': {
    name: contentText('config.item-stats.module.name-3', {}),
    description: contentText('config.item-stats.module.description-4', {}),
  },
  'combat-boots': {
    name: contentText('config.item-stats.module.name-5', {}),
    slot: 'feet',
    defense: 2,
    description: contentText('config.item-stats.module.description-6', {}),
  },
  'party-boots': {
    name: 'Party Boots',
    slot: 'feet',
    description: 'Matilda’s tall rainbow boots, with platform soles and rows of metal studs.',
  },
  'eames-chair': {
    name: 'Eames Chair',
    description:
      'A walnut lounge chair with dark leather cushions from the Goblin Furniture Factory.',
  },
  'bertoia-chair': {
    name: 'Bertoia Chair',
    description: 'A wire-frame chair from the Goblin Furniture Factory.',
  },
  'ball-chair': {
    name: contentText('config.item-stats.module.name-7', {}),
    description: contentText('config.item-stats.module.description-8', {}),
  },
  unarmed: {
    name: contentText('config.item-stats.module.name-9', {}),
    slot: 'weapon',
    range: 1.35,
    interval: 1.05,
    min: 1,
    max: 2,
    minPerLevel: 0,
    maxPerLevel: 0.8,
    accuracy: 0.65,
    accuracyPerLevel: 0.02,
    accuracyCap: 0.9,
  },
  'rolling-pin': {
    name: 'Metal rolling pin',
    slot: 'weapon',
    price: 20,
    range: 1.4,
    interval: 1,
    min: 2,
    max: 5,
    minPerLevel: 0.15,
    maxPerLevel: 0.8,
    accuracy: 0.78,
    accuracyPerLevel: 0.012,
    accuracyCap: 0.94,
    description:
      'A stainless-steel rolling pin from Cotogna, with a solid barrel and worn wooden handles.',
  },
  crowbar: {
    name: 'Crowbar',
    slot: 'weapon',
    price: 35,
    range: 1.5,
    interval: 1,
    min: 2,
    max: 6,
    minPerLevel: 0.15,
    maxPerLevel: 0.8,
    accuracy: 0.78,
    accuracyPerLevel: 0.012,
    accuracyCap: 0.94,
    description: 'A steel crowbar with a red shaft and a forged hook.',
  },
  bayonet: {
    name: contentText('config.item-stats.module.name-10', {}),
    slot: 'weapon',
    range: 1.35,
    interval: 1.05,
    min: 4,
    max: 11,
    minPerLevel: 0.4,
    maxPerLevel: 1,
    accuracy: 0.92,
    accuracyPerLevel: 0.006,
    accuracyCap: 0.98,
  },
  battleaxe: {
    name: contentText('config.item-stats.module.name-11', {}),
    slot: 'weapon',
    price: 50,
    range: 1.5,
    interval: 1.05,
    min: 6,
    max: 11.5,
    minPerLevel: 0.35,
    maxPerLevel: 0.85,
    accuracy: 0.935,
    accuracyPerLevel: 0.005,
    accuracyCap: 0.985,
  },
  railgun: {
    name: contentText('config.item-stats.module.name-12', {}),
    slot: 'weapon',
    range: 5,
    interval: 0.8,
    min: 8,
    max: 12,
    minPerLevel: 0.3,
    maxPerLevel: 0.7,
    accuracy: 0.95,
    accuracyPerLevel: 0.004,
    accuracyCap: 0.99,
  },
  akibo: {
    name: contentText('config.item-stats.module.name-13', {}),
    slot: 'weapon',
    range: 7,
    interval: 0.8,
    min: 8,
    max: 12,
    minPerLevel: 0.3,
    maxPerLevel: 0.7,
    accuracy: 0.95,
    accuracyPerLevel: 0.004,
    accuracyCap: 0.99,
  },
  'new-year-rocket': {
    name: contentText('config.item-stats.module.name-14', {}),
    slot: 'back',
    description: contentText('config.item-stats.module.description-15', {}),
  },
  uni: { name: 'Uni', description: 'Fresh sea urchin roe. Rich Table buys it for 40 coins.' },
  'sand-bucket': { name: 'Bucket of sand', description: 'A bucket filled with ordinary sand.' },
  'iron-armor': {
    name: 'Iron torso armor',
    slot: 'torso',
    defense: 3,
    price: 120,
    description: 'A dark gray iron breastplate and pauldrons.',
  },
  'iron-armor-legs': {
    name: 'Iron leg armor',
    slot: 'legs',
    defense: 2,
    price: 100,
    description: 'Articulated iron plates that cover the thighs, knees, and shins.',
  },
  'gold-trimmed-iron-armor': {
    name: 'Gold-trimmed iron armor',
    slot: 'torso',
    defense: 3,
    description: 'A dark iron breastplate edged with polished gold.',
  },
  'armor-trimming-kit': {
    name: 'Armor trimming kit',
    description: 'Apply it to a suit of iron armor to add gold trim.',
  },
  'bind-tablet': {
    name: 'Bind Tablet',
    description: 'Binds nearby PvP opponents for ten seconds. Breaking it deals 10 damage to you.',
  },
  'recoil-amulet': {
    name: 'Recoil Amulet',
    slot: 'neck',
    description: 'Returns one fifth of damage taken to the attacker.',
  },
  'missile-launcher': {
    name: 'Missile Launcher',
    slot: 'weapon',
    description: 'A heavy shoulder launcher built in the Berkeley lab. Uses one missile per shot.',
    interval: 2.4,
    range: 12,
    min: 17,
    max: 60,
    minPerLevel: 0.9,
    maxPerLevel: 2.95,
    accuracy: 0.95,
    accuracyPerLevel: 0.004,
    accuracyCap: 0.99,
  },
  'clock-amulet': {
    name: contentText('config.item-stats.module.name-16', {}),
    slot: 'neck',
    description: contentText('config.item-stats.module.description-17', {}),
  },
  backpack: {
    name: contentText('config.item-stats.module.name-18', {}),
    slot: 'back',
    price: 100,
    description: contentText('config.item-stats.module.description-19', {}),
  },
  'bison-hide': {
    name: contentText('config.item-stats.module.name-20', {}),
    description: contentText('config.item-stats.module.description-21', {}),
  },
  'bear-pelt': {
    name: 'Bear pelt',
    description: 'Thick, dark Tahoe fur. The decorative robe clothier buys it for trim.',
  },
  'fox-pelt': {
    name: 'Fox pelt',
    description:
      'Russet Tahoe fur with a white underside. The decorative robe clothier buys it for trim.',
  },
  'fighter-yard-pass': {
    name: 'Fighter Yard pass',
    description: 'A signed waiver and receipt for 10 coins, recorded by Tyler at the Fighter Yard.',
  },
  'goblin-phone': {
    name: 'Goblin Phone',
    price: 10,
    description: 'A clay brick. The industrialist says it makes a good notepad.',
  },
  'decorative-robe-top': {
    name: 'Decorative robe top',
    slot: 'top',
    price: 10,
    description: 'A pink long-sleeved robe top with rainbow trim.',
  },
  'cashmere-turtleneck': {
    name: 'Cream cashmere turtleneck',
    description: 'A soft cream cashmere sweater with a thick, folded ribbed collar.',
    slot: 'top',
    price: 500,
  },
  'goose-corp-shirt': {
    name: 'Goose Corp T-shirt',
    description: 'A charcoal T-shirt with a white goose logo on the chest.',
    slot: 'top',
  },
  'goose-costume': {
    name: 'Goose Costume',
    slot: 'torso',
    description: 'A padded white goose costume with an orange bill.',
  },
  'decorative-robe-bottom': {
    name: 'Decorative robe bottom',
    slot: 'legs',
    price: 10,
    description: 'A pink robe skirt with a rainbow hem.',
  },
  'black-cloak-top': {
    name: contentText('config.item-stats.module.name-22', {}),
    slot: 'top',
    description: contentText('config.item-stats.module.description-23', {}),
  },
  'black-cloak-bottom': {
    name: contentText('config.item-stats.module.name-24', {}),
    slot: 'legs',
    description: contentText('config.item-stats.module.description-25', {}),
  },
  'downtown-tablet': {
    name: contentText('config.item-stats.module.name-26', {}),
    price: 20,
    description: contentText('config.item-stats.module.description-27', {}),
  },
  'cupertino-tablet': {
    name: 'Cupertino Teleport',
    price: 20,
  },
  'tahoe-tablet': {
    name: contentText('config.item-stats.module.name-28', {}),
    price: 20,
    description: contentText('config.item-stats.module.description-29', {}),
  },
  'goblin-village-tablet': {
    name: 'Goblin Village Teleport',
    price: 20,
  },
  'ice-top': {
    name: contentText('config.item-stats.module.name-30', {}),
    slot: 'top',
    defense: 5,
    color: '#92d9ed',
    trim: '#e1faff',
    description: contentText('config.item-stats.module.description-31', {}),
  },
  'ice-pants': {
    name: contentText('config.item-stats.module.name-32', {}),
    slot: 'legs',
    defense: 5,
    color: '#78bde5',
    trim: '#d1f4ff',
    description: contentText('config.item-stats.module.description-33', {}),
  },
  sandwich: {
    name: contentText('config.item-stats.module.name-34', {}),
    healing: 15,
    pickupPrice: 3,
    deliveryPrice: 15,
    inNOutPrice: 2,
    description: contentText('config.item-stats.module.description-35', {}),
  },
  peptides: {
    name: contentText('config.item-stats.module.name-36', {}),
    description: contentText('config.item-stats.module.description-37', {}),
  },
  coins: {
    name: contentText('config.item-stats.module.name-38', {}),
    description: contentText('config.item-stats.module.description-39', {}),
  },
  'goose-membership-card': {
    name: contentText('config.item-stats.module.name-40', {}),
    description: contentText('config.item-stats.module.description-41', {}),
    pickup: 'disintegrate',
    pickupMessageId: 'world-message.loot.goose-card-disintegrates',
  },
  'stetson-hat': {
    name: contentText('config.item-stats.module.name-42', {}),
    slot: 'hat',
    hatId: 'stetson',
    description: contentText('config.item-stats.module.description-43', {}),
  },
  'pirate-hat': {
    name: contentText('config.item-stats.module.name-44', {}),
    slot: 'hat',
    hatId: 'pirate',
    description: contentText('config.item-stats.module.description-45', {}),
  },
  raptor: {
    name: contentText('config.item-stats.module.name-46', {}),
    description: contentText('config.item-stats.module.description-47', {}),
  },
  kraken: {
    name: contentText('config.item-stats.module.name-48', {}),
    coins: 100,
    description: contentText('config.item-stats.module.description-49', {}),
  },
});
export const EQUIPMENT_IDS = Object.freeze([
  'tinfoil-suit',
  'railgun-upgrade',
  'combat-boots',
  'party-boots',
  'ball-chair',
  'eames-chair',
  'bertoia-chair',
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
