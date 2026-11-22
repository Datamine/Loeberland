import { TRAMPOLINE } from '../src/backyard-details.ts';
import { contentText } from '../src/content-runtime.ts';
import { BURNING_MAN, burningManStrawAt, type BurningManProgress } from '../src/burning-man.ts';
import { isFiniteNumber, isRecord } from '../src/types/json.ts';
import type { PlayerRuntime } from '../src/types/player-runtime.ts';
import type { Point } from '../src/types/geometry.ts';

import type { SimulationServices, ServerPlayer } from '../src/types/server.ts';
import {
  BATTERY_SHOTS,
  consumeWeaponShot,
  combatSupplyAction,
  railgunRestriction,
} from './combat-supplies.mts';
import { createPlayerComponents } from './player-components.mts';
import { PROGRESSION } from '../src/config/progression.ts';
import { skillStatus, hitpointMaximum, playerLevel } from '../src/progression.ts';
import {
  chairForGesture,
  FACTORY_CHAIRS,
  FACTORY_CHAIR_BUY,
  FACTORY_CHAIR_SELL,
  GOBLIN_INCUBATOR,
} from '../src/goblin-town.ts';
import {
  GOBLIN_INDUSTRIALIST,
  GOBLIN_PHONE_BUYER,
  GOBLIN_PHONE_RESALE,
  CLOTHIER_ITEMS,
  ROBE_SELLER,
} from '../src/goblin-industrialist.ts';
import { FIGHTER_YARD } from '../src/fighter-yard-layout.ts';
import { CONSTRUCTION_SITE } from '../src/construction-layout.ts';
import {
  FISH_PER_MUD,
  GOBLIN_MUD_REWARD_AT,
  GOBLIN_SPACE_PROGRAM,
  GOOSE_CORP_SHIRT,
  MUD_BATH,
} from '../src/goblin-space-layout.ts';
import { isTahoePelt, TAHOE_PELT_PRICES } from '../src/config/tahoe-pelts.ts';
import { hasFighterYardPass } from './fighter-yard.mts';
import { GAMEPLAY } from '../src/config/gameplay.ts';
import { createStrength } from '../src/strength.ts';
import { createQuestLog } from '../src/quests.ts';
import { PARROT_SCIENTIST, proofPrice } from '../src/stochastic-parrot.ts';
import { createSunglasses } from '../src/sunglasses.ts';
import { createInebriation } from '../src/inebriation.ts';
import { createTechVentures } from '../src/tech-ventures.ts';
import { createSocialBusiness } from '../src/sales-conference.ts';
import { AI_LAB_PAY_INTERVAL, createAILabJob, createArithmeticInterview } from '../src/ai-lab.ts';
import { createFishing } from '../src/fishing.ts';
import { createDeli } from '../src/deli.ts';
import { createAlienBattle } from '../src/combat.ts';
import { createExpeditions } from '../src/jurassic.ts';
import { createMonkeyPursuit } from '../src/monkey-escape.ts';
import { createPoliceChase } from '../src/encounters.ts';
import { PEQUOD } from '../src/jurassic-layout.ts';
import { SF_FITNESS } from '../src/southern-layout.ts';
import { gymExercise, gymExercisePosition } from '../src/gym-exercises.ts';
import { CAPTURE_DURATION } from '../src/capture-animation.ts';
import {
  ITEM_STATS,
  equipmentOwned,
  ownedEquipmentDefense,
  recoilDamage,
  sandwichCapacity,
  weaponAttackInterval,
  weaponOwned,
} from '../src/item-stats.ts';
import { nearbyServiceNPC, fuelCarInRange } from '../src/interaction-access.ts';
import { NEIGHBORHOOD_SERVICES } from '../src/config/neighborhood-services.ts';
import { scrambleAppearance } from '../src/rehabilitation.ts';
import type { Actor } from '../src/types/world.ts';

