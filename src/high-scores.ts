export interface HighScores {
  coins: { name: string; coins: number }[];
  strength: { name: string; level: number; xp: number }[];
}

export function bindHighScores(
  world: HTMLElement,
  request: () => Promise<{ ok: boolean; highScores?: HighScores }>,
) {
  const controls = world.querySelector<HTMLElement>('.sf-actions')!;
  const panel = controls.querySelector<HTMLElement>('.sf-high-scores')!;
  const tabs = [...controls.querySelectorAll<HTMLButtonElement>('[data-side-tab]')];
  const list = panel.querySelector<HTMLOListElement>('ol')!;
  const status = panel.querySelector<HTMLElement>('[role="status"]')!;
  const selector = panel.querySelector<HTMLSelectElement>('select')!;
  const coins = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const xp = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  let data: HighScores | undefined;
  function render() {
    list.replaceChildren();
    if (!data) return;
    const money = selector.value === 'coins';
    const rows = money
      ? data.coins.map((row) => [row.name, coins.format(row.coins) + ' coins'])
      : data.strength.map((row) => [
          row.name,
          'Strength Level ' + row.level + ' · ' + xp.format(row.xp) + ' XP',
        ]);
    for (const [name, score] of rows) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = name;
      value.textContent = score;
      li.append(label, value);
      list.append(li);
    }
    status.textContent = rows.length ? '' : 'No scores yet.';
  }
  selector.addEventListener('change', render);
  for (const tab of tabs)
    tab.addEventListener('click', async () => {
      const scores = tab.dataset.sideTab === 'scores';
      controls.dataset.tab = scores ? 'scores' : 'you';
      panel.hidden = !scores;
      for (const other of tabs) other.setAttribute('aria-pressed', String(other === tab));
      if (!scores) return;
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
