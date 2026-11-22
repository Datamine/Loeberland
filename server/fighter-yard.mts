import { FIGHTER_YARD, inFighterYard } from '../src/fighter-yard-layout.ts';
import { equipmentOwned } from '../src/item-stats.ts';
import type { ServerPlayer } from '../src/types/server.ts';

export function hasFighterYardPass(p: Pick<ServerPlayer, 'inventory'> | undefined) {
  return !!p && equipmentOwned(p.inventory.economy.state, FIGHTER_YARD.pass);
}

export function fighterYardMayEnter(p: Pick<ServerPlayer, 'inventory'>, x: number, z: number) {
  return !inFighterYard(x, z) || hasFighterYardPass(p);
}
