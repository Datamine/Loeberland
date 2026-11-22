import { rollEnemyDamage, rollWeaponDamage } from '../src/combat.ts';
import { MONSTER_STATS } from '../src/config/monster-drops.ts';
import {
  ITEM_STATS,
  PLAYER_WEAPONS,
  equipmentDefense,
  weaponAttackInterval,
} from '../src/item-stats.ts';
import { PROGRESSION } from '../src/config/progression.ts';
import { SKILL_THRESHOLDS, hitpointMaximum } from '../src/progression.ts';

type Fighter = {
  name: string;
  level: number;
  hp: number;
  interval: number;
  defense: number;
  damage: (target: Fighter, random: () => number) => number;
  enrage?: {
    at: number;
    damage: (target: Fighter, random: () => number) => number;
    interval: number;
  };
};
type Pair<T> = [T, T];

function fight(
  fighters: Pair<Fighter>,
  random: () => number,
  trace?: (time: number, hp: Pair<number>) => void,
) {
  const hp: Pair<number> = [fighters[0].hp, fighters[1].hp];
  const next: Pair<number> = [fighters[0].interval, fighters[1].interval];
  const damage: Pair<number> = [0, 0];
  const enraged: Pair<boolean> = [false, false];
  let time = 0;
  trace?.(time, hp);
  while (hp[0] > 0 && hp[1] > 0 && Math.min(...next) <= 120) {
    const attacker = next[0] === next[1] ? (random() < 0.5 ? 0 : 1) : next[0] < next[1] ? 0 : 1;
    const target = attacker === 0 ? 1 : 0;
    time = next[attacker];
    const attack = enraged[attacker] ? fighters[attacker].enrage! : fighters[attacker];
    next[attacker] += attack.interval;
    const hit = Math.min(
      hp[target],
      Math.max(0, attack.damage(fighters[target], random) - fighters[target].defense),
    );
    damage[attacker] += hit;
    hp[target] = Math.max(0, hp[target] - hit);
    const phase = fighters[target].enrage;
    if (phase && !enraged[target] && hp[target] <= phase.at * fighters[target].hp) {
      enraged[target] = true;
      next[target] = Math.min(next[target], time + phase.interval);
    }
    trace?.(time, hp);
  }
  const winner = hp[0] === 0 ? 1 : hp[1] === 0 ? 0 : -1;
  return { winner, time: winner === -1 ? 120 : time, damage };
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
      <label><input data-field="boots" type="checkbox"> Combat boots</label>
      <label><input data-field="iceTop" type="checkbox"> Ice top</label>
      <label><input data-field="icePants" type="checkbox"> Ice pants</label>
      <label><input data-field="upgrade" type="checkbox"> Railgun upgrade</label>
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
  const playerFields = group.querySelector<HTMLDivElement>('.combat-player')!;
  const update = () => {
    playerFields.hidden = kind.value !== 'player';
    for (const input of playerFields.querySelectorAll('input, select'))
      (input as HTMLInputElement).disabled = playerFields.hidden;
    field<HTMLInputElement>('upgrade').disabled = playerFields.hidden || weapon.value !== 'railgun';
  };
  kind.addEventListener('change', update);
  weapon.addEventListener('change', update);
  update();
  const read = (): Fighter => {
    if (kind.value !== 'player') {
      const npc = MONSTER_STATS[kind.value];
      const enrage =
        npc.enrageAt && npc.enrageInterval
          ? {
              at: npc.enrageAt,
              interval: npc.enrageInterval,
              damage: (target: Fighter, random: () => number) =>
                rollEnemyDamage(npc.damage + (npc.enrageDamageBonus || 0), target.level, random),
            }
          : undefined;
      return {
        name: npc.name,
        level: npc.level,
        hp: npc.hp,
        interval: npc.interval ?? 1.25,
        defense: 0,
        enrage,
        damage: (target, random) =>
          npc.damage ? rollEnemyDamage(npc.damage, target.level, random) : 0,
      };
    }
    const level = field<HTMLInputElement>('level').valueAsNumber;
    const inebriation = field<HTMLInputElement>('inebriation').valueAsNumber;
    const checked = (key: string) => field<HTMLInputElement>(key).checked;
    const id = weapon.value;
    return {
      name: side,
      level,
      hp: hitpointMaximum(SKILL_THRESHOLDS[field<HTMLInputElement>('hp').valueAsNumber - 1]),
      interval: weaponAttackInterval(id, {
        ownedEquipment: checked('upgrade') ? ['railgun-upgrade'] : [],
      }),
      defense: equipmentDefense({
        boots: checked('boots'),
        iceTop: checked('iceTop'),
        icePants: checked('icePants'),
      }),
      damage: (_target, random) => rollWeaponDamage(level, id, random, inebriation),
    };
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
        <p class="muted">Both fighters start at full health and in range. Uses standard attacks with unlimited ammo. Fights time out at two minutes.</p>
        <output aria-live="polite"></output>
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
      const result = fight(fighters, random);
      wins[result.winner < 0 ? 2 : result.winner]++;
      elapsed += result.time;
      damage[0] += result.damage[0];
      damage[1] += result.damage[1];
    }
    output.replaceChildren();
    fighters.forEach((fighter, i) => {
      const result = document.createElement('p');
      result.textContent = `${i === 0 ? 'A' : 'B'} · ${fighter.name} · ${fighter.hp} HP · ${((100 * wins[i]) / rounds).toFixed(1)}% wins · ${(damage[i] / elapsed).toFixed(2)} DPS`;
      output.append(result);
    });
    const summary = document.createElement('p');
    summary.textContent = `${rounds} fights · ${(elapsed / rounds).toFixed(1)} s average · ${((100 * wins[2]) / rounds).toFixed(1)}% timed out`;
    output.append(summary);

    const points: { time: number; hp: Pair<number> }[] = [];
    const sample = fight(fighters, random, (time, hp) => points.push({ time, hp: [...hp] }));
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
        const x = left + (width * point.time) / sample.time;
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
