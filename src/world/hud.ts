import { MOTORCYCLE_TRICKS } from '../motorcycle.ts';
import { SCOOTER_BACKFLIP } from '../config/scooter.ts';
import { LIGHTSABER_HITS } from '../config/lightsaber.ts';
import { WEAPON_UPGRADE_KIT } from '../config/weapon-upgrades.ts';
import { HIKING_BACKPACK, HIKING_BACKPACK_UPGRADE_KIT } from '../config/hiking-backpack.ts';
import { nearOnodaLanding } from '../onoda-island.ts';
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
import { averageAttackDamage, weaponDamageRange } from '../combat.ts';
import {
  ITEM_STATS,
  normalizeBoots,
  equipmentOwned,
  canUpgradeWeapon,
  trimmableIronArmor,
  goblinCharmEquipped,
  ownedEquipmentDefense,
  selectedWeapon,
  sandwichCapacity,
  weaponAttackInterval,
  weaponDisplayName,
  weaponOwned,
} from '../item-stats.ts';
import { ownedHat } from '../hat-catalog.ts';
import { equipmentOptions, fillEquipmentSelect } from '../equipment-options.ts';
import { PROOF_ITEM } from '../stochastic-parrot.ts';
import { playerLevel, skillStatus } from '../progression.ts';
import { TAHOE, nearTahoe } from '../tahoe.ts';
import { HAIRSTYLES } from '../config/hairstyles.ts';
import { TAHOE_PELTS } from '../config/tahoe-pelts.ts';

import { SURF_TRICKS } from '../surfing.ts';
import { WAYMO_RENTAL } from '../waymo-rental.ts';
import { setActionText } from '../context-menu.ts';

function updateActionLabel(button: HTMLElement, text: string, label: string, kind: string) {
  if (button.textContent !== text) setActionText(button, text, [{ label, kind }]);
}

/** Hud services for the browser scene.
 * Dependencies are explicit live scene bindings, preserving initialization
 * order without globals. This module only reads bindings when a method runs. */
