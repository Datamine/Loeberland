import { LAB_ENTRANCE, LAB_FLOOR, LAB_INSTANCE } from '../src/berkeley-lab.ts';
import {
  GOBLIN_CITY_HALL, INCUBATOR_CAVE, INCUBATOR_ENTRANCE, INCUBATOR_FLOOR,
} from '../src/goblin-incubator-cave.ts';
import { HOT_TRAPDOOR } from '../src/berkeley-campus.ts';
import { contentText } from '../src/content-runtime.ts';
import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';
import { equipmentOwned, selectedWeapon } from '../src/item-stats.ts';
import { mayFireRailgun } from '../src/jurassic.ts';
import {
  PUBLIC_INSTANCE,
  ILLUMINATI_INSTANCE,
  privateMapInstance,
  ILLUMINATI_CAVE,
  ILLUMINATI_PRICE,
  guildSecretSites,
} from '../src/map-instances.ts';
import { insideGuild } from '../src/guild.ts';
import { fighterYardMayEnter } from './fighter-yard.mts';
import { guildMayEnter } from './guild.mts';
import { PEQUOD } from '../src/jurassic-layout.ts';
import {
  BOMBER_LAUNCH,
  BOMBER_REPLACEMENT_MESSAGE,
  BOMB_COOLDOWN_MS,
  BOMB_FALL_MS,
  bombTileArea,
  bomberFlightHeight,
  bomberCruiseHeight,
  bomberLanding,
  createBomberDescent,
  bomberDescentPoint,
} from '../src/stealth-bomber.ts';

