import { contentText } from '../src/content-runtime.ts';
import { isFiniteNumber } from '../src/types/json.ts';
import type { ServerPlayer } from '../src/types/server.ts';
import { equipmentOwned, MISSILE_PRICE } from '../src/item-stats.ts';
export const AMMO_PACK_ROUNDS = 20,
  AMMO_PACK_PRICE = 5,
  BATTERY_PRICE = 20,
  BATTERY_SHOTS = 25;
/** A shot spends its resource only once, after range and cooldown validation. */
export function consumeWeaponShot(p: ServerPlayer, weapon: string) {
  const magazine =
    weapon === 'akibo'
      ? ({
          key: 'akimboAmmo',
          empty: 'world-message.server.combat-supplies.your-akimbos-are-out-of-ammo',
        } as const)
      : weapon === 'railgun'
        ? ({
            key: 'railgunCharge',
            empty: 'world-message.server.combat-supplies.your-railgun-battery-is-empty',
          } as const)
        : weapon === 'missile-launcher'
          ? ({ key: 'missiles', empty: 'world-message.missiles.empty' } as const)
          : null;
  if (!magazine) return { ok: true, spent: false };
  const ammo = p.inventory.meta[magazine.key] ?? 0;
  if (ammo < 1) return { ok: false, spent: false, message: contentText(magazine.empty) };
  p.inventory.meta[magazine.key] = ammo - 1;
  p.inventory.save();
  return { ok: true, spent: true };
}
export function combatSupplyAction(
  p: ServerPlayer,
  op: string,
  {
    nearArmorer,
    nearBatterySeller,
    nearChef,
  }: { nearArmorer: boolean; nearBatterySeller: boolean; nearChef: boolean },
) {
  const meta = p.inventory.meta,
    purse = p.inventory.economy.state;
  if (op === 'chargeRailgun') {
    if (!meta.railgunBatteries)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-have-no-spare-battery'),
      };
    if (meta.railgunCharge >= BATTERY_SHOTS)
      return {
        ok: false,
        message: contentText(
          'world-message.server.combat-supplies.the-railgun-is-already-fully-charged',
        ),
      };
    meta.railgunBatteries--;
    meta.railgunCharge = BATTERY_SHOTS;
  } else if (op === 'buyAmmo') {
    if (!nearArmorer)
      return {
        ok: false,
        message: contentText(
          'world-message.server.combat-supplies.visit-the-industrial-center-armorer',
        ),
      };
    if (purse.coins < AMMO_PACK_PRICE)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-need-5-coins'),
      };
    if (meta.akimboAmmo > 1000000 - AMMO_PACK_ROUNDS)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-cannot-carry-more-ammo'),
      };
    purse.coins -= AMMO_PACK_PRICE;
    meta.akimboAmmo += AMMO_PACK_ROUNDS;
  } else if (op === 'buyMissile') {
    if (!nearArmorer)
      return {
        ok: false,
        message: contentText(
          'world-message.server.combat-supplies.visit-the-industrial-center-armorer',
        ),
      };
    if (purse.coins < MISSILE_PRICE)
      return {
        ok: false,
        message: contentText('world-message.missiles.cost', { price: MISSILE_PRICE }),
      };
    if ((meta.missiles ?? 0) >= 1_000_000)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-cannot-carry-more-ammo'),
      };
    purse.coins -= MISSILE_PRICE;
    meta.missiles = (meta.missiles ?? 0) + 1;
    p.inventory.save();
    return {
      ok: true,
      inventory: p.inventory.snapshot(),
      message: contentText('world-message.missiles.purchased', { price: MISSILE_PRICE }),
    };
  } else if (op === 'buyBattery') {
    if (!nearBatterySeller)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.visit-the-battery-seller'),
      };
    if (purse.coins < BATTERY_PRICE)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-need-20-coins'),
      };
    if (meta.railgunBatteries >= 1000000)
      return {
        ok: false,
        message: contentText(
          'world-message.server.combat-supplies.you-cannot-carry-more-batteries',
        ),
      };
    purse.coins -= BATTERY_PRICE;
    meta.railgunBatteries++;
  } else if (op === 'buyTinfoil') {
    if (!nearChef)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.visit-the-cotogna-counter'),
      };
    if (equipmentOwned(purse, 'tinfoil-suit'))
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-already-own-a-tinfoil-suit'),
      };
    if (purse.coins < 20)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-need-20-coins'),
      };
    purse.coins -= 20;
    purse.ownedEquipment.push('tinfoil-suit');
  } else
    return {
      ok: false,
      message: contentText('world-message.server.combat-supplies.that-supply-is-unavailable'),
    };
  p.inventory.save();
  return {
    ok: true,
    inventory: p.inventory.snapshot(),
    message:
      op === 'chargeRailgun'
        ? contentText('world-message.server.combat-supplies.you-fit-a-fresh-battery')
        : op === 'buyAmmo'
          ? contentText('world-message.server.combat-supplies.you-buy-20-rounds')
          : op === 'buyBattery'
            ? contentText('world-message.server.combat-supplies.you-buy-a-spare-battery')
            : contentText(
                'world-message.server.combat-supplies.the-chef-folds-an-extravagant-roll-of-foil-into-a-full-suit-eq',
              ),
  };
}

/** Carry sub-tick overshoot forward; a pause never banks a burst of shots. */
export function advanceAttackDeadline(time: number, previous: unknown, interval: number) {
  return isFiniteNumber(previous) && time - previous >= -1e-8 && time - previous <= 0.1
    ? previous + interval
    : time + interval;
}
