import {
  averageAttackDamage,
  enemyDamageRange,
  rollEnemyDamage,
  rollWeaponDamage,
  weaponDamageRange,
} from '../src/combat.ts';
import {
  monsterProjectileFlight,
  WILDERNESS_FIRST_ATTACK_SECONDS,
} from '../src/config/gameplay.ts';
import { clothingSelection } from '../src/clothing.ts';
import { MONSTER_STATS } from '../src/config/monster-drops.ts';
import {
  ITEM_STATS,
  PLAYER_WEAPONS,
  equipmentDefense,
  sandwichCapacity,
  weaponAttackInterval,
} from '../src/item-stats.ts';
import { PROGRESSION } from '../src/config/progression.ts';
import { upgradedWeaponId } from '../src/config/weapon-upgrades.ts';
import { UPGRADED_HIKING_BACKPACK } from '../src/config/hiking-backpack.ts';
import { SKILL_THRESHOLDS, hitpointMaximum } from '../src/progression.ts';

type Attack = {
  interval: number;
  range: (target: Fighter) => ReturnType<typeof enemyDamageRange>;
  damage: (target: Fighter, random: () => number) => number;
};
type Fighter = Attack & {
  name: string;
  level: number;
  hp: number;
  defense: number;
  firstAttack: number;
  flight: number;
  sandwiches?: number;
  reflect?: number;
  enrage?: Attack & { at: number };
};
type Pair<T> = [T, T];

export function playerFighter({
  name = 'Player',
  level = 1,
  hitpointsLevel = level,
  weapon = 'unarmed',
  defense = 0,
  sandwiches = 0,
  inebriation = 0,
  distance = 0,
  upgrade = false,
}: {
  name?: string;
  level?: number;
  hitpointsLevel?: number;
  weapon?: string;
  defense?: number;
  sandwiches?: number;
  inebriation?: number;
  distance?: number;
  upgrade?: boolean;
} = {}): Fighter {
  const upgraded = upgrade ? upgradedWeaponId(weapon) : undefined;
  return {
    name,
    level,
    hp: hitpointMaximum(SKILL_THRESHOLDS[hitpointsLevel - 1]),
    interval: weaponAttackInterval(weapon, { ownedEquipment: upgraded ? [upgraded] : [] }),
    firstAttack: 0,
    flight: 0,
    defense,
    sandwiches,
    range: () => weaponDamageRange(level, weapon, inebriation, distance),
    damage: (_target, random) => rollWeaponDamage(level, weapon, random, inebriation, distance),
  };
}

export function monsterFighter(kind: string): Fighter {
  const npc = MONSTER_STATS[kind];
  function attack(damage: number, interval: number): Attack {
    return {
      interval,
      range: (target) =>
        damage ? enemyDamageRange(damage, target.level) : { min: 0, max: 0, accuracy: 0 },
      damage: (target, random) => (damage ? rollEnemyDamage(damage, target.level, random) : 0),
    };
  }
  return {
    ...attack(npc.damage, npc.interval ?? 1.25),
    name: npc.name,
    level: npc.level,
    hp: npc.hp,
    defense: 0,
    firstAttack: kind === 'kraken' ? 3.5 : kind === 'raptor' ? 1 : WILDERNESS_FIRST_ATTACK_SECONDS,
    flight: monsterProjectileFlight(npc.attackEffect),
    reflect: npc.reflectDamage,
    enrage:
      npc.enrageAt && npc.enrageInterval
        ? {
            at: npc.enrageAt,
            ...attack(npc.damage + (npc.enrageDamageBonus || 0), npc.enrageInterval),
          }
        : undefined,
  };
}

