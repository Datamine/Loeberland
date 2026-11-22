import { contentText } from '../src/content-runtime.ts';
import type { ServerPlayer, SimulationServices } from '../src/types/server.ts';
import { consumeWeaponShot, advanceAttackDeadline } from './combat-supplies.mts';
import {
  selectedWeapon,
  weaponAttackInterval,
  ITEM_STATS,
  ownedEquipmentDefense,
  recoilDamage,
} from '../src/item-stats.ts';
import { rollWeaponDamage } from '../src/combat.ts';
import { sameMapInstance } from '../src/map-instances.ts';

export const PVP_DISABLE_COOLDOWN = 30000;
export function createPvpCombat({
  players,
  now = Date.now,
  random = Math.random,
  geometry,
  send,
  dirty,
  onDeath,
  onCombatDamage = () => {},
}: Pick<SimulationServices, 'players' | 'now' | 'random' | 'geometry' | 'send' | 'dirty'> & {
  onDeath: (victim: ServerPlayer, killer: ServerPlayer) => void;
  onCombatDamage?: (player: ServerPlayer, damage: number) => void;
}) {
  const combatants = new Set<ServerPlayer>();
  function status(p: ServerPlayer) {
    return { enabled: !!p.profile.pvp?.enabled, disableAt: p.profile.pvp?.disableAt || 0 };
  }
  const available = (p: ServerPlayer) =>
    p &&
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.personalJailed &&
    !p.grappling &&
    !p.depotLaunch &&
    p.mode !== 'roof' &&
    p.mode !== 'atv' &&
    (p.instance?.kind || 'world') === 'world' &&
    !(
      ['hidden', 'rocket', 'gondola', 'climb', 'bomber', 'parachute', 'teleport'] satisfies [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    ).includes(p.mode);
  function setMode(p: ServerPlayer, enabled: unknown) {
    if (typeof enabled !== 'boolean')
      return {
        ok: false,
        message: contentText('world-message.server.pvp.choose-whether-pvp-is-enabled'),
      };
    const current = status(p);
    if (enabled === current.enabled) return { ok: true, pvp: current };
    if (!enabled && now() < current.disableAt)
      return {
        ok: false,
        pvp: current,
        message: contentText('world-message.server.pvp.wait-seconds-before-disabling-pvp', {
          value1: String(Math.ceil((current.disableAt - now()) / 1000)),
        }),
      };
    p.profile.pvp = { enabled, disableAt: enabled ? now() + PVP_DISABLE_COOLDOWN : 0 };
    p.revision++;
    if (!enabled) stop(p);
    dirty(p);
    return {
      ok: true,
      pvp: status(p),
      message: enabled
        ? contentText('world-message.server.pvp.pvp-enabled-you-can-disable-it-in-30-seconds')
        : contentText('world-message.server.pvp.pvp-disabled'),
    };
  }
  function weaponFor(p: ServerPlayer) {
    return selectedWeapon(p.appearance.weapon, p.inventory.economy.state);
  }
  function validate(
    p: ServerPlayer,
    target: ServerPlayer | undefined,
  ): { ok: true; target: ServerPlayer } | { ok: false; message: string } {
    if (!target || target === p || players.get(target.id) !== target)
      return {
        ok: false,
        message: contentText('world-message.server.pvp.that-player-is-no-longer-nearby'),
      };
    if (!sameMapInstance(p, target))
      return {
        ok: false,
        message: contentText('world-message.server.pvp.that-player-is-in-another-map-instance'),
      };
    if (!status(p).enabled || !status(target).enabled)
      return {
        ok: false,
        message: contentText('world-message.server.pvp.both-players-must-enable-pvp'),
      };
    if (!available(p) || !available(target))
      return {
        ok: false,
        message: contentText('world-message.server.pvp.that-player-cannot-fight-right-now'),
      };
    if ((target.pvpProtectedUntil || 0) > now())
      return {
        ok: false,
        message: contentText('world-message.server.pvp.that-player-has-just-respawned'),
      };
    return { ok: true, target };
  }
  function bindingTargets(p: ServerPlayer) {
    const onGround = (peer: ServerPlayer) =>
      !peer.airship &&
      ['walk', 'sit', 'bench', 'dance', 'train', 'construction'].includes(peer.mode);
    if (!available(p) || !onGround(p) || !status(p).enabled || (p.pvpProtectedUntil || 0) > now())
      return null;
    return [...players.values()].filter(
      (peer) =>
        Math.max(
          Math.abs(Math.floor(peer.x) - Math.floor(p.x)),
          Math.abs(Math.floor(peer.z) - Math.floor(p.z)),
        ) <= 1 &&
        onGround(peer) &&
        Math.abs(peer.y - p.y) < 1.35 &&
        validate(p, peer).ok,
    );
  }
  function publishHit(source: ServerPlayer, target: ServerPlayer, event: object) {
    for (const peer of players.values()) {
      if (
        peer === source ||
        peer === target ||
        (sameMapInstance(peer, target) && Math.hypot(peer.x - target.x, peer.z - target.z) < 42)
      )
        send(peer, event);
    }
  }
  function attack(p: ServerPlayer, id: unknown) {
    const candidate = typeof id === 'number' ? players.get(id) : undefined,
      allowed = validate(p, candidate);
    if (!allowed.ok) return allowed;
    const target = allowed.target,
      weapon = weaponFor(p),
      range = ITEM_STATS[weapon].range + 0.25;
    if (Math.hypot(p.x - target.x, p.z - target.z) > range + 0.05 || Math.abs(p.y - target.y) > 2.5)
      return {
        ok: false,
        code: 'range',
        message: contentText('world-message.server.pvp.move-closer-to-attack'),
      };
    if (
      geometry.lineClear &&
      !geometry.lineClear({ ...p, base: p.y }, { ...target, base: target.y })
    )
      return {
        ok: false,
        message: contentText('world-message.server.pvp.there-is-no-clear-line-of-attack'),
      };
    p.attack = null;
    p.pvpTarget = target.id;
    p.pvpNextHit = Math.max(now(), p.pvpNextHit || 0);
    combatants.add(p);
    return { ok: true, target: id, weapon };
  }
  function stop(p: ServerPlayer) {
    p.pvpTarget = null;
    combatants.delete(p);
  }
  function tick() {
    for (const p of combatants) {
      const candidate = p.pvpTarget == null ? undefined : players.get(p.pvpTarget),
        allowed = validate(p, candidate);
      if (players.get(p.id) !== p || !allowed.ok) {
        stop(p);
        continue;
      }
      const target = allowed.target,
        weapon = weaponFor(p),
        range = ITEM_STATS[weapon].range + 0.25;
      if (Math.hypot(p.x - target.x, p.z - target.z) > 38) {
        stop(p);
        continue;
      }
      if (
        Math.hypot(p.x - target.x, p.z - target.z) > range + 0.05 ||
        Math.abs(p.y - target.y) > 2.5 ||
        now() < (p.pvpNextHit || 0)
      )
        continue;
      if (
        geometry.lineClear &&
        !geometry.lineClear({ ...p, base: p.y }, { ...target, base: target.y })
      )
        continue;
      const supply = consumeWeaponShot(p, weapon);
      if (!supply.ok) {
        send(p, { type: 'notice', message: supply.message });
        stop(p);
        continue;
      }
      if (supply.spent) send(p, { type: 'inventory', inventory: p.inventory.snapshot() });
      p.pvpNextHit =
        advanceAttackDeadline(
          now() / 1000,
          (p.pvpNextHit || 0) / 1000,
          weaponAttackInterval(weapon, p.inventory.economy.state),
        ) * 1000;
      p.angle = Math.atan2(target.z - p.z, target.x - p.x);
      p.gesture = 'attack';
      p.gestureUntil = now() + 450;
      const damage = Math.min(
        target.hp,
        Math.max(
          0,
          rollWeaponDamage(
            p.level || 1,
            weapon,
            random,
            p.profile.playerState.conditions.inebriation,
          ) - ownedEquipmentDefense(target.inventory.economy.state, target.appearance),
        ),
      );
      target.hp -= damage;
      target.damagePending = true;
      onCombatDamage(p, damage);
      const event = {
        type: 'pvpHit',
        attacker: p.id,
        target: target.id,
        damage,
        hp: target.hp,
        max: target.max,
        weapon,
        from: { x: p.x, y: p.y + 1.14, z: p.z },
        to: { x: target.x, y: target.y + 1, z: target.z },
      };
      publishHit(p, target, event);
      dirty(target);
      const reflected = Math.min(
        p.hp,
        recoilDamage(target.inventory.economy.state, target.appearance, damage),
      );
      if (reflected) {
        p.hp -= reflected;
        p.damagePending = true;
        const counter = {
          ...event,
          attacker: target.id,
          target: p.id,
          damage: reflected,
          hp: p.hp,
          max: p.max,
          weapon: 'recoil-amulet',
          from: event.to,
          to: event.from,
        };
        publishHit(target, p, counter);
        dirty(p);
        if (!p.hp) {
          stop(p);
          stop(target);
          p.respawnAllowed = true;
          p.pvpDying = true;
          onDeath(p, target);
        }
      }
      if (target.hp === 0) {
        stop(target);
        stop(p);
        target.respawnAllowed = true;
        target.pvpDying = true;
        onDeath(target, p);
      }
    }
  }
  return { status, setMode, attack, stop, tick, weaponFor, combatants, bindingTargets };
}
