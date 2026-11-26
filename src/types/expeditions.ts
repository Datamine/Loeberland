import type { Actor } from './world.ts';
import type { WorldPoint } from './geometry.ts';
import type { ExpeditionProgress } from './content.ts';
import type { Economy, Health } from './controllers.ts';
export interface KrakenAnimation {
  strikes: number;
  emergedAt?: number;
  enragedAt?: number;
  strikeAt?: number;
  lastStrike?: { at: number; enraged: boolean };
  hitAt?: number;
  defeatedAt?: number;
}
export interface ExpeditionLoot extends WorldPoint {
  id: string;
  kind: string;
  lootKind: string;
  label: string;
  description: string;
  amount: number;
  expires: number;
  wallExpiresAt?: number;
  network?: boolean;
  base?: number;
  itemId?: string;
  hatId?: string;
  mine?: boolean;
  ship?: boolean;
  deck?: WorldPoint;
}
export interface ExpeditionBeam {
  weapon?: string;
  from: WorldPoint & { y: number };
  to: WorldPoint & { y: number };
  ttl: number;
  muzzles?: readonly (readonly [number, number, number])[];
  exhaust?: readonly [number, number, number];
}
export interface ExpeditionEvent {
  type: string;
  message?: string | null;
  target?: Actor;
  damage?: number;
  hp?: number;
  max?: number;
  from?: ExpeditionBeam['from'];
  to?: ExpeditionBeam['to'];
}
export interface ExpeditionPrey extends WorldPoint {
  base?: number;
  eligible?: boolean;
  isPlayer?: boolean;
  label?: string;
  expeditionDead?: boolean;
  recoverAt?: number;
  hold?: number;
}
export interface ExpeditionState extends ExpeditionProgress {
  armed: boolean;
  target: Actor | null;
  clock: number;
  cooldown: number;
  beams: ExpeditionBeam[];
  splats: { target: Actor; damage: number; ttl: number }[];
  loot: ExpeditionLoot[];
  victims: { npc: ExpeditionPrey; until: number }[];
  weapon?: string;
  spectreAttack?: number;
}
export interface ExpeditionOptions {
  saved?: Partial<ExpeditionProgress>;
  onSave?: (state: ExpeditionProgress) => void;
  health?: Health;
  economy?: Economy;
  food?: (amount: number) => unknown;
  receiveCrystal?: () => { ok: boolean; message?: string };
  level?: () => number;
  defense?: () => number;
  reflect?: (damage: number) => number;
  inebriation?: () => number;
  rerollMiss?: () => boolean;
  hiddenFromMonsters?: () => boolean;
  sharedWorld?: () => boolean;
  player?: () => ExpeditionPrey;
  pedestrians?: () => Actor[];
  routeTo?: (from: WorldPoint, to: WorldPoint) => WorldPoint[] | null | undefined;
  canTravel?: (from: WorldPoint, to: WorldPoint) => boolean;
  lineClear?: (from: WorldPoint, to: WorldPoint) => boolean;
  random?: () => number;
  now?: () => number;
  onEvent?: (event: ExpeditionEvent) => void;
  consumeShot?: (weapon: string) => { ok: boolean; message?: string };
}
