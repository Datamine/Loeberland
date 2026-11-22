import { requiredElement } from '../src/types/ui.ts';
import { errorMessage, isRecord } from '../src/types/json.ts';
import { fillEquipmentSelect } from '../src/equipment-options.ts';
import { clothingSelection } from '../src/clothing.ts';
import {
  adminEquipmentOptions,
  grantAndEquip,
  unlockedEquipment,
  type AdminEquipmentSlot,
} from './admin-equipment.ts';
interface AdminRow {
  kind: string;
  key: string;
  label: string | null;
}
interface AdminList {
  records: AdminRow[];
  backend: string;
  location: string;
}
interface AdminRecord {
  raw: string;
}
interface AdminElements {
  status: HTMLDivElement;
  editor: HTMLTextAreaElement;
  save: HTMLButtonElement;
  format: HTMLButtonElement;
  reload: HTMLButtonElement;
  refresh: HTMLButtonElement;
  search: HTMLInputElement;
  dirty: HTMLSpanElement;
  count: HTMLParagraphElement;
  records: HTMLElement;
  source: HTMLParagraphElement;
  title: HTMLHeadingElement;
  key: HTMLParagraphElement;
  equipment: HTMLElement;
  'equipment-fields': HTMLDivElement;
  'equipment-hint': HTMLParagraphElement;
}
declare const __ADMIN_READ_ONLY__: boolean;
declare const __ADMIN_RESTARTS_GAME__: boolean;
const token = '__ADMIN_TOKEN__';
const readOnly = __ADMIN_READ_ONLY__;
const restartsGame = __ADMIN_RESTARTS_GAME__;
const $ = <K extends keyof AdminElements>(id: K) => requiredElement<AdminElements[K]>(id);
let records: AdminRow[] = [],
  selected: AdminRow | null = null,
  original = '',
  baseline = '',
  busy = false;
