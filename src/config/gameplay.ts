/** Gameplay balance shared by the authoritative server and offline simulation. */
export const GAMEPLAY = Object.freeze({
  startingCoins: 25,
  maxHitpoints: 30,
  strengthXPPerSecond: 10,
  strengthLevel10XP: 12000,
  monsterHitChance: 0.9,
  monsterMinMultiplier: 0.25,
  monsterMaxMultiplier: 1.25,
  walkSpeed: 4.6,
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
export const SCIENTIST_EXPLOSIVE = { flight: 0.55, burst: 0.24 } as const;
export const ENERGY_BOLT_SECONDS = 0.22;
export const WILDERNESS_FIRST_ATTACK_SECONDS = 0.6;

export function monsterProjectileFlight(effect?: string) {
  if (effect === 'explosive') return SCIENTIST_EXPLOSIVE.flight;
  return effect === 'akimbo' || effect === 'robocop-laser' ? ENERGY_BOLT_SECONDS : 0;
}
export const MISSILE_FLIGHT_SECONDS = 0.48;
export const MISSILE_BURST_SECONDS = 0.16;
export const MISSILE_EFFECT_SECONDS = MISSILE_FLIGHT_SECONDS + MISSILE_BURST_SECONDS;
