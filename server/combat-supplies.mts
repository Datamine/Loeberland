import { contentText } from '../src/content-runtime.ts';
import { isFiniteNumber } from '../src/types/json.ts';
import type { ServerPlayer } from '../src/types/server.ts';
import { equipmentOwned } from '../src/item-stats.ts';
import { COMBAT_SUPPLY_OFFERS, isCombatSupplyPurchase } from '../src/combat-supply-shop.ts';
import { mayFireRailgun } from '../src/jurassic.ts';
import { LIGHTSABER_HITS } from '../src/config/lightsaber.ts';
export const BATTERY_SHOTS = 25;
export function railgunRestriction(p: ServerPlayer, weapon: unknown, atRaptor = false) {
  if (weapon === 'railgun' && !mayFireRailgun(p.profile.playerState.quests.expeditions, atRaptor))
    return contentText('world-message.jurassic.railgun-on-loan');
}
/** A shot spends its resource only once, after range and cooldown validation. */
export function consumeWeaponShot(p: ServerPlayer, weapon: string, atRaptor = false) {
  const restriction = railgunRestriction(p, weapon, atRaptor);
  if (restriction) return { ok: false, spent: false, message: restriction };
  if (weapon === 'lightsaber')
    return (p.inventory.meta.lightsaberCharge ?? 0) > 0
      ? { ok: true, spent: false }
      : { ok: false, spent: false, message: 'The lightsaber needs a fresh railgun battery.' };
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

/** Blade charge is spent after damage is resolved, once per landed hit. */
export function spendLightsaberHit(p: ServerPlayer, weapon: string, damage: number) {
  if (weapon !== 'lightsaber' || damage <= 0) return false;
  const charge = p.inventory.meta.lightsaberCharge ?? 0;
  if (charge <= 0) return false;
  p.inventory.meta.lightsaberCharge = charge - 1;
  p.inventory.save();
  return true;
}
export function combatSupplyAction(
  p: ServerPlayer,
  op: string,
  {
    nearArmorer,
    nearBatterySeller,
    nearChef,
  }: { nearArmorer: boolean; nearBatterySeller: boolean; nearChef: boolean },
  quantity: unknown = 1,
) {
  const meta = p.inventory.meta,
    purse = p.inventory.economy.state;
  const chargeSaber = op === 'chargeLightsaber';
  if (op === 'chargeRailgun' || chargeSaber) {
    if (chargeSaber && !equipmentOwned(purse, 'lightsaber'))
      return { ok: false, message: 'You don’t own a lightsaber.' };
    const key = chargeSaber ? 'lightsaberCharge' : 'railgunCharge';
    const capacity = chargeSaber ? LIGHTSABER_HITS : BATTERY_SHOTS;
    if (!meta.railgunBatteries)
      return {
        ok: false,
        message: contentText('world-message.server.combat-supplies.you-have-no-spare-battery'),
      };
    if ((meta[key] ?? 0) >= capacity)
      return {
        ok: false,
        message: chargeSaber
          ? 'The lightsaber is already fully charged.'
          : contentText('world-message.server.combat-supplies.the-railgun-is-already-fully-charged'),
      };
    meta.railgunBatteries--;
    meta[key] = capacity;
  } else if (isCombatSupplyPurchase(op)) {
    const battery = op === 'buyBattery';
    if (!(battery ? nearBatterySeller : nearArmorer))
      return {
        ok: false,
        message: contentText(
          battery
            ? 'world-message.server.combat-supplies.visit-the-battery-seller'
            : 'world-message.server.combat-supplies.visit-the-industrial-center-armorer',
        ),
      };
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1)
      return { ok: false, message: contentText('world-message.combat-supplies.quantity') };
    const offer = COMBAT_SUPPLY_OFFERS[op];
    const available = meta[offer.inventoryKey] ?? 0;
    if (quantity > Math.floor((1_000_000 - available) / offer.units))
      return {
        ok: false,
        message: contentText(
          battery
            ? 'world-message.server.combat-supplies.you-cannot-carry-more-batteries'
            : 'world-message.server.combat-supplies.you-cannot-carry-more-ammo',
        ),
      };
    const price = offer.price * quantity;
    if (purse.coins < price)
      return { ok: false, message: contentText('world-message.combat-supplies.cost', { price }) };
    const amount = quantity * offer.units;
    const item = amount === 1 && 'singular' in offer ? offer.singular : offer.item;
    purse.coins -= price;
    meta[offer.inventoryKey] = available + amount;
    p.inventory.save();
    return {
      ok: true,
      inventory: p.inventory.snapshot(),
      message: contentText('world-message.combat-supplies.purchased', { amount, item, price }),
    };
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
      op === 'chargeRailgun' || chargeSaber
        ? contentText('world-message.server.combat-supplies.you-fit-a-fresh-battery')
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
