import type { ContentEntity, Place } from './types/world.ts';
import { applyEntityEdits } from './world-edits.ts';

type ActionTarget = Omit<ContentEntity, 'id'> & {
  id?: string | number;
  kind?: string;
  mobile?: boolean;
};
export type ActionLabelTarget = { label: string; kind: string };

/** Mobile actors use NPC colors even when their interactions are represented
 * as sights. Animated scenery and collectable items retain their own colors. */
const mobileActionKinds = new Set([
  'waymo',
  'robotaxi',
  'bus',
  'canoe',
  'animals',
  'wildlife',
  'whale',
  'ducks',
  'bunny',
  'guest',
  'goose-cage',
  'skate-dog',
  'wild-tiger',
  'bike',
  'motorcycle',
  'pequod',
] satisfies string[]);
export function actionTargetKind(target: ActionTarget = {}) {
  applyEntityEdits(target, target.editorKey || 'sight:' + target.id);
  if (target.kind === 'loot' || target.kind === 'sand' || target.kind === 'sunglasses')
    return 'item';
  if (mobileActionKinds.has(target.kind || '')) return 'npc';
  if (target.editorCategory) return target.editorCategory;
  return target.mobile ? 'npc' : 'object';
}

export function placeEntryVerb(
  place: Pick<Place, 'id' | 'searchHome' | 'activityBuilding'>,
  interior: Pick<Place, 'id'> | null,
) {
  if (place.id !== interior?.id) return 'Enter';
  return place.searchHome || place.activityBuilding ? null : 'Browse';
}

/** Keep the world action first, even when the authored menu omits it. */
export function orderPrimaryActions(
  menu: HTMLElement,
  primary: HTMLButtonElement,
  next: readonly string[] = [],
) {
  const buttons = [...menu.querySelectorAll('button')];
  const preferred = [
    primary,
    ...next.flatMap((id) => {
      const button = buttons.find((candidate) => candidate.dataset.actionId === id);
      return button && button !== primary ? [button] : [];
    }),
  ];
  let first: ChildNode | null = buttons[0] ?? null;
  for (const button of preferred) {
    if (button !== first) menu.insertBefore(button, first);
    first = button.nextElementSibling;
  }
}

/** Style action and target independently, using text nodes rather than HTML. */
export function setActionText(
  element: HTMLElement,
  text: string,
  targets: readonly ActionLabelTarget[] = [],
  fallback?: ActionLabelTarget,
) {
  element.replaceChildren();
  const match = targets
    .filter((t) => t.label)
    .map((target) => {
      const literal = target.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp('(?<![\\p{L}\\p{N}])' + literal + '(?![\\p{L}\\p{N}])', 'iu').exec(
        text,
      );
      return match && { target, text: match[0], at: match.index };
    })
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b.text.length - a.text.length)[0];
  const span = (value: string, className: string) => {
    const part = document.createElement('span');
    part.className = className;
    part.textContent = value;
    element.append(part);
    return part;
  };
  const target = match?.target ?? fallback;
  if (!target?.label) {
    span(text, 'sf-action-verb');
    return;
  }
  const nameText = match?.text ?? target.label;
  const prefix = match ? text.slice(0, match.at) : text + ' · ';
  if (prefix) span(prefix, 'sf-action-verb');
  const level = target.kind === 'npc' ? nameText.match(/(?: \(Level \d+\)| - Level \d+)$/i) : null;
  const name = span(level ? nameText.slice(0, -level[0].length) : nameText, 'sf-action-target');
  name.dataset.kind = target.kind;
  if (level) span(level[0], 'sf-action-verb sf-action-level');
  if (match && match.at + match.text.length < text.length)
    span(text.slice(match.at + match.text.length), 'sf-action-verb');
}
