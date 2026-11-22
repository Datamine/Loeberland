import { WAYMO_RENTAL } from '../src/waymo-rental.ts';
import { contentText } from '../src/content-runtime.ts';
import type { WorldPoint } from '../src/types/geometry.ts';
import type { MovementRuntime } from '../src/types/movement.ts';
import type { ServerPlayer, SimulationServices } from '../src/types/server.ts';

export function createWaymoRental(
  {
    geometry,
    routes,
    now,
    send,
    dirty,
    following,
  }: Pick<SimulationServices, 'geometry' | 'routes' | 'now' | 'send' | 'dirty' | 'following'>,
  stop: (p: ServerPlayer) => void,
) {
  const { dispatch, price, speed, seconds, pickupRange } = WAYMO_RENTAL;
  const path = (from: WorldPoint, to: WorldPoint) => {
    const origin = { x: from.x - 0.5, y: from.z - 0.5 };
    return (routes ?? geometry).pathTo(to.x - 0.5, to.z - 0.5, origin, true);
  };
  const message = (id: string) => contentText('world-message.waymo.' + id);
  function endRide(p: ServerPlayer, s: MovementRuntime) {
    s.mode = p.mode = 'walk';
    stop(p);
    dirty(p);
  }
  function action(p: ServerPlayer, s: MovementRuntime, kind: unknown) {
    const cab = s.waymo;
    if (kind === 'waymoCall') {
      if (
        cab ||
        p.mode !== 'walk' ||
        p.training ||
        s.houseClimb ||
        !geometry.landClearAt(p.x - 0.5, p.z - 0.5)
      )
        return { ok: false, message: message('call-unavailable') };
      const purse = p.inventory.economy.state;
      if (purse.coins < price)
        return {
          ok: false,
          message: contentText('world-message.server.movement.you-need-coins', {
            price: String(price),
          }),
        };
      const route = path(dispatch, p);
      if (!route) return { ok: false, message: message('no-pickup-route') };
      purse.coins -= price;
      s.waymo = {
        ...dispatch,
        phase: 'dispatch',
        angle: -Math.PI / 2,
        expiresAt: 0,
        route: [...route],
        pickup: { x: p.x, z: p.z },
        rerouteAt: now() + 1500,
      };
      p.inventory.save();
      dirty(p);
      return { ok: true, inventory: p.inventory.snapshot(), message: message('dispatched') };
    }
    if (!cab || cab.expiresAt <= now()) return { ok: false };
    if (kind === 'waymoExit' && cab.phase === 'riding') {
      Object.assign(cab, { x: p.x, z: p.z, angle: p.angle, phase: 'parked' });
      endRide(p, s);
      return { ok: true };
    }
    if (kind !== 'waymoBoard' || cab.phase !== 'parked') return { ok: false };
    if (
      p.mode !== 'walk' ||
      s.houseClimb ||
      p.training ||
      Math.hypot(p.x - cab.x, p.z - cab.z) > pickupRange ||
      Math.abs(p.y - geometry.characterGround(cab.x, cab.z)) > 1.25
    )
      return { ok: false, message: message('walk-up') };
    following.stop(p);
    p.attack = null;
    p.personalBattle = null;
    stop(p);
    Object.assign(p, {
      x: cab.x,
      y: geometry.characterGround(cab.x, cab.z),
      z: cab.z,
      angle: cab.angle,
      phase: 0,
      mode: 'waymo',
    });
    s.mode = 'waymo';
    cab.phase = 'riding';
    dirty(p);
    return { ok: true };
  }

  function tick(p: ServerPlayer, s: MovementRuntime, dt: number) {
    const cab = s.waymo;
    if (!cab) return;
    if (cab.phase !== 'dispatch') {
      if (now() < cab.expiresAt) return;
      s.waymo = undefined;
      if (s.mode === 'waymo') endRide(p, s);
      send(p, { type: 'notice', message: message('expired') });
      return;
    }
    if (now() >= cab.rerouteAt && Math.hypot(p.x - cab.pickup.x, p.z - cab.pickup.z) > 1) {
      cab.rerouteAt = now() + 1500;
      const route = path(cab, p);
      if (route) {
        cab.route = [...route];
        cab.pickup = { x: p.x, z: p.z };
      }
    }
    let budget = dt * speed;
    while (budget > 0 && cab.route.length) {
      const next = cab.route[0];
      const dx = next.x + 0.5 - cab.x,
        dz = next.y + 0.5 - cab.z;
      const length = Math.hypot(dx, dz);
      const step = Math.min(length, budget);
      if (length > 1e-8) {
        cab.x += (dx * step) / length;
        cab.z += (dz * step) / length;
        cab.angle = Math.atan2(dz, dx);
        budget -= step;
      }
      if (length <= step + 1e-8) cab.route.shift();
    }
    if (cab.route.length) return;
    if (Math.hypot(p.x - cab.pickup.x, p.z - cab.pickup.z) > pickupRange) {
      const route = path(cab, p);
      if (route?.length) {
        cab.route = [...route];
        cab.pickup = { x: p.x, z: p.z };
        cab.rerouteAt = now() + 1500;
        return;
      }
    }
    cab.phase = 'parked';
    cab.expiresAt = now() + seconds * 1000;
    send(p, { type: 'notice', message: message('arrived') });
  }
  return { action, tick };
}
