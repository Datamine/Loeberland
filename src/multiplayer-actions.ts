import { contentText } from './content-runtime.ts';
import type { RocketState } from './rocket.ts';
import type { PersonalSnapshot, ServerEvent } from './types/network.ts';
import type { PlayerRuntime } from './types/player-runtime.ts';
import type { Actor } from './types/world.ts';
import { isRecord } from './types/json.ts';
type ControllerStates = {
  [
    K in
      'strength' | 'sunglasses' | 'tech' | 'social' | 'inebriation' | 'fishing' | 'health' | 'deli'
  ]: Pick<PlayerRuntime[K], 'state'>;
};
interface MultiplayerControllers extends ControllerStates {
  quests: Pick<PlayerRuntime['quests'], 'state' | 'theyLive'>;
  expeditions: Pick<PlayerRuntime['expeditions'], 'state' | 'ship' | 'kraken'>;
  motorcycle: Pick<ReturnType<typeof import('./motorcycle.ts').createMotorcycle>, 'state'>;
  aiLabJob: Pick<PlayerRuntime['job'], 'state'>;
  chase: Pick<PlayerRuntime['police'], 'state'>;
  monkeyKeeper: Pick<PlayerRuntime['keeper'], 'state'>;
  fishingSite: (id?: string) => import('./fishing.ts').FishingLocation | undefined;
  merchants: Actor[];
  ferrari?: Pick<
    NonNullable<import('./types/movement.ts').MovementRuntime['ferrari']>,
    'state' | 'applySaved'
  > | null;
  resolvePitch?: (message: Extract<ServerEvent, { type: 'notice' | 'salesDecision' }>) => unknown;
}

export interface MultiplayerActionsOptions {
  client: ReturnType<typeof import('./multiplayer-client.ts').createMultiplayerClient>;
  controllers: MultiplayerControllers;
  announce: (message: string, who?: string) => void;
  onState?: (fields: Record<string, unknown>, state?: PersonalSnapshot) => void;
}
// CONTENT-BINDINGS-MIGRATED
import { sampleRocketPresentation } from './rocket.ts';
import { MP_ENTITY_INTERPOLATION_MS } from './multiplayer-protocol.ts';
import { createPursuitPresentation } from './pursuit-presentation.ts';
import { createSnapshotMotion } from './snapshot-motion.ts';

/** Keep one visual clock for the rider, rocket, hatch and camera. Buffer one
 * entity sample, and bound continuation if packets stop arriving. */
export function createRocketPresentation({
  now = () => performance.now(),
  groundHeight = () => 0,
  delayMs = MP_ENTITY_INTERPOLATION_MS,
}: { now?: () => number; groundHeight?: (x: number, z: number) => number; delayMs?: number } = {}) {
  let snapshot: RocketState | null = null,
    receivedAt = 0;
  return {
    accept(value: RocketState | null) {
      snapshot = value;
      receivedAt = now();
    },
    sample() {
      return sampleRocketPresentation(
        snapshot,
        (Math.min(Math.max(0, now() - receivedAt), delayMs + 50) - delayMs) / 1000,
        groundHeight,
      );
    },
    contentNodeId: 'multiplayer-actions.createRocketPresentation.node-1',
  };
}

/** Smooth server-authored vehicle/pose samples without advancing gameplay. */
export function interpolateGamePresentation<T>(
  previous: T | null | undefined,
  current: T,
  t: number,
  key?: string,
): T;
export function interpolateGamePresentation(
  previous: unknown,
  current: unknown,
  t: number,
  key = '',
): unknown {
  if (
    typeof current === 'number' &&
    typeof previous === 'number' &&
    Number.isFinite(current) &&
    Number.isFinite(previous)
  ) {
    const delta =
      key === 'angle' || key === 'heading'
        ? Math.atan2(Math.sin(current - previous), Math.cos(current - previous))
        : current - previous;
    return previous + delta * Math.max(0, Math.min(1, t));
  }
  if (
    !current ||
    typeof current !== 'object' ||
    Array.isArray(current) ||
    !previous ||
    typeof previous !== 'object'
  )
    return current;
  return Object.fromEntries(
    Object.entries(current).map(([k, v]) => [
      k,
      interpolateGamePresentation((previous as Record<string, unknown>)[k], v, t, k),
    ]),
  );
}

/** Buffer delivery samples on the render clock, including the last leg into the parked pose. */
export function createDeliveryPresentation(delayMs = MP_ENTITY_INTERPOLATION_MS + 50) {
  type Delivery = NonNullable<PersonalSnapshot['delivery']>;
  type Arrival = NonNullable<PersonalSnapshot['deliveryArrivals']>[number];
  type Motion = ReturnType<typeof createSnapshotMotion>;
  let moving: { source: Delivery; motion: Motion } | null = null;
  let parking: { arrival: Arrival; time: number; motion: Motion } | null = null;
  let arrivals: readonly Arrival[] = [];

  return {
    accept(delivery: PersonalSnapshot['delivery'], nextArrivals: readonly Arrival[], time: number) {
      if (delivery && delivery !== moving?.source) {
        const motion =
          moving && delivery.travel >= moving.source.travel
            ? moving.motion
            : createSnapshotMotion({ delayMs });
        motion.accept(
          { ...delivery.position, angle: delivery.angle, travel: delivery.travel },
          time,
        );
        moving = { source: delivery, motion };
      } else if (!delivery && moving) {
        const arrival = nextArrivals.find(({ expiresAt }) =>
          arrivals.every((previous) => previous.expiresAt !== expiresAt),
        );
        if (arrival) {
          moving.motion.accept({ ...arrival.position, angle: arrival.angle }, time);
          parking = { arrival, time, motion: moving.motion };
        }
        moving = null;
      }
      arrivals = nextArrivals;
    },
    sample(time: number) {
      if (parking && time >= parking.time + delayMs) parking = null;
      if (!moving && !parking) return arrivals;
      const coolers: (Pick<Delivery, 'position' | 'angle'> | Arrival)[] = arrivals.filter(
        (arrival) => arrival.expiresAt !== parking?.arrival.expiresAt,
      );
      for (const view of [moving, parking]) {
        const pose = view?.motion.sample(time);
        if (pose?.x !== undefined && pose.y !== undefined && pose.angle !== undefined)
          coolers.unshift({
            position: { x: pose.x, y: pose.y },
            angle: pose.angle,
          });
      }
      return coolers;
    },
    clear() {
      moving = parking = null;
      arrivals = [];
    },
  };
}