export function simulateFight(
  fighters: Pair<Fighter>,
  random: () => number,
  trace?: (time: number, hp: Pair<number>) => void,
) {
  const hp: Pair<number> = [fighters[0].hp, fighters[1].hp];
  const next: Pair<number> = [fighters[0].firstAttack, fighters[1].firstAttack];
  const damage: Pair<number> = [0, 0];
  const attacks: Pair<number> = [0, 0];
  const foodUsed: Pair<number> = [0, 0];
  const enraged: Pair<boolean> = [false, false];
  const impacts: { time: number; attacker: 0 | 1; attack: Attack }[] = [];
  let time = 0;
  trace?.(time, hp);
  while (hp[0] > 0 && hp[1] > 0) {
    const nextAttack = Math.min(...next);
    const impact = impacts[0];
    time = Math.min(impact?.time ?? Infinity, nextAttack);
    if (time > 120) break;
    let attacker: 0 | 1;
    let attack: Attack;
    if (impact && impact.time <= nextAttack) {
      ({ attacker, attack } = impact);
      impacts.shift();
    } else {
      attacker = next[0] === next[1] ? (random() < 0.5 ? 0 : 1) : next[0] < next[1] ? 0 : 1;
      const fighter = fighters[attacker];
      attack = enraged[attacker] ? fighter.enrage! : fighter;
      attacks[attacker]++;
      next[attacker] += attack.interval;
      if (fighter.flight) {
        impacts.push({ time: time + fighter.flight, attacker, attack });
        impacts.sort((a, b) => a.time - b.time);
        continue;
      }
    }
    const target = attacker === 0 ? 1 : 0;
    const hit = Math.min(
      hp[target],
      Math.max(0, attack.damage(fighters[target], random) - fighters[target].defense),
    );
    damage[attacker] += hit;
    hp[target] -= hit;
    const reflection = Math.min(hp[attacker], Math.floor(hit * (fighters[target].reflect ?? 0)));
    damage[target] += reflection;
    hp[attacker] -= reflection;
    const phase = fighters[target].enrage;
    if (phase && !enraged[target] && hp[target] <= phase.at * fighters[target].hp) {
      enraged[target] = true;
      next[target] = Math.min(next[target], time + phase.interval);
    }
    for (const side of [0, 1] as const) {
      const fighter = fighters[side];
      const heal = ITEM_STATS.sandwich.healing;
      if (
        hp[side] > 0 &&
        fighter.hp - hp[side] >= heal &&
        foodUsed[side] < (fighter.sandwiches ?? 0)
      ) {
        hp[side] += heal;
        foodUsed[side]++;
      }
    }
    trace?.(time, hp);
  }
  const winner = hp[0] === 0 ? 1 : hp[1] === 0 ? 0 : -1;
  return { winner, time: winner === -1 ? 120 : time, damage, attacks, foodUsed };
}

