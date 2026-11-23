import { requiredValue } from './types/assert.ts';
import { isFiniteNumber } from './types/json.ts';
interface ExpeditionDialogueController {
  state: ExpeditionState;
  ship: { aboard: boolean; phase: string };
  startQuest: () => ActionReceipt | Promise<ActionReceipt>;
  finishQuest: () => ActionReceipt | Promise<ActionReceipt>;
  returnShip: () => boolean | ActionReceipt | Promise<ActionReceipt>;
  board: () => ActionReceipt | Promise<ActionReceipt>;
}
import type { WorldPoint } from './types/geometry.ts';
import type { ExpeditionProgress } from './types/content.ts';
import type {
  ExpeditionState,
  ExpeditionPrey,
  ExpeditionOptions,
  ExpeditionLoot,
  ExpeditionEvent,
} from './types/expeditions.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import { MONSTER_STATS, rollMonsterDrops } from './monster-drops.ts';
import { ITEM_STATS, weaponOwned, isProjectileWeapon, weaponAttackInterval } from './item-stats.ts';
import { ENERGY_BOLT_SECONDS, MISSILE_EFFECT_SECONDS } from './config/gameplay.ts';
import { JURASSIC, cowSpawns, PEQUOD, KRAKEN_CAPE_TEXT } from './jurassic-layout.ts';
import { rollWeaponDamage, rollEnemyDamage } from './combat.ts';
import { groundItemDeadline, groundItemExpired } from './ground-items.ts';
import type { ActionReceipt, Actor, RuntimeDialogue } from './types/world.ts';

export const RAILGUN_RANGE = ITEM_STATS.railgun.range,
  RAILGUN_DAMAGE = 10,
  RAILGUN_INTERVAL = ITEM_STATS.railgun.interval;
function raptorDefeated(progress: Partial<ExpeditionProgress>) {
  return (
    progress.raptorDefeated === true ||
    progress.raptor === 'carrying' ||
    progress.raptor === 'completed'
  );
}
export function mayFireRailgun(progress: Partial<ExpeditionProgress>, atRaptor = false) {
  return raptorDefeated(progress) || (atRaptor && progress.raptor === 'escaped');
}
export function raptorCivilian(npc: Actor, now: number) {
  return (
    !npc.expeditionDead &&
    (npc.recoverAt === undefined || now >= npc.recoverAt + 5) &&
    !npc.child &&
    !npc.baby &&
    !npc.dogWalker &&
    !npc.stroller &&
    !npc.alienId &&
    (npc.label === 'Man' || npc.label === 'Woman')
  );
}
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.z - b.z);
/** Combat, drops and journeys use simulation time, not draw calls. Routes are
 * supplied by the production adjacency graph and refreshed at most twice/s. */
