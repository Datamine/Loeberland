/** Minimal text-only DOM used to read the production menu builder in Node. */
export class MenuElement {
  tagName: string;
  value: string;
  children: MenuElement[];
  dataset: Record<string, string>;
  style: Record<string, string>;
  disabled: boolean;
  hidden: boolean;
  offsetWidth: number;
  offsetHeight: number;
  parent?: MenuElement;
  classList: { add(...names: string[]): void; remove(...names: string[]): void };

  constructor(tag = 'div', text = '') {
    this.tagName = tag;
    this.value = text;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = true;
    this.disabled = false;
    this.offsetWidth = 300;
    this.offsetHeight = 300;
    this.classList = { add() {}, remove() {} };
  }
  set textContent(value: string | null) {
    this.replaceChildren();
    this.value = String(value);
  }
  get textContent(): string {
    return this.value + this.children.map((n) => n.textContent).join('');
  }
  append(...nodes: MenuElement[]) {
    for (const node of nodes) this.insertBefore(node, null);
  }
  get firstChild() {
    return this.children[0];
  }
  get nextElementSibling(): MenuElement | null {
    const parent = this.parent;
    return parent?.children[parent.children.indexOf(this) + 1] || null;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = undefined;
  }
  replaceChildren(...nodes: MenuElement[]) {
    this.value = '';
    for (const child of this.children) child.parent = undefined;
    this.children = [];
    this.append(...nodes);
  }
  insertBefore(node: MenuElement, before: MenuElement | null) {
    if (node === before) return;
    node.remove();
    node.parent = this;
    const at = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(at, 0, node);
  }
  contains(node: MenuElement): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }
  setAttribute(key: string, value: unknown) {
    Reflect.set(this, key, value);
  }
  addEventListener(..._args: unknown[]) {}
  focus(..._args: unknown[]) {}
  querySelectorAll(selector: string): MenuElement[] {
    return this.children.flatMap((n) => [
      ...(n.tagName === 'button' && selector.startsWith('button') ? [n] : []),
      ...n.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string): MenuElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }
}
export function menuDocument() {
  const elements = new Map<string, MenuElement>();
  return {
    createElement: (tag: string | undefined) => new MenuElement(tag),
    createTextNode: (text: string | undefined) => new MenuElement('#text', text),
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, new MenuElement());
      return elements.get(id)!;
    },
  };
}