/** Input adapters and server-state application. Local controllers are read
 * models for the renderer, dialogue, wardrobe and quest journal. */
export function createMultiplayerActions({
  client,
  controllers,
  announce,
  onState = () => {},
}: MultiplayerActionsOptions) {
  const {
    strength,
    quests,
    sunglasses,
    tech,
    social,
    inebriation,
    fishing,
    expeditions,
    motorcycle,
    health,
    deli,
    aiLabJob,
    chase,
    monkeyKeeper,
  } = controllers;
  const pursuits = createPursuitPresentation({ police: chase, keeper: monkeyKeeper });
  const deliveryPresentation = createDeliveryPresentation();
  let krakenSource: PersonalSnapshot['kraken'];
  function request(verb: string, args: object = {}) {
    const promise = client.command('playerAction', { verb, ...args }).then((r) => {
      if (r.message) announce(r.message, r.ok ? 'You' : 'Server');
      return r;
    });
    return {
      ok: true,
      pending: true,
      message: contentText('world-message.src.multiplayer-actions.waiting-for-the-server'),
      promise,
    };
  }
  function apply(
    fields: Record<string, unknown> = {},
    state?: PersonalSnapshot,
    time = client.state.personalSampleAt ?? performance.now(),
  ) {
    const mapping: Record<string, { state: object }> = {
      'sf-strength-v1': strength,
      'sf-sunglasses-v1': sunglasses,
      'sf-tech-ventures-v1': tech,
      'sf-ai-lab-job-v1': aiLabJob,
      'sf-expeditions-v1': expeditions,
      'sf-motorcycle-v1': motorcycle,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'sf-quests-v1' && isRecord(value)) {
        const { theyLive, ...rest } = value;
        Object.assign(quests.state, rest);
        if (isRecord(theyLive)) Object.assign(quests.theyLive.state, theyLive);
      } else if (key === 'sf-inebriation-v1' && typeof value === 'number')
        inebriation.state.percent = value;
      else if (key === 'sf-ferrari-v1') controllers.ferrari?.applySaved(value);
      else if (mapping[key]) Object.assign(mapping[key].state, value);
      else if (key === 'sf-hitpoints-v1') Object.assign(health.state, value);
    }
    if (state) {
      deliveryPresentation.accept(state.delivery, state.deliveryArrivals ?? [], time);
      deli.state.arrivals = state.deliveryArrivals ?? [];
      if (state.fishing) {
        const { siteId, ...cast } = state.fishing;
        Object.assign(fishing.state, cast, {
          site: cast.active ? (controllers.fishingSite(siteId) ?? null) : null,
        });
      }
      if (state.delivery) {
        Object.assign(deli.state, state.delivery);
        deli.state.pending = true;
      } else if (deli.state.pending && !client.state.inventory?.deliveryPending) {
        deli.state.pending = false;
        deli.state.arrived = true;
      }
      const pitch = state.pitch;
      social.state.pitch = pitch
        ? {
            ...pitch,
            npc: controllers.merchants.find((n) => n.id === pitch.id) || {
              id: pitch.id,
            },
          }
        : null;
      pursuits.syncPersonal(state, time);
      if (state.ship) Object.assign(expeditions.ship, state.ship);
      if (state.kraken && state.kraken !== krakenSource) {
        krakenSource = state.kraken;
        const { clock, ...kraken } = state.kraken;
        Object.assign(expeditions.kraken, kraken, {
          animationSample: clock === undefined ? undefined : { clock, time },
        });
      }
      if (state.loot)
        expeditions.state.loot = [
          ...expeditions.state.loot.filter((n) => n.network),
          ...state.loot,
        ];
      if (state.vehicle && controllers.ferrari)
        controllers.ferrari.state.fuel = state.vehicle.fuel ?? controllers.ferrari.state.fuel;
    }
    onState(fields, state);
  }
  client.subscribe((message) => {
    if (message.type === 'instance' || message.type === 'welcome') {
      pursuits.clear();
      deliveryPresentation.clear();
      krakenSource = undefined;
      expeditions.kraken.visible = false;
      expeditions.kraken.animationSample = undefined;
    }
    if (message.type === 'playerState')
      apply(message.privateState, message.state, message.sampleTime);
    if (message.type === 'notice' && message.id !== 'server-update')
      announce(message.message, 'World');
    if (message.type === 'salesDecision') {
      announce(message.message, 'Software salesman');
      controllers.resolvePitch?.(message);
    }
  });
  const initial: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(client.state.privateState || {}))
    try {
      initial[key] = JSON.parse(value);
    } catch {}
  apply(initial, client.state.personal);
  return {
    request,
    apply,
    update: (connected: boolean) => pursuits.update(connected),
    deliveryCoolers: deliveryPresentation.sample,
  };
}
