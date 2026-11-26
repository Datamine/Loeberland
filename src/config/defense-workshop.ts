export const DEFENSE_WORKSHOP = {
  id: 'defense-workshop',
  name: 'Defense Workshop',
  sign: 'DEFENSE WORKSHOP',
  description: 'A brick workshop with a metal lathe, a welding station, and a rack of steel stock.',
  plot: { x: 52.6, z: 210.3 },
  manufacturer: {
    id: 'defense-manufacturer',
    name: 'Defense Manufacturer',
    description: 'Metal filings cling to the cuffs of a well-worn protective vest.',
    x: 53,
    z: 211,
    approach: { x: 51.95, y: 210.37 },
  },
  assistant: {
    id: 'defense-workshop-assistant',
    name: 'Workshop Assistant',
    description: 'A machinist’s assistant with ink marks on both thumbs.',
    x: 51.45,
    z: 210.08,
    approach: { x: 51.77, y: 210.02 },
  },
} as const;

export const isDefenseWorkshopPlot = ({ x, z }: { x: number; z: number }) =>
  x === DEFENSE_WORKSHOP.plot.x && z === DEFENSE_WORKSHOP.plot.z;

const VEST_STOCK = ['steel-chainmail', 'kevlar-vest'] as const;
export const DEFENSE_ARMOR_STOCK = [...VEST_STOCK, 'kevlar-pants'] as const;
export const ICY_KEVLAR = {
  item: 'icy-kevlar-vest',
  slot: 'torso',
  ingredients: ['kevlar-vest', 'ice-top'],
  coins: 22000,
  sand: 100,
  peptides: 10,
} as const;

export const ICY_KEVLAR_PANTS = {
  ...ICY_KEVLAR,
  item: 'icy-kevlar-pants',
  slot: 'legs',
  ingredients: ['kevlar-pants', 'ice-pants'],
} as const;

export const DEFENSE_ARMOR_RECIPES = [ICY_KEVLAR, ICY_KEVLAR_PANTS] as const;
export const DEFENSE_TORSOS = [...VEST_STOCK, ICY_KEVLAR.item] as const;
export const DEFENSE_LEGS = ['kevlar-pants', ICY_KEVLAR_PANTS.item] as const;
export function isDefenseArmor(id?: string): id is (typeof DEFENSE_TORSOS)[number] {
  return DEFENSE_TORSOS.some((item) => item === id);
}
export function isDefenseLegArmor(id?: string): id is (typeof DEFENSE_LEGS)[number] {
  return DEFENSE_LEGS.some((item) => item === id);
}
