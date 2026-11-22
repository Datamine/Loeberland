import { MONSTER_STATS } from './monster-drops.ts';
import { ENERGY_BOLT_SECONDS, SCIENTIST_EXPLOSIVE } from './config/gameplay.ts';
import type { RemoteActor, Actor, LocalPlayer, SignAtlas } from './types/world.ts';
import type {
  SharedSnapshot,
  MultiplayerState,
  NetworkSelf,
  NetworkPose,
  PoseCoordinates,
  Position,
  CommandResult,
  InventorySnapshot,
  ServerEvent,
} from './types/network.ts';
import type { ActorTag, TargetMetadata } from './types/scene-state.ts';
import type { PendingAward, EconomyState } from './types/content.ts';
import type { MultiplayerActionsOptions } from './multiplayer-actions.ts';
import type { Health, Economy } from './types/controllers.ts';
import { requiredValue } from './types/assert.ts';
interface WorldMultiplayerOptions {
  client: ReturnType<typeof import('./multiplayer-client.ts').createMultiplayerClient>;
  player: LocalPlayer;
  airship: Pick<ReturnType<typeof import('./airship.ts').createAirship>, 'state'> & {
    cancel: () => unknown;
    resetPresentation?: () => unknown;
  };
  basket: Pick<
    ReturnType<typeof import('./airship-basket.ts').createAirshipBasket>,
    'state' | 'reset'
  >;
  rope: Pick<ReturnType<typeof import('./airship-rope.ts').createAirshipRope>, 'state' | 'reset'>;
  expeditions: Pick<
    ReturnType<typeof import('./jurassic.ts').createExpeditions>,
    'state' | 'cows' | 'raptor' | 'kraken'
  > & { stop: () => unknown };
  zoo: ReturnType<typeof import('./zoo-encounter.ts').createTigerEncounter>;
  merchants: Actor[];
  health: Health;
  economy: Economy;
  combatFeedback: Pick<
    ReturnType<
      typeof import('./combat-feedback.ts').createCombatFeedback<Actor | RemoteActor | LocalPlayer>
    >,
    'hit' | 'show'
  >;
  characterGround: (x: number, z: number) => number;
  playerGround: () => number;
  announce: (message: string, speaker?: string) => void;
  onPosition: (position: Position & { reason?: string }) => void;
  onCaught: (source: string) => void;
  onPrivateAward: (award: PendingAward) => void;
  lives: Parameters<typeof createNPCPresentation<Actor>>[0]['lives'];
  wilderness?: { actors: Actor[] } | null;
  onTraffic?: (traffic: NonNullable<SharedSnapshot['traffic']>, sampleTime: number) => void;
  applyInventory: (snapshot: InventorySnapshot) => void;
  controllers: MultiplayerActionsOptions['controllers'];
  applyPlayerState: MultiplayerActionsOptions['onState'];
  stopFollowMotion: () => void;
  canFollow: () => boolean;
  preparePlayerAction: () => void;
  onPurse: (state: EconomyState) => unknown;
  refreshUI: () => void;
  onDetained?: (message: Extract<ServerEvent, { type: 'detained' }>) => void;
  applyFollowPose: (pose: PoseCoordinates & { moving?: boolean }, stopped: boolean) => void;
  applyServerPose: (pose: PoseCoordinates & Partial<NetworkPose>) => void;
  moveResult?: (result: CommandResult) => void;
  actorInView: (x: number, z: number, base: number) => boolean;
  signs: SignAtlas;
}
import { isFiniteNumber } from './types/json.ts';
import type { Mesh } from './geometry.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import { createNPCPresentation } from './npc-network.ts';
import './teleport-models.ts';
import { interpolateNetworkPose } from './multiplayer-client.ts';
import { characterAppearance, normalizeCharacter } from './character-config.ts';
import './jurassic-models.ts';
import './airship-rope.ts';
import { createMultiplayerInventory } from './multiplayer-inventory.ts';
import './capture-animation.ts';
import './illuminati-models.ts';
import './bank-models.ts';
import { createMultiplayerActions } from './multiplayer-actions.ts';
import { MP_ENTITY_INTERPOLATION_MS } from './multiplayer-protocol.ts';
import { createActorAnimation } from './animation-presentation.ts';
import { drawRemotePlayer } from './remote-player-models.ts';
import { rocketHopForPose } from './rocket-hop.ts';
import { createPursuitPresentation } from './pursuit-presentation.ts';

