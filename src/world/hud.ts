import { WAYMO_RENTAL } from '../waymo-rental.ts';
import { ATV_RENTAL, hasATVRental } from '../atv.ts';
import { MOTORCYCLE_TRICKS } from '../motorcycle.ts';
import type { GameElements } from '../types/ui.ts';
import type { EconomyState } from '../types/content.ts';
import type { InventorySnapshot } from '../types/network.ts';
import type { CharacterSettings } from '../character-config.ts';
import { CHARACTER_DEFAULTS, normalizeCharacter } from '../character-config.ts';
import { requiredValue } from '../types/assert.ts';
function characterField(key: string | undefined): key is keyof CharacterSettings {
  return key !== undefined && key in CHARACTER_DEFAULTS;
}
import type { WorldContext } from './scene.ts';
import { createUIJob, createDOMView } from '../ui/scheduler.ts';
import { sampleRocketHop } from '../rocket-hop.ts';
import { TABLET_PLACES } from '../teleport-tablets.ts';
import { weaponDamageRange } from '../combat.ts';
import {
  ITEM_STATS,
  normalizeBoots,
  equipmentOwned,
  equipmentDefense,
  weaponAttackInterval,
} from '../item-stats.ts';
import { ownedHat } from '../hat-catalog.ts';
import { KRAKEN_CAPE_TEXT } from '../jurassic-layout.ts';
import { equipmentOptions, fillEquipmentSelect } from '../equipment-options.ts';
import { PROOF_ITEM } from '../stochastic-parrot.ts';
import { skillStatus } from '../progression.ts';
import { TAHOE, nearTahoe } from '../tahoe.ts';
import { HAIRSTYLES } from '../config/hairstyles.ts';
import { TAHOE_PELTS } from '../config/tahoe-pelts.ts';

import { SURF_TRICKS } from '../surfing.ts';

/** Hud services for the browser scene.
 * Dependencies are explicit live scene bindings, preserving initialization
 * order without globals. This module only reads bindings when a method runs. */
function skillProgressText(skill: ReturnType<typeof skillStatus>) {
  const xp = Math.floor(skill.xp).toLocaleString('en-US');
  return (
    'Level ' +
    skill.level +
    ' · ' +
    (skill.nextXP === null
      ? xp + ' XP'
      : xp + ' / ' + skill.nextXP.toLocaleString('en-US') + ' XP for level ' + skill.next)
  );
}

