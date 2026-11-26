import { COLLECTION_ITEMS } from '../src/config/collection.ts';
import { hydratePlayerProfile, serializePlayerProfile } from '../src/player-document.ts';
import type { PlayerDocument } from '../src/types/content.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { GameplayStore, StorageEntry } from '../src/types/storage.ts';
import { isRecord } from '../src/types/json.ts';
import { createInventoryAccount } from './inventory.mts';

function questsCompleted({ quests, inventory }: PlayerDocument) {
  const { monkey, theyLive, stochasticParrot, burningMan, expeditions, illuminatus, lightsaber } =
    quests;
  return (
    monkey.stage === 'completed' &&
    theyLive.completed === true &&
    (stochasticParrot.stage === 'proof' || stochasticParrot.stage === 'sold') &&
    burningMan.stage === 'completed' &&
    expeditions.raptor === 'completed' &&
    expeditions.krakenReward === true &&
    illuminatus.bomberOwned === true &&
    lightsaber.stage === 'completed' &&
    inventory.economy.saltLettersDelivered > 0
  );
}

export function recordGameCompletion(
  profile: PlayerProfile,
  now: () => number,
  recordedOnVerification = false,
) {
  const state = profile.playerState;
  if (
    state.progress.gameCompletion ||
    state.inventory.collection.length < COLLECTION_ITEMS.length ||
    !questsCompleted(state)
  )
    return false;
  const collected = new Set(state.inventory.collection);
  if (!COLLECTION_ITEMS.every(({ id }) => collected.has(id))) return false;
  state.progress.gameCompletion = { at: now(), recordedOnVerification };
  profile.stateRevision++;
  return true;
}

/** Verify existing saves before the simulation starts, so these profile
 * writes cannot race with login or gameplay. Their original finish times
 * were never stored. */
export async function backfillGameCompletions(
  store: Pick<GameplayStore, 'get' | 'batch'>,
  owners: readonly string[],
  now: () => number,
) {
  const verifiedAt = now();
  for (let i = 0; i < owners.length; i += 64) {
    const updates = await Promise.all(
      owners.slice(i, i + 64).map(async (owner): Promise<StorageEntry | null> => {
        const key = 'player:' + owner;
        const saved = await store.get(key);
        if (!isRecord(saved)) return null;
        const profile = hydratePlayerProfile({ ...saved });
        if (profile.playerState.progress.gameCompletion || !questsCompleted(profile.playerState))
          return null;
        createInventoryAccount(profile);
        return recordGameCompletion(profile, () => verifiedAt, true)
          ? [key, serializePlayerProfile(profile)]
          : null;
      }),
    );
    const completed = updates.filter((record) => record !== null);
    if (completed.length) await store.batch(completed);
  }
}
