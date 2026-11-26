import { contentText } from './content-runtime.ts';
import type { Point } from './types/geometry.ts';
import type { BuildInfo } from './types/network.ts';
import type { ActionReceipt, LocalPlayer } from './types/world.ts';
import { requiredValue } from './types/assert.ts';
export interface DebugTeleportNPC {
  id: string;
  label: string;
  x: number;
  z: number;
}
interface DebugConsoleOptions {
  panel: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  status: HTMLElement;
  xOutput: HTMLElement;
  yOutput: HTMLElement;
  serverCommitOutput: HTMLElement;
  serverVersionOutput: HTMLElement;
  getServerBuild: () => BuildInfo | undefined;
  fpsOutput?: HTMLElement | null;
  getFPS?: () => number;
  performanceOutputs?: Record<string, HTMLElement | null>;
  getPerformance?: () => Record<string, string>;
  getPosition: () => Point;
  canTeleport: () => boolean;
  getTeleportNPCs: () => readonly DebugTeleportNPC[];
  teleport: (x: number, y: number) => ActionReceipt;
  beforeOpen: () => void;
  onMessage: (message: string) => void;
  focusWorld: () => void;
}
type WorldCommand =
  { type: 'debug' } | { type: 'teleport'; x: number; y: number } | { error: string };
import { isFiniteNumber, isRecord } from './types/json.ts';

/** Commands accept numbers, never JavaScript. Map coordinates are the center
 * of the character in the same east/south plane used by the rendered world. */
export function parseWorldCommand(value: string): WorldCommand {
  const text = String(value).trim();
  if (/^:debug$/i.test(text)) return { type: 'debug' };
  const number = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)',
    match = text.match(new RegExp('^:tp\\s+' + number + '\\s*,\\s*' + number + '$', 'i'));
  if (!match) return { error: 'Use :debug or :tp x,y. For an NPC, type :tp and its name, then press Tab.' };
  const x = Number(match[1]),
    y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6)
    return { error: 'Enter finite map coordinates between −1,000,000 and 1,000,000.' };
  return { type: 'teleport', x, y };
}
export function debugMapPosition(player: Pick<LocalPlayer, 'x' | 'y'>) {
  return { x: player.x + 0.5, y: player.y + 0.5 };
}
export function debugTilePosition(x: number, y: number) {
  return { x: x - 0.5, y: y - 0.5 };
}
export function createFrameMeter() {
  let start: number | null = null,
    previous: number | null = null,
    count = 0,
    fps = 0;
  return {
    sample(time: unknown) {
      if (!isFiniteNumber(time)) return fps;
      if (previous === null || time <= previous || time - previous > 1500) {
        start = time;
        count = 0;
        fps = 0;
      } else count++;
      previous = time;
      const elapsed = time - requiredValue(start, 'Frame meter start');
      if (elapsed >= 500) {
        fps = (count * 1000) / elapsed;
        start = time;
        count = 0;
      }
      return fps;
    },
    reset() {
      start = null;
      previous = null;
      count = 0;
      fps = 0;
    },
    get fps() {
      return fps;
    },
  };
}

