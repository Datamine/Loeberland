export const ARMOR_TRIMMER = {
  id: 'armor-trimmer',
  name: 'Armor Trimmer',
  x: 38.7,
  z: 177.6,
  description: 'His iron armor gleams with gold around the edges.',
  torso: 'gold-trimmed-iron-armor',
  legs: 'gold-trimmed-iron-armor-legs',
} as const;

export function armorTrimmerDemand(payments: number) {
  const coins = 100 * 2 ** payments;
  return Number.isSafeInteger(coins) && coins >= 100 ? coins : null;
}
