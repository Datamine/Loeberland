import { bindTabs } from './ui/tabs.ts';
import type { GameCompletion } from './types/content.ts';

export interface HighScores {
  coins: { name: string; coins: number }[];
  strength: { name: string; level: number; xp: number }[];
  completion: ({ name: string } & GameCompletion)[];
}

export function bindHighScores(
  world: HTMLElement,
  request: () => Promise<{ ok: boolean; highScores?: HighScores }>,
) {
  const controls = world.querySelector<HTMLElement>('.sf-actions')!;
  const panel = controls.querySelector<HTMLElement>('.sf-high-scores')!;
  const tabs = controls.querySelector<HTMLElement>('[role="tablist"]')!;
  const list = panel.querySelector<HTMLOListElement>('ol')!;
  const status = panel.querySelector<HTMLElement>('[role="status"]')!;
  const selector = panel.querySelector<HTMLSelectElement>('select')!;
  const coins = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  const xp = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  let data: HighScores | undefined;
  function appendRow(name: string, value: HTMLElement) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    value.className = 'sf-score-value';
    label.textContent = name;
    li.append(label, value);
    list.append(li);
  }
  function render() {
    list.replaceChildren();
    if (!data) return;
    list.dataset.ranking = selector.value;
    if (selector.value === 'completion') {
      for (const row of data.completion ?? []) {
        const time = document.createElement('time');
        time.dateTime = new Date(row.at).toISOString();
        time.textContent =
          (row.recordedOnVerification ? 'Verified ' : '') +
          time.dateTime.slice(0, 19).replace('T', ' ') +
          ' UTC';
        appendRow(row.name, time);
      }
      status.textContent = list.children.length ? '' : 'No players have completed the game yet.';
      return;
    }
    const rows =
      selector.value === 'coins'
        ? data.coins.map((row) => [row.name, coins.format(Math.floor(row.coins)) + ' coins'])
        : data.strength.map((row) => [
            row.name,
            'Level ' + row.level + ' · ' + xp.format(row.xp) + ' XP',
          ]);
    for (const [name, score] of rows) {
      const value = document.createElement('span');
      value.textContent = score;
      appendRow(name, value);
    }
    status.textContent = rows.length ? '' : 'No scores yet.';
  }
  selector.addEventListener('change', render);
  bindTabs(tabs, async (tab) => {
    if (tab.getAttribute('aria-controls') !== panel.id) return;
    status.textContent = 'Loading high scores…';
    try {
      const result = await request();
      if (!result.ok || !result.highScores) throw new Error();
      data = result.highScores;
      render();
    } catch {
      status.textContent = 'High scores are unavailable.';
    }
  });
}
