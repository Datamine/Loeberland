import { GAMEPLAY } from './config/gameplay.ts';
import type { WorldPoint } from './types/geometry.ts';

export const ATV_RENTAL = Object.freeze({
  npcId: 'industrious-goblin',
  siteId: 'rental-atv',
  npc: { x: 34.5, z: -17.7 },
  parking: { x: 37.05, z: -18.15 },
  mountRange: 1.45,
  prices: { 1: 50, 10: 500 },
});
export const ATV_SPEED = GAMEPLAY.walkSpeed * 1.5;
export const ATV_ROOF = Object.freeze({ halfWidth: 1.22, run: 2.18, rise: 1.32 });
export const ATV_RAMP_KIND = 'atv-ramp';

export function hasATVRental(expiresAt: number | undefined) {
  return (expiresAt ?? 0) > Date.now();
}

export function rampRise(z: number, center: number) {
  return ATV_ROOF.rise * Math.max(0, 1 - Math.abs(z - center) / ATV_ROOF.run);
}

export interface ATVState {
  air: { velocity: number; elapsed: number; trick?: 'roll' | 'spin'; trickAt?: number } | null;
  donut: { center: WorldPoint; start: number; elapsed: number } | null;
  ramp?: string;
  takeoffAngle: number;
}
