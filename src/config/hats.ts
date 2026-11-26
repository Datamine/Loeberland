import { BUSH_COLORS } from '../goblin-bush.ts';
import { FANCY_DRESS } from './fancy-dress.ts';
export interface HatStyle {
  id: string;
  name: string;
  colors: readonly string[];
  trimMetal?: boolean;
  metal?: boolean;
  gem?: boolean;
}
export type HatDefinition = HatStyle &
  (
    | { dropOnly?: false; price: number; seller?: string }
    | { dropOnly: true; price?: never; seller?: never }
  );
// CONTENT-BINDINGS-MIGRATED
import { contentText } from '../content-runtime.ts';
/** Cosmetic hat prices and model palettes. Keep IDs stable for saved inventories. */
export const HAT_CATALOG: readonly Readonly<HatDefinition>[] = Object.freeze(
  (
    [
      {
        id: 'paper',
        name: contentText('config.hats.module.name-1', {}),
        price: 1,
        colors: ['#e6dfc7', '#aaa38e', '#5a6359'] satisfies [string, string, string],
      },
      {
        id: 'beanie',
        name: contentText('config.hats.module.name-2', {}),
        price: 10,
        colors: ['#657d7c', '#9eae9b', '#c9b783'] satisfies [string, string, string],
      },
      {
        id: 'panama',
        name: contentText('config.hats.module.name-3', {}),
        price: 50,
        colors: ['#dfcda0', '#526c60', '#ccb16e'] satisfies [string, string, string],
      },
      {
        id: 'beret',
        name: contentText('config.hats.module.name-4', {}),
        price: 250,
        colors: ['#823f57', '#b77b82', '#d3b476'] satisfies [string, string, string],
      },
      {
        id: 'top-hat',
        name: contentText('config.hats.module.name-5', {}),
        price: 1000,
        colors: ['#363e43', '#9b737c', '#d5b878'] satisfies [string, string, string],
      },
      {
        id: 'cavalier',
        name: contentText('config.hats.module.name-6', {}),
        price: 5000,
        colors: ['#4f5b65', '#c3a367', '#e4d8b8'] satisfies [string, string, string],
        trimMetal: true,
      },
      {
        id: 'wizard',
        name: contentText('config.hats.module.name-7', {}),
        price: 10000,
        colors: ['#545179', '#c8ae65', '#c8d6df'] satisfies [string, string, string],
        trimMetal: true,
      },
      {
        id: 'laurel',
        name: contentText('config.hats.module.name-8', {}),
        price: 25000,
        colors: ['#d9ba63', '#e6d194', '#8fb9a3'] satisfies [string, string, string],
        metal: true,
        trimMetal: true,
      },
      {
        id: 'stone-of-jordan',
        name: contentText('config.hats.module.name-9', {}),
        price: 50000,
        colors: ['#777e82', '#b2b6b3', '#7b77a4'] satisfies [string, string, string],
      },
      {
        id: 'santa',
        name: contentText('config.hats.module.name-10', {}),
        price: 75000,
        colors: ['#ba3c49', '#eee8d6', '#84323b'] satisfies [string, string, string],
      },
      // Keep the old top-tier inventory ID so owners retain their purchase.
      {
        id: 'crown',
        name: contentText('config.hats.module.name-11', {}),
        price: 100000,
        colors: ['#3568d1', '#78a3ef', '#23478f'] satisfies [string, string, string],
      },
      {
        id: 'loaf-of-bread',
        name: 'Loaf of Bread',
        price: 5,
        seller: 'bakery',
        colors: ['#af6534', '#f2c57e', '#6d411f'],
      },
      {
        id: 'jester',
        name: 'Jester hat',
        price: 50,
        seller: 'decorative-robe-seller',
        colors: ['#bd2962', '#146d89', '#f2c04e'],
      },
      {
        id: 'napoleon-hat',
        name: 'Napoleon hat',
        price: 2200,
        seller: FANCY_DRESS.id,
        colors: ['#262631', '#c3a773', '#9c3544'],
      },
      {
        id: 'gnome-cap',
        name: 'Gnome cap',
        price: 4400,
        seller: FANCY_DRESS.id,
        colors: ['#3c8c49', '#3c8c49', '#3c8c49'],
      },
      {
        id: 'goblin-helmet',
        name: 'Goblin helmet',
        dropOnly: true,
        colors: ['#41474a', '#50575a', '#697278'],
      },
      {
        id: 'upgraded-goblin-helmet',
        name: 'Reinforced goblin helmet',
        dropOnly: true,
        colors: ['#39434c', '#97643c', '#dfb465'],
      },
      {
        id: 'bush-hat',
        name: 'Bush hat',
        dropOnly: true,
        colors: BUSH_COLORS,
      },
      {
        id: 'stetson',
        name: contentText('config.hats.module.name-12', {}),
        dropOnly: true,
        colors: ['#b68a57', '#614431', '#dfbd82'] satisfies [string, string, string],
      },
      {
        id: 'pirate',
        name: contentText('config.hats.module.name-13', {}),
        dropOnly: true,
        colors: ['#30383d', '#c6a76b', '#e7e0c9'] satisfies [string, string, string],
      },
    ] satisfies HatDefinition[]
  ).map((h) => Object.freeze({ ...h, colors: Object.freeze(h.colors) })),
);
