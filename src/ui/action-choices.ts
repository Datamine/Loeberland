interface ActionChoices {
  trigger: HTMLButtonElement;
  group: HTMLElement;
  choose: (button: HTMLButtonElement) => void;
  stand?: () => boolean;
}

export function bindActionChoices(root: HTMLElement, pickers: ActionChoices[]) {
  const document = root.ownerDocument,
    viewport = document.defaultView!;
  let open: ActionChoices | null = null,
    pinned = false,
    dismissTimer: number | undefined;
  const choices = (picker: ActionChoices) => [
    ...picker.group.querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)'),
  ];

  function cancelDismiss() {
    viewport.clearTimeout(dismissTimer);
  }

  function close(restoreFocus = false) {
    cancelDismiss();
    if (!open) return;
    const { trigger, group } = open;
    open = null;
    pinned = false;
    group.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function dismissOnLeave() {
    cancelDismiss();
    if (!pinned) dismissTimer = viewport.setTimeout(() => close(), 160);
  }

  function position({ trigger, group }: ActionChoices) {
    const anchor = trigger.getBoundingClientRect(),
      popup = group.getBoundingClientRect(),
      edge = 8,
      gap = 4;
    const left = Math.max(edge, Math.min(anchor.left, viewport.innerWidth - popup.width - edge));
    const above = anchor.top - popup.height - gap,
      below = anchor.bottom + gap;
    const top = above >= edge || below + popup.height > viewport.innerHeight - edge ? above : below;
    group.style.left = left + 'px';
    group.style.top = Math.max(edge, top) + 'px';
  }

  function show(picker: ActionChoices) {
    cancelDismiss();
    if (open === picker) return;
    close();
    open = picker;
    picker.group.showPopover();
    position(picker);
    picker.trigger.setAttribute('aria-expanded', 'true');
  }

  for (const picker of pickers) {
    const { trigger, group } = picker;
    trigger.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && !trigger.hasAttribute('data-sitting') && !pinned)
        show(picker);
    });
    trigger.addEventListener('pointerleave', dismissOnLeave);
    group.addEventListener('pointerenter', cancelDismiss);
    group.addEventListener('pointerleave', dismissOnLeave);
    trigger.addEventListener('click', () => {
      if (picker.stand?.()) {
        close();
        return;
      }
      if (open === picker && pinned) {
        close(true);
        return;
      }
      show(picker);
      pinned = true;
      choices(picker)[0]?.focus({ preventScroll: true });
    });
    for (const button of group.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        if (open !== picker || button.hidden || button.disabled) return;
        close(true);
        picker.choose(button);
      });
    }
  }
  root.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const options = choices(open);
    if (!options.length) return;
    const current = options.findIndex((button) => button === document.activeElement);
    const next = current === -1 && direction === -1 ? options.length - 1 : current + direction;
    options[(next + options.length) % options.length]?.focus({ preventScroll: true });
  });
  root.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (open && next !== open.trigger && !open.group.contains(next)) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target as Node | null)) close();
  });
  document.addEventListener(
    'scroll',
    (event) => {
      if (open && event.target !== open.group) close();
    },
    true,
  );
  viewport.addEventListener('resize', () => {
    if (open) position(open);
  });
}