export function estimatedWorldSeconds(
  clock: unknown,
  receivedAt: number,
  time = performance.now(),
) {
  return (isFiniteNumber(clock) ? clock : 0) + Math.max(0, time - receivedAt) / 1000;
}

export function setupMultiplayerSettings(client: {
  state: Pick<MultiplayerState, 'connected' | 'grapplingHook' | 'pvp' | 'serverOffset'>;
}) {
  const grapple = document.getElementById('sf-grapple-button') as HTMLButtonElement;
  const pvpHint = document.getElementById('sf-pvp-status')!;
  function update() {
    const state = client.state;
    grapple.disabled = !state.connected || !state.grapplingHook;
    const pvp = state.pvp || { enabled: false, disableAt: 0 };
    const seconds = Math.max(
      0,
      Math.ceil(((pvp.disableAt || 0) - (Date.now() + (state.serverOffset || 0))) / 1000),
    );
    pvpHint.textContent = seconds
      ? 'Can disable PvP in ' + seconds + 's.'
      : 'Both players must opt in. Changes apply when you save.';
  }
  update();
  return { update };
}

/** Adapt the existing renderer/personal adventures to server-owned entities.
 * Personal quests, disguises, vehicles and rockets never enter shared state. */
export function createWorldMultiplayer(api: WorldMultiplayerOptions) {
  const {
    client,
    player,
    airship,
    basket,
    rope,
    expeditions,
    zoo,
    merchants,
    health,
    economy,
    combatFeedback,
    characterGround,
    announce,
    onPosition,
    onCaught,
    onPrivateAward,
  } = api;
  let snapshot = client.state.world,
    previousShip: PoseCoordinates | null = null,
    currentShip: PoseCoordinates | null = null,
    shipAt = performance.now(),
    previousSelf: NetworkSelf | null = null,
    currentSelf: NetworkSelf | null = null,
    selfAt = 0,
    worldAt = performance.now(),
    grapplingGround: number | null = null;

  const npcPresentation = createNPCPresentation({ npcs: merchants, lives: api.lives }),
    remoteActors = new Map<number, RemoteActor>(),
    bindings = new Map<number, { start: number; duration: number }>(),
    inventoryBridge = createMultiplayerInventory({
      client,
      apply: api.applyInventory,
    });
  const creaturePresentation = createNPCPresentation({ npcs: api.wilderness?.actors || [] }),
    cowPresentation = createNPCPresentation({ npcs: expeditions.cows });
  const pursuits = createPursuitPresentation({ zoo, raptor: expeditions.raptor });
  const followState = { target: null as number | null, attack: false };
  let followGround: number | null = null,
    selfMode = 'walk',
    selfGesture = '',
    followRequest = 0,
    latestMove = 0;
  function stopFollowing(move = true, remote = false) {
    const had = followState.target !== null;
    followRequest++;
    followState.target = null;
    followState.attack = false;
    followGround = null;
    if (had) {
      if (move) api.stopFollowMotion();
      if (!remote) client.command('stopFollowing');
    }
    return had;
  }
  function startFollowing(target: { id: number }, attack = false) {
    if (!api.canFollow()) {
      announce(
        contentText(
          'world-message.src.multiplayer-world.stand-on-the-ground-before-following-another-player',
        ),
        'Follow',
      );
      return false;
    }
    api.preparePlayerAction();
    followState.target = target.id;
    followState.attack = attack;
    const request = ++followRequest;
    client.command('followPlayer', { id: target.id, attack }).then((result) => {
      if (request !== followRequest) return;
      if (!result.ok) {
        stopFollowing(true, true);
        announce(
          result.message || contentText('world-message.src.multiplayer-world.following-stopped'),
          'Follow',
        );
      } else if (result.message)
        announce(
          result.message || contentText('world-message.src.multiplayer-world.following-stopped'),
          'Follow',
        );
    });
    return true;
  }

  async function command(action: string, args = {}) {
    const result = await client.command(action, args);
    if (result.message) announce(result.message, result.ok ? 'World' : 'Server');
    if (result.purse) {
      Object.assign(economy.state, result.purse);
      api.onPurse(economy.state);
      try {
        localStorage.setItem('sf-purse-v1', JSON.stringify(economy.state));
      } catch {}
    }
    if (result.award) award(result.award);
    return result;
  }
  function award(item: PendingAward) {
    client.claimAward(item, (value) => inventoryBridge.suppress(() => onPrivateAward(value)));
  }
  function worldUpdate(
    state: SharedSnapshot | null,
    self: NetworkSelf | null | undefined,
    sampleTime = client.state.worldSampleAt ?? performance.now(),
  ) {
    if (!state) return;
    snapshot = state;
    const time = performance.now(),
      ship = state.airship;
    worldAt = time;
    if (ship) {
      previousShip = currentShip || {
        ...ship.position,
        angle: ship.heading,
        phase: 0,
        motion: 0,
        mode: 'airship',
      };
      currentShip = { ...ship.position, angle: ship.heading, phase: 0, motion: 0, mode: 'airship' };
      shipAt = time;
    }
    if (self) {
      previousSelf = currentSelf || { ...self, phase: 0, motion: 0 };
      currentSelf = { ...self };
      selfAt = time;
    } else {
      currentSelf = null;
      grapplingGround = null;
    }
    if (state.cows) cowPresentation.sync(state.cows, sampleTime);
    if (state.traffic) api.onTraffic?.(state.traffic, sampleTime);
    if (state.wilderness && api.wilderness) {
      const dispatched = (n: { combatKind?: string }) =>
        n.combatKind === 'robocop' || n.combatKind === 'securities-investigator';
      const responders = new Set(state.wilderness.filter(dispatched).map((n) => n.id));
      const actors = api.wilderness.actors;
      for (let i = actors.length - 1; i >= 0; i--) {
        if (dispatched(actors[i]) && !responders.has(String(actors[i].id))) {
          creaturePresentation.remove(actors[i].id);
          actors.splice(i, 1);
        }
      }
      for (const record of state.wilderness) {
        if (!responders.has(record.id) || actors.some((n) => n.id === record.id)) continue;
        const stats = MONSTER_STATS[record.combatKind!];
        const actor: Actor = {
          ...record,
          phase: typeof record.phase === 'number' ? record.phase : 0,
          label: stats.name,
          description: stats.description,
          height: stats.height,
          wilderness: true,
        };
        actors.push(actor);
        creaturePresentation.add(actor);
      }
      creaturePresentation.sync(state.wilderness, sampleTime);
    }
    pursuits.syncWorld(state, sampleTime);
    if (state.raptor)
      expeditions.raptor.prey = { isPlayer: state.raptor.preyId === client.state.id };
    if (expeditions.state.target?.hp === 0) expeditions.state.target = null;
    npcPresentation.sync(state.npcs || [], sampleTime);
    expeditions.state.loot = [
      ...expeditions.state.loot.filter((l) => !l.network),
      ...(state.loot || []),
    ];
    if (ship) {
      const aboard = client.state.id !== null && ship.passengers.includes(client.state.id),
        wasAboard = airship.state.active;
      if (aboard) {
        if (
          self?.deck &&
          (!wasAboard ||
            (!basket.state.target &&
              Math.hypot(basket.state.x - self.deck.x, basket.state.z - self.deck.z) > 0.6))
        )
          basket.reset(self.deck.x, self.deck.z);
        airship.state.active = true;
        airship.state.phase = ship.phase;
        airship.state.heading = ship.heading;
        airship.state.position = { ...ship.position };
        airship.state.speed = ship.speed;
        airship.state.target = null;
      } else if (airship.state.active) {
        (airship.resetPresentation || airship.cancel)();
        basket.reset();
      }
      if (ship.rope?.deployed && ship.rope.bottom) {
        Object.assign(rope.state, {
          passenger: ship.rope.passenger || null,
          passengerPaid: ship.rope.passengerPaid === true,
          deployed: true,
          top: ship.rope.top,
          bottom: ship.rope.bottom,
          phase: aboard
            ? 'hanging'
            : Math.hypot(player.x + 0.5 - ship.rope.bottom.x, player.y + 0.5 - ship.rope.bottom.z) <
                1.5
              ? 'ground'
              : 'hanging',
        });
      } else rope.reset();
    }
    api.refreshUI();
  }
  client.subscribe((message) => {
    if (message.type === 'world') worldUpdate(message.state, message.self, message.sampleTime);
    else if (message.type === 'instance') {
      stopFollowing(true, true);
      client.state.pvpTarget = null;
      remoteActors.clear();
      pursuits.clear();
      npcPresentation.clear();
      creaturePresentation.clear();
      cowPresentation.clear();
      previousShip = currentShip = null;
      currentSelf = null;
      grapplingGround = null;
      worldUpdate(client.state.world, null);
    } else if (message.type === 'welcome') {
      pursuits.clear();
      npcPresentation.clear();
      creaturePresentation.clear();
      cowPresentation.clear();
      worldUpdate(message.shared, null, message.sampleTime);
      onPosition({ ...message.position, reason: 'reconnect' });
      for (const item of message.pendingAwards || []) award(item);
    } else if (message.type === 'hitpoints') {
      health.state.hp = message.hp;
      health.state.max = message.max || health.state.max;
      api.refreshUI();
    } else if (message.type === 'detained') api.onDetained?.(message);
    else if (message.type === 'following') {
      followState.target = message.target;
      followState.attack = message.attack === true;
      client.state.pvpTarget = followState.attack ? message.target : null;
      followGround = null;
      if (message.target === null) api.applyFollowPose(message.position, true);
      else api.applyFollowPose(message.position, false);
      if (message.message) announce(message.message, 'Follow');
    } else if (message.type === 'result' && message.award) award(message.award);
    else if (message.type === 'position') onPosition(message);
    else if (message.type === 'airshipReset') {
      previousShip = currentShip = null;
      worldUpdate({ ...snapshot, airship: message.airship }, null);
      if (message.position) {
        stopFollowing(true, true);
        client.state.pvpTarget = null;
        onPosition({ ...message.position, reason: 'airship-reset' });
      }
      announce(message.message, 'Airship');
    } else if (message.type === 'damage') {
      health.state.hp = message.hp;
      health.state.max = message.max || health.state.max;
      combatFeedback.hit(player, message.damage, message.hp, message.max || health.state.max);
      api.refreshUI();
    } else if (message.type === 'caught') {
      stopFollowing(true, true);
      client.state.pvpTarget = null;
      onCaught(message.source);
    } else if (message.type === 'pvpBound') {
      bindings.set(message.target, { start: performance.now(), duration: message.duration });
    } else if (message.type === 'scientistExplosive' || message.type === 'robotShot') {
      const explosive = message.type === 'scientistExplosive';
      expeditions.state.beams.push({
        from: message.from,
        to: message.to,
        ttl: explosive
          ? SCIENTIST_EXPLOSIVE.flight + SCIENTIST_EXPLOSIVE.burst
          : ENERGY_BOLT_SECONDS,
        weapon: explosive ? 'scientist-explosive' : message.weapon,
      });
    } else if (message.type === 'pvpHit') {
      const actor = message.target === client.state.id ? player : remoteActors.get(message.target);
      if (actor) {
        if ('networkPlayer' in actor) actor.hp = message.hp;
        const other = message.attacker !== client.state.id && message.target !== client.state.id;
        combatFeedback.hit(
          actor,
          message.damage,
          message.hp,
          message.max || health.state.max,
          other,
        );
      }
      if (message.target === client.state.id) {
        health.state.hp = message.hp;
        try {
          localStorage.setItem('sf-hitpoints-v1', JSON.stringify(health.state));
        } catch {}
      }
      if (['railgun', 'akibo', 'missile-launcher'].includes(message.weapon))
        expeditions.state.beams.push({
          from: message.from,
          to: message.to,
          ttl: 0.22,
          weapon: message.weapon,
        });
      if (message.attacker === client.state.id) {
        player.angle = Math.atan2(message.to.z - player.y - 0.5, message.to.x - player.x - 0.5);
        player.gesture = {
          name: contentText('multiplayer-world.createWorldMultiplayer.name-1', {}),
          started: performance.now(),
          duration: 450,
        };
        combatFeedback.show(player, health.state.hp, health.state.max);
      }
      if (message.hp === 0) {
        const peer = client.peers.get(message.target);
        if (peer) peer.deathAt = performance.now();
      }
      api.refreshUI();
    } else if (message.type === 'pvpKill') {
      client.state.pvpTarget = null;
      stopFollowing(true, true);
      announce(
        contentText(
          'world-message.src.multiplayer-world.you-defeated-their-possessions-dropped-where-they-fell',
          { name: String(message.name) },
        ),
        'PvP',
      );
    } else if (message.type === 'sharedHit') {
      const target = [
        ...expeditions.cows,
        expeditions.raptor,
        expeditions.kraken,
        ...(api.wilderness?.actors || []),
        ...merchants,
      ].find((n) => n.id === message.target);
      if (!target) return;
      target.hp = message.hp;
      combatFeedback.hit(target, message.damage, message.hp, message.max);
      const t = performance.now();
      remoteActors.get(message.attacker)?.animation?.trigger('attack', t);
      if (!message.weapon || ['railgun', 'akibo', 'missile-launcher'].includes(message.weapon))
        expeditions.state.beams.push({
          from: message.from,
          to: message.to,
          ttl: 0.22,
          weapon: message.weapon,
        });
      if (message.attacker === client.state.id) {
        player.angle = Math.atan2(message.to.z - player.y - 0.5, message.to.x - player.x - 0.5);
        player.gesture = {
          name: contentText('multiplayer-world.createWorldMultiplayer.name-2', {}),
          started: t,
          duration: 450,
        };
        combatFeedback.show(player, health.state.hp, health.state.max);
      }
      api.refreshUI();
    } else if (message.type === 'say') {
      const peer = client.peers.get(message.id);
      if (peer) {
        peer.speech = message.text;
        peer.speechUntil = performance.now() + 3000;
      }
    }
  });
  worldUpdate(snapshot, client.state.self);
  if (client.state.position) onPosition({ ...client.state.position, reason: 'connect' });
  for (const item of client.state.pendingAwards || []) award(item);
  const actions = createMultiplayerActions({
    client,
    controllers: api.controllers,
    announce,
    onState: api.applyPlayerState,
  });
  function beforeUpdate(dt = 0, freezePlayer = false) {
    npcPresentation.update(client.state.connected);
    creaturePresentation.update(client.state.connected);
    cowPresentation.update(client.state.connected);
    pursuits.update(client.state.connected);
    actions.update(client.state.connected);
    if (freezePlayer) return;
    const time = performance.now();
    if (currentShip && airship.state.active) {
      const p = interpolateNetworkPose(
        previousShip,
        currentShip,
        (time - shipAt) / MP_ENTITY_INTERPOLATION_MS,
      );
      airship.state.position = { x: p.x, y: p.y, z: p.z };
      airship.state.heading = p.angle;
    }
    if (currentSelf?.grappling) {
      const p = interpolateNetworkPose(
        previousSelf,
        currentSelf,
        (time - selfAt) / MP_ENTITY_INTERPOLATION_MS,
      );
      player.x = p.x - 0.5;
      player.y = p.z - 0.5;
      player.angle = p.angle || 0;
      player.phase = p.phase || time * 0.007;
      player.motion = 1;
      grapplingGround = p.y;
    } else grapplingGround = null;
    if (!client.state.connected) {
      if (followState.target !== null) stopFollowing(true, true);
      return;
    }
    const authoritative = client.selfPose();
    if (authoritative) {
      followGround = authoritative.y;
      selfMode = authoritative.mode;
      selfGesture = authoritative.gesture || '';
      api.applyServerPose(authoritative);
    }
  }
  function attackPlayer(target: { id: number; pvp?: boolean }) {
    if (!client.state.pvp?.enabled || !target.pvp) {
      announce(
        contentText(
          'world-message.src.multiplayer-world.both-players-must-enable-pvp-in-character-settings',
        ),
        'PvP',
      );
      return false;
    }
    expeditions.stop();
    return startFollowing(target, true);
  }
  function followPlayer(target: { id: number }) {
    expeditions.stop();
    return startFollowing(target, false);
  }
  function drawBinding(
    m: import('./geometry.ts').Mesh,
    id: number,
    x: number,
    y: number,
    z: number,
    time: number,
  ) {
    const binding = bindings.get(id);
    if (!binding) return;
    const age = Math.max(0, time - binding.start);
    if (age >= binding.duration) return;
    const reach = Math.min(1, age / 520);
    const lift = Math.min(1, (binding.duration - age) / 350);
    const phase = age * 0.0043;
    const point = (i: number, offset: number): [number, number, number] => {
      const f = i / 24,
        a = phase + f * Math.PI * 5.2 + offset,
        r = 0.34 + Math.sin(f * Math.PI) * 0.06;
      return [x + Math.cos(a) * r, y + 0.045 + f * 0.85 * lift, z + Math.sin(a) * r];
    };
    for (const angle of [0, Math.PI])
      for (let i = 1; i <= Math.ceil(reach * 24); i++)
        m.rod(point(i - 1, angle), point(i, angle), 0.018 * lift, '#f5fcff', 5, { emissive: 0.88 });
  }
  function draw(
    m: Mesh,
    t: number,
    addTarget: (start: number, metadata: TargetMetadata) => void,
    actorTags: ActorTag[],
    { ground = characterGround }: { ground?: (x: number, z: number) => number } = {},
  ) {
    const ship = snapshot?.airship;
    if (ship?.active && (airship.state.position || currentShip)) {
      const p = requiredValue(
        airship.state.active ? airship.state.position : currentShip,
        'Active airship position',
      );
      for (const g of ship.grapplers || []) {
        const from =
          g.id === client.state.id
            ? { x: player.x + 0.5, y: (grapplingGround ?? g.y) + 1.4, z: player.y + 0.5 }
            : g;
        m.rod([from.x, from.y, from.z], [p.x, p.y + 0.7, p.z], 0.018, '#c8bba2', 6);
        for (const sign of [-1, 1] satisfies [number, number])
          m.rod(
            [p.x, p.y + 0.65, p.z],
            [p.x + sign * 0.18, p.y + 0.45, p.z + 0.12],
            0.024,
            '#d3dce0',
            6,
          );
      }
    }
    for (const remote of client.remotePlayers(t)) {
      const serverTime = Date.now() + (client.state.serverOffset || 0),
        hop = rocketHopForPose(remote, serverTime);
      if (
        remote.mode === 'hidden' ||
        remote.mode === 'rocket' ||
        !api.actorInView(remote.x, remote.z, remote.y + hop.height)
      )
        continue;
      const look = characterAppearance(normalizeCharacter(remote.appearance)),
        peer = client.peers.get(remote.id);
      let actor = remoteActors.get(remote.id);
      if (!actor) {
        actor = {
          ...remote,
          label: remote.name,
          networkPlayer: true,
          height: 1.95,
          combatKind: 'player',
          max: 30,
        };
        remoteActors.set(remote.id, actor);
      }
      Object.assign(actor, remote, { label: remote.name, base: remote.y + hop.height });
      actor.animation ??= createActorAnimation();
      const animation = actor.animation.sample(remote, t),
        start = m.data.length;
      drawRemotePlayer(m, remote, t, {
        look,
        animation,
        ground,
        signs: api.signs,
        serverTime,
      });
      if (remote.hp > 0 && animation.fall === 0) {
        addTarget(start, { npc: actor });
        drawBinding(m, remote.id, remote.x, remote.y + hop.height, remote.z, t);
      }
      actorTags.push({
        x: remote.x,
        z: remote.z,
        base: remote.y + hop.height,
        height: 2.2,
        player: true,
        pvp: remote.pvp,
        label: remote.name,
        speech: peer?.speech,
        speechUntil: peer?.speechUntil || 0,
      });
    }
    const own = client.state.id;
    if (own !== null) {
      const x = player.x + 0.5,
        z = player.y + 0.5;
      drawBinding(m, own, x, ground(x, z), z, t);
    }
    for (const [id, binding] of bindings)
      if (t - binding.start >= binding.duration) bindings.delete(id);
    for (const id of remoteActors.keys()) if (!client.peers.has(id)) remoteActors.delete(id);
  }
  return {
    actions,
    moveTo: (x: number, z: number, pursuitResult?: (result: CommandResult) => void) => {
      const move = ++latestMove;
      const receipt = pursuitResult
        ? client.command('moveTo', { x, z })
        : command('moveTo', { x, z });
      receipt.then((r) => {
        if (move === latestMove) (pursuitResult || api.moveResult)?.(r);
      });
      return true;
    },
    command,
    beforeUpdate,
    draw,
    followPlayer,
    attackPlayer,
    stopFollowing,
    get following() {
      return followState.target;
    },
    get followingGround() {
      return followGround;
    },
    get selfMode() {
      return selfMode;
    },
    get selfGesture() {
      return selfGesture;
    },
    get serverWalking() {
      return true;
    },
    get combatTarget() {
      return client.state.pvpTarget ? remoteActors.get(client.state.pvpTarget) : null;
    },
    get active() {
      return true;
    },
    get traversing() {
      return grapplingGround !== null;
    },
    get ground() {
      return grapplingGround;
    },
    get clock() {
      return estimatedWorldSeconds(snapshot?.clock, worldAt);
    },
    get sharedAirship() {
      return snapshot?.airship;
    },
    get airshipPosition() {
      if (!currentShip) return null;
      const p = interpolateNetworkPose(
        previousShip,
        currentShip,
        (performance.now() - shipAt) / MP_ENTITY_INTERPOLATION_MS,
      );
      return { x: p.x, y: p.y, z: p.z };
    },
    get captain() {
      return snapshot?.airship?.captain === client.state.id;
    },
    buyGrapple: () => {
      client.checkpoint(true);
      return command('buyGrapple');
    },
    grapple: () => client.state.grapplingHook && command('grapple'),
    releaseTiger: () => command('releaseTiger'),
    teleport: (x: number, z: number) => command('teleport', { x, z }),
    update(
      pose: PoseCoordinates & {
        moving?: boolean;
        mode: string;
        boost?: boolean;
        hp?: number;
        talkingTo?: string;
        gesture?: string;
      },
    ) {
      if (followState.target !== null && pose.mode !== 'walk') stopFollowing(false);
      client.update(pose);
    },
    say: (text: string) => client.say(text),
    checkpoint: () => client.checkpoint(true),
  };
}