function fighterFields(side: string, preset: string) {
  const group = document.createElement('fieldset');
  group.innerHTML = `<legend>${side}</legend>
    <label>Combatant <select data-field="kind"></select></label>
    <div class="combat-player">
      <label>Strength level <input data-field="level" type="number" min="1" max="${PROGRESSION.maxLevel}" value="1" required></label>
      <label>Hitpoints level <input data-field="hp" type="number" min="1" max="${PROGRESSION.maxLevel}" value="1" required></label>
      <label>Weapon <select data-field="weapon"></select></label>
      <label>Inebriation (%) <input data-field="inebriation" type="number" min="0" max="100" value="0" required></label>
      <label>Sandwiches <input data-field="food" type="number" min="0" max="${sandwichCapacity({ ownedEquipment: [UPGRADED_HIKING_BACKPACK] })}" value="0" required></label>
      <label><input data-field="edge" type="checkbox"> Use maximum-range accuracy</label>
      <label><input data-field="boots" type="checkbox"> Combat boots</label>
      <label>Torso <select data-field="torso"></select></label>
      <label>Legs <select data-field="legs"></select></label>
      <label><input data-field="upgrade" type="checkbox"> Weapon upgraded</label>
    </div>`;
  const field = <T extends HTMLElement>(key: string) =>
    group.querySelector<T>(`[data-field="${key}"]`)!;
  const kind = field<HTMLSelectElement>('kind');
  kind.add(new Option('Player', 'player'));
  for (const [id, npc] of Object.entries(MONSTER_STATS))
    kind.add(new Option(`${npc.name} · level ${npc.level}`, id));
  kind.value = preset;
  const weapon = field<HTMLSelectElement>('weapon');
  for (const id of PLAYER_WEAPONS) weapon.add(new Option(ITEM_STATS[id].name, id));
  const torso = field<HTMLSelectElement>('torso');
  torso.add(new Option('Regular shirt', 'shirt'));
  for (const id of ['iron-armor', 'gold-trimmed-iron-armor', 'ice-top', 'kevlar-vest', 'icy-kevlar-vest'])
    torso.add(new Option(ITEM_STATS[id].name, id));
  const legs = field<HTMLSelectElement>('legs');
  legs.add(new Option('Regular trousers', 'trousers'));
  for (const id of ['iron-armor-legs', 'ice-pants']) legs.add(new Option(ITEM_STATS[id].name, id));
  const playerFields = group.querySelector<HTMLDivElement>('.combat-player')!;
  const update = () => {
    playerFields.hidden = kind.value !== 'player';
    for (const input of playerFields.querySelectorAll('input, select'))
      (input as HTMLInputElement).disabled = playerFields.hidden;
    field<HTMLInputElement>('upgrade').disabled =
      playerFields.hidden || (weapon.value !== 'railgun' && weapon.value !== 'akibo');
    field<HTMLInputElement>('edge').disabled =
      playerFields.hidden || !ITEM_STATS[weapon.value]?.accuracyFalloff;
  };
  kind.addEventListener('change', update);
  weapon.addEventListener('change', update);
  update();
  const read = (): Fighter => {
    if (kind.value !== 'player') return monsterFighter(kind.value);
    const checked = (key: string) => field<HTMLInputElement>(key).checked;
    return playerFighter({
      name: side,
      level: field<HTMLInputElement>('level').valueAsNumber,
      hitpointsLevel: field<HTMLInputElement>('hp').valueAsNumber,
      weapon: weapon.value,
      distance: checked('edge') ? ITEM_STATS[weapon.value]?.range : 0,
      inebriation: field<HTMLInputElement>('inebriation').valueAsNumber,
      sandwiches: field<HTMLInputElement>('food').valueAsNumber,
      upgrade: checked('upgrade'),
      defense: equipmentDefense({
        ...clothingSelection({ torso: torso.value, legs: legs.value }),
        boots: checked('boots'),
      }),
    });
  };
  return { group, read };
}