export function createExpeditions({
  saved = {},
  onSave = () => {},
  health,
  economy,
  food = () => {},
  level = () => 1,
  defense = () => 0,
  reflect = () => 0,
  inebriation = () => 0,
  sharedWorld = () => false,
  player = () => ({ x: 0, z: 0, base: 0, eligible: true }),
  pedestrians = () => [],
  routeTo = () => null,
  canTravel = () => false,
  lineClear = () => true,
  random = Math.random,
  now = Date.now,
  onEvent = () => {},
  consumeShot = () => ({ ok: true }),
}: ExpeditionOptions = {}) {
  const stages: readonly string[] = ['not-started', 'escaped', 'carrying', 'completed'];
  const state: ExpeditionState = {
    raptor:
      typeof saved.raptor === 'string' && stages.includes(saved.raptor)
        ? saved.raptor
        : 'not-started',
    raptorDefeated: raptorDefeated(saved),
    railgun: saved.railgun === true,
    armed: false,
    cape: saved.cape === true,
    krakenStarted:
      saved.krakenStarted === true || saved.krakenDefeated === true || saved.krakenReward === true,
    krakenDefeated: saved.krakenDefeated === true,
    krakenReward: saved.krakenReward === true,
    equipped: saved.equipped !== false,
    target: null,
    clock: 0,
    cooldown: 0,
    beams: [],
    splats: [],
    loot: [],
    victims: [],
  };
  if (!sharedWorld() && state.raptor !== 'not-started') state.railgun = true;
  const ownsWeapon = (weapon: string) =>
    weaponOwned(economy?.state, weapon) ||
    (!sharedWorld() && weapon === 'railgun' && state.railgun);
  const hasRailgun = () => ownsWeapon('railgun');
  if (state.krakenReward) {
    state.cape = true;
    state.krakenDefeated = true;
  }
  const raptor: Actor & {
    hp: number;
    max: number;
    path: WorldPoint[];
    replan: number;
    attackIn: number;
    prey: ExpeditionPrey | { isPlayer: boolean } | null;
    phase: string;
    release: number;
    angle: number;
  } = {
    id: 'jurassic-raptor',
    combatKind: 'raptor',
    label: contentText('jurassic.createExpeditions.label-1', {}),
    description: contentText('jurassic.createExpeditions.description-2', {}),
    x: JURASSIC.cage.x,
    z: JURASSIC.cage.z,
    hp: MONSTER_STATS.raptor.hp,
    max: MONSTER_STATS.raptor.hp,
    angle: Math.PI / 2,
    path: [],
    replan: 0,
    attackIn: 1,
    prey: null,
    phase:
      state.raptor === 'escaped' ? 'loose' : state.raptor === 'not-started' ? 'caged' : 'recovered',
    release: 0,
  };
  if (raptor.phase === 'loose') Object.assign(raptor, JURASSIC.exit);
  const cows = cowSpawns().map(
    (c): Actor & { homeX: number; homeZ: number; hp: number; max: number; respawn: number } => ({
      ...c,
      description: contentText('jurassic.createExpeditions.description-3', {}),
      homeX: c.x,
      homeZ: c.z,
      hp: MONSTER_STATS.cow.hp,
      max: MONSTER_STATS.cow.hp,
      respawn: 0,
    }),
  );
  const ship: {
    phase: string;
    home: WorldPoint | null;
    x: number;
    z: number;
    progress: number;
    attackIn: number;
    aboard: boolean;
    returnX?: number;
    angle?: number;
  } = {
    phase: 'moored',
    home: null,
    x: 0,
    z: PEQUOD.z,
    progress: 0,
    attackIn: 3.5,
    aboard: false,
  };
  const kraken: Actor & { hp: number; max: number; visible: boolean; enraged: boolean } = {
    id: 'pacific-kraken',
    combatKind: 'kraken',
    label: contentText('jurassic.createExpeditions.label-4', {}),
    description: contentText('jurassic.createExpeditions.description-5', {}),
    x: 0,
    z: PEQUOD.z,
    hp: MONSTER_STATS.kraken.hp,
    max: MONSTER_STATS.kraken.hp,
    visible: false,
    enraged: false,
  };
  let serial = 0;
  const save = () =>
    onSave({
      raptor: state.raptor,
      raptorDefeated: state.raptorDefeated,
      railgun: state.railgun,
      equipped: state.equipped,
      cape: state.cape,
      krakenStarted: state.krakenStarted,
      krakenDefeated: state.krakenDefeated,
      krakenReward: state.krakenReward,
    });
  const event = (
    type: string,
    message: string | null,
    extra: Omit<ExpeditionEvent, 'type' | 'message'> = {},
  ) => onEvent({ type, message, ...extra });
  const drop = (kind: string, x: number, z: number, amount = 1) => {
    const item = {
      id: 'expedition-loot-' + ++serial,
      kind: 'loot',
      lootKind: kind,
      label:
        kind === 'coins'
          ? contentText('jurassic.drop.label-6.yes', { v0: amount })
          : kind === 'sandwich'
            ? contentText('jurassic.drop.label-6.no.yes', {})
            : kind === 'raptor'
              ? contentText('jurassic.drop.label-6.no.no.yes', {})
              : contentText('jurassic.drop.label-6.no.no.no', {}),
      x,
      z,
      amount,
      ...groundItemDeadline(state.clock, now()),
      description:
        kind === 'raptor'
          ? 'The emergency recovery protocol is now considerably less mobile.'
          : kind === 'sandwich'
            ? 'A sandwich. Store it in your food bag and eat it to recover hitpoints.'
            : kind === 'kraken'
              ? KRAKEN_CAPE_TEXT
              : 'Loose coins, awaiting a less theoretical owner.',
    };
    state.loot.push(item);
    return item;
  };
  function dropMonster(kind: string, x: number, z: number) {
    // Keep the hunt reward on the open deck beside the hunter. At the
    // ship's center the mast hides the tiny loot mesh from the camera.
    if (kind === 'kraken') {
      x -= 0.8;
      z -= 0.6;
    }
    for (const record of rollMonsterDrops(kind, random))
      Object.assign(drop(record.lootKind, x, z, record.amount), record);
  }
  function markRaptorDefeated() {
    if (state.raptor !== 'escaped' || state.raptorDefeated) return false;
    state.raptorDefeated = true;
    save();
    return true;
  }
  function killRaptor() {
    if (raptor.phase !== 'loose') return;
    raptor.hp = 0;
    raptor.phase = 'dead';
    raptor.path = [];
    state.target = null;
    markRaptorDefeated();
    dropMonster('raptor', raptor.x, raptor.z);
    event('raptor-dead', contentText('world-message.src.jurassic.the-velociraptor-falls'));
  }
  function startQuest() {
    const retry =
      !sharedWorld() &&
      state.raptor === 'escaped' &&
      raptor.phase === 'dead' &&
      !state.loot.some(
        (item) => item.lootKind === 'raptor' && !groundItemExpired(item, state.clock, now()),
      );
    if (state.raptor !== 'not-started' && !retry)
      return {
        ok: false,
        message: contentText(
          'world-message.src.jurassic.your-recovery-assignment-is-already-in-the-quest-menu',
        ),
      };
    state.raptor = 'escaped';
    state.railgun = true;
    Object.assign(raptor, {
      x: JURASSIC.cage.x,
      z: JURASSIC.cage.z,
      hp: raptor.max,
      attackIn: 1,
      replan: 0,
    });
    raptor.phase = 'releasing';
    raptor.release = 0;
    raptor.prey = null;
    save();
    event(
      'released',
      contentText(
        'world-message.src.jurassic.the-scientist-hands-you-a-railgun-and-opens-the-cage-the-veloc',
      ),
    );
    return {
      ok: true,
      message: contentText(
        retry
          ? 'world-message.server.shared-world.the-gate-opens-follow-the-raptor-south-of-the-lab'
          : 'world-message.src.jurassic.railgun-issued-the-gate-is-opening-follow-the-velociraptor-sou',
      ),
    };
  }
  function recover() {
    if (state.raptor !== 'escaped' || !state.raptorDefeated || raptor.phase !== 'dead')
      return { ok: false };
    state.raptor = 'carrying';
    raptor.phase = 'recovered';
    state.loot = state.loot.filter((l) => l.lootKind !== 'raptor');
    save();
    return {
      ok: true,
      message: contentText('world-message.src.jurassic.you-recover-the-velociraptor-remains'),
    };
  }
  function finishQuest() {
    if (state.raptor !== 'carrying')
      return {
        ok: false,
        message: contentText('world-message.src.jurassic.recover-the-velociraptor-first'),
      };
    state.raptor = 'completed';
    save();
    return {
      ok: true,
      message: contentText(
        'world-message.src.jurassic.this-was-a-good-test-of-the-raptor-escape-and-emergency-recove',
      ),
    };
  }
  function setHarbor(home: WorldPoint) {
    ship.home = { ...home };
    ship.x = home.x;
    ship.z = home.z;
  }
  function board() {
    if (hasRailgun() && !state.raptorDefeated)
      return { ok: false, message: contentText('world-message.jurassic.railgun-on-loan') };
    if (!hasRailgun())
      return {
        ok: false,
        message: contentText(
          'world-message.src.jurassic.ahab-refuses-to-board-you-without-a-sufficiently-powerful-weap',
        ),
      };
    if (ship.aboard) return { ok: false };
    if (state.krakenReward)
      return {
        ok: false,
        message: contentText(
          'world-message.src.jurassic.ahab-is-still-writing-the-incident-report-you-already-claimed',
        ),
      };
    state.krakenStarted = true;
    save();
    ship.aboard = true;
    ship.phase = 'outbound';
    ship.progress = 0;
    ship.attackIn = 3.5;
    kraken.hp = MONSTER_STATS.kraken.hp;
    kraken.enraged = false;
    state.target = null;
    event(
      'boarded',
      contentText('world-message.src.jurassic.the-pequod-sets-sail-into-the-western-pacific'),
    );
    return { ok: true, message: contentText('world-message.src.jurassic.all-aboard-the-pequod') };
  }
  function returnShip() {
    if (!ship.aboard) return false;
    state.target = null;
    ship.phase = 'inbound';
    ship.progress = 0;
    ship.returnX = ship.x;
    kraken.visible = false;
    return true;
  }
  function abandonShip() {
    ship.aboard = false;
    ship.phase = 'moored';
    if (ship.home) {
      ship.x = ship.home!.x;
      ship.z = ship.home.z;
    }
    kraken.visible = false;
    state.target = null;
  }
  function collect(item: ExpeditionLoot) {
    if (!state.loot.includes(item) || groundItemExpired(item, state.clock, now()))
      return {
        ok: false,
        message: contentText('world-message.src.jurassic.that-loot-has-already-been-collected'),
      };
    if (item.lootKind === 'raptor') return recover();
    if (item.lootKind === 'coins') economy!.credit(item.amount);
    if (item.lootKind === 'sandwich') food(1);
    if (item.lootKind === 'kraken') {
      if (state.krakenReward) return { ok: false };
      economy!.credit(ITEM_STATS.kraken.coins);
      state.krakenReward = true;
      state.cape = true;
      save();
      event(
        'cape',
        contentText(
          'world-message.src.jurassic.you-collect-100-coins-and-a-commemorative-cape-equip-it-in-cha',
          { amount: String(ITEM_STATS.kraken.coins) },
        ),
      );
    }
    state.loot.splice(state.loot.indexOf(item), 1);
    return {
      ok: true,
      message:
        item.lootKind === 'sandwich'
          ? undefined
          : item.lootKind === 'kraken'
            ? contentText('world-message.src.jurassic.100-coins-and-one-lousy-cape', {
                amount: String(ITEM_STATS.kraken.coins),
              })
            : contentText('world-message.src.jurassic.you-pick-up-coins', {
                amount: String(item.amount),
              }),
    };
  }
  function shoot(
    target: Actor | null,
    origin = player(),
    weapon = state.weapon || 'railgun',
  ): { ok: boolean; message?: string; cooldown?: boolean; damage?: number } {
    if (ITEM_STATS[weapon]?.slot !== 'weapon')
      return {
        ok: false,
        message: contentText('world-message.src.jurassic.that-weapon-is-unavailable'),
      };
    if (!ownsWeapon(weapon))
      return {
        ok: false,
        message: contentText(
          'world-message.src.jurassic.you-do-not-have-a-suitable-weapon-equipped',
        ),
      };
    if (weapon === 'railgun' && !mayFireRailgun(state, target === raptor))
      return { ok: false, message: contentText('world-message.jurassic.railgun-on-loan') };
    if (state.cooldown > 1e-8) return { ok: false, cooldown: true };
    if (target?.combatKind === 'kraken') {
      if (!ship.aboard || ship.phase !== 'fighting')
        return {
          ok: false,
          message: contentText('world-message.src.jurassic.there-is-no-active-target'),
        };
      if (!isProjectileWeapon(weapon))
        return {
          ok: false,
          message: contentText('world-message.src.jurassic.equip-your-railgun-to-fight-the-kraken'),
        };
      // Shoot from the deck even during the tick that moves the ship into range.
      origin = { ...origin, x: ship.x, z: ship.z, base: PEQUOD.deck };
    }
    if (
      !target ||
      target.hp === 0 ||
      target.expeditionDead ||
      distance(origin, target) > (ITEM_STATS[weapon]?.range || 0) + 0.001 ||
      !lineClear(origin, target)
    )
      return { ok: false };
    if (target.combatKind === 'raptor' && raptor.phase !== 'loose')
      return {
        ok: false,
        message: contentText('world-message.src.jurassic.there-is-no-active-target'),
      };
    const supply = consumeShot(weapon);
    if (!supply.ok) {
      state.target = null;
      return supply;
    }
    state.weapon = weapon;
    state.cooldown = weaponAttackInterval(weapon, economy!.state) + Math.min(0, state.cooldown);
    const kind = target.combatKind || 'pedestrian',
      damage = (['spectre', 'pedestrian'] satisfies [string, string]).includes(kind)
        ? 0
        : Math.min(target.hp!, rollWeaponDamage(level(), weapon, random, inebriation()));
    if (isProjectileWeapon(weapon))
      state.beams.push({
        weapon,
        from: { x: origin.x, y: (origin.base || 0) + 1.14, z: origin.z },
        to: {
          x: target.x,
          y: (target.base || 0) + (target.combatKind === 'kraken' ? 1.35 : 0.9),
          z: target.z,
        },
        ttl: weapon === 'missile-launcher' ? MISSILE_EFFECT_SECONDS : ENERGY_BOLT_SECONDS,
      });
    state.splats.push({ target, damage, ttl: 0.8 });
    event('shot', null, {
      target,
      damage,
      hp: isFiniteNumber(target.hp) ? target.hp! - damage : 1,
      max: target.max || target.hp || 1,
    });
    if (kind === 'pedestrian') {
      state.target = null;
      event(
        'illegal',
        contentText(
          'world-message.src.jurassic.you-fire-at-a-pedestrian-the-police-are-on-their-way',
        ),
        { target },
      );
      return { ok: true, damage: 0 };
    }
    if (kind === 'spectre')
      return {
        ok: true,
        damage: 0,
        message: contentText('world-message.src.jurassic.0-the-blue-beam-passes-through-the-alien'),
      };
    damageTarget(target, damage);
    return { ok: true, damage };
  }
  function damageTarget(target: Actor, damage: number) {
    target.hp! -= damage;
    if (!target.hp) {
      if (target === raptor) killRaptor();
      else if (target.combatKind === 'cow') {
        target.respawn = MONSTER_STATS.cow.respawn;
        state.target = null;
        dropMonster('cow', target.x, target.z);
        event('cow-down', contentText('world-message.src.jurassic.the-cow-drops-a-sandwich'));
      } else if (target === kraken) {
        state.target = null;
        ship.phase = 'victory';
        state.krakenDefeated = true;
        save();
        dropMonster('kraken', ship.x, ship.z);
        event(
          'kraken-dead',
          contentText(
            'world-message.src.jurassic.the-kraken-sinks-beneath-the-waves-collect-its-spoils-from-the',
          ),
        );
      }
    }
  }
  function attack(target: Actor | null, weapon = 'railgun') {
    const result = shoot(target, player(), weapon);
    if (result.ok || result.cooldown) {
      state.target = target?.hp ? target : null;
      state.weapon = weapon;
    }
    return result;
  }
  function damagePlayer(amount: number, target: Actor) {
    const damage = health!.damage(rollEnemyDamage(amount, level(), random, defense()));
    event('damage', null, { damage, target, hp: health!.state.hp, max: health!.state.max });
    const reflected = Math.min(target.hp || 0, reflect(damage));
    if (reflected) {
      state.splats.push({ target, damage: reflected, ttl: 0.8 });
      event('shot', null, {
        target,
        damage: reflected,
        hp: target.hp! - reflected,
        max: target.max || target.hp,
      });
      damageTarget(target, reflected);
    }
    if (!health!.state.hp) {
      state.target = null;
      event('death', null);
    }
  }
  function advance(dt: number) {
    state.clock += dt;
    state.cooldown = Math.max(state.target ? -0.05 : 0, state.cooldown - dt);
    for (const b of state.beams) b.ttl -= dt;
    state.beams = state.beams.filter((b) => b.ttl > 0);
    for (const s of state.splats) s.ttl -= dt;
    state.splats = state.splats.filter((s) => s.ttl > 0);
    const lootTime = now();
    state.loot = state.loot.filter((item) => !groundItemExpired(item, state.clock, lootTime));
    for (const v of state.victims)
      if (v.until <= state.clock) {
        v.npc.expeditionDead = false;
        v.npc.hold = 0;
      }
    state.victims = state.victims.filter((v) => v.until > state.clock);
    if (!sharedWorld())
      for (const c of cows)
        if (!c.hp) {
          c.respawn = Math.max(0, c.respawn - dt);
          if (c.respawn <= 1e-8) {
            c.hp = c.max;
            event('cow-respawn', null);
          }
        }
    const p = player();
    p.isPlayer = true;
    if (ship.aboard) {
      if (ship.phase === 'outbound') {
        ship.progress = Math.min(1, ship.progress + dt / 6);
        const t = ship.progress * ship.progress * (3 - 2 * ship.progress);
        ship.x = ship.home!.x - PEQUOD.travel * t;
        if (ship.progress >= 1 - 1e-8) {
          ship.progress = 1;
          ship.phase = state.krakenDefeated ? 'victory' : 'fighting';
          kraken.visible = !state.krakenDefeated;
          kraken.x = ship.x - 4.4;
          kraken.z = ship.z;
          if (
            state.krakenDefeated &&
            !state.krakenReward &&
            !state.loot.some((l) => l.lootKind === 'kraken')
          )
            dropMonster('kraken', ship.x, ship.z);
          if (!state.krakenDefeated)
            event(
              'kraken-arrived',
              contentText(
                'world-message.src.jurassic.click-the-kraken-to-fire-stronger-hunters-hit-harder',
              ),
            );
        }
      } else if (ship.phase === 'inbound') {
        ship.progress = Math.min(1, ship.progress + dt / 5);
        ship.x = ship.returnX! + (ship.home!.x - ship.returnX!) * ship.progress;
        if (ship.progress >= 1 - 1e-8) {
          ship.progress = 1;
          abandonShip();
          event(
            'disembarked',
            contentText('world-message.src.jurassic.the-pequod-returns-you-to-the-beach'),
          );
        }
      } else if (ship.phase === 'fighting' && p.eligible) {
        const stats = MONSTER_STATS.kraken;
        if (!kraken.enraged && kraken.hp <= kraken.max * stats.enrageAt) {
          kraken.enraged = true;
          ship.attackIn = Math.min(ship.attackIn, stats.enrageInterval);
          event(
            'kraken-enraged',
            contentText(
              'world-message.src.jurassic.the-kraken-is-enraged-its-tentacles-strike-faster-and-harder',
            ),
          );
        }
        ship.attackIn -= dt;
        if (ship.attackIn <= 1e-8) {
          ship.attackIn += kraken.enraged ? stats.enrageInterval : stats.interval;
          damagePlayer(stats.damage + (kraken.enraged ? stats.enrageDamageBonus : 0), kraken);
        }
      }
    }
    if (
      state.target &&
      p.eligible &&
      state.cooldown <= 1e-8 &&
      (!sharedWorld() ||
        !(['cow', 'raptor'] satisfies [string, string]).includes(state.target.combatKind || ''))
    ) {
      if (
        state.target.combatKind === 'kraken' ||
        distance(p, state.target) <= (ITEM_STATS[state.weapon || 'railgun']?.range || 0) + 0.001
      ) {
        const result = shoot(state.target, p);
        if (!result.ok && !result.cooldown) state.target = null;
      } else state.target = null;
    }
    if (state.target?.combatKind === 'spectre' && p.eligible && distance(p, state.target) < 1.8) {
      state.spectreAttack = (state.spectreAttack || 0) + dt;
      if (state.spectreAttack >= 1.25) {
        state.spectreAttack = 0;
        damagePlayer(7, state.target);
      }
    }
    if (sharedWorld()) return;
    if (raptor.phase === 'releasing') {
      raptor.release = Math.min(1, raptor.release + dt);
      raptor.z = JURASSIC.cage.z + (JURASSIC.exit.z - JURASSIC.cage.z) * raptor.release;
      if (raptor.release >= 1 - 1e-8) {
        raptor.phase = 'loose';
        raptor.path = routeTo(raptor, JURASSIC.runout) || [];
        raptor.replan = raptor.path.length ? 2.5 : 0;
      }
      return;
    }
    if (raptor.phase !== 'loose') return;
    raptor.replan -= dt;
    raptor.attackIn = Math.max(0, raptor.attackIn - dt);
    if (raptor.replan <= 0) {
      raptor.replan = 0.6;
      const citizens = pedestrians().filter(
        (n) => raptorCivilian(n, state.clock) && distance(n, raptor) < 30,
      );
      citizens.sort((a, b) => distance(a, raptor) - distance(b, raptor));
      const candidates = [...citizens.slice(0, 4)];
      const nearbyPlayer = p.eligible && !ship.aboard && distance(p, raptor) < 8 ? [p] : [];
      raptor.prey = null;
      raptor.path = [];
      for (const candidate of [...candidates, ...nearbyPlayer]) {
        const path = routeTo(raptor, candidate);
        if (path) {
          raptor.prey = candidate;
          raptor.path = path;
          break;
        }
      }
    }
    let budget = dt * 5.1;
    while (budget > 0 && raptor.path.length) {
      const q = raptor.path[0],
        d = distance(raptor, q),
        step = Math.min(d, budget),
        next = {
          x: raptor.x + (q.x - raptor.x) * (d ? step / d : 0),
          z: raptor.z + (q.z - raptor.z) * (d ? step / d : 0),
        };
      if (!canTravel(raptor, next)) {
        raptor.path = [];
        raptor.replan = 0;
        break;
      }
      raptor.angle = Math.atan2(q.z - raptor.z, q.x - raptor.x);
      raptor.x = next.x;
      raptor.z = next.z;
      budget -= step;
      if (d <= step + 1e-8) raptor.path.shift();
    }
    const prey = raptor.prey;
    if (
      !prey ||
      !('x' in prey) ||
      distance(raptor, prey) > 1.15 ||
      raptor.attackIn > 0 ||
      prey.expeditionDead
    )
      return;
    raptor.attackIn = MONSTER_STATS.raptor.interval;
    if (prey === p || prey.isPlayer) {
      if (p.eligible && !ship.aboard && distance(raptor, p) < 1.3)
        damagePlayer(MONSTER_STATS.raptor.damage, raptor);
    } else {
      prey.expeditionDead = true;
      prey.recoverAt = state.clock + 35;
      prey.hold = 35;
      state.victims.push({ npc: prey, until: prey.recoverAt });
      drop('coins', prey.x, prey.z, 3 + Math.floor(random() * 5));
      event(
        'citizen-down',
        contentText(
          'world-message.src.jurassic.the-velociraptor-attacks-a-coins-fall-to-the-ground',
          { value1: String(prey.label!.toLowerCase()) },
        ),
      );
      raptor.replan = 0;
    }
  }
  function update(dt: unknown) {
    if (!isFiniteNumber(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 60);
    while (remaining > 1e-8) {
      const step = Math.min(0.05, remaining);
      advance(step);
      remaining -= step;
    }
  }
  function entries() {
    const result = [
      {
        id: 'jurassic-recovery',
        title: 'Jurassic Biosciences: Emergency Recovery',
        startLocation: 'Jurassic Biosciences (speak to the scientist)',
        stage: state.raptor === 'escaped' ? 'accepted' : state.raptor,
        status:
          state.raptor === 'not-started'
            ? 'Not started'
            : state.raptor === 'carrying'
              ? 'Ready to turn in'
              : state.raptor === 'completed'
                ? 'Complete'
                : 'In progress',
        description:
          state.raptor === 'not-started'
            ? contentText('jurassic.entries.description-8.yes', {})
            : state.raptor === 'escaped'
              ? contentText('jurassic.entries.description-8.no.yes', {})
              : state.raptor === 'carrying'
                ? contentText('jurassic.entries.description-8.no.no.yes', {})
                : contentText('jurassic.entries.description-8.no.no.no', {}),
        rewardLabel: 'Railgun',
      },
    ];
    result.push({
      id: 'pequod-kraken',
      title: 'Ahab’s Rather Easier Hunt',
      startLocation: 'the Pequod off Ocean Beach (speak to Captain Ahab)',
      stage: state.krakenReward ? 'completed' : state.krakenStarted ? 'accepted' : 'not-started',
      status: state.krakenReward ? 'Complete' : state.krakenStarted ? 'In progress' : 'Not started',
      description: state.krakenReward ? KRAKEN_CAPE_TEXT : 'You have joined Captain Ahab’s hunt.',
      rewardLabel: `${ITEM_STATS.kraken.coins} coins · commemorative cape`,
    });
    return result;
  }
  return {
    state,
    raptor,
    cows,
    ship,
    kraken,
    startQuest,
    recover,
    finishQuest,
    setHarbor,
    board,
    returnShip,
    abandonShip,
    collect,
    markRaptorDefeated,
    shoot,
    attack,
    update,
    entries,
    stop() {
      state.target = null;
    },
  };
}

export function scientistDialogue(
  npc: RuntimeDialogue | undefined,
  game: {
    state: Pick<ExpeditionState, 'raptor'>;
    startQuest: ExpeditionDialogueController['startQuest'];
    finishQuest: ExpeditionDialogueController['finishQuest'];
  },
) {
  const p = { ...npc, decline: contentText('jurassic.scientistDialogue.decline-10', {}) };
  if (game.state.raptor === 'not-started')
    return {
      ...p,
      intro: contentText('jurassic.scientistDialogue.intro-12', {}),
      question: contentText('jurassic.scientistDialogue.question-13', {}),
      choices: [
        {
          label: contentText('jurassic.scientistDialogue.choice-14', {}),
          contentNodeId: 'jurassic.scientistDialogue.node-11.choice',
          next: {
            contentNodeId: 'jurassic.scientistDialogue.briefing',
            intro: contentText('jurassic.scientistDialogue.briefing.intro', {}),
            decline: p.decline,
            choices: [
              {
                label: contentText('jurassic.scientistDialogue.briefing.accept', {}),
                contentNodeId: 'jurassic.scientistDialogue.briefing.choice',
                actionId: 'jurassic.scientistDialogue.action-15',
                accept: () => game.startQuest(),
              },
            ],
          },
        },
      ],
      contentNodeId: 'jurassic.scientistDialogue.node-11',
      introTextId: 'jurassic.scientistDialogue.intro-12',
      introTextValues: {},
      questionTextId: 'jurassic.scientistDialogue.question-13',
      questionTextValues: {},
    };
  if (game.state.raptor === 'carrying')
    return {
      ...p,
      intro: contentText('jurassic.scientistDialogue.intro-17', {}),
      question: contentText('jurassic.scientistDialogue.question-18', {}),
      choice: contentText('jurassic.scientistDialogue.choice-19', {}),
      accept: game.finishQuest,
      contentNodeId: 'jurassic.scientistDialogue.node-16',
      introTextId: 'jurassic.scientistDialogue.intro-17',
      introTextValues: {},
      questionTextId: 'jurassic.scientistDialogue.question-18',
      questionTextValues: {},
      choiceTextId: 'jurassic.scientistDialogue.choice-19',
      choiceTextValues: {},
      actionId: 'jurassic.scientistDialogue.action-20',
    };
  if (game.state.raptor === 'completed')
    return {
      ...p,
      intro: contentText('jurassic.scientistDialogue.intro-22', {}),
      question: contentText('jurassic.scientistDialogue.question-23', {}),
      choice: contentText('jurassic.scientistDialogue.choice-24', {}),
      receipt: contentText('jurassic.scientistDialogue.receipt-25', {}),
      contentNodeId: 'jurassic.scientistDialogue.node-21',
      introTextId: 'jurassic.scientistDialogue.intro-22',
      introTextValues: {},
      questionTextId: 'jurassic.scientistDialogue.question-23',
      questionTextValues: {},
      choiceTextId: 'jurassic.scientistDialogue.choice-24',
      choiceTextValues: {},
      receiptTextId: 'jurassic.scientistDialogue.receipt-25',
      receiptTextValues: {},
    };
  return {
    ...p,
    intro: contentText('jurassic.scientistDialogue.intro-27', {}),
    question: contentText('jurassic.scientistDialogue.question-28', {}),
    choice: contentText('jurassic.scientistDialogue.choice-29', {}),
    accept: () => game.startQuest(),
    actionId: 'jurassic.scientistDialogue.action-reopen-cage',
    contentNodeId: 'jurassic.scientistDialogue.node-26',
    introTextId: 'jurassic.scientistDialogue.intro-27',
    introTextValues: {},
    questionTextId: 'jurassic.scientistDialogue.question-28',
    questionTextValues: {},
    choiceTextId: 'jurassic.scientistDialogue.choice-29',
    choiceTextValues: {},
  };
}
export function ahabDialogue(
  npc: RuntimeDialogue | undefined,
  game: {
    state: Partial<Pick<ExpeditionState, 'krakenReward'>>;
    ship: { aboard: boolean; phase?: string };
    returnShip?: ExpeditionDialogueController['returnShip'];
    board: ExpeditionDialogueController['board'];
  },
  railgunEquipped: boolean,
) {
  if (game.ship.aboard)
    return {
      ...npc,
      intro:
        game.ship.phase === 'victory'
          ? contentText('jurassic.ahabDialogue.intro-32.yes', {})
          : contentText('jurassic.ahabDialogue.intro-32.no', {}),
      question: contentText('jurassic.ahabDialogue.question-33', {}),
      choice: contentText('jurassic.ahabDialogue.choice-34', {}),
      decline: contentText('jurassic.ahabDialogue.decline-35', {}),
      accept: () => {
        const result = requiredValue(game.returnShip, 'Aboard ship return action')();
        return typeof result === 'boolean'
          ? {
              ok: result,
              message: contentText(
                'world-message.src.jurassic.ahab-turns-the-pequod-toward-the-coast',
              ),
            }
          : result;
      },
      contentNodeId: 'jurassic.ahabDialogue.node-31',
      introTextId:
        game.ship.phase === 'victory'
          ? 'jurassic.ahabDialogue.intro-32.yes'
          : 'jurassic.ahabDialogue.intro-32.no',
      introTextValues: game.ship.phase === 'victory' ? {} : {},
      questionTextId: 'jurassic.ahabDialogue.question-33',
      questionTextValues: {},
      choiceTextId: 'jurassic.ahabDialogue.choice-34',
      choiceTextValues: {},
      declineTextId: 'jurassic.ahabDialogue.decline-35',
      declineTextValues: {},
      actionId: 'jurassic.ahabDialogue.action-36',
    };
  if (game.state.krakenReward)
    return {
      ...npc,
      intro: contentText('jurassic.ahabDialogue.intro-38', {}),
      choice: contentText('jurassic.ahabDialogue.choice-39', {}),
      receipt: contentText('jurassic.ahabDialogue.receipt-40', {}),
      contentNodeId: 'jurassic.ahabDialogue.node-37',
      introTextId: 'jurassic.ahabDialogue.intro-38',
      introTextValues: {},
      choiceTextId: 'jurassic.ahabDialogue.choice-39',
      choiceTextValues: {},
      receiptTextId: 'jurassic.ahabDialogue.receipt-40',
      receiptTextValues: {},
    };
  if (!railgunEquipped)
    return {
      ...npc,
      intro: contentText('jurassic.ahabDialogue.intro-42', {}),
      question: contentText('jurassic.ahabDialogue.question-43', {}),
      choice: contentText('jurassic.ahabDialogue.choice-44', {}),
      receipt: contentText('jurassic.ahabDialogue.receipt-45', {}),
      contentNodeId: 'jurassic.ahabDialogue.node-41',
      introTextId: 'jurassic.ahabDialogue.intro-42',
      introTextValues: {},
      questionTextId: 'jurassic.ahabDialogue.question-43',
      questionTextValues: {},
      choiceTextId: 'jurassic.ahabDialogue.choice-44',
      choiceTextValues: {},
      receiptTextId: 'jurassic.ahabDialogue.receipt-45',
      receiptTextValues: {},
    };
  return {
    ...npc,
    intro: contentText('jurassic.ahabDialogue.intro-47', {}),
    question: contentText('jurassic.ahabDialogue.question-48', {}),
    choice: contentText('jurassic.ahabDialogue.choice-49', {}),
    decline: contentText('jurassic.ahabDialogue.decline-50', {}),
    choices: [
      {
        label: contentText('jurassic.ahabDialogue.label-52', {}),
        next: {
          intro: contentText('jurassic.ahabDialogue.intro-54', {}),
          question: contentText('jurassic.ahabDialogue.question-55', {}),
          choice: contentText('jurassic.ahabDialogue.choice-56', {}),
          choices: undefined,
          decline: contentText('jurassic.ahabDialogue.decline-57', {}),
          accept: () => game.board(),
          contentNodeId: 'jurassic.ahabDialogue.node-53',
          introTextId: 'jurassic.ahabDialogue.intro-54',
          introTextValues: {},
          questionTextId: 'jurassic.ahabDialogue.question-55',
          questionTextValues: {},
          choiceTextId: 'jurassic.ahabDialogue.choice-56',
          choiceTextValues: {},
          declineTextId: 'jurassic.ahabDialogue.decline-57',
          declineTextValues: {},
          actionId: 'jurassic.ahabDialogue.action-58',
        },
        contentNodeId: 'jurassic.ahabDialogue.node-51',
        labelTextId: 'jurassic.ahabDialogue.label-52',
        labelTextValues: {},
      },
    ],
    contentNodeId: 'jurassic.ahabDialogue.node-46',
    introTextId: 'jurassic.ahabDialogue.intro-47',
    introTextValues: {},
    questionTextId: 'jurassic.ahabDialogue.question-48',
    questionTextValues: {},
    choiceTextId: 'jurassic.ahabDialogue.choice-49',
    choiceTextValues: {},
    declineTextId: 'jurassic.ahabDialogue.decline-50',
    declineTextValues: {},
  };
}
