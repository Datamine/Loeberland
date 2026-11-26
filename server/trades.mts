import { randomUUID } from 'node:crypto';
import { contentText } from '../src/content-runtime.ts';
import { sameMapInstance } from '../src/map-instances.ts';
import { isRecord, isSafeInteger } from '../src/types/json.ts';
import type { ServerPlayer, SimulationServices } from '../src/types/server.ts';
import type { TradeLine, TradeView } from '../src/types/trade.ts';
import { playersWithinReach } from './player-proximity.mts';
import {
  describeTradeItem,
  swapHoldings,
  tradeStock,
  validTradeLine,
  type TradeHoldings,
} from './trade-inventory.mts';

const timeout = 120_000;
interface Trade {
  id: string;
  a: ServerPlayer;
  b: ServerPlayer;
  phase: TradeView['phase'];
  revision: number;
  expires: number;
  offers: [TradeLine[], TradeLine[]];
  growthPhases: [string | undefined, string | undefined];
  confirmed: [boolean, boolean];
}
export const TRADE_ACTIONS = new Set(['tradeJoin', 'tradeOffer', 'tradeConfirm', 'tradeCancel']);
const text = (key: string) => contentText('world-message.player-trade.' + key);
const no = (key: string) => ({ ok: false, message: text(key) });
const disabledMessage = (p: ServerPlayer) =>
  contentText('world-message.player-requests.disabled', { name: p.name });
