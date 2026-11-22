import { GAMEPLAY } from './config/gameplay.ts';
import type { WorldPoint } from './types/geometry.ts';

export const WAYMO_RENTAL = Object.freeze({
  dispatch: { x: 87, z: 81 },
  price: 12,
  seconds: 20,
  speed: GAMEPLAY.walkSpeed * 3,
  pickupRange: 1.5,
});

export interface WaymoRentalView extends WorldPoint {
  angle: number;
  phase: 'dispatch' | 'parked' | 'riding';
  expiresAt: number;
}
