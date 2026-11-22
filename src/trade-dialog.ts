import type { createMultiplayerClient } from './multiplayer-client.ts';
import type { Appearance } from './types/content.ts';
import type { TradeLine, TradeView } from './types/trade.ts';

export function bindTradeDialog(
  panel: HTMLDialogElement,
  client: ReturnType<typeof createMultiplayerClient>,
  {
    opened,
    message,
    appearance,
  }: {
    opened: () => void;
    message: (text: string) => void;
    appearance: (look: Appearance) => void;
  },
) {
  const title = panel.querySelector('h2')!;
  const status = panel.querySelector<HTMLElement>('[role="status"]')!;
  const offers = panel.querySelector<HTMLElement>('.sf-trade-offers')!;
  const [yourList, theirList] = offers.querySelectorAll('ul');
  const [yourTitle, theirTitle] = offers.querySelectorAll('h3');
  const [yourStatus, theirStatus] = offers.querySelectorAll('small');
  const form = panel.querySelector('form')!;
  const picker = form.querySelector('select')!;
  const quantity = form.querySelector<HTMLInputElement>('input')!;
  const add = form.querySelector('button')!;
  const accept = panel.querySelector<HTMLButtonElement>('[data-trade-accept]')!;
  const confirm = panel.querySelector<HTMLButtonElement>('[data-trade-confirm]')!;
  const cancel = panel.querySelector<HTMLButtonElement>('[data-trade-cancel]')!;
  const format = new Intl.NumberFormat();
  let view: TradeView | null = null;
  let pending = false;

  function quantities() {
    const item = view?.available.find((item) => item.id === picker.value);
    const offered = view?.you.offer.find((entry) => entry.id === picker.value)?.quantity || 0;
    const left = Math.max(0, (item?.quantity || 0) - offered);
    quantity.min = String(item?.wholeHolding ? left : 1);
    quantity.max = String(left);
    quantity.disabled = pending || !left || !!item?.wholeHolding;
    add.disabled = pending || !left;
    if (item?.wholeHolding) quantity.value = String(left);
    else if (!quantity.value || quantity.valueAsNumber < 1 || quantity.valueAsNumber > left)
      quantity.value = '1';
  }
  function render() {
    if (!view) return;
    const { partner, you, requester } = view;
    const open = view.phase === 'open';
    title.textContent = 'Trade with ' + partner.name;
    status.textContent = open
      ? ''
      : requester
        ? 'Waiting for ' + partner.name + ' to accept.'
        : partner.name + ' would like to trade.';
    offers.hidden = form.hidden = !open;
    accept.hidden = open || requester;
    accept.disabled = pending;
    confirm.hidden = !open;
    confirm.disabled = pending || you.confirmed || !(you.offer.length || partner.offer.length);
    confirm.textContent = you.confirmed ? 'Confirmed' : 'Confirm trade';
    cancel.textContent = open || requester ? 'Cancel trade' : 'Decline';
    if (!open) return;
    yourTitle.textContent = 'Your offer';
    theirTitle.textContent = partner.name + '’s offer';
    yourStatus.textContent = you.confirmed ? 'Confirmed' : 'Awaiting confirmation';
    theirStatus.textContent = partner.confirmed ? 'Confirmed' : 'Awaiting confirmation';
    for (const [list, side] of [
      [yourList, you],
      [theirList, partner],
    ] as const) {
      list.replaceChildren();
      if (!side.offer.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No items offered';
        list.append(empty);
      }
      for (const item of side.offer) {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = item.name + ' × ' + format.format(item.quantity);
        row.append(name);
        if (side === you) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = 'Remove';
          remove.setAttribute('aria-label', 'Remove ' + item.name);
          remove.disabled = pending;
          remove.addEventListener('click', () =>
            edit(you.offer.filter(({ id }) => id !== item.id)),
          );
          row.append(remove);
        }
        list.append(row);
      }
    }
    const previous = picker.value;
    const stock = view.available.filter(
      (item) =>
        (!item.wholeHolding || !you.offer.some((entry) => entry.id === item.id)) &&
        item.quantity > (you.offer.find((entry) => entry.id === item.id)?.quantity || 0),
    );
    picker.replaceChildren();
    for (const item of stock) {
      const offered = you.offer.find((entry) => entry.id === item.id)?.quantity || 0;
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent =
        item.name + ' (' + format.format(item.quantity - offered) + ' available)';
      picker.append(option);
    }
    if (stock.some((item) => item.id === previous)) picker.value = previous;
    picker.disabled = pending || !stock.length;
    quantities();
  }
  async function send(action: string, args: object = {}) {
    if (!view || pending) return;
    const { id: trade, revision } = view;
    pending = true;
    render();
    const result = await client.command(action, { ...args, trade, revision });
    if (view?.id !== trade) return;
    pending = false;
    render();
    if (!result.ok) status.textContent = result.message || 'That action could not be completed.';
  }
  function edit(items: TradeLine[]) {
    send('tradeOffer', { items: items.map(({ id, quantity }) => ({ id, quantity })) });
  }
  function close() {
    if (panel.open) panel.close();
    view = null;
    pending = false;
  }
  function cancelTrade() {
    const trade = view?.id;
    close();
    if (trade) client.command('tradeCancel', { trade });
  }
  picker.addEventListener('change', () => {
    quantity.value = '1';
    quantities();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!view || add.disabled) return;
    const id = picker.value;
    const count = quantity.valueAsNumber;
    if (!Number.isSafeInteger(count) || count < 1) return;
    const current = view.you.offer.find((line) => line.id === id)?.quantity || 0;
    edit([...view.you.offer.filter((line) => line.id !== id), { id, quantity: current + count }]);
  });
  accept.addEventListener('click', () => send('tradeJoin'));
  confirm.addEventListener('click', () => send('tradeConfirm'));
  cancel.addEventListener('click', cancelTrade);
  panel.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelTrade();
  });
  client.subscribe((event) => {
    if (event.type === 'tradeView') {
      view = event.trade;
      render();
      if (!panel.open) {
        opened();
        panel.showModal();
      }
    } else if (event.type === 'tradeClosed') {
      if (event.completed && event.appearance) appearance(event.appearance);
      if (view?.id === event.id) close();
      message(event.message);
    } else if (event.type === 'welcome') close();
  });
}
