import { contentText } from '../src/content-runtime.ts';
import { requiredValue } from '../src/types/assert.ts';
import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';
import {
  TABLET_PLACES,
  GOBLIN_SCIENTIST_ID,
  TABLET_TELEPORT_SECONDS,
  tabletTeleportPose,
} from '../src/teleport-tablets.ts';
import { ITEM_STATS } from '../src/item-stats.ts';
import { nearbyServiceNPC } from '../src/interaction-access.ts';

export function createServerTablets({
  geometry,
  players,
  send,
  dirty,
  shared,
  pvp,
  now = Date.now,
}: Pick<SimulationServices, 'geometry' | 'players' | 'send' | 'dirty' | 'shared' | 'pvp' | 'now'>) {
  const travellers = new Set<ServerPlayer>();
  const available = (p: ServerPlayer) =>
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.personalJailed &&
    !p.bomberActive &&
    !p.airship &&
    !p.grappling &&
    !p.tabletTeleport &&
    (p.instance?.kind || 'world') === 'world' &&
    (['walk', 'dance', 'roll', 'train'] satisfies [string, string, string, string]).includes(
      p.mode,
    );
  function command(p: ServerPlayer, action: string, args: Record<string, unknown>) {
    const id = args.destination;
    if (typeof id !== 'string' || !TABLET_PLACES.includes(id))
      return {
        ok: false,
        message: contentText('world-message.server.teleport-tablets.that-tablet-is-unavailable'),
      };
    if (!available(p))
      return {
        ok: false,
        message: contentText(
          'world-message.server.teleport-tablets.stand-on-solid-ground-outside-custody-before-using-the-wizards',
        ),
      };
    const meta = p.inventory.meta;
    if (action === 'buyTablet') {
      const goblin = id === 'goblin-village';
      const vendor = goblin ? GOBLIN_SCIENTIST_ID : 'tablet-wizard';
      if (!nearbyServiceNPC(geometry, p, (n) => n.id === vendor))
        return {
          ok: false,
          message: goblin
            ? contentText(
                'world-message.server.teleport-tablets.visit-the-goblin-scientist-in-the-village',
              )
            : contentText(
                'world-message.server.teleport-tablets.visit-orin-the-wizard-inside-his-house-west-of-sand-hill-road',
              ),
        };
      const purse = p.inventory.economy.state,
        price = requiredValue(ITEM_STATS[id + '-tablet'].price, 'Missing tablet price.');
      if (purse.coins < price)
        return {
          ok: false,
          message: contentText('world-message.server.teleport-tablets.a-tablet-costs-coins', {
            price: String(price),
          }),
        };
      if (!Number.isSafeInteger(meta.tablets[id] + 1))
        return {
          ok: false,
          message: contentText('world-message.server.teleport-tablets.your-tablet-pouch-is-full'),
        };
      purse.coins -= price;
      meta.tablets[id]++;
      p.inventory.save();
      dirty(p);
      return {
        ok: true,
        inventory: p.inventory.snapshot(),
        message: contentText('world-message.server.teleport-tablets.you-buy-a-for-coins', {
          value1: String(ITEM_STATS[id + '-tablet'].name.toLowerCase()),
          price: String(price),
        }),
      };
    }
    const target = geometry.tabletDestinations?.[id];
    if (
      !target ||
      typeof target.y !== 'number' ||
      !geometry.landClearAt(target.x - 0.5, target.z - 0.5)
    )
      return {
        ok: false,
        message: contentText(
          'world-message.server.teleport-tablets.that-destination-is-temporarily-unavailable',
        ),
      };
    if (!meta.tablets[id])
      return {
        ok: false,
        message: contentText(
          'world-message.server.teleport-tablets.you-do-not-have-that-teleport-visit',
          {
            value1: String(id === 'goblin-village' ? 'the Goblin Scientist.' : 'Orin the Wizard.'),
          },
        ),
      };
    meta.tablets[id]--;
    p.inventory.save();
    shared.leave(p);
    pvp.stop(p);
    p.attack = null;
    p.tabletTeleport = {
      from: { x: p.x, y: p.y, z: p.z },
      to: { ...target, y: target.y },
      startedAt: now(),
      destination: id,
    };
    p.mode = 'teleport';
    p.moving = false;
    p.motion = 0;
    travellers.add(p);
    dirty(p);
    send(p, { type: 'tabletTeleport', flight: p.tabletTeleport });
    return {
      ok: true,
      inventory: p.inventory.snapshot(),
      message: contentText('world-message.server.teleport-tablets.you-break-a', {
        value1: String(ITEM_STATS[id + '-tablet'].name.toLowerCase()),
      }),
    };
  }
  function tick() {
    for (const p of travellers) {
      if (players.get(p.id) !== p || !p.tabletTeleport) {
        travellers.delete(p);
        continue;
      }
      const flight = p.tabletTeleport,
        seconds = (now() - flight.startedAt) / 1000;
      Object.assign(p, tabletTeleportPose(flight, seconds).position);
      dirty(p);
      if (seconds >= TABLET_TELEPORT_SECONDS) {
        p.tabletTeleport = null;
        p.mode = 'walk';
        p.lastPoseAt = now();
        travellers.delete(p);
        send(p, {
          type: 'tabletArrived',
          position: { ...flight.to },
          message: contentText('world-message.server.teleport-tablets.you-arrive', {
            value1: String(flight.to.label || 'at your destination'),
          }),
        });
      }
    }
  }
  return { command, tick };
}