const slots = {
  torso: 'Top',
  legs: 'Bottom',
  boots: 'Footwear',
  hat: 'Hat',
  back: 'Back',
  neck: 'Neck',
  weapon: 'Weapon',
  sunglasses: 'Eyewear',
} as const;
const equipmentFields = new Map<AdminEquipmentSlot, HTMLSelectElement>();
for (const [key, caption] of Object.entries(slots) as [AdminEquipmentSlot, string][]) {
  const label = document.createElement('label');
  const select = document.createElement('select');
  label.append(caption, select);
  $('equipment-fields').append(label);
  equipmentFields.set(key, select);
}
function playerDraft() {
  try {
    const root: unknown = JSON.parse($('editor').value);
    const record = isRecord(root) ? root.state : null;
    if (!isRecord(record)) return null;
    const player = isRecord(record.playerState) ? record.playerState : record;
    if (!isRecord(player.inventory) || !isRecord(player.quests)) return null;
    return { root, record, player, inventory: player.inventory, quests: player.quests };
  } catch {
    return null;
  }
}
function renderEquipment() {
  $('equipment').hidden = selected?.kind !== 'player';
  if ($('equipment').hidden) return;
  const draft = playerDraft();
  $('equipment-hint').textContent = draft
    ? readOnly
      ? 'Locked items are marked in the list.'
      : 'Choosing a locked item unlocks and equips it when you save.'
    : 'Enter a valid player record to use the selectors.';
  $('equipment-fields').hidden = !draft;
  if (!draft) return;
  const unlocked = unlockedEquipment(draft);
  const appearance = isRecord(draft.player.appearance) ? draft.player.appearance : {};
  const look: Record<string, unknown> = { ...appearance, ...clothingSelection(appearance) };
  for (const [key, select] of equipmentFields) {
    const owned = new Set(unlocked[key].map((item) => item.value));
    const options = adminEquipmentOptions[key].map((item) =>
      owned.has(item.value) ? item : { ...item, label: item.label + ' · Locked' },
    );
    const current = look[key];
    const value =
      typeof current === 'string' || typeof current === 'boolean'
        ? current
        : key === 'back' && appearance.cape === true
          ? 'cape'
          : options[0].value;
    fillEquipmentSelect(select, options, value);
    const saved = options.find((item) => item.value === String(value));
    if (!saved || (!readOnly && !owned.has(String(value)))) {
      const placeholder = new Option(
        saved ? saved.label + ' (saved)' : 'Unavailable · ' + value,
        '',
      );
      placeholder.disabled = true;
      select.add(placeholder);
      select.value = '';
    }
    select.disabled = readOnly || busy;
    select.onchange = () => {
      if (readOnly || busy) return;
      const current = playerDraft();
      if (!current || !grantAndEquip(current, key, select.value)) return;
      const editor = $('editor');
      editor.value = JSON.stringify(current.root, null, 2);
      controls();
    };
  }
}
function status(message: string | null, type = '') {
  $('status').textContent = message;
  $('status').className = type;
}
function changed() {
  return !readOnly && !!selected && $('editor').value !== baseline;
}
function controls() {
  $('save').disabled = readOnly || busy || !changed();
  $('save').hidden = readOnly;
  $('editor').readOnly = readOnly;
  for (const id of ['format', 'reload'] as const) $(id).disabled = busy || !selected;
  $('editor').disabled = busy || !selected;
  $('refresh').disabled = busy;
  $('dirty').textContent = changed() ? 'Unsaved changes' : '';
  renderEquipment();
}
function api(path: 'records', options?: RequestInit): Promise<AdminList>;
function api(path: string, options?: RequestInit): Promise<AdminRecord>;
async function api(path: string, options: RequestInit = {}): Promise<AdminList | AdminRecord> {
  const response = await fetch('api/' + path, {
    ...options,
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw Error(
      isRecord(result) && typeof result.error === 'string' ? result.error : 'Request failed.',
    );
  return result as AdminList | AdminRecord;
}
function draw() {
  const query = $('search').value.toLowerCase();
  const visible = records.filter((row) =>
    (row.label + ' ' + row.key + ' ' + row.kind).toLowerCase().includes(query),
  );
  $('count').textContent = visible.length + ' of ' + records.length + ' records';
  $('records').replaceChildren();
  for (const row of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = busy;
    button.className =
      selected && row.kind === selected.kind && row.key === selected.key ? 'active' : '';
    button.textContent = row.label;
    const detail = document.createElement('small');
    detail.textContent = row.kind + ' · ' + row.key;
    button.append(detail);
    button.onclick = () => load(row);
    $('records').append(button);
  }
}
async function refresh() {
  const data = await api('records');
  records = data.records;
  $('source').textContent = data.backend.toUpperCase() + ' · ' + data.location;
  draw();
}
async function load(row: AdminRow) {
  if (busy || (changed() && !confirm('Discard unsaved changes?'))) return;
  busy = true;
  controls();
  draw();
  try {
    const data = await api('record?' + new URLSearchParams({ kind: row.kind, key: row.key }));
    const formatted = JSON.stringify(JSON.parse(data.raw), null, 2);
    selected = row;
    original = data.raw;
    baseline = formatted;
    $('editor').value = baseline;
    $('title').textContent = row.label;
    $('key').textContent = row.kind + ' · ' + row.key;
    status(
      readOnly
        ? 'Read-only inspection. Refresh or reload to see the latest saved checkpoint.'
        : row.kind === 'player'
          ? 'Edit state or username. For a rename, update name and canonical (lowercase). Keep owner unchanged.'
          : 'Edit the JSON, then save.',
    );
  } catch (error) {
    status(errorMessage(error), 'error');
  } finally {
    busy = false;
    controls();
    draw();
  }
}
$('save').onclick = async () => {
  if (restartsGame && !confirm('Save this edit and briefly restart the game?')) return;
  busy = true;
  controls();
  draw();
  try {
    const value = JSON.parse($('editor').value);
    const data = await api('record', {
      method: 'PUT',
      body: JSON.stringify({ ...selected, original, value }),
    });
    original = data.raw;
    baseline = JSON.stringify(value, null, 2);
    $('editor').value = baseline;
    status(
      restartsGame
        ? 'Saved. The game is restarting.'
        : 'Saved. Restart the game server to load this change.',
      'success',
    );
    try {
      await refresh();
    } catch (error) {
      status('Saved, but refreshing the list failed: ' + errorMessage(error), 'error');
    }
  } catch (error) {
    status(errorMessage(error), 'error');
  } finally {
    busy = false;
    controls();
    draw();
  }
};
$('format').onclick = () => {
  try {
    $('editor').value = JSON.stringify(JSON.parse($('editor').value), null, 2);
    controls();
    status('JSON formatted.');
  } catch (error) {
    status(errorMessage(error), 'error');
  }
};
$('reload').onclick = () => {
  if (selected) void load(selected);
};
$('refresh').onclick = () => refresh().catch((error) => status(errorMessage(error), 'error'));
$('search').oninput = draw;
$('editor').oninput = controls;
window.addEventListener('beforeunload', (event) => {
  if (changed()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
controls();
refresh().catch((error) => status(errorMessage(error), 'error'));

export {};
