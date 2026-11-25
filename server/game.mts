import { TRAMPOLINE } from '../src/backyard-details.ts';
import { DYNAMITE_DEPOT } from '../src/config/dynamite-depot.ts';
import { contentText } from '../src/content-runtime.ts';
import { isFiniteNumber, isRecord } from '../src/types/json.ts';
import { readClientMessage } from './client-messages.mts';
import type { CommandMessage, ClientHello } from './client-messages.mts';
import { playerChatLine, quickChatLine, PLAYER_CHAT_COOLDOWN_MS } from '../src/player-chat.ts';
import type { PlayerProfile } from '../src/types/profile.ts';
import type { BuildInfo } from '../src/types/network.ts';
import type { Appearance } from '../src/types/content.ts';
import type { ServerGeometry, PlayerTransport, ServerPlayer } from '../src/types/server.ts';
import type { GameplayStore, NameReservation, StorageEntry } from '../src/types/storage.ts';
import type { GamePolicy } from './game-policy.mts';
import type { UsernamePolicy } from './usernames.mts';
import { nearestMinimapPoint } from '../src/minimap-navigation.ts';

interface GameOptions {
  geometry: ServerGeometry;
  store: GameplayStore;
  now?: () => number;
  random?: () => number;
  maxPlayers?: number;
  googleChatAvailable?: boolean;
  oauthRequired?: boolean;
  upgradeRequiredForServerChat?: boolean;
  debugTeleportAll?: boolean;
  serverBuild?: BuildInfo;
  gamePolicy?: GamePolicy;
  allowUsername?: UsernamePolicy;
  tuning?: Partial<{ [K in keyof typeof SERVER_TUNING]: number }>;
}
import { DEATH_DURATION } from '../src/capture-animation.ts';
import { clothingSelection, ownedClothing } from '../src/clothing.ts';
import { createResidentialSearch } from './residential-search.mts';
import { createCharacterAccounts } from './character-accounts.mts';
import { googleLinkKey, googleOwnerKey } from './google-account-links.mts';
import { GAMEPLAY } from '../src/config/gameplay.ts';
import { HAIRSTYLES } from '../src/config/hairstyles.ts';
import { normalizeUsername, renameDecision, generateUsername } from './usernames.mts';
import { createSharedWorld } from './shared-world.mts';
import { MP_PROTOCOL, sanitizePrivateState } from '../src/multiplayer-protocol.ts';
import { createDetentionSite } from '../src/encounters.ts';
import { createInventoryAccount } from './inventory.mts';
import { createHighScores } from './high-scores.mts';
import { hydratePlayerProfile, serializePlayerProfile } from '../src/player-document.ts';
import { createPvpCombat } from './pvp.mts';
import { skillStatus, hitpointMaximum, playerLevel } from '../src/progression.ts';
import { guildStatusFor, guildAction } from './guild.mts';
import { createServerInstances } from './instances.mts';
import { PUBLIC_INSTANCE } from '../src/map-instances.ts';
import { bankSnapshotFor, bankAction } from './banking.mts';
import {
  equipmentOwned,
  normalizeBoots,
  ownedBoots,
  selectedWeapon,
  PLAYER_WEAPONS,
} from '../src/item-stats.ts';
import { createServerTablets } from './teleport-tablets.mts';
import { createServerFollowing } from './following.mts';
import { createServerMovement } from './movement.mts';
import { createPlayerState } from './player-state.mts';
import { createServerFinance } from './finance.mts';
import { createDuels } from './duels.mts';
import { createPlayerTrades, TRADE_ACTIONS } from './trades.mts';
import type { TradeHoldings } from './trade-inventory.mts';
import { createReplication } from './replication.mts';
import { createActionQueue } from './action-queue.mts';
import { createRoutePlanner } from './routes.mts';
import { createPerformanceMetrics } from './performance.mts';
import { SERVER_TUNING } from './tuning.mts';

const DEBUG_TELEPORT_RADIUS = 32;
const clone = <T,>(value: T) => structuredClone(value);
const parse = (
  value: string | undefined,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};
function appearance(input: unknown = {}) {
  const value = isRecord(input) ? input : {};
  const gender = value.gender === 'woman' ? 'woman' : 'man';
  const result: Appearance & {
    gender: typeof gender;
    back: string;
    neck: string;
    hat: string;
    weapon: string;
  } = {
    back: (
      ['none', 'backpack', 'new-year-rocket', 'cape'] satisfies [string, string, string, string]
    ).includes(String(value.back))
      ? String(value.back)
      : value.cape === true
        ? 'cape'
        : 'none',
    neck: value.neck === 'clock-amulet' || value.neck === 'recoil-amulet' ? value.neck : 'none',
    gender,
    cape: value.cape === true,
    boots: normalizeBoots(value.boots),
    iceTop: value.iceTop === true,
    icePants: value.icePants === true,
    weapon: PLAYER_WEAPONS.find((weapon) => weapon === value.weapon) || 'unarmed',
    sunglasses: value.sunglasses === true,
    hat: typeof value.hat === 'string' ? value.hat.slice(0, 48) : 'none',
  };
  result.hairstyle = HAIRSTYLES[result.gender].some((s) => s.id === value.hairstyle)
    ? String(value.hairstyle)
    : HAIRSTYLES[result.gender][0].id;
  for (const key of ['skin', 'shirt', 'pants', 'hair', 'shoes'] as const)
    if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]))
      result[key] = value[key];
  return Object.assign(result, clothingSelection(value));
}

/** One authoritative owner for the common world. HTTP/WebSocket and storage
 * adapters are deliberately outside the fixed-step simulation. */
