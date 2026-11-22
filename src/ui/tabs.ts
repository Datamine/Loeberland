export function bindTabs(list: HTMLElement, onSelect?: (tab: HTMLButtonElement) => void) {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')!)!);

  function select(tab: HTMLButtonElement) {
    tabs.forEach((other, index) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
    onSelect?.(tab);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      let next: HTMLButtonElement;
      switch (event.key) {
        case 'ArrowRight':
          next = tabs[(index + 1) % tabs.length];
          break;
        case 'ArrowLeft':
          next = tabs[(index + tabs.length - 1) % tabs.length];
          break;
        case 'Home':
          next = tabs[0];
          break;
        case 'End':
          next = tabs[tabs.length - 1];
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next);
      next.focus();
    });
  });
}