export function createHud(context: WorldContext) {
  const lookup = context.headless ? null : createDOMView(document);
  function $<K extends keyof GameElements>(id: K): GameElements[K];
  function $(id: string): HTMLElement;
  function $(id: string): HTMLElement {
    return requiredValue(lookup?.(id), 'Missing game interface element: ' + id);
  }
  const updateAdventureUI = createUIJob(renderAdventureUI);

  function updatePurse(state: EconomyState) {
    if (context.headless) return;
    if (context.built) {
      context.questMenu?.render();
      updatePhoneControl();
    }
    $('sf-coins').textContent = String(state.coins);
    $('sf-fuel-can-button').hidden = !state.fuelCans;
    $('sf-fuel-can-button').textContent = 'Use fuel can · ' + state.fuelCans;
    try {
      localStorage.setItem('sf-purse-v1', JSON.stringify(state));
    } catch {}
  }

  function updateAirshipButton() {
    const flying = context.airship.state.active,
      climbing = context.sutroClimb.state.active;
    document.querySelector<HTMLElementTagNameMap['div']>('.sf-actions')!.dataset.mode = climbing
      ? 'climbing'
      : flying
        ? 'flying'
        : 'ground';
    $('sf-bike-button').hidden = flying || climbing;
    $('sf-rope-button').hidden = !context.airship.state.active && !context.rope.onGround;
    $('sf-rope-button').disabled =
      !!context.chase?.state.jailed ||
      context.rope.climbing ||
      (!context.rope.state.deployed && context.airship.state.phase !== 'flying');
    $('sf-rope-button').textContent = context.rope.climbing
      ? 'Climbing…'
      : context.rope.onGround
        ? 'Climb rope'
        : context.rope.state.deployed
          ? 'Rope options'
          : 'Drop rope';
  }

  function updateRocketControls() {
    for (const id of ['sf-bike-button', 'sf-rope-button', 'sf-climb-button'] as const)
      $(id).disabled = context.rocket.state.active;
  }

  function updateTahoeButton() {
    const button = $('sf-ski-button'),
      near = nearTahoe(context.player.x + 0.5, context.player.y + 0.5),
      mode = context.tahoe.state.mode;
    button.hidden = !near;
    button.disabled =
      context.rocket.state.active ||
      mode === 'gondola' ||
      (mode === 'ski' && context.tahoe.state.airTime <= 0);
    button.textContent =
      mode === 'gondola'
        ? 'Riding gondola…'
        : mode === 'ski'
          ? context.tahoe.state.airTime > 0
            ? 'Flip · Space'
            : 'Skiing…'
          : Math.hypot(
                context.player.x + 0.5 - TAHOE.peak.x,
                context.player.y + 0.5 - TAHOE.peak.z,
              ) < 10
            ? context.tahoe.state.rented
              ? 'Ski down'
              : 'Rent skis · 1 coin'
            : 'Ride gondola';
    if (near) {
      $('sf-bike-button').hidden = true;
      $('sf-rope-button').hidden = !context.airship.state.active || mode !== 'ground';
    }
  }

  function updateClimbButton() {
    const active = context.sutroClimb.state.active,
      button = $('sf-climb-button'),
      descending = context.sutroClimb.state.phase === 'descending';
    button.hidden = !active;
    updateAirshipButton();
    button.disabled = !!context.chase?.state.jailed || descending || context.sutroTravelPending;
    button.replaceChildren(document.createTextNode(descending ? 'Climbing down…' : 'Climb down'));
    if (!descending) {
      const key = document.createElement('span');
      key.className = 'sf-key';
      key.textContent = 'E';
      button.append(key);
    }
  }

  function updateBikeButton() {
    const near =
      !context.currentInterior &&
      Math.hypot(context.player.x - context.bike.x, context.player.y - context.bike.y) < 2.5;
    const button = $('sf-bike-button'),
      mode = context.bike.riding ? 'riding' : near ? 'near' : 'far';
    if (button.dataset.mode === mode) return;
    button.dataset.mode = mode;
    button.replaceChildren(
      document.createTextNode(
        context.bike.riding ? 'Park bike ' : near ? 'Ride bike ' : 'Find bike ',
      ),
    );
    const key = document.createElement('span');
    key.className = 'sf-key';
    key.textContent = 'B';
    button.append(key);
    button.setAttribute('aria-pressed', String(context.bike.riding));
  }

  function updateSurfButton() {
    const wave = context.surf.state.riding && context.surf.state.mode === 'surf';
    $('sf-wave-controls').hidden = !wave;
    if (wave) {
      const r = context.waveSurf.state.ride,
        riding = !!r,
        status = riding ? 'Riding wave' : 'Paddling';
      if ($('sf-wave-status').textContent !== status) $('sf-wave-status').textContent = status;
      $('sf-wave-catch').hidden = riding;
      for (const b of context.world.querySelectorAll<HTMLButtonElement>('[data-surf-trick]')) {
        const t = SURF_TRICKS.find((t) => t.id === b.dataset.surfTrick);
        b.disabled =
          !riding ||
          !!context.waveSurf.state.trick ||
          (r?.elapsed || 0) < 0.4 ||
          r!.duration - r!.elapsed < requiredValue(t, 'Unknown surf trick.').duration + 0.1;
      }
    }
  }

  function updateATVControls() {
    const riding = context.multiplayerWorld?.selfMode === 'atv';
    const rent = $('sf-atv-rent');
    const controls = $('sf-atv-controls');
    rent.hidden =
      riding ||
      hasATVRental(context.multiplayer.state.personal?.travel?.atvRentalUntil) ||
      context.secretWorld?.kind !== 'world' ||
      Math.hypot(
        context.player.x + 0.5 - ATV_RENTAL.npc.x,
        context.player.y + 0.5 - ATV_RENTAL.npc.z,
      ) >= 6;
    controls.hidden = !riding;
    if (!riding) return;
    const gesture = context.multiplayerWorld?.selfGesture;
    const air = gesture === 'atv-air' || gesture === 'atv-trick';
    const donut = gesture === 'atv-donut';
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-atv-action]'))
      button.disabled = button.dataset.atvTrick
        ? gesture !== 'atv-air'
        : air || (donut && button.dataset.atvAction !== 'atvDismount');
  }

  function renderAdventureUI() {
    if (context.headless) return;
    updateATVControls();
    const tablets = context.tabletService?.inventory() || {};
    for (const id of TABLET_PLACES) {
      const b = $('sf-tablet-' + id) as HTMLButtonElement;
      b.hidden = !tablets[id];
      b.disabled = !!context.tabletService?.state.active || !context.canUseTablet();
      b.textContent = ITEM_STATS[id + '-tablet'].name;
      b.title = (tablets[id] || 0) + ' available';
    }
    const coffee = context.bankService?.snapshot().coffee || 0;
    $('sf-drink-coffee').hidden = !coffee;
    $('sf-drink-coffee').disabled =
      context.capture.state.active ||
      !!context.secretWorld?.bomber.state.active ||
      !!context.chase?.state.jailed;
    const bankBalance = context.bankService?.snapshot().balance || 0;
    const purse = context.economy.state;
    $('sf-character-balance').textContent =
      purse.coins.toLocaleString('en-US') +
      ' coins | ' +
      bankBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      ' banked';
    const resources = [
      [purse.grain, 'grain'],
      [purse.fish, 'live fish'],
      [purse.mud, 'mud'],
      [context.multiplayer?.state.inventory?.peptides, 'peptides'],
      [purse.equity, 'startup equity'],
      [context.multiplayer?.state.finance?.cost, 'growth equity principal'],
    ] as const;
    const characterResources = $('sf-character-resources');
    characterResources.textContent = resources
      .flatMap(([value, name]) => (value ? [value.toLocaleString('en-US') + ' ' + name] : []))
      .join(' · ');
    characterResources.hidden = !characterResources.textContent;
    const aircraft = !!context.secretWorld?.bomber.state.active,
      parachuting = context.secretWorld?.bomber.state.phase === 'parachuting',
      bombSeconds = context.secretWorld?.bomber.bombSeconds || 0;
    $('sf-bomber-controls').hidden = !aircraft;
    $('sf-bomber-bomb').disabled =
      !aircraft ||
      parachuting ||
      bombSeconds > 0 ||
      (!context.multiplayer?.state.connected && !!context.multiplayer);
    $('sf-bomber-bomb').textContent = bombSeconds
      ? 'Reloading · ' + bombSeconds + 's'
      : 'Drop bomb · Space';
    $('sf-bomber-land').disabled = parachuting;
    $('sf-bomber-roll').disabled =
      parachuting || context.secretWorld?.bomber.state.rollElapsed !== null;
    $('sf-bomber-flight').textContent = parachuting
      ? 'Parachuting to safety'
      : context.secretWorld?.bomber.state.boost
        ? 'B-2 · Rocket-speed boost'
        : 'Personal B-2 · Hold Shift to boost';
    const layer = $('sf-instance-level'),
      kind = context.secretWorld?.kind || 'world';
    layer.hidden = kind === 'world';
    layer.textContent =
      kind === 'illuminati'
        ? 'Underground · Illuminati hangar'
        : kind === 'berkeley-lab'
          ? 'Underground · Berkeley laboratory'
          : 'Private kraken waters';
    updatePhoneControl();
    const hopButton = $('sf-rocket-hop');
    hopButton.hidden =
      context.playerLook.back !== 'new-year-rocket' ||
      !(
        (context.multiplayer?.state.inventory?.decorativeRocket?.burningUntil || 0) >
        Date.now() + (context.multiplayer?.state.serverOffset || 0)
      );
    hopButton.disabled = !canRocketHop() || playerRocketHop().active || context.hoppingRocket;
    const pitch = context.social.state.pitch,
      sales = $('sf-sales-status');
    sales.hidden = !pitch;
    if (pitch) {
      const text = 'Sales pitch · considering';
      if (sales.textContent !== text) sales.textContent = text;
    }
    const phone = $('sf-phone-status'),
      cab = $('sf-robotaxi-status');
    phone.hidden = !context.economy.state.iphoneOwned;
    cab.hidden = !context.economy.state.robotaxiOwned;
    const phoneText = context.economy.state.iphoneEquipped
      ? 'iPhone · equipped'
      : 'iPhone · put away';
    if (phone.textContent !== phoneText) phone.textContent = phoneText;
    const cabText = 'Robotaxi · dispatched';
    if (cab.textContent !== cabText) cab.textContent = cabText;
    $('sf-roll-button').disabled = context.forwardRoll.state.active || !context.canForwardRoll();
    if (
      context.fishing.state.active &&
      (context.player.path.length ||
        context.bike.riding ||
        context.motorcycle?.state.riding ||
        context.skateboard.riding ||
        context.surf.state.riding ||
        context.ferrari?.state.riding ||
        context.rocket.state.active ||
        context.flying() ||
        context.rope.climbing ||
        context.sutroClimb.state.active ||
        context.training ||
        context.capture.state.active ||
        context.chase?.state.jailed ||
        context.currentInterior)
    )
      context.fishing.cancel();
    if (
      context.motorcycle?.state.riding &&
      (context.bike.riding ||
        context.surf.state.riding ||
        context.ferrari?.state.riding ||
        context.rocket.state.active ||
        context.flying() ||
        context.rope.climbing ||
        context.sutroClimb.state.active ||
        context.tahoe.state.mode !== 'ground' ||
        context.chase?.state.jailed ||
        context.training ||
        context.currentInterior)
    )
      context.motorcycle.park(context.player.x, context.player.y, context.player.angle);
    const motor = $('sf-motorcycle-button');
    motor.hidden = !context.motorcycle?.state.rented;
    motor.disabled = !!(
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.rocket.state.active
    );
    motor.setAttribute('aria-pressed', String(!!context.motorcycle?.state.riding));
    const motorText = context.motorcycle?.state.riding ? 'Park motorcycle · M' : 'Motorcycle · M';
    if (motor.textContent !== motorText) motor.textContent = motorText;
    const motorcycleTricks = $('sf-motorcycle-tricks');
    motorcycleTricks.hidden =
      !context.motorcycle?.state.riding || context.multiplayerWorld?.selfMode !== 'motorcycle';
    if (!motorcycleTricks.hidden) {
      const busy = MOTORCYCLE_TRICKS.some(({ id }) => id === context.multiplayerWorld?.selfGesture);
      for (const button of motorcycleTricks.querySelectorAll('button'))
        button.disabled = motor.disabled || busy;
    }
    if (
      context.skateboard.riding &&
      (context.bike.riding ||
        context.motorcycle?.state.riding ||
        context.surf.state.riding ||
        context.ferrari?.state.riding ||
        context.rocket.state.active ||
        context.flying() ||
        context.rope.climbing ||
        context.sutroClimb.state.active ||
        context.tahoe.state.mode !== 'ground' ||
        context.chase?.state.jailed ||
        context.training ||
        context.currentInterior)
    )
      context.skateboard.riding = false;
    const { pelts, uni } = context.multiplayer?.state.inventory || {};
    const q = context.quests.theyLive.state,
      items = [
        q.evidence && !q.permit ? 'Alien Evidence Certificate' : null,
        q.permit ? 'Alien-removal permit' : null,
        q.bayonet ? 'Bayonet' : null,
        equipmentOwned(context.economy.state, 'goblin-phone') ? 'Goblin Phone' : null,
        q.skateboard ? 'Skateboard' : null,
        uni ? ITEM_STATS.uni.name + ' ×' + uni : null,
        ...TAHOE_PELTS.map((id) => (pelts?.[id] ? ITEM_STATS[id].name + ' ×' + pelts[id] : null)),
        context.quests.state.stochasticParrot === 'carrying' ? 'Stochastic parrot' : null,
        context.quests.state.stochasticParrot === 'proof' ? PROOF_ITEM : null,
        context.multiplayer?.state.playerState?.quests.burningMan?.stage === 'has-water'
          ? 'Cup of water'
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
    const inventory = $('sf-quest-inventory');
    inventory.hidden = !items;
    if (inventory.textContent !== items) inventory.textContent = items;
    const skate = $('sf-skateboard-button');
    skate.hidden = !q.skateboard;
    skate.disabled = !!(
      context.capture.state.active ||
      context.chase?.state.jailed ||
      context.rocket.state.active
    );
    skate.setAttribute('aria-pressed', String(context.skateboard.riding));
    const skateText = context.skateboard.riding ? 'Put away board · K' : 'Skateboard · K';
    if (skate.textContent !== skateText) skate.textContent = skateText;
    $('sf-skate-tricks').hidden = !context.skateboard.riding;
    for (const button of context.world.querySelectorAll<HTMLButtonElement>('[data-skate-trick]'))
      button.disabled =
        context.skateTricks.state.active ||
        context.capture.state.active ||
        context.chase?.state.jailed;
    const supplies: Partial<InventorySnapshot> = context.multiplayer?.state.inventory || {};
    for (const button of context.world.querySelectorAll<HTMLButtonElement>(
      '[data-inventory-action]',
    )) {
      const trim = button.dataset.inventoryAction === 'trimArmor';
      const count = (trim ? supplies.armorTrimmingKits : supplies.bindTablets) || 0;
      button.hidden = !count;
      button.disabled = trim && !equipmentOwned(context.economy.state, 'iron-armor');
      button.textContent = (trim ? 'Trim iron armor' : 'Break Bind Tablet') + ' · ' + count;
    }
    const supplyStatus = $('sf-combat-supplies');
    const launcher =
      equipmentOwned(context.economy.state, 'missile-launcher') || !!supplies.missiles;
    supplyStatus.hidden = !(
      launcher ||
      supplies.akimboAmmo ||
      supplies.railgunBatteries ||
      equipmentOwned(context.economy.state, 'akibo') ||
      equipmentOwned(context.economy.state, 'railgun')
    );
    supplyStatus.textContent =
      'Ammo: ' +
      (supplies.akimboAmmo || 0) +
      ' · Railgun charge: ' +
      (supplies.railgunCharge || 0) +
      '/25' +
      (launcher ? ' · Missiles: ' + (supplies.missiles || 0) : '');
    const charge = $('sf-charge-railgun');
    charge.hidden = !supplies.railgunBatteries;
    charge.disabled = (supplies.railgunCharge || 0) >= 25;
    charge.textContent = 'Fit battery · ' + (supplies.railgunBatteries || 0) + ' spare';
    updateDecorativeRocketControl();
    const hpText = 'Hitpoints ' + context.health.state.hp + '/' + context.health.state.max,
      enemy =
        context.alienCombat?.battle.state ||
        context.multiplayerWorld?.combatTarget ||
        (context.expeditions.state.target?.max ? context.expeditions.state.target : null);
    if ($('sf-hitpoints-text').textContent !== hpText) $('sf-hitpoints-text').textContent = hpText;
    const hps = skillStatus(context.health.state.xp);
    $('sf-hp-level').textContent = 'Hitpoints ' + skillProgressText(hps);
    $('sf-enemy-health').hidden = !enemy;
    if (enemy)
      $('sf-enemy-health').textContent =
        (context.alienCombat
          ? 'Alien'
          : context.npcLabel(
              context.multiplayerWorld?.combatTarget || context.expeditions.state.target || {},
            )) +
        ' · ' +
        enemy.hp +
        '/' +
        enemy.max +
        ' HP';
    const food = $('sf-eat-sandwich');
    food.hidden = !context.deli?.state.sandwiches;
    food.textContent =
      'Eat sandwich · ' +
      (context.deli?.state.sandwiches || 0) +
      '/' +
      (equipmentOwned(context.economy.state, 'backpack') ? 20 : 5);
    food.disabled =
      context.health.state.hp === context.health.state.max || context.capture.state.active;
    $('sf-stop-construction').hidden = context.multiplayerWorld?.selfMode !== 'construction';
    $('sf-exit-streetcar').hidden = context.multiplayerWorld?.selfMode !== 'streetcar';
    $('sf-exit-swing').hidden = context.multiplayerWorld?.selfMode !== 'swing';
    const order = $('sf-order-doordash');
    order.disabled =
      !!context.deli?.state.pending || context.capture.state.active || context.chase?.state.jailed;
    order.textContent = context.deli?.state.pending
      ? 'DoorDash en route…'
      : 'DoorDash · ' + ITEM_STATS.sandwich.deliveryPrice + ' coins';
    const rental = context.multiplayer?.state.personal?.travel?.waymo;
    const waymo = $('sf-call-waymo');
    const seconds = rental?.expiresAt
      ? Math.max(
          0,
          Math.ceil(
            (rental.expiresAt - Date.now() - (context.multiplayer.state.serverOffset || 0)) / 1000,
          ),
        )
      : 0;
    waymo.disabled =
      rental?.phase === 'dispatch' || context.capture.state.active || !!context.chase?.state.jailed;
    const waymoLabel =
      rental?.phase === 'riding'
        ? 'Exit Waymo · ' + seconds + 's'
        : rental?.phase === 'parked'
          ? 'Board Waymo · ' + seconds + 's'
          : rental?.phase === 'dispatch'
            ? 'Waymo en route…'
            : 'Call a Waymo · ' + WAYMO_RENTAL.price + ' coins';
    if (waymo.textContent !== waymoLabel) waymo.textContent = waymoLabel;
    const s = context.strength.status,
      text = 'Strength ' + skillProgressText(s);
    if ($('sf-strength-text').textContent !== text) $('sf-strength-text').textContent = text;
    const characterLevel = 'Level ' + s.level;
    if ($('sf-character-level').textContent !== characterLevel)
      $('sf-character-level').textContent = characterLevel;
    updateSurfButton();
    $('sf-fuel-card').hidden = !context.ferrari?.state.riding;
    if (context.ferrari) {
      $('sf-fuel-meter').value = context.ferrari.state.fuel;
      $('sf-fuel-text').textContent = Math.round(context.ferrari.state.fuel * 100) + '% gas';
    }
  }

  function updateSunglassesControl() {
    if (!$('sf-character').hidden) return;
    const input = context.world.querySelector<HTMLInputElement>('[data-character="sunglasses"]')!;
    input.disabled = !context.sunglasses.state.owned;
    input.closest('label')!.hidden = !context.sunglasses.state.owned;
    input.checked = context.playerLook.sunglasses;
    $('sf-sunglasses-hint').hidden = !context.sunglasses.state.owned;
    $('sf-sunglasses-hint').textContent = context.sunglasses.state.owned
      ? 'Change whether you are wearing your sunglasses.'
      : '';
  }

  function updatePhoneControl() {
    if (context.headless) return;
    if (!$('sf-character').hidden) return;
    const input = $('sf-iphone-equipped');
    input.disabled = !context.economy.state.iphoneOwned;
    input.closest('label')!.hidden = !context.economy.state.iphoneOwned;
    input.checked = context.economy.state.iphoneEquipped;
    $('sf-iphone-hint').hidden = !context.economy.state.iphoneOwned;
    $('sf-iphone-hint').textContent = context.economy.state.iphoneOwned
      ? 'Equip or put away your iPhone.'
      : '';
  }

  function wardrobeOptions() {
    return equipmentOptions(context.economy.state, {
      cape: context.expeditions.state.cape,
    });
  }

  function updateHatControl() {
    if (!$('sf-character').hidden) return;
    if (context.headless) return;
    fillEquipmentSelect(
      context.world.querySelector<HTMLSelectElement>('[data-character="hat"]')!,
      wardrobeOptions().hat,
      context.playerLook.hat,
    );
    $('sf-hat-hint').textContent = '';
  }

  function wearHat(id: string) {
    if (!ownedHat(context.economy.state.ownedHats, id)) return false;
    context.playerLook = normalizeCharacter({ ...context.playerLook, hat: id });
    if (!context.headless) {
      try {
        localStorage.setItem('sf-character-v1', JSON.stringify(context.playerLook));
      } catch {}
      updateHatControl();
    }
    return true;
  }

  function updateEquipmentControl() {
    if (context.headless || !$('sf-character').hidden) return;
    const options = wardrobeOptions(),
      look: Record<string, unknown> = { ...context.playerLook };
    for (const key of ['weapon', 'back', 'neck', 'torso', 'legs', 'boots'] as const) {
      const field = context.world.querySelector<HTMLSelectElement>(
        '[data-character="' + key + '"]',
      )!;
      fillEquipmentSelect(field, options[key], context.playerLook[key]);
      if (!options[key].some((o) => o.value === String(context.playerLook[key])))
        look[key] = options[key][0].value;
    }
    context.playerLook = normalizeCharacter(look);
    context.playerLook.cape = context.playerLook.back === 'cape';
    const weapon = context.playerWeapon(),
      stats = ITEM_STATS[weapon],
      range = weaponDamageRange(
        context.strength.status.level,
        weapon,
        context.inebriation.state.percent,
      ),
      armor = [
        ITEM_STATS[context.playerLook.torso]?.name,
        ITEM_STATS[context.playerLook.legs]?.name,
        context.playerLook.boots === 'party-boots'
          ? ITEM_STATS['party-boots'].name
          : context.playerLook.boots && 'Combat boots',
      ].filter(Boolean);
    $('sf-equipment-hint').textContent =
      'Armor: ' +
      (armor.join(', ') || 'Regular clothing') +
      ' · Defense: ' +
      equipmentDefense(context.playerLook) +
      '\nWeapon: ' +
      stats.name +
      ' · Max hit: ' +
      range.max +
      '\nAccuracy: ' +
      Math.round(range.accuracy * 100) +
      '% · Attack speed: ' +
      weaponAttackInterval(weapon, context.economy.state).toFixed(2) +
      's' +
      '\nMovement speed: ' +
      context.WALK_SPEED +
      ' tiles/s';
  }

  function updateCapeControl() {
    const hint = $('sf-cape-hint');
    hint.hidden = !context.expeditions.state.cape;
    hint.textContent = context.expeditions.state.cape ? KRAKEN_CAPE_TEXT : '';
  }

  function playerRocketHop() {
    const time = Date.now() + (context.multiplayer?.state.serverOffset || 0),
      onFoot =
        context.playerLook.back === 'new-year-rocket' &&
        !context.player.sitting &&
        !context.training &&
        !context.forwardRoll.state.active &&
        context.health.state.hp > 0 &&
        context.canUseTablet();
    return sampleRocketHop(
      onFoot ? context.multiplayer?.state.inventory?.decorativeRocket?.hopStartedAt : 0,
      time,
    );
  }

  function canRocketHop() {
    return (
      context.playerLook.back === 'new-year-rocket' &&
      !context.player.sitting &&
      !context.training &&
      !context.forwardRoll.state.active &&
      context.canUseTablet() &&
      context.multiplayer?.state.connected &&
      (context.multiplayer.state.inventory?.decorativeRocket?.burningUntil || 0) >
        Date.now() + (context.multiplayer.state.serverOffset || 0)
    );
  }

  async function hopRocket() {
    if (context.hoppingRocket || !canRocketHop() || playerRocketHop().active) return false;
    context.hoppingRocket = true;
    try {
      const result = await context.multiplayer.command('rocketHop');
      if (!result.ok && result.message) context.announce(result.message, 'Rocket');
      return result.ok;
    } finally {
      context.hoppingRocket = false;
      updateAdventureUI();
      context.canvas.focus({ preventScroll: true });
    }
  }

  function updateDecorativeRocketControl() {
    if (context.headless) return;
    const button = $('sf-light-decorative-rocket'),
      status: Partial<InventorySnapshot['decorativeRocket']> =
        context.multiplayer?.state.inventory?.decorativeRocket || {},
      seconds = Math.max(
        0,
        Math.ceil(
          ((status.readyAt || 0) - (Date.now() + (context.multiplayer?.state.serverOffset || 0))) /
            1000,
        ),
      );
    button.hidden =
      context.playerLook.back !== 'new-year-rocket' ||
      !equipmentOwned(context.economy.state, 'new-year-rocket');
    button.disabled =
      !context.multiplayer?.state.connected ||
      context.lightingDecorativeRocket ||
      context.capture.state.active ||
      !!context.chase?.state.jailed ||
      seconds > 0;
    button.textContent = context.lightingDecorativeRocket
      ? 'Lighting…'
      : seconds
        ? 'Rocket ready in ' + seconds + 's'
        : 'Light rocket · 10 seconds';
  }

  async function lightDecorativeRocket() {
    const button = $('sf-light-decorative-rocket');
    if (button.disabled || button.hidden || !context.multiplayer?.state.connected) return;
    context.lightingDecorativeRocket = true;
    updateDecorativeRocketControl();
    try {
      const result = await context.multiplayer.command('lightDecorativeRocket');
      if (result.ok) {
        context.playerLook.rocketBurnUntil = requiredValue(
          result.burningUntil,
          'The rocket receipt has no burn time.',
        );
      }
      if (result.message) context.announce(result.message, 'You');
    } finally {
      context.lightingDecorativeRocket = false;
      updateAdventureUI();
      context.canvas.focus({ preventScroll: true });
    }
  }

  function updateHairstyleControl(
    gender = context.playerLook.gender,
    selected = context.playerLook.hairstyle,
  ) {
    const field = context.world.querySelector<HTMLSelectElement>('[data-character="hairstyle"]')!;
    field.replaceChildren(...HAIRSTYLES[gender].map((style) => new Option(style.label, style.id)));
    field.value = HAIRSTYLES[gender].some((style) => style.id === selected)
      ? selected
      : HAIRSTYLES[gender][0].id;
  }

  function changeCharacter(field: HTMLInputElement | HTMLSelectElement) {
    if (field.dataset.character === 'gender')
      updateHairstyleControl(field.value === 'woman' ? 'woman' : 'man');
  }

  function showPasswordStatus(hasPassword: boolean) {
    $('sf-current-password-row').hidden = !hasPassword;
    $('sf-character-password-label').textContent = hasPassword
      ? 'New password (optional)'
      : 'Set a password';
  }

  async function saveCharacter() {
    const save = $('sf-character-done');
    const status = $('sf-character-save-status');
    if (save.disabled || $('sf-character').hidden) return;
    if (!context.multiplayer?.state.connected) {
      status.textContent = 'Connect to the game to save your character.';
      return;
    }
    const look = { ...context.playerLook };
    for (const field of context.world.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-character]',
    )) {
      const key = field.dataset.character;
      if (!characterField(key) || field.disabled) continue;
      const value =
        field instanceof HTMLInputElement && field.type === 'checkbox'
          ? field.checked
          : key === 'boots'
            ? normalizeBoots(field.value)
            : field.value;
      Object.assign(look, { [key]: value });
    }
    save.disabled = true;
    try {
      const result = await context.multiplayer.command('saveCharacter', {
        look,
        name: $('sf-username').value.trim(),
        phone: $('sf-iphone-equipped').checked,
        pvp: $('sf-pvp-enabled').checked,
        password: $('sf-character-password').value,
        currentPassword: $('sf-current-password').value,
      });
      status.textContent = result.message || '';
      if (result.ok && result.appearance) {
        context.playerLook = normalizeCharacter(result.appearance);
        context.signTextureControls.setRevealed?.(context.playerLook.sunglasses);
        save.disabled = false;
        closeCharacter();
        updateAdventureUI();
      }
    } finally {
      save.disabled = false;
    }
  }

  function showCharacter() {
    if (!$('sf-character').hidden) return;
    context.collectionMenu?.close();
    if (context.bankMenu?.active) context.bankMenu.close();
    context.questMenu?.close();
    context.closeMenu();
    context.closeReader();
    closeHelp();
    context.dialogue.close();
    context.keys.clear();
    context.player.path = [];
    context.player.speed = 0;
    context.setDancing(false);
    updateSunglassesControl();
    updateHatControl();
    updatePhoneControl();
    updateHairstyleControl();
    for (const field of context.world.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-character]',
    )) {
      const key = field.dataset.character;
      if (!characterField(key)) continue;
      if (field.type === 'checkbox' && 'checked' in field)
        field.checked = !!context.playerLook[key];
      else field.value = String(context.playerLook[key]);
    }
    updateCapeControl();
    updateEquipmentControl();
    $('sf-character').hidden = false;
    $('sf-reader-shade').hidden = false;
    $('sf-username').value = context.multiplayer.state.name;
    $('sf-pvp-enabled').checked = context.multiplayer.state.pvp?.enabled === true;
    $('sf-character-save-status').textContent = '';
    showPasswordStatus(context.multiplayer.state.hasCharacterPassword === true);
    $('sf-close-character').focus({ preventScroll: true });
  }

  function closeCharacter() {
    if (context.headless || $('sf-character').hidden) return;
    if ($('sf-character-done').disabled) return;
    $('sf-character-password').value = '';
    $('sf-current-password').value = '';
    $('sf-character').hidden = true;
    $('sf-reader-shade').hidden = true;
    context.canvas.focus({ preventScroll: true });
  }

  function sayPhrase(text: string) {
    if (!context.active) return false;
    context.multiplayerWorld?.say(text);
    context.playerSpeechUntil = performance.now() + 3000;
    $('sf-player-speech').textContent = text;
    context.canvas.focus({ preventScroll: true });
    return true;
  }

  function showHelp() {
    context.collectionMenu?.close();
    if (context.bankMenu?.active) context.bankMenu.close();
    context.questMenu?.close();
    closeCharacter();
    context.closeReader();
    context.closeMenu();
    context.keys.clear();
    context.player.speed = 0;
    $('sf-help').hidden = false;
    $('sf-reader-shade').hidden = false;
    $('sf-close-help').focus({ preventScroll: true });
  }

  function closeHelp() {
    $('sf-help').hidden = true;
    $('sf-reader-shade').hidden = true;
    context.canvas.focus({ preventScroll: true });
  }
  return {
    updatePurse,
    updateAirshipButton,
    updateRocketControls,
    updateTahoeButton,
    updateClimbButton,
    updateBikeButton,
    updateSurfButton,
    updateAdventureUI,
    updateSunglassesControl,
    updatePhoneControl,
    updateHatControl,
    wearHat,
    updateCapeControl,
    playerRocketHop,
    canRocketHop,
    hopRocket,
    lightDecorativeRocket,
    changeCharacter,
    saveCharacter,
    showCharacter,
    closeCharacter,
    sayPhrase,
    showHelp,
    closeHelp,
  };
}