export function createServerInstances({
  geometry,
  shared,
  pvp,
  players,
  send,
  dirty,
  now = Date.now,
}: Pick<SimulationServices, 'geometry' | 'shared' | 'pvp' | 'players' | 'send' | 'dirty' | 'now'>) {
  const bombs = new Set<
    import('../src/types/aircraft.ts').BombFlight & { owner?: string | null }
  >();
  let serial = 0;
  const lodge = geometry.places?.find((p) => p.id === 'freemasons-guild'),
    secret = guildSecretSites(lodge);
  const kind = (p: ServerPlayer) => p.instance?.kind || 'world',
    alive = (p: ServerPlayer) => p.hp > 0 && !p.respawnAllowed && !p.personalJailed;
  const bomberStatus = (p: ServerPlayer) => ({
    owned: p.profile.bomber === true,
    active: !!p.bomberActive,
    readyAt: p.profile.bombReadyAt || 0,
  });
  const position = (p: ServerPlayer) => ({ x: p.x, y: p.y, z: p.z, angle: p.angle, hp: p.hp });
  function savePosition(p: ServerPlayer) {
    if (p.tabletTeleport) return { ...p.tabletTeleport.to, hp: p.hp, angle: p.angle };
    return kind(p) !== 'world' || p.bomberActive
      ? { ...(p.instanceReturn || position(p)), hp: p.hp }
      : position(p);
  }
  function transition(
    p: ServerPlayer,
    instance: import('../src/types/server.ts').MapInstance,
    to: import('../src/types/server.ts').NetworkPosition,
  ) {
    shared.leave(p);
    pvp.stop(p);
    p.attack = null;
    p.instance = instance;
    p.seen.clear();
    p.sharedVersions.clear();
    p.npcVersions.clear();
    Object.assign(p, to, {
      moving: false,
      motion: 0,
      lastPoseAt: now(),
      mode: p.bomberActive ? 'bomber' : 'walk',
    });
    p.revision++;
    p.entityVersions = {};
    p.globalVersions = {};
    p.poseVersions = new Map();
    p.seen = new Map();
    dirty(p);
    send(p, {
      type: 'instance',
      instance,
      position: position(p),
      bomber: bomberStatus(p),
      illuminati: p.profile.illuminati === true,
    });
  }
  function reset(
    p: ServerPlayer,
    to: import('../src/types/server.ts').NetworkPosition | null = null,
  ) {
    p.bomberActive = false;
    p.parachute = null;
    transition(p, PUBLIC_INSTANCE, to || p.instanceReturn || position(p));
    p.instanceReturn = null;
  }
  function command(p: ServerPlayer, action: string, args: { kind?: string } = {}) {
    if (action === 'joinIlluminati') {
      if (
        !alive(p) ||
        kind(p) !== 'world' ||
        !p.profile.guild?.member ||
        !secret ||
        !insideGuild(lodge, p.x, p.z) ||
        Math.hypot(p.x - secret.oldMan.x, p.z - secret.oldMan.z) > 2.4
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.instances.speak-to-the-old-man-inside-the-freemasons-guild',
          ),
        };
      if (p.profile.illuminati)
        return {
          ok: true,
          illuminati: true,
          message: contentText(
            'world-message.server.instances.you-are-already-initiated-the-underground-passage-is-open-to-y',
          ),
        };
      const purse = p.inventory.economy.state;
      if (purse.coins < ILLUMINATI_PRICE)
        return {
          ok: false,
          message: contentText(
            'world-message.server.instances.initiation-costs-250-000-coins-the-old-man-does-not-accept-ins',
          ),
        };
      purse.coins -= ILLUMINATI_PRICE;
      p.inventory.save();
      p.profile.illuminati = true;
      dirty(p);
      return {
        ok: true,
        illuminati: true,
        inventory: p.inventory.snapshot(),
        message: contentText(
          'world-message.server.instances.the-old-man-accepts-250-000-coins-you-join-the-illuminati-take',
        ),
      };
    }
    if (action === 'instanceEnter') {
      if (kind(p) !== 'world' && kind(p) === args.kind) return { ok: true };
      if (!alive(p) || kind(p) !== 'world' || p.bomberActive) return { ok: false };
      if (args.kind === INCUBATOR_CAVE.kind) {
        const clerk = geometry.merchants?.find((npc) => npc.id === GOBLIN_CITY_HALL.clerk.id);
        if (!clerk || Math.hypot(p.x - clerk.x, p.z - clerk.z) >= GOBLIN_CITY_HALL.clerkRange ||
            geometry.canTravel?.(p.x - 0.5, p.z - 0.5, clerk.x - 0.5, clerk.z - 0.5, true) === false)
          return { ok: false, message: 'Walk up to the Goblin City Hall Clerk.' };
        const purse = p.inventory.economy.state;
        const fee = GOBLIN_CITY_HALL.fishFee;
        if (purse.fish < fee) return { ok: false, message: `The clerk wants ${fee} live fish.` };
        purse.fish -= fee;
        p.inventory.save();
        p.instanceReturn = position(p);
        transition(p, INCUBATOR_CAVE, { ...INCUBATOR_ENTRANCE, y: INCUBATOR_FLOOR + 0.025 });
        return {
          ok: true,
          message: `You hand the clerk ${fee} live fish and enter Goblin City Hall.`,
          inventory: p.inventory.snapshot(),
        };
      }
      if (args.kind === LAB_INSTANCE.kind) {
        const trapdoor = geometry.sights?.find((sight) => sight.id === HOT_TRAPDOOR)?.entry;
        if (!trapdoor || Math.hypot(p.x - trapdoor.x - 0.5, p.z - trapdoor.y - 0.5) > 0.85)
          return { ok: false, message: contentText('world-message.berkeley-lab.approach') };
        const purse = p.inventory.economy.state;
        if (
          !p.appearance.iceTop ||
          !p.appearance.icePants ||
          !equipmentOwned(purse, 'ice-top') ||
          !equipmentOwned(purse, 'ice-pants')
        )
          return { ok: false, message: contentText('world-message.berkeley-lab.too-hot') };
        p.instanceReturn = position(p);
        transition(p, LAB_INSTANCE, { ...LAB_ENTRANCE, y: LAB_FLOOR + 0.025 });
        return { ok: true };
      }
      if (args.kind === 'illuminati') {
        if (
          !p.profile.illuminati ||
          !secret ||
          Math.hypot(p.x - secret.portal.x, p.z - secret.portal.z) > 2.2 ||
          !insideGuild(lodge, p.x, p.z)
        )
          return {
            ok: false,
            message: contentText(
              'world-message.server.instances.join-the-illuminati-with-the-old-man-then-use-the-stairway-ins',
            ),
          };
        p.instanceReturn = position(p);
        transition(p, ILLUMINATI_INSTANCE, {
          ...ILLUMINATI_CAVE.entrance,
          y: ILLUMINATI_CAVE.floor + 0.025,
        });
        return {
          ok: true,
          message: contentText(
            'world-message.server.instances.you-descend-below-the-guild-into-the-underground-hangar',
          ),
        };
      }
      if (args.kind === 'kraken') {
        const captain = geometry.merchants?.find((n) => n.id === 'captain-ahab'),
          home = geometry.expeditions?.ship.home;
        const expedition = p.profile.playerState.quests.expeditions;
        if (!captain || !home || Math.hypot(p.x - captain.x, p.z - captain.z) > 3)
          return {
            ok: false,
            message: contentText(
              'world-message.server.instances.board-with-captain-ahab-on-the-beach-carrying-your-railgun',
            ),
          };
        if (expedition.krakenReward)
          return {
            ok: false,
            message: contentText(
              'world-message.server.instances.you-have-already-claimed-the-krakens-spoils-ahab-is-still-writ',
            ),
          };
        if (selectedWeapon(p.appearance.weapon, p.inventory.economy.state) !== 'railgun')
          return { ok: false, message: contentText('world-message.jurassic.equip-railgun-to-board') };
        if (!mayFireRailgun(expedition))
          return { ok: false, message: contentText('world-message.jurassic.railgun-on-loan') };
        p.instanceReturn = position(p);
        transition(p, privateMapInstance('kraken', p.owner, home), {
          ...position(p),
          x: home.x,
          y: PEQUOD.deck,
          z: home.z,
        });
        return {
          ok: true,
          message: contentText(
            'world-message.server.instances.the-pequod-enters-your-private-kraken-hunting-waters',
          ),
        };
      }
      return {
        ok: false,
        message: contentText('world-message.server.instances.unknown-map-instance'),
      };
    }
    if (action === 'instanceLeave') {
      if (kind(p) === 'world')
        return {
          ok: false,
          message: contentText('world-message.server.instances.you-are-already-in-the-city'),
        };
      if (
        kind(p) === 'illuminati' &&
        Math.hypot(p.x - ILLUMINATI_CAVE.entrance.x, p.z - ILLUMINATI_CAVE.entrance.z) > 2.2
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.instances.use-the-stairs-at-the-southern-end-of-the-cave',
          ),
        };
      if (
        kind(p) === LAB_INSTANCE.kind &&
        Math.hypot(p.x - LAB_ENTRANCE.x, p.z - LAB_ENTRANCE.z) > 1.5
      )
        return { ok: false, message: contentText('world-message.berkeley-lab.use-stairs') };
      if (kind(p) === INCUBATOR_CAVE.kind) {
        if (Math.hypot(p.x - INCUBATOR_ENTRANCE.x, p.z - INCUBATOR_ENTRANCE.z) > 1.5)
          return { ok: false, message: 'Return to the City Hall stairs to leave.' };
        reset(p);
        return { ok: true, message: 'You climb back out of Goblin City Hall.' };
      }
      reset(p);
      return {
        ok: true,
        message: contentText('world-message.server.instances.you-return-to-the-city'),
      };
    }
    if (action === 'bomberBoard') {
      if (
        !alive(p) ||
        !p.profile.illuminati ||
        kind(p) !== 'illuminati' ||
        Math.hypot(p.x - ILLUMINATI_CAVE.boarding.x, p.z - ILLUMINATI_CAVE.boarding.z) > 3
      )
        return {
          ok: false,
          message: contentText(
            'world-message.server.instances.walk-to-your-b-2-in-the-underground-hangar',
          ),
        };
      p.profile.bomber = true;
      p.bomberActive = true;
      transition(p, PUBLIC_INSTANCE, {
        ...BOMBER_LAUNCH,
        y: bomberFlightHeight(
          BOMBER_LAUNCH.x,
          BOMBER_LAUNCH.z,
          geometry.characterGround,
          bomberCruiseHeight(geometry.airship?.cruiseHeight),
        ),
        angle: 0,
      });
      return {
        ok: true,
        bomber: bomberStatus(p),
        message: contentText(
          'world-message.server.instances.you-take-your-personal-b-2-out-over-the-pacific-click-to-fly-h',
        ),
      };
    }
    if (action === 'bomberReturn') {
      if (!alive(p) || !p.bomberActive || p.parachute || !p.profile.illuminati)
        return {
          ok: false,
          message: contentText('world-message.server.instances.you-are-not-flying-your-b-2'),
        };
      p.bomberActive = false;
      transition(p, ILLUMINATI_INSTANCE, {
        ...ILLUMINATI_CAVE.boarding,
        y: ILLUMINATI_CAVE.floor + 0.025,
      });
      return {
        ok: true,
        bomber: bomberStatus(p),
        message: contentText(
          'world-message.server.instances.your-b-2-returns-to-its-underground-hangar',
        ),
      };
    }
    if (action === 'bomberEject') {
      if (!alive(p) || !p.bomberActive || p.parachute || !p.profile.bomber)
        return {
          ok: false,
          message: contentText('world-message.server.instances.you-are-not-flying-your-b-2'),
        };
      const to = bomberLanding(p.x, p.z, {
        free: (x: number, z: number) =>
          geometry.landClearAt(x - 0.5, z - 0.5) &&
          guildMayEnter(p, geometry, x, geometry.characterGround(x, z), z) &&
          fighterYardMayEnter(p, x, z),
        ground: geometry.characterGround,
        fallback: { x: geometry.spawn.x + 0.5, z: geometry.spawn.y + 0.5 },
      });
      if (!to)
        return {
          ok: false,
          message: contentText(
            'world-message.server.instances.fly-closer-to-land-before-parachuting-out',
          ),
        };
      const flight = createBomberDescent(position(p), to, p.angle),
        impact = { x: p.x + Math.cos(p.angle) * 30, z: p.z + Math.sin(p.angle) * 30 },
        crash = {
          from: position(p),
          heading: p.angle,
          to: { ...impact, y: geometry.characterGround(impact.x, impact.z) },
        };
      p.parachute = { ...flight, startedAt: now() };
      p.instanceReturn = { ...to, angle: p.angle, hp: p.hp };
      p.mode = 'parachute';
      p.moving = false;
      p.motion = 0;
      p.attack = null;
      pvp.stop(p);
      dirty(p);
      for (const observer of players.values())
        if (
          kind(observer) === 'world' &&
          (observer === p || Math.hypot(observer.x - p.x, observer.z - p.z) < 80)
        )
          send(observer, { type: 'bomberEjected', player: p.id, flight, crash });
      return {
        ok: true,
        bomber: bomberStatus(p),
        message: contentText(
          'world-message.server.instances.you-parachute-out-as-the-b-2-flies-on-to-a-spectacularly-small',
          { BOMBER_REPLACEMENT_MESSAGE: String(BOMBER_REPLACEMENT_MESSAGE) },
        ),
      };
    }
    if (action === 'bomberBomb') {
      if (
        !alive(p) ||
        !p.bomberActive ||
        p.parachute ||
        !p.profile.bomber ||
        kind(p) !== 'world' ||
        p.mode !== 'bomber'
      )
        return {
          ok: false,
          message: contentText('world-message.server.instances.board-your-personal-b-2-first'),
        };
      if (now() < (p.profile.bombReadyAt || 0))
        return {
          ok: false,
          bomber: bomberStatus(p),
          message: contentText('world-message.server.instances.bomb-bay-reloading-seconds', {
            value1: String(Math.ceil((p.profile.bombReadyAt - now()) / 1000)),
          }),
        };
      const area = bombTileArea(p.x, p.z),
        bomb = {
          id: ++serial,
          owner: p.owner,
          attacker: p.id,
          from: { x: p.x, y: p.y, z: p.z },
          ...area,
          impactAt: now() + BOMB_FALL_MS,
        };
      bombs.add(bomb);
      p.profile.bombReadyAt = now() + BOMB_COOLDOWN_MS;
      dirty(p);
      for (const observer of players.values())
        if (
          kind(observer) === 'world' &&
          (observer === p || Math.hypot(observer.x - area.x, observer.z - area.z) < 60)
        )
          send(observer, { type: 'bombLaunched', bomb: { ...bomb, owner: undefined } });
      return {
        ok: true,
        bomber: bomberStatus(p),
      };
    }
    return {
      ok: false,
      message: contentText('world-message.server.instances.unknown-instance-action'),
    };
  }
  function tick() {
    for (const p of players.values())
      if (p.parachute) {
        const flight = p.parachute,
          elapsed = (now() - flight.startedAt) / 1000;
        Object.assign(p, bomberDescentPoint(flight, elapsed));
        dirty(p);
        if (elapsed >= flight.duration) {
          reset(p, { ...flight.to, angle: flight.heading });
          send(p, {
            type: 'bomberLanded',
            message: contentText('world-message.server.instances.you-land-gently', {
              BOMBER_REPLACEMENT_MESSAGE: String(BOMBER_REPLACEMENT_MESSAGE),
            }),
          });
        }
      }
    for (const bomb of bombs)
      if (now() >= bomb.impactAt) {
        bombs.delete(bomb);
        shared.bombCreatures(bomb);
      }
  }
  return { command, transition, reset, savePosition, bomberStatus, tick, kind };
}