export async function createGame({
  geometry,
  store,
  now = Date.now,
  random = Math.random,
  maxPlayers = 2000,
  googleChatAvailable = false,
  oauthRequired = true,
  upgradeRequiredForServerChat = true,
  debugTeleportAll = false,
  serverBuild,
  gamePolicy,
  allowUsername,
  tuning: tuningOverrides = {},
}: GameOptions) {
  const tuning = { ...SERVER_TUNING, ...tuningOverrides };
  const canDebugTeleport = (profile: PlayerProfile) =>
    debugTeleportAll || profile.debugTeleport === true;
  const accounts = createCharacterAccounts(store, now);
  const players = new Map<number, ServerPlayer>(),
    profiles = new Map<string, PlayerProfile>(),
    identities = new Map<string, ServerPlayer>(),
    names = new Map<string, string>(),
    nameOwners = new Map<string, NameReservation>(),
    authenticating = new Map<string, Promise<void>>(),
    dirtyProfiles = new Set<string>(),
    revisions = new Map<string, number>(),
    persistedRevisions = new Map<string, number>(),
    cleanupTasks = new Set<Promise<unknown>>();
  for (const row of await store.names()) {
    names.set(row.canonical, row.owner);
    nameOwners.set(row.owner, row);
  }
  const highScores = createHighScores(store, nameOwners, profiles, now);
  const saved = ((await store.get('world')) || {}) as {
    serial?: number;
    shared?: Parameters<typeof createSharedWorld>[0]['saved'];
  };
  let serial = saved.serial || 0,
    tickNumber = 0,
    flushing: Promise<unknown> | null = null,
    tradeCommit: Promise<void> | null = null,
    closing = false,
    closePromise: Promise<void> | null = null;
  const actionQueue = createActionQueue({
      sliceMs: tuning.actionSliceMs,
      maxBatch: tuning.actionsPerTurn,
    }),
    enqueueMutation = actionQueue.enqueue;
  const metrics = {
    connected: 0,
    frames: 0,
    bytes: 0,
    corrections: 0,
    rejected: 0,
    slowClients: 0,
    coalescedMoves: 0,
    tickMs: 0,
    broadcastMs: 0,
    ...createPerformanceMetrics(),
  };
  const routes = createRoutePlanner({
    pathTo: (...args: Parameters<ServerGeometry['pathTo']>) => geometry.pathTo(...args),
    canTravel: geometry.navigation
      ? (a, b, ignore) => geometry.canTravel!(a.x, a.y, b.x, b.y, ignore)
      : null,
    free: geometry.navigation ? (p) => geometry.landClearAt(p.x, p.y) : null,
    revision: () => geometry.navigationRevision || 0,
    maxEntries: tuning.routeCacheEntries,
    maxPoints: tuning.routeCachePoints,
    ttlMs: tuning.routeCacheTtlMs,
    coreTtlMs: tuning.routeCoreTtlMs,
    replansPerTick: tuning.followReplansPerTick,
    replanMs: tuning.followReplanMs,
  });
  const send = (p: ServerPlayer, message: object | string | ArrayBuffer) => {
    if (!p.transport.open) return;
    if (
      message &&
      isRecord(message) &&
      !(message instanceof ArrayBuffer) &&
      p.profile?.playerState &&
      (message.type === 'welcome' || p.sentStateRevision !== p.profile.stateRevision)
    ) {
      message = { ...message, playerState: p.profile.playerState };
      p.sentStateRevision = p.profile.stateRevision;
    }
    const data =
      typeof message === 'string' || message instanceof ArrayBuffer
        ? message
        : JSON.stringify(message);
    p.transport.send(data);
    p.lastSentAt = now();
    metrics.bytes += typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
  };
  const dirty = (p: { owner: string }) => {
    if (p) {
      dirtyProfiles.add(p.owner);
      revisions.set(p.owner, (revisions.get(p.owner) || 0) + 1);
      store.markChanged?.();
    }
  };
  const shared = createSharedWorld({
    onCombatDamage: (p: ServerPlayer, damage: number) => personal.awardCombat(p, damage),
    onRaptorDefeated: (p: ServerPlayer) => {
      if (personal.runtime(p).expeditions.markRaptorDefeated())
        send(p, {
          type: 'notice',
          message: contentText('world-message.jurassic.railgun-unlocked'),
        });
    },
    onBind: bindPlayer,
    geometry,
    routes,
    players,
    send,
    dirty,
    random,
    now,
    saved: saved.shared,
    movement: {
      approachCombat: (...args) => movement.approachCombat(...args),
      stopCombatRoute: (p) => movement.stopCombatRoute(p),
    },
    onAirshipReset: (p: ServerPlayer) => {
      following.stop(p);
      movement.clear(p);
      pvp.stop(p);
      p.personalBattle = null;
    },
  });
  const pvp = createPvpCombat({
    onCombatDamage: (p: ServerPlayer, damage: number) => personal.awardCombat(p, damage),
    players,
    now,
    random,
    geometry,
    send,
    dirty,
    onDeath: pvpDeath,
  });
  const instances = createServerInstances({ geometry, shared, pvp, players, send, dirty, now });
  const tablets = createServerTablets({ geometry, shared, pvp, players, send, dirty, now });
  const following = createServerFollowing({ geometry, routes, pvp, players, send, dirty, now });
  const movement = createServerMovement({
    geometry,
    routes,
    players,
    send,
    dirty,
    now,
    following,
    clock: () => shared.clock,
  });
  const residentialSearch = createResidentialSearch({ geometry, now, dirty });
  const personal = createPlayerState({
    geometry,
    routes,
    shared,
    players,
    send,
    dirty,
    now,
    random,
    movement,
    instances,
  });
  const finance = createServerFinance({ geometry, players, send, dirty, now, random }),
    duels = createDuels({ players, send, dirty, now }),
    trades = createPlayerTrades({ players, send, now, commit: commitTrade });
  function bindPlayer(target: ServerPlayer) {
    const duration = 10_000;
    target.boundUntil = now() + duration;
    target.profile.playerState.activities.bindUntil = target.boundUntil;
    dirty(target);
    following.stop(target);
    movement.stop(target);
    for (const observer of players.values())
      if (
        observer.instance.id === target.instance.id &&
        Math.hypot(observer.x - target.x, observer.z - target.z) < 42
      )
        send(observer, { type: 'pvpBound', target: target.id, duration });
  }
  const replication = createReplication({
    players,
    shared,
    personal,
    send,
    publicPlayer,
    now,
    metrics,
  });
  function mergePrivate(p: ServerPlayer, input: unknown) {
    // Checkpoints carry cosmetic preferences only. Progress is never merged.
    const incoming = sanitizePrivateState(input);
    if (incoming['sf-character-v1'])
      p.profile.privateState['sf-character-v1'] = incoming['sf-character-v1'];
    const look = ownedAppearance(p.profile, p.inventory.economy.state);
    p.profile.privateState['sf-character-v1'] = JSON.stringify(look);
    const weaponChanged = p.appearance.weapon !== look.weapon;
    if (JSON.stringify(look) !== JSON.stringify(p.appearance)) {
      p.appearance = look;
      p.revision++;
    }
    if (weaponChanged) {
      p.attack = null;
      movement.stopCombatRoute(p);
      pvp.stop(p);
      personal.runtime(p).expeditions.stop();
    }
    dirty(p);
  }
  function ownedAppearance(
    profile: PlayerProfile,
    purse: ServerPlayer['inventory']['economy']['state'],
  ) {
    const look = appearance(parse(profile.privateState['sf-character-v1'] || '{}'));
    if (
      (['backpack', 'new-year-rocket'] satisfies [string, string]).includes(look.back) &&
      !equipmentOwned(purse, look.back)
    )
      look.back = 'none';
    if (look.neck && look.neck !== 'none' && !equipmentOwned(purse, look.neck)) look.neck = 'none';
    if (look.back === 'cape' && profile.playerState.quests.expeditions.cape !== true)
      look.back = 'none';
    look.boots = ownedBoots(purse, look);
    look.cape = look.back === 'cape';
    look.rocketBurnUntil =
      look.back === 'new-year-rocket' && (profile.decorativeRocketBurnUntil || 0) > now()
        ? profile.decorativeRocketBurnUntil
        : 0;
    if (!purse.ownedHats.includes(look.hat)) look.hat = 'none';
    look.weapon = selectedWeapon(look.weapon, purse);
    Object.assign(
      look,
      ownedClothing(look, (id) => equipmentOwned(purse, id)),
    );
    look.rocketHopAt = look.back === 'new-year-rocket' ? profile.decorativeRocketHopAt || 0 : 0;
    look.sunglasses = look.sunglasses && profile.playerState.inventory.sunglasses.owned === true;
    look.cape = look.cape && profile.playerState.quests.expeditions.cape === true;
    return look;
  }
  function pvpDeath(victim: ServerPlayer, killer: ServerPlayer | null) {
    const dropped = victim.inventory.deathDrops(),
      ids = shared.dropInventory(victim, killer, dropped);
    victim.profile.deathPending = true;
    const readyAt = now() + DEATH_DURATION * 1000;
    victim.respawnReadyAt = readyAt;
    victim.respawnAllowed = true;
    victim.revision++;
    shared.leave(victim);
    dirty(victim);
    if (killer) send(victim, { type: 'caught', source: 'pvp' });
    const inventory = { ...victim.inventory.snapshot(), hp: 0 };
    const task = durable(victim)
      .then(() => {
        if (victim.profile.deathPending && victim.respawnReadyAt === readyAt)
          send(victim, { type: 'inventory', inventory });
        if (killer)
          send(killer, { type: 'pvpKill', target: victim.id, name: victim.name, drops: ids });
      })
      .catch((error) => console.error('PvP death persistence:', error.message));
    victim.deathTask = task;
    cleanupTasks.add(task);
    task.finally(() => cleanupTasks.delete(task));
  }
  function privatePosition(p: ServerPlayer) {
    return { x: p.x, z: p.z, y: p.y, angle: p.angle, hp: p.hp };
  }
  function publicPlayer(p: ServerPlayer) {
    return {
      id: p.id,
      name: p.name,
      appearance: p.appearance,
      revision: p.revision,
      level: p.level,
      pvp: pvp.status(p).enabled,
    };
  }
  function profileForSave(p: ServerPlayer) {
    const profile = profiles.get(p.owner)!,
      police = personal.runtime(p).police.state;
    profile.personalJailed = !!p.personalJailed;
    profile.police = { ...police, officers: police.officers.map(({ path, ...n }) => n) };
    profile.position = movement.savePosition(p, instances.savePosition(p));
    Object.assign(profile.playerState.skills.hitpoints, {
      hp: profile.position?.hp ?? p.hp,
      max: p.max,
      xp: p.hitpointsXP,
    });
    return serializePlayerProfile(profile);
  }
  async function commitTrade(
    a: ServerPlayer,
    b: ServerPlayer,
    drafts: readonly [TradeHoldings, TradeHoldings],
  ) {
    // Stage both player records before touching either live inventory. The
    // short settlement gate also keeps ticks and older profile writes from
    // interleaving with the atomic storage batch.
    const participants = [a, b] as const;
    const apply = (
      profile: PlayerProfile,
      inventory: ServerPlayer['inventory'],
      draft: TradeHoldings,
    ) => {
      profile.growth = draft.growth;
      profile.grapplingHook = draft.grapplingHook;
      inventory.installTrade(draft.inventory);
      profile.privateState['sf-character-v1'] = JSON.stringify(
        ownedAppearance(profile, inventory.economy.state),
      );
    };
    const task = (async () => {
      await flushing;
      const entries = participants.map((p, i) => {
        const staged = hydratePlayerProfile(structuredClone(profileForSave(p)));
        apply(staged, createInventoryAccount(staged), drafts[i]);
        return ['player:' + p.owner, serializePlayerProfile(staged)] as const;
      });
      await store.batch(entries);
      for (const [i, p] of participants.entries()) {
        apply(p.profile, p.inventory, drafts[i]);
        mergePrivate(p, {});
        persistedRevisions.set(p.owner, revisions.get(p.owner) || 0);
        dirtyProfiles.delete(p.owner);
        finance.remove(p);
        finance.publish(p);
      }
    })();
    tradeCommit = task;
    try {
      await task;
    } finally {
      tradeCommit = null;
    }
  }
  async function flush() {
    if (tradeCommit) await tradeCommit.catch(() => {});
    if (flushing) {
      await flushing;
      return;
    }
    const owners = [...dirtyProfiles],
      savedRevisions = new Map(owners.map((owner) => [owner, revisions.get(owner) || 0]));
    for (const owner of owners) dirtyProfiles.delete(owner);
    const entries: StorageEntry[] = [['world', { serial, shared: shared.persist() }]];
    // The RAM adapter detaches the whole batch synchronously before its
    // first await. Avoid cloning every active profile twice per checkpoint.
    for (const owner of owners) {
      const p = identities.get(owner),
        profile = p ? profileForSave(p) : profiles.get(owner);
      if (profile) entries.push(['player:' + owner, store.inMemory ? profile : clone(profile)]);
    }
    flushing = store.batch(entries);
    try {
      await flushing;
      for (const owner of owners)
        persistedRevisions.set(
          owner,
          Math.max(persistedRevisions.get(owner) || 0, savedRevisions.get(owner)!),
        );
    } catch (e) {
      for (const owner of owners) dirtyProfiles.add(owner);
      throw e;
    } finally {
      flushing = null;
    }
  }
  async function durable(p: ServerPlayer) {
    const revision = revisions.get(p.owner) || 0;
    if (store.inMemory) {
      // Gameplay is already authoritative in RAM. Commit this account's
      // detached ledger row without copying every other dirty player or
      // the whole world for each purchase, PvP toggle, death or disconnect.
      // The periodic checkpoint materializes the shared world atomically.
      const profile = identities.get(p.owner) === p ? profileForSave(p) : profiles.get(p.owner);
      if (profile) await store.batch([['player:' + p.owner, profile]]);
      persistedRevisions.set(p.owner, Math.max(persistedRevisions.get(p.owner) || 0, revision));
      if (revisions.get(p.owner) === revision) dirtyProfiles.delete(p.owner);
      return;
    }
    while ((persistedRevisions.get(p.owner) || 0) < revision) await flush();
  }
  async function existingChatOwner(token: string) {
    if (closing || !/^[a-f0-9]{64}$/.test(token)) return null;
    try {
      return await accounts.existingOwner(token);
    } catch {
      return null;
    }
  }
  async function canStartChatUnlock(token: string) {
    const owner = await existingChatOwner(token);
    return !!owner && identities.get(owner)?.characterPlaying === true;
  }
  const canTypeChat = (profile: PlayerProfile) => !oauthRequired || profile.chatUnlocked === true;
  const canUseServerChat = (profile: PlayerProfile) =>
    canTypeChat(profile) && (!upgradeRequiredForServerChat || profile.upgrade === true);

  function grantChatUnlock(token: string, googleSubject: string, accountLabel?: string) {
    return enqueueMutation(async () => {
      const owner = await existingChatOwner(token);
      if (!owner) return false;
      const p = identities.get(owner);
      const stored = profiles.get(owner) || (await store.get('player:' + owner));
      if (!isRecord(stored)) return false;
      const identityKey = googleLinkKey(owner);
      const identity = await store.get(identityKey);
      if (identity != null && (!isRecord(identity) || identity.subject !== googleSubject))
        return false;
      const ownerKey = googleOwnerKey(googleSubject);
      const registeredOwner = await store.get(ownerKey);
      if (registeredOwner != null && registeredOwner !== owner)
        return 'google-already-linked' as const;
      const profile = hydratePlayerProfile(stored);
      const updates: StorageEntry[] = [];
      if (registeredOwner == null) updates.push([ownerKey, owner]);
      if (!isRecord(identity) || identity.label !== accountLabel)
        updates.push([
          identityKey,
          { subject: googleSubject, ...(accountLabel ? { label: accountLabel } : {}) },
        ]);
      if (profile.chatUnlocked !== true) {
        const state = p ? profileForSave(p) : serializePlayerProfile(profile);
        updates.push(['player:' + owner, { ...state, chatUnlocked: true }]);
      }
      if (updates.length) await store.batch(updates);
      profile.chatUnlocked = true;
      if (p)
        send(p, {
          type: 'chatUnlocked',
          googleAccountLabel: accountLabel,
          serverChatAllowed: canUseServerChat(profile),
        });
      return true;
    });
  }
  async function connect(
    hello: ClientHello,
    transport: PlayerTransport,
    admit?: (owner: string, creating: boolean) => void,
    resumed?: ServerPlayer,
  ) {
    if (closing) throw Error('Server restarting');
    if (
      !resumed &&
      (hello?.protocol !== MP_PROTOCOL ||
        typeof hello.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(hello.token))
    )
      throw Error('Invalid session credentials or protocol.');
    const owner =
      resumed?.owner ??
      (await accounts.ownerFor(hello.token as string, (newOwner) => {
        if (closing) throw Error('Server restarting');
        if (players.size >= maxPlayers) throw Error('The world is full. Please try again soon.');
        admit?.(newOwner, true);
      }));
    if (players.size >= maxPlayers && !identities.has(owner))
      throw Error('The world is full. Please try again soon.');
    while (authenticating.has(owner)) await authenticating.get(owner);
    if (closing) throw Error('Server restarting');
    let complete!: () => void;
    authenticating.set(owner, new Promise<void>((resolve) => (complete = resolve)));
    try {
      if (!resumed) admit?.(owner, false);
      const stored = profiles.get(owner) || (await store.get('player:' + owner));
      let profile: PlayerProfile | undefined = isRecord(stored)
        ? hydratePlayerProfile(stored)
        : undefined;
      // Profiles saved before the Play flag was introduced are already established.
      const returningCharacter = !!profile && profile.hasPlayed !== false;
      if (!profile) {
        profile = hydratePlayerProfile({
          hasPlayed: false,
          privateState: {
            ...(sanitizePrivateState(hello.privateState)['sf-character-v1']
              ? { 'sf-character-v1': sanitizePrivateState(hello.privateState)['sf-character-v1'] }
              : {}),
          },
          position: null,
          grapplingHook: false,
          awards: [],
          awardSerial: 0,
        });
        hydratePlayerProfile(profile);
        await store.batch([['player:' + owner, serializePlayerProfile(profile)]]);
      }
      hydratePlayerProfile(profile);
      if (tradeCommit) await tradeCommit.catch(() => {});
      const previous = identities.get(owner);
      if (previous) {
        duels.remove(previous);
        trades.remove(previous);
        finance.remove(previous);
        following.stop(previous);
        personal.save(previous);
        Object.assign(profile, profileForSave(previous));
        movement.remove(previous);
        personal.remove(previous);
        shared.leave(previous);
        players.delete(previous.id);
        previous.transport.close(4001, 'This character connected in another tab.');
        if (!store.inMemory) await previous.queue;
      }
      if (players.size >= maxPlayers) throw Error('The world is full. Please try again soon.');
      profiles.set(owner, profile);
      const googleIdentity =
        profile.chatUnlocked === true ? await store.get(googleLinkKey(owner)) : null;
      const inventory = createInventoryAccount(profile);
      if (profile.deathPending) {
        const xp = skillStatus(parse(profile.privateState['sf-hitpoints-v1']).xp).xp,
          max = hitpointMaximum(xp),
          h = geometry.hospital || { x: 74.7, y: 89.5 };
        profile.position = {
          x: h.x + 0.5,
          z: h.y + 0.5,
          y: geometry.characterGround(h.x + 0.5, h.y + 0.5),
          hp: max,
        };
        profile.privateState['sf-hitpoints-v1'] = JSON.stringify({ hp: max, max, xp });
        profile.deathPending = false;
      }
      let persisted = nameOwners.get(owner);
      if (!persisted) {
        const generated = generateUsername(
          (canonical) => names.has(canonical) || allowUsername?.(canonical) === false,
        );
        // Reserve before yielding so concurrent browser identities
        // cannot receive the same automatic name.
        names.set(generated.canonical, owner);
        try {
          await store.rename(owner, generated.canonical, generated.name, 0);
          persisted = { owner, canonical: generated.canonical, name: generated.name, changed: 0 };
          nameOwners.set(owner, persisted);
        } catch (error) {
          if (names.get(generated.canonical) === owner) names.delete(generated.canonical);
          throw error;
        }
      }
      const hasCharacterPassword = await accounts.hasPassword(owner);
      // Legacy/local adapters can authenticate concurrently while a name
      // reservation yields; capacity must still hold at the final commit.
      if (players.size >= maxPlayers) throw Error('The world is full. Please try again soon.');
      const hitpoints = skillStatus(profile.playerState.skills.hitpoints.xp),
        hpXP = hitpoints.xp,
        maxHP = hitpointMaximum(hpXP);
      const id = resumed?.id ?? ++serial,
        spawn = geometry.spawn,
        position = profile.position;
      serial = Math.max(id, serial);
      const fallback = {
        x: spawn.x + 0.5,
        z: spawn.y + 0.5,
        y: geometry.characterGround(spawn.x + 0.5, spawn.y + 0.5),
        angle: Math.PI / 2,
      };
      const cell = geometry.detention,
        safe =
          profile.personalJailed && cell
            ? { x: cell.x, z: cell.z, y: cell.base + 0.18, angle: 0 }
            : position &&
                [position.x, position.z].every(Number.isFinite) &&
                geometry.landClearAt(position.x - 0.5, position.z! - 0.5)
              ? {
                  ...position,
                  z: position.z!,
                  y: geometry.characterGround(position.x, position.z!),
                  angle: isFiniteNumber(position.angle) ? position.angle : fallback.angle,
                }
              : fallback;
      const p: ServerPlayer = {
        owner,
        id,
        characterPlaying: resumed?.characterPlaying,
        hasCharacterPassword,
        profile,
        inventory,
        level: playerLevel(
          skillStatus(profile.playerState.skills.strength.xp).level,
          hitpoints.level,
        ),
        transport,
        name: persisted.name,
        nameChanged: persisted.changed || 0,
        appearance: appearance(parse(profile.privateState['sf-character-v1'] || '{}')),
        revision: 1,
        ...safe,
        hp: Math.max(1, Math.min(maxHP, position?.hp || maxHP)),
        max: maxHP,
        hitpointsXP: hpXP,
        mode: 'walk',
        phase: 0,
        motion: 0,
        moving: false,
        gesture: '',
        seen: new Map(),
        sharedVersions: new Map(),
        npcVersions: new Map(),
        lastPoseAt: now(),
        shotAt: 0,
        attack: null,
        airship: false,
        deck: null,
        grappling: null,
        queue: Promise.resolve(),
        messages: 0,
        rateAt: now(),
        lastCheckpoint: 0,
        lastSeen: now(),
        instance: PUBLIC_INSTANCE,
      };
      p.personalJailed = profile.personalJailed === true;
      const bound = profile.playerState.activities.bindUntil;
      p.boundUntil = isFiniteNumber(bound) && bound > now() ? bound : undefined;
      players.set(id, p);
      identities.set(owner, p);
      personal.runtime(p);
      mergePrivate(p, {});
      dirty(p);
      metrics.connected = players.size;
      send(p, {
        type: 'welcome',
        protocol: MP_PROTOCOL,
        serverBuild,
        id,
        name: p.name,
        returningCharacter,
        hasCharacterPassword: p.hasCharacterPassword,
        chatUnlocked: canTypeChat(profile),
        serverChatAllowed: canUseServerChat(profile),
        googleAccountLabel:
          isRecord(googleIdentity) && typeof googleIdentity.label === 'string'
            ? googleIdentity.label
            : undefined,
        googleChatAvailable,
        autoName: !p.nameChanged,
        renameAt: p.nameChanged ? p.nameChanged + 60_000 : 0,
        privateState: profile.privateState,
        position: privatePosition(p),
        instance: p.instance,
        illuminati: profile.illuminati === true,
        bomber: instances.bomberStatus(p),
        grapplingHook: profile.grapplingHook,
        inventory: inventory.snapshot(),
        bank: bankSnapshotFor(p, now),
        guild: guildStatusFor(p, now),
        pvp: pvp.status(p),
        level: p.level,
        pendingAwards: profile.awards,
        debug: canDebugTeleport(profile),
        time: now(),
        shared: shared.snapshot(p),
      });
      if (p.boundUntil)
        send(p, { type: 'pvpBound', target: p.id, duration: Math.max(0, p.boundUntil - now()) });
      finance.account(p).update();
      finance.publish(p);
      return p;
    } finally {
      authenticating.delete(owner);
      complete();
    }
  }
  function disconnect(p: ServerPlayer): void | Promise<void> {
    if (tradeCommit) return tradeCommit.catch(() => {}).then(() => disconnect(p));
    if (closing) return;
    if (players.get(p.id) !== p) return;
    duels.remove(p);
    trades.remove(p);
    finance.remove(p);
    following.stop(p);
    personal.save(p);
    Object.assign(p.profile, profileForSave(p));
    movement.remove(p);
    personal.remove(p);
    shared.leave(p);
    players.delete(p.id);
    identities.delete(p.owner);
    metrics.connected = players.size;
    if (closing) return;
    dirty(p);
    // Keep the profile alive until any in-flight loot/purchase receipt and
    // its ledger commit finish, then evict the disconnected session cache.
    const task = p.queue
      .then(async () => {
        await p.deathTask;
        await durable(p);
      })
      .then(() => {
        if (!identities.has(p.owner) && !authenticating.has(p.owner)) {
          profiles.delete(p.owner);
          revisions.delete(p.owner);
          persistedRevisions.delete(p.owner);
        }
      })
      .catch((error) => console.error('Disconnect persistence:', error.message));
    cleanupTasks.add(task);
    task.finally(() => cleanupTasks.delete(task));
  }
  function correction(p: ServerPlayer, reason: string) {
    metrics.corrections++;
    send(p, { type: 'position', ...privatePosition(p), reason });
  }
  function finishRespawn(p: ServerPlayer) {
    const entry = geometry.hospital || { x: 74.7, y: 89.5 };
    const x = entry.x + 0.5;
    const z = entry.y + 0.5;
    const destination = { x, z, y: geometry.characterGround(x, z), angle: Math.PI, hp: p.max };
    following.stop(p);
    movement.leaveTraining(p);
    movement.clear(p);
    shared.leave(p);
    pvp.stop(p);
    const runtime = personal.runtime(p);
    runtime.expeditions.abandonShip();
    runtime.battles.clear();
    runtime.battle = null;
    p.personalBattle = null;
    p.profile.deathPending = false;
    p.pvpDying = false;
    p.boundUntil = undefined;
    delete p.profile.playerState.activities.bindUntil;
    Object.assign(p, destination, {
      attack: null,
      respawnAllowed: false,
      respawnReadyAt: undefined,
      damagePending: false,
      tabletTeleport: null,
      depotLaunch: undefined,
      mode: 'walk',
      phase: 0,
      gesture: '',
      gestureUntil: 0,
      lastPoseAt: now(),
      pvpProtectedUntil: now() + 5000,
    });
    if (instances.kind(p) !== 'world' || p.bomberActive) instances.reset(p, destination);
    runtime.save('sf-hitpoints-v1')({ hp: p.hp, max: p.max, xp: p.hitpointsXP });
    dirty(p);
    correction(p, 'respawn');
  }
  function pose(p: ServerPlayer, input: unknown) {
    // Protocol v4 accepts destinations and activity buttons, never poses or HP.
    metrics.rejected++;
    correction(p, 'Submit a movement action, not a player state.');
  }
  function controls(
    p: ServerPlayer,
    input: { talkingTo?: unknown; boost?: unknown; gesture?: unknown } = {},
  ) {
    p.lastSeen = now();
    if (typeof input.talkingTo === 'string')
      p.talkingTo = shared.npcById.has(input.talkingTo) ? input.talkingTo : null;
    if (input.boost !== undefined) movement.state(p).boost = input.boost === true;
    if ((['talk', 'drink'] satisfies [string, string]).includes(String(input.gesture))) {
      p.gesture = String(input.gesture);
      p.gestureUntil = now() + 800;
    }
  }
  async function checkpoint(
    p: ServerPlayer,
    message: { privateState?: unknown; awardsAck?: unknown },
  ) {
    if (now() - p.lastCheckpoint < 1000) return;
    p.lastCheckpoint = now();
    mergePrivate(p, message.privateState);
    const acknowledged = new Set<unknown>(
      Array.isArray(message.awardsAck) ? message.awardsAck.filter(Number.isSafeInteger) : [],
    );
    p.profile.awards = p.profile.awards.filter((a) => !acknowledged.has(a.id));
    dirty(p);
  }
  async function saveCharacter(p: ServerPlayer, args: Record<string, unknown>) {
    if (!isRecord(args.look) || typeof args.pvp !== 'boolean' || typeof args.phone !== 'boolean')
      return { ok: false, message: 'Invalid character settings.' };
    const pvpStatus = pvp.status(p);
    if (!args.pvp && pvpStatus.enabled && now() < pvpStatus.disableAt)
      return { ok: false, message: 'Wait for the PvP cooldown before disabling PvP.' };
    if (args.phone && !p.inventory.economy.state.iphoneOwned)
      return { ok: false, message: 'You do not own an iPhone.' };
    const password =
      args.password === '' || args.password === undefined
        ? null
        : await accounts.preparePassword(p.owner, args.password, args.currentPassword);
    if (password?.error) return { ok: false, message: password.error };
    const name = args.name === p.name ? { ok: true } : await rename(p, args.name);
    if (!name.ok) return name;
    const loginToken = await password?.save?.();
    if (loginToken) {
      p.hasCharacterPassword = true;
    }
    mergePrivate(p, { 'sf-character-v1': JSON.stringify(args.look) });
    if (p.inventory.economy.state.iphoneEquipped !== args.phone)
      personal.inventory(p, 'equipPhone', { on: args.phone });
    const setting = pvp.setMode(p, args.pvp);
    await durable(p);
    return {
      ...name,
      ok: true,
      appearance: p.appearance,
      name: p.name,
      pvp: setting.pvp,
      inventory: p.inventory.snapshot(),
      hasCharacterPassword: p.hasCharacterPassword === true,
      loginToken,
      message: 'Character settings saved.',
    };
  }
  async function rename(p: ServerPlayer, name: unknown) {
    const normalized = normalizeUsername(name, allowUsername),
      decision = renameDecision({
        normalized,
        owner: p.owner,
        now: now(),
        lastChanged: p.nameChanged,
        current: p.name,
        takenBy: normalized.ok ? names.get(normalized.canonical) : null,
      });
    if (!normalized.ok || !decision.ok || ('unchanged' in decision && decision.unchanged))
      return { ...decision, autoName: !p.nameChanged };
    // Reserve before yielding; simultaneous requests for the same name
    // cannot both pass. Roll back if the ledger commit fails.
    const old = p.name.toLowerCase();
    names.set(normalized.canonical, p.owner);
    try {
      const changed = now();
      await store.rename(p.owner, normalized.canonical, decision.name, changed);
      if (names.get(old) === p.owner && old !== normalized.canonical) names.delete(old);
      p.name = decision.name;
      p.nameChanged = changed;
      p.revision++;
      nameOwners.set(p.owner, {
        owner: p.owner,
        canonical: normalized.canonical,
        name: p.name,
        changed,
      });
      return { ok: true, name: p.name, autoName: false, retryAt: changed + 60_000 };
    } catch (error) {
      if (normalized.canonical !== old) names.delete(normalized.canonical);
      return {
        ok: false,
        message: contentText(
          'world-message.server.game.unable-to-save-that-username-please-try-again',
        ),
      };
    }
  }
  async function command(p: ServerPlayer, message: CommandMessage) {
    const { action } = message;
    if (message.args !== undefined && !isRecord(message.args)) {
      send(p, {
        type: 'result',
        request: message.request,
        action,
        ok: false,
        message: contentText('world-message.server.game.invalid-action-arguments'),
      });
      return;
    }
    const args = message.args || {};
    let result;
    if (action === 'highScores') {
      send(p, {
        type: 'result',
        request: message.request,
        action,
        ok: true,
        highScores: await highScores(),
      });
      return;
    }
    if (
      (p.boundUntil || 0) > now() &&
      ([
        'moveTo',
        'travel',
        'activity',
        'followPlayer',
        'useTablet',
        'instanceEnter',
        'instanceLeave',
        'grapple',
        'airshipBoard',
        'personalTransit',
        'teleport',
      ].includes(action) ||
        (action === 'playerAction' &&
          ['train', 'trampoline', 'constructionStart', 'seizeBicycle'].includes(String(args.verb))))
    ) {
      send(p, {
        type: 'result',
        request: message.request,
        action,
        ok: false,
        message: contentText('world-message.bind-tablet.immobile'),
      });
      return;
    }
    if (
      (p.depotLaunch ||
        (p.mode === 'streetcar' &&
          p.hp > 0 &&
          !p.respawnAllowed &&
          !p.detainAt &&
          !(action === 'travel' && args.kind === 'streetcarExit'))) &&
      !['beginPlay', 'pausePlay', 'characterLogin', 'saveCharacter', 'respawn'].includes(action)
    ) {
      send(p, { type: 'result', request: message.request, action, ok: false });
      return;
    }
    if (
      p.tabletTeleport &&
      !(
        ['stopAttack', 'rename', 'personalTransit', 'teleport', 'moveTo', 'respawn'] satisfies [
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      ).includes(action)
    ) {
      send(p, {
        type: 'result',
        request: message.request,
        action,
        ok: false,
        message: contentText('world-message.server.game.finish-your-teleport-first'),
      });
      return;
    }
    if (
      message.privateState &&
      (
        [
          'buyGrapple',
          'buyBattleaxe',
          'attack',
          'releaseRaptor',
          'pvpAttack',
          'instanceEnter',
        ] satisfies [string, string, string, string, string, string]
      ).includes(action)
    ) {
      mergePrivate(p, message.privateState);
    }
    if (
      (
        [
          'useTablet',
          'instanceEnter',
          'instanceLeave',
          'bomberBoard',
          'bomberReturn',
          'bomberEject',
          'teleport',
          'personalTransit',
          'airshipBoard',
          'grapple',
          'airshipClimb',
          'attack',
          'pvpAttack',
        ] satisfies [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      ).includes(action)
    )
      following.stop(p);
    if (
      (
        [
          'instanceEnter',
          'instanceLeave',
          'bomberBoard',
          'bomberReturn',
          'bomberEject',
          'teleport',
          'personalTransit',
          'useTablet',
          'airshipBoard',
          'grapple',
        ] satisfies [string, string, string, string, string, string, string, string, string, string]
      ).includes(action)
    ) {
      const travel = movement.state(p);
      if (
        (travel.atv || travel.houseClimb) &&
        action !== 'teleport' &&
        action !== 'personalTransit'
      ) {
        send(p, { type: 'result', request: message.request, action, ok: false });
        return;
      }
      movement.clear(p);
      p.personalBattle = null;
    }
    if ((['attack', 'pvpAttack'] satisfies [string, string]).includes(action)) {
      movement.wake(p);
      movement.leaveTraining(p);
      movement.stop(p);
      p.personalBattle = null;
    }
    if (
      action === 'playerAction' &&
      (
        ['train', 'fish', 'attackPersonal', 'attackKraken', 'stealMonkey'] satisfies [
          string,
          string,
          string,
          string,
          string,
        ]
      ).includes(String(args.verb))
    ) {
      following.stop(p);
      if (args.verb !== 'train') movement.leaveTraining(p);
      movement.wake(p);
      movement.stop(p);
    }
    if (action === 'moveTo') {
      // Walking is an explicit disengagement, including when the new
      // destination is blocked. Do not depend on a second client packet
      // to stop shared monsters, private encounters or PvP combat.
      movement.stopCombatRoute(p);
      p.attack = null;
      p.personalBattle = null;
      pvp.stop(p);
      personal.runtime(p).expeditions.stop();
      result = movement.move(p, args);
    } else if (action === 'beginPlay') {
      p.characterPlaying = true;
      if (p.profile.hasPlayed !== true) {
        p.profile.hasPlayed = true;
        dirty(p);
      }
      result = { ok: true };
    } else if (action === 'pausePlay') {
      movement.leaveConstruction(p);
      if (p.seat?.soakSeconds !== undefined) movement.wake(p);
      p.characterPlaying = false;
      result = { ok: true };
    } else if (action === 'characterLogin') {
      const name = normalizeUsername(args.name, allowUsername);
      result = await accounts.logIn(
        p.owner,
        name.ok ? name.canonical : '',
        name.ok ? names.get(name.canonical) : undefined,
        args.password,
      );
    } else if (action === 'saveCharacter') {
      result = await saveCharacter(p, args);
    } else if (action === 'equipAppearance') {
      mergePrivate(p, { 'sf-character-v1': JSON.stringify(args.look || {}) });
      result = { ok: true, appearance: p.appearance };
    } else if (action === 'searchHouse') {
      result = residentialSearch.search(p, args.id);
      if (result.ok) {
        movement.stop(p);
        await durable(p);
      }
    } else if (action === 'lightDecorativeRocket') {
      result = residentialSearch.light(p);
      if (result.ok) {
        if (personal.igniteBurningMan(p))
          result.message = contentText('world-message.burning-man.ignited');
        await durable(p);
      }
    } else if (action === 'rocketHop') {
      result = residentialSearch.hop(p);
      if (result.ok) await durable(p);
    } else if (action === 'stopMoving') {
      movement.stop(p);
      result = { ok: true };
    } else if (
      (['growthBuy', 'growthList', 'growthSell'] satisfies [string, string, string]).includes(
        action,
      )
    ) {
      result = finance.command(p, action, args);
      if (result.ok) {
        if (action === 'growthList' && random() < 1 / 5) {
          shared.dispatchSecuritiesInvestigator(p);
          send(p, {
            type: 'notice',
            message: contentText('world-message.securities-investigator.arrives'),
          });
        }
        await durable(p);
      }
    } else if (TRADE_ACTIONS.has(action)) {
      result = await trades.command(p, action, args);
    } else if (
      (['duelOffer', 'duelAccept', 'duelDecline'] satisfies [string, string, string]).includes(
        action,
      )
    ) {
      result = duels.command(p, action, args);
      if (result.participants) {
        const participants = result.participants;
        await Promise.all(participants.map(durable));
        for (const person of participants)
          send(person, {
            type: 'duelSettled',
            ...result.settlement,
            inventory: person.inventory.snapshot(),
          });
        Reflect.deleteProperty(result, 'participants');
      }
    } else if (action === 'activity') {
      result = movement.activity(p, args);
      if (result.ok && args.mode === 'sit') {
        pvp.stop(p);
        p.attack = null;
        p.personalBattle = null;
        personal.runtime(p).battle = null;
        personal.runtime(p).fishing.cancel();
        personal.runtime(p).expeditions.stop();
      }
    } else if (action === 'travel') {
      result = movement.travel(p, args);
      if (result.ok && args.kind === 'streetcarBoard') {
        pvp.stop(p);
        const activity = personal.runtime(p);
        activity.battle = null;
        activity.fishing.cancel();
        activity.expeditions.stop();
      }
      if (result.ok && 'inventory' in result && result.inventory) await durable(p);
    } else if (action === 'barrelRoll') {
      const s = movement.state(p);
      if (p.bomberActive && !s.bomber.state.active) s.bomber.board(movement.position(p));
      result = movement.barrelRoll(p);
    } else if (action === 'playerAction') {
      result = personal.action(p, args);
      if (result.ok && args.verb === 'seizeBicycle') {
        following.stop(p);
        pvp.stop(p);
        await durable(p);
      } else if (result.ok && 'inventory' in result && result.inventory) await durable(p);
    } else if (
      (
        ['airshipStatus', 'airshipRecall', 'airshipBoard'] satisfies [string, string, string]
      ).includes(action)
    ) {
      if (action !== 'airshipStatus' && message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-please-try-again'),
          inventory: p.inventory.snapshot(),
        };
      else {
        result = shared.command(p, action, args);
        if (result.ok && action !== 'airshipStatus') {
          dirty(p);
          await durable(p);
        }
      }
    } else if (action === 'followPlayer') {
      movement.wake(p);
      movement.leaveTraining(p);
      movement.stop(p);
      p.training = false;
      p.personalBattle = null;
      result = following.start(p, args.id, { attack: args.attack === true });
    } else if (action === 'stopFollowing') {
      following.stop(p);
      result = { ok: true };
    } else if (action === 'buyTablet' || action === 'useTablet') {
      if (message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-please-try-again'),
          inventory: p.inventory.snapshot(),
        };
      else {
        result = tablets.command(p, action, args);
        if (result.ok) await durable(p);
      }
    } else if (action === 'buyBattleaxe') {
      const npc = geometry.merchants?.find((n) => n.id === 'industrial-armorer');
      if (message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-try-again'),
        };
      else if (
        !p.hp ||
        p.personalJailed ||
        p.bomberActive ||
        instances.kind(p) !== 'world' ||
        !npc ||
        Math.hypot(p.x - npc.x, p.z - npc.z) > 2.6 ||
        !{ theyLive: p.profile.playerState.quests.theyLive }.theyLive?.completed
      )
        result = {
          ok: false,
          message: contentText(
            'world-message.server.game.that-equipment-is-not-available-for-purchase',
          ),
        };
      else {
        result = p.inventory.economy.buyEquipment('battleaxe');
        if (result.ok) {
          p.inventory.save();
          dirty(p);
          await durable(p);
        }
        Object.assign(result, { inventory: p.inventory.snapshot() });
      }
    } else if (
      (
        ['bankStatus', 'bankDeposit', 'bankWithdraw', 'bankCoffee', 'bankCoffeeDrink'] satisfies [
          string,
          string,
          string,
          string,
          string,
        ]
      ).includes(action)
    ) {
      if (action !== 'bankStatus' && message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-please-try-again'),
          inventory: p.inventory.snapshot(),
        };
      else {
        result = bankAction(p, action, args, { geometry, now, dirty });
        if (result.ok && action !== 'bankStatus') await durable(p);
      }
    } else if (
      (
        [
          'joinIlluminati',
          'instanceEnter',
          'instanceLeave',
          'bomberBoard',
          'bomberReturn',
          'bomberEject',
          'bomberBomb',
        ] satisfies [string, string, string, string, string, string, string]
      ).includes(action)
    ) {
      result = instances.command(p, action, args);
      if (result.ok) {
        dirty(p);
        await durable(p);
      }
    } else if (action === 'inventory') {
      if (message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-please-try-again'),
          inventory: p.inventory.snapshot(),
        };
      else {
        result = personal.inventory(p, args.op, args);
        if (result.ok) {
          if (args.op === 'trimArmor') result = { ...result, appearance: p.appearance };
          dirty(p);
          await durable(p);
        }
      }
    } else if (action === 'guildCheckIn' || action === 'guildDonate') {
      if (action === 'guildDonate' && message.inventoryEpoch !== p.inventory.meta.epoch)
        result = {
          ok: false,
          message: contentText('world-message.server.game.your-inventory-changed-please-try-again'),
          inventory: p.inventory.snapshot(),
        };
      else {
        result = guildAction(p, action, { geometry, now, dirty });
        if (result.ok) {
          dirty(p);
          await durable(p);
        }
      }
    } else if (action === 'breakBind') {
      const targets = pvp.bindingTargets(p),
        count = p.inventory.meta.bindTablets || 0;
      if (message.inventoryEpoch !== p.inventory.meta.epoch || !count || !targets)
        result = { ok: false, message: contentText('world-message.bind-tablet.requirements') };
      else {
        const damage = Math.min(p.hp, 10);
        p.inventory.meta.bindTablets = count - 1;
        p.inventory.save();
        for (const target of targets) bindPlayer(target);
        p.hp -= damage;
        p.damagePending = true;
        send(p, { type: 'damage', damage, hp: p.hp, max: p.max, source: 'Bind Tablet' });
        if (p.hp === 0) {
          p.respawnAllowed = true;
          p.attack = null;
          pvp.stop(p);
          following.stop(p);
          movement.stop(p);
          pvpDeath(p, null);
          send(p, { type: 'caught', source: 'Bind Tablet' });
        }
        if (p.deathTask) await p.deathTask;
        else {
          dirty(p);
          await durable(p);
        }
        result = {
          ok: true,
          inventory: p.inventory.snapshot(),
          message: contentText('world-message.bind-tablet.broken', { count: targets.length }),
        };
      }
    } else if (action === 'pvp') {
      result = pvp.setMode(p, args.enabled);
      if (result.ok) {
        await durable(p);
        result.pvp = pvp.status(p);
      }
    } else if (action === 'pvpAttack') result = pvp.attack(p, args.id);
    else if (action === 'rename') result = await rename(p, args.name);
    else if (action === 'buyGrapple') {
      if (p.profile.grapplingHook)
        result = {
          ok: false,
          message: contentText('world-message.server.game.you-already-own-a-grappling-hook'),
        };
      else if (!shared.canBuyGrapple(p))
        result = {
          ok: false,
          message: contentText(
            'world-message.server.airship-rental.speak-to-the-airship-attendant-at-the-private-jet-terminal',
          ),
        };
      else {
        const purse = p.inventory.economy.state;
        if (!Number.isSafeInteger(purse.coins) || purse.coins < 5)
          result = {
            ok: false,
            message: contentText('world-message.server.game.a-grappling-hook-costs-5-coins'),
          };
        else {
          purse.coins -= 5;
          p.inventory.save();
          p.profile.grapplingHook = true;
          dirty(p);
          await durable(p);
          result = {
            ok: true,
            grapplingHook: true,
            purse,
            inventory: p.inventory.snapshot(),
            message: contentText(
              'world-message.server.game.you-buy-a-grappling-hook-use-it-within-six-tiles-beneath-the-a',
            ),
          };
        }
      }
    } else if (action === 'teleport') {
      if (!canDebugTeleport(p.profile))
        result = {
          ok: false,
          message: contentText('world-message.debug.teleport-not-enabled'),
        };
      else if (
        !isFiniteNumber(args.x) ||
        !isFiniteNumber(args.z) ||
        Math.abs(args.x) > 1e6 ||
        Math.abs(args.z) > 1e6
      )
        result = {
          ok: false,
          message: contentText('world-message.server.game.that-point-is-blocked'),
        };
      else {
        const requested = { x: args.x, y: args.z };
        const landing = nearestMinimapPoint(requested, requested, {
          maxRadius: DEBUG_TELEPORT_RADIUS,
          // World-space centers of the quarter-tile navigation cells.
          offset: 0.125,
          eligible: ({ x, y }) => geometry.landClearAt(x - 0.5, y - 0.5),
          reachable: () => true,
        });
        if (
          !landing ||
          Math.hypot(landing.x - requested.x, landing.y - requested.y) > DEBUG_TELEPORT_RADIUS
        ) {
          result = {
            ok: false,
            message: contentText('world-message.server.game.that-point-is-blocked'),
          };
        } else {
          const { x, y: z } = landing;
          p.tabletTeleport = null;
          if (instances.kind(p) !== 'world' || p.bomberActive) instances.reset(p);
          shared.leave(p);
          Object.assign(p, {
            x,
            z,
            y: geometry.characterGround(x, z),
            mode: 'walk',
            lastPoseAt: now(),
          });
          correction(p, 'teleport');
          result = { ok: true };
        }
      }
    } else if (action === 'personalTransit') {
      if (args.kind === 'jail' && p.detainAt) {
        result = { ok: true };
      } else if (args.kind === 'jail') {
        p.tabletTeleport = null;
        if (instances.kind(p) !== 'world' || p.bomberActive) instances.reset(p);
        if (!personal.runtime(p).police.state.jailed) {
          result = {
            ok: false,
            message: contentText('world-message.server.game.detention-is-controlled-by-the-server'),
          };
          send(p, { type: 'result', request: message.request, action, ...result });
          return;
        }
        const cell = createDetentionSite(1.5);
        shared.leave(p);
        Object.assign(p, {
          x: cell.x,
          z: cell.z,
          y: cell.base + 0.18,
          mode: 'walk',
          personalJailed: true,
          lastPoseAt: now(),
        });
        correction(p, 'jail');
        result = { ok: true };
      } else if (args.kind === 'rehabilitation' && p.personalJailed) {
        result = personal.action(p, { verb: 'rehabilitate' });
      } else
        result = {
          ok: false,
          message: contentText('world-message.server.game.that-personal-journey-is-unavailable'),
        };
    } else if (action === 'respawn') {
      if (p.hp <= 0 && !p.profile.deathPending) pvpDeath(p, null);
      if (!p.respawnAllowed && p.hp > 0)
        result = {
          ok: false,
          message: contentText('world-message.server.game.no-respawn-is-pending'),
        };
      else if (now() < (p.respawnReadyAt || 0))
        result = {
          ok: false,
          message: contentText('world-message.server.game.wait-for-the-collapse-to-finish'),
        };
      else {
        finishRespawn(p);
        result = { ok: true };
      }
    } else {
      if (action === 'stopAttack') {
        pvp.stop(p);
        p.personalBattle = null;
        personal.runtime(p).expeditions.stop();
      } else if (action === 'attack') pvp.stop(p);
      result =
        action === 'releaseRaptor'
          ? personal.action(p, { verb: 'startRaptor' })
          : shared.command(p, action, args);
      if (action === 'petBear' && result.ok) {
        following.stop(p);
        movement.wake(p);
        movement.stop(p);
        pvp.stop(p);
        p.personalBattle = null;
        if (p.inventory.meta.sandwiches > 0) {
          p.inventory.meta.sandwiches = 0;
          personal.runtime(p).deli.state.sandwiches = 0;
          p.inventory.save();
          dirty(p);
          await durable(p);
          result = {
            ...result,
            inventory: p.inventory.snapshot(),
            message: contentText('world-message.bear.eats-your-sandwiches'),
          };
        }
      }
      if ('award' in result && isRecord(result.award) && typeof result.award.kind === 'string') {
        personal.collect(p, { ...result.award, kind: result.award.kind });
        const award = {
          id: ++p.profile.awardSerial,
          ...result.award,
          inventory: p.inventory.snapshot(),
        };
        p.profile.awards.push(award);
        dirty(p);
        await durable(p);
        result = { ...result, award };
      } else if (
        result.ok &&
        (['releaseRaptor', 'releaseTiger'] satisfies [string, string]).includes(action)
      ) {
        dirty(p);
        await durable(p);
      }
    }
    // Movement changes the pose frame and active-service fields already have
    // their own sampling. A new destination must not invalidate idle UI DTOs.
    if (result?.ok && action !== 'moveTo')
      p.presentationRevision = (p.presentationRevision || 0) + 1;
    send(p, { type: 'result', request: message.request, action, ...result });
  }
  function receive(p: ServerPlayer, input: unknown) {
    const message = readClientMessage(input);
    if (closing || players.get(p.id) !== p || !message || typeof message !== 'object') return;
    if (message.type !== 'command' || message.action !== 'moveTo') p.pendingMove = null;
    if (now() - p.rateAt >= 1000) {
      p.rateAt = now();
      p.messages = 0;
    }
    if (++p.messages > 80) {
      p.transport.close(4008, 'Too many messages');
      return;
    }
    if (message.type === 'pose') {
      if (store.inMemory)
        p.queue = enqueueMutation(() => {
          if (players.get(p.id) === p) pose(p, message.pose);
        });
      else pose(p, message.pose);
      return;
    }
    if (message.type === 'controls') {
      if (store.inMemory)
        p.queue = enqueueMutation(() => {
          if (players.get(p.id) === p) controls(p, message);
        });
      else controls(p, message);
      return;
    }
    if (message.type === 'ping') {
      send(p, { type: 'pong', clientTime: message.time, time: now() });
      return;
    }
    if (message.type === 'say') {
      const say = () => {
        const time = now();
        if (players.get(p.id) !== p || time - (p.spokeAt ?? -Infinity) < PLAYER_CHAT_COOLDOWN_MS)
          return;
        const line = canTypeChat(p.profile)
          ? playerChatLine(message.text)
          : quickChatLine(message.text);
        const serverWide = line.startsWith('/');
        if (serverWide && !canUseServerChat(p.profile)) return;
        const text = serverWide ? line.slice(1).trimStart() : line;
        if (!text) return;
        p.spokeAt = time;
        const filter = gamePolicy?.filterChat({
          owner: p.owner,
          text,
          scope: serverWide ? 'server' : 'nearby',
          quick: !canTypeChat(p.profile),
        });
        if (filter === false) return;
        const speech = JSON.stringify({
          type: 'say',
          id: p.id,
          name: p.name,
          text,
          ...(serverWide && { scope: 'server' }),
        });
        for (const other of serverWide ? players.values() : replication.observersOf(p, 25))
          if (!filter || filter(other.owner)) send(other, speech);
      };
      if (store.inMemory) p.queue = enqueueMutation(say);
      else say();
      return;
    }
    if ((p.pendingActions || 0) >= tuning.maxPendingActionsPerPlayer) {
      p.transport.close(4008, 'Too many pending actions');
      return;
    }
    const move =
      message.type === 'command' && message.action === 'moveTo' ? { superseded: false } : null;
    if (move && p.pendingMove) {
      p.pendingMove.superseded = true;
      metrics.coalescedMoves++;
    }
    p.pendingMove = move;
    p.pendingActions = (p.pendingActions || 0) + 1;
    const run = async () => {
      const started = performance.now();
      try {
        if (tradeCommit) await tradeCommit.catch(() => {});
        if (players.get(p.id) !== p) return;
        if (move?.superseded) {
          send(p, {
            type: 'result',
            request: message.request,
            action: 'moveTo',
            ok: true,
            superseded: true,
          });
          return;
        }
        if (p.pendingMove === move) p.pendingMove = null;
        return await (message.type === 'checkpoint'
          ? checkpoint(p, message)
          : message.type === 'command'
            ? command(p, message)
            : undefined);
      } finally {
        p.pendingActions = (p.pendingActions || 1) - 1;
        metrics.observe('actionMs', performance.now() - started);
      }
    };
    p.queue = (store.inMemory ? enqueueMutation(run) : p.queue.then(run)).catch((error) => {
      console.error('Player command:', error.message);
      send(p, {
        type: 'result',
        request: message.request,
        ok: false,
        message: contentText('world-message.server.game.unable-to-complete-this-action-try-again'),
      });
    });
  }
  function tickDepot(p: ServerPlayer, dt: number) {
    const flight = p.depotLaunch;
    if (flight) {
      const duration = flight.trampoline ? TRAMPOLINE.duration : DYNAMITE_DEPOT.seconds,
        height = flight.trampoline ? TRAMPOLINE.height : DYNAMITE_DEPOT.height;
      flight.elapsed = Math.min(duration, flight.elapsed + dt);
      const progress = flight.elapsed / duration;
      p.y = flight.base + 4 * height * progress * (1 - progress);
      if (progress < 1) return;
      p.depotLaunch = undefined;
      p.mode = 'walk';
      if (flight.trampoline) return;
      const damage = Math.max(0, p.hp - 1);
      p.hp -= damage;
      p.damagePending = true;
      send(p, { type: 'damage', damage, hp: p.hp, max: p.max, source: DYNAMITE_DEPOT.name });
      dirty(p);
      return;
    }
    const inside =
      Math.hypot(p.x - DYNAMITE_DEPOT.x, p.z - DYNAMITE_DEPOT.z) <= DYNAMITE_DEPOT.radius;
    if (!inside) {
      p.depotTriggered = false;
      return;
    }
    if (
      p.depotTriggered ||
      p.hp <= 0 ||
      p.respawnAllowed ||
      p.personalJailed ||
      p.detainAt ||
      p.mode !== 'walk' ||
      p.instance.kind !== 'world' ||
      p.appearance.back !== 'new-year-rocket' ||
      p.profile.decorativeRocketBurnUntil <= now() ||
      !p.moving
    )
      return;
    p.depotTriggered = true;
    p.depotLaunch = { base: geometry.characterGround(p.x, p.z), elapsed: 0 };
    p.attack = null;
    pvp.stop(p);
    following.stop(p);
    movement.stop(p);
    p.mode = 'depotLaunch';
    send(p, { type: 'notice', message: contentText('world-message.dynamite-depot.launch') });
    dirty(p);
  }
  function tick(dt = 1 / GAMEPLAY.simulationHz) {
    if (closing || store.status === 'completed' || tradeCommit) return;
    const start = performance.now();
    let mark = start;
    const measured = (name: string) => {
      const current = performance.now();
      metrics.observe(name, current - mark);
      mark = current;
    };
    store.markChanged?.();
    tickNumber++;
    routes.beginTick();
    following.tick(dt);
    movement.tick(dt);
    for (const p of players.values()) tickDepot(p, dt);
    measured('movementMs');
    for (const p of players.values())
      if (p.talkingTo) {
        const npc = shared.npcById.get(p.talkingTo);
        if (npc && p.hp > 0 && !p.moving && Math.hypot(npc.x - p.x, npc.z - p.z) < 3.5)
          npc.hold = 0.4;
      }
    shared.tick(dt);
    measured('sharedMs');
    finance.tick();
    duels.tick();
    trades.tick();
    instances.tick();
    tablets.tick();
    pvp.tick();
    measured('systemsMs');
    personal.tick(dt);
    measured('personalMs');
    const time = now();
    for (const p of players.values()) {
      residentialSearch.expire(p);
      if (p.characterPlaying && !p.hasCharacterPassword) {
        const played = p.profile.characterPlaySeconds || 0;
        p.profile.characterPlaySeconds = played + dt;
        const remindAt = p.profile.characterReminderAt || 3600;
        if (p.profile.characterPlaySeconds >= remindAt) {
          p.profile.characterReminderAt = remindAt + 600;
          send(p, {
            type: 'notice',
            message: contentText('world-message.character.password-reminder'),
          });
        }
        if (Math.floor(played / 30) !== Math.floor(p.profile.characterPlaySeconds / 30)) dirty(p);
      }
      if (p.hp === 0 && !p.profile.deathPending) {
        p.training = false;
        pvpDeath(p, null);
      }
      if (p.profile.deathPending && time >= (p.respawnReadyAt ?? Infinity)) finishRespawn(p);
      if (p.gestureUntil && time > p.gestureUntil) {
        p.gesture = '';
        p.gestureUntil = 0;
      }
    }
    metrics.tickMs = performance.now() - start;
    metrics.observe('tickMs', metrics.tickMs);
  }
  function broadcast() {
    replication.broadcast(tickNumber);
  }
  function close() {
    if (!closePromise) {
      closing = true;
      closePromise = (async () => {
        await actionQueue.drain();
        await Promise.all([...authenticating.values()]);
        await Promise.all([...players.values()].map((p) => p.queue));
        await Promise.all([...cleanupTasks]);
        for (const p of players.values()) {
          personal.save(p);
          Object.assign(p.profile, profileForSave(p));
          dirty(p);
        }
        await flush();
      })();
    }
    return closePromise;
  }
  function prepareCheckpoint<T>(capture: () => T) {
    const prepare = async () => {
      const start = performance.now();
      // A disconnect may still be committing its RAM ledger. Always
      // materialize a fresh world/profile view after that commit.
      while (flushing) await flushing;
      for (const p of players.values()) personal.save(p);
      await flush();
      const result = capture();
      metrics.observe('checkpointPrepareMs', performance.now() - start);
      return result;
    };
    return store.inMemory ? enqueueMutation(prepare) : prepare();
  }
  return {
    restoreConnection: (player: ServerPlayer, transport: PlayerTransport) =>
      connect({}, transport, undefined, player),
    connect: (
      hello: ClientHello,
      transport: PlayerTransport,
      admit?: (owner: string, creating: boolean) => void,
    ) =>
      store.inMemory
        ? enqueueMutation(() => connect(hello, transport, admit))
        : connect(hello, transport, admit),
    disconnect: store.inMemory
      ? (p: ServerPlayer) => (closing ? undefined : enqueueMutation(() => disconnect(p)))
      : disconnect,
    receive,
    canStartChatUnlock,
    grantChatUnlock,
    tick,
    broadcast,
    flush,
    prepareCheckpoint,
    players,
    shared,
    finance,
    duels,
    pvp,
    following,
    movement,
    personal,
    metrics,
    routes,
    actionQueue,
    store,
    get serial() {
      return serial;
    },
    get status() {
      return store.status || 'active';
    },
    close,
    async complete() {
      await close();
      if (!store.complete) throw new Error('Completion requires the RAM checkpoint store.');
      store.complete();
    },
  };
}
