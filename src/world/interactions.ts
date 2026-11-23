import { TRAMPOLINE } from '../backyard-details.ts';
import { GAMEPLAY } from '../config/gameplay.ts';
import { drawNPCChatHead } from '../chat-head.ts';
import { MARKET_STREETCAR, STREETCAR_BOARD_RANGE } from '../market-streetcar.ts';
import readerContent from '../config/reader-content.json' with { type: 'json' };
import type {
  EditableEntity,
  InteractionSight,
  InteractiveActor,
  ActionReceipt,
  RuntimeDialogue,
  Place,
  Site,
  Actor,
} from '../types/world.ts';

import { hasSiteEntry, isLootTarget } from '../interaction-sights.ts';
import { isFiniteNumber } from '../types/json.ts';
import { requiredValue } from '../types/assert.ts';

import type { CommandResult } from '../types/network.ts';
import type { Point, WorldPoint } from '../types/geometry.ts';

import type { ExpeditionEvent } from '../types/expeditions.ts';
import type { WorldContext } from './scene.ts';
// MENU-ACTION-IDS
// CONTENT-BINDINGS-MIGRATED
import { contentText } from '../content-runtime.ts';
import {
  setActionText,
  actionTargetKind,
  type ActionLabelTarget,
  orderPrimaryActions,
  placeEntryVerb,
} from '../context-menu.ts';
import { applyEntityEdits } from '../world-edits.ts';
import { menuFromContent, compileEntityDialogue } from '../content-game.ts';
import { dialogueChoices } from '../dialogue-choices.ts';
import { POOL_SWIMMER } from '../communal-pool.ts';
import { createAmbientDialogue, childConversation } from '../dialogues/ambient.ts';
import { FIGHTER_YARD } from '../fighter-yard-layout.ts';
import { CONSTRUCTION_SITE } from '../construction-layout.ts';
import { constructionForemanDialogue } from '../construction-site.ts';
import { FISH_PER_MUD, GOBLIN_SPACE_PROGRAM, MUD_BATH } from '../goblin-space-layout.ts';
import {
  bolinasCultistDialogue,
  configuredDialogue,
  goblinFounderDialogue,
} from '../dialogue-config.ts';
import { mapInteractionResult } from '../interaction-results.ts';
import { neighborhoodShopDialogue } from '../neighborhood-interactions.ts';
import { serverConnected, serverCommand } from '../server-connection.ts';
import { growthDialogue } from '../finance-ui.ts';
import { atDuelArena } from '../duel-layout.ts';
import { ILLUMINATI_INSTANCE, instanceTile } from '../map-instances.ts';
import { debugTilePosition } from '../debug-console.ts';
import { dogSurfingDialogue } from '../dog-surfing.ts';
import {
  ITEM_STATS,
  IRON_ARMOR_PIECES,
  selectedWeapon,
  equipmentOwned,
  ownsIronArmorPiece,
  MISSILE_PRICE,
  isProjectileWeapon,
} from '../item-stats.ts';
import { besideBear, bearPettingApproach } from '../wilderness.ts';
import { softwareSalesDialogue } from '../sales-conference.ts';
import { techMerchantDialogue } from '../tech-ventures.ts';
import { haberdasherDialogue } from '../haberdashery.ts';
import { saltActivistDialogue, saltClerkDialogue } from '../salt-mail.ts';
import { AIRSHIP_TERMINAL } from '../airship.ts';
import { taxDialogue } from '../southern-district.ts';
import { scientistDialogue, ahabDialogue } from '../jurassic.ts';
import { forwardRollTarget, FORWARD_ROLL_DURATION, FORWARD_ROLL_SPEED } from '../forward-roll.ts';
import '../combat.ts';
import { GYM_EXERCISES, gymExercise, gymExercisePosition } from '../gym-exercises.ts';
import { createFuelDialogue, refuelFerrariFromCan } from '../fuel.ts';
import { SF_FITNESS } from '../southern-layout.ts';
import { monkeyQuestDialogue } from '../quests.ts';
import { renderLoreBook } from '../world-lore.ts';
import { theyLiveDialogue } from '../they-live.ts';
import { squareNPCDialogue } from '../times-square-life.ts';
import { SKATE_TRICKS } from '../skateboard.ts';
import { parrotDialogue } from '../parrots.ts';
import { proofBuyerChoice, proofPrice } from '../stochastic-parrot.ts';
import { rehabilitationDialogue } from '../rehabilitation.ts';
import { railWorkerDialogue } from '../rail-works.ts';
import { createResearchDialogue } from '../research-dialogue.ts';
import { TAHOE } from '../tahoe.ts';
import '../airship-basket.ts';
import { airshipAttendantDialogue } from '../airship-rental.ts';
import { AIRSHIP_TRAVELER } from '../airship-rope.ts';
import { AIRSHIP_RULES } from '../config/airship.ts';
import { MERCHANTS } from '../economy.ts';
import {
  GOBLIN_INDUSTRIALIST,
  GOBLIN_PHONE_BUYER,
  GOBLIN_PHONE_RESALE,
  CLOTHIER_ITEMS,
  ROBE_SELLER,
} from '../goblin-industrialist.ts';
import { guildDialogue, marketFarmerDialogue, TECHNOLOGIST_MARKET } from '../guild.ts';
import { bankerDialogue } from '../banking.ts';
import { npcContextActions, promoteWalkAction } from '../npc-interactions.ts';
import { describeCharacter, sightPrimaryVerb } from '../descriptions.ts';
import { buildingNPCService } from '../building-interactions.ts';
import { WHALE_JUMP_LEAD_MS } from '../wildlife.ts';
import { dogWalkerDialogue } from '../companions.ts';
import {
  FACTORY_CHAIRS,
  GOBLIN_INCUBATOR,
} from '../goblin-town.ts';
import { houseClimb } from '../search-houses.ts';
import { ATV_RAMP_KIND, ATV_RENTAL, hasATVRental } from '../atv.ts';
import { unusualPastorDialogue } from '../berkeley-dialogue.ts';
import churchDialogue from '../../content/dialogues/other/berkeley-church.json' with { type: 'json' };
import girardDialogue from '../../content/dialogues/other/rene-girard.json' with { type: 'json' };
import { NIGHTLIFE, complimentNightlifeDance, inNightlife, nightlifeRebuff } from '../nightlife.ts';
import { TAHOE_PELTS, TAHOE_PELT_PRICES } from '../config/tahoe-pelts.ts';
import { WINDSURF_LAUNCH } from '../windsurfing.ts';
import { SURF_TRICKS } from '../surfing.ts';
import { BURNING_MAN, burningManDialogue, type BurningManAction } from '../burning-man.ts';

/** Interactions services for the browser scene.
 * Dependencies are explicit live scene bindings, preserving initialization
 * order without globals. This module only reads bindings when a method runs. */
