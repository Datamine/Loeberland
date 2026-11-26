import type { Appearance } from './content.ts';
import type { Actor } from './world.ts';
import type { WorldPoint } from './geometry.ts';
export type MonsterAttackEffect =
  'bind' | 'explosive' | 'goblin-rock' | 'akimbo' | 'robocop-laser' | 'onoda-rifle' | 'emf-lightning';
export interface MonsterStats {
  name: string;
  level: number;
  hp: number;
  damage: number;
  reflectDamage?: number;
  interval?: number;
  respawn?: number;
  speed?: number;
  leash?: number;
  roamRadius?: number;
  roamSpeed?: number;
  recoverOnReturn?: boolean;
  height?: number;
  model?: string;
  appearance?: Appearance;
  description?: string;
  friendly?: boolean;
  quest?: boolean;
  aggression?: number;
  attackRange?: number;
  attackEffect?: MonsterAttackEffect;
  rangedAttack?: { range: number; interval: number; damage: number; effect: MonsterAttackEffect };
  pursuit?: string;
  radius?: number;
  walkStride?: number;
  territoryHalfWidth?: number;
  enrageAt?: number;
  enrageDamageBonus?: number;
  enrageInterval?: number;
}
export type DropRule = { oneIn: number; amount?: number } & (
  { item: string; choose?: never } | { choose: readonly string[]; item?: never }
);
/** Preserve required fields for known monsters and optional fields for dynamic lookups. */
export function defineMonsterStats<T extends Record<string, MonsterStats>>(
  definitions: T,
): Readonly<{ [K in keyof T]: T[K] & Partial<MonsterStats> }> &
  Readonly<Record<string, MonsterStats>> {
  return Object.freeze(definitions);
}
export interface WildernessSpawn extends WorldPoint {
  id: string;
  combatKind: string;
  level?: number;
}
export interface WildernessPerson extends WorldPoint {
  id: string | number;
  appearance?: Pick<Appearance, 'back'>;
  owner?: string | null;
  y?: number;
  base?: number;
  angle?: number;
  gesture?: string;
  gestureUntil?: number;
  weapon?: string;
  level?: number;
  inebriation?: number;
  tinfoil?: boolean;
  rerollMiss?: boolean;
  attack?: string | null;
}
export interface WildernessActor extends Actor {
  wilderness: true;
  combatKind: string;
  hp: number;
  max: number;
  level: number;
  height: number;
  base: number;
  home: WorldPoint;
  angle: number;
  phase: number;
  motion: number;
  respawn: number;
  enemy: string | number | null;
  path: WorldPoint[];
  repath: number;
  attackAt: number;
  attackAnimation?: number;
  rangedAnimation?: boolean;
  rangedAttackAt?: number;
  affection: number;
  chaseUntil: number;
  enemyPosition?: WorldPoint;
  returning: boolean;
  lastCombatAt?: number;
  description: string;
}
export interface WildernessDrop extends WorldPoint {
  base: number;
  lootKind: string;
  amount: number;
  label: string;
  description: string;
  itemId?: string;
  hatId?: string;
}
