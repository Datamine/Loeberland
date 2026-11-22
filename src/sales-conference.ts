import { contentText } from './content-runtime.ts';
import { isFiniteNumber } from './types/json.ts';
type PitchActor = Pick<Actor, 'id'> & Partial<Actor>;
interface SalesPitch {
  npc: PitchActor;
  remaining: number;
  chance: number;
  percent?: number;
}
interface SalesDecision {
  type: string;
  npc: PitchActor;
  accepted: boolean;
  message: string | undefined;
  chance: number;
  earned: number;
}
import type { Economy, EconomyReceipt } from './types/controllers.ts';
import { configuredDialogue } from './dialogue-config.ts';
import type { Actor } from './types/world.ts';
export const SALES_THINK_SECONDS = 10;
export function softwareSalesChance(percent: unknown) {
  return 0.1 + (0.4 * Math.max(0, Math.min(100, isFiniteNumber(percent) ? percent : 0))) / 100;
}

/** A single pending pitch reserves the prospect's attention, not the player's
 * money. Only a successful decision consumes a saved software copy and pays. */
export function createSocialBusiness({
  economy,
  inebriation,
  random = Math.random,
  onEvent = () => {},
}: {
  economy: Economy;
  inebriation: ReturnType<typeof import('./inebriation.ts').createInebriation>;
  random?: () => number;
  onEvent?: (event: SalesDecision) => void;
}) {
  const state: { pitch: SalesPitch | null } = { pitch: null };
  let lastClock: number | null = null;
  function cancelPitch() {
    const pitch = state.pitch;
    if (!pitch) return false;
    state.pitch = null;
    pitch.npc.waiting = false;
    pitch.npc.thinking = false;
    return true;
  }
  function startPitch(npc: PitchActor) {
    if (state.pitch)
      return {
        ok: false,
        message: contentText(
          'world-message.src.sales-conference.one-salesman-is-already-thinking-about-your-pitch-give-him-ten',
        ),
      };
    if (!economy.state.softwareCopies)
      return {
        ok: false,
        message: contentText('world-message.src.sales-conference.you-have-no-software-to-pitch'),
      };
    const percent = inebriation.state.percent,
      chance = softwareSalesChance(percent);
    state.pitch = { npc, remaining: 10, chance, percent };
    npc.waiting = true;
    npc.thinking = true;
    return {
      ok: true,
      pending: true,
      message: contentText(
        'world-message.src.sales-conference.let-me-think-about-how-this-helps-me-sell-more-sales-software',
      ),
    };
  }
  function update(
    seconds: unknown,
    { eligible = true, insideTwitter = false, sitting = false } = {},
  ) {
    if (!eligible || !isFiniteNumber(seconds) || seconds <= 0) return null;
    inebriation.update(seconds, { gainPerSecond: insideTwitter ? 3 : 0, sitting });
    const pitch = state.pitch;
    if (!pitch) return null;
    pitch.remaining = Math.max(0, pitch.remaining - seconds);
    if (pitch.remaining > 1e-8) return null;
    state.pitch = null;
    pitch.npc.waiting = false;
    pitch.npc.thinking = false;
    const accepted = random() < pitch.chance,
      result: EconomyReceipt = accepted ? economy.trade('sales-software-sale') : { ok: false };
    const message = result.ok
      ? contentText(
          'world-message.src.sales-conference.this-will-help-me-sell-more-software-for-selling-software-he-b',
          {
            earned: String(result.earned),
            value2: String(result.bonus ? ' (including your iPhone bonus)' : ''),
          },
        )
      : accepted
        ? result.message
        : contentText(
            'world-message.src.sales-conference.let-us-circle-back-next-quarter-he-declines-you-keep-your-copy',
          );
    const event = {
      type: 'sales-decision',
      npc: pitch.npc,
      accepted: !!result.ok,
      message,
      chance: pitch.chance,
      earned: result.earned || 0,
    };
    onEvent(event);
    return event;
  }
  function advanceTo(time: unknown, options: Parameters<typeof update>[1] = {}) {
    if (!isFiniteNumber(time)) {
      lastClock = null;
      return null;
    }
    if (options.eligible === false) {
      lastClock = null;
      return null;
    }
    if (lastClock !== null && time < lastClock) return null;
    const before = lastClock;
    lastClock = time;
    return update(before === null ? 0 : (time - before) / 1000, options);
  }
  return {
    state,
    startPitch,
    cancelPitch,
    update,
    advanceTo,
    suspend() {
      lastClock = null;
    },
  };
}
export function softwareSalesDialogue(
  npc: PitchActor,
  economy: Economy,
  game: { startPitch: (npc: PitchActor) => import('./types/world.ts').ActionReceipt },
  inebriation: Parameters<typeof createSocialBusiness>[0]['inebriation'],
) {
  const id =
    npc.kind === 'software-vendor'
      ? 'software-vendor'
      : npc.thinking
        ? 'software-thinking'
        : 'software-buyer';
  return configuredDialogue(
    id,
    npc,
    { pitch: () => game.startPitch(npc) },
    { chance: Math.round(softwareSalesChance(inebriation.state.percent) * 100) },
  );
}