export function createDebugConsole({
  panel,
  form,
  input,
  status,
  xOutput,
  yOutput,
  serverCommitOutput,
  serverVersionOutput,
  getServerBuild,
  fpsOutput = null,
  getFPS = () => 0,
  performanceOutputs = {},
  getPerformance = () => ({}),
  getPosition,
  canTeleport,
  getTeleportNPCs,
  teleport,
  beforeOpen,
  onMessage,
  focusWorld,
}: DebugConsoleOptions) {
  const history: string[] = [];
  const teleportButton = requiredValue(
    panel.querySelector<HTMLButtonElement>('[data-debug-teleport]'),
    'Debug teleport button',
  );
  const suggestions = requiredValue(form.querySelector<HTMLUListElement>('[data-command-npcs]'),
    'NPC teleport suggestions');
  let historyIndex = 0,
    draft = '',
    matches: DebugTeleportNPC[] = [],
    selected = 0;
  const commandHint = 'Enter runs the command. Escape cancels.';
  const matchText = (value: string) => value.toLowerCase().trim().replace(/[’']/g, '');
  function chooseNPC(npc: DebugTeleportNPC) {
    input.value = `:tp ${Number(npc.x.toFixed(4))},${Number(npc.z.toFixed(4))}`;
    refreshSuggestions();
    input.focus({ preventScroll: true });
  }
  function renderSuggestions() {
    suggestions.replaceChildren();
    const start = Math.min(Math.max(0, selected - 3), Math.max(0, matches.length - 8));
    for (const [offset, npc] of matches.slice(start, start + 8).entries()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('aria-current', String(start + offset === selected));
      button.textContent = `${npc.label} (${npc.x.toFixed(1)}, ${npc.z.toFixed(1)})`;
      button.addEventListener('click', () => chooseNPC(npc));
      row.append(button);
      suggestions.append(row);
    }
    suggestions.hidden = !matches.length;
  }
  function refreshSuggestions() {
    const name = matchText(input.value.match(/^\s*:tp\s+(.+)$/i)?.[1] ?? '');
    const search = canTeleport() && /[a-z]/.test(name) && !/^[+-]?(?:\d|\.)/.test(name);
    const words = name.split(/\s+/);
    const position = getPosition();
    const distance = (npc: DebugTeleportNPC) => Math.hypot(npc.x - position.x, npc.z - position.y);
    matches = search
      ? [...new Map(getTeleportNPCs().map((npc) => [npc.id, npc])).values()]
          .filter((npc) => {
            const label = matchText(npc.label);
            return isFiniteNumber(npc.x) && isFiniteNumber(npc.z) &&
              words.every((word) => label.includes(word));
          })
          .sort((a, b) =>
            Number(matchText(b.label).startsWith(name)) - Number(matchText(a.label).startsWith(name)) ||
            a.label.localeCompare(b.label) ||
            distance(a) - distance(b),
          )
      : [];
    selected = 0;
    renderSuggestions();
    status.dataset.error = 'false';
    status.textContent = matches.length ? 'Use arrows to select an NPC. Tab fills in the coordinates.'
      : search ? 'No matching NPCs.' : commandHint;
  }
  const editing = (target: EventTarget | null) =>
    isRecord(target) &&
    (target.isContentEditable === true ||
      (['INPUT', 'SELECT', 'TEXTAREA'] satisfies [string, string, string]).includes(
        typeof target.tagName === 'string' ? target.tagName : '',
      ));
  function update() {
    if (panel.hidden) return;
    const teleportHidden = !canTeleport();
    if (teleportButton.hidden !== teleportHidden) teleportButton.hidden = teleportHidden;
    const build = getServerBuild();
    const commit = build?.commit ?? '';
    const shortCommit = commit.slice(0, 12) || '—';
    const reportedVersion = build?.version ?? '';
    const version = /^\d+\.\d+\.\d+$/.test(reportedVersion) ? reportedVersion : '—';
    const fingerprint = build?.fingerprint ?? (version === '—' ? reportedVersion : '');
    if (serverCommitOutput.title !== commit) serverCommitOutput.title = commit;
    if (serverCommitOutput.textContent !== shortCommit)
      serverCommitOutput.textContent = shortCommit;
    if (serverVersionOutput.textContent !== version) serverVersionOutput.textContent = version;
    if (serverVersionOutput.title !== fingerprint) serverVersionOutput.title = fingerprint;
    const p = getPosition();
    for (const [out, value] of [
      [xOutput, p.x],
      [yOutput, p.y],
    ] as const) {
      const text = value.toFixed(3);
      if (out.textContent !== text) out.textContent = text;
    }
    if (fpsOutput) {
      const value = getFPS(),
        text = value > 0 ? value.toFixed(1) : '—';
      if (fpsOutput.textContent !== text) fpsOutput.textContent = text;
    }
    for (const [key, text] of Object.entries(getPerformance())) {
      const output = performanceOutputs[key];
      if (output && output.textContent !== text) output.textContent = text;
    }
  }
  function closeCommand(focus = true) {
    form.hidden = true;
    matches = [];
    suggestions.hidden = true;
    if (focus) focusWorld();
  }
  function openCommand(value = ':') {
    beforeOpen();
    form.hidden = false;
    input.value = value;
    refreshSuggestions();
    historyIndex = history.length;
    draft = value;
    input.focus({ preventScroll: true });
    input.setSelectionRange(value.length, value.length);
  }
  function openTeleport() {
    if (!canTeleport()) return false;
    const p = getPosition();
    openCommand(':tp ' + Number(p.x.toFixed(4)) + ',' + Number(p.y.toFixed(4)));
    return true;
  }
  function execute() {
    const value = input.value,
      command = parseWorldCommand(value);
    if ('error' in command) {
      status.textContent = command.error;
      status.dataset.error = 'true';
      input.focus();
      return false;
    }
    const result =
      command.type === 'debug'
        ? {
            ok: true,
            message: contentText('world-message.src.debug-console.debug-coordinates-enabled'),
          }
        : teleport(command.x, command.y);
    if (!result.ok) {
      status.textContent = result.message || 'Command failed.';
      status.dataset.error = 'true';
      input.focus();
      return false;
    }
    if (history.at(-1) !== value) history.push(value);
    if (history.length > 30) history.shift();
    if (command.type === 'debug') panel.hidden = false;
    update();
    onMessage(result.message || contentText('world-message.src.debug-console.command-completed'));
    closeCommand();
    return true;
  }
  function handleKey(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
    if (!form.hidden && event.target === input) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCommand();
      } else if (matches.length && ['Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Tab') chooseNPC(matches[selected]);
        else {
          selected = (selected + (event.key === 'ArrowUp' ? -1 : 1) + matches.length) % matches.length;
          renderSuggestions();
        }
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex === history.length) draft = input.value;
        historyIndex = Math.max(
          0,
          Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)),
        );
        input.value = history[historyIndex] ?? draft;
        refreshSuggestions();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      return true;
    }
    if (event.key === ':' && !event.repeat && !editing(event.target)) {
      event.preventDefault();
      openCommand();
      return true;
    }
    return false;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    execute();
  });
  input.addEventListener('input', refreshSuggestions);
  requiredValue(
    form.querySelector('[data-command-close]'),
    'Command close button',
  ).addEventListener('click', () => closeCommand());
  requiredValue(panel.querySelector('[data-debug-close]'), 'Debug close button').addEventListener(
    'click',
    () => {
      panel.hidden = true;
      focusWorld();
    },
  );
  teleportButton.addEventListener('click', openTeleport);
  document.addEventListener('pointerdown', (event) => {
    if (!form.hidden && !form.contains(event.target as Node | null)) closeCommand(false);
  });
  return {
    handleKey,
    openCommand,
    openTeleport,
    update,
    close() {
      panel.hidden = true;
      closeCommand(false);
    },
  };
}
