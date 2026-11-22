import type { ContentEntity, Place } from './types/world.ts';
type ActionTarget = Omit<ContentEntity, 'id'> & {
  id?: string | number;
  kind?: string;
  mobile?: boolean;
};
import { applyEntityEdits } from './world-edits.ts';

/** Mobile actors use NPC colors even when their interactions are represented
 * as sights. Animated scenery and collectable items retain their own colors. */
const mobileActionKinds = new Set([
  'waymo',
  'robotaxi',
  'bus',
  'canoe',
  'wildlife',
  'whale',
  'ducks',
  'bunny',
  'skate-dog',
  'bike',
  'motorcycle',
  'pequod',
] satisfies string[]);
export function actionTargetKind(target: ActionTarget = {}) {
  applyEntityEdits(target, target.editorKey || 'sight:' + target.id);
  if (target.kind === 'sunglasses' || target.kind === 'ferrari' || target.kind === 'called-waymo')
    return 'personal-item';
  if (target.editorCategory) return target.editorCategory;
  if ((['loot', 'sand'] satisfies [string, string]).includes(target.kind || '')) return 'item';
  return target.mobile || mobileActionKinds.has(target.kind || '') ? 'npc' : 'object';
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
  targets: readonly { label: string; kind: string }[] = [],
) {
  element.replaceChildren();
  const target = targets
    .filter((t) => t?.label && text.includes(t.label))
    .sort((a, b) => b.label.length - a.label.length)[0];
  const span = (value: string | null, className: string) => {
    const part = document.createElement('span');
    part.className = className;
    part.textContent = value;
    element.append(part);
    return part;
  };
  if (!target) {
    span(text, 'sf-action-verb');
    return;
  }
  const at = text.indexOf(target.label);
  if (at) span(text.slice(0, at), 'sf-action-verb');
  const level =
    target.kind === 'npc' ? target.label.match(/(?: \(Level \d+\)| - Level \d+)$/) : null;
  const name = span(
    level ? target.label.slice(0, -level[0].length) : target.label,
    'sf-action-target',
  );
  name.dataset.kind = target.kind;
  if (level) span(level[0], 'sf-action-verb sf-action-level');
  if (at + target.label.length < text.length)
    span(text.slice(at + target.label.length), 'sf-action-verb');
}