function updateSkillProgress(
  bar: HTMLProgressElement,
  label: HTMLElement,
  readout: HTMLElement,
  skillName: string,
  skill: ReturnType<typeof skillStatus>,
  showXPAtMax = false,
) {
  if (bar.value !== skill.percent) bar.value = skill.percent;
  const progress =
    skill.next === null
      ? showXPAtMax
        ? Math.floor(skill.xp).toLocaleString() + ' XP'
        : 'Max level'
      : skill.percent.toFixed(2) + '% to Level ' + skill.next;
  const text = skillName + ' · Level ' + skill.level;
  if (label.textContent !== text) label.textContent = text;
  if (readout.textContent !== progress) readout.textContent = progress;
  if (bar.getAttribute('aria-valuetext') !== progress) bar.setAttribute('aria-valuetext', progress);
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
    updateActionLabel(
      $('sf-fuel-can-button'),
      'Use fuel can · ' + state.fuelCans,
      'fuel can',
      'item',
    );
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
    updateBikeButton();
    $('sf-rope-button').hidden = !context.airship.state.active && !context.rope.onGround;
    $('sf-rope-button').disabled =
      !!context.chase?.state.jailed ||
      context.rope.climbing ||
      (!context.rope.state.deployed && context.airship.state.phase !== 'flying');
    const ropeLabel = context.rope.climbing
      ? 'Climbing…'
      : context.rope.onGround
        ? 'Climb up'
        : context.rope.state.deployed
          ? 'Rope options'
          : 'Drop rope';
    updateActionLabel($('sf-rope-button'), ropeLabel, 'rope', 'object');
  }

  function updateRocketControls() {
    updateBikeButton();
    for (const id of ['sf-rope-button', 'sf-climb-button'] as const)
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
      (mode === 'ski' && (context.tahoe.state.airTime <= 0 || context.tahoe.state.flipping));
    const label =
      mode === 'gondola'
        ? 'Riding gondola…'
        : mode === 'ski'
          ? context.tahoe.state.airTime > 0
            ? 'Flip'
            : 'Skiing…'
          : Math.hypot(
                context.player.x + 0.5 - TAHOE.peak.x,
                context.player.y + 0.5 - TAHOE.peak.z,
              ) < 10
            ? context.tahoe.state.rented
              ? 'Ski down'
              : 'Rent skis · 1 coin'
            : 'Ride gondola';
    updateActionLabel(button, label, 'gondola', 'object');
    updateBikeButton();
    if (near) {
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
  }

  function updateBikeButton() {
    const near =
      !context.currentInterior &&
      Math.hypot(context.player.x - context.bike.x, context.player.y - context.bike.y) < 2.5;
    const button = $('sf-bike-button'),
      mode = context.bike.riding ? 'riding' : near ? 'near' : 'far';
    const disabled =
      context.airship.state.active ||
      context.sutroClimb.state.active ||
      context.rocket.state.active ||
      nearTahoe(context.player.x + 0.5, context.player.y + 0.5);
    if (button.disabled !== disabled) button.disabled = disabled;
    if (button.dataset.mode === mode) return;
    button.dataset.mode = mode;
    setActionText(button, context.bike.riding ? 'Park bike ' : near ? 'Ride bike ' : 'Find bike ', [
      { label: 'bike', kind: 'npc' },
    ]);
    button.setAttribute('aria-pressed', String(context.bike.riding));
  }

  function updateSurfButton() {
    const surf = context.surf.state;
    const button = $('sf-surf-return');
    if (button.hidden === surf.riding) button.hidden = !surf.riding;
    if (button.disabled !== !!surf.jump) button.disabled = !!surf.jump;
    if (surf.riding) {
      const label =
        surf.mode === 'windsurf' && nearOnodaLanding(context.player)
          ? 'Land at Island'
          : 'Surf Back to Shore';
      if (button.textContent !== label) button.textContent = label;
    }
    const wave = surf.riding && surf.mode === 'surf';
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
    const controls = $('sf-atv-controls');
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
    const purse = context.economy.state;
    const secondary = context.playerLook.secondaryWeapon;
    const switchWeapon = $('sf-switch-weapon');
    switchWeapon.hidden = secondary === context.playerLook.weapon || !weaponOwned(purse, secondary);
    switchWeapon.disabled = context.health.state.hp <= 0 || context.capture.state.active;
    if (!switchWeapon.hidden) {
      const label = secondary === 'unarmed' ? 'Fist' : weaponDisplayName(secondary, purse);
      updateActionLabel(switchWeapon, 'Switch to ' + label, label, 'item');
    }
    for (const button of $('sf-chairs').querySelectorAll<HTMLButtonElement>('[data-chair]')) {
      const chair = button.dataset.chair;
      if (chair && chair !== 'normal') {
        const hidden = !equipmentOwned(purse, chair);
        if (button.hidden !== hidden) button.hidden = hidden;
      }
    }
    const tablets = context.tabletService?.inventory() || {};
    const teleportBlocked = !!context.tabletService?.state.active || !context.canUseTablet();
    let hasTablets = false;
    for (const id of TABLET_PLACES) {
      const button = $('sf-tablet-' + id) as HTMLButtonElement;
      const count = tablets[id] || 0;
      const hidden = count === 0;
      hasTablets ||= !hidden;
      if (button.hidden !== hidden) button.hidden = hidden;
      if (button.disabled !== teleportBlocked) button.disabled = teleportBlocked;
      const label = button.querySelector('span')!;
      const quantity = '· ' + count;
      if (label.textContent !== quantity) {
        label.textContent = quantity;
        button.title = ITEM_STATS[id + '-tablet'].name + ' · ' + count + ' available';
      }
    }
    const teleport = $('sf-teleport-button');
    const teleportDisabled = !hasTablets || teleportBlocked;
    if (teleport.disabled !== teleportDisabled) teleport.disabled = teleportDisabled;
    teleport.title = !hasTablets
      ? 'No teleport tablets'
      : teleportBlocked
        ? 'Teleport unavailable here'
        : 'Choose a destination (shortcut T)';
    const coffee = context.bankService?.snapshot().coffee || 0;
    $('sf-drink-coffee').hidden = !coffee;
    $('sf-drink-coffee').disabled =
      context.capture.state.active ||
      !!context.secretWorld?.bomber.state.active ||
      !!context.chase?.state.jailed;
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
      : 'Drop bomb';
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
          : kind === 'goblin-incubator-cave'
            ? 'Underground · Goblin City Hall'
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
    $('sf-robotaxi-status').hidden = !purse.robotaxiOwned;
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
    const motorcycleTricks = $('sf-motorcycle-tricks');
    motorcycleTricks.hidden =
      !context.motorcycle?.state.riding || context.multiplayerWorld?.selfMode !== 'motorcycle';
    if (!motorcycleTricks.hidden) {
      const busy = MOTORCYCLE_TRICKS.some(({ id }) => id === context.multiplayerWorld?.selfGesture);
      for (const button of motorcycleTricks.querySelectorAll('button'))
        button.disabled =
          busy ||
          context.capture.state.active ||
          !!context.chase?.state.jailed ||
          context.rocket.state.active;
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
    const { lightCrystals, pelts, uni } = context.multiplayer?.state.inventory || {};
    // Show carried quest and trade items without a Character entry or an action button.
    const q = context.quests.theyLive.state,
      items = [
        purse.sand > 0 ? 'Sand ×' + purse.sand.toLocaleString('en-US') : null,
        lightCrystals ? ITEM_STATS['light-crystal'].name + ' ×' + lightCrystals : null,
        q.evidence && !q.permit ? 'Alien Evidence Certificate' : null,
        q.started && q.permit && !q.completed ? 'Alien-removal permit' : null,
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
    const skateText = context.skateboard.riding ? 'Put away board' : 'Skateboard';
    updateActionLabel(skate, skateText, context.skateboard.riding ? 'board' : 'Skateboard', 'item');
    $('sf-skate-tricks').hidden = !context.skateboard.riding;
    const scooter = $('sf-scooter-button'),
      backflip = $('sf-scooter-backflip'),
      ridingScooter = context.multiplayerWorld?.selfMode === 'scooter';
    scooter.hidden = !equipmentOwned(purse, 'scooter');
    scooter.disabled =
      skate.disabled || context.secretWorld?.kind !== 'world' || context.health.state.hp <= 0;
    scooter.setAttribute('aria-pressed', String(ridingScooter));
    updateActionLabel(scooter, ridingScooter ? 'Put away scooter' : 'Scooter', 'scooter', 'item');
    backflip.hidden = !ridingScooter;
    backflip.disabled =
      scooter.disabled ||
      !context.player.moving ||
      context.multiplayerWorld?.selfGesture === SCOOTER_BACKFLIP.id;
    for (const button of context.world.querySelectorAll<HTMLButtonElement>('[data-skate-trick]'))
      button.disabled =
        context.skateTricks.state.active ||
        context.capture.state.active ||
        context.chase?.state.jailed;
    const supplies: Partial<InventorySnapshot> = context.multiplayer?.state.inventory || {};
    for (const button of context.world.querySelectorAll<HTMLButtonElement>(
      '[data-inventory-action]',
    )) {
      const purse = context.economy.state;
      if (button.dataset.inventoryAction === 'upgradeWeapon') {
        const weapon = button.dataset.weapon || '';
        const kits = supplies.weaponUpgradeKits ?? 0;
        button.hidden = !kits || !canUpgradeWeapon(purse, weapon);
        button.disabled = context.health.state.hp <= 0 || context.capture.state.active;
        updateActionLabel(
          button,
          (weapon === 'akibo' ? 'Upgrade Akimbo' : 'Upgrade Railgun') + ' · ' + kits,
          ITEM_STATS[WEAPON_UPGRADE_KIT].name,
          'item',
        );
        continue;
      }
      const ironArmor = trimmableIronArmor(purse);
      const actions = {
        trimArmor: {
          count: supplies.armorTrimmingKits,
          label: ironArmor === 'iron-armor-legs' ? 'Trim iron leg armor' : 'Trim iron torso armor',
          item: 'Armor Trimming Kit',
          enabled: ironArmor !== undefined,
        },
        upgradeGoblinHelmet: {
          count: supplies.goblinHelmetUpgradeKits,
          label: 'Upgrade goblin helmet',
          item: 'Goblin helmet upgrade kit',
          enabled:
            purse.ownedHats.includes('goblin-helmet') &&
            !purse.ownedHats.includes('upgraded-goblin-helmet'),
        },
        upgradeBackpack: {
          count: purse.ownedEquipment.includes(HIKING_BACKPACK)
            ? supplies.hikingBackpackUpgradeKits
            : 0,
          label: 'Upgrade Hiking Backpack',
          item: ITEM_STATS[HIKING_BACKPACK_UPGRADE_KIT].name,
          enabled: context.health.state.hp > 0 && !context.capture.state.active,
        },
        breakBind: {
          count: supplies.bindTablets,
          label: 'Break Bind Tablet',
          item: 'Bind Tablet',
          enabled: true,
        },
        detonateFireworks: {
          count: supplies.fireworks,
          label: 'Detonate fireworks',
          item: 'fireworks',
          enabled:
            context.health.state.hp > 0 && !context.capture.state.active && !context.chase?.state.jailed,
        },
      };
      const action = actions[button.dataset.inventoryAction as keyof typeof actions];
      button.hidden = !action.count;
      button.disabled = !action.enabled;
      updateActionLabel(button, action.label + ' · ' + (action.count || 0), action.item, 'item');
    }
    const supplyStatus = $('sf-combat-supplies');
    const weapon = context.playerWeapon();
    const railgun = weapon === 'railgun';
    const lightsaber = weapon === 'lightsaber';
    const railgunCharge = supplies.railgunCharge || 0;
    const saberCharge = supplies.lightsaberCharge || 0;
    const batteries = supplies.railgunBatteries || 0;
    const weaponSupplies: Record<string, string> = {
      railgun: 'Railgun charge: ' + railgunCharge + '/25 · Batteries: ' + batteries,
      lightsaber:
        'Lightsaber charge: ' + saberCharge + '/' + LIGHTSABER_HITS + ' hits · Batteries: ' + batteries,
      akibo: 'Ammo: ' + (supplies.akimboAmmo || 0),
      'missile-launcher': 'Missiles: ' + (supplies.missiles || 0),
    };
    supplyStatus.textContent = weaponSupplies[weapon] || '';
    supplyStatus.hidden = !supplyStatus.textContent;
    const charge = $('sf-charge-railgun');
    charge.hidden = (!railgun && !lightsaber) || !batteries;
    charge.disabled = lightsaber ? saberCharge >= LIGHTSABER_HITS : railgunCharge >= 25;
    updateDecorativeRocketControl();
    const hpText = 'Hitpoints ' + context.health.state.hp + '/' + context.health.state.max,
      enemy =
        context.alienCombat?.battle.state ||
        context.multiplayerWorld?.combatTarget ||
        (context.expeditions.state.target?.max ? context.expeditions.state.target : null);
    if ($('sf-hitpoints-text').textContent !== hpText) $('sf-hitpoints-text').textContent = hpText;
    const hps = skillStatus(context.health.state.xp);
    updateSkillProgress(
      $('sf-hp-level'),
      $('sf-hp-level-text'),
      $('sf-hp-progress-text'),
      'Hitpoints',
      hps,
    );
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
    const foodLabel =
      'Eat sandwich · ' +
      (context.deli?.state.sandwiches || 0) +
      '/' +
      sandwichCapacity(context.economy.state);
    updateActionLabel(food, foodLabel, 'sandwich', 'item');
    food.disabled =
      context.health.state.hp === context.health.state.max || context.capture.state.active;
    $('sf-stop-construction').hidden = context.multiplayerWorld?.selfMode !== 'construction';
    $('sf-exit-streetcar').hidden = context.multiplayerWorld?.selfMode !== 'streetcar';
    $('sf-exit-swing').hidden = context.multiplayerWorld?.selfMode !== 'swing';
    const order = $('sf-order-doordash');
    order.disabled =
      !!context.deli?.state.pending || context.capture.state.active || context.chase?.state.jailed;
    const orderLabel = context.deli?.state.pending
      ? 'DoorDash en route…'
      : 'DoorDash · ' + ITEM_STATS.sandwich.deliveryPrice + ' coins';
    updateActionLabel(order, orderLabel, 'DoorDash', 'object');
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
            : 'Waymo · ' + WAYMO_RENTAL.price + ' coins';
    updateActionLabel(waymo, waymoLabel, 'Waymo', 'object');
    const s = context.strength.status;
    updateSkillProgress(
      $('sf-strength-progress'),
      $('sf-strength-level-text'),
      $('sf-strength-progress-text'),
      'Strength',
      s,
      true,
    );
    const characterLevel = 'Level ' + playerLevel(s.level, hps.level);
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
  }

  function updatePhoneControl() {
    if (context.headless) return;
    if (!$('sf-character').hidden) return;
    const input = $('sf-iphone-equipped');
    input.disabled = !context.economy.state.iphoneOwned;
    input.closest('label')!.hidden = !context.economy.state.iphoneOwned;
    input.checked = context.economy.state.iphoneEquipped;
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
    const secondaryOptions = [
      { value: 'none', label: 'No secondary weapon' },
      ...options.weapon,
    ];
    const secondaryField = context.world.querySelector<HTMLSelectElement>(
      '[data-character="secondaryWeapon"]',
    )!;
    fillEquipmentSelect(secondaryField, secondaryOptions, context.playerLook.secondaryWeapon);
    look.secondaryWeapon = secondaryField.value;
    context.playerLook = normalizeCharacter(look);
  }

  function updateEquipmentStats() {
    const look = normalizeCharacter(readCharacterLook());
    const purse = context.economy.state;
    const weapon = selectedWeapon(look.weapon, purse);
    const level = context.strength.status.level;
    const inebriation = context.inebriation.state.percent;
    const range = ITEM_STATS[weapon].range ?? ITEM_STATS.unarmed.range;
    const interval = weaponAttackInterval(weapon, purse);
    const weaponRoll = (distance: number) => {
      const roll = weaponDamageRange(level, weapon, inebriation, distance);
      if (goblinCharmEquipped(purse, look)) roll.accuracy = 1 - (1 - roll.accuracy) ** 2;
      return roll;
    };
    const close = weaponRoll(0);
    const edge = weaponRoll(range);
    const accuracy = (roll: typeof close) => Math.round(roll.accuracy * 100) + '%';
    const dps = (roll: typeof close) => (averageAttackDamage(roll) / interval).toFixed(1);
    const fallsOff = close.accuracy !== edge.accuracy;
    const stats = {
      'sf-equipment-defense': String(ownedEquipmentDefense(purse, look)),
      'sf-equipment-max-hit': close.min + '–' + close.max,
      'sf-equipment-accuracy': fallsOff ? accuracy(close) + ' → ' + accuracy(edge) : accuracy(close),
      'sf-equipment-attack-interval': interval.toFixed(2) + 's',
      'sf-equipment-range': range + ' tiles',
      'sf-equipment-dps': fallsOff ? dps(close) + ' → ' + dps(edge) : dps(close),
    };
    for (const [id, value] of Object.entries(stats)) {
      const stat = $(id);
      if (stat.textContent !== value) stat.textContent = value;
    }
  }

  function playerRocketHop() {
    const time = Date.now() + (context.multiplayer?.state.serverOffset || 0),
      onFoot =
        context.playerLook.back === 'new-year-rocket' &&
        context.multiplayerWorld?.selfMode !== 'depotLaunch' &&
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
      context.multiplayerWorld?.selfMode !== 'depotLaunch' &&
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
    const button = $('sf-light-decorative-rocket');
    const status = context.multiplayer?.state.inventory?.decorativeRocket;
    const now = Date.now() + (context.multiplayer?.state.serverOffset || 0);
    const readyAt = Math.max(status?.readyAt || 0, status?.burningUntil || 0);
    const seconds = Math.max(0, Math.ceil((readyAt - now) / 1000));
    const equipped =
      context.playerLook.back === 'new-year-rocket' &&
      equipmentOwned(context.economy.state, 'new-year-rocket');
    button.hidden = !equipped;
    button.disabled =
      !equipped ||
      !context.multiplayer?.state.connected ||
      context.lightingDecorativeRocket ||
      context.capture.state.active ||
      !!context.chase?.state.jailed ||
      seconds > 0;
    updateActionLabel(
      button,
      seconds ? 'Light Rocket · ' + seconds + 's' : 'Light Rocket',
      'Rocket',
      'item',
    );
  }

  async function lightDecorativeRocket() {
    const button = $('sf-light-decorative-rocket');
    if (button.disabled || !context.multiplayer?.state.connected) return;
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
    if (field instanceof HTMLSelectElement && field.closest('.sf-character-gear'))
      updateEquipmentStats();
  }

  function showPasswordStatus(hasPassword: boolean) {
    $('sf-current-password-row').hidden = !hasPassword;
    $('sf-character-password-label').textContent = hasPassword
      ? 'New password (optional)'
      : 'Set a password';
  }

  function readCharacterLook() {
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
    return look;
  }

  async function saveCharacter() {
    const save = $('sf-character-done');
    const status = $('sf-character-save-status');
    if (save.disabled || $('sf-character').hidden) return;
    if (!context.multiplayer?.state.connected) {
      status.textContent = 'Connect to the game to save your character.';
      return;
    }
    save.disabled = true;
    try {
      const result = await context.multiplayer.command('saveCharacter', {
        look: readCharacterLook(),
        name: $('sf-username').value.trim(),
        phone: $('sf-iphone-equipped').checked,
        pvp: $('sf-pvp-enabled').checked,
        tradeDuelEnabled: $('sf-trade-duel-enabled').checked,
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
    updateEquipmentControl();
    updateEquipmentStats();
    $('sf-character').hidden = false;
    $('sf-reader-shade').hidden = false;
    $('sf-username').value = context.multiplayer.state.name;
    $('sf-pvp-enabled').checked = context.multiplayer.state.pvp?.enabled === true;
    $('sf-trade-duel-enabled').checked =
      context.multiplayer.state.playerState?.social.tradeDuelEnabled !== false;
    $('sf-character-save-status').textContent = '';
    showPasswordStatus(context.multiplayer.state.hasCharacterPassword === true);
    $('sf-character-tab').click();
    $('sf-character-tab').focus({ preventScroll: true });
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
    $('sf-help').focus({ preventScroll: true });
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
    playerRocketHop,
    hopRocket,
    lightDecorativeRocket,
    changeCharacter,
    saveCharacter,
    showCharacter,
    closeCharacter,
    showHelp,
    closeHelp,
  };
}
