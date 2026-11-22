export const TAHOE_PELT_PRICES = Object.freeze({
  'bear-pelt': 30,
  'fox-pelt': 18,
});

export type TahoePelt = keyof typeof TAHOE_PELT_PRICES;
export const TAHOE_PELTS = Object.keys(TAHOE_PELT_PRICES) as TahoePelt[];

export function isTahoePelt(id: string): id is TahoePelt {
  return Object.hasOwn(TAHOE_PELT_PRICES, id);
}
