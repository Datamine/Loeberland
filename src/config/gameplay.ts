import { GOBLIN_ROCK } from '../goblin-incubator-cave.ts';

/** Gameplay balance shared by the authoritative server and offline simulation. */
export const STARTING_POSITION = Object.freeze({ x: 47, z: 47 });
export const GAMEPLAY = Object.freeze({
  startingCoins: 100,
  startingDowntownTeleports: 5,
  maxHitpoints: 30,
  strengthXPPerSecond: 10,
  strengthLevel10XP: 12000,
  monsterHitChance: 0.9,
  monsterMinMultiplier: 0.25,
  monsterMaxMultiplier: 1.25,
  walkSpeed: 4.6,
  bicycleSpeed: 8.2,
  rollSpeed: 4.6 * 1.18,
  interactionRange: 2.6,
  fishingSeconds: 3.2,
  sandCollectSeconds: 1,
  playerHz: 10,
  simulationHz: 20,
  worldHz: 5,
  maxNearbyPlayers: 32,
  maxNearbyNPCs: 32,
  maxNearbyLoot: 64,
  viewRadius: 38,
});
export const SCIENTIST_EXPLOSIVE = { flight: 0.55, burst: 0.24, width: 3 } as const;
export const NPC_HELP_DURATION_MS = 4500;
export const BIND_DURATION_MS = 10_000;
export const ENERGY_BOLT_SECONDS = 0.22;
export const ONODA_RIFLE_SECONDS = 0.12;
export const WILDERNESS_FIRST_ATTACK_SECONDS = 0.6;

export function monsterProjectileFlight(effect?: string) {
  if (effect === 'explosive') return SCIENTIST_EXPLOSIVE.flight;
  if (effect === 'goblin-rock') return GOBLIN_ROCK.flight;
  if (effect === 'onoda-rifle') return ONODA_RIFLE_SECONDS;
  return effect === 'akimbo' || effect === 'robocop-laser' || effect === 'emf-lightning'
    ? ENERGY_BOLT_SECONDS
    : 0;
}
export const MISSILE_FLIGHT_SECONDS = 0.48;
export const MISSILE_BURST_SECONDS = 0.16;
export const MISSILE_EFFECT_SECONDS = MISSILE_FLIGHT_SECONDS + MISSILE_BURST_SECONDS;