export function setupCombatSimulator() {
  const open = document.querySelector('#open-combat-simulator')!;
  const container = document.createElement('template');
  container.innerHTML = `<dialog id="combat-simulator" aria-labelledby="combat-title">
      <button type="button" class="combat-close">Close</button>
      <h2 id="combat-title">Combat simulator</h2>
      <form>
        <div class="combat-fighters"></div>
        <button type="submit">Simulate fights</button>
        <p class="muted">Both fighters start at full health and can reach each other. Ammo is unlimited. Players eat after losing a sandwich’s worth of health. Fights end after two minutes or on defeat.</p>
        <output aria-live="polite"></output>
        <p class="muted">Sustained DPS uses the opponent’s Strength and armor. HP removed/s counts only hitpoints lost during the simulated fights.</p>
        <p class="muted">Sample fight · HP over time · A is teal, B is amber</p>
        <canvas width="680" height="184" role="img" aria-label="Sample combat hitpoints over time"></canvas>
      </form>
    </dialog>`;
  const dialog = container.content.querySelector('dialog')!;
  const styling = document.createElement('style');
  styling.textContent = `#combat-simulator {
  color: var(--text, #e4e9e7);
  background: var(--panel, #172226);
  border: 1px solid var(--line, #304146);
  border-radius: 12px;
  width: min(720px, 95vw);
  max-height: 90vh;
  padding: 20px;
}
#combat-simulator::backdrop { background: #081014bb; }
.combat-close { float: right; }
.combat-fighters, .combat-player {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.combat-fighters { margin-bottom: 14px; }
.combat-fighters fieldset { border: 1px solid var(--line, #304146); min-width: 0; }
.combat-fighters label { display: block; }
.combat-fighters select, .combat-fighters input[type='number'] { display: block; width: 100%; }
.combat-player { margin-top: 12px; }
.combat-player[hidden] { display: none; }
#combat-simulator canvas { width: 100%; height: auto; }
@media (max-width: 600px) { .combat-fighters { grid-template-columns: 1fr; } }`;
  document.head.append(styling);
  document.body.append(dialog);
  const form = dialog.querySelector<HTMLFormElement>('form')!;
  const fields = dialog.querySelector('.combat-fighters')!;
  const output = dialog.querySelector<HTMLOutputElement>('output')!;
  const canvas = dialog.querySelector('canvas')!;
  const graph = canvas.getContext('2d')!;
  const first = fighterFields('Fighter A', 'player');
  const second = fighterFields('Fighter B', 'goblin');
  fields.append(first.group, second.group);
  function simulate() {
    const fighters: Pair<Fighter> = [first.read(), second.read()];
    let seed = 148391;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const wins = [0, 0, 0];
    const damage = [0, 0];
    let elapsed = 0;
    const rounds = 500;
    for (let i = 0; i < rounds; i++) {
      const result = simulateFight(fighters, random);
      wins[result.winner < 0 ? 2 : result.winner]++;
      elapsed += result.time;
      damage[0] += result.damage[0];
      damage[1] += result.damage[1];
    }
    output.replaceChildren();
    fighters.forEach((fighter, i) => {
      const result = document.createElement('p');
      const target = fighters[i === 0 ? 1 : 0];
      const dps = (attack: Attack) =>
        (averageAttackDamage(attack.range(target), target.defense) / attack.interval).toFixed(2);
      const sustained = fighter.enrage
        ? `${dps(fighter)} base / ${dps(fighter.enrage)} enraged sustained DPS`
        : `${dps(fighter)} sustained DPS`;
      const delivered = elapsed > 0 ? (damage[i] / elapsed).toFixed(2) : '—';
      const accuracy = Math.round(fighter.range(target).accuracy * 100);
      result.textContent = `${i === 0 ? 'A' : 'B'} · ${fighter.name} · ${fighter.hp} HP · ${((100 * wins[i]) / rounds).toFixed(1)}% wins · ${accuracy}% accuracy · ${sustained} · ${delivered} HP removed/s`;
      output.append(result);
    });
    const summary = document.createElement('p');
    summary.textContent = `${rounds} fights · ${(elapsed / rounds).toFixed(1)} s average · ${((100 * wins[2]) / rounds).toFixed(1)}% timed out`;
    output.append(summary);

    const points: { time: number; hp: Pair<number> }[] = [];
    const sample = simulateFight(fighters, random, (time, hp) =>
      points.push({ time, hp: [...hp] }),
    );
    graph.clearRect(0, 0, canvas.width, canvas.height);
    const left = 34,
      top = 12,
      width = canvas.width - 54,
      height = canvas.height - 36;
    graph.strokeStyle = '#64777a';
    graph.strokeRect(left, top, width, height);
    graph.font = '13px system-ui';
    graph.fillStyle = '#aebfbf';
    graph.fillText('100%', 0, top + 5);
    graph.fillText('0%', 8, top + height + 4);
    graph.fillText('0 s', left, canvas.height - 5);
    graph.textAlign = 'right';
    graph.fillText(`${sample.time.toFixed(1)} s`, left + width, canvas.height - 5);
    graph.textAlign = 'left';
    fighters.forEach((fighter, i) => {
      graph.strokeStyle = i === 0 ? '#65dbcf' : '#ffba69';
      graph.lineWidth = 2;
      graph.beginPath();
      let previous = top;
      graph.moveTo(left, previous);
      for (const point of points) {
        const x = left + (width * point.time) / Math.max(sample.time, 0.05);
        const y = top + height * (1 - point.hp[i] / fighter.hp);
        graph.lineTo(x, previous);
        graph.lineTo(x, y);
        previous = y;
      }
      graph.lineTo(left + width, previous);
      graph.stroke();
    });
  }
  open.addEventListener('click', () => {
    dialog.showModal();
    if (form.checkValidity()) simulate();
  });
  dialog.querySelector('.combat-close')!.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    simulate();
  });
}