export function createPlayerTrades({
  geometry,
  players,
  send,
  now,
  commit,
}: Pick<SimulationServices, 'geometry' | 'players' | 'send' | 'now'> & {
  commit: (
    a: ServerPlayer,
    b: ServerPlayer,
    holdings: readonly [TradeHoldings, TradeHoldings],
  ) => Promise<void>;
}) {
  const sessions = new Map<number, Trade>();
  const holdings = (p: ServerPlayer): TradeHoldings => ({
    inventory: p.inventory.snapshot(),
    growth: p.profile.growth ?? null,
    grapplingHook: !!p.profile.grapplingHook,
  });
  const eligible = (p: ServerPlayer) =>
    players.get(p.id) === p &&
    p.transport.open &&
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.personalJailed &&
    !p.detainAt &&
    !p.attack &&
    !p.pvpTarget &&
    !p.personalBattle &&
    !p.airship &&
    !p.tabletTeleport &&
    !p.bomberActive &&
    !p.grappling &&
    ['walk', 'sit', 'bench'].includes(p.mode);
  const available = (a: ServerPlayer, b: ServerPlayer) =>
    eligible(a) && eligible(b) && playersWithinReach(geometry, a, b);
  function publish(t: Trade) {
    const owners = [t.a, t.b] as const;
    const stock = owners.map(holdings);
    const sides = owners.map((p, i) => ({
      name: p.name,
      offer: t.offers[i].map((line) => describeTradeItem(line, stock[i])),
      confirmed: t.confirmed[i],
    }));
    for (const [i, p] of owners.entries()) {
      const trade: TradeView = {
        id: t.id,
        phase: t.phase,
        revision: t.revision,
        requester: i === 0,
        you: sides[i],
        partner: sides[1 - i],
        available: tradeStock(stock[i]),
      };
      send(p, { type: 'tradeView', trade });
    }
  }
  function close(t: Trade, message: string, completed = false) {
    for (const p of [t.a, t.b]) {
      if (sessions.get(p.id) === t) sessions.delete(p.id);
      if (players.get(p.id) === p)
        send(p, {
          type: 'tradeClosed',
          id: t.id,
          message,
          completed,
          ...(completed && {
            inventory: p.inventory.snapshot(),
            appearance: p.appearance,
            grapplingHook: !!p.profile.grapplingHook,
          }),
        });
    }
  }
  function expire() {
    for (const [id, trade] of sessions)
      if (id === trade.a.id && (trade.expires <= now() || !available(trade.a, trade.b)))
        close(trade, text('expired'));
  }
  function requestError(p: ServerPlayer, target: ServerPlayer | undefined) {
    if (
      !target ||
      target.owner === p.owner ||
      !eligible(p) ||
      !eligible(target) ||
      !sameMapInstance(p, target)
    )
      return text('nearby');
    if (target.profile.tradeDuelEnabled === false) return disabledMessage(target);
    if (sessions.has(p.id) || sessions.has(target.id)) return text('busy');
    return '';
  }
  function request(p: ServerPlayer, target: ServerPlayer) {
    expire();
    const error = requestError(p, target);
    if (error) return { ok: false, message: error };
    if (!playersWithinReach(geometry, p, target)) return no('nearby');
    const t: Trade = {
      id: randomUUID(),
      a: p,
      b: target,
      phase: 'invited',
      revision: 0,
      expires: now() + timeout,
      offers: [[], []],
      growthPhases: [undefined, undefined],
      confirmed: [false, false],
    };
    sessions.set(p.id, t);
    sessions.set(target.id, t);
    publish(t);
    return { ok: true };
  }
  function readOffer(raw: unknown, stock: TradeHoldings) {
    if (!Array.isArray(raw) || raw.length > 96) return null;
    const lines = new Map<string, TradeLine>();
    for (const item of raw) {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        !isSafeInteger(item.quantity) ||
        lines.has(item.id)
      )
        return null;
      const line = { id: item.id, quantity: item.quantity };
      if (!validTradeLine(stock, line)) return null;
      lines.set(item.id, line);
    }
    return [...lines.values()];
  }
  async function command(p: ServerPlayer, action: string, args: Record<string, unknown>) {
    expire();
    const t = sessions.get(p.id);
    if (!t || t.id !== args.trade) return no('expired');
    if (action === 'tradeCancel') {
      close(t, text('cancelled'));
      return { ok: true };
    }
    if (args.revision !== t.revision) return no('changed');
    if (action === 'tradeJoin' && t.phase === 'invited' && p === t.b) {
      t.phase = 'open';
      t.revision++;
    } else if (t.phase !== 'open') return no('waiting');
    else {
      const side = p === t.a ? 0 : 1;
      if (action === 'tradeOffer') {
        const stock = holdings(p);
        const offer = readOffer(args.items, stock);
        if (!offer) return no('invalid-items');
        t.offers[side] = offer;
        t.growthPhases[side] = stock.growth?.phase;
        t.confirmed = [false, false];
        t.revision++;
      } else if (action === 'tradeConfirm') {
        if (!t.offers.some((offer) => offer.length)) return no('empty');
        const stock = [holdings(t.a), holdings(t.b)] as const;
        let changed = false;
        for (const [i, holding] of stock.entries()) {
          if (t.growthPhases[i] === holding.growth?.phase) continue;
          if (!t.offers[i].some(({ id }) => id === 'growth-equity')) continue;
          t.offers[i] = t.offers[i].filter(({ id }) => id !== 'growth-equity');
          changed = true;
        }
        const draft = changed ? null : swapHoldings(...stock, ...t.offers);
        if (!draft) {
          t.confirmed = [false, false];
          t.revision++;
          publish(t);
          return no('no-longer-valid');
        }
        t.confirmed[side] = true;
        if (t.confirmed.every(Boolean)) {
          sessions.delete(t.a.id);
          sessions.delete(t.b.id);
          try {
            await commit(t.a, t.b, draft);
          } catch (error) {
            console.error('Trade persistence:', error);
            close(t, text('save-failed'));
            return no('save-failed');
          }
          close(t, text('complete'), true);
          return { ok: true };
        }
      } else return no('expired');
    }
    t.expires = now() + timeout;
    publish(t);
    return { ok: true };
  }
  return {
    command,
    request,
    requestError,
    tick: expire,
    declineIncoming(p: ServerPlayer) {
      const trade = sessions.get(p.id);
      if (trade?.b === p && trade.phase === 'invited') close(trade, disabledMessage(p));
    },
    remove(p: ServerPlayer) {
      const t = sessions.get(p.id);
      if (t) close(t, text('expired'));
    },
  };
}
