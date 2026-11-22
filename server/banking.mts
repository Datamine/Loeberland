import { contentText } from '../src/content-runtime.ts';
import '../src/types/assert.ts';
import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';
import { createBankAccount } from '../src/banking.ts';

export function bankSnapshotFor(p: { profile: { bank: unknown } }, now = Date.now) {
  const account = createBankAccount(p.profile.bank, now, (saved) => (p.profile.bank = saved));
  account.settle();
  return account.snapshot();
}
export function bankAction(
  p: ServerPlayer,
  action: string,
  args: { amount?: unknown },
  { geometry, now, dirty }: Pick<SimulationServices, 'geometry' | 'now' | 'dirty'>,
) {
  const teller = geometry.merchants?.find((n) => n.id === 'green-banker'),
    alive = p.hp > 0 && !p.respawnAllowed && !p.personalJailed;
  if (
    action !== 'bankStatus' &&
    action !== 'bankCoffeeDrink' &&
    (!alive ||
      !teller ||
      (p.instance?.kind || 'world') !== 'world' ||
      p.bomberActive ||
      Math.hypot(p.x - teller.x, p.z - teller.z) > 2.6 ||
      Math.abs(p.y - Number(teller.base)) > 2.5)
  )
    return {
      ok: false,
      message: contentText(
        'world-message.server.banking.visit-the-friendly-banker-at-green-bank-first',
      ),
    };
  const account = createBankAccount(p.profile.bank, now, (saved) => {
    p.profile.bank = saved;
    dirty(p);
  });
  if (action === 'bankStatus') {
    account.settle();
    return { ok: true, bank: account.snapshot() };
  }
  if (action === 'bankCoffee') {
    if (p.inventory.meta.coffee)
      return {
        ok: false,
        message: contentText(
          'world-message.server.banking.you-already-have-a-fresh-coffee-enjoy-that-one-first',
        ),
        inventory: p.inventory.snapshot(),
      };
    p.inventory.meta.coffee = 1;
    p.inventory.save();
    dirty(p);
    return {
      ok: true,
      inventory: p.inventory.snapshot(),
      message: contentText(
        'world-message.server.banking.of-course-one-fresh-coffee-on-the-house-you-can-drink-it-from',
      ),
    };
  }
  if (action === 'bankCoffeeDrink') {
    if (!alive || p.bomberActive)
      return {
        ok: false,
        message: contentText(
          'world-message.server.banking.find-a-moment-to-enjoy-your-coffee-safely',
        ),
      };
    if (!p.inventory.meta.coffee)
      return {
        ok: false,
        message: contentText('world-message.server.banking.you-have-no-coffee-to-drink'),
      };
    p.inventory.meta.coffee = 0;
    const healed = Math.min(1, Math.max(0, p.max - p.hp));
    p.hp += healed;
    p.damagePending = true;
    p.inventory.save();
    p.gesture = 'drink';
    p.gestureUntil = now() + 1600;
    dirty(p);
    return {
      ok: true,
      inventory: p.inventory.snapshot(),
      healed,
      hp: p.hp,
      message: contentText(
        'world-message.server.banking.you-recover-hp-you-sip-your-complimentary-coffee-warm-excellen',
        { healed: String(healed) },
      ),
    };
  }
  const amount =
    args.amount === 'all'
      ? action === 'bankDeposit'
        ? p.inventory.economy.state.coins
        : (account.settle(), account.snapshot().withdrawable)
      : args.amount;
  const result = account.transfer(
    action === 'bankDeposit' ? 'deposit' : 'withdraw',
    amount,
    p.inventory.economy.state,
  );
  if (result.ok) {
    p.inventory.save();
    dirty(p);
  }
  return { ...result, bank: account.snapshot(), inventory: p.inventory.snapshot() };
}
