import { contentText } from './content-runtime.ts';
import { isSafeInteger, isRecord } from './types/json.ts';
import type { Economy } from './types/controllers.ts';
import type { EconomyState } from './types/content.ts';

import { MERCHANTS } from './config/npcs.ts';
import { GAMEPLAY } from './config/gameplay.ts';
import { hatById } from './hat-catalog.ts';
import { ITEM_STATS, EQUIPMENT_IDS, baseEquipmentId, equipmentOwned } from './item-stats.ts';
import { COIN_REWARD_TRADES, TRADE_PRICES } from './config/economy.ts';
import { FISH_PER_MUD } from './goblin-space-layout.ts';
import { LEATHER_JACKET } from './config/leather-jacket.ts';
import { TOMMY } from './config/tommy.ts';
export { MERCHANTS };
export { TRADE_PRICES };
export function createEconomy(
  savedInput: unknown = {},
  onChange: (value: EconomyState) => void = () => {},
  equippedTorso: () => string | undefined = () => undefined,
): Economy {
  const saved = isRecord(savedInput) ? savedInput : {};

  const integer = (v: unknown, fallback: number) => (isSafeInteger(v) && v >= 0 ? v : fallback);
  const state: EconomyState = {
    coins: integer(saved.coins, GAMEPLAY.startingCoins),
    equity: integer(saved.equity, 0),
    incubatorEquityBought: saved.incubatorEquityBought === true,
    grain: integer(saved.grain, 0),
    bouquets: integer(saved.bouquets, 0),
    fuelCans: integer(saved.fuelCans, 0),
    fish: integer(saved.fish, 0),
    mud: integer(saved.mud, 0),
    sand: integer(saved.sand, 0),
    sandDelivered: integer(saved.sandDelivered, 0),
    spoonDigs: integer(saved.spoonDigs, 0) % TOMMY.digsPerBonus,
    saltLetters: Math.min(1, integer(saved.saltLetters, 0)),
    saltLettersDelivered: integer(saved.saltLettersDelivered, 0),
    ownedHats: Array.isArray(saved.ownedHats)
      ? [
          ...new Set(
            saved.ownedHats.filter(
              (id: unknown): id is string => typeof id === 'string' && !!hatById(id),
            ),
          ),
        ]
      : [],
    iphoneOwned: saved.iphoneOwned === true,
    iphoneEquipped: saved.iphoneOwned === true && saved.iphoneEquipped === true,
    robotaxiOwned: saved.robotaxiOwned === true,
    softwareCopies: integer(saved.softwareCopies, 0),
    incomeQuarters:
      Number.isInteger(saved.incomeQuarters) &&
      saved.incomeQuarters >= 0 &&
      saved.incomeQuarters < 4
        ? saved.incomeQuarters
        : 0,
    incomeExtraTwentieths: integer(saved.incomeExtraTwentieths, 0) % 5,
    ownedEquipment: [],
  };
  state.ownedEquipment = Array.isArray(saved.ownedEquipment)
    ? [
        ...new Set(
          saved.ownedEquipment.filter(
            (id: unknown): id is string => typeof id === 'string' && EQUIPMENT_IDS.includes(id),
          ),
        ),
      ]
    : [];
  function buyEquipment(id: string) {
    const item = ITEM_STATS[id];
    if (!EQUIPMENT_IDS.includes(id) || !item?.price)
      return {
        ok: false,
        message: contentText('world-message.src.economy.that-item-is-not-for-sale'),
      };
    if (equipmentOwned(state, baseEquipmentId(id)))
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-already-own-this-item'),
      };
    if (state.coins < item.price)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-need-coins', {
          price: String(item.price),
        }),
      };
    state.coins -= item.price;
    state.ownedEquipment.push(id);
    onChange({ ...state });
    return {
      ok: true,
      message: contentText('world-message.src.economy.you-buy-a-equip-it-in-character-settings', {
        value1: String(item.name.toLowerCase()),
      }),
    };
  }
  function income(amount: number) {
    const phone = state.iphoneEquipped ? 25 : 0;
    const jacket =
      equippedTorso() === LEATHER_JACKET.item && state.ownedEquipment.includes(LEATHER_JACKET.item)
        ? LEATHER_JACKET.bonusPercent
        : 0;
    // Both rates, including their product, are exact in twentieths of a coin.
    const rate = ((100 + phone) * (100 + jacket) - 10_000) / 500;
    const pending = state.incomeQuarters * 5 + state.incomeExtraTwentieths;
    const twentieths = (amount % 20) * rate + pending;
    const bonus = Math.floor(amount / 20) * rate + Math.floor(twentieths / 20);
    return { earned: amount + bonus, bonus, remainder: twentieths % 20 };
  }
  function carryIncome(remainder: number) {
    // Keep the legacy quarter-coin carry and store the extra twentieths alongside it.
    state.incomeQuarters = Math.floor(remainder / 5);
    state.incomeExtraTwentieths = remainder % 5;
  }
  function trade(kind: string, quantity = 1) {
    if (kind === 'sales-software-sale' && !state.softwareCopies)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-have-no-sales-software-to-sell'),
      };
    if (kind === 'salt-letter-collect' && state.saltLetters)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-already-carry-a-sealed-conservation-letter-deliver-it-to-t',
        ),
      };
    if (kind === 'salt-letter-deliver' && !state.saltLetters)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-have-no-conservation-letter-to-deliver',
        ),
      };
    if (kind === 'sand-sale' && !state.sand)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-do-not-have-any-sand-to-sell'),
      };
    if (kind === 'fish-sale' && !state.fish)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-do-not-have-a-live-fish'),
      };
    if (kind === 'mud-for-fish') {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || state.mud < quantity)
        return { ok: false, message: contentText('world-message.goblin-space.need-mud') };
      if (!Number.isSafeInteger(state.fish + quantity * FISH_PER_MUD))
        return { ok: false, message: contentText('world-message.goblin-space.fish-full') };
    }
    type Counter = {
      [K in keyof EconomyState]: EconomyState[K] extends number ? K : never;
    }[keyof EconomyState];
    const usesSpoon = kind === 'collect-sand' && state.ownedEquipment.includes(TOMMY.spoon);
    const bonusSand = usesSpoon && state.spoonDigs === TOMMY.digsPerBonus - 1;
    const stock: Record<string, Partial<Record<Counter, number>>> = {
      ...COIN_REWARD_TRADES,
      'sales-software-buy': { coins: -TRADE_PRICES.salesSoftware, softwareCopies: 1 },
      'salt-letter-collect': { saltLetters: 1 },
      'collect-sand': {
        sand: bonusSand ? 2 : 1,
        spoonDigs: usesSpoon ? (bonusSand ? -state.spoonDigs : 1) : 0,
      },
      'catch-fish': { fish: 1 },
      'collect-mud': { mud: 1 },
      'mud-for-fish': { mud: -quantity, fish: quantity * FISH_PER_MUD },
      'sandwich-pickup': { coins: -ITEM_STATS.sandwich.pickupPrice },
      'sandwich-in-n-out': { coins: -ITEM_STATS.sandwich.inNOutPrice },
      'sandwich-delivery': { coins: -ITEM_STATS.sandwich.deliveryPrice },
      beer: { coins: -1 },
      'motorcycle-rental': { coins: -5 },
      coffee: { coins: -TRADE_PRICES.coffee },
      'busker-tip': { coins: -1 },
      equity: { coins: -TRADE_PRICES.equity, equity: 1 },
      'incubator-equity': { coins: -TRADE_PRICES.incubatorEquity, fish: 1 },
      grain: { coins: -TRADE_PRICES.grain, grain: 1 },
      feed: { grain: -1 },
      rocket: { coins: -1 },
      skis: { coins: -1 },
      tax: { coins: -state.coins },
      extortion: { coins: -state.coins },
      'fuel-can': { coins: -state.coins, fuelCans: 1 },
      'free-fuel-can': { fuelCans: 1 },
      'use-fuel-can': { fuelCans: -1 },
    };
    if (!Object.hasOwn(stock, kind))
      return {
        ok: false,
        message: contentText('world-message.src.economy.that-trade-is-unavailable'),
      };
    const changes = { ...stock[kind] };
    const award = (changes.coins || 0) > 0 ? income(changes.coins!) : null;
    if (award) changes.coins = award.earned;
    if (
      (Object.entries(changes) as [Counter, number][]).some(
        ([key, delta]) => !Number.isSafeInteger(state[key] + delta) || state[key] + delta < 0,
      )
    )
      return {
        ok: false,
        message:
          kind === 'secondary'
            ? contentText('world-message.src.economy.you-do-not-have-any-startup-equity-to-sell')
            : kind === 'feed'
              ? contentText(
                  'world-message.src.economy.you-need-grain-visit-the-grain-merchant-beside-golden-gate-par',
                )
              : kind === 'use-fuel-can'
                ? contentText(
                    'world-message.src.economy.you-need-a-fuel-can-pick-one-up-at-a-gas-station',
                  )
                : contentText('world-message.src.economy.you-do-not-have-enough-coins'),
      };
    for (const [key, delta] of Object.entries(changes) as [Counter, number][]) state[key] += delta;
    if (kind === 'incubator-equity') state.incubatorEquityBought = true;
    if (award) carryIncome(award.remainder);
    onChange({ ...state });
    if (bonusSand) return { ok: true, message: 'Bonus sand! Your spoon helps you dig faster.' };
    return award ? { ok: true, earned: award.earned, bonus: award.bonus } : { ok: true };
  }
  function buyHat(id: string) {
    const h = hatById(id);
    if (!h)
      return {
        ok: false,
        message: contentText('world-message.src.economy.that-hat-is-not-in-the-catalog'),
      };
    if (h.dropOnly)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.that-hat-is-found-on-adventures-not-sold-in-the-shop',
        ),
      };
    if (state.ownedHats.includes(id))
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-already-own-this-hat-wear-it-from-the-character-menu',
        ),
      };
    if (state.coins < h.price)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-need-coins-for-the-your-coins-have-not-been-spent',
          { value1: String(h.price.toLocaleString('en-US')), name: String(h.name) },
        ),
      };
    state.coins -= h.price;
    state.ownedHats = [...state.ownedHats, id];
    onChange({ ...state, ownedHats: [...state.ownedHats] });
    return { ok: true };
  }
  function canCredit(amount: number) {
    return (
      isSafeInteger(amount) &&
      amount >= 0 &&
      Number.isSafeInteger(state.coins + income(amount).earned)
    );
  }
  function credit(amount: unknown, principal = 0) {
    if (!isSafeInteger(amount) || amount < 0 || !isSafeInteger(principal) || principal < 0)
      return { ok: false };
    const award = income(amount);
    const total = award.earned + principal;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(state.coins + total))
      return { ok: false };
    state.coins += total;
    carryIncome(award.remainder);
    onChange({ ...state });
    return { ok: true, earned: total, bonus: award.bonus };
  }
  function buyPhone() {
    if (state.iphoneOwned)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-already-own-an-iphone-equip-it-in-character-settings',
        ),
      };
    if (state.coins < TRADE_PRICES.iphone)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-need-coins-to-buy-an-iphone', {
          iphone: String(TRADE_PRICES.iphone),
        }),
      };
    state.coins -= TRADE_PRICES.iphone;
    state.iphoneOwned = true;
    state.iphoneEquipped = true;
    onChange({ ...state });
    return { ok: true };
  }
  function equipPhone(on: boolean) {
    if (on && !state.iphoneOwned)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-do-not-own-an-iphone'),
      };
    state.iphoneEquipped = !!on && state.iphoneOwned;
    onChange({ ...state });
    return { ok: true };
  }
  function losePhone() {
    if (!state.iphoneOwned) return { ok: false };
    state.iphoneOwned = false;
    state.iphoneEquipped = false;
    onChange({ ...state });
    return { ok: true };
  }
  function buyRobotaxi() {
    if (state.robotaxiOwned)
      return {
        ok: false,
        message: contentText(
          'world-message.src.economy.you-already-own-a-robotaxi-it-is-out-earning-fares',
        ),
      };
    if (state.coins < TRADE_PRICES.robotaxi)
      return {
        ok: false,
        message: contentText('world-message.src.economy.you-need-coins-to-buy-a-robotaxi', {
          robotaxi: String(TRADE_PRICES.robotaxi),
        }),
      };
    state.coins -= TRADE_PRICES.robotaxi;
    state.robotaxiOwned = true;
    onChange({ ...state });
    return { ok: true };
  }
  return {
    state,
    trade,
    canCredit,
    credit,
    buyHat,
    buyEquipment,
    buyPhone,
    equipPhone,
    losePhone,
    buyRobotaxi,
  };
}
