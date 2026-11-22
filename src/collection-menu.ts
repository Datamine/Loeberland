interface CollectionMenuOptions {
  element: HTMLElement;
  content: HTMLElement;
  summary: HTMLElement;
  button: HTMLElement;
  closeButton: HTMLElement;
  shade: HTMLElement;
  canvas: HTMLElement;
  getFound: () => readonly string[];
  beforeOpen: () => void;
}
import { COLLECTION_GROUPS, COLLECTION_ITEMS } from './config/collection.ts';

/** A record of discoveries, without revealing their locations. */
export function createCollectionMenu({
  element,
  content,
  summary,
  button,
  closeButton,
  shade,
  canvas,
  getFound,
  beforeOpen,
}: CollectionMenuOptions) {
  function render() {
    const found = new Set(getFound()),
      fragment = document.createDocumentFragment();
    let count = 0;
    for (const [group, name] of Object.entries(COLLECTION_GROUPS)) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      const list = document.createElement('ul');
      const items = COLLECTION_ITEMS.filter((item) => item.group === group);
      let discovered = 0;
      for (const item of items) {
        const row = document.createElement('li');
        const owned = found.has(item.id);
        if (owned) discovered++;
        row.dataset.found = String(owned);
        row.textContent = owned ? '✓ ' + item.name : '○ Undiscovered';
        list.append(row);
      }
      heading.textContent = name + ' · ' + discovered + ' / ' + items.length;
      section.append(heading, list);
      fragment.append(section);
      count += discovered;
    }
    content.replaceChildren(fragment);
    summary.textContent = count + ' / ' + COLLECTION_ITEMS.length + ' discovered';
  }
  function close() {
    if (element.hidden) return;
    element.hidden = true;
    shade.hidden = true;
    canvas.focus({ preventScroll: true });
  }
  function open() {
    beforeOpen();
    render();
    element.hidden = false;
    shade.hidden = false;
    closeButton.focus({ preventScroll: true });
  }
  button.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  shade.addEventListener('click', close);
  return {
    open,
    close,
    render,
    get active() {
      return !element.hidden;
    },
  };
}
