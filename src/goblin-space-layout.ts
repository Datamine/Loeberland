export const GOBLIN_SPACE_PROGRAM = {
  id: 'goblin-space-program',
  name: 'Goblin Space Program',
  x: 34.05,
  z: -32.65,
  engineer: { id: 'goblin-space-engineer', x: 34.55, z: -30.95 },
  entry: { x: 34.05, y: -30.55 },
} as const;

export const MUD_BATH = {
  id: 'mud-bath',
  name: 'Mud Bath',
  x: 54.7,
  z: 114.25,
  entry: { x: 55.45, y: 113.75 },
  basin: { x: 53.87, z: 114.38, rx: 1.85, rz: 1.22, floor: 4.24, surface: 4.55 },
  regular: { id: 'mud-bath-regular', x: 53.02, z: 114.5 },
  secondsPerMud: 5,
} as const;

export function mudBathDistance(x: number, z: number, margin = 0) {
  const basin = MUD_BATH.basin;
  return Math.hypot((x - basin.x) / (basin.rx + margin), (z - basin.z) / (basin.rz + margin));
}

export const FISH_PER_MUD = 5;
export const GOBLIN_MUD_REWARD_AT = 101;
export const GOOSE_CORP_SHIRT = 'goose-corp-shirt';

export const VILLAGE_GOOSE = {
  id: 'goblin-village-goose',
  x: 24.3,
  z: -24.05,
  entry: { x: 23.8, y: -23.35 },
} as const;

export const VILLAGE_POSTERS = {
  id: 'goblin-village-goose-posters',
  x: 22.55,
  z: -26.9,
  entry: { x: 22.05, y: -26.5 },
} as const;
