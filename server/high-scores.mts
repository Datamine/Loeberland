import { hydratePlayerProfile } from '../src/player-document.ts';
import { projectedBankBalance } from '../src/banking.ts';
import { strengthStatus } from '../src/strength.ts';
import { isRecord } from '../src/types/json.ts';
import type { GameplayStore, NameReservation } from '../src/types/storage.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { HighScores } from '../src/high-scores.ts';

export function createHighScores(
  store: Pick<GameplayStore, 'get'>,
  names: Map<string, NameReservation>,
  profiles: Map<string, PlayerProfile>,
  now: () => number,
) {
  let updated = -Infinity;
  let generation = 0;
  let cached: HighScores | undefined;
  let loading: ReturnType<typeof load> | undefined;
  async function load(time: number): Promise<HighScores> {
    const registered = [...names.values()];
    const scores = [];
    for (let i = 0; i < registered.length; i += 64) {
      const rows = await Promise.all(
        registered.slice(i, i + 64).map(async ({ owner, name }) => {
          let profile = profiles.get(owner);
          if (!profile) {
            const saved = await store.get('player:' + owner);
            if (!isRecord(saved)) return null;
            profile = hydratePlayerProfile(saved);
          }
          const { xp, level } = strengthStatus(profile.playerState.skills.strength.xp);
          const coins =
            profile.playerState.inventory.economy.coins +
            projectedBankBalance(profile.playerState.finance.bank, time);
          return {
            name,
            coins,
            xp,
            level,
            completion: profile.playerState.progress.gameCompletion,
          };
        }),
      );
      scores.push(...rows.filter((row) => row !== null));
    }
    const tie = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      coins: [...scores]
        .sort((a, b) => b.coins - a.coins || tie(a, b))
        .slice(0, 20)
        .map(({ name, coins }) => ({ name, coins: Math.floor(coins) })),
      strength: scores
        .sort((a, b) => b.xp - a.xp || tie(a, b))
        .slice(0, 20)
        .map(({ name, level, xp }) => ({ name, level, xp })),
      completion: scores
        .flatMap(({ name, completion }) => (completion ? [{ name, ...completion }] : []))
        .sort((a, b) => a.at - b.at || tie(a, b)),
    };
  }
  async function highScores() {
    const time = now();
    if (cached && time - updated < 10_000) return cached;
    const requestedGeneration = generation;
    loading ??= load(time)
      .then((data) => {
        if (requestedGeneration === generation) {
          updated = time;
          cached = data;
        }
        return data;
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  }
  return Object.assign(highScores, {
    invalidate() {
      generation++;
      cached = undefined;
    },
  });
}