const parse = (
  v: string | undefined,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(v || '{}');
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const deny = (message: string) => ({ ok: false, message });
/** Per-player domain controllers. Their clocks advance on the server even
 * when the browser is backgrounded. The client cannot submit balances, XP,
 * quest flags, enemy HP, interview scores or elapsed time. */
const CONSTRUCTION_PAY_INTERVAL = AI_LAB_PAY_INTERVAL * 10;
const CONSTRUCTION_SHIFT_SECONDS = 30 * 60;
const CONSTRUCTION_COOLDOWN_MS = 60 * 60 * 1000;
const CONSTRUCTION_TIME_EPSILON = 1e-6;

export function createPlayerState({
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
}: Pick<
  SimulationServices,
  | 'geometry'
  | 'routes'
  | 'shared'
  | 'players'
  | 'send'
  | 'dirty'
  | 'now'
  | 'random'
  | 'movement'
  | 'instances'
>) {
  const routeTo = (...args: Parameters<SimulationServices['routes']['pathTo']>) =>
    routes ? routes.pathTo(...args) : geometry.pathTo(...args);
  const runtimes = new Map<number, PlayerRuntime>();
  const componentSnapshots = createPlayerComponents({ movement, shared });
  const eligible = (p: ServerPlayer) =>
    p.hp > 0 &&
    !p.respawnAllowed &&
    !p.personalJailed &&
    !p.bomberActive &&
    !p.grappling &&
    !p.airship &&
    !p.tabletTeleport &&
    p.mode !== 'roof' &&
    p.mode !== 'atv' &&
    !(
      ['hidden', 'climb', 'gondola', 'rocket', 'parachute'] satisfies [
        string,
        string,
        string,
        string,
        string,
      ]
    ).includes(p.mode);
  const near = (
    p: { x: number; z: number; y: number },
    n: { x?: number; z?: number; entry?: Point; base?: number } | null | undefined,
    r: number = GAMEPLAY.interactionRange,
  ) =>
    !!n &&
    Math.hypot(p.x - (n.x ?? n.entry!.x + 0.5), p.z - (n.z ?? n.entry!.y + 0.5)) <= r &&
    Math.abs(p.y - (n.base ?? p.y)) < 3;
  function npc(p: { x: number; z: number; y: number }, predicate: (actor: Actor) => boolean) {
    return (
      [...shared.npcById.values()].find((n) => predicate(n) && near(p, n)) ||
      geometry.merchants?.find((n) => predicate(n) && near(p, n))
    );
  }
  const byKind = (p: ServerPlayer, kind: string) =>
    npc(p, (n) => n.kind === kind || n.questRole === kind || n.id === kind);
  const defense = (p: ServerPlayer) =>
    ownedEquipmentDefense(p.inventory.economy.state, p.appearance);
  function runtime(p: ServerPlayer) {
    let r = runtimes.get(p.id);
    if (r) return r;
    const saved = (key: string) => parse(p.profile.privateState[key]),
      save = (key: string) => (value: unknown) => {
        const next = JSON.stringify(value);
        if (p.profile.privateState[key] !== next) {
          p.profile.privateState[key] = next;
          p.presentationRevision = (p.presentationRevision || 0) + 1;
          dirty(p);
        }
      };
    const health = {
      state: {
        get hp() {
          return p.hp;
        },
        get max() {
          return p.max;
        },
      },
      damage(amount: number) {
        const damage = Math.min(p.hp, Math.max(0, Math.floor(amount)));
        p.hp -= damage;
        p.damagePending = true;
        send(p, {
          type: 'damage',
          damage,
          hp: p.hp,
          max: p.max,
          xp: p.hitpointsXP,
          source: 'creature',
        });
        dirty(p);
        if (!p.hp) {
          p.respawnAllowed = true;
          p.training = false;
          p.personalBattle = null;
          send(p, { type: 'caught', source: 'alien' });
        }
        return damage;
      },
      heal(amount = 15) {
        const n = Math.min(p.max - p.hp, amount);
        p.hp += n;
        dirty(p);
        return n;
      },
    };
    const economy = p.inventory.economy,
      logical = {
        get x() {
          return p.x - 0.5;
        },
        get y() {
          return p.z - 0.5;
        },
        get angle() {
          return p.angle;
        },
      };
    const strength = createStrength(saved('sf-strength-v1'), save('sf-strength-v1')),
      quests = createQuestLog(saved('sf-quests-v1'), save('sf-quests-v1')),
      sunglasses = createSunglasses(saved('sf-sunglasses-v1'), save('sf-sunglasses-v1')),
      inebriation = createInebriation(
        p.profile.playerState.conditions.inebriation,
        save('sf-inebriation-v1'),
      );
    const tech = createTechVentures({
      economy,
      health,
      saved: saved('sf-tech-ventures-v1'),
      onSave: save('sf-tech-ventures-v1'),
      onDeath: () => {},
      dropPhoneOnDeath: false,
      onMessage: (message) => send(p, { type: 'notice', message }),
    });
    function losePhone() {
      if (economy.state.iphoneOwned) {
        tech.losePhone();
        p.inventory.save();
      }
    }
    const social = createSocialBusiness({
        economy,
        inebriation,
        random,
        onEvent: (event) =>
          send(p, { type: 'salesDecision', id: event.npc.id, message: event.message }),
      }),
      job = createAILabJob({
        saved: saved('sf-ai-lab-job-v1'),
        economy,
        onSave: save('sf-ai-lab-job-v1'),
      }),
      interview = createArithmeticInterview({ clock: now, random });
    const fishing = createFishing(economy, {
        now,
        readyAt: p.profile.playerState.activities.fishingReadyAt,
        onCooldown: (readyAt) => (p.profile.playerState.activities.fishingReadyAt = readyAt),
      }),
      origin = geometry.sights?.find((n) => n.id === 'lucindas-deli')?.entry || geometry.spawn;
    const deli = createDeli({
      capacity: () => sandwichCapacity(economy.state),
      economy,
      health,
      origin,
      routeTo: (goal: Point, from?: Point) => routeTo(goal.x, goal.y, from || logical, true),
      canTravel: (a: { x: number; y: number }, b: { x: number; y: number }) =>
        geometry.canTravel!(a.x, a.y, b.x, b.y, true),
      saved: { sandwiches: p.inventory.meta.sandwiches, pending: p.inventory.meta.deliveryPending },
      onSave: (v) => {
        p.inventory.meta.sandwiches = v.sandwiches;
        p.inventory.meta.deliveryPending = v.pending;
        p.inventory.save();
        dirty(p);
      },
      onMessage: (message) => send(p, { type: 'notice', message }),
    });
    const expeditions = createExpeditions({
      saved: saved('sf-expeditions-v1'),
      onSave: save('sf-expeditions-v1'),
      health,
      economy,
      consumeShot: (weapon: string) => {
        const r = consumeWeaponShot(p, weapon);
        if (r.spent) send(p, { type: 'inventory', inventory: p.inventory.snapshot() });
        return r;
      },
      food: (amount: number) => p.inventory.receive({ lootKind: 'sandwich', amount }),
      level: () => strength.status.level,
      defense: () => defense(p),
      reflect: (damage) => recoilDamage(p.inventory.economy.state, p.appearance, damage),
      inebriation: () => inebriation.state.percent,
      sharedWorld: () => true,
      player: () => ({ x: p.x, z: p.z, base: p.y, eligible: p.hp > 0 && !p.respawnAllowed }),
      random,
      onEvent: (event) => {
        if (event.type === 'shot' && event.target) {
          awardCombat(p, event.damage);
          p.angle = Math.atan2(event.target.z - p.z, event.target.x - p.x);
          p.gesture = 'attack';
          p.gestureUntil = now() + 450;
          send(p, {
            type: 'sharedHit',
            attacker: p.id,
            target: event.target.id,
            damage: event.damage,
            hp: event.hp,
            max: event.max,
            weapon: expeditions.state.weapon,
            from: { x: p.x, y: p.y + 1.14, z: p.z },
            to: { x: event.target.x, y: (event.target.base || 0) + 1, z: event.target.z },
          });
        } else if (event.message) send(p, { type: 'notice', message: event.message });
      },
    });
    if (geometry.expeditions?.ship.home) expeditions.setHarbor(geometry.expeditions.ship.home);
    const pen = geometry.sights?.find((n) => n.id === 'zoo-monkeys'),
      home = geometry.monkeyKeeper?.home || pen?.entry || { x: 15, y: 99 };
    const keeper = createMonkeyPursuit({
      player: logical,
      home,
      saved: saved('sf-monkey-keeper-v1'),
      onSave: save('sf-monkey-keeper-v1'),
      routeTo: (x: number, y: number, from?: Point) => routeTo(x, y, from || logical, true),
      canCapture: (a: { x: number; y: number }, b: { x: number; y: number }) =>
        geometry.canTravel!(a.x, a.y, b.x, b.y, true),
      canPursue: () => eligible(p),
      onCaught: () => {
        quests.recover();
        send(p, {
          type: 'notice',
          message: contentText(
            'world-message.server.player-state.the-zookeeper-recovers-the-monkey',
          ),
        });
      },
    });
    const police = createPoliceChase({
      player: logical,
      routeTo: (x: number, y: number, from?: Point) => routeTo(x, y, from || logical, true),
      nearest: (
        x: number,
        y: number,
        r: number | undefined,
        test: ((x: number, y: number) => boolean) | undefined,
      ) =>
        (geometry.marinLand?.contains(p.x, p.z)
          ? geometry.marinLand.nearest(x, y, r, test)
          : geometry.nearestNavigation?.(x, y, r, test)) ||
        geometry.airship?.nearest(x, y, r, test) ||
        null,
      canCapture: (a: { x: number; y: number }, b: { x: number; y: number }) =>
        geometry.canTravel!(a.x, a.y, b.x, b.y, true),
      onArrest: () => {
        social.cancelPitch();
        fishing.cancel();
        movement.clear(p);
        instances.reset(p);
        Object.assign(p, {
          personalJailed: true,
          detainAt: now() + CAPTURE_DURATION * 1000,
          gesture: 'caught',
          gestureUntil: now() + CAPTURE_DURATION * 1000,
          mode: 'walk',
          hp: p.max,
        });
        losePhone();
        send(p, { type: 'detained', position: movement.position(p) });
        dirty(p);
      },
    });
    r = {
      strength,
      quests,
      sunglasses,
      inebriation,
      tech,
      social,
      job,
      interview,
      fishing,
      deli,
      expeditions,
      keeper,
      police,
      health,
      lastInterview: false,
      battle: null,
      battles: new Map(),
      save,
      inventoryRevision: p.inventory.meta.revision,
    };
    runtimes.set(p.id, r);
    if (p.profile.police)
      Object.assign(police.state, p.profile.police, {
        officers: (Array.isArray(p.profile.police.officers) ? p.profile.police.officers : [])
          .filter(
            (n) =>
              isRecord(n) &&
              typeof n.x === 'number' &&
              typeof n.y === 'number' &&
              typeof n.angle === 'number' &&
              typeof n.phase === 'number' &&
              typeof n.index === 'number',
          )
          .map((value) => {
            const n = value as Record<string, unknown>;
            return {
              x: Number(n.x),
              y: Number(n.y),
              angle: Number(n.angle),
              phase: Number(n.phase),
              index: Number(n.index),
              path: [],
              repath: 0,
            };
          }),
      });
    police.state.jailed = !!p.personalJailed;
    if (!police.state.wanted || police.state.jailed) police.state.officers.length = 0;
    if (quests.carrying) keeper.start();
    strength.save();
    save('sf-quests-v1')(quests.state);
    save('sf-sunglasses-v1')(sunglasses.state);
    save('sf-expeditions-v1')(persistentExpedition(r));
    save('sf-inebriation-v1')(inebriation.state.percent);
    save('sf-ai-lab-job-v1')(job.state);
    save('sf-hitpoints-v1')({ hp: p.hp, max: p.max, xp: p.hitpointsXP });
    return r;
  }

  function awardCombat(p: ServerPlayer, damage: unknown) {
    if (!isFiniteNumber(damage) || damage <= 0) return;
    const r = runtime(p),
      before = p.max;
    r.strength.gain(damage * PROGRESSION.strengthXPPerDamage);
    p.hitpointsXP = skillStatus(p.hitpointsXP + damage * PROGRESSION.hitpointsXPPerDamage).xp;
    p.max = hitpointMaximum(p.hitpointsXP);
    if (p.hp > 0) p.hp = Math.min(p.max, p.hp + p.max - before);
    updatePlayerLevel(p, r.strength.status.level);
    r.save('sf-hitpoints-v1')({ hp: p.hp, max: p.max, xp: p.hitpointsXP });
    dirty(p);
  }
  function updatePlayerLevel(p: ServerPlayer, strengthLevel: number) {
    const level = playerLevel(strengthLevel, skillStatus(p.hitpointsXP).level);
    if (p.level !== level) {
      p.level = level;
      p.revision++;
    }
  }
  function commit(p: ServerPlayer, r: PlayerRuntime) {
    p.inventory.save();
    dirty(p);
    updatePlayerLevel(p, r.strength.status.level);
  }
  function inventory(p: ServerPlayer, operation: unknown, args: Record<string, unknown> = {}) {
    if (typeof operation !== 'string')
      return deny(
        contentText(
          'world-message.server.player-state.that-inventory-operation-is-not-a-user-action',
        ),
      );
    const op = operation;
    if (!p.hp || p.respawnAllowed)
      return deny(
        contentText(
          'world-message.server.player-state.wait-until-you-respawn-before-using-your-inventory',
        ),
      );
    if (
      !eligible(p) &&
      !(['eat', 'equipPhone', 'chargeRailgun'] satisfies [string, string, string]).includes(op)
    )
      return deny(
        contentText(
          'world-message.server.player-state.visit-the-merchant-on-foot-to-make-that-purchase',
        ),
      );
    const r = runtime(p);
    r.deli.state.sandwiches = p.inventory.meta.sandwiches;
    let result;
    if (['buyAmmo', 'buyMissile', 'buyBattery', 'chargeRailgun', 'buyTinfoil'].includes(op)) {
      result = combatSupplyAction(p, op, {
        nearArmorer: !!npc(p, (n) => n.questRole === 'armorer'),
        nearBatterySeller: !!byKind(p, 'battery-seller'),
        nearChef: !!byKind(p, 'chef'),
      });
    } else if (op === 'eat') {
      r.deli.state.sandwiches = p.inventory.meta.sandwiches;
      result = r.deli.eat();
      if (result.ok) {
        p.gesture = 'eat';
        p.gestureUntil = now() + 900;
      }
    } else if (op === 'order') result = r.deli.order({ x: p.x - 0.5, y: p.z - 0.5 });
    else if (op === 'pickup') {
      if (!byKind(p, args.store === 'in-n-out' ? 'in-n-out-clerk' : 'deli'))
        return deny(
          contentText('world-message.server.player-state.visit-the-sandwich-counter-first'),
        );
      result = r.deli.pickup(typeof args.store === 'string' ? args.store : undefined);
    } else if (op === 'buyBackpack') {
      if (!byKind(p, 'hiking-supplier'))
        return deny(
          contentText('world-message.server.player-state.visit-the-hiking-supplies-clerk'),
        );
      if (p.inventory.economy.state.ownedEquipment.includes('backpack'))
        return deny(
          contentText('world-message.server.player-state.you-already-have-a-hiking-backpack'),
        );
      if (p.inventory.economy.state.coins < 100)
        return deny(contentText('world-message.server.player-state.you-need-100-coins'));
      p.inventory.economy.state.coins -= 100;
      result = p.inventory.receive({ lootKind: 'equipment', itemId: 'backpack', amount: 1 });
    } else if (op === 'buyHat') {
      if (!byKind(p, 'haberdasher'))
        return deny(contentText('world-message.server.player-state.visit-the-haberdasher'));
      result = p.inventory.economy.buyHat(typeof args.id === 'string' ? args.id : '');
    } else if (op === 'buyPhone') {
      if (!byKind(p, 'tim-apple'))
        return deny(contentText('world-message.server.player-state.visit-tim-apple'));
      result = r.tech.buyPhone();
    } else if (op === 'equipPhone') result = r.tech.equipPhone(args.on === true);
    else if (op === 'buyRobotaxi') {
      if (!byKind(p, 'robotaxi-sales'))
        return deny(contentText('world-message.server.player-state.visit-the-robotaxi-dealer'));
      result = r.tech.buyRobotaxi();
    } else if (op === 'trimArmor') {
      const count = p.inventory.meta.armorTrimmingKits || 0;
      const owned = p.inventory.economy.state.ownedEquipment;
      const armor = owned.indexOf('iron-armor');
      if (!count || armor < 0 || owned.includes('gold-trimmed-iron-armor'))
        return deny(contentText('world-message.iron-armor.trim-requirements'));
      p.inventory.meta.armorTrimmingKits = count - 1;
      owned[armor] = 'gold-trimmed-iron-armor';
      if (p.appearance.torso === 'iron-armor') {
        p.appearance = { ...p.appearance, torso: 'gold-trimmed-iron-armor' };
        p.profile.privateState['sf-character-v1'] = JSON.stringify(p.appearance);
        p.revision++;
      }
      result = { ok: true, message: contentText('world-message.iron-armor.trimmed') };
    } else if (op === 'fundBiomed') {
      const pitch = npc(p, (actor) => actor.id === 'biomed-entrepreneur');
      if (!pitch) return deny(contentText('world-message.biomed.nearby'));
      const amount = args.amount;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1)
        return deny(contentText('world-message.biomed.amount'));
      if (amount > p.inventory.economy.state.coins)
        return deny(contentText('world-message.biomed.funds'));
      p.inventory.economy.state.coins -= amount;
      result = { ok: true, message: contentText('world-message.biomed.paid') };
    } else if (op === 'trade') result = trade(p, args.kind);
    else
      return deny(
        contentText(
          'world-message.server.player-state.that-inventory-operation-is-not-a-user-action',
        ),
      );
    if (result.ok) commit(p, r);
    return { ...result, inventory: { ...p.inventory.snapshot(), hp: p.hp, max: p.max } };
  }
  function trade(p: ServerPlayer, kind: unknown) {
    if (typeof kind !== 'string')
      return deny(contentText('world-message.server.player-state.choose-a-trade-first'));
    const r = runtime(p),
      economy = p.inventory.economy;
    if (kind === 'iron-armor') {
      if (!npc(p, (actor) => actor.id === 'enterprising-industrialist'))
        return deny(contentText('world-message.iron-armor.visit'));
      if (equipmentOwned(economy.state, 'gold-trimmed-iron-armor'))
        return deny(contentText('world-message.iron-armor.already-trimmed'));
      return economy.buyEquipment('iron-armor');
    }
    if (kind === 'sell-uni') {
      const counter = geometry.sights?.find((sight) => sight.id === 'rich-table')?.entry;
      if (!counter || Math.hypot(p.x - counter.x - 0.5, p.z - counter.y - 0.5) > 2.2)
        return deny(contentText('world-message.uni.visit-rich-table'));
      const count = p.inventory.meta.uni ?? 0;
      if (count < 1) return deny(contentText('world-message.uni.none'));
      if (!Number.isSafeInteger(economy.state.coins + 40))
        return deny(contentText('world-message.server.inventory.your-coin-purse-is-full'));
      p.inventory.meta.uni = count - 1;
      economy.state.coins += 40;
      return { ok: true, message: contentText('world-message.uni.sold') };
    }
    if (kind === 'fighter-yard-admission') {
      if (!npc(p, (actor) => actor.id === FIGHTER_YARD.tyler.id))
        return deny(contentText('world-message.fighter-yard.admission-required'));
      if (hasFighterYardPass(p))
        return deny(contentText('world-message.fighter-yard.already-admitted'));
      const purse = economy.state;
      if (purse.coins < FIGHTER_YARD.price)
        return deny(
          contentText('world-message.server.movement.you-need-coins', {
            price: FIGHTER_YARD.price,
          }),
        );
      purse.coins -= FIGHTER_YARD.price;
      purse.ownedEquipment.push(FIGHTER_YARD.pass);
      return { ok: true, message: contentText('world-message.fighter-yard.admitted') };
    }
    if (kind === 'goblin-phone') {
      if (!npc(p, (actor) => actor.id === GOBLIN_INDUSTRIALIST.id))
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
      const bought = economy.buyEquipment(kind);
      return bought.ok
        ? { ...bought, message: contentText('world-message.goblin-phone.purchase') }
        : bought;
    }
    if (kind === 'goblin-phone-sale') {
      if (!npc(p, (actor) => actor.id === GOBLIN_PHONE_BUYER))
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
      const purse = economy.state;
      const index = purse.ownedEquipment.indexOf('goblin-phone');
      if (index < 0) return deny(contentText('world-message.goblin-phone.no-phone'));
      if (!Number.isSafeInteger(purse.coins + GOBLIN_PHONE_RESALE))
        return deny(contentText('world-message.server.player-state.your-coin-purse-is-full'));
      purse.ownedEquipment.splice(index, 1);
      purse.coins += GOBLIN_PHONE_RESALE;
      return {
        ok: true,
        message: contentText('world-message.goblin-phone.sold', { price: GOBLIN_PHONE_RESALE }),
      };
    }
    const pelt = kind.slice(5);
    if (kind.startsWith('sell-') && isTahoePelt(pelt)) {
      if (!npc(p, (actor) => actor.id === ROBE_SELLER))
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
      const pelts = p.inventory.meta.pelts;
      const count = pelts?.[pelt] || 0;
      if (!pelts || !count) return deny(contentText('world-message.tahoe-pelts.none'));
      const price = TAHOE_PELT_PRICES[pelt];
      if (!Number.isSafeInteger(economy.state.coins + price))
        return deny(contentText('world-message.server.player-state.your-coin-purse-is-full'));
      pelts[pelt] = count - 1;
      economy.state.coins += price;
      return {
        ok: true,
        message: contentText('world-message.tahoe-pelts.sold', {
          pelt: ITEM_STATS[pelt].name.toLowerCase(),
          price,
        }),
      };
    }
    if (CLOTHIER_ITEMS.some((id) => id === kind)) {
      if (!npc(p, (actor) => actor.id === ROBE_SELLER))
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
      return economy.buyEquipment(kind);
    }
    if (kind === 'rolling-pin') {
      if (!npc(p, (actor) => actor.id === 'cotogna-chef'))
        return deny(contentText('world-message.server.player-state.visit-the-cotogna-counter'));
      return economy.buyEquipment(kind);
    }
    const merchants: Record<string, string> = {
      equity: 'founder',
      secondary: 'secondary',
      grain: 'grain',
      tax: 'tax',
      'fish-sale': 'chef',
      'sand-sale': 'gpu-buyer',
      'salt-letter-collect': 'salt-activist',
      'salt-letter-deliver': 'clerk',
      'sales-software-buy': 'software-vendor',
      'motorcycle-rental': 'motorcycle-clerk',
      coffee: 'square-coffee',
      'busker-tip': 'square-busker',
      skis: 'lift',
    };
    if (merchants[kind]) {
      const merchant = byKind(p, merchants[kind]);
      if (!merchant)
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
      if (kind === 'motorcycle-rental') {
        if (r.quests.carrying)
          return deny(
            contentText(
              'world-message.server.player-state.the-rental-desk-is-closed-while-a-pursuit-is-in-progress',
            ),
          );
        const s = parse(p.profile.privateState['sf-motorcycle-v1']);
        if (s.rented)
          return deny(contentText('world-message.server.player-state.your-rental-is-already-paid'));
        const result = economy.trade(kind);
        if (result.ok) {
          const home = geometry.motorcycle?.home || { x: p.x - 0.5, y: p.z - 0.5 };
          r.save('sf-motorcycle-v1')({ rented: true, ...home });
        }
        return result;
      }
      if (kind === 'skis') {
        const t = movement.state(p).tahoe;
        if (t.state.rented)
          return deny(
            contentText('world-message.server.player-state.your-skis-are-already-rented'),
          );
        const result = economy.trade(kind);
        if (result.ok) t.state.rented = true;
        return result;
      }
      const incubator = kind === 'equity' && merchant.id === GOBLIN_INCUBATOR.founder.id;
      const result = economy.trade(incubator ? 'incubator-equity' : kind);
      if (incubator && result.ok)
        return { ...result, message: contentText('world-message.goblin-incubator.fish') };
      if (result.ok && kind === 'coffee') {
        const healed = r.health.heal(1);
        p.gesture = 'drink';
        p.gestureUntil = now() + 1600;
        return {
          ...result,
          healed,
          message: contentText(
            'world-message.server.player-state.you-drink-the-coffee-and-recover-hp',
            { healed: String(healed) },
          ),
        };
      }
      return result;
    }
    if (kind === 'beer') {
      if (!byKind(p, 'bartender'))
        return deny(
          contentText('world-message.server.player-state.visit-shanghai-kellys-bartender'),
        );
      return r.inebriation.drink(economy);
    }
    if (kind === 'collect-sand') {
      if (!near(p, geometry.sandSite, 2))
        return deny(contentText('world-message.server.player-state.collect-sand-at-ocean-beach'));
      if (now() < (p.nextSandAt || 0))
        return deny(
          contentText('world-message.server.player-state.finish-filling-your-sack-first'),
        );
      p.nextSandAt = now() + GAMEPLAY.sandCollectSeconds * 1000;
      return economy.trade(kind);
    }
    if (kind === 'feed') {
      if (!geometry.sights?.some((n) => n.kind === 'ducks' && near(p, n, 5)))
        return deny(contentText('world-message.server.player-state.walk-to-the-ducks'));
      return economy.trade(kind);
    }
    if (
      (
        ['extortion', 'free-fuel-can', 'fuel-can', 'use-fuel-can'] satisfies [
          string,
          string,
          string,
          string,
        ]
      ).includes(kind)
    ) {
      const car = movement.state(p).ferrari,
        attendant = nearbyServiceNPC(
          geometry,
          p,
          (n) => n.kind === 'fuel-attendant' && !!car?.stations.some((s) => s.id === n.siteId),
        ),
        station = car?.stations.find((s) => s.id === attendant?.siteId);
      if (kind === 'use-fuel-can') {
        if (!car || Math.hypot(car.position.x - p.x, car.position.z - p.z) > 4)
          return deny(contentText('world-message.server.player-state.walk-to-your-ferrari'));
        const result = economy.trade(kind);
        if (result.ok) car.refuel();
        return result;
      }
      if (!station)
        return deny(contentText('world-message.server.player-state.visit-a-gas-station'));
      if (kind === 'extortion' && !fuelCarInRange(car, station, attendant))
        return deny(
          contentText(
            'world-message.server.player-state.the-ferrari-is-too-far-from-this-pump-buy-a-fuel-can-and-carry',
          ),
        );
      const result =
        kind === 'extortion'
          ? station.paid
            ? economy.trade('extortion')
            : { ok: true }
          : economy.trade(station.paid ? 'fuel-can' : 'free-fuel-can');
      if (result.ok && kind === 'extortion') car!.refuel();
      return result;
    }
    if (kind === 'rocket') return movement.travel(p, { kind: 'rocket' });
    return deny(
      contentText(
        'world-message.server.player-state.rewards-and-timed-activities-are-calculated-by-the-server',
      ),
    );
  }
  function parrotQuest(p: ServerPlayer, r: PlayerRuntime, args: Record<string, unknown>) {
    const stage = r.quests.state.stochasticParrot;
    const id = typeof args.id === 'string' ? args.id : '';
    let message: string;
    if (
      (args.step === 'start' && stage === 'not-started') ||
      (args.step === 'deliver' && stage === 'carrying')
    ) {
      if (!byKind(p, PARROT_SCIENTIST))
        return deny(contentText('world-message.stochastic-parrot.visit-scientist'));
      r.quests.advanceParrot(stage);
      message = contentText(
        args.step === 'start'
          ? 'world-message.stochastic-parrot.started'
          : 'world-message.stochastic-parrot.delivered',
      );
    } else if (args.step === 'catch' && stage === 'accepted') {
      const bird = geometry.parrots?.find((n) => n.id === id && n.parrot);
      if (!near(p, bird, 1.8))
        return deny(contentText('world-message.stochastic-parrot.visit-grove'));
      if (args.sandwich === true) {
        if (!p.inventory.meta.sandwiches)
          return deny(contentText('world-message.stochastic-parrot.needs-sandwich'));
        p.inventory.meta.sandwiches--;
        r.deli.state.sandwiches = p.inventory.meta.sandwiches;
      }
      r.quests.advanceParrot('accepted');
      message = contentText(
        args.sandwich === true
          ? 'world-message.stochastic-parrot.lured'
          : 'world-message.stochastic-parrot.caught',
      );
    } else if (args.step === 'sell' && stage === 'proof') {
      const price = proofPrice(id);
      if (!price || !npc(p, (n) => n.id === id && !n.expeditionDead))
        return deny(contentText('world-message.stochastic-parrot.visit-buyer'));
      const sale = p.inventory.receive({ lootKind: 'coins', amount: price, transfer: true });
      if (!sale.ok) return sale;
      r.quests.advanceParrot('proof');
      message = contentText('world-message.stochastic-parrot.sold', {
        price: price + (price === 1 ? ' coin' : ' coins'),
      });
    } else return deny(contentText('world-message.stochastic-parrot.unavailable'));
    commit(p, r);
    return { ok: true, message, inventory: p.inventory.snapshot() };
  }

  function saveBurningMan(p: ServerPlayer, quest: BurningManProgress) {
    p.profile.privateState['sf-burning-man-v1'] = JSON.stringify(quest);
    p.presentationRevision = (p.presentationRevision || 0) + 1;
    dirty(p);
  }
  function burningMan(p: ServerPlayer, step: unknown) {
    const quest = p.profile.playerState.quests.burningMan;
    const transition = [
      ['start', 'not-started', 'fetch-water', BURNING_MAN.matilda, 'started'],
      ['water', 'fetch-water', 'has-water', BURNING_MAN.waterClerk, 'water'],
      ['deliver-water', 'has-water', 'find-dj', BURNING_MAN.matilda, 'water-delivered'],
      ['invite', 'find-dj', 'dj-agreed', BURNING_MAN.dj, 'invited'],
      ['report', 'dj-agreed', 'ready', BURNING_MAN.matilda, 'ready'],
      ['reward', 'burned', 'completed', BURNING_MAN.matilda, 'reward'],
    ] as const;
    const current = transition.find(([verb, from]) => verb === step && from === quest.stage);
    if (!current) return deny(contentText('world-message.burning-man.unavailable'));
    const [, , stage, who, message] = current;
    if (!npc(p, (actor) => actor.id === who))
      return deny(contentText('world-message.burning-man.approach'));
    if (stage === 'completed') {
      if (now() < quest.burnAt + BURNING_MAN.burnMs)
        return deny(contentText('world-message.burning-man.wait'));
      if (!equipmentOwned(p.inventory.economy.state, 'party-boots')) {
        const award = p.inventory.receive({
          lootKind: 'equipment',
          itemId: 'party-boots',
          amount: 1,
        });
        if (!award.ok) return award;
      }
    }
    if (stage === 'has-water' && !p.profile.collection.includes('burning-man-water'))
      p.profile.collection.push('burning-man-water');
    saveBurningMan(p, { ...quest, stage });
    return {
      ok: true,
      message: contentText('world-message.burning-man.' + message),
      inventory: p.inventory.snapshot(),
    };
  }
  function igniteBurningMan(p: ServerPlayer) {
    const quest = p.profile.playerState.quests.burningMan;
    const campus = geometry.esotericCampus;
    if (
      quest.stage !== 'ready' ||
      p.mode !== 'walk' ||
      p.instance.kind !== 'world' ||
      !campus ||
      !campus.contains(p.x, p.z) ||
      Math.abs(p.y - campus.ground()) > 0.3
    )
      return false;
    const { u, v } = campus.local(p.x, p.z);
    if (!burningManStrawAt(u, v)) return false;
    saveBurningMan(p, { stage: 'burned', burnAt: now() });
    return true;
  }
  function action(p: ServerPlayer, args: Record<string, unknown> = {}) {
    const r = runtime(p),
      { verb } = args;
    if (typeof verb !== 'string')
      return deny(contentText('world-message.server.player-state.unknown-player-action'));
    if (
      !eligible(p) &&
      !(
        [
          'stopTraining',
          'constructionStop',
          'cancelFishing',
          'rehabilitate',
          'returnShip',
        ] satisfies [string, string, string, string, string]
      ).includes(verb) &&
      !(
        p.instance?.kind === 'kraken' &&
        p.hp > 0 &&
        !p.respawnAllowed &&
        (['attackKraken', 'collectPersonal'] satisfies [string, string]).includes(verb)
      )
    )
      return deny(contentText('world-message.server.player-state.find-your-feet-first'));
    if (verb === 'stochasticParrot') return parrotQuest(p, r, args);
    if (verb === 'burningMan') return burningMan(p, args.step);
    if (verb === 'tradeMud') {
      if (
        p.instance.kind !== 'world' ||
        !npc(p, (actor) => actor.id === GOBLIN_SPACE_PROGRAM.engineer.id)
      )
        return deny(contentText('world-message.goblin-space.approach'));
      const purse = p.inventory.economy.state;
      const previous = p.profile.playerState.progress.goblinSpaceMud;
      const quantity = previous > 0 && args.all === true ? purse.mud : 1;
      const delivered = Math.min(previous + quantity, GOBLIN_MUD_REWARD_AT);
      const reachedReward = previous < GOBLIN_MUD_REWARD_AT && delivered === GOBLIN_MUD_REWARD_AT;
      const shirt = { lootKind: 'equipment', itemId: GOOSE_CORP_SHIRT, amount: 1 };
      const grantShirt = reachedReward && !equipmentOwned(purse, GOOSE_CORP_SHIRT);
      if (grantShirt) {
        const check = p.inventory.canReceive(shirt);
        if (!check.ok) return check;
      }
      const exchange = p.inventory.economy.trade('mud-for-fish', quantity);
      if (!exchange.ok) return exchange;
      if (delivered !== previous)
        p.profile.privateState['sf-goblin-space-v1'] = JSON.stringify(delivered);
      if (grantShirt) {
        p.inventory.receive(shirt);
        dirty(p);
      } else commit(p, r);
      return {
        ok: true,
        message: contentText(
          grantShirt
            ? 'world-message.goblin-space.shirt'
            : previous === 0
              ? 'world-message.goblin-space.exchanged'
              : 'world-message.goblin-space.repeat-exchange',
          { fish: quantity * FISH_PER_MUD },
        ),
        inventory: p.inventory.snapshot(),
      };
    }
    let result;
    const questNPC: Record<string, string> = {
      acceptMonkey: 'professor',
      completeMonkey: 'professor',
      certificate: 'esoteric',
      permit: 'clerk',
      bayonet: 'armorer',
      skateboard: 'clerk',
      claimFunding: 'capital',
      finishRaptor: 'jurassic-scientist',
    };
    if (questNPC[verb]) {
      const key = questNPC[verb];
      if (
        !npc(p, (n) =>
          key === 'professor'
            ? n.id === 'ada-meridian'
            : n.kind === key || n.questRole === key || n.id === key,
        )
      )
        return deny(
          contentText('world-message.server.player-state.speak-to-the-appropriate-npc-nearby'),
        );
    }
    if (verb === 'tailorCloak') {
      const tailor = byKind(p, 'yohji');
      if (
        !tailor ||
        (tailor.interior &&
          geometry.placeAt &&
          geometry.placeAt(p.x - 0.5, p.z - 0.5)?.id !== tailor.interior.id)
      )
        return deny(contentText('world-message.server.player-state.the-tailor-is-not-nearby'));
      const pieces = (['black-cloak-top', 'black-cloak-bottom'] satisfies [string, string]).filter(
        (id) => !p.inventory.economy.state.ownedEquipment.includes(id),
      );
      if (!pieces.length)
        return deny(
          contentText(
            'world-message.server.player-state.you-already-have-the-complete-cloak-wear-it-well',
          ),
        );
      if (!p.inventory.meta.bisonHides)
        return deny(
          contentText('world-message.server.player-state.i-need-a-bison-hide-for-that-commission'),
        );
      p.inventory.meta.bisonHides--;
      for (const itemId of pieces)
        p.inventory.receive({ lootKind: 'equipment', itemId, amount: 1 });
      p.gesture = 'talk';
      p.gestureUntil = now() + 900;
      result = {
        ok: true,
        message: contentText(
          'world-message.server.player-state.yohji-takes-the-hide-considers-the-silhouette-and-hands-you-a',
        ),
        inventory: p.inventory.snapshot(),
      };
    } else if (verb === 'neighborhoodService') {
      const shopkeeper = npc(p, (n) => n.id === args.id && !!n.neighborhoodService),
        service = NEIGHBORHOOD_SERVICES[shopkeeper?.neighborhoodService || ''],
        offer = service?.offers.find((o) => o.id === args.offer);
      if (!offer || !shopkeeper)
        return deny(
          contentText('world-message.server.player-state.speak-to-the-shopkeeper-nearby'),
        );
      if (
        offer.sandwich &&
        p.inventory.meta.sandwiches + offer.sandwich + (p.inventory.meta.deliveryPending ? 1 : 0) >
          sandwichCapacity(p.inventory.economy.state)
      )
        return deny(contentText('world-message.server.player-state.your-sandwich-bag-is-full'));
      if (
        offer.showMs &&
        typeof shopkeeper.showStartedAt === 'number' &&
        shopkeeper.showStartedAt > 0 &&
        now() < shopkeeper.showStartedAt + offer.showMs
      )
        return deny(
          contentText(
            'world-message.server.player-state.the-show-is-already-underway-enjoy-this-one-then-ask-for-an-en',
          ),
        );
      const purse = p.inventory.economy.state;
      if (purse.coins < (offer.price || 0))
        return deny(
          contentText('world-message.server.player-state.you-need-coins', {
            price: String(offer.price),
          }),
        );
      const laborKey = shopkeeper.id + ':' + offer.id,
        readyAt = p.profile.laborReadyAt?.[laborKey] || 0;
      if (offer.reward && now() < readyAt)
        return deny(
          contentText('world-message.server.player-state.come-back-in-seconds-for-more-work', {
            value1: String(Math.ceil((readyAt - now()) / 1000)),
          }),
        );
      if (offer.reward) {
        const paid = p.inventory.economy.credit(offer.reward);
        if (!paid.ok)
          return deny(contentText('world-message.server.player-state.your-coin-purse-is-full'));
        (p.profile.laborReadyAt ??= {})[laborKey] = now() + (offer.cooldownMs || 0);
      }
      purse.coins -= offer.price || 0;
      if (offer.bouquet) purse.bouquets += offer.bouquet;
      if (offer.sandwich) p.inventory.meta.sandwiches += offer.sandwich;
      if (offer.showMs) shopkeeper.showStartedAt = Math.max(1, now());
      if (offer.heal) r.health.heal(offer.heal);
      if (offer.sober) r.inebriation.set(Math.max(0, r.inebriation.state.percent - offer.sober));
      p.gesture = offer.reward ? 'work' : service === NEIGHBORHOOD_SERVICES.tea ? 'drink' : 'talk';
      p.gestureUntil = now() + (offer.reward ? 2200 : 1200);
      result = {
        ok: true,
        message:
          offer.message +
          (offer.reward
            ? ' You receive ' +
              offer.reward +
              ' coin for your help. More work will be available in three minutes.'
            : ''),
      };
    } else if (verb === 'drinkBeer') result = trade(p, 'beer');
    else if (verb === 'refuel') result = trade(p, 'extortion');
    else if (verb === 'rentMotorcycle') result = trade(p, 'motorcycle-rental');
    else if (verb === 'acceptMonkey') result = r.quests.accept();
    else if (verb === 'completeMonkey') {
      result = r.quests.complete(p.inventory.economy);
      if (result.ok) r.keeper.stop();
    } else if (verb === 'stealMonkey') {
      const pen = geometry.sights?.find((n) => n.id === 'zoo-monkeys');
      if (!near(p, pen, 3))
        return deny(contentText('world-message.server.player-state.walk-to-the-monkey-enclosure'));
      result = r.quests.steal();
      if (result.ok) r.keeper.start();
    } else if (verb === 'certificate') result = r.quests.theyLive.certificate();
    else if (verb === 'permit') result = r.quests.theyLive.permit();
    else if (verb === 'bayonet') {
      result = r.quests.theyLive.weapon();
      if (result.ok && !weaponOwned(p.inventory.economy.state, 'bayonet'))
        p.inventory.receive({ lootKind: 'equipment', itemId: 'bayonet', amount: 1 });
    } else if (verb === 'skateboard') result = r.quests.theyLive.reward();
    else if (verb === 'pickSunglasses') {
      if (!near(p, geometry.sunglassesSite, 2))
        return deny(contentText('world-message.server.player-state.walk-to-the-sunglasses'));
      result = r.sunglasses.pickUp();
      if (result.ok) r.quests.theyLive.start();
    } else if (verb === 'claimFunding') result = r.strength.claim(p.inventory.economy);
    else if (verb === 'trampoline') {
      const { x, z, radius } = TRAMPOLINE;
      if (
        p.instance.kind !== 'world' ||
        p.mode !== 'walk' ||
        Math.hypot(p.x - x, p.z - z) > radius + 0.1 ||
        !geometry.sights?.some((site) => site.id === TRAMPOLINE.id)
      )
        return deny(contentText('world-message.trampoline.nearby'));
      movement.stop(p);
      p.attack = null;
      p.depotLaunch = { base: geometry.characterGround(x, z), elapsed: 0, trampoline: true };
      p.mode = 'depotLaunch';
      result = { ok: true };
    } else if (verb === 'train') {
      if (Math.hypot(p.x - SF_FITNESS.x, p.z - SF_FITNESS.z) > 5)
        return deny(contentText('world-message.server.player-state.visit-sf-fitness'));
      const shift = p.profile.playerState.activities.gym;
      const wait = shift.readyAt - now();
      if (wait > 0)
        return deny(
          contentText('world-message.gym.cooldown', { minutes: Math.ceil(wait / 60_000) }),
        );
      movement.stop(p);
      const spot = gymExercisePosition(typeof args.exercise === 'string' ? args.exercise : '');
      Object.assign(p, { x: spot.x, z: spot.z, y: SF_FITNESS.base + 0.07 });
      p.training = true;
      p.mode = 'train';
      p.gesture = gymExercise(typeof args.exercise === 'string' ? args.exercise : null).action;
      p.gestureUntil = 0;
      result = { ok: true };
    } else if (verb === 'stopTraining') {
      movement.leaveTraining(p);
      r.strength.save();
      result = { ok: true };
    } else if (verb === 'constructionStart') {
      const { x, z, angle } = CONSTRUCTION_SITE.work;
      const y = geometry.characterGround(x, z);
      if (
        (p.instance?.kind || 'world') !== 'world' ||
        p.mode !== 'walk' ||
        p.detainAt ||
        p.moving ||
        p.attack ||
        p.pvpTarget ||
        p.personalBattle ||
        Math.abs(p.y - y) > 0.35 ||
        Math.hypot(p.x - x, p.z - z) > 0.45 ||
        !geometry.sights?.some((sight) => sight.id === CONSTRUCTION_SITE.id)
      )
        return deny(contentText('world-message.construction.visit-workbench'));
      const wait = p.profile.playerState.activities.construction.readyAt - now();
      if (wait > 0) {
        const minutes = Math.ceil(wait / 60_000);
        return deny(
          contentText('world-message.construction.cooldown', {
            remaining: minutes + (minutes === 1 ? ' minute' : ' minutes'),
          }),
        );
      }
      movement.stop(p);
      Object.assign(p, {
        x,
        z,
        y,
        angle,
        mode: 'construction',
        gesture: '',
        constructing: true,
      });
      movement.state(p).mode = 'construction';
      result = { ok: true };
    } else if (verb === 'constructionStop') {
      movement.leaveConstruction(p);
      result = { ok: true };
    } else if (verb === 'fish') {
      if (
        !geometry.fishingSite ||
        !('water' in geometry.fishingSite) ||
        !near(p, geometry.fishingSite, 2)
      )
        return deny(
          contentText('world-message.server.player-state.walk-to-the-wharf-fishing-spot'),
        );
      movement.stop(p);
      result = r.fishing.start(geometry.fishingSite);
      if (result.ok) {
        p.gesture = 'fish';
        p.gestureUntil = 0;
      }
    } else if (verb === 'cancelFishing') {
      r.fishing.cancel();
      if (p.gesture === 'fish') p.gesture = '';
      result = { ok: true };
    } else if (verb === 'startRaptor') {
      if (!byKind(p, 'jurassic-scientist'))
        return deny(
          contentText('world-message.server.player-state.speak-to-the-jurassic-scientist'),
        );
      const stage = r.expeditions.state.raptor;
      if (stage === 'escaped') {
        result = shared.command(p, 'releaseRaptor');
      } else {
        const hadRailgun = weaponOwned(p.inventory.economy.state, 'railgun');
        result = r.expeditions.startQuest();
        if (result.ok) {
          if (!hadRailgun) {
            p.inventory.meta.railgunCharge = BATTERY_SHOTS;
            p.inventory.receive({ lootKind: 'equipment', itemId: 'railgun', amount: 1 });
            result = {
              ok: true,
              inventory: p.inventory.snapshot(),
              message: contentText(
                'world-message.server.player-state.railgun-issued-and-charged-equip-it-in-character-then-follow-t',
              ),
            };
          }
          shared.command(p, 'releaseRaptor');
        }
      }
    } else if (verb === 'finishRaptor') result = r.expeditions.finishQuest();
    else if (verb === 'cancelPitch') {
      r.social.cancelPitch();
      result = { ok: true };
    } else if (verb === 'pitch') {
      const target = npc(p, (n) => n.id === args.id && n.kind === 'software-buyer');
      if (!target)
        return deny(contentText('world-message.server.player-state.speak-to-a-nearby-salesman'));
      result = r.social.startPitch({ ...target });
    } else if (verb === 'interviewStart') {
      if (!byKind(p, 'recruiter'))
        return deny(contentText('world-message.server.player-state.visit-the-ai-lab-recruiter'));
      if (!r.interview.start())
        return deny(
          contentText('world-message.server.player-state.your-interview-is-already-running'),
        );
      r.lastInterview = false;
      result = interviewState(r);
    } else if (verb === 'interviewAnswer') {
      if (!r.interview.submit(typeof args.answer === 'string' ? args.answer : String(args.answer)))
        return deny(contentText('world-message.server.player-state.try-that-answer-again'));
      result = interviewState(r);
    } else if (verb === 'interviewStatus') {
      r.interview.update();
      result = interviewState(r);
    } else if (verb === 'interviewCancel') {
      r.interview.cancel();
      result = { ok: true };
    } else if (verb === 'tradeFactoryChair') {
      const chair = FACTORY_CHAIRS.find((item) => item.id === args.item);
      if (!chair || (args.trade !== 'buy' && args.trade !== 'sell'))
        return deny(contentText('world-message.server.player-state.choose-a-chair'));
      const purse = p.inventory.economy.state;
      if (args.trade === 'buy') {
        const maker = shared.wilderness.actors.find((actor) => actor.combatKind === 'goblin-maker');
        if (!maker?.hp || maker.enemy !== null || !near(p, maker))
          return deny(
            contentText(
              'world-message.server.player-state.visit-the-furniture-maker-at-the-goblin-furniture-factory-when',
            ),
          );
        if (purse.coins < FACTORY_CHAIR_BUY)
          return deny(contentText('world-message.server.player-state.a-chair-costs-200-coins'));
        if (purse.ownedEquipment.includes(chair.id))
          return deny(contentText('world-message.server.player-state.you-already-own-this-chair'));
        purse.coins -= FACTORY_CHAIR_BUY;
        purse.ownedEquipment.push(chair.id);
        result = {
          ok: true,
          message: contentText('world-message.server.player-state.you-buy-the-for-200-coins', {
            name: String(chair.name),
          }),
        };
      } else {
        if (
          !npc(p, (actor) => actor.stroller === true && String(actor.id).startsWith('noe-parent-'))
        )
          return deny(
            contentText(
              'world-message.server.player-state.find-a-parent-pushing-a-stroller-in-noe-valley',
            ),
          );
        const index = purse.ownedEquipment.indexOf(chair.id);
        if (index < 0)
          return deny(contentText('world-message.server.player-state.you-do-not-own-this-chair'));
        if (!Number.isSafeInteger(purse.coins + FACTORY_CHAIR_SELL))
          return deny(contentText('world-message.server.player-state.your-coin-purse-is-full'));
        purse.ownedEquipment.splice(index, 1);
        if (p.mode === 'sit' && chairForGesture(p.gesture) === chair) movement.wake(p);
        purse.coins += FACTORY_CHAIR_SELL;
        result = {
          ok: true,
          message: contentText('world-message.server.player-state.you-sell-the-for-220-coins', {
            name: String(chair.name),
          }),
        };
      }
    } else if (verb === 'seizeBicycle') {
      const rider = typeof args.id === 'string' ? shared.npcById.get(args.id) : undefined;
      if (
        p.instance.kind !== 'world' ||
        !['walk', 'bike'].includes(p.mode) ||
        !rider?.rider ||
        rider.expeditionDead ||
        (rider.bicycleTakenUntil || 0) > now()
      )
        return deny(contentText('world-message.bicycle-seizure.unavailable'));
      if (
        !near(p, rider, GAMEPLAY.interactionRange) ||
        geometry.canTravel?.(p.x - 0.5, p.z - 0.5, rider.x - 0.5, rider.z - 0.5, true) === false
      )
        return { ok: false, retryApproach: true };
      const previous = p.profile.bicycle;
      p.profile.bicycle = { x: p.x - 0.5, y: p.z - 0.5 };
      const mounted = movement.activity(p, { mode: 'bike' });
      if (!mounted.ok) {
        p.profile.bicycle = previous;
        return mounted;
      }
      rider.bicycleTakenUntil = now() + 60_000;
      p.attack = null;
      p.personalBattle = null;
      r.battle = null;
      r.fishing.cancel();
      r.expeditions.stop();
      if (random() < 0.3) r.police.start();
      result = { ok: true, message: contentText('world-message.bicycle-seizure.seized') };
    } else if (verb === 'attackPersonal') {
      const target =
        shared.npcById.get(typeof args.id === 'string' ? args.id : '') ||
        geometry.merchants?.find((n) => n.id === args.id);
      if (!target || !near(p, target, 5))
        return {
          ...deny(contentText('world-message.server.player-state.move-closer-to-your-target')),
          retryApproach: !!target,
        };
      if (typeof args.weapon === 'string' && !weaponOwned(p.inventory.economy.state, args.weapon))
        return deny(contentText('world-message.server.player-state.obtain-that-weapon-first'));
      const restriction = railgunRestriction(p, args.weapon);
      if (restriction) return deny(restriction);
      if (target.alienId && r.sunglasses.state.owned && p.appearance.sunglasses) {
        const valid = r.quests.theyLive.attack(target.alienId, { revealed: true });
        if (!valid.ok) {
          r.police.start();
          return valid;
        }
        movement.stop(p);
        p.attack = null;
        p.pvpTarget = null;
        target.hold = 2;
        let battle = r.battles.get(target.id);
        if (!battle || (battle.state.ended && battle.state.hp > 0)) {
          const hp = battle?.state.hp;
          battle = createAlienBattle({
            hp,
            health: r.health,
            level: () => r.strength.status.level,
            defense: () => defense(p),
            reflect: (damage) => recoilDamage(p.inventory.economy.state, p.appearance, damage),
            bayonet: () => r.battle?.weapon === 'bayonet',
            beforePlayerHit: () => {
              const weapon = r.battle?.weapon || 'unarmed',
                supply = consumeWeaponShot(p, weapon);
              if (supply.spent) send(p, { type: 'inventory', inventory: p.inventory.snapshot() });
              return supply;
            },
            playerInterval: () =>
              weaponAttackInterval(r.battle?.weapon || 'unarmed', p.inventory.economy.state),
            random,
            inebriation: () => r.inebriation.state.percent,
          });
          r.battles.set(target.id, battle);
        }
        r.battle = {
          target,
          weapon: typeof args.weapon === 'string' ? args.weapon : undefined,
          battle,
        };
        p.personalBattle = true;
        result = { ok: true };
      } else {
        r.police.start();
        result = {
          ok: true,
          message: contentText('world-message.server.player-state.the-police-are-on-their-way'),
        };
      }
    } else if (verb === 'attackKraken') {
      if (p.instance?.kind !== 'kraken')
        return deny(contentText('world-message.server.player-state.board-the-pequod-first'));
      result = r.expeditions.attack(
        r.expeditions.kraken,
        typeof args.weapon === 'string' ? args.weapon : 'railgun',
      );
    } else if (verb === 'collectPersonal') {
      const item = r.expeditions.state.loot.find((n) => n.id === args.id);
      if (!item || Math.hypot(p.x - item.x, p.z - item.z) > 3)
        return deny(contentText('world-message.server.player-state.that-loot-is-not-nearby'));
      result = r.expeditions.collect(item);
    } else if (verb === 'returnShip') {
      result =
        p.instance?.kind === 'kraken' && r.expeditions.returnShip()
          ? {
              ok: true,
              message: contentText(
                'world-message.server.player-state.the-pequod-turns-toward-the-coast',
              ),
            }
          : deny(contentText('world-message.server.player-state.board-the-pequod-first'));
    } else if (verb === 'rehabilitate') {
      if (!p.personalJailed || p.detainAt || !geometry.detention?.walkable(p.x, p.z))
        return deny(
          contentText(
            'world-message.server.player-state.speak-to-the-rehabilitation-specialist-from-inside-your-cell',
          ),
        );
      p.rehabilitateAt = now() + 3500;
      send(p, { type: 'rehabilitating' });
      result = { ok: true };
    } else return deny(contentText('world-message.server.player-state.unknown-player-action'));
    if (result.ok) {
      commit(p, r);
      if (
        verb === 'tradeFactoryChair' ||
        verb === 'bayonet' ||
        (verb === 'startRaptor' && 'inventory' in result)
      )
        return { ...result, inventory: p.inventory.snapshot() };
      if (verb === 'tailorCloak' && 'inventory' in result)
        result.inventory = p.inventory.snapshot();
    }
    return result;
  }
  function persistentExpedition(r: PlayerRuntime) {
    const s = r.expeditions.state;
    return {
      raptor: s.raptor,
      raptorDefeated: s.raptorDefeated,
      railgun: s.railgun,
      equipped: s.equipped,
      cape: s.cape,
      krakenStarted: s.krakenStarted,
      krakenDefeated: s.krakenDefeated,
      krakenReward: s.krakenReward,
    };
  }
  function interviewState(r: PlayerRuntime) {
    return {
      ok: true,
      interview: {
        phase: r.interview.state.phase,
        score: r.interview.state.score,
        remaining: r.interview.state.remaining,
        problem: r.interview.state.problem?.text || null,
      },
    };
  }
  function tick(dt: number) {
    for (const p of players.values()) {
      const r = runtime(p),
        coins = p.inventory.economy.state.coins,
        fish = p.inventory.economy.state.fish,
        phone = p.inventory.economy.state.iphoneOwned;
      r.deli.state.sandwiches = p.inventory.meta.sandwiches;
      const seat = p.seat;
      if (seat?.soakSeconds !== undefined) {
        if (
          !eligible(p) ||
          p.detainAt ||
          p.mode !== 'sit' ||
          p.moving ||
          p.instance.kind !== 'world' ||
          Math.hypot(p.x - MUD_BATH.x, p.z - MUD_BATH.z) > 0.05
        ) {
          movement.wake(p);
        } else {
          seat.soakSeconds += dt;
          if (seat.soakSeconds + 1e-9 >= MUD_BATH.secondsPerMud) {
            seat.soakSeconds = Math.max(0, seat.soakSeconds - MUD_BATH.secondsPerMud);
            if (p.inventory.economy.trade('collect-mud').ok) commit(p, r);
          }
        }
      }
      if (p.training) {
        if (!eligible(p) || p.moving || Math.hypot(p.x - SF_FITNESS.x, p.z - SF_FITNESS.z) > 5)
          movement.leaveTraining(p);
        else {
          const shift = p.profile.playerState.activities.gym;
          const previous = shift.workedSeconds;
          shift.workedSeconds = Math.min(CONSTRUCTION_SHIFT_SECONDS, previous + dt);
          r.strength.train(shift.workedSeconds - previous);
          if (Math.floor(previous) !== Math.floor(shift.workedSeconds)) dirty(p);
          if (shift.workedSeconds >= CONSTRUCTION_SHIFT_SECONDS - CONSTRUCTION_TIME_EPSILON) {
            shift.workedSeconds = 0;
            shift.readyAt = now() + CONSTRUCTION_COOLDOWN_MS;
            movement.leaveTraining(p);
            r.strength.save();
            dirty(p);
            send(p, { type: 'notice', message: contentText('world-message.gym.shift-ended') });
          }
          const strengthLevel = r.strength.status.level;
          updatePlayerLevel(p, strengthLevel);
          if (strengthLevel === PROGRESSION.maxLevel) movement.leaveTraining(p);
        }
      }
      if (p.constructing) {
        const { x, z } = CONSTRUCTION_SITE.work;
        if (
          !eligible(p) ||
          p.detainAt ||
          p.moving ||
          p.mode !== 'construction' ||
          (p.instance?.kind || 'world') !== 'world' ||
          Math.hypot(p.x - x, p.z - z) > 0.45
        ) {
          movement.leaveConstruction(p);
        } else {
          const shift = p.profile.playerState.activities.construction;
          const previous = shift.workedSeconds;
          const finished = previous + dt >= CONSTRUCTION_SHIFT_SECONDS - CONSTRUCTION_TIME_EPSILON;
          shift.workedSeconds = finished ? CONSTRUCTION_SHIFT_SECONDS : previous + dt;
          const payments = (seconds: number) =>
            Math.floor((seconds + CONSTRUCTION_TIME_EPSILON) / CONSTRUCTION_PAY_INTERVAL);
          const wages = payments(shift.workedSeconds) - payments(previous);
          if (wages > 0) p.inventory.economy.credit(wages);
          if (finished) {
            shift.workedSeconds = 0;
            shift.readyAt = now() + CONSTRUCTION_COOLDOWN_MS;
            movement.leaveConstruction(p);
            send(p, {
              type: 'notice',
              message: contentText('world-message.construction.shift-ended'),
            });
          }
        }
      }
      if (phone || p.inventory.economy.state.robotaxiOwned)
        r.tech.update(dt, { eligible: p.hp > 0 && !p.respawnAllowed });
      const inside =
        r.job.state.hired &&
        (geometry.placeAt
          ? geometry.placeAt(p.x - 0.5, p.z - 0.5)?.id === 'ai-lab'
          : geometry.places?.some(
              (n) =>
                n.id === 'ai-lab' &&
                p.x >= n.x &&
                p.x <= n.x + n.w &&
                p.z >= n.y &&
                p.z <= n.y + n.d,
            ));
      r.job.update(dt, { inside: !!inside, eligible: eligible(p) });
      r.social.update(dt, {
        insideTwitter: geometry.instituteRoomAt?.(p.x, p.z)?.id === 'twitter-hq',
        sitting:
          (['sit', 'bench'] satisfies [string, string]).includes(p.mode) && !p.moving && p.hp > 0,
      });
      if (r.fishing.state.active) {
        if (!eligible(p) || p.moving || !near(p, geometry.fishingSite, 2)) {
          r.fishing.cancel();
          if (p.gesture === 'fish') p.gesture = '';
        } else {
          const result = r.fishing.update(dt);
          if (result) {
            if (p.gesture === 'fish') p.gesture = '';
            send(p, { type: 'notice', message: result.message });
          }
        }
      }
      if (r.deli.state.pending)
        r.deli.update(dt, { x: p.x - 0.5, y: p.z - 0.5 }, { deliverable: eligible(p) });
      if (r.interview.state.phase === 'running') r.interview.update();
      if (r.interview.state.phase === 'finished' && !r.lastInterview) {
        r.lastInterview = true;
        const result = r.job.recordInterview(r.interview.result());
        send(p, { type: 'interviewResult', ...result });
      }
      if (r.quests.carrying) r.keeper.update(dt);
      else r.keeper.stop();
      r.police.update(dt, GAMEPLAY.walkSpeed);
      if (!p.personalBattle) r.battle = null;
      if (r.battle) {
        const { target, battle, weapon } = r.battle;
        if (!eligible(p) || !near(p, target, 2)) {
          r.battle = null;
          p.personalBattle = null;
        } else {
          target.hold = 2;
          for (const event of battle.update(dt)) {
            if (event.type === 'player-hit') {
              awardCombat(p, event.damage);
              p.angle = Math.atan2(target.z - p.z, target.x - p.x);
              p.gesture = 'attack';
              p.gestureUntil = now() + 450;
              send(p, {
                type: 'sharedHit',
                attacker: p.id,
                target: target.id,
                damage: event.damage,
                hp: event.hp,
                max: 36,
                weapon: weapon || 'unarmed',
                from: { x: p.x, y: p.y + 1, z: p.z },
                to: { x: target.x, y: (target.base ?? 0) + 1, z: target.z },
              });
            }
            if (event.type === 'stopped') {
              send(p, { type: 'notice', message: event.message });
              r.battle = null;
              p.personalBattle = null;
            }
            if (event.type === 'victory') {
              const result = r.quests.theyLive.defeat(target.alienId, { revealed: true });
              send(p, { type: 'notice', message: result.message });
              r.battle = null;
              p.personalBattle = null;
            }
          }
        }
      }
      if (p.instance?.kind === 'kraken') {
        if (!r.expeditions.ship.aboard) r.expeditions.board();
        r.expeditions.update(dt);
        const ship = r.expeditions.ship;
        if (ship.aboard) {
          p.x = ship.x;
          p.z = ship.z;
          p.y = PEQUOD.deck;
          p.mode = 'hidden';
        } else {
          instances.reset(p);
        }
      } else if (r.expeditions.ship.aboard) r.expeditions.abandonShip();
      if (p.detainAt && now() >= p.detainAt) {
        p.detainAt = 0;
        const jail = geometry.detention!;
        Object.assign(p, { x: jail.x, z: jail.z, y: jail.base + 0.18, mode: 'walk' });
        send(p, { type: 'position', ...movement.position(p), reason: 'jail' });
        dirty(p);
      }
      if (p.rehabilitateAt && now() >= p.rehabilitateAt) {
        p.rehabilitateAt = 0;
        p.personalJailed = false;
        r.police.state.jailed = false;
        p.appearance = scrambleAppearance(p.appearance, random);
        r.save('sf-character-v1')(p.appearance);
        p.revision++;
        r.inebriation.set(100);
        const h = geometry.hospital!;
        Object.assign(p, {
          x: h.x + 0.5,
          z: h.y + 0.5,
          y: geometry.characterGround(h.x + 0.5, h.y + 0.5),
          hp: p.max,
        });
        send(p, { type: 'position', ...movement.position(p), reason: 'respawn' });
      }
      r.save('sf-hitpoints-v1')({ hp: p.hp, max: p.max, xp: p.hitpointsXP });
      if (
        coins !== p.inventory.economy.state.coins ||
        fish !== p.inventory.economy.state.fish ||
        phone !== p.inventory.economy.state.iphoneOwned
      )
        commit(p, r);
    }
  }
  function components(p: ServerPlayer) {
    return componentSnapshots.sample(p, runtime(p), travelState);
  }
  function transient(p: ServerPlayer) {
    return Object.fromEntries([...components(p)].map(([key, entry]) => [key, entry.value]));
  }

  function travelState(p: ServerPlayer) {
    const s = movement.state(p);
    const cab = s.waymo;
    const waymo = cab
      ? {
          x: cab.x,
          z: cab.z,
          angle: cab.angle,
          phase: cab.phase,
          expiresAt: cab.expiresAt,
        }
      : null;
    return {
      waymo,
      atvRentalUntil: movement.activeATVRentalUntil(p),
      rocket: s.rocket.state.active ? s.rocket.state : null,
      tahoe:
        s.tahoeValue && s.tahoeValue.state.mode !== 'ground'
          ? { ...s.tahoeValue.state, ramps: undefined }
          : null,
      sutro: s.sutro.state.active ? s.sutro.state : null,
      bomber: p.bomberActive
        ? { boost: s.bomber.state.boost, rollElapsed: s.bomber.state.rollElapsed }
        : null,
      surf:
        s.mode === 'surf'
          ? { wave: s.wave.state, jump: s.windsurf.state.jump, clock: shared.clock }
          : null,
    };
  }
  return {
    runtime,
    inventory,
    action,
    igniteBurningMan,
    tick,
    transient,
    components,
    awardCombat,
    remove: (p: Pick<ServerPlayer, 'id'>) => {
      runtimes.delete(p.id);
      componentSnapshots.remove(p.id);
    },
    collect(p: ServerPlayer, award: { kind: string }) {
      if (award.kind === 'raptor') {
        const r = runtime(p);
        r.expeditions.raptor.phase = 'dead';
        r.expeditions.markRaptorDefeated();
        r.expeditions.recover();
      }
    },
    save(p: ServerPlayer) {
      const r = runtime(p);
      r.strength.save();
      r.tech.save();
      r.keeper.save();
    },
    attackIllegal: (p: ServerPlayer) => runtime(p).police.start(),
  };
}