export function createInteractions(context: WorldContext) {
  function openNPCDialogue(person: RuntimeDialogue & Partial<Actor>) {
    const speaker =
      context.approachingNPC ??
      context.merchants.find((npc) => npc.id === person.id) ??
      context.jailStaff.find((npc) => npc.id === person.id) ??
      (typeof person.x === 'number' && typeof person.z === 'number' ? person : null);
    const owner =
      person.editorKey ||
      (person.id
        ? 'actor:' + person.id
        : context.approachingNPC?.id
          ? 'actor:' + context.approachingNPC.id
          : null);
    if (owner) {
      person = { ...person, editorKey: owner };
      applyEntityEdits(person, owner);
    }
    const offer = (label: string, op: string) => ({
      label,
      accept: () => serverCommand(context.multiplayer, 'inventory', { op }),
      contentNodeId: 'world.interactions.offer.node-1',
      actionId: 'world.interactions.offer.action-2' + ':' + [op].join(':'),
    });
    if (person.questRole === 'armorer')
      person = {
        ...person,
        choices: [...dialogueChoices(person), offer('Buy 20 akimbo rounds · 5 coins', 'buyAmmo')],
        contentNodeId: 'world.interactions.openNPCDialogue.node-3',
      };
    const dialogue = compileEntityDialogue(person, owner || '', context);
    if (person.questRole === 'armorer')
      dialogue.choices = [
        ...dialogueChoices(dialogue),
        { ...offer('Buy 1 missile · ' + MISSILE_PRICE + ' coins', 'buyMissile'), repeat: true },
      ];
    if (context.quests.state.stochasticParrot === 'proof' && person.id && proofPrice(person.id)) {
      const id = person.id;
      dialogue.choices = [
        proofBuyerChoice(id, () => parrotQuestCommand('sell', { id })),
        ...dialogueChoices(dialogue),
      ];
    }
    return context.dialogue.open(
      dialogue,
      speaker
        ? (canvas) => drawNPCChatHead(canvas, speaker, context.npcRevealed(speaker))
        : undefined,
    );
  }

  function guildStatus() {
    return {
      visits: 0,
      member: false,
      ...context.multiplayer?.state.guild,
      peptides: context.multiplayer?.state.inventory?.peptides || 0,
    };
  }

  function sightById(id: string) {
    return context.sights.find((s) => s.id === id);
  }

  function playerWeapon() {
    return selectedWeapon(context.playerLook.weapon, context.economy.state);
  }

  function attackWildMonster(npc: Actor) {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.secretWorld?.bomber.state.active ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    closeMenu();
    closeReader();
    releaseNPC();
    context.fishing.cancel();
    if (context.bike.riding) parkBike();
    parkMotorcycle(false);
    context.skateboard.riding = false;
    setDancing(false);
    context.alienCombat = null;
    context.expeditions.stop();
    context.wildTarget = null;
    context.action = null;
    context.destination = null;
    context.player.path = [];
    context.player.speed = 0;
    context.multiplayerWorld.command('attack', { id: npc.id, weapon: playerWeapon() });
    return true;
  }

  function petBear(npc: Actor): boolean {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.secretWorld?.bomber.state.active ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    return approachMovingTarget({
      target: () => (npc.hp === 0 ? null : npc),
      inReach: () =>
        besideBear({ x: context.player.x + 0.5, z: context.player.y + 0.5 }, npc) &&
        context.canTravel(context.player.x, context.player.y, npc.x - 0.5, npc.z - 0.5, true),
      approach: () =>
        bearPettingApproach({
          from: context.player,
          bear: npc,
          free: context.landClearAt,
          canTravel: context.canTravel,
          pathTo: context.pathTo,
        }),
      perform: async () => {
        context.wildTarget = null;
        context.expeditions.stop();
        setDancing(false);
        if (context.bike.riding) parkBike();
        parkMotorcycle(false);
        context.skateboard.riding = false;
        const result = await context.multiplayer.command('petBear', { id: npc.id });
        if (result.ok) {
          context.player.angle = Math.atan2(
            npc.z - context.player.y - 0.5,
            npc.x - context.player.x - 0.5,
          );
          context.player.gesture = {
            name: contentText('world.interactions.finish.name-8', {}),
            started: performance.now(),
            duration: 1500,
          };
        }
        return result;
      },
    });
  }

  function buyBattleaxe() {
    return { ok: true, pending: true, promise: serverCommand(context.multiplayer, 'buyBattleaxe') };
  }

  function expeditionEvent(e: ExpeditionEvent) {
    if (context.headless) return;
    if (e.message && e.type !== 'damage' && e.type !== 'shot')
      announce(
        e.message,
        e.type === 'illegal' ? 'Police' : e.type === 'damage' ? 'Combat' : 'Adventure',
      );
    if (e.type === 'illegal') {
      context.chase.start();
      context.$('sf-wanted').hidden = false;
    }
    if (e.type === 'shot' && e.target) {
      context.combatFeedback.hit(e.target, e.damage!, e.hp!, e.max!);
      context.combatFeedback.show(
        context.player,
        context.health.state.hp,
        context.health.state.max,
      );
      context.player.angle = Math.atan2(
        e.target.z - context.player.y - 0.5,
        e.target.x - context.player.x - 0.5,
      );
      context.player.gesture = {
        name: contentText('world.interactions.expeditionEvent.name-9', {}),
        started: performance.now(),
        duration: 450,
      };
    }
    if (e.type === 'boarded') {
      parkMotorcycle(false);
      if (context.bike.riding) parkBike();
      context.skateboard.riding = false;
      context.alienCombat = null;
      setDancing(false);
      context.player.path = [];
      context.player.speed = 0;
      context.action = null;
      context.destination = null;
      closeMenu();
      context.setCamera(0.65, 0.8);
    }
    if (e.type === 'disembarked' && context.pequodSite) {
      Object.assign(context.player, context.pequodSite.entry);
      context.player.path = [];
      context.player.speed = 0;
    }
    if (e.type === 'disembarked' && context.secretWorld?.kind === 'kraken')
      secretAction(context.secretWorld.leave());
    if (e.type === 'damage') {
      context.combatFeedback.hit(context.player, e.damage!, e.hp!, e.max!);
      if (e.target) context.combatFeedback.show(e.target, e.target.hp!, e.target.max!);
      context.updateAdventureUI();
    }
    if (e.type === 'death') beginCapture('alien', respawnAtHospital);
    if (e.type === 'cape') context.updateCapeControl();
  }

  function talkExpeditionNPC(npc: Actor) {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    context.expeditions.stop();
    closeMenu();
    closeReader();
    const open = () =>
      openNPCDialogue(
        npc.expeditionRole === 'scientist'
          ? scientistDialogue(npc, context.expeditions)
          : ahabDialogue(npc, context.expeditions),
      );
    if (context.expeditions.ship.aboard && npc === context.ahabNPC) {
      open();
      return true;
    }
    return approachNPC(npc, open);
  }

  function attackExpeditionTarget(npc: Actor) {
    if ((['cow', 'raptor'] satisfies [string, string]).includes(npc.combatKind || ''))
      return attackWildMonster(npc);
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (npc.combatKind !== 'kraken' || !context.expeditions.ship.aboard) return false;
    const weapon = playerWeapon();
    if (!isProjectileWeapon(weapon)) {
      announce(
        contentText('world-message.src.world.interactions.equip-your-railgun-to-fight-the-kraken'),
        'Equipment',
      );
      return false;
    }
    closeMenu();
    const result = context.expeditions.attack(npc, weapon);
    if (result.message) announce(result.message, ITEM_STATS[weapon].name);
    context.canvas.focus({ preventScroll: true });
    return result.ok || result.cooldown;
  }

  function nearestExpeditionPoint(
    x: number,
    y: number,
    radius: number,
    predicate: ((x: number, y: number) => boolean) | undefined,
  ) {
    if (context.marinLand?.onLand(x + 0.5, y + 0.5))
      return context.marinLand.nearest(x, y, radius, predicate);
    return y >= context.N - 1.5
      ? context.airship.nearest(x, y, radius, predicate)
      : context.nearestNavigation(x, y, radius, predicate);
  }

  function collectExpeditionLoot(item: InteractionSight) {
    if (!isLootTarget(item)) return false;
    if (context.capture.state.active || context.chase?.state.jailed) return false;
    closeMenu();
    const collect = () => {
      const r = context.expeditions.collect(item);
      if (!('pending' in r && r.pending) && r.message) announce(r.message, 'Loot');
      context.updateAdventureUI();
      return r.ok;
    };
    const distance = Math.hypot(item.x - context.player.x - 0.5, item.z - context.player.y - 0.5);
    if (context.expeditions.ship.aboard)
      return item.lootKind === 'kraken' && distance < 2 ? collect() : false;
    if (context.airship.state.active) {
      const floor = item.base ?? context.characterGround(item.x, item.z);
      return distance < 1.5 && Math.abs(context.playerGround() - floor) < 2.5 ? collect() : false;
    }
    if (
      distance < 1.5 &&
      (item.lootKind !== 'raptor' ||
        context.canTravel(context.player.x, context.player.y, item.x - 0.5, item.z - 0.5))
    )
      return collect();
    const point = nearestExpeditionPoint(
      item.x - 0.5,
      item.z - 0.5,
      1.3,
      (x: number, y: number) =>
        context.landClearAt(x, y) && (item.lootKind !== 'raptor' || !!context.pathTo(x, y)),
    );
    return point ? walkTo(point.x, point.y, collect) : false;
  }

  function releaseTiger() {
    {
      context.multiplayerWorld.releaseTiger();
      return true;
    }
  }

  function beginCapture(
    kind: string,
    complete: { (rehabilitated?: boolean): void; (rehabilitated?: boolean): void; (): void },
  ) {
    if (context.capture.state.active) return;
    context.social.cancelPitch();
    context.expeditions.stop();
    context.fishing.cancel();
    context.forwardRoll.cancel();
    context.skateboard.riding = false;
    context.alienCombat = null;
    parkMotorcycle(false);
    if (context.ferrari?.state.riding) parkFerrari();
    if (context.training) stopTraining();
    setDancing(false);
    context.questMenu?.close();
    context.closeCharacter();
    const base = context.playerGround(true);
    if (
      !context.capture.start(kind, base, () => {
        context.world.inert = false;
        complete();
      })
    )
      return;
    context.tech.losePhone(kind === 'police' ? 'arrest' : 'death');
    closeMenu();
    closeReader();
    context.closeHelp();
    context.dialogue.close();
    context.aiInterview.close();
    context.keys.clear();
    context.pointers.clear();
    clearTimeout(context.pressTimer);
    context.action = null;
    context.destination = null;
    context.player.path = [];
    context.player.speed = 0;
    context.player.motion = 0;
    context.player.moving = false;
    context.player.gesture = null;
    context.playerSpeechUntil = 0;
    if (context.bike.riding) {
      context.bike.x = context.player.x;
      context.bike.y = context.player.y;
      context.bike.riding = false;
    }
    context.waveSurf.stop();
    context.surf.cancelJump();
    context.surf.state.riding = false;
    context.tahoe.reset();
    context.rope.reset();
    context.sutroClimb.cancel();
    context.world.inert = true;
  }

  function respawnAtHospital(rehabilitated = false) {
    context.secretWorld?.reset();
    if (context.multiplayer?.state.connected && !rehabilitated)
      context.multiplayer.command('respawn');
    context.social.cancelPitch();
    if (!rehabilitated) context.tech.losePhone('death');
    context.expeditions.abandonShip();
    context.health.restore();
    context.combatFeedback.clear();
    context.alienCombat = null;
    context.forwardRoll.cancel();
    context.action = null;
    context.destination = null;
    context.dialogue.close();
    closeMenu();
    closeReader();
    context.closeHelp();
    context.keys.clear();
    context.pointers.clear();
    clearTimeout(context.pressTimer);
    context.gesture = false;
    context.rocket.cancel();
    context.rope.reset();
    context.airship.cancel();
    context.sutroClimb.cancel();
    context.tahoe.reset();
    context.waveSurf.stop();
    context.surf.cancelJump();
    context.surf.state.riding = false;
    context.bike.riding = false;
    context.currentInterior = null;
    context.readerPlace = null;
    context.playerSpeechUntil = 0;
    if (context.chase) {
      context.chase.state.wanted = false;
      context.chase.state.jailed = false;
      context.chase.state.officers = [];
    }
    context.$('sf-wanted').hidden = true;
    context.$('sf-custody').hidden = true;
    const entry = requiredValue(sightById('ucsf'), 'Missing authored entity: ucsf').entry;
    Object.assign(context.player, {
      x: entry.x,
      y: entry.y,
      path: [],
      speed: 0,
      moving: false,
      motion: 0,
      phase: 0,
      runBlend: 0,
      vx: 0,
      vy: 0,
      gesture: null,
      angle: Math.PI,
    });
    for (const input of context.world.querySelectorAll<HTMLButtonElement>(
      '#sf-map-button,#sf-bike-button,.sf-place-marker',
    ))
      input.disabled = false;
    context.updateClimbButton();
    context.updateRocketControls();
    context.updateAirshipButton();
    context.updateSurfButton();
    context.updateBikeButton();
    context.updateTahoeButton();
    context.setCamera(-Math.PI * 0.75 - 0.18, 1.08);
    context.drawMini();
    announce(
      rehabilitated
        ? contentText(
            'world-message.src.world.interactions.rehabilitation-complete-you-arrive-outside-ucsf-in-a-completel',
          )
        : contentText(
            'world-message.src.world.interactions.you-have-died-and-respawned-at-ucsf-hospital',
          ),
      'Hospital',
    );
    context.canvas.focus({ preventScroll: true });
  }

  function airshipUnavailable() {
    if (context.clickAttempt) context.clickAttempt.worked = false;
    announce(
      contentText(
        'world-message.src.world.interactions.return-the-airship-to-the-terminal-before-using-a-vehicle-or-e',
      ),
    );
    return false;
  }

  function boardAirship(
    price = context.multiplayerWorld?.sharedAirship?.rentalPrice ?? AIRSHIP_RULES.initialPrice,
  ) {
    if (context.chase?.state.jailed || context.sutroClimb.state.active || context.surf.state.riding)
      return false;
    const entry = AIRSHIP_TERMINAL.boarding;
    if (Math.hypot(context.player.x - entry.x, context.player.y - entry.y) > 0.08) {
      closeReader();
      closeMenu();
      return walkTo(entry.x, entry.y, () => boardAirship(price));
    }
    if (context.bike.riding) parkBike();
    parkMotorcycle(false);
    closeReader();
    closeMenu();
    serverCommand(context.multiplayer, 'airshipBoard', { price }).then((result) => {
      if (!result.ok) {
        announce(result.message, 'Airship');
        return;
      }
      context.rope.reset();
      context.ropeReturnHome = false;
      context.basket.reset();
      context.basketArrival = null;
      context.keys.clear();
      context.player.path = [];
      context.player.speed = 0;
      context.player.gesture = null;
      context.action = null;
      context.destination = null;
      context.currentInterior = null;
      context.updateAirshipButton();
      announce(
        contentText(
          'world-message.src.world.interactions.you-board-the-airships-white-flight-basket-click-its-floor-to',
        ),
        'Pilot',
      );
      context.canvas.focus({ preventScroll: true });
    });
    return true;
  }

  function walkInBasket(point: WorldPoint) {
    setDancing(false);
    context.basketArrival = null;
    const ok = context.basket.walkTo(point.x, point.z);
    if (ok) {
      closeMenu();
      context.canvas.focus({ preventScroll: true });
    }
    return ok;
  }

  function showAirshipMenu(sx = context.width / 2, sy = context.height / 2) {
    closeMenu();
    const menu = context.$('sf-context');
    menu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'sf-context-title';
    const titleLabel = context.airship.state.active ? 'Airship' : 'Private Jet Terminal';
    const airshipTarget = {
      label: contentText('world.interactions.showAirshipMenu.label-10', {}),
      kind: 'object',
    };
    setActionText(title, titleLabel, [{ label: titleLabel, kind: 'object' }]);
    menu.append(title);
    const floor = context.flying()
      ? context.basket.pick(
          context.mouseRay(sx, sy),
          context.airship.state.position!,
          context.airship.state.heading,
        )
      : null;
    const sharedShip = context.multiplayerWorld?.sharedAirship,
      price = sharedShip?.rentalPrice ?? AIRSHIP_RULES.initialPrice;
    const rentalLabel = sharedShip?.active
      ? 'Board as passenger'
      : sharedShip?.reservedFor === context.multiplayer?.state.id
        ? 'Board prepaid airship'
        : 'Rent airship · ' + price + ' coins';
    const floatHere = () => {
      const p = context.tileAt(sx, sy);
      return walkTo(p.x, p.y);
    };
    const choices: [string, () => unknown][] = context.airship.state.active
      ? [
          floor ? ['Walk here', () => walkInBasket(floor)] : ['Float here', floatHere],
          [
            'Fly to Tahoe',
            () => {
              if (context.rope.state.deployed) {
                announce(
                  contentText(
                    'world-message.src.world.interactions.retract-the-rope-before-flying',
                  ),
                );
                return false;
              }
              context.airship.flyTo(TAHOE.base.x, TAHOE.base.z);
              context.destination = { x: TAHOE.base.x - 0.5, y: TAHOE.base.z - 0.5 };
              announce(
                contentText(
                  'world-message.src.world.interactions.flying-northeast-across-california-to-lake-tahoe-this-is-a-lon',
                ),
                'Pilot',
              );
              return true;
            },
          ],
          ['Rope options', showRopeMenu],
          ['Return to terminal', useAirship],
          ...(floor ? [['Float here', floatHere] satisfies [string, () => unknown]] : []),
        ]
      : [
          [rentalLabel, () => boardAirship(price)],
          ['Examine terminal', () => examine(sightById('airship'))],
        ];
    if (!context.airship.state.active)
      choices.splice(1, 0, [
        'Talk-To Airship attendant',
        () =>
          talkAirshipAttendant(context.merchants.find((n) => n.id === 'airship-rental-attendant')),
      ]);
    for (const [label, fn] of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      setActionText(
        button,
        label,
        [
          { label: 'Airship attendant', kind: 'npc' },
          { label: 'Tahoe', kind: 'object' },
          { label: contentText('world.interactions.showAirshipMenu.label-11', {}), kind: 'object' },
          { label: contentText('world.interactions.showAirshipMenu.label-12', {}), kind: 'object' },
          airshipTarget,
        ],
        label === 'Board as passenger' ? airshipTarget : undefined,
      );
      button.addEventListener('click', (e) =>
        clicked(e.clientX, e.clientY, () => {
          closeMenu();
          return fn();
        }),
      );
      menu.append(button);
    }
    promoteWalkAction(menu);
    revealContextMenu(menu, sx, sy);
    return true;
  }

  function useAirship() {
    if (context.tahoe.state.mode !== 'ground') return false;
    if (context.chase?.state.jailed) return false;
    if (context.rope.climbing) return false;
    if (context.rope.onGround) {
      context.ropeReturnHome = true;
      return climbRope(false);
    }
    if (context.airship.state.active) {
      if (context.rope.state.deployed) return showRopeMenu();
      closeMenu();
      closeReader();
      context.basketArrival = null;
      context.basket.state.target = null;
      context.airship.returnHome();
      context.destination = { x: context.airship.home.x - 0.5, y: context.airship.home.z - 0.5 };
      context.action = null;
      context.updateAirshipButton();
      announce(
        contentText(
          'world-message.src.world.interactions.returning-to-the-private-jet-terminal-the-airship-will-descend',
        ),
        'Pilot',
      );
      context.canvas.focus({ preventScroll: true });
      return true;
    }
    if (context.sutroClimb.state.active) return climbUnavailable();
    if (context.surf.state.riding) {
      if (context.clickAttempt) context.clickAttempt.worked = false;
      announce(
        contentText(
          'world-message.src.world.interactions.return-to-shore-before-renting-an-airship',
        ),
      );
      return false;
    }
    const entry = AIRSHIP_TERMINAL.entry;
    if (Math.hypot(context.player.x - entry.x, context.player.y - entry.y) < 1)
      return showAirshipMenu();
    closeReader();
    closeMenu();
    const accepted = walkTo(entry.x, entry.y, showAirshipMenu);
    if (accepted)
      announce(
        contentText(
          'world-message.src.world.interactions.walking-south-to-the-private-jet-terminal-and-airship-rental-s',
        ),
        'Pilot',
      );
    context.canvas.focus({ preventScroll: true });
    return accepted;
  }

  function readLoreBook(site: InteractionSight) {
    if (!hasSiteEntry(site)) return false;
    if (!context.multiplayer?.state.connected || !canUseTablet()) return false;
    closeMenu();
    closeReader();
    return walkTo(site.entry.x, site.entry.y, () => {
      context.dialogue.close();
      context.closeCharacter();
      context.closeHelp();
      context.readerPlace = site;
      context.world.classList.add('sf-reading');
      const book = renderLoreBook(
        context.$('sf-reader-content'),
        requiredValue(site.bookId, 'Readable book ID'),
      );
      context.$('sf-reader').dataset.lore = 'true';
      context.$('sf-reader-title').textContent = book.title;
      context.$('sf-reader-category').textContent = 'From a local bookshelf';
      context.$('sf-reader-description').textContent = book.subtitle;
      context.$('sf-reader').hidden = false;
      context.$('sf-reader-shade').hidden = true;
      context.$('sf-reader').scrollTop = 0;
    });
  }

  function searchChurch(site: InteractionSight) {
    if (!hasSiteEntry(site) || !canUseTablet()) return false;
    closeMenu();
    const read = () =>
      openNPCDialogue({ name: 'Unusual Church', contentResolved: true, ...churchDialogue.search });
    if (context.activeInstituteRoom()?.id === site.id) return read();
    return walkTo(site.entry.x, site.entry.y, read);
  }

  function searchHouseStorage(site: InteractionSight) {
    if (!hasSiteEntry(site)) return false;
    if (!context.multiplayerWorld || context.capture.state.active || context.chase?.state.jailed)
      return false;
    closeMenu();
    closeReader();
    return walkTo(site.entry.x, site.entry.y, async () => {
      const result = await context.multiplayer.command('searchHouse', { id: site.id });
      if (result.message) announce(result.message, 'You');
      if (result.ok)
        context.player.gesture = {
          name: contentText('world.interactions.searchHouseStorage.name-13', {}),
          started: performance.now(),
          duration: 1200,
        };
    });
  }

  function useRocket(sight: Site | undefined, npcInput: Actor | null = null) {
    const npc =
      npcInput || context.merchants.find((n) => n.kind === 'crew' && n.siteId === sight?.id);
    if (!npc) return false;
    if (
      context.rocket.state.active ||
      context.chase?.state.jailed ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground' ||
      context.flying()
    )
      return false;
    const go = () => {
      closeMenu();
      closeReader();
      context.player.path = [];
      context.player.speed = 0;
      context.keys.clear();
      const toTahoe = requiredValue(sight, 'Rocket site').id === 'sf-spaceport';
      openNPCDialogue(
        configuredDialogue(
          'rocket',
          npc,
          {
            launch: () => ({
              ok: true,
              after: () => {
                serverCommand(context.multiplayer, 'travel', { kind: 'rocket' }).then((result) => {
                  if (!result.ok) {
                    announce(
                      result.message ||
                        contentText(
                          'world-message.src.world.interactions.unable-to-launch-please-speak-to-the-attendant-again',
                        ),
                      'SpaceX',
                    );
                    return;
                  }
                  context.rope.reset();
                  context.airship.cancel();
                  context.waveSurf.stop();
                  context.surf.cancelJump();
                  context.surf.state.riding = false;
                  context.bike.riding = false;
                  context.tahoe.reset();
                  context.currentInterior = null;
                  context.action = null;
                  context.destination = null;
                  context.setCamera(Math.PI * 0.75 + 0.3, 0.72);
                  context.setZoom(0.85);
                  context.updateAirshipButton();
                  context.updateTahoeButton();
                  context.updateRocketControls();
                  context.drawMini();
                  announce(
                    contentText(
                      'world-message.src.world.interactions.you-board-the-reusable-rocket-next-stop',
                      { value1: String(toTahoe ? 'Lake Tahoe.' : 'San Francisco.') },
                    ),
                    'SpaceX',
                  );
                });
              },
            }),
          },
          { destination: toTahoe ? 'to Lake Tahoe' : 'back to San Francisco' },
        ),
      );
    };
    return approachNPC(npc, go);
  }

  function useGondola(up = true) {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.chase?.state.jailed ||
      context.flying() ||
      context.rope.climbing ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    const entry = up ? context.tahoe.baseEntry : context.tahoe.summitEntry,
      start = () => {
        closeMenu();
        closeReader();
        context.player.path = [];
        context.player.speed = 0;
        context.action = null;
        context.destination = null;
        context.tahoe.gondola(up);
        context.updateTahoeButton();
        announce(
          up
            ? contentText(
                'world-message.src.world.interactions.you-board-the-gondola-the-mountain-rises-far-above-the-lake',
              )
            : contentText(
                'world-message.src.world.interactions.you-board-the-gondola-down-to-the-lakeside-station',
              ),
          'Gondola',
        );
      };
    if (Math.hypot(context.player.x - entry.x, context.player.y - entry.y) < 2) {
      start();
      return true;
    }
    return walkTo(entry.x, entry.y, start);
  }

  function rentSkis() {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.tahoe.state.rented) {
      announce(
        contentText(
          'world-message.src.world.interactions.your-skis-are-already-rented-for-this-visit',
        ),
      );
      return true;
    }
    return talkLiftAttendant(context.merchants.find((n) => n.kind === 'lift'));
  }

  function talkLiftAttendant(npc: Actor | undefined) {
    if (!npc) return false;
    if (
      !npc ||
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rope.climbing ||
      context.rocket.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue('ski-lift', npc, {
          rentSkis: async () => {
            if (context.tahoe.state.rented)
              return {
                ok: false,
                message: contentText(
                  'world-message.src.world.interactions.your-skis-are-already-rented-for-this-visit',
                ),
              };
            const result = await serverCommand(context.multiplayer, 'inventory', {
              op: 'trade',
              kind: 'skis',
            });
            if (result.ok) context.tahoe.state.rented = true;
            context.updateTahoeButton();
            return {
              ...result,
              message: result.ok
                ? contentText(
                    'world-message.src.world.interactions.your-skis-are-ready-use-ski-down-to-begin-your-descent',
                  )
                : result.message,
            };
          },
        }),
      ),
    );
  }

  function startSkiRun() {
    if (!context.tahoe.state.rented) return rentSkis();
    const start = () => {
      context.player.path = [];
      context.player.speed = 0;
      context.action = null;
      context.destination = null;
      context.tahoe.startSki();
      context.setCamera((-Math.PI * 3) / 4, 0.65);
      context.updateTahoeButton();
      announce(
        contentText(
          'world-message.src.world.interactions.you-push-off-click-to-steer-and-press-space-while-airborne-to',
        ),
        'Skiing',
      );
    };
    if (
      Math.hypot(
        context.player.x - context.tahoe.summitEntry.x,
        context.player.y - context.tahoe.summitEntry.y,
      ) < 1.2
    ) {
      start();
      return true;
    }
    return walkTo(context.tahoe.summitEntry.x, context.tahoe.summitEntry.y, start);
  }

  function useTahoeActivity() {
    if (context.tahoe.state.mode === 'ski') return context.tahoe.flip();
    if (context.tahoe.state.mode === 'gondola') return false;
    return Math.hypot(
      context.player.x + 0.5 - TAHOE.peak.x,
      context.player.y + 0.5 - TAHOE.peak.z,
    ) < 10
      ? context.tahoe.state.rented
        ? startSkiRun()
        : rentSkis()
      : useGondola(true);
  }

  type MovingInteraction = {
    target: () => WorldPoint | null;
    inReach: (target: WorldPoint) => boolean;
    approach: (target: WorldPoint) => Point | null;
    perform: () => void | Promise<CommandResult>;
    lastTarget?: WorldPoint;
    nextPlan: number;
    retryAfter: number;
    pending: boolean;
    routing: boolean;
  };
  let movingInteraction: MovingInteraction | null = null;

  function cancelMovingInteraction(stop = true) {
    if (!movingInteraction) return false;
    movingInteraction = null;
    context.destination = null;
    if (stop && serverConnected(context.multiplayer)) context.multiplayer.command('stopMoving');
    return true;
  }

  function updateMovingInteraction(now: number) {
    const interaction = movingInteraction;
    if (!interaction || interaction.pending) return;
    const target = interaction.target();
    if (!target) {
      cancelMovingInteraction();
      return;
    }
    if (now >= interaction.retryAfter && interaction.inReach(target)) {
      interaction.pending = true;
      context.destination = null;
      if (serverConnected(context.multiplayer) && (interaction.lastTarget || context.player.moving))
        context.multiplayer.command('stopMoving');
      Promise.resolve(interaction.perform()).then((result) => {
        if (movingInteraction !== interaction) return;
        if (result?.retryApproach) {
          interaction.pending = false;
          interaction.lastTarget = undefined;
          interaction.retryAfter = performance.now() + 200;
          interaction.nextPlan = 0;
        } else {
          movingInteraction = null;
          if (result?.message) announce(result.message, result.ok ? 'World' : 'Server');
        }
      });
      return;
    }
    if (!serverConnected(context.multiplayer)) {
      cancelMovingInteraction(false);
      return;
    }
    if (interaction.routing || now < interaction.nextPlan) return;
    if (
      interaction.lastTarget &&
      context.destination &&
      Math.hypot(target.x - interaction.lastTarget.x, target.z - interaction.lastTarget.z) < 0.65
    )
      return;
    interaction.nextPlan = now + 350;
    const goal = interaction.approach(target);
    if (!goal) return;
    interaction.lastTarget = { x: target.x, z: target.z };
    if (
      !walkTo(goal.x, goal.y, null, (x, z) => {
        interaction.routing = true;
        context.multiplayerWorld.moveTo(x, z, (result) => {
          interaction.routing = false;
          if (movingInteraction !== interaction || interaction.pending) return;
          context.destination =
            result.ok && result.goal ? { x: result.goal.x - 0.5, y: result.goal.z - 0.5 } : null;
        });
      })
    )
      cancelMovingInteraction();
  }

  function approachMovingTarget(
    options: Omit<
      MovingInteraction,
      'nextPlan' | 'retryAfter' | 'pending' | 'routing' | 'lastTarget'
    >,
  ) {
    cancelMovingInteraction();
    closeMenu();
    closeReader();
    if (context.dialogue.active) context.dialogue.close();
    context.action = null;
    movingInteraction = { ...options, nextPlan: 0, retryAfter: 0, pending: false, routing: false };
    updateMovingInteraction(performance.now());
    return true;
  }

  function approachNPC(
    npc: Actor | null | undefined,
    begin: () => void,
    { distance = 1.8, approach = context.merchantApproach } = {},
  ): boolean {
    if (!npc) return false;
    const open = () => {
      context.fishing.cancel();
      releaseNPC();
      context.approachingNPC = npc;
      npc.waiting = true;
      npc.speech = '';
      npc.speechUntil = 0;
      npc.hold = 2;
      npc.moving = false;
      npc.motion = 0;
      context.player.path = [];
      context.player.speed = 0;
      context.action = null;
      context.destination = null;
      context.keys.clear();
      if (!npc.seated && !npc.fixedFacing && Number.isFinite(npc.x) && Number.isFinite(npc.z))
        npc.angle = Math.atan2(context.player.y + 0.5 - npc.z, context.player.x + 0.5 - npc.x);
      begin();
    };
    return approachMovingTarget({
      target: () => (npc.hp === 0 || npc.expeditionDead ? null : npc),
      inReach: () =>
        distance === Infinity ||
        Math.hypot(context.player.x + 0.5 - npc.x, context.player.y + 0.5 - npc.z) < distance,
      approach: () => {
        const goal = approach(npc);
        return goal && Math.hypot(goal.x + 0.5 - npc.x, goal.y + 0.5 - npc.z) < distance
          ? goal
          : actorWalkPoint(npc) || goal;
      },
      perform: open,
    });
  }

  function releaseNPC() {
    if (context.approachingNPC) {
      if (!context.approachingNPC.thinking) context.approachingNPC.waiting = false;
      context.approachingNPC = null;
    }
  }

  function talkResearcher(npc: Actor) {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.chase?.state.jailed ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.rocket.state.active
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    closeReader();
    closeMenu();
    return approachNPC(npc, () =>
      openNPCDialogue(
        npc.id === 'ada-meridian'
          ? monkeyQuestDialogue(npc, context.quests, context.economy)
          : createResearchDialogue(npc),
      ),
    );
  }

  function talkRailWorker(npc: Actor | undefined) {
    if (!npc) return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.chase?.state.jailed || context.flying() || context.capture.state.active)
      return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () => openNPCDialogue(railWorkerDialogue()));
  }

  function stealQuestMonkey() {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.chase?.state.jailed ||
      context.flying() ||
      context.capture.state.active ||
      context.surf.state.riding
    )
      return false;
    const site = requiredValue(sightById('zoo-monkeys'), 'Missing authored entity: zoo-monkeys'),
      take = () => {
        const result = mapInteractionResult(context.quests.steal(), (receipt) => {
          if (receipt.ok) {
            context.player.path = [];
            context.player.speed = 0;
            context.action = null;
            context.destination = null;
            context.monkeyKeeper.start();
            announce(
              contentText(
                'world-message.src.world.interactions.stop-that-monkey-has-a-keeper-the-zookeeper-gives-chase',
              ),
              'Monkey Business',
            );
          }
          return receipt;
        });
        return result.ok;
      };
    closeMenu();
    if (Math.hypot(context.player.x - site.entry.x, context.player.y - site.entry.y) < 1.5)
      return take();
    return walkTo(site.entry.x, site.entry.y, take);
  }

  function parkMotorcycle(speak = true) {
    if (!context.motorcycle?.state.riding) return false;
    context.motorcycle.park(context.player.x, context.player.y, context.player.angle);
    context.player.speed = Math.min(context.player.speed, context.WALK_SPEED);
    if (!context.headless) {
      context.updateAdventureUI();
      if (speak)
        announce(
          contentText(
            'world-message.src.world.interactions.you-park-the-motorcycle-your-rental-remains-valid',
          ),
          'You',
        );
    }
    return true;
  }

  function useMotorcycle(actionName = 'ride') {
    if (
      !context.motorcycle ||
      context.chase?.state.jailed ||
      context.capture.state.active ||
      context.rocket.state.active ||
      context.flying() ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.surf.state.riding ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.motorcycle.state.riding) return parkMotorcycle();
    if (context.currentInterior) return false;
    closeMenu();
    closeReader();
    const begin = () => {
      if (context.bike.riding) parkBike();
      context.skateboard.riding = false;
      setDancing(false);
      context.player.path = [];
      context.player.speed = 0;
      context.action = null;
      context.destination = null;
      if (actionName === 'steal' && !context.motorcycle.state.rented) {
        announce(
          contentText(
            'world-message.src.world.interactions.you-try-to-steal-the-conveniently-parked-motorcycle-its-alarm',
          ),
          'You',
        );
        context.chase.start();
        context.$('sf-wanted').hidden = false;
        return true;
      }
      if (context.motorcycle.state.rented) {
        context.motorcycle.mount();
        context.updateAdventureUI();
        announce(
          contentText(
            'world-message.src.world.interactions.you-start-the-motorcycle-click-to-ride-m-parks',
          ),
          'You',
        );
        return true;
      }
      announce(
        contentText('world-message.src.world.interactions.you-have-not-rented-this-motorcycle'),
        'Motorcycle',
      );
      return true;
    };
    const p = context.motorcycle.state;
    if (Math.hypot(context.player.x - p.x, context.player.y - p.y) < 1.6) return begin();
    const target = context.motorcycleApproach();
    return target ? walkTo(target.x, target.y, begin) : false;
  }

  function talkMotorcycleClerk(npc: Actor | undefined) {
    if (!npc) return false;
    if (
      !npc ||
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue(
          context.motorcycle.state.rented ? 'motorcycle-rented' : 'motorcycle-rental',
          npc,
          {
            rent: () => {
              return mapInteractionResult(
                context.motorcycle.rent(context.economy, { pursued: context.quests.carrying }),
                (result) => {
                  context.updateAdventureUI();
                  return {
                    ...result,
                    message: result.ok
                      ? contentText(
                          'world-message.src.world.interactions.the-motorcycle-is-yours-to-ride-click-it-or-press-m-to-get-on',
                        )
                      : result.message,
                  };
                },
              );
            },
          },
        ),
      ),
    );
  }

  function canUseTablet() {
    return (
      !context.capture.state.active &&
      !context.chase?.state.jailed &&
      context.secretWorld?.kind === 'world' &&
      !context.secretWorld.bomber.state.active &&
      !context.flying() &&
      !context.rocket.state.active &&
      !context.surf.state.riding &&
      !context.rope.climbing &&
      !context.sutroClimb.state.active &&
      !context.bike.riding &&
      !context.motorcycle?.state.riding &&
      !context.ferrari?.state.riding &&
      !context.skateboard.riding &&
      context.tahoe.state.mode === 'ground'
    );
  }

  function talkTabletWizard(npc = context.tabletWizard) {
    if (!canUseTablet()) return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue('wizard', npc, {
          buyTablet: (id: string) => context.tabletService.buy(id),
        }),
      ),
    );
  }

  function talkYohji(npc: Actor | undefined) {
    if (!npc) return false;
    if (!canUseTablet()) return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue('yohji', npc, {
          tailor: () => ({
            ok: true,
            pending: true,
            promise: context.multiplayer.command('playerAction', { verb: 'tailorCloak' }),
          }),
        }),
      ),
    );
  }

  function useTeleportTablet(id: string) {
    context.tabletService.use(id).then((r) => {
      if (r.message) announce(r.message, 'Teleport');
      context.updateAdventureUI();
    });
  }

  function talkBanker(npc = context.banker) {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.secretWorld?.kind !== 'world' ||
      context.secretWorld.bomber.state.active ||
      context.flying()
    )
      return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () =>
      openNPCDialogue(
        bankerDialogue(npc, {
          open: () => requiredValue(context.bankMenu, 'Bank menu').open(),
          coffee: () => context.bankService.act('coffee'),
        }),
      ),
    );
  }

  function drinkBankCoffee() {
    context.bankService.act('drink').then((r) => {
      if (r.message) announce(r.message, 'Green Bank');
      context.updateAdventureUI();
    });
  }

  function changeMapInstance(message: {
    instance: { kind: string };
    position?: { x: number; z: number };
  }) {
    cancelMovingInteraction(false);
    if (context.headless) return;
    context.multiplayerWorld?.stopFollowing(true);
    context.expeditions.stop();
    context.alienCombat = null;
    context.fishing.cancel();
    context.forwardRoll.cancel();
    setDancing(false);
    context.keys.clear();
    if (message.instance.kind !== 'kraken') {
      context.expeditions.abandonShip();
      context.expeditions.state.loot = context.expeditions.state.loot.filter((n) => n.network);
    }
    closeReader();
    closeMenu();
    context.currentInterior = null;
    context.currentInstitute = null;
    context.readerPlace = null;
    context.destination = null;
    context.action = null;
    if (message.position)
      Object.assign(context.player, {
        x: message.position.x - 0.5,
        y: message.position.z - 0.5,
        path: [],
        speed: 0,
        moving: false,
        motion: 0,
      });
    if (context.chase) {
      Object.assign(context.chase.state, { wanted: false, officers: [] });
      context.$('sf-wanted').hidden = true;
    }
    for (const view of context.placeMarkerViews)
      view.button.hidden = message.instance.kind !== 'world';
    context.$('sf-hover').hidden = true;
    context.pickedCache = null;
    context.updateAdventureUI();
    context.updateCamera();
    context.drawMini();
  }

  function secretAction(result: ActionReceipt | Promise<ActionReceipt>) {
    if (result instanceof Promise) {
      result.then(() => {
        context.updateAdventureUI();
        context.canvas.focus({ preventScroll: true });
      });
      return true;
    }
    if (result.message) announce(result.message, 'Illuminati');
    context.updateAdventureUI();
    return result.ok !== false;
  }

  function talkOldMan(npc = context.oldMan) {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.secretWorld?.kind !== 'world' ||
      !guildStatus().member
    )
      return false;
    closeMenu();
    return approachNPC(npc, () =>
      openNPCDialogue(
        context.secretWorld.initiated
          ? configuredDialogue('illuminati-member', npc)
          : {
              ...npc,
              intro: contentText('world.interactions.talkOldMan.intro-15', {}),
              choice: contentText('world.interactions.talkOldMan.choice-16', {}),
              decline: contentText('world.interactions.talkOldMan.decline-17', {}),
              accept: () => context.secretWorld.join(),
              contentNodeId: 'world.interactions.talkOldMan.node-14',
              introTextId: 'world.interactions.talkOldMan.intro-15',
              introTextValues: {},
              choiceTextId: 'world.interactions.talkOldMan.choice-16',
              choiceTextValues: {},
              declineTextId: 'world.interactions.talkOldMan.decline-17',
              declineTextValues: {},
              actionId: 'world.interactions.talkOldMan.action-18',
            },
      ),
    );
  }

  function useSecretSite(sight: InteractionSight) {
    if (!hasSiteEntry(sight)) return false;
    if (context.capture.state.active || context.chase?.state.jailed) return false;
    const action =
      sight.kind === 'secret-stairs'
        ? () => context.secretWorld.enterCave()
        : sight.kind === 'cave-exit'
          ? () => context.secretWorld.leave()
          : () => context.secretWorld.boardBomber();
    if (sight.kind === 'secret-stairs' && !context.secretWorld.initiated) {
      announce(
        contentText('world-message.src.world.interactions.you-do-not-have-access-to-this-passage'),
      );
      return false;
    }
    if (
      (sight.kind === 'secret-stairs' || sight.kind === 'cave-exit') &&
      Math.hypot(context.player.x - sight.entry.x, context.player.y - sight.entry.y) < 0.75
    ) {
      closeMenu();
      return secretAction(action());
    }
    return walkTo(sight.entry.x, sight.entry.y, () => secretAction(action()));
  }

  function talkGuildRay(npc: Actor | undefined) {
    if (!npc) return false;
    if (
      context.chase?.state.jailed ||
      context.capture.state.active ||
      context.flying() ||
      context.surf.state.riding ||
      context.rocket.state.active ||
      context.rope.climbing ||
      context.sutroClimb.state.active
    )
      return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () =>
      openNPCDialogue(
        guildDialogue(npc, {
          status: guildStatus,
          act: (kind: string) => {
            return serverCommand(
              context.multiplayer,
              kind === 'donate' ? 'guildDonate' : 'guildCheckIn',
            );
          },
        }),
      ),
    );
  }

  function talkMarketFarmer(npc: Actor | undefined) {
    if (!npc) return false;
    if (!canUseTablet()) return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, () => {
      const person = marketFarmerDialogue(npc);
      if (npc.id !== GOBLIN_PHONE_BUYER || !equipmentOwned(context.economy.state, 'goblin-phone'))
        return openNPCDialogue(person);
      return openNPCDialogue({
        ...person,
        contentResolved: true,
        choices: [
          {
            label: 'Sell Goblin Phone · ' + GOBLIN_PHONE_RESALE + ' coins',
            accept: () =>
              serverCommand(context.multiplayer, 'inventory', {
                op: 'trade',
                kind: 'goblin-phone-sale',
              }),
          },
          ...dialogueChoices(person),
        ],
      });
    });
  }

  function talkAirshipAttendant(npc: Actor | undefined) {
    if (!npc) return false;
    if (!npc || !canUseTablet()) return false;
    closeMenu();
    closeReader();
    return approachNPC(npc, async () => {
      const initial = await serverCommand(context.multiplayer, 'airshipStatus');
      if (!initial.ok) {
        announce(initial.message, 'Airship');
        return;
      }
      let status = requiredValue(initial.airship, 'Airship rental status');
      context.contentAirshipStatus = status;
      const act = async (action: string, args = {}) => {
        const result = await serverCommand(context.multiplayer, action, args);
        if (result.airship) status = result.airship;
        context.contentAirshipStatus = status;
        return result;
      };
      openNPCDialogue(
        airshipAttendantDialogue(npc, {
          status: () => status,
          now: () => Date.now() + (context.multiplayer.state.serverOffset || 0),
          refresh: () => act('airshipStatus'),
          recall: (price: number) => act('airshipRecall', { price }),
          buyGrapple: context.multiplayer.state.grapplingHook ? undefined : () => act('buyGrapple'),
          rent: boardAirship,
        }),
      );
    });
  }

  function talkMerchant(npc: Actor) {
    if (npc.kind === 'airship-agent') return talkAirshipAttendant(npc);
    if (npc.kind === 'yohji') return talkYohji(npc);
    if (npc.kind === 'hiking-supplier')
      return approachNPC(npc, () =>
        openNPCDialogue(
          configuredDialogue('hiking-supplies', npc, {
            buy: () => ({
              ok: true,
              pending: true,
              promise: context.multiplayer.command('inventory', { op: 'buyBackpack' }),
            }),
          }),
        ),
      );
    if (npc.kind === 'stockbroker')
      return approachNPC(npc, () => openNPCDialogue(growthDialogue(npc, context.growthService)));
    if (npc.kind === 'duel-referee')
      return approachNPC(npc, () => {
        announce(
          contentText(
            'world-message.src.world.interactions.equal-coin-stakes-and-a-fair-50-50-flip-both-players-must-agre',
          ),
          'Referee',
        );
        context.duelMenu?.open();
      });
    if (npc.kind === 'market-farmer') return talkMarketFarmer(npc);
    if (npc.kind === 'tablet-wizard') return talkTabletWizard(npc);
    if (npc.kind === 'guild-master') return talkGuildRay(npc);
    if (npc.socialActor) {
      if (context.ferrari?.state.riding) return parkCarFirst();
      if (
        context.chase?.state.jailed ||
        context.capture.state.active ||
        context.flying() ||
        context.surf.state.riding ||
        context.rocket.state.active ||
        context.rope.climbing ||
        context.sutroClimb.state.active
      )
        return false;
      closeMenu();
      closeReader();
      return approachNPC(
        npc,
        () => {
          if (npc.kind === 'twitter-poster') openNPCDialogue(npc);
          else if (npc.kind === 'twitter-worker') {
            npc.speech = 'One envelope in, one bottle out. Please do not tap the backend.';
            npc.speechUntil = performance.now() + 4000;
          } else
            openNPCDialogue(
              softwareSalesDialogue(npc, context.economy, context.social, context.inebriation),
            );
        },
        { distance: 1.25 },
      );
    }
    if ((['tim-apple', 'robotaxi-sales'] satisfies [string, string]).includes(npc.kind || '')) {
      if (context.ferrari?.state.riding) return parkCarFirst();
      if (
        context.chase?.state.jailed ||
        context.capture.state.active ||
        context.flying() ||
        context.surf.state.riding ||
        context.rocket.state.active ||
        context.rope.climbing ||
        context.sutroClimb.state.active
      )
        return false;
      closeMenu();
      closeReader();
      return approachNPC(npc, () =>
        openNPCDialogue(techMerchantDialogue(npc, context.tech, context.economy)),
      );
    }
    if (npc.kind === 'haberdasher') {
      if (context.ferrari?.state.riding) return parkCarFirst();
      if (
        context.chase?.state.jailed ||
        context.capture.state.active ||
        context.flying() ||
        context.surf.state.riding ||
        context.rocket.state.active ||
        context.rope.climbing ||
        context.sutroClimb.state.active
      )
        return false;
      closeMenu();
      closeReader();
      return approachNPC(npc, () =>
        openNPCDialogue(haberdasherDialogue(npc, context.economy, context.wearHat)),
      );
    }
    if (npc.kind === 'salt-activist') {
      if (context.ferrari?.state.riding) return parkCarFirst();
      if (
        context.chase?.state.jailed ||
        context.capture.state.active ||
        context.flying() ||
        context.surf.state.riding ||
        context.rocket.state.active ||
        context.rope.climbing ||
        context.sutroClimb.state.active
      )
        return false;
      closeMenu();
      closeReader();
      return approachNPC(npc, () =>
        openNPCDialogue(saltActivistDialogue(npc, context.saltMail, context.economy)),
      );
    }
    if (npc.expeditionRole) return talkExpeditionNPC(npc);
    if (npc.kind === 'fuel-attendant') return useFuel(sightById(npc.siteId || ''), npc);
    if (npc.kind === 'motorcycle-clerk') return talkMotorcycleClerk(npc);
    if (npc.kind === 'lift') return talkLiftAttendant(npc);
    if (npc.kind === 'recruiter') return talkLabRecruiter();
    if (npc.kind === 'deli') return talkDeli();
    if (npc.kind === 'burger-clerk') return talkBurger(npc);
    if (npc.kind === 'bartender') return talkBeer();
    if (npc.questRole) return talkQuestNPC(npc);
    if (npc.researcher) return talkResearcher(npc);
    if (npc.kind === 'rail-worker') return talkRailWorker(npc);
    if (npc.kind === 'capital') return talkCapital();
    if (npc.kind === 'crew') return useRocket(sightById(npc.siteId || ''), npc);
    if (context.chase?.state.jailed || context.rope.climbing) return false;
    if (context.flying() && npc.kind !== 'passenger') return airshipUnavailable();
    closeReader();
    closeMenu();
    return approachNPC(
      npc,
      () =>
        openNPCDialogue(
          npc.kind === 'tax'
            ? taxDialogue(context.economy)
            : configuredDialogue(npc.kind || '', npc, {
                board: () => serverCommand(context.multiplayer, 'airshipInvite'),
                buyTinfoil: () =>
                  serverCommand(context.multiplayer, 'inventory', { op: 'buyTinfoil' }),
              }),
        ),
      { distance: npc.kind === 'passenger' ? Infinity : 1.8 },
    );
  }

  function talkQuestNPC(npc: Actor | undefined) {
    if (!npc) return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.chase?.state.jailed ||
      context.capture.state.active ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    closeMenu();
    closeReader();
    const begin = () => {
      parkMotorcycle(false);
      context.skateboard.riding = false;
      context.alienCombat = null;
      context.player.gesture = null;
      context.player.path = [];
      context.player.speed = 0;
      context.keys.clear();
      if (!npc.seated)
        npc.angle = Math.atan2(context.player.y + 0.5 - npc.z, context.player.x + 0.5 - npc.x);
      const person = npc.questRole?.startsWith('square-')
        ? squareNPCDialogue(npc, context.economy)
        : theyLiveDialogue(npc, context.quests.theyLive, { buyBattleaxe });
      openNPCDialogue(
        npc.questRole === 'clerk' ? saltClerkDialogue(person, context.saltMail) : person,
      );
    };
    return approachNPC(npc, begin);
  }

  function attackAlien(npc: Partial<Actor>) {
    {
      context.multiplayerWorld.actions.request('attackPersonal', {
        id: npc.id,
        weapon: playerWeapon(),
      });
      return true;
    }
  }

  function updateAlienCombat(dt: number, t: number) {
    if (!context.alienCombat) return;
    const combat = context.alienCombat,
      npc = combat.npc;
    if (
      !context.playerLook.sunglasses ||
      Math.hypot(context.player.x + 0.5 - npc.x, context.player.y + 0.5 - npc.z) > 2.3
    ) {
      context.alienCombat = null;
      context.player.gesture = null;
      announce(
        contentText('world-message.src.world.interactions.you-break-off-the-fight'),
        'They Live',
      );
      return;
    }
    npc.hold = 2;
    const events = combat.battle.update(dt);
    for (const event of events) {
      if (event.type === 'player-hit') {
        context.player.gesture = {
          name: contentText('world.interactions.updateAlienCombat.name-19', {}),
          started: t,
          duration: 540,
        };
        npc.gesture = {
          name: contentText('world.interactions.updateAlienCombat.name-20', {}),
          started: t,
          duration: 430,
        };
        npc.alienHP = event.hp;
        npc.hp = event.hp;
        context.combatFeedback.hit(npc, event.damage, event.hp, combat.battle.state.max);
        context.combatFeedback.show(
          context.player,
          context.health.state.hp,
          context.health.state.max,
        );
      } else if (event.type === 'alien-hit') {
        context.combatFeedback.hit(
          context.player,
          event.damage,
          event.hp,
          context.health.state.max,
        );
        npc.gesture = {
          name: contentText('world.interactions.updateAlienCombat.name-21', {}),
          started: t,
          duration: 540,
        };
        context.player.gesture = {
          name: contentText('world.interactions.updateAlienCombat.name-22', {}),
          started: t,
          duration: 430,
        };
      } else if (event.type === 'victory') {
        const r = context.quests.theyLive.defeat(npc.alienId, { revealed: true });
        if (r.ok) {
          npc.defeatAt = t;
          announce(r.message, 'They Live');
        }
        context.alienCombat = null;
      } else if (event.type === 'death') {
        context.alienCombat = null;
        context.updateAdventureUI();
        beginCapture('alien', respawnAtHospital);
        return;
      }
    }
    if (events.length) context.updateAdventureUI();
  }

  function deployRope() {
    {
      context.multiplayerWorld.command('airshipRope');
      return true;
    }
  }

  function climbRope(down: boolean) {
    {
      context.multiplayerWorld.command(down ? 'airshipClimbDown' : 'airshipClimbUp');
      return true;
    }
  }

  function showRopeMenu(sx?: number, sy?: number) {
    closeMenu();
    if (context.rope.climbing || context.multiplayerWorld.traversing) return false;
    if (!context.airship.state.active && !context.rope.onGround) return false;
    if (!context.rope.state.deployed) return deployRope();
    const menu = context.$('sf-context');
    menu.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'sf-context-title';
    setActionText(heading, 'Airship rope', [{ label: 'Airship rope', kind: 'object' }]);
    menu.append(heading);
    const playerId = context.multiplayer.state.id,
      pilot = playerId !== null && context.multiplayerWorld.sharedAirship?.captain === playerId;
    const options: [string, () => unknown][] = !context.airship.state.active
      ? [['Climb up', () => climbRope(false)]]
      : [['Climb down', () => climbRope(true)]];
    if (context.airship.state.active && pilot) {
      if (!context.rope.state.passenger && !context.rope.state.passengerPaid)
        options.push([
          'Offer a ride · 5 coins',
          () => context.multiplayerWorld.command('airshipInvite'),
        ]);
      options.push([
        'Retract rope',
        () => context.multiplayerWorld.command('airshipRope', { retract: true }),
      ]);
    }
    for (const [text, fn] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      setActionText(b, text, [{ label: 'rope', kind: 'object' }]);
      b.addEventListener('click', () => {
        closeMenu();
        fn();
        context.canvas.focus({ preventScroll: true });
      });
      menu.append(b);
    }
    revealContextMenu(menu, sx, sy);
    return true;
  }

  function climbUnavailable(text = contentText('world-message.sutro.climb-down-before-walking')) {
    if (context.clickAttempt) context.clickAttempt.worked = false;
    announce(text);
    return false;
  }

  function descendSutro() {
    setDancing(false);
    if (
      context.chase?.state.jailed ||
      !context.sutroClimb.state.active ||
      context.sutroTravelPending
    )
      return false;
    requestSutroTravel('descend');
    return true;
  }

  async function requestSutroTravel(kind: string) {
    if (context.sutroTravelPending) return false;
    context.sutroTravelPending = true;
    context.updateClimbButton();
    try {
      const result = await serverCommand(context.multiplayer, 'travel', { kind });
      if (!result.ok) {
        announce(result.message, 'Sutro Tower');
        return false;
      }
      closeMenu();
      closeReader();
      context.player.path = [];
      context.player.speed = 0;
      context.player.gesture = null;
      context.action = null;
      context.destination = null;
      context.currentInterior = null;
      context.keys.clear();
      announce(
        kind === 'sutro'
          ? contentText(
              'world-message.src.world.interactions.you-take-the-service-ladder-up-sutro-tower-press-e-or-climb-do',
            )
          : contentText('world-message.src.world.interactions.you-start-climbing-down-sutro-tower'),
        'You',
      );
      context.canvas.focus({ preventScroll: true });
      return true;
    } finally {
      context.sutroTravelPending = false;
      context.updateClimbButton();
    }
  }

  function climbSutro() {
    if (context.airship.state.active) return airshipUnavailable();
    if (context.chase?.state.jailed) return false;
    if (context.sutroClimb.state.active) return descendSutro();
    if (context.surf.state.riding)
      return climbUnavailable(
        contentText(
          'world-message.src.world.interactions.return-to-shore-before-climbing-sutro-tower',
        ),
      );
    closeMenu();
    closeReader();
    if (context.sutroTravelPending) return false;
    const approach = context.sutroApproach();
    if (!approach)
      return climbUnavailable(
        contentText(
          'world-message.src.world.interactions.there-is-no-clear-route-to-the-sutro-tower-ladder',
        ),
      );
    const accepted = walkTo(approach.x, approach.y, () => {
      if (context.chase?.state.jailed) return;
      if (context.bike.riding) parkBike();
      requestSutroTravel('sutro');
    });
    if (accepted && !context.sutroClimb.state.active)
      announce(
        contentText(
          'world-message.src.world.interactions.walking-to-the-sutro-tower-service-ladder',
        ),
      );
    context.canvas.focus({ preventScroll: true });
    return accepted;
  }

  function kickTaxi(s: InteractionSight) {
    if (!context.multiplayerWorld) return false;
    return approachMovingTarget({
      target: () => context.streetTraffic?.cars.find((vehicle) => vehicle.id === s.id) || null,
      inReach: (car) =>
        Math.hypot(car.x - context.player.x - 0.5, car.z - context.player.y - 0.5) <= 1.8 &&
        context.canTravel(context.player.x, context.player.y, car.x - 0.5, car.z - 0.5, true),
      approach: actorWalkPoint,
      perform: () => context.multiplayer.command('kickTaxi', { id: s.id }),
    });
  }

  function seizeBicycle(npc: Actor) {
    return approachMovingTarget({
      target: () => (npc.rider && !npc.bicycleTaken && npc.networkVisible !== false ? npc : null),
      inReach: (rider) =>
        Math.hypot(rider.x - context.player.x - 0.5, rider.z - context.player.y - 0.5) <=
          GAMEPLAY.interactionRange &&
        context.canTravel(context.player.x, context.player.y, rider.x - 0.5, rider.z - 0.5, true),
      approach: actorWalkPoint,
      perform: () =>
        context.multiplayer.command('playerAction', { verb: 'seizeBicycle', id: npc.id }),
    });
  }

  function goToSight(s: InteractionSight | undefined): unknown {
    if (!s) return false;
    if (isLootTarget(s)) return collectExpeditionLoot(s);
    if (s.kind === 'waymo' || s.kind === 'robotaxi') return kickTaxi(s);
    if (!hasSiteEntry(s)) return s.kind === 'whale' ? jumpWhale(s) : examine(s);
    if (
      (
        ['secret-stairs', 'cave-exit', 'stealth-bomber'] satisfies [string, string, string]
      ).includes(s.kind)
    )
      return useSecretSite(s);
    if (s.kind === 'airship-rope') {
      if (context.airship.state.active) return showRopeMenu();
      if (Math.hypot(context.player.x - s.entry.x, context.player.y - s.entry.y) <= 1.5)
        return climbRope(false);
      return walkTo(s.entry.x, s.entry.y, () => climbRope(false));
    }
    if (s.kind === 'house-storage') return searchHouseStorage(s);
    if (s.kind === 'lore-book') return readLoreBook(s);
    if (s.kind === 'loot') return collectExpeditionLoot(s);
    if (s.kind === 'bench') return sitOnBench(s);
    if (s.kind === 'neighborhood-garden' && s.seats?.length)
      return sitOnBench(sightById(requiredValue(s.seats, 'Garden seats')[0].id));
    if (context.rocket.state.active) return false;
    if (context.chase?.state.jailed) return;
    if (s.enterableInstitute) {
      closeMenu();
      const inside = requiredValue(s.inside, 'Institute entrance');
      return walkTo(inside.x, inside.y);
    }
    if (buildingNPCService(s)) return examine(s);
    if (s.kind === 'sand') return collectOceanSand();
    if (s.kind === 'sunglasses') return pickUpSunglasses();
    if (s.kind === 'fishing') return fishAtWharf();
    if (s.kind === 'motorcycle')
      return context.motorcycle.state.rented ? useMotorcycle() : examine(s);
    if (s.id === 'zoo-monkeys') return stealQuestMonkey();
    if (s.id === 'sutro') return climbSutro();
    if (s.kind === 'bunny') return petBunny();
    if (s.kind === 'ferrari') return useFerrari();
    if (s.kind === 'gym') return useGym();
    if (s.kind === 'surfing') return usePacificaSurf();
    if (s.kind === 'nightlife') return walkTo(NIGHTLIFE.inside.x, NIGHTLIFE.inside.y);
    if (s.kind === 'zoo') return releaseTiger();
    if (s.kind === 'gondola') return useGondola(s.id === 'gondola-base');
    if (s.kind === 'rail-pit') return examine(s);
    closeMenu();
    if (s.kind === 'whale') return jumpWhale(s);
    if (s.kind === 'airship') {
      useAirship();
      return;
    }
    if (s.kind === 'windsurf') {
      useSurf();
      return;
    }
    if (s.kind === 'bike') {
      useBike();
      return;
    }
    if (s.kind === 'ducks') return feedDucks();
    if (s.kind === 'guest') {
      walkTo(s.entry.x, s.entry.y, talkToBani);
      return;
    }
    return examine(s);
  }

  function orderDoorDash() {
    if (!context.deli || context.capture.state.active || context.chase?.state.jailed) return false;
    if (
      context.flying() ||
      context.surf.state.riding ||
      context.rocket.state.active ||
      context.sutroClimb.state.active ||
      context.rope.climbing ||
      context.currentInterior
    ) {
      announce(
        contentText(
          'world-message.src.world.interactions.meet-your-doordash-cooler-on-walkable-ground',
        ),
        'Lucinda’s',
      );
      return false;
    }
    const result = context.deli.order(context.player);
    if (!('pending' in result && result.pending)) announce(result.message, 'Lucinda’s');
    context.updateAdventureUI();
    return result.ok;
  }

  function eatSandwich() {
    if (context.capture.state.active) return false;
    const result = context.deli.eat();
    announce(result.message, 'You');
    context.updateAdventureUI();
    return result.ok;
  }

  function talkBurger(npc: Actor | undefined) {
    if (!npc) return false;
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.secretWorld?.bomber.state.active
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    closeMenu();
    closeReader();
    return approachNPC(npc, () => {
      const person = configuredDialogue('burger', npc, {
        pickup: () => context.deli.pickup('in-n-out'),
      });
      if (npc.id !== BURNING_MAN.waterClerk || burningManStage() !== 'fetch-water')
        return openNPCDialogue(person);
      const menu = compileEntityDialogue(person, npc.editorKey || 'actor:' + npc.id, context);
      return openNPCDialogue({
        ...menu,
        choices: [
          ...dialogueChoices(menu),
          {
            label: 'Ask for a cup of water',
            accept: () => burningManCommand('water'),
            serverReceipt: true,
          },
        ],
        contentResolved: true,
      });
    });
  }

  function talkDeli() {
    if (context.chase?.state.jailed || context.flying() || context.capture.state.active)
      return false;
    const npc = context.merchants.find((n) => n.kind === 'deli');
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue('deli', npc, {
          pickup: () => context.deli.pickup(),
          delivery: () => context.deli.order(context.player),
        }),
      ),
    );
  }

  function labOffer() {
    const lab = context.places.find((p) => p.id === 'ai-lab'),
      npc = context.merchants.find((n) => n.kind === 'recruiter');
    context.player.path = [];
    context.player.speed = 0;
    context.action = null;
    context.destination = null;
    context.keys.clear();
    closeReader();
    closeMenu();
    openNPCDialogue(
      configuredDialogue(context.aiLabJob.state.hired ? 'ai-employee' : 'ai-recruiter', npc, {
        work: () => ({ ok: true, after: () => goToPlace(lab) }),
        interview: () => ({ ok: true, after: () => context.aiInterview.open() }),
      }),
    );
  }

  function talkLabRecruiter() {
    if (
      context.chase?.state.jailed ||
      context.capture.state.active ||
      context.rocket.state.active ||
      context.flying() ||
      context.rope.climbing ||
      context.sutroClimb.state.active
    )
      return false;
    return approachNPC(
      context.merchants.find((n) => n.kind === 'recruiter'),
      labOffer,
    );
  }

  function talkBeer() {
    if (context.chase?.state.jailed || context.flying() || context.capture.state.active)
      return false;
    const npc = context.merchants.find((n) => n.kind === 'bartender');
    return approachNPC(npc, () =>
      openNPCDialogue(
        configuredDialogue('bartender', npc, {
          beer: () => context.inebriation.drink(context.economy),
        }),
      ),
    );
  }

  function talkToBani() {
    announce(
      contentText(
        'world-message.src.world.interactions.best-way-to-see-the-city-borrow-the-bicycle-take-market-west-a',
      ),
      'Bani',
    );
  }

  function collectOceanSand() {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.expeditions.ship.aboard ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    const gather = () => {
      context.fishing.cancel();
      context.expeditions.stop();
      context.alienCombat = null;
      if (context.bike.riding) parkBike();
      parkMotorcycle(false);
      context.skateboard.riding = false;
      setDancing(false);
      closeMenu();
      closeReader();
      context.player.path = [];
      context.player.speed = 0;
      context.action = null;
      context.destination = null;
      const result = mapInteractionResult(context.economy.trade('collect-sand'), (receipt) => {
        if (receipt.ok) {
          context.player.angle = Math.atan2(
            context.sandSite.z - context.player.y - 0.5,
            context.sandSite.x - context.player.x - 0.5,
          );
          context.player.gesture = {
            name: contentText('world.interactions.gather.name-23', {}),
            started: performance.now(),
            duration: 750,
          };
          announce(
            contentText(
              'world-message.src.world.interactions.you-fill-a-sack-with-ocean-beach-sand',
            ),
            'You',
          );
        }
        return receipt;
      });
      return result.ok;
    };
    closeMenu();
    return Math.hypot(
      context.player.x - context.sandSite.entry.x,
      context.player.y - context.sandSite.entry.y,
    ) < 0.8
      ? gather()
      : walkTo(context.sandSite.entry.x, context.sandSite.entry.y, gather);
  }

  const burningManStage = () =>
    context.multiplayer?.state.playerState?.quests.burningMan?.stage ?? 'not-started';
  function burningManCommand(step: BurningManAction) {
    return serverCommand(context.multiplayer, 'playerAction', { verb: 'burningMan', step });
  }

  function parrotQuestCommand(
    step: 'start' | 'catch' | 'deliver' | 'sell',
    args: { id?: string; sandwich?: boolean } = {},
  ) {
    return serverCommand(context.multiplayer, 'playerAction', {
      verb: 'stochasticParrot',
      step,
      ...args,
    });
  }

  function talkParrot(npc: Actor | undefined) {
    if (!npc) return false;
    return approachNPC(npc, () => {
      const dialogue = parrotDialogue(npc);
      if (context.quests.state.stochasticParrot === 'accepted')
        return openNPCDialogue({
          ...dialogue,
          contentResolved: true,
          choices: [
            {
              label: 'Catch the parrot',
              serverReceipt: true,
              accept: () => parrotQuestCommand('catch', { id: npc.id }),
            },
            {
              label: 'Lure it with a sandwich',
              serverReceipt: true,
              accept: () => parrotQuestCommand('catch', { id: npc.id, sandwich: true }),
            },
          ],
        });
      return openNPCDialogue(dialogue);
    });
  }

  function talkGoblinScientist(npc: Actor) {
    return approachNPC(
      npc,
      () => {
        const stage = context.quests.state.stochasticParrot;
        const aboutProof = () =>
          openNPCDialogue({
            ...npc,
            contentResolved: true,
            intro: 'Anyway, this parrot should move us straight to the frontier of AI research.',
            choices: [
              {
                label: 'What am I supposed to do with a proof of the Collatz conjecture?',
                receipt:
                  'I don’t know. Maybe sell it to the government or to an industrialist. I hear there are mathematicians in Berkeley, too.',
              },
            ],
          });
        return openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro:
            stage === 'not-started'
              ? 'Mind the pipe by the door. It shakes when we ask the engine anything difficult. I keep hearing that stochastic parrots are the big new thing in AI. None of the papers says where to buy one, so I’ll have to find a bird the old-fashioned way. Would you be interested?'
              : stage === 'accepted'
                ? 'The grove north of Coit Tower is where I’d look. Take a sandwich if you have one. I’ve had better luck making introductions over lunch than by waving a clipboard at things.'
                : stage === 'carrying'
                  ? 'You caught one! Let it get settled somewhere away from the pressure gauge. The plumbers have been practicing how to greet it for an hour. I think we should let it speak first.'
                  : 'The parrot has learned to say “funding” whenever the boiler goes quiet. We laughed the first time. Now the plumbers stop what they’re doing and check the coal bill.',
          choices: [
            ...(stage === 'not-started'
              ? [
                  {
                    label: 'I’ll find you a stochastic parrot',
                    accept: () => parrotQuestCommand('start'),
                    receipt:
                      'The parrots north of Coit Tower look stochastic to me. Try catching one. A sandwich might help.',
                  },
                ]
              : []),
            ...(stage === 'carrying'
              ? [
                  {
                    label: 'Hand over the parrot',
                    accept: async () => {
                      const result = await parrotQuestCommand('deliver');
                      return result.ok ? { ...result, after: aboutProof } : result;
                    },
                  },
                ]
              : []),
            ...(stage === 'proof'
              ? [
                  {
                    label: 'What am I supposed to do with this proof?',
                    receipt:
                      'I don’t know. Maybe sell it to the government or to an industrialist. I hear there are mathematicians in Berkeley, too.',
                  },
                ]
              : []),
            {
              label:
                ITEM_STATS['goblin-village-tablet'].name +
                ' · ' +
                ITEM_STATS['goblin-village-tablet'].price +
                ' coins',
              accept: () => context.tabletService.buy('goblin-village'),
            },
            {
              label: 'You worked out the teleport coordinates yourself?',
              receipt:
                'Of course. I used to work remotely for the lab from the village. The reception was better there, and the kettle didn’t share a wall with a steam engine. After a few weeks of carrying my notes back and forth, I got the tablet working.',
            },
            {
              label: 'Why build it around a steam engine?',
              receipt:
                'Because three plumbers already knew how to keep one running. We’d like to ask it for a difficult integral one day. At present you can ask it for hot water and get a surprisingly confident answer.',
            },
          ],
        });
      },
      { approach: (actor) => context.regionalCitizenApproach(actor, true) },
    );
  }

  function fishAtWharf() {
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.rocket.state.active ||
      context.flying() ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.surf.state.riding ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    const begin = () => {
      if (context.bike.riding) parkBike();
      parkMotorcycle(false);
      context.skateboard.riding = false;
      setDancing(false);
      closeMenu();
      closeReader();
      context.keys.clear();
      context.player.path = [];
      context.player.speed = 0;
      context.player.motion = 0;
      context.player.gesture = null;
      context.action = null;
      context.destination = null;
      const result = context.fishing.start(context.fishingSite);
      if (result.ok)
        context.player.angle = Math.atan2(
          context.fishingSite.water.z - context.player.y - 0.5,
          context.fishingSite.water.x - context.player.x - 0.5,
        );
      announce(result.message, 'Fishing');
      return result.ok;
    };
    closeMenu();
    return Math.hypot(
      context.player.x - context.fishingSite.entry.x,
      context.player.y - context.fishingSite.entry.y,
    ) < 0.55
      ? begin()
      : walkTo(context.fishingSite.entry.x, context.fishingSite.entry.y, begin);
  }

  function pickUpSunglasses() {
    if (context.sunglasses.state.owned) return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.flying()) return airshipUnavailable();
    if (
      context.chase?.state.jailed ||
      context.capture.state.active ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    closeMenu();
    if (context.bike.riding) parkBike();
    const collect = () => {
      const result = context.sunglasses.pickUp();
      announce(result.message, 'You');
      if (result.ok) {
        context.player.gesture = {
          name: contentText('world.interactions.collect.name-24', {}),
          started: performance.now(),
          duration: 750,
        };
        const quest = context.quests.theyLive.start();
        if (quest.ok) announce(quest.message, 'They Live');
      }
      return result.ok;
    };
    const e = context.sunglassesSite.entry;
    return Math.hypot(context.player.x - e.x, context.player.y - e.y) < 1
      ? collect()
      : walkTo(e.x, e.y, collect);
  }

  function petBunny() {
    if (
      !context.bunny ||
      context.chase?.state.jailed ||
      context.rocket.state.active ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.surf.state.riding ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    closeMenu();
    closeReader();
    const b = context.bunny.state,
      target = context.bunnyApproach();
    if (!target) return false;
    return walkTo(target.x, target.y, () => {
      if (context.bike.riding) parkBike();
      context.player.path = [];
      context.player.speed = 0;
      context.player.motion = 0;
      context.player.runBlend = 0;
      context.player.phase = 0;
      context.player.angle = Math.atan2(b.z - context.player.y - 0.5, b.x - context.player.x - 0.5);
      const now = performance.now();
      context.player.gesture = {
        name: contentText('world.interactions.petBunny.name-25', {}),
        started: now,
        duration: 1500,
      };
      context.bunny.pet(now, context.player.angle + Math.PI);
      announce(
        contentText(
          'world-message.src.world.interactions.you-pet-the-bunny-its-nose-twitches-approvingly',
        ),
        'You',
      );
      context.canvas.focus({ preventScroll: true });
    });
  }

  function feedDucks() {
    const s = requiredValue(sightById('ducks'), 'Missing authored entity: ducks');
    closeMenu();
    if (!context.economy.state.grain) {
      announce(contentText('world-message.src.world.interactions.you-have-no-grain'));
      return false;
    }
    return walkTo(s.entry.x, s.entry.y, () => {
      mapInteractionResult(context.economy.trade('feed'), (result) => {
        if (result.ok) {
          context.ducksFedUntil = performance.now() + 10000;
          announce(
            contentText(
              'world-message.src.world.interactions.you-scatter-one-bag-of-grain-quack-the-mallards-and-ducklings',
            ),
            'Ducks',
          );
        }
        return result;
      });
    });
  }

  function parkBike(x = context.player.x, y = context.player.y) {
    if (context.multiplayerWorld && context.bike.riding)
      context.multiplayerWorld.command('activity', { mode: 'walk' });
    context.bike.riding = false;
    context.bike.x = x;
    context.bike.y = y;
    context.player.speed = Math.min(context.player.speed, context.WALK_SPEED);
    context.updateBikeButton();
    announce(
      contentText(
        'world-message.src.world.interactions.you-park-the-bicycle-it-will-be-waiting-here',
      ),
      'You',
    );
  }

  function mountBike() {
    parkMotorcycle(false);
    if (context.currentInterior) return;
    context.multiplayerWorld.command('activity', { mode: 'bike' });
    context.bike.riding = true;
    context.player.speed = 0;
    context.player.path = [];
    context.destination = null;
    context.action = null;
    context.updateBikeButton();
    announce(
      contentText(
        'world-message.src.world.interactions.you-hop-on-the-bicycle-click-to-ride-press-b-to-park',
      ),
      'You',
    );
    context.canvas.focus({ preventScroll: true });
  }

  function useBike() {
    context.skateboard.riding = false;
    if (context.chase?.state.jailed) return;
    if (context.sutroClimb.state.active) return climbUnavailable();
    if (context.airship.state.active) return airshipUnavailable();
    if (context.surf.state.riding) {
      if (context.clickAttempt) context.clickAttempt.worked = false;
      announce(
        contentText(
          'world-message.src.world.interactions.return-to-shore-before-collecting-the-bicycle',
        ),
      );
      return;
    }
    closeMenu();
    if (context.bike.riding) {
      parkBike();
      return;
    }
    if (
      !context.currentInterior &&
      Math.hypot(context.player.x - context.bike.x, context.player.y - context.bike.y) < 2.5
    )
      mountBike();
    else {
      walkTo(Math.round(context.bike.x), Math.round(context.bike.y), mountBike);
      announce(contentText('world-message.src.world.interactions.walking-to-the-bicycle'));
      context.canvas.focus({ preventScroll: true });
    }
  }

  function useSkateboard() {
    if (!context.quests.theyLive.state.skateboard) {
      announce(
        contentText('world-message.src.world.interactions.you-do-not-own-a-skateboard'),
        'You',
      );
      return false;
    }
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rope.climbing ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.sutroClimb.state.active ||
      context.training ||
      context.tahoe.state.mode !== 'ground' ||
      context.currentInterior
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.bike.riding) parkBike();
    closeMenu();
    setDancing(false);
    context.alienCombat = null;
    context.player.gesture = null;
    context.player.path = [];
    context.player.speed = 0;
    context.action = null;
    context.destination = null;
    parkMotorcycle(false);
    context.skateboard.riding = !context.skateboard.riding;
    context.multiplayerWorld.command('activity', {
      mode: context.skateboard.riding ? 'skateboard' : 'walk',
    });
    context.updateAdventureUI();
    announce(
      context.skateboard.riding
        ? contentText(
            'world-message.src.world.interactions.you-set-down-your-skateboard-click-to-skate-k-puts-it-away',
          )
        : contentText('world-message.src.world.interactions.you-pick-up-your-skateboard'),
      'You',
    );
    context.canvas.focus({ preventScroll: true });
    return true;
  }

  function performSkateTrick(id: string) {
    if (
      !context.skateboard.riding ||
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.dialogue.active ||
      !context.$('sf-help').hidden ||
      !context.$('sf-character').hidden
    )
      return false;
    const accepted = context.skateTricks.start(id);
    if (accepted) {
      setDancing(false);
      closeMenu();
      announce(
        requiredValue(
          SKATE_TRICKS.find((t) => t.id === id),
          'Skate trick',
        ).label + '!',
        'Skateboard',
      );
      context.updateAdventureUI();
      context.canvas.focus({ preventScroll: true });
    }
    return accepted;
  }

  function usePacificaSurf() {
    if (context.surf.state.riding) return useSurf();
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (context.training) stopTraining();
    const mount = () => {
      context.surf.state.mode = 'surf';
      Object.assign(context.surf.state.launch, context.pacificaSurfSite.launch);
      context.surf.state.shore = { ...context.pacificaSurfSite.entry };
      mountSurf();
    };
    closeMenu();
    return walkTo(context.pacificaSurfSite.entry.x, context.pacificaSurfSite.entry.y, mount);
  }

  function catchPacificaWave() {
    if (!context.surf.state.riding || context.surf.state.mode !== 'surf') return false;
    if (context.waveSurf.state.ride) return performSurfTrick('air-360');
    {
      context.multiplayerWorld.command('travel', { kind: 'catchWave' });
      return true;
    }
  }

  function performSurfTrick(id: string) {
    {
      context.multiplayerWorld.command('travel', { kind: 'surfTrick', id });
      return true;
    }
  }

  function jumpWhale(sight: { index?: number }) {
    closeMenu();
    if (
      !context.surf.state.riding ||
      context.surf.state.mode !== 'windsurf' ||
      context.chase?.state.jailed
    ) {
      if (context.clickAttempt) context.clickAttempt.worked = false;
      announce(
        contentText(
          'world-message.src.world.interactions.borrow-a-windsurf-board-at-crissy-field-to-jump-over-the-whale',
        ),
        'Whale watching',
      );
      return false;
    }
    if (context.surf.state.jump) return false;
    let attempts = 0;
    const launch = () => {
      const target = context.whales.sample(
        (context.multiplayerWorld?.clock ?? context.waveTime) * 1000 + WHALE_JUMP_LEAD_MS,
        sight.index ?? 0,
      );
      if (
        context.multiplayerWorld &&
        Math.hypot(target.x - context.player.x - 0.5, target.z - context.player.y - 0.5) >= 3 &&
        Math.hypot(target.x - context.player.x - 0.5, target.z - context.player.y - 0.5) <= 6
      ) {
        context.multiplayerWorld.command('travel', { kind: 'surfJump', index: sight.index });
        return true;
      }
      if (context.surf.jumpOver(context.player, target)) {
        context.player.path = [];
        context.player.speed = 7.2;
        context.player.angle = requiredValue(context.surf.state.jump, 'Whale jump').angle;
        context.action = null;
        context.destination = null;
        announce(
          contentText(
            'world-message.src.world.interactions.you-launch-your-board-over-the-humpback-whale',
          ),
          'Windsurfing',
        );
        context.canvas.focus({ preventScroll: true });
        return true;
      }
      const takeoff = context.surf.jumpApproach(context.player, target);
      if (!takeoff || attempts++ >= 3) {
        if (context.clickAttempt) context.clickAttempt.worked = false;
        announce(
          contentText(
            'world-message.src.world.interactions.choose-a-whale-with-enough-open-water-around-it-to-jump',
          ),
          'Windsurfing',
        );
        return false;
      }
      const accepted = walkTo(takeoff.x, takeoff.y, launch);
      if (accepted)
        announce(
          contentText(
            'world-message.src.world.interactions.you-sail-into-position-to-jump-the-humpback',
          ),
          'Windsurfing',
        );
      return accepted;
    };
    return launch();
  }

  function mountSurf() {
    parkMotorcycle(false);
    if (context.chase?.state.jailed) return;
    if (context.bike.riding) parkBike();
    context.skateboard.riding = false;
    setDancing(false);
    closeReader();
    closeMenu();
    context.surf.cancelJump();
    context.multiplayerWorld.command('activity', {
      mode: 'surf',
      pacifica: context.surf.state.mode === 'surf',
    });
    context.surf.state.riding = true;
    context.player.x = context.surf.state.launch.x;
    context.player.y = context.surf.state.launch.y;
    context.player.path = [];
    context.player.speed = 0;
    context.destination = null;
    context.action = null;
    if (context.surf.state.mode === 'surf') {
      context.waveSurf.start({ x: context.player.x + 0.5, z: context.player.y + 0.5 });
      context.player.angle = Math.PI;
    }
    context.currentInterior = null;
    context.updateSurfButton();
    announce(
      context.surf.state.mode === 'surf'
        ? contentText(
            'world-message.src.world.interactions.you-paddle-out-from-pacifica-click-the-water-to-paddle-space-c',
          )
        : contentText(
            'world-message.src.world.interactions.you-launch-from-crissy-field-click-the-bay-to-windsurf-f-retur',
          ),
      'You',
    );
  }

  function landSurf() {
    context.multiplayerWorld.command('activity', { mode: 'walk' });
    const pacifica = context.surf.state.mode === 'surf';
    context.waveSurf.stop();
    context.surf.cancelJump();
    context.surf.state.riding = false;
    context.player.x = requiredValue(context.surf.state.shore, 'Surf landing').x;
    context.player.y = requiredValue(context.surf.state.shore, 'Surf landing').y;
    context.player.path = [];
    context.player.speed = 0;
    context.action = null;
    context.destination = null;
    context.updateSurfButton();
    announce(
      pacifica
        ? contentText(
            'world-message.src.world.interactions.you-carry-the-board-back-onto-pacifica-beach',
          )
        : contentText(
            'world-message.src.world.interactions.you-carry-the-board-back-onto-crissy-field',
          ),
      'You',
    );
  }

  function useSurf() {
    if (context.airship.state.active) return airshipUnavailable();
    if (context.chase?.state.jailed) return;
    if (context.sutroClimb.state.active) return climbUnavailable();
    closeMenu();
    closeReader();
    if (context.surf.state.riding) {
      context.waveSurf.cancelRide();
      walkTo(context.surf.state.launch.x, context.surf.state.launch.y, landSurf);
    } else {
      context.surf.state.mode = 'windsurf';
      Object.assign(context.surf.state.launch, {
        x: WINDSURF_LAUNCH.water[0] * context.MAP_SCALE - 0.5,
        y: WINDSURF_LAUNCH.water[1] * context.MAP_SCALE - 0.5,
      });
      context.surf.state.shore = {
        ...requiredValue(sightById('windsurf'), 'Missing authored entity: windsurf').entry,
      };
      if (walkTo(context.surf.state.shore.x, context.surf.state.shore.y, mountSurf))
        announce(
          contentText(
            'world-message.src.world.interactions.walking-to-the-windsurf-board-at-crissy-field',
          ),
        );
    }
    context.canvas.focus({ preventScroll: true });
  }

  function talkRehabilitation(npc: Actor) {
    if (context.rehabilitation.state.active) return false;
    closeMenu();
    if (!context.chase.state.jailed)
      return approachNPC(
        npc,
        () =>
          openNPCDialogue({
            ...npc,
            contentResolved: true,
            intro:
              'Good afternoon. It’s quiet out here between appointments. I spend most of that time watching the fog come in.',
            choices: [
              {
                label: 'Do you ever get tired of the view?',
                receipt:
                  'I thought I would. Then I started noticing how the fog takes a different route over the hill every day.',
              },
              {
                label: 'What do you do on your days off?',
                receipt: 'I walk down to the coast and leave my watch at home.',
              },
            ],
          }),
        { approach: (actor) => context.regionalCitizenApproach(actor) },
      );
    context.keys.clear();
    context.player.path = [];
    context.player.speed = 0;
    openNPCDialogue(
      rehabilitationDialogue(npc, () =>
        serverCommand(context.multiplayer, 'playerAction', { verb: 'rehabilitate' }).then(
          (result) => {
            if (!result.ok) {
              announce(result.message, 'Specialist');
              return;
            }
            context.rehabilitation.start();
            context.fishing.cancel();
            setDancing(false);
            context.player.path = [];
            context.player.motion = 0;
            context.player.gesture = null;
            context.world.inert = true;
          },
        ),
      ),
    );
    return true;
  }

  function arrestPlayer() {
    context.social.cancelPitch();
    context.tech.losePhone('arrest');
    context.expeditions.abandonShip();
    context.dialogue.close();
    context.rocket.cancel();
    context.updateRocketControls();
    context.rope.reset();
    context.airship.cancel();
    context.sutroClimb.cancel();
    context.updateClimbButton();
    context.waveSurf.stop();
    context.surf.cancelJump();
    context.surf.state.riding = false;
    context.bike.riding = false;
    context.player.x = context.detention.x - 0.5;
    context.player.y = context.detention.z - 0.5;
    context.player.path = [];
    context.player.speed = 0;
    context.player.moving = false;
    context.player.angle = -Math.PI / 2;
    context.player.motion = 0;
    context.player.runBlend = 0;
    context.player.phase = 0;
    context.player.gesture = null;
    context.action = null;
    context.destination = null;
    context.currentInterior = null;
    context.keys.clear();
    context.pointers.clear();
    clearTimeout(context.pressTimer);
    context.gesture = false;
    closeMenu();
    closeReader();
    context.closeHelp();
    context.$('sf-hover').hidden = true;
    context.$('sf-wanted').hidden = true;
    context.$('sf-custody').hidden = false;
    for (const input of context.world.querySelectorAll<HTMLButtonElement>(
      '#sf-map-button,#sf-bike-button,.sf-place-marker',
    ))
      input.disabled = true;
    context.camera.yaw = 0.35;
    context.camera.cos = Math.cos(context.camera.yaw);
    context.camera.sin = Math.sin(context.camera.yaw);
    context.camera.pitch = 0.7;
    context.zoom = 1;
    context.$('sf-zoom-slider').value = '100';
    context.$('sf-zoom-slider').setAttribute('aria-valuetext', '100% zoom');
    context.updateCamera();
    context.drawMini();
    context.updateSurfButton();
    announce(
      contentText(
        'world-message.src.world.interactions.you-are-under-arrest-you-have-been-placed-in-the-carceral-urba',
      ),
      'Police',
    );
  }

  function talkDogWalker(npc: Actor) {
    if (
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.surf.state.riding ||
      context.rocket.state.active ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.ferrari?.state.riding) return parkCarFirst();
    closeMenu();
    closeReader();
    context.expeditions.stop();
    context.alienCombat = null;
    return approachNPC(
      npc,
      () => {
        npc.speech = '';
        context.approachingNPC = npc;
        npc.waiting = true;
        openNPCDialogue(dogWalkerDialogue(npc));
      },
      {
        approach: (n) =>
          n.regional
            ? context.regionalCitizenApproach(n)
            : context.nearestNavigation(n.x - 0.5, n.z - 0.5, 2, (x: number, y: number) => {
                const d = Math.hypot(x + 0.5 - n.x, y + 0.5 - n.z);
                return d > 0.7 && d < 1.5;
              }),
      },
    );
  }

  function furnitureDialogue(npc: Actor, trade: 'buy' | 'sell') {
    return openNPCDialogue({
      ...npc,
      contentResolved: true,
      name: trade === 'buy' ? 'Goblin furniture maker' : 'Noe Valley parent',
      intro:
        trade === 'buy'
          ? 'Welcome to the Goblin Furniture Factory. Everything here passed the sit test. Even the intern.'
          : 'The baby finally fell asleep. Now if only I had a decent chair at home. Got any Mount Tam furniture?',
      choices: FACTORY_CHAIRS.flatMap((chair) => {
        const price = chair[trade];
        if (price === null) return [];
        return [
          {
            label: (trade === 'buy' ? 'Buy ' : 'Sell ') +
              chair.name + ' · ' + price.toLocaleString('en-US') + ' coins',
            accept: () =>
              serverCommand(context.multiplayer, 'playerAction', {
                verb: 'tradeFactoryChair',
                trade,
                item: chair.id,
              }),
          },
        ];
      }),
      repeat: true,
    });
  }

  function startConstruction() {
    const { x, z } = CONSTRUCTION_SITE.work;
    return walkTo(x - 0.5, z - 0.5, () => {
      context.multiplayerWorld.command('playerAction', { verb: 'constructionStart' });
    });
  }

  function interactCitizen(
    npc: import('../types/world.ts').InteractiveActor | null | undefined,
    verb: string,
  ): unknown {
    if (!npc || (npc.kind === 'cafe-patron' && (verb === 'attack' || verb === 'steal')))
      return false;
    if (npc.kind === AIRSHIP_TRAVELER && !npc.networkPlayer) {
      if (verb !== 'talk' || !context.airship.state.active) return false;
      closeReader();
      closeMenu();
      return openNPCDialogue({
        ...npc,
        contentResolved: true,
        intro: 'Thanks for the lift. The view from up here was worth the climb.',
        choices: [
          {
            label: 'Where are you headed?',
            receipt: 'I’m happy to go wherever you’re going. I was just out for a walk.',
          },
        ],
      });
    }
    if (npc.networkPlayer) {
      if (verb === 'attack') return context.multiplayerWorld.attackPlayer(npc);
      if (verb === 'follow') return context.multiplayerWorld.followPlayer(npc);
      return walkToActor(npc);
    }
    if (verb === 'talk' && npc.id === CONSTRUCTION_SITE.foreman.id)
      return approachNPC(npc, () =>
        openNPCDialogue(constructionForemanDialogue(npc, startConstruction)),
      );
    if (verb === 'talk' && npc.id === MUD_BATH.regular.id)
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro: 'Come on in. The trick is to sit still and let the mud settle.',
        }),
      );
    if (verb === 'talk' && npc.id === FIGHTER_YARD.tyler.id) {
      return approachNPC(npc, () => {
        const admitted = equipmentOwned(context.economy.state, FIGHTER_YARD.pass);
        const enter = {
          label: admitted
            ? 'Enter the Fighter Yard'
            : 'Pay ' + FIGHTER_YARD.price + ' coins for admission',
          accept: async () => {
            const after = () => walkTo(FIGHTER_YARD.inside.x, FIGHTER_YARD.inside.y);
            if (admitted) return { ok: true, after, message: 'Go on in. You’re on the list.' };
            const result = await serverCommand(context.multiplayer, 'inventory', {
              op: 'trade',
              kind: 'fighter-yard-admission',
            });
            return result.ok ? { ...result, after } : result;
          },
        };
        return openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro: admitted
            ? 'I’ve got your waiver right here. Caveat emptor.'
            : 'Ten coins gets you in. Pick someone your own size, or don’t. Caveat emptor.',
          choices: [
            enter,
            {
              label: 'What about the ethics of this?',
              next: {
                intro:
                  'I consulted a panel of professional ethicists and obtained signed waiver forms. I keep them in separate folders.',
                choices: [enter],
              },
            },
          ],
        });
      });
    }
    if (verb === 'talk' && (npc.id === GOBLIN_INDUSTRIALIST.id || npc.id === ROBE_SELLER)) {
      const phone = npc.id === GOBLIN_INDUSTRIALIST.id;
      const items: readonly string[] = phone ? ['goblin-phone'] : CLOTHIER_ITEMS;
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro: phone
            ? 'Behold the Goblin Phone. We call this finish Unfired Clay.'
            : 'The pink robe comes in two pieces. I also stock cream cashmere turtlenecks and buy bear and fox pelts from Tahoe.',
          choices: [
            ...items.map((kind) => ({
              label: 'Buy ' + ITEM_STATS[kind].name + ' · ' + ITEM_STATS[kind].price + ' coins',
              accept: () => serverCommand(context.multiplayer, 'inventory', { op: 'trade', kind }),
            })),
            ...(!phone
              ? TAHOE_PELTS.map((pelt) => ({
                  label:
                    'Sell ' +
                    ITEM_STATS[pelt].name.toLowerCase() +
                    ' · ' +
                    TAHOE_PELT_PRICES[pelt] +
                    ' coins',
                  repeat: true,
                  accept: () =>
                    serverCommand(context.multiplayer, 'inventory', {
                      op: 'trade',
                      kind: 'sell-' + pelt,
                    }),
                }))
              : []),
          ],
        }),
      );
    }
    if (verb === 'talk' && npc.id === ATV_RENTAL.npcId) {
      const rent = (minutes: number) =>
        serverCommand(context.multiplayer, 'travel', { kind: 'atvRent', minutes });
      return approachNPC(
        npc,
        () =>
          openNPCDialogue({
            ...npc,
            contentResolved: true,
            intro: atvRented()
              ? 'Your rental is still running. Click the parked quad when you’re ready to ride.'
              : 'I rent the quad by the minute. Once you’ve paid, click it to mount. Take the flagged roof ramp for air tricks or try donuts on flat dirt.',
            choices: atvRented()
              ? []
              : [
                  {
                    label: 'Rent for 1 minute · ' + ATV_RENTAL.prices[1] + ' coins',
                    accept: () => rent(1),
                  },
                  {
                    label: 'Rent for 10 minutes · ' + ATV_RENTAL.prices[10] + ' coins',
                    accept: () => rent(10),
                  },
                ],
          }),
        { approach: (actor) => context.regionalCitizenApproach(actor) },
      );
    }
    if (verb === 'talk' && npc.combatKind === 'goblin-maker')
      return approachNPC(npc, () => furnitureDialogue(npc, 'buy'), {
        approach: (actor) => context.regionalCitizenApproach(actor, true),
      });
    if (verb === 'talk' && npc.stroller && String(npc.id).startsWith('noe-parent-'))
      return approachNPC(npc, () => furnitureDialogue(npc, 'sell'));
    if (npc.kind === 'battery-seller' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          intro: contentText('world.interactions.interactCitizen.intro-27', {}),
          choices: [
            {
              label: contentText('world.interactions.interactCitizen.label-30', {}),
              accept: () => serverCommand(context.multiplayer, 'inventory', { op: 'buyBattery' }),
              contentNodeId: 'world.interactions.interactCitizen.node-29',
              labelTextId: 'world.interactions.interactCitizen.label-30',
              labelTextValues: {},
              actionId: 'world.interactions.interactCitizen.action-31',
            },
          ],
          decline: contentText('world.interactions.interactCitizen.decline-28', {}),
          contentNodeId: 'world.interactions.interactCitizen.node-26',
          introTextId: 'world.interactions.interactCitizen.intro-27',
          introTextValues: {},
          declineTextId: 'world.interactions.interactCitizen.decline-28',
          declineTextValues: {},
        }),
      );
    if (npc.kind === 'bolinas-local' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          intro: npc.localLine,
          choice: contentText('world.interactions.interactCitizen.choice-34', {}),
          receipt: contentText('world.interactions.interactCitizen.receipt-35', {}),
          decline: contentText('world.interactions.interactCitizen.decline-36', {}),
          contentNodeId: 'world.interactions.interactCitizen.node-32',
          choiceTextId: 'world.interactions.interactCitizen.choice-34',
          choiceTextValues: {},
          receiptTextId: 'world.interactions.interactCitizen.receipt-35',
          receiptTextValues: {},
          declineTextId: 'world.interactions.interactCitizen.decline-36',
          declineTextValues: {},
        }),
      );
    if (npc.kind === 'market-farmer' && verb === 'talk') return talkMarketFarmer(npc);
    if (verb === 'talk' && (npc.kind === BURNING_MAN.matilda || npc.kind === BURNING_MAN.dj))
      return approachNPC(npc, () =>
        openNPCDialogue(burningManDialogue(npc, burningManStage(), burningManCommand)),
      );
    if (verb === 'talk' && npc.kind === 'burning-man-guest')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro:
            npc.id === BURNING_MAN.partyDJ
              ? 'I brought my records. Whoever said a wicker statue couldn’t hold the floor was thinking of the wrong kind of party.'
              : 'Welcome to the party. Matilda’s hosting. If you came in fancy dress, congratulations. If you didn’t, we’ll assume it’s very subtle.',
        }),
      );
    if (npc.combatKind === 'unusual-pastor' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue(
          unusualPastorDialogue(npc, () => {
            context.multiplayerWorld.command('confrontPastor', { id: npc.id });
          }),
        ),
      );
    if (npc.combatKind === 'bolinas-cultist' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue(
          bolinasCultistDialogue(npc, () => {
            context.multiplayerWorld.command('talkCultist', { id: npc.id });
          }),
        ),
      );
    if (npc.wilderness)
      return verb === 'pet'
        ? petBear(npc)
        : verb === 'attack'
          ? attackWildMonster(npc)
          : examine(npc);
    if (npc.police) return examine(npc);

    if (npc.id === GOBLIN_INCUBATOR.founder.id && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue(
          goblinFounderDialogue(npc, context.economy.state, () =>
            serverCommand(context.multiplayer, 'inventory', { op: 'trade', kind: 'equity' }),
          ),
        ),
      );
    if (npc.kind === 'legacy-developer' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          repeat: true,
          decline: 'Leave',
          intro:
            'I’m the developer here. I used to give demos in that meeting room. The software still runs beautifully, provided you can get to the keyboard. The last customer asked whether the bugs were figurative, then something moved under the projector. Could you take a look inside?',
          choices: [
            {
              label: 'What kind of bugs?',
              receipt:
                'Spiders, beetles, caterpillars. I tried to track which rooms they were in. Then I noticed the web in the stairwell had annexed two departments since breakfast. Wear something you’re happy to come back in.',
            },
            {
              label: 'I’ll take a look',
              receipt:
                'The door’s open. If you get inside, could you tell me how far they’ve spread? I’d like to give the staff a better answer than “somewhere past reception.”',
            },
          ],
        }),
      );
    if (npc.kind === POOL_SWIMMER && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({ ...npc, contentResolved: true, intro: npc.neighborLine }),
      );
    if (npc.kind === 'biomed-entrepreneur' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro:
            'My radical new biomedical technology will change medicine. Invest any amount today and I’ll double your money.',
          choices: [
            {
              label: 'Invest coins',
              amount: {
                prompt: 'How many coins do you want to hand her?',
                submit: (amount) =>
                  serverCommand(context.multiplayer, 'inventory', { op: 'fundBiomed', amount }),
              },
            },
            {
              label: 'What does the technology do?',
              receipt:
                'I’m under an NDA. Once you invest, I can tell you why I still can’t tell you.',
            },
          ],
          repeat: true,
          decline: 'Keep your money',
        }),
      );
    if (npc.kind === 'guild-master' && verb === 'talk') return talkGuildRay(npc);
    if (npc.kind === 'illuminati-elder' && verb === 'talk') return talkOldMan(npc);
    if (npc.kind === 'tablet-wizard' && verb === 'talk') return talkTabletWizard(npc);
    if (npc.kind === 'goblin-scientist' && verb === 'talk') return talkGoblinScientist(npc);
    if (npc.kind === 'berkeley-mathematician' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro:
            'I’m off to lunch. If you’ve solved a famous open problem, now is a good time to stop me.',
        }),
      );
    if (npc.kind === 'enterprising-industrialist' && verb === 'talk')
      return approachNPC(npc, () => {
        const purchases = new Set(
          context.multiplayer?.state.playerState?.progress.industrialistArmorPurchases,
        );
        const choices = IRON_ARMOR_PIECES.map((id) => ({
          id,
          available: () => !purchases.has(id) && !ownsIronArmorPiece(context.economy.state, id),
          label:
            'Buy ' + ITEM_STATS[id].name.toLowerCase() + ' · ' + ITEM_STATS[id].price + ' coins',
          accept: async () => {
            const result = await serverCommand(context.multiplayer, 'inventory', {
              op: 'trade',
              kind: id,
            });
            if (result.ok) purchases.add(id);
            return result;
          },
        }));
        return openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro: choices.some((choice) => choice.available())
            ? 'The foundry makes iron armor for the torso and legs. I sell one of each per customer.'
            : 'You’ve got the pieces I can supply. Put them to good use.',
          choices,
          repeat: true,
          decline: 'Leave',
        });
      });
    if (npc.id === GOBLIN_SPACE_PROGRAM.engineer.id && verb === 'talk')
      return approachNPC(npc, () => {
        const helped = (context.multiplayer.state.playerState?.progress.goblinSpaceMud || 0) > 0;
        const trade = (label: string, all = false) => ({
          label,
          serverReceipt: true,
          accept: async () => {
            const result = await serverCommand(context.multiplayer, 'playerAction', {
              verb: 'tradeMud',
              all,
            });
            return result.ok && !helped
              ? {
                  ...result,
                  after: () =>
                    context.dialogue.open({
                      name: 'You',
                      intro: 'Directionally correct progress.',
                    }),
                }
              : result;
          },
        });
        return openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro: helped
            ? 'Good to see you again. Feel free to bring me more mud anytime. The ladder still has a long way to go.'
            : 'I’m building a ladder to the moon. I have plenty of wood, but I need mud to hold it together. There’s a mud bath in South San Francisco, west of the Armory. I’ll give you five live fish for every mud you bring me.',
          choices: [
            trade('Trade 1 mud for ' + FISH_PER_MUD + ' live fish'),
            ...(helped && context.economy.state.mud > 1 ? [trade('Trade all my mud', true)] : []),
          ],
        });
      });
    if (npc.kind === 'goblin-plumber' && verb === 'talk')
      return approachNPC(
        npc,
        () => openNPCDialogue({ ...npc, contentResolved: true, intro: npc.localLine }),
        { approach: (actor) => context.regionalCitizenApproach(actor, true) },
      );
    if (npc.kind === 'goblin-frog-farmer' && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue({
          ...npc,
          contentResolved: true,
          intro:
            'Gate’s open. Give the frogs a few swings if you need the practice. They’ll fight back once you hit them.',
        }),
      );
    if (npc.kind === 'rene-girard' && verb === 'talk')
      return approachNPC(
        npc,
        () => openNPCDialogue({ ...npc, contentResolved: true, ...girardDialogue }),
        { approach: (actor) => context.regionalCitizenApproach(actor) },
      );
    if (npc.kind === 'churchgoer' && verb === 'talk')
      return approachNPC(
        npc,
        () =>
          openNPCDialogue({
            ...npc,
            contentResolved: true,
            ...(npc.id === 'berkeley-churchgoer-1' ? churchDialogue.mara : churchDialogue.elias),
          }),
        { approach: (actor) => context.regionalCitizenApproach(actor) },
      );
    if (npc.kind === 'yohji' && verb === 'talk') return talkYohji(npc);
    if (npc.kind === 'banker' && verb === 'talk') return talkBanker(npc);
    if (npc.dogSurfJudge)
      return approachNPC(npc, () =>
        openNPCDialogue(
          dogSurfingDialogue(
            npc,
            (Date.now() + (context.multiplayer?.state.serverOffset || 0)) / 1000,
          ),
        ),
      );
    if (npc.dogWalker && verb === 'talk') return talkDogWalker(npc);
    if (npc.expeditionRole) return talkExpeditionNPC(npc);
    if (
      (['raptor', 'cow', 'kraken'] satisfies [string, string, string]).includes(
        npc.combatKind || '',
      ) &&
      verb === 'attack'
    )
      return attackExpeditionTarget(npc);
    if (npc.alienId && verb === 'attack') return approachNPC(npc, () => attackAlien(npc));
    if (npc.rehabilitation) return talkRehabilitation(npc);
    if (npc.parrot) return talkParrot(npc);
    if (npc.dog === true && !npc.dogWalker)
      return approachNPC(npc, () => {
        npc.speech = 'Woof!';
        npc.speechUntil = performance.now() + 3000;
        context.player.gesture = {
          name: contentText('world.interactions.interactCitizen.name-37', {}),
          started: performance.now(),
          duration: 900,
        };
        announce(
          contentText(
            'world-message.src.world.interactions.you-pet-the-dog-its-afternoon-has-improved-considerably',
          ),
          'You',
        );
      });
    if (npc.neighborhoodService && verb === 'talk')
      return approachNPC(npc, () =>
        openNPCDialogue(
          neighborhoodShopDialogue(npc, (id, offer) =>
            serverCommand(context.multiplayer, 'playerAction', {
              verb: 'neighborhoodService',
              id,
              offer,
            }),
          ),
        ),
      );
    if (npc.child && verb !== 'talk') return false;
    if (npc.questRole) return talkQuestNPC(npc);
    if (context.quests.theyLive.isDefeated(npc.alienId)) return false;
    if (npc.researcher) return talkResearcher(npc);
    if (npc.kind === 'rail-worker') return talkRailWorker(npc);
    if (npc.kind === 'fuel-attendant') return useFuel(sightById(npc.siteId || ''), npc);
    if (npc.kind === 'motorcycle-clerk') return talkMotorcycleClerk(npc);
    if (npc.kind === 'lift') return talkLiftAttendant(npc);
    if (npc.kind === 'recruiter') return talkLabRecruiter();
    if (npc.kind === 'deli') return talkDeli();
    if (npc.kind === 'burger-clerk') return talkBurger(npc);
    if (npc.kind === 'bartender') return talkBeer();
    if (npc.kind && MERCHANTS[npc.kind]) return talkMerchant(npc);
    if (context.flying()) return airshipUnavailable();
    if (
      context.chase?.state.jailed ||
      context.surf.state.riding ||
      context.rocket.state.active ||
      context.rope.climbing ||
      context.tahoe.state.mode !== 'ground'
    )
      return;
    closeMenu();
    if (context.dialogue.active) context.dialogue.close();
    if (context.sutroClimb.state.active) return climbUnavailable();
    const target = () =>
      npc.approach
        ? { ...npc.approach }
        : npc.regional
          ? context.regionalCitizenApproach(npc, true)
          : context.nearestNavigation(npc.x - 0.5, npc.z - 0.5, 2, (x: number, y: number) => {
              const d = Math.hypot(x + 0.5 - npc.x, y + 0.5 - npc.z);
              return (
                d >= 0.8 && d < 1.5 && (!npc.interior || context.placeAt(x, y) === npc.interior)
              );
            });
    const perform = () => {
      if (context.multiplayerWorld && verb !== 'talk') {
        return context.multiplayer.command('playerAction', {
          verb: 'attackPersonal',
          id: npc.id,
          weapon: playerWeapon(),
          steal: verb !== 'attack',
        });
      }
      if (npc.alienId && verb === 'attack') {
        attackAlien(npc);
        return;
      }
      if (npc.baby && npc.parent) npc.parent.hold = 3;
      npc.hold = 3;
      npc.lookAt = { x: context.player.x + 0.5, z: context.player.y + 0.5 };
      const started = performance.now();
      context.player.gesture = { name: verb, started, duration: verb === 'talk' ? 900 : 650 };
      npc.gesture = {
        name: verb === 'attack' ? 'flinch' : verb === 'talk' ? 'talk' : null,
        started,
        duration: 900,
      };
      if (verb === 'talk') {
        if (npc.baby) {
          npc.speech = 'Goo!';
          npc.speechUntil = performance.now() + 4500;
        } else {
          releaseNPC();
          context.approachingNPC = npc;
          npc.waiting = true;
          npc.hold = 2;
          npc.speech = '';
          npc.speechUntil = 0;
          context.player.path = [];
          context.player.speed = 0;
          context.action = null;
          context.destination = null;
          context.keys.clear();
          openNPCDialogue(
            npc.club
              ? { ...npc, contentResolved: true, intro: nightlifeRebuff(npc.gender || 'man') }
              : createAmbientDialogue(npc, npc.child ? { chain: childConversation() } : {}),
          );
        }
      } else {
        npc.speech = 'Help! Police!';
        npc.speechUntil = performance.now() + 4500;
        announce(
          verb === 'attack'
            ? contentText(
                'world-message.src.world.interactions.you-attack-the-they-call-for-the-police',
                { value1: String(npc.label.toLowerCase()) },
              )
            : contentText(
                'world-message.src.world.interactions.you-steal-a-few-coins-from-the-they-raise-the-alarm',
                { value1: String(npc.label.toLowerCase()) },
              ),
          'You',
        );
        context.chase.start();
        context.$('sf-wanted').hidden = false;
        announce(
          contentText('world-message.src.world.interactions.stop-you-are-under-arrest'),
          'Police',
        );
      }
    };
    context.canvas.focus({ preventScroll: true });
    return approachMovingTarget({
      target: () => (npc.hp === 0 || npc.expeditionDead ? null : npc),
      inReach: () =>
        Math.hypot(context.player.x + 0.5 - npc.x, context.player.y + 0.5 - npc.z) < 1.8 &&
        (!npc.interior || context.currentInterior === npc.interior),
      approach: target,
      perform,
    });
  }

  function debugTeleport(x: number, y: number, serverApproved = false) {
    if (!serverApproved) {
      if (!context.multiplayerWorld || context.multiplayer?.state.debug !== true)
        return { ok: false, message: contentText('world-message.debug.teleport-not-enabled') };
      context.multiplayerWorld.teleport(x, y);
      return {
        ok: true,
        message: contentText(
          'world-message.src.world.interactions.teleport-requested-from-the-server',
        ),
      };
    }
    if (context.bankMenu?.active) context.bankMenu.close();
    const target = debugTilePosition(x, y),
      inCell = context.detention.walkable(x, y);

    if (!context.landClearAt(target.x, target.y) && !inCell)
      return {
        ok: false,
        message: contentText(
          'world-message.src.world.interactions.that-point-is-blocked-or-outside-the-walkable-map-choose-a-roa',
        ),
      };
    // Close committed dialogue receipts first, then cancel any travel they
    // started. No delayed arrival, capture or rehabilitation can undo :tp.
    context.dialogue.close();
    context.aiInterview.close();
    context.questMenu?.close();
    closeReader();
    context.closeCharacter();
    context.closeHelp();
    closeMenu();
    if (context.training) stopTraining();
    setDancing(false);
    parkMotorcycle(false);
    if (context.ferrari?.state.riding) parkFerrari();
    context.social.cancelPitch();
    context.fishing.cancel();
    context.forwardRoll.cancel();
    context.alienCombat = null;
    context.expeditions.stop();
    context.expeditions.abandonShip();
    context.monkeyKeeper?.stop();
    context.capture.cancel();
    context.rehabilitation.cancel();
    context.combatFeedback.clear();
    context.world.inert = false;
    if (context.health.state.hp === 0) context.health.restore();
    context.rocket.cancel();
    context.rope.reset();
    context.basket.reset();
    context.basketArrival = null;
    context.airship.cancel();
    context.sutroClimb.cancel();
    context.tahoe.reset();
    context.waveSurf.stop();
    context.surf.cancelJump();
    context.surf.state.riding = false;
    context.bike.riding = false;
    context.skateboard.riding = false;
    Object.assign(context.chase.state, { wanted: false, jailed: inCell, officers: [], elapsed: 0 });
    context.keys.clear();
    context.pointers.clear();
    clearTimeout(context.pressTimer);
    context.gesture = false;
    context.action = null;
    context.destination = null;
    context.carArrival = null;
    context.currentInterior = null;
    context.currentInstitute = null;
    context.readerPlace = null;
    context.playerSpeechUntil = 0;
    context.pickedCache = null;
    Object.assign(context.player, {
      ...target,
      path: [],
      speed: 0,
      vx: 0,
      vy: 0,
      moving: false,
      motion: 0,
      phase: 0,
      runBlend: 0,
      gesture: null,
      dancing: false,
      sitting: false,
      sitBlend: 0,
    });
    context.$('sf-hover').hidden = true;
    context.$('sf-wanted').hidden = true;
    context.$('sf-custody').hidden = !inCell;
    context.$('sf-player-speech').hidden = true;
    for (const input of context.world.querySelectorAll<HTMLButtonElement>(
      '#sf-map-button,#sf-bike-button,.sf-place-marker',
    ))
      input.disabled = inCell;
    context.updateClimbButton();
    context.updateRocketControls();
    context.updateAirshipButton();
    context.updateSurfButton();
    context.updateBikeButton();
    context.updateTahoeButton();
    context.updateAdventureUI();
    context.updateCamera();
    context.drawMini();
    context.debugConsole?.update();
    return {
      ok: true,
      message: contentText('world-message.src.world.interactions.teleported-to', {
        value1: String(Number(x.toFixed(4))),
        value2: String(Number(y.toFixed(4))),
      }),
    };
  }

  function walkTo(
    x: number,
    y: number,
    onArrival: (() => void) | null = null,
    requestMove?: (x: number, z: number) => void,
  ): boolean {
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
    if (!requestMove) cancelMovingInteraction();
    if (!serverConnected(context.multiplayer)) return false;
    if (context.multiplayerWorld?.selfMode === 'streetcar') return false;
    if (context.multiplayerWorld?.selfMode === 'roof') {
      context.multiplayerWorld.command('travel', { kind: 'houseRoof' });
      return true;
    }
    releaseNPC();
    context.worldStream?.prefetch(x + 0.5, y + 0.5);
    setSitting(false);
    context.wildTarget = null;
    if (context.secretWorld?.bomber.state.active) {
      closeMenu();
      closeReader();
      if (context.clickAttempt) context.clickAttempt.walking = true;
      context.destination = { x, y };
      return context.secretWorld.bomber.target(x + 0.5, y + 0.5);
    }
    context.multiplayerWorld?.stopFollowing(false);
    context.expeditions.stop();
    if (context.expeditions.ship.aboard) {
      announce(
        contentText(
          'world-message.src.world.interactions.speak-to-captain-ahab-to-return-to-shore',
        ),
      );
      return false;
    }
    if (context.clickAttempt && !onArrival) context.clickAttempt.walking = true;
    if (onArrival || requestMove) context.skateboard.riding = false;
    if (context.alienCombat) {
      context.alienCombat = null;
      context.player.gesture = null;
    }
    if (context.training) stopTraining();
    if (context.ferrari?.state.riding) {
      if (onArrival || requestMove) return parkCarFirst();
      return driveFerrari(x, y);
    }
    if (context.capture.state.active) return false;
    setDancing(false);
    if (
      (['pet', 'pet-bear'] satisfies [string, string]).includes(context.player.gesture?.name || '')
    )
      context.player.gesture = null;
    if (context.rocket.state.active) {
      if (context.clickAttempt) context.clickAttempt.worked = false;
      return false;
    }
    if (context.surf.state.jump) {
      if (context.clickAttempt) context.clickAttempt.worked = false;
      return false;
    }
    if (context.dialogue.active) context.dialogue.close();
    if (context.tahoe.state.mode === 'ski') return context.tahoe.steerTo(x + 0.5, y + 0.5);
    if (context.tahoe.state.mode === 'gondola') return false;
    if (context.rope.climbing) return false;
    if (context.flying()) {
      if (context.rope.state.deployed) {
        announce(
          contentText('world-message.src.world.interactions.retract-the-rope-before-flying'),
        );
        return false;
      }
      const accepted = context.airship.flyTo(x + 0.5, y + 0.5);
      if (!accepted) {
        if (context.clickAttempt) context.clickAttempt.worked = false;
        return false;
      }
      context.destination = { x, y };
      context.action = null;
      closeReader();
      context.updateAirshipButton();
      context.drawMini();
      return true;
    }
    if (context.sutroClimb.state.active) return climbUnavailable();
    const jailed = context.chase?.state.jailed;
    if (
      context.surf.state.riding &&
      context.surf.state.mode === 'surf' &&
      context.waveSurf.state.ride &&
      !onArrival
    )
      return context.waveSurf.steer(x + 0.5, y + 0.5);
    if (
      context.surf.state.riding &&
      !context.surf.water(x + 0.5, y + 0.5) &&
      Math.hypot(
        x - requiredValue(context.surf.state.shore, 'Surf shore').x,
        y - requiredValue(context.surf.state.shore, 'Surf shore').y,
      ) < 5
    ) {
      useSurf();
      return true;
    }
    {
      context.fishing.cancel();
      releaseNPC();
      context.player.path = [];
      context.action = jailed
        ? null
        : onArrival
          ? () => {
              parkMotorcycle(false);
              onArrival();
            }
          : null;
      context.destination = { x, y };
      closeReader();
      closeMenu();
      (requestMove || context.multiplayerWorld.moveTo)(x + 0.5, y + 0.5);
      context.drawMini();
      return true;
    }
  }

  function goToPlace(p: Place | undefined) {
    if (!p) return false;
    closeMenu();
    if (p.id === 'freemasons-guild' && !guildStatus().member) {
      announce(
        contentText('world-message.src.world.interactions.the-guild-admits-members-only'),
        'Guild',
      );
      return false;
    }
    if (walkTo(p.inside.x, p.inside.y, () => enter(p)))
      announce(
        contentText('world-message.src.world.interactions.walking-to', { label: String(p.label) }),
      );
    context.canvas.focus({ preventScroll: true });
  }

  function announce(text: string | undefined, who = 'Guide', playerChat = false) {
    if (!playerChat) context.$('sf-status').textContent = text ?? '';
    const row = document.createElement('div'),
      speaker = document.createElement(playerChat ? 'span' : 'time');
    speaker.textContent = who;
    if (playerChat) {
      row.className = 'sf-player-chat-line';
      speaker.className = 'sf-chat-username';
      const message = document.createElement('span');
      message.textContent = text ?? '';
      row.append(speaker, message);
    } else row.append(speaker, document.createTextNode(' ' + text));
    const log = context.$('sf-log');
    log.append(row);
    while (log.children.length > 12) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
  }

  function enter(p: Place) {
    if (!context.active || context.chase?.state.jailed) return;
    if (context.placeAt(context.player.x, context.player.y) !== p) {
      goToPlace(p);
      return;
    }
    if (p.searchHome) {
      closeReader();
      closeMenu();
      context.visited.add(p.id);
      context.drawMini();
      return;
    }
    if (p.activityBuilding) {
      closeReader();
      closeMenu();
      context.visited.add(p.id);
      announce(
        p.id === 'orin-house'
          ? contentText(
              'world-message.src.world.interactions.you-step-inside-orins-house-purple-tablets-and-a-well-worn-arm',
            )
          : p.id === 'freemasons-guild'
            ? contentText(
                'world-message.src.world.interactions.you-enter-the-lodge-a-checkerboard-floor-brass-compasses-and-e',
              )
            : contentText(
                'world-message.src.world.interactions.you-enter-the-the-farmers-wear-black-coats-and-sunglasses-the',
                { TECHNOLOGIST_MARKET: String(TECHNOLOGIST_MARKET) },
              ),
        'You',
      );
      context.drawMini();
      return;
    }
    if (p.id === 'ai-lab') {
      closeReader();
      closeMenu();
      context.visited.add(p.id);
      if (context.aiLabJob.state.hired)
        announce(
          contentText('world-message.src.world.interactions.welcome-back-to-the-ai-lab'),
          'AI Lab',
        );
      else
        announce(
          contentText('world-message.src.world.interactions.you-enter-the-ai-lab'),
          'AI Lab',
        );
      context.drawMini();
      return;
    }
    if (context.readerPlace === p && !context.$('sf-reader').hidden) return;
    context.readerPlace = p;
    closeMenu();
    context.$('sf-help').hidden = true;
    context.world.classList.add('sf-reading');
    delete context.$('sf-reader').dataset.lore;
    context.visited.add(p.id);
    context.$('sf-reader-title').textContent = p.label;
    context.$('sf-reader-category').textContent = p.category + ' / San Francisco';
    context.$('sf-reader-description').textContent = p.description || '';
    const content = context.$('sf-reader-content');
    content.replaceChildren();
    delete content.dataset.format;
    if (p.source === 'Bio') {
      const bio = document.createElement('div');
      bio.className = 'bio-content';
      bio.innerHTML = readerContent.bio;
      const contact = document.createElement('div');
      contact.className = 'sf-contact';
      contact.innerHTML = readerContent.contact;
      content.append(bio, contact);
    } else {
      const sections: Readonly<Record<string, string>> = readerContent.sections;
      const source = document.createElement('div');
      source.innerHTML = requiredValue(
        sections[requiredValue(p.source, 'Source section ID')],
        'Source section',
      );
      for (const child of source.children) {
        if (child.tagName === 'SUMMARY') continue;
        if (p.match) {
          if (
            child.tagName === 'P' &&
            (child.querySelector(`a[href*="${p.match}"]`) || !child.querySelector('a'))
          )
            content.append(child.cloneNode(true));
        } else content.append(child.cloneNode(true));
      }
    }
    content.querySelectorAll<HTMLElementTagNameMap['a']>('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    context.$('sf-reader').hidden = false;
    context.$('sf-reader-shade').hidden = true;
    context.$('sf-reader').scrollTop = 0;
    context.drawMini();
  }

  function closeReader() {
    if (context.$('sf-reader').hidden) return;
    context.$('sf-reader').hidden = true;
    context.readerPlace = null;
    context.world.classList.remove('sf-reading');
    context.$('sf-reader-shade').hidden = context.$('sf-help').hidden;
    if (context.active) context.canvas.focus({ preventScroll: true });
  }

  function closeMenu() {
    context.$('sf-context').hidden = true;
  }

  function revealContextMenu(menu: HTMLDivElement, sx?: number, sy?: number) {
    menu.hidden = false;
    const width = context.width - menu.offsetWidth;
    const height = context.height - menu.offsetHeight;
    menu.style.left = Math.max(12, Math.min(width - 12, sx ?? width / 2)) + 'px';
    menu.style.top = Math.max(12, Math.min(height - 12, sy ?? height / 2)) + 'px';
    menu.scrollTop = 0;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  function clicked(sx: unknown, sy: unknown, fn: () => unknown) {
    if (!context.built || context.tabletService?.state.active) return false;
    cancelMovingInteraction();
    const previous = context.clickAttempt,
      attempt = { worked: true, walking: false };
    context.clickAttempt = attempt;
    try {
      const result = fn();
      if (result === false) attempt.worked = false;
      return result;
    } finally {
      context.clickAttempt = previous;
      if (attempt.walking && isFiniteNumber(sx) && isFiniteNumber(sy) && (sx || sy)) {
        const feedback = context.$('sf-click-marker');
        context.clickAnimation?.cancel();
        feedback.hidden = false;
        feedback.dataset.accepted = String(attempt.worked);
        feedback.style.left = sx + 'px';
        feedback.style.top = sy + 'px';
        context.clickAnimation = feedback.animate(
          [
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: 'translate(-50%,-50%) scale(.08)', opacity: 0 },
          ],
          { duration: context.reduced ? 180 : 440, easing: 'ease-in', fill: 'forwards' },
        );
        context.clickAnimation.onfinish = () => {
          feedback.hidden = true;
        };
      }
    }
  }

  function actorWalkPoint(npc: { x: number; z: number }) {
    const requested = { x: npc.x - 0.5, y: npc.z - 0.5 };
    if (!Number.isFinite(requested.x) || !Number.isFinite(requested.y)) return null;
    if (context.clearAt(requested.x, requested.y) && context.pathTo(requested.x, requested.y))
      return requested;
    for (let r = 0.25; r <= 1.75; r += 0.25)
      for (let i = 0; i < 16; i++) {
        const x = requested.x + Math.cos((i * Math.PI) / 8) * r,
          y = requested.y + Math.sin((i * Math.PI) / 8) * r;
        if (context.clearAt(x, y) && context.pathTo(x, y)) return { x, y };
      }
    return null;
  }

  function walkToActor(npc: { x: number; z: number }) {
    const p = actorWalkPoint(npc);
    return p ? walkTo(p.x, p.y) : false;
  }

  function examine(p: { description?: string } | null | undefined) {
    closeMenu();
    if (p?.description) announce(p.description, 'Examine');
    context.canvas.focus({ preventScroll: true });
  }

  function walkAtSight(
    sight: InteractionSight | null | undefined,
    tile: { x: number; y: number },
    hitResearchRoom = false,
  ) {
    if (!sight) return false;
    if (sight.kind === 'nightlife')
      return inNightlife(context.player.x + 0.5, context.player.y + 0.5);
    if (!context.clearAt(tile.x, tile.y)) return false;
    if (sight.enterableInstitute)
      return context.activeInstituteRoom()?.id === sight.id || !hitResearchRoom;
    return (
      sight.kind === 'times-square' ||
      sight.kind === 'research-institute' ||
      sight.kind === 'park' ||
      sight.kind === 'neighborhood-garden'
    );
  }

  function worldTarget(
    sx: number,
    sy: number,
    pressed?: { npc: InteractiveActor | null; sight: InteractionSight | null },
  ) {
    const picked = context.pick?.(sx, sy);
    const npc =
      pressed?.npc ||
      (!pressed?.sight
        ? picked?.npc ||
          (!picked?.sight || picked.sight.kind === 'guest' ? context.hitCitizen(sx, sy) : null)
        : null);
    const sight = pressed?.sight || (!npc ? context.hitSight?.(sx, sy) : null) || picked?.sight;
    const useLoot = sight?.kind === 'loot' && !npc?.networkPlayer && !npc?.police;
    const selectedNPC = useLoot ? null : npc;
    const selectedSight = selectedNPC ? null : (sight ?? null);
    let tile: Point | undefined;
    return {
      sx,
      sy,
      npc: selectedNPC,
      sight: selectedSight,
      place: selectedNPC || selectedSight ? null : picked?.place || context.hitPlace(sx, sy),
      get tile() {
        return (tile ??= context.tileAt(sx, sy));
      },
      researchRoom: !!picked?.researchRoom,
    };
  }

  type WorldAction = { id: string; label: string; run: () => unknown; target?: ActionLabelTarget };

  function examineNPC(npc: InteractiveActor) {
    announce(
      context.npcLabel(npc, false) +
        ': ' +
        (context.npcRevealed(npc)
          ? 'An alien silhouette ripples beneath a coating of green slime.'
          : describeCharacter(npc)),
      'Examine',
    );
    context.canvas.focus({ preventScroll: true });
  }

  function primaryNPCAction(npc: InteractiveActor): WorldAction {
    const verb = context.npcPrimary(npc);
    const label = context.npcLabel(npc, verb !== 'examine');
    return {
      id: 'npc.' + verb,
      label:
        { talk: 'Talk-To', attack: 'Attack', examine: 'Examine', pet: 'Pet', walk: 'Walk here' }[
          verb
        ] +
        ' ' +
        label,
      run:
        verb === 'walk'
          ? () => walkToActor(npc)
          : verb === 'examine'
            ? () => examineNPC(npc)
            : () => interactCitizen(npc, verb),
    };
  }

  function atvRented() {
    return hasATVRental(context.multiplayer.state.personal?.travel?.atvRentalUntil);
  }

  function primarySightAction(sight: InteractionSight): WorldAction {
    const { id, kind, label } = sight;
    const action = (
      id: string,
      label: string,
      run = () => goToSight(sight),
      target?: ActionLabelTarget,
    ): WorldAction => ({ id, label, run, target });
    if (sight.enterableInstitute && context.activeInstituteRoom()?.id !== id)
      return action('interaction.13', 'Enter ' + label);
    if (buildingNPCService(sight)) return action('examine', 'Examine ' + label);
    if (id === 'sutro') return action('interaction.25', 'Climb ' + label);
    if (id === 'zoo-monkeys')
      return action('interaction.19', 'Steal monkey', undefined, { label: 'monkey', kind: 'npc' });
    switch (kind) {
      case MARKET_STREETCAR.kind:
        return action('streetcar.board', 'Ride ' + label, () =>
          approachMovingTarget({
            target: context.streetcarPose,
            inReach: (car) =>
              Math.hypot(context.player.x + 0.5 - car.x, context.player.y + 0.5 - car.z) <=
              STREETCAR_BOARD_RANGE,
            approach: actorWalkPoint,
            perform: () => context.multiplayerWorld.command('travel', { kind: 'streetcarBoard' }),
          }),
        );
      case CONSTRUCTION_SITE.id: {
        const work = context.multiplayerWorld;
        if (work.selfMode === 'construction')
          return action('construction.stop', 'Stop work at ' + label, () => {
            work.command('playerAction', { verb: 'constructionStop' });
          });
        return action('construction.start', 'Contribute to ' + label, startConstruction);
      }
      case MUD_BATH.id: {
        const world = context.multiplayerWorld;
        if (
          world.selfMode === 'sit' &&
          Math.hypot(context.player.x + 0.5 - MUD_BATH.x, context.player.y + 0.5 - MUD_BATH.z) <
            0.15
        )
          return action('mud-bath.stand', 'Get out of Mud Bath', () =>
            world.command('activity', { mode: 'walk' }),
          );
        const { x, y } = MUD_BATH.entry;
        return action('mud-bath.sit', 'Sit in Mud Bath', () =>
          walkTo(x, y, () => world.command('activity', { mode: 'sit', mudBath: true })),
        );
      }
      case ATV_RENTAL.siteId:
        if (atvRented() && hasSiteEntry(sight)) {
          const { entry } = sight;
          return action('atv.mount', 'Mount ' + label, () => {
            const mount = () => context.multiplayerWorld.command('travel', { kind: 'atvMount' });
            const { x, z } = ATV_RENTAL.parking;
            if (
              context.multiplayerWorld.selfMode === 'walk' &&
              Math.hypot(context.player.x + 0.5 - x, context.player.y + 0.5 - z) <=
                ATV_RENTAL.mountRange - 0.15
            )
              return mount();
            return walkTo(entry.x, entry.y, mount);
          });
        }
        break;
      case ATV_RAMP_KIND:
        if (context.multiplayerWorld.selfMode === 'atv')
          return action('atv.jump', 'Jump ' + label, () =>
            context.multiplayerWorld.command('travel', { kind: 'atvJump', id }),
          );
        break;
      case 'swing': {
        const { entry } = sight;
        if (!entry) break;
        const travel = context.multiplayerWorld;
        if (
          travel.selfMode === 'swing' &&
          Math.hypot(context.player.x - entry.x, context.player.y - entry.y) < 0.7
        )
          return action('swing.exit', 'Get off swing', () =>
            travel.command('travel', { kind: 'swingExit' }),
          );
        return action('swing.board', 'Swing on ' + label, () =>
          walkTo(entry.x, entry.y, () => {
            travel.command('travel', { kind: 'swingBoard', id });
          }),
        );
      }
      case 'trampoline': {
        const { x, z } = TRAMPOLINE;
        return action('yard.jump', 'Jump on ' + label, () =>
          walkTo(x - 0.5, z - 0.5, () =>
            context.multiplayerWorld.command('playerAction', { verb: 'trampoline' }),
          ),
        );
      }
      case 'hot-trapdoor':
      case 'lab-exit': {
        if (!hasSiteEntry(sight)) break;
        const { entry } = sight;
        return action(
          kind,
          kind === 'hot-trapdoor' ? 'Descend hot trapdoor' : 'Climb laboratory stairs',
          () =>
            walkTo(entry.x, entry.y, () => {
              if (kind === 'lab-exit') context.secretWorld.leave();
              else context.multiplayerWorld.command('instanceEnter', { kind: 'berkeley-lab' });
            }),
        );
      }
      case 'ferrari':
        return action('interaction.28', 'Drive / park ' + label);
      case 'called-waymo':
        if (
          context.multiplayer.state.personal?.travel?.waymo?.phase === 'parked' &&
          hasSiteEntry(sight)
        )
          return action('waymo.board', 'Board ' + label, () => {
            const board = () => context.multiplayerWorld.command('travel', { kind: 'waymoBoard' });
            return Math.hypot(context.player.x - sight.entry.x, context.player.y - sight.entry.y) <=
              1.4
              ? board()
              : walkTo(sight.entry.x, sight.entry.y, board);
          });
        break;
      case 'waymo':
      case 'robotaxi':
        return action('taxi.kick', 'Kick ' + label);
      case 'airship-rope':
        return action('interaction.7', 'Climb up airship rope');
      case 'house-storage':
        return action('interaction.8', 'Search ' + label);
      case 'unusual-church':
        return action('church.search', 'Read the CHURCH NOTICEBOARD', () => searchChurch(sight), {
          label: 'CHURCH NOTICEBOARD',
          kind: 'object',
        });
      case 'lore-book':
        return action('interaction.9', 'Read ' + label);
      case 'loot':
        return action('interaction.10', 'Take ' + label);
      case 'bench':
        return action('interaction.11', 'Sit on ' + label);
      case 'neighborhood-garden':
        if (sight.seats?.length)
          return action('interaction.12', 'Sit in garden', undefined, {
            label: 'garden',
            kind: 'object',
          });
        break;
      case 'secret-stairs':
      case 'cave-exit':
      case 'stealth-bomber':
        return action('interaction.15', sightPrimaryVerb(sight) + ' ' + label);
      case 'sunglasses':
        if (!context.sunglasses.state.owned) return action('interaction.16', 'Take ' + label);
        break;
      case 'sand':
        return action('interaction.17', 'Collect Ocean Beach sand');
      case 'fishing':
        return action('interaction.18', 'Catch live fish', undefined, {
          label: 'live fish',
          kind: 'item',
        });
      case 'motorcycle':
        if (context.motorcycle.state.rented) return action('interaction.20', 'Ride motorcycle');
        break;
      case 'bunny':
        return action('interaction.22', 'Pet bunny');
      case 'zoo':
        if (context.zoo.state.phase === 'caged')
          return action('interaction.23', 'Release tiger', undefined, {
            label: 'tiger',
            kind: 'npc',
          });
        break;
      case 'gondola':
        return action(
          'interaction.24',
          id === 'gondola-base' ? 'Ride gondola up' : 'Ride gondola down',
          undefined,
          { label: 'gondola', kind: 'object' },
        );
      case 'gym':
        if (context.training) return action('interaction.27', 'Stop training');
        return action(
          'gym.' + context.gymSelection,
          'Perform ' + gymExercise(context.gymSelection).label,
        );
      case 'airship':
        return action('interaction.30', 'Rent airship', undefined, {
          label: 'airship',
          kind: 'object',
        });
      case 'bike':
        return action('interaction.31', 'Ride bicycle');
      case 'windsurf':
        return action('interaction.32', 'Go windsurfing');
      case 'surfing':
        return action('interaction.33', 'Paddle out');
      case 'whale':
        return action('interaction.34', 'Jump over ' + label);
      case 'guest':
        return action('interaction.35', 'Talk to Bani', undefined, { label: 'Bani', kind: 'npc' });
      case 'ducks':
        return action('interaction.36', 'Feed ducks', undefined, { label: 'ducks', kind: 'npc' });
      case 'nightlife':
        if (!inNightlife(context.player.x + 0.5, context.player.y + 0.5))
          return action('nightlife.enter', 'Enter ' + label);
        break;
    }
    return action('examine', 'Examine ' + label, () => examine(sight));
  }

  function groundAction(tile: Point): WorldAction {
    if (context.multiplayerWorld?.selfMode === 'atv')
      return { id: 'atv.drive-here', label: 'Drive here', run: () => walkTo(tile.x, tile.y) };
    if (context.multiplayerWorld?.selfMode === 'waymo')
      return { id: 'waymo.drive-here', label: 'Drive here', run: () => walkTo(tile.x, tile.y) };
    if (context.ferrari?.state.riding)
      return {
        id: 'ferrari.drive-here',
        label: 'Drive here',
        run: () => driveFerrari(tile.x, tile.y),
      };
    const bomber = context.secretWorld?.bomber.state;
    if (bomber?.active)
      return bomber.phase === 'flying'
        ? { id: 'interaction.1', label: 'Fly here', run: () => walkTo(tile.x, tile.y) }
        : { id: 'examine', label: 'Examine B-2', run: () => examine(context.bomberSite) };
    if (context.secretWorld?.kind === 'illuminati' || context.secretWorld?.kind === 'berkeley-lab')
      return {
        id: 'walk',
        label: 'Walk here',
        run: () => context.clearAt(tile.x, tile.y) && walkTo(tile.x, tile.y),
      };
    if (context.surf.state.riding && context.surf.water(tile.x + 0.5, tile.y + 0.5))
      return {
        id: 'interaction.37',
        label: context.surf.state.mode === 'surf' ? 'Paddle here' : 'Windsurf here',
        run: () => walkTo(tile.x, tile.y),
      };
    const road =
      isFiniteNumber(tile.x) && isFiniteNumber(tile.y)
        ? context.goldenGate?.targetAt(tile.x + 0.5, tile.y + 0.5) ||
          context.regionalRoad?.targetAt(tile.x + 0.5, tile.y + 0.5)
        : null;
    return {
      id: 'walk',
      label: 'Walk here',
      run: () => walkTo(road?.x ?? tile.x, road?.y ?? tile.y),
    };
  }

  const streetcarExit: WorldAction & { target: ActionLabelTarget } = {
    id: 'streetcar.exit',
    label: 'Get off cable car',
    target: { label: 'cable car', kind: 'object' },
    run: () => context.multiplayerWorld?.command('travel', { kind: 'streetcarExit' }),
  };

  const waymoExit: WorldAction & { target: ActionLabelTarget } = {
    id: 'waymo.exit',
    label: 'Exit Waymo',
    target: { label: 'Waymo', kind: 'object' },
    run: () => context.multiplayerWorld?.command('travel', { kind: 'waymoExit' }),
  };

  function primaryWorldAction(target: ReturnType<typeof worldTarget>): WorldAction {
    const { npc, sight, place, researchRoom } = target;
    if (context.multiplayerWorld?.selfMode === 'streetcar') {
      return sight?.kind === MARKET_STREETCAR.kind
        ? streetcarExit
        : { id: 'streetcar.ride', label: 'Riding the cable car', run: () => false };
    }
    if (context.multiplayerWorld?.selfMode === 'roof')
      return {
        id: 'house.descend',
        label: 'Climb down',
        run: () => walkTo(target.tile.x, target.tile.y),
      };
    if (context.multiplayerWorld?.selfMode === 'atv')
      return sight?.kind === ATV_RAMP_KIND ? primarySightAction(sight) : groundAction(target.tile);
    if (context.multiplayerWorld?.selfMode === 'waymo') return groundAction(target.tile);
    if (npc?.networkPlayer || npc?.police || npc?.kind === AIRSHIP_TRAVELER)
      return primaryNPCAction(npc);
    if (context.secretWorld?.bomber.state.active) return groundAction(target.tile);
    if (context.flying()) {
      if (sight?.kind === 'airship-rope')
        return {
          id: 'interaction.7',
          label: 'Rope options',
          target: { label: 'Rope', kind: 'object' },
          run: () => showRopeMenu(target.sx, target.sy),
        };
      const floor = context.basket.pick(
        context.mouseRay(target.sx, target.sy),
        requiredValue(context.airship.state.position, 'Airship deck position'),
        context.airship.state.heading,
      );
      return floor
        ? { id: 'walk', label: 'Walk here', run: () => walkInBasket(floor) }
        : {
            id: 'airship.float-here',
            label: 'Float here',
            run: () => walkTo(target.tile.x, target.tile.y),
          };
    }
    if (sight?.kind === 'loot') return primarySightAction(sight);
    if (context.chase?.state.jailed)
      return npc?.rehabilitation ? primaryNPCAction(npc) : groundAction(target.tile);
    if (context.ferrari?.state.riding) {
      if (sight?.kind === 'ferrari') return primarySightAction(sight);
      return npc?.kind === 'fuel-attendant' ? primaryNPCAction(npc) : groundAction(target.tile);
    }
    if (npc) return primaryNPCAction(npc);
    if (sight) {
      if (
        walkAtSight(sight, target.tile, researchRoom) ||
        (sight.kind === 'bridge' &&
          (context.goldenGate?.targetAt(target.tile.x + 0.5, target.tile.y + 0.5) ||
            context.regionalRoad?.targetAt(target.tile.x + 0.5, target.tile.y + 0.5)))
      )
        return groundAction(target.tile);
      return primarySightAction(sight);
    }
    if (place) {
      const verb = placeEntryVerb(place, context.currentInterior);
      if (verb === 'Enter')
        return {
          id: 'interaction.14',
          label: verb + ' ' + place.label,
          run: () => goToPlace(place),
        };
      if (context.clearAt(target.tile.x, target.tile.y)) return groundAction(target.tile);
      if (verb === 'Browse')
        return { id: 'interaction.14', label: verb + ' ' + place.label, run: () => enter(place) };
      return { id: 'examine', label: 'Examine ' + place.label, run: () => examine(place) };
    }
    return groundAction(target.tile);
  }

  function showExitMenu(sx?: number, sy?: number) {
    const mode = context.multiplayerWorld?.selfMode;
    const exit = mode === 'streetcar' ? streetcarExit : mode === 'waymo' ? waymoExit : null;
    if (exit) {
      const menu = context.$('sf-context');
      const heading = document.createElement('div');
      heading.className = 'sf-context-title';
      setActionText(heading, exit.target.label, [exit.target]);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.actionId = exit.id;
      button.setAttribute('role', 'menuitem');
      setActionText(button, exit.label, [exit.target]);
      button.addEventListener('click', (e) =>
        clicked(e.clientX, e.clientY, () => {
          closeMenu();
          return exit.run();
        }),
      );
      menu.replaceChildren(heading, button);
      context.$('sf-hover').hidden = true;
      revealContextMenu(menu, sx, sy);
      return true;
    }
    if (context.sutroClimb.state.active) {
      context.$('sf-hover').hidden = true;
      const menu = context.$('sf-context');
      menu.replaceChildren();
      const heading = document.createElement('div');
      heading.className = 'sf-context-title';
      const towerTarget = {
        label: contentText('world.interactions.showMenu.label-41', {}),
        kind: 'object',
      };
      setActionText(heading, towerTarget.label, [towerTarget]);
      menu.append(heading);
      for (const [label, fn] of [
        ['Climb down Sutro Tower', descendSutro] satisfies [string, () => unknown],
        ...(context.sutroClimb.state.phase === 'top'
          ? [
              [context.player.dancing ? 'Stop dancing' : 'Dance on Sutro Tower', dance] satisfies [
                string,
                () => unknown,
              ],
            ]
          : []),
        ['Examine Sutro Tower', () => examine(sightById('sutro'))] satisfies [
          string,
          () => unknown,
        ],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.actionId =
          fn === dance ? 'tower.dance' : fn === descendSutro ? 'tower.descend' : 'examine';
        button.setAttribute('role', 'menuitem');
        setActionText(button, label, [towerTarget]);
        button.addEventListener('click', (e) =>
          clicked(e.clientX, e.clientY, () => {
            closeMenu();
            return fn();
          }),
        );
        menu.append(button);
      }
      promoteWalkAction(menu);
      editMenuLabels(menu, sightById('sutro'), [
        {
          label: requiredValue(sightById('sutro'), 'Missing authored entity: sutro').label,
          kind: 'object',
        },
      ]);
      revealContextMenu(menu, sx, sy);
      return true;
    }
    return false;
  }

  function showMenu(sx: number, sy: number) {
    if (context.tabletService?.state.active) return false;
    if (context.rocket.state.active) return false;
    if (context.surf.state.jump) return false;
    if (context.tahoe.state.mode !== 'ground' || context.multiplayerWorld?.selfMode === 'atv')
      return false;
    const target = worldTarget(sx, sy);
    if (target.sight?.kind === 'airship-rope' && context.airship.state.active)
      return showRopeMenu(sx, sy);
    if (
      context.flying() &&
      !target.npc?.networkPlayer &&
      !target.npc?.police &&
      target.npc?.kind !== AIRSHIP_TRAVELER
    )
      return showAirshipMenu(sx, sy);
    if (showExitMenu(sx, sy)) return true;
    const { npc, sight: s, place: p, tile: t } = target;
    if (
      !npc &&
      !s &&
      !p &&
      (!isFiniteNumber(t.x) || !isFiniteNumber(t.y)) &&
      !context.secretWorld?.bomber.state.active
    ) {
      closeMenu();
      return false;
    }
    const inCave = context.secretWorld?.kind === 'illuminati';
    let caveFloor = null;
    if (inCave && !npc && !s && !p && !context.secretWorld.bomber.state.active) {
      const floor = instanceTile(ILLUMINATI_INSTANCE, t.x + 0.5, t.y + 0.5);
      if (!floor || floor.type === 'rock') {
        closeMenu();
        return false;
      }
      caveFloor = {
        label: floor.type === 'hangar' ? 'hangar floor' : 'stone passage',
        description: contentText(
          floor.type === 'hangar'
            ? 'world.interactions.examine.hangar-floor'
            : 'world.interactions.examine.stone-passage',
        ),
      };
    }
    const primary = primaryWorldAction(target);
    const entryVerb = p && placeEntryVerb(p, context.currentInterior);
    const menu = context.$('sf-context');
    const owner: EditableEntity = npc ||
      s ||
      p ||
      caveFloor || {
        id: 'unlabelled-ground',
        label: contentText('world.interactions.showMenu.label-43', {}),
      };
    if (owner)
      applyEntityEdits(
        owner,
        owner.editorKey || (npc ? 'actor:' : p ? 'place:' : 'sight:') + owner.id,
      );
    menu.replaceChildren();
    context.$('sf-hover').hidden = true;
    const actionTargets = npc
      ? [
          { label: context.npcLabel(npc), kind: npc.editorCategory || 'npc' },
          { label: context.npcLabel(npc, false), kind: npc.editorCategory || 'npc' },
        ]
      : s
        ? [{ label: s.label, kind: actionTargetKind(s) }]
        : p
          ? [{ label: p.label, kind: p.editorCategory || 'object' }]
          : caveFloor
            ? [{ label: caveFloor.label, kind: 'object' }]
            : [];
    const heading = document.createElement('div');
    heading.className = 'sf-context-title';
    setActionText(heading, actionTargets[0]?.label || 'Choose an option', actionTargets);
    menu.append(heading);
    const namedActions = new Map<string | undefined, ActionLabelTarget>();
    const add = (
      text: string,
      fn: () => unknown,
      actionId: string | undefined,
      namedTarget?: ActionLabelTarget,
    ) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.actionId = actionId;
      b.setAttribute('role', 'menuitem');
      if (namedTarget) namedActions.set(actionId, namedTarget);
      setActionText(
        b,
        text,
        namedTarget ? [namedTarget, ...actionTargets] : actionTargets,
        namedTarget,
      );
      b.addEventListener('click', (e) =>
        clicked(e.clientX, e.clientY, () => {
          closeMenu();
          (actionId === primary.id ? primary.run : fn)();
        }),
      );
      menu.append(b);
      return b;
    };
    if (context.multiplayerWorld?.selfMode === 'roof') {
      add(
        'Climb down',
        () => context.multiplayerWorld.command('travel', { kind: 'houseRoof' }),
        'house.descend',
      );
      revealContextMenu(menu, sx, sy);
      return;
    }
    if (!npc && context.secretWorld?.bomber.state.active) {
      if (context.secretWorld.bomber.state.phase === 'flying') {
        add('Fly here', () => walkTo(t.x, t.y), 'interaction.1');
        add('Barrel roll · R', () => context.secretWorld.bomber.barrelRoll(), 'interaction.2');
        add(
          'Drop bomb · ' +
            (context.secretWorld.bomber.bombSeconds
              ? context.secretWorld.bomber.bombSeconds + 's reload'
              : 'Ready'),
          () => secretAction(context.secretWorld.dropBomb()),
          'interaction.3',
        );
        add(
          'Land · Parachute out',
          () => secretAction(context.secretWorld.ejectBomber()),
          'interaction.4',
        );
      }
      add('Examine B-2', () => examine(context.bomberSite), 'examine', {
        label: 'B-2',
        kind: 'object',
      });
      promoteWalkAction(menu);
      menu.hidden = false;
      menu.style.left = Math.min(context.width - menu.offsetWidth - 12, Math.max(12, sx)) + 'px';
      menu.style.top = Math.min(context.height - menu.offsetHeight - 12, Math.max(12, sy)) + 'px';
      menu.querySelector<HTMLElementTagNameMap['button']>('button')!.focus({ preventScroll: true });
      return;
    }
    if (!npc && context.surf.state.riding && context.surf.state.mode === 'surf') {
      if (context.waveSurf.state.ride)
        for (const trick of SURF_TRICKS)
          add(trick.label, () => performSurfTrick(trick.id), 'trick.' + trick.id);
      else add('Catch wave', catchPacificaWave, 'interaction.5', { label: 'wave', kind: 'object' });
      add('Return to Pacifica beach', useSurf, 'interaction.6', {
        label: 'Pacifica beach',
        kind: 'object',
      });
    }
    if (npc)
      for (const verb of npcContextActions(npc, {
        primary: context.npcPrimary(npc),
        duel:
          atDuelArena(context.player.x + 0.5, context.player.y + 0.5) && atDuelArena(npc.x, npc.z),
        pvp:
          context.multiplayer.state.pvp?.enabled &&
          npc.pvp &&
          npc.mode !== 'bomber' &&
          !context.secretWorld?.bomber.state.active,
      })) {
        if (verb === 'trade' && npc.networkPlayer)
          add(
            'Trade with ' + npc.label,
            () => context.multiplayerWorld.command('tradeRequest', { id: npc.id }),
            'npc.trade',
          );
        else if (verb === 'duel')
          add(
            'Challenge to coin duel',
            () => {
              if (npc.networkPlayer) requiredValue(context.duelMenu, 'Duel menu').open(npc);
            },
            'npc.duel',
            actionTargets[1],
          );
        else if (verb === 'follow')
          add(
            'Follow ' + npc.label,
            () => {
              if (npc.networkPlayer) context.multiplayerWorld.followPlayer(npc);
            },
            'npc.follow',
          );
        else if (verb === 'examine')
          add('Examine ' + context.npcLabel(npc, false), () => examineNPC(npc), 'npc.examine');
        else if (verb === 'walk') {
          const target = actorWalkPoint(npc);
          if (target)
            add(
              'Walk here ' + context.npcLabel(npc, false),
              () => walkTo(target.x, target.y),
              'npc.walk',
            );
        } else
          add(
            { talk: 'Talk-To', attack: 'Attack', pet: 'Pet' }[verb] + ' ' + context.npcLabel(npc),
            () => interactCitizen(npc, verb),
            'npc.' + verb,
          );
      }
    const sightAction = s && primarySightAction(s);
    if (sightAction && sightAction.id !== 'examine')
      add(
        sightAction.label,
        sightAction.run,
        sightAction.id,
        sightAction.target ?? actionTargets[0],
      );
    if (p && entryVerb)
      add(
        entryVerb + ' ' + p.label,
        () => (entryVerb === 'Browse' ? enter(p) : goToPlace(p)),
        'interaction.14',
      );
    if (p && houseClimb(p.id))
      add(
        'Climb ' + p.label,
        () =>
          walkTo(p.entry.x, p.entry.y, () =>
            context.multiplayerWorld.command('travel', { kind: 'houseRoof', id: p.id }),
          ),
        'house.climb',
      );
    if (s?.kind === 'motorcycle' && !context.motorcycle.state.rented)
      add('Steal ' + s.label, () => useMotorcycle('steal'), 'interaction.21');
    if (s?.id === 'sutro' && s.entry) {
      const entry = s.entry;
      add('Walk to Sutro Tower', () => walkTo(entry.x, entry.y), 'interaction.26');
    }
    if (s?.kind === 'gym')
      for (const exercise of GYM_EXERCISES)
        if (sightAction?.id !== 'gym.' + exercise.id)
          add(
            'Perform ' + exercise.label,
            () => useGym(exercise.id),
            'gym.' + exercise.id,
            actionTargets[0],
          );
    if (s?.kind === 'ferrari' && context.economy.state.fuelCans)
      add('Use fuel can', useFuelCan, 'interaction.29', { label: 'fuel can', kind: 'item' });
    const roadTarget = inCave
      ? null
      : context.goldenGate?.targetAt(t.x + 0.5, t.y + 0.5) ||
        context.regionalRoad?.targetAt(t.x + 0.5, t.y + 0.5);
    if (!npc) {
      if (s?.kind !== 'loot' && s?.kind !== 'sunglasses') {
        if (context.surf.state.riding && context.surf.water(t.x + 0.5, t.y + 0.5))
          add(
            context.surf.state.mode === 'surf' ? 'Paddle here' : 'Windsurf here',
            () => {
              if (context.surf.state.mode === 'surf') context.waveSurf.cancelRide();
              walkTo(t.x, t.y);
            },
            'interaction.37',
          );
        else if ((s?.kind === 'secret-stairs' || s?.kind === 'cave-exit') && hasSiteEntry(s)) {
          add('Walk here', () => walkTo(s.entry.x, s.entry.y), 'walk');
        } else if (s?.kind === 'ferrari' && s.entry) {
          const { x, y } = roadTarget || (context.clearAt(t.x, t.y) ? t : s.entry);
          add(
            'Walk here',
            () => {
              if (context.ferrari.state.riding) parkFerrari();
              return walkTo(x, y);
            },
            'walk',
          );
        } else if (roadTarget) add('Walk here', () => walkTo(roadTarget.x, roadTarget.y), 'walk');
        else if (context.clearAt(t.x, t.y)) add('Walk here', () => walkTo(t.x, t.y), 'walk');
        else if (p) add('Walk to entrance', () => walkTo(p.entry.x, p.entry.y), 'walk');
      }
      const examineTarget =
        s || p || caveFloor || (!inCave && context.inPark(t.x, t.y) ? sightById('park') : null);
      if (examineTarget)
        add('Examine ' + examineTarget.label, () => examine(examineTarget), 'examine', {
          label: examineTarget.label,
          kind: actionTargetKind(examineTarget),
        });
    }
    if (!npc && !s && !p && context.skateboard.riding)
      for (const trick of SKATE_TRICKS)
        add(trick.label, () => performSkateTrick(trick.id), 'trick.' + trick.id);
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button')];
    const primaryButton =
      buttons.find((button) => button.dataset.actionId === primary.id) ||
      (caveFloor && !context.clearAt(t.x, t.y)
        ? undefined
        : add(primary.label, primary.run, primary.id, primary.target));
    editMenuLabels(menu, owner, actionTargets, namedActions);
    if (s?.kind === 'ferrari') {
      for (const id of ['walk', 'examine']) {
        const button = buttons.find((candidate) => candidate.dataset.actionId === id);
        if (button && !menu.contains(button)) menu.append(button);
      }
    }
    if (primaryButton)
      orderPrimaryActions(menu, primaryButton, s?.kind === 'ferrari' ? ['walk', 'examine'] : []);
    if (npc && !npc.networkPlayer && npc.rider && !npc.bicycleTaken) {
      const seize = add(
        'Seize-Bicycle-from ' + context.npcLabel(npc, false),
        () => seizeBicycle(npc),
        'npc.seize-bicycle',
      );
      const examine = menu.querySelector('[data-action-id="npc.examine"]');
      if (examine) menu.insertBefore(seize, examine);
    }
    revealContextMenu(menu, sx, sy);
  }

  function editMenuLabels(
    menu: HTMLDivElement,
    owner: string | EditableEntity | null | undefined,
    targets: readonly ActionLabelTarget[],
    namedActions?: ReadonlyMap<string | undefined, ActionLabelTarget>,
  ) {
    const buttons = [...menu.querySelectorAll<HTMLElementTagNameMap['button']>('button')];
    const bindings = new Map(buttons.map((b) => [b.dataset.actionId, b]));
    const authored = menuFromContent(owner, bindings, context);
    if (!authored) return;
    const heading = menu.firstChild;
    menu.replaceChildren(requiredValue(heading, 'Context menu heading'));
    for (const action of authored) {
      const b = action.binding;
      const target = namedActions?.get(b.dataset.actionId);
      setActionText(b, action.label, target ? [target, ...targets] : targets, target);
      b.disabled = !!action.disabled;
      menu.append(b);
    }
  }

  function parkCarFirst() {
    announce(
      contentText('world-message.src.world.interactions.park-the-ferrari-with-r-before-doing-that'),
      'Ferrari',
    );
    return false;
  }

  function nearestFuel() {
    if (!context.ferrari) return null;
    const car = context.ferrari;
    return car.stations.reduce<(typeof car.stations)[number] | null>(
      (best, s) =>
        !best ||
        Math.abs(s.distance - car.state.distance) < Math.abs(best.distance - car.state.distance)
          ? s
          : best,
      null,
    );
  }

  function driveFerrari(
    x: number,
    y: number,
    onArrival: ((() => boolean) | undefined) | null = null,
  ): boolean {
    if (!context.ferrari?.state.riding) return false;
    if (context.ferrari.state.fuel <= 0) {
      const s = nearestFuel();
      if (s && Math.abs(s.distance - context.ferrari.state.distance) <= 6)
        return useFuel(sightById(s.id));
      announce(
        contentText(
          'world-message.src.world.interactions.out-of-gas-park-with-r-walk-to-a-gas-station-for-a-fuel-can-th',
        ),
        'Ferrari',
      );
      return false;
    }
    context.carArrival = onArrival;
    setDancing(false);
    closeMenu();
    closeReader();
    const point = context.ferrari.destinationFor(x + 0.5, y + 0.5);
    if (!point) return false;
    const accepted = context.ferrari.driveTo(point.x, point.z);
    if (accepted) context.destination = { x: point.x - 0.5, y: point.z - 0.5 };
    return accepted;
  }

  function parkFerrari() {
    if (!context.ferrari?.state.riding) return false;
    const p = context.ferrari.position;
    context.ferrari.park();
    context.carArrival = null;
    Object.assign(context.player, {
      x: p.x - 0.5,
      y: p.z - 0.5,
      path: [],
      speed: 0,
      moving: false,
      motion: 0,
    });
    context.destination = null;
    context.updateAdventureUI();
    return true;
  }

  function useFerrari() {
    if (
      !context.ferrari ||
      context.capture.state.active ||
      context.rocket.state.active ||
      context.chase?.state.jailed ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground' ||
      context.surf.state.riding
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    if (context.training) stopTraining();
    if (context.ferrari.state.riding) {
      parkFerrari();
      announce(
        contentText(
          'world-message.src.world.interactions.you-park-the-ferrari-it-will-be-waiting-here',
        ),
        'Ferrari',
      );
      return true;
    }
    const p = context.ferrari.position,
      mount = () => {
        parkMotorcycle(false);
        if (context.bike.riding) parkBike();
        setDancing(false);
        context.player.path = [];
        context.player.speed = 0;
        context.player.motion = 0;
        context.player.gesture = null;
        context.currentInterior = null;
        context.action = null;
        context.destination = null;
        context.ferrari.mount();
        context.player.x = p.x - 0.5;
        context.player.y = p.z - 0.5;
        context.player.angle = p.angle;
        context.updateAdventureUI();
        closeMenu();
        closeReader();
        announce(
          contentText(
            'world-message.src.world.interactions.the-ferrari-does-twenty-times-walking-speed-click-the-road-or',
          ),
          'Ferrari',
        );
        context.canvas.focus({ preventScroll: true });
      };
    if (Math.hypot(context.player.x + 0.5 - p.x, context.player.y + 0.5 - p.z) < 1.8) {
      mount();
      return true;
    }
    const point = actorWalkPoint(p);
    return point ? walkTo(point.x, point.y, mount) : false;
  }

  function useFuelCan() {
    if (
      !context.ferrari ||
      context.capture.state.active ||
      context.rocket.state.active ||
      context.chase?.state.jailed ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground' ||
      context.surf.state.riding
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    if (!context.economy.state.fuelCans) {
      announce(contentText('world-message.src.world.interactions.you-have-no-fuel-can'), 'Fuel');
      return false;
    }
    closeMenu();
    closeReader();
    const pour = () => {
      const result = refuelFerrariFromCan(context.ferrari, context.economy),
        finish = (receipt: import('../types/world.ts').ActionReceipt) => {
          if (receipt.message) announce(receipt.message, 'Fuel');
          context.updateAdventureUI();
        };
      if (result.promise) result.promise.then(finish);
      else finish(result);
      return result.ok;
    };
    const p = context.ferrari.position;
    if (
      context.ferrari.state.riding ||
      Math.hypot(context.player.x + 0.5 - p.x, context.player.y + 0.5 - p.z) < 1.8
    )
      return pour();
    return walkTo(p.x - 0.5, p.z - 0.5, pour);
  }

  function useFuel(site: Site | undefined, npcInput: Actor | null = null): boolean {
    if (!site || !context.ferrari) return false;
    const npc =
      npcInput ||
      context.merchants.find((n) => n.kind === 'fuel-attendant' && n.siteId === site.id);
    if (!npc) return false;
    if (
      context.capture.state.active ||
      context.rocket.state.active ||
      context.chase?.state.jailed ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.flying()) return airshipUnavailable();
    const go = () => {
      closeReader();
      closeMenu();
      context.player.path = [];
      context.player.speed = 0;
      context.keys.clear();
      npc.hold = 3;
      openNPCDialogue({
        ...npc,
        ...createFuelDialogue(site, context.ferrari, context.economy, context.updateAdventureUI, {
          npc,
          refuel: () => serverCommand(context.multiplayer, 'playerAction', { verb: 'refuel' }),
        }),
        name: npc.name,
      });
      return true;
    };
    if (context.ferrari.state.riding) {
      if (Math.hypot(context.player.x + 0.5 - npc.x, context.player.y + 0.5 - npc.z) <= 1.8)
        return go();
      if (context.ferrari.state.fuel > 0) return driveFerrari(npc.x - 0.5, npc.z - 0.5, go);
      parkFerrari();
    }
    return approachNPC(npc, go);
  }

  function stopTraining() {
    context.multiplayerWorld.actions.request('stopTraining');
    if (!context.training) return;
    context.training = false;
    Object.assign(context.player, {
      x: SF_FITNESS.entry.x,
      y: SF_FITNESS.entry.y,
      path: [],
      speed: 0,
      moving: false,
      motion: 0,
    });
    context.updateAdventureUI();
  }

  function setGymExercise(id: string) {
    context.gymSelection = gymExercise(id).id;
    if (!context.headless)
      try {
        localStorage.setItem('sf-gym-exercise-v1', context.gymSelection);
      } catch {}
    if (context.training) {
      context.multiplayerWorld.actions.request('train', { exercise: context.gymSelection });
      const p = gymExercisePosition(context.gymSelection);
      context.player.x = p.x - 0.5;
      context.player.y = p.z - 0.5;
      announce(
        contentText('world-message.src.world.interactions.you-switch-to', {
          value1: String(gymExercise(context.gymSelection).label.toLowerCase()),
        }),
        'Gym',
      );
    }
    context.updateAdventureUI();
  }

  function useGym(exercise?: string) {
    const chosen = typeof exercise === 'string' && GYM_EXERCISES.some((e) => e.id === exercise);
    if (chosen) setGymExercise(exercise);
    if (context.training) {
      if (chosen) return true;
      stopTraining();
      return true;
    }
    if (context.ferrari?.state.riding) return parkCarFirst();
    if (
      context.capture.state.active ||
      context.rocket.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.bike.riding ||
      context.surf.state.riding ||
      context.rope.climbing ||
      context.sutroClimb.state.active ||
      context.tahoe.state.mode !== 'ground'
    )
      return false;
    if (context.strength.status.level === 50) {
      announce(
        contentText(
          'world-message.src.world.interactions.you-have-reached-the-maximum-strength-level-50',
        ),
        'Gym',
      );
      return true;
    }
    const begin = async () => {
      parkMotorcycle(false);
      closeReader();
      closeMenu();
      setDancing(false);
      const result = await serverCommand(context.multiplayer, 'playerAction', {
        verb: 'train',
        exercise: context.gymSelection,
      });
      if (!result.ok) {
        announce(result.message, 'Gym');
        return false;
      }
      const spot = gymExercisePosition(context.gymSelection);
      context.training = true;
      context.trainingLast = performance.now();
      Object.assign(context.player, {
        x: spot.x - 0.5,
        y: spot.z - 0.5,
        path: [],
        speed: 0,
        moving: false,
        motion: 0,
      });
      context.action = null;
      context.destination = null;
      context.updateAdventureUI();
      announce(
        contentText(
          'world-message.src.world.interactions.you-begin-every-exercise-earns-the-same-strength-xp-choose-ano',
          { value1: String(gymExercise(context.gymSelection).label.toLowerCase()) },
        ),
        'Gym',
      );
      return true;
    };
    if (
      Math.hypot(context.player.x - SF_FITNESS.entry.x, context.player.y - SF_FITNESS.entry.y) < 2
    ) {
      begin();
      return true;
    }
    return walkTo(SF_FITNESS.entry.x, SF_FITNESS.entry.y, begin);
  }

  function talkCapital() {
    if (context.ferrari?.state.riding) return parkCarFirst();
    const begin = () => {
      const npc = context.merchants.find((n) => n.kind === 'capital');
      openNPCDialogue(
        growthDialogue(npc, context.growthService, {
          capital: true,
          claimFunding: () => context.strength.claim(context.economy),
          funded: context.strength.state.funded,
        }),
      );
    };
    return approachNPC(
      context.merchants.find((n) => n.kind === 'capital'),
      begin,
    );
  }

  function sitOnBench(site: InteractionSight | undefined) {
    if (
      !site ||
      !hasSiteEntry(site) ||
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.flying() ||
      context.rocket.state.active ||
      context.surf.state.riding ||
      context.training
    )
      return false;
    closeMenu();
    return walkTo(site.entry.x, site.entry.y, async () => {
      const r = await context.multiplayerWorld.command('activity', { mode: 'sit', seat: site.id });
      if (r.ok) {
        context.action = null;
        context.destination = null;
        context.player.path = [];
        setSitting(true, true);
      }
    });
  }

  function setSitting(value: boolean, remote = false, chair?: string) {
    if (context.player.sitting === value) return;
    context.player.sitting = value;
    if (!remote && context.multiplayerWorld)
      context.multiplayerWorld
        .command('activity', value ? { mode: 'sit', chair } : { mode: 'walk' })
        .then((r) => {
          if (!r.ok) {
            setSitting(false, true);
            if (r.message) announce(r.message, 'You');
          }
        });
    if (!context.headless) {
      const button = context.$('sf-sit-button');
      button.toggleAttribute('data-sitting', value);
      button.textContent = value ? 'Stand up' : 'Sit';
      button.title = value ? 'Stand up (Esc, then X)' : 'Choose how to sit (Esc, then X)';
    }
  }

  function updateSitting(dt: number) {
    const danceTarget = context.player.dancing ? 1 : 0;
    context.player.danceBlend =
      (context.player.danceBlend || 0) +
      Math.max(-dt / 0.25, Math.min(dt / 0.25, danceTarget - (context.player.danceBlend || 0)));
    if (
      context.player.sitting &&
      (context.player.moving ||
        context.player.path.length ||
        context.training ||
        context.capture.state.active ||
        context.rehabilitation.state.active ||
        context.tabletService?.state.active ||
        context.rocket.state.active ||
        context.flying() ||
        context.surf.state.riding ||
        context.bike.riding ||
        context.motorcycle?.state.riding ||
        context.ferrari?.state.riding ||
        context.skateboard.riding ||
        context.sutroClimb.state.active ||
        context.rope.climbing ||
        context.tahoe.state.mode !== 'ground' ||
        context.forwardRoll.state.active ||
        context.alienCombat ||
        context.wildTarget ||
        context.health.state.hp <= 0)
    )
      setSitting(false, true);
    const target = context.player.sitting ? 1 : 0,
      step = Math.max(0, dt) / 0.45;
    context.player.sitBlend += Math.max(-step, Math.min(step, target - context.player.sitBlend));
  }

  function sit(chair?: string) {
    if (context.player.sitting) {
      setSitting(false);
      context.canvas.focus({ preventScroll: true });
      return true;
    }
    if (
      !context.active ||
      context.health.state.hp <= 0 ||
      context.training ||
      context.capture.state.active ||
      context.rehabilitation.state.active ||
      context.tabletService?.state.active ||
      context.rocket.state.active ||
      context.flying() ||
      context.surf.state.riding ||
      context.bike.riding ||
      context.motorcycle?.state.riding ||
      context.ferrari?.state.riding ||
      context.skateboard.riding ||
      context.sutroClimb.state.active ||
      context.rope.climbing ||
      context.tahoe.state.mode !== 'ground' ||
      context.secretWorld?.bomber.state.active ||
      context.expeditions.ship.aboard
    ) {
      announce(
        contentText(
          'world-message.src.world.interactions.find-a-place-on-foot-before-sitting-down',
        ),
        'You',
      );
      return false;
    }
    context.multiplayerWorld?.stopFollowing(true);
    context.forwardRoll.cancel();
    context.fishing.cancel();
    context.expeditions.stop();
    context.alienCombat = null;
    context.wildTarget = null;
    setDancing(false);
    context.player.path = [];
    context.player.speed = 0;
    context.player.motion = 0;
    context.player.moving = false;
    context.player.gesture = null;
    context.action = null;
    context.destination = null;
    closeMenu();
    setSitting(true, false, chair);
    context.canvas.focus({ preventScroll: true });
    return true;
  }

  function setDancing(value: boolean) {
    if (value) setSitting(false);
    if (context.multiplayerWorld && value !== context.player.dancing)
      context.multiplayerWorld.command('activity', { mode: value ? 'dance' : 'walk' });
    context.player.dancing = value;
    if (!context.headless) {
      context.$('sf-dance-button').setAttribute('aria-pressed', String(value));
      context.$('sf-dance-button').title = value ? 'Stop dancing (D)' : 'Dance (D)';
    }
  }

  function dance() {
    context.forwardRoll.cancel();
    if (
      context.secretWorld?.bomber.state.active ||
      context.ferrari?.state.riding ||
      context.training ||
      context.capture.state.active ||
      context.rocket.state.active ||
      (context.sutroClimb.state.active && context.sutroClimb.state.phase !== 'top') ||
      context.rope.climbing ||
      context.bike.riding ||
      context.motorcycle?.state.riding ||
      context.surf.state.riding ||
      context.tahoe.state.mode !== 'ground'
    ) {
      announce(
        contentText('world-message.src.world.interactions.find-your-feet-before-dancing'),
        'You',
      );
      return false;
    }
    context.fishing.cancel();
    context.skateboard.riding = false;
    context.alienCombat = null;
    closeMenu();
    context.basket.state.target = null;
    context.basketArrival = null;
    context.player.path = [];
    context.player.speed = 0;
    context.player.motion = 0;
    context.player.gesture = null;
    context.action = null;
    context.destination = null;
    setDancing(!context.player.dancing);
    if (context.player.dancing)
      complimentNightlifeDance(
        context.restaurantDiners,
        context.player.x + 0.5,
        context.player.y + 0.5,
        performance.now(),
      );
    context.canvas.focus({ preventScroll: true });
    return true;
  }

  function canForwardRoll() {
    return (
      context.active &&
      !context.secretWorld?.bomber.state.active &&
      !context.capture.state.active &&
      !context.rehabilitation.state.active &&
      !context.training &&
      !context.rocket.state.active &&
      !context.sutroClimb.state.active &&
      !context.rope.climbing &&
      !context.flying() &&
      !context.ferrari?.state.riding &&
      !context.bike.riding &&
      !context.motorcycle?.state.riding &&
      !context.skateboard.riding &&
      !context.surf.state.riding &&
      context.tahoe.state.mode === 'ground' &&
      !context.dialogue.active &&
      !context.aiInterview.visible &&
      !context.questMenu?.active &&
      context.$('sf-help').hidden &&
      context.$('sf-character').hidden
    );
  }

  function rollForward() {
    if (context.player.rollPending || context.forwardRoll.state.active || !canForwardRoll())
      return false;
    if (!context.player.path.length) {
      const target = forwardRollTarget(
        context.player,
        context.player.angle,
        context.WALK_SPEED * FORWARD_ROLL_SPEED * FORWARD_ROLL_DURATION,
        (from, to) =>
          context.chase?.state.jailed
            ? context.detention.path(from, to)?.length === 1
            : context.canTravel(from.x, from.y, to.x, to.y),
      );
      if (!target || Math.hypot(target.x - context.player.x, target.y - context.player.y) < 0.4) {
        announce(
          contentText(
            'world-message.src.world.interactions.there-is-no-room-to-roll-forward-face-some-open-ground',
          ),
          'You',
        );
        return false;
      }
      context.player.path = [target];
      context.destination = { ...target };
      context.action = null;
    }
    setSitting(false);
    context.fishing.cancel();
    context.alienCombat = null;
    setDancing(false);
    context.player.gesture = null;
    closeMenu();
    closeReader();
    {
      context.player.rollPending = true;
      context.multiplayerWorld.command('activity', { mode: 'roll' }).then((r) => {
        context.player.rollPending = false;
        if (!r.ok) context.forwardRoll.cancel();
      });
      if (context.destination)
        context.multiplayerWorld.moveTo(context.destination.x + 0.5, context.destination.y + 0.5);
    }
    context.player.speed = context.WALK_SPEED * FORWARD_ROLL_SPEED;
    context.canvas.focus({ preventScroll: true });
    return true;
  }
  return {
    guildStatus,
    sightById,
    playerWeapon,
    expeditionEvent,
    nearestExpeditionPoint,
    collectExpeditionLoot,
    beginCapture,
    respawnAtHospital,
    airshipUnavailable,
    walkInBasket,
    useAirship,
    useTahoeActivity,
    cancelMovingInteraction,
    updateMovingInteraction,
    releaseNPC,
    parkMotorcycle,
    useMotorcycle,
    canUseTablet,
    useTeleportTablet,
    drinkBankCoffee,
    changeMapInstance,
    secretAction,
    updateAlienCombat,
    showRopeMenu,
    climbUnavailable,
    descendSutro,
    climbSutro,
    worldTarget,
    primaryWorldAction,
    streetcarExit,
    waymoExit,
    showExitMenu,
    goToSight,
    walkAtSight,
    orderDoorDash,
    eatSandwich,
    parkBike,
    useBike,
    useSkateboard,
    performSkateTrick,
    usePacificaSurf,
    catchPacificaWave,
    performSurfTrick,
    useSurf,
    talkRehabilitation,
    arrestPlayer,
    interactCitizen,
    debugTeleport,
    walkTo,
    goToPlace,
    announce,
    enter,
    closeReader,
    closeMenu,
    clicked,
    walkToActor,
    examine,
    showMenu,
    nearestFuel,
    driveFerrari,
    parkFerrari,
    useFerrari,
    useFuelCan,
    useFuel,
    stopTraining,
    useGym,
    setSitting,
    updateSitting,
    sit,
    setDancing,
    dance,
    canForwardRoll,
    rollForward,
  };
}
