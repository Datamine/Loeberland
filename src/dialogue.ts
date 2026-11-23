import { contentText } from './content-runtime.ts';
import type {
  RuntimeDialogue,
  RuntimeChoice,
  ActionReceipt,
  ContentEntity,
} from './types/world.ts';
interface DialogueOptions {
  element: HTMLElement;
  journal: HTMLElement;
  log: HTMLElement;
  trade: (id: string) => ActionReceipt | Promise<ActionReceipt>;
  canInteract?: () => boolean;
  announce: (message: string, speaker?: string) => void;
  onClose?: () => void;
  getPlayer?: () => ContentEntity;
}
// CONTENT-BINDINGS-MIGRATED
import { drawPlayerChatHead } from './chat-head.ts';
import { dialogueChoices } from './dialogue-choices.ts';

/** Dialogue UI owns presentation only; choices bind to authoritative actions.
 * A follow-up animation/menu starts only on a receipt's explicit OK, never on
 * Leave, Escape, replacement by another conversation, or a stale async reply. */
export function createDialogue({
  element,
  journal,
  log,
  trade,
  canInteract = () => false,
  announce,
  onClose = () => {},
  getPlayer = () => ({}),
}: DialogueOptions) {
  let current: RuntimeDialogue | null = null,
    drawNPC: ((canvas: HTMLCanvasElement) => void) | undefined,
    stage = 'intro',
    committed = false,
    amount: { choice: RuntimeChoice; value: string } | null = null,
    after: (() => void) | null = null,
    receiptRepeat: boolean | undefined = false,
    session = 0;
  const close = () => {
    session++;
    after = null;
    element.hidden = true;
    journal.classList.remove('sf-conversing');
    log.hidden = false;
    current = null;
    drawNPC = undefined;
    amount = null;
    onClose();
  };
  const cancel = close;
  const finish = () => {
    const action = after;
    close();
    if (canInteract()) action?.();
  };
  function button(label: string | null, fn: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (canInteract()) fn();
      else cancel();
    });
    return b;
  }
  function choicesFor(node: RuntimeDialogue) {
    return dialogueChoices(node);
  }
  function branch(node: RuntimeDialogue) {
    // Identity/portrait are inherited; purchases, receipts and choices are
    // not. A submenu can never accidentally execute its parent's action.
    const person = { ...current };
    for (const key of [
      'intro',
      'question',
      'choices',
      'choice',
      'accept',
      'trade',
      'receipt',
      'skipIntro',
    ] as const)
      delete person[key];
    current = { ...person, ...node };
    stage = node.skipIntro ? 'choices' : 'intro';
    committed = false;
    after = null;
    render();
  }
  function receive(choice: RuntimeChoice, result: ActionReceipt | void = { ok: true }) {
    result ??= { ok: true };
    if (amount?.choice === choice && !result.ok) {
      stage = 'amount';
      committed = false;
      render(result.message || 'Unable to complete the payment. Please try again.');
      return;
    }
    if (!result.pending) amount = null;
    if (result.ok && result.after) after = result.after;
    receiptRepeat = choice.repeat ?? current?.repeat;
    stage = result.pending ? 'pending' : 'receipt';
    const message = result.ok
      ? (choice.serverReceipt ? result.message : choice.receipt) ||
        result.message ||
        current?.receipt ||
        contentText('world-message.src.dialogue.done')
      : result.message || contentText('world-message.src.dialogue.unable-to-complete-that-action');
    const text =
      message + (result.ok && result.bonus ? ' iPhone bonus: +' + result.bonus + ' coins.' : '');
    if (result.ok && (choice.serverReceipt || result.healed) && result.message)
      announce(result.message, 'You');
    render(text);
  }
  function choose(choice: RuntimeChoice) {
    if (choice.next) {
      branch(choice.next);
      return;
    }
    if (choice.amount) {
      amount = { choice, value: '' };
      stage = 'amount';
      render();
      return;
    }
    commit(choice, () =>
      choice.accept ? choice.accept() : choice.trade ? trade(choice.trade) : { ok: true },
    );
  }
  function commit(choice: RuntimeChoice, run: () => ActionReceipt | Promise<ActionReceipt> | void) {
    if (committed) return;
    committed = true;
    try {
      const result = run();
      if (result instanceof Promise || result?.promise) {
        stage = 'pending';
        render('Waiting for the server…');
        const pending = result instanceof Promise ? result : result.promise!,
          deferred = result instanceof Promise ? undefined : result.after,
          selected = current,
          opened = session;
        Promise.resolve(pending)
          .then((receipt) => {
            if (session !== opened || current !== selected || stage !== 'pending' || !canInteract())
              return;
            receive(choice, {
              ...receipt,
              ...(receipt?.ok && (receipt.after || deferred)
                ? { after: receipt.after || deferred }
                : {}),
            });
          })
          .catch(() => {
            if (session === opened && current === selected && canInteract())
              receive(choice, {
                ok: false,
                message: contentText(
                  'world-message.src.dialogue.unable-to-complete-that-action-please-try-again',
                ),
              });
          });
      } else receive(choice, result);
    } catch (error) {
      console.error('Dialogue action:', error);
      receive(choice, {
        ok: false,
        message: contentText(
          'world-message.src.dialogue.unable-to-complete-that-action-please-try-again',
        ),
      });
    }
  }
  function renderAmount(draft: NonNullable<typeof amount>, message?: string) {
    const entry = draft.choice.amount!;
    const busy = stage === 'pending';
    const form = document.createElement('form');
    form.className = 'sf-chat-amount';
    form.noValidate = true;
    const label = document.createElement('label');
    label.textContent = entry.prompt;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = draft.value;
    input.disabled = busy;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!event.repeat) form.requestSubmit();
    });
    label.append(input);
    form.append(label);
    if (message) {
      const status = document.createElement('small');
      status.setAttribute('role', 'status');
      status.textContent = message;
      form.append(status);
    }
    const actions = document.createElement('div');
    actions.className = 'sf-chat-options';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = draft.choice.label;
    submit.disabled = busy;
    actions.append(
      submit,
      busy
        ? button('Keep exploring', cancel)
        : button('Back', () => {
            amount = null;
            stage = 'choices';
            render();
          }),
    );
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (amount !== draft || stage !== 'amount' || committed) return;
      if (!canInteract()) {
        cancel();
        return;
      }
      draft.value = input.value;
      const text = input.value.trim();
      const coins = Number(text);
      if (!/^\d+$/.test(text) || !Number.isSafeInteger(coins) || coins < 1) {
        render(contentText('world-message.biomed.amount'));
        return;
      }
      commit(draft.choice, () => entry.submit(coins));
    });
    return form;
  }
  function render(message?: string) {
    if (!current) return;
    element.replaceChildren();
    const player = stage === 'choices',
      person = player ? getPlayer() : current;
    const portrait = document.createElement('div');
    portrait.className = 'sf-chat-head';
    const name = document.createElement('strong');
    name.className = 'sf-chat-name';
    name.textContent = person.name || person.label || (player ? 'You' : 'Someone');
    const face = document.createElement('div');
    face.className = 'sf-chat-portrait';
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 188;
    canvas.setAttribute('aria-hidden', 'true');
    if (player || drawNPC) {
      face.append(canvas);
      if (player) drawPlayerChatHead(canvas, person);
      else drawNPC?.(canvas);
    } else face.hidden = true;
    portrait.append(name, face);
    const copy = document.createElement('div');
    copy.className = 'sf-chat-copy';
    if (!player && !amount) {
      const text = document.createElement('p'),
        body = message ?? current.intro ?? '';
      text.textContent = typeof body === 'function' ? body() : body;
      copy.append(text);
    }
    const controls = document.createElement('div');
    controls.className = 'sf-chat-options';
    if (amount) {
      copy.append(renderAmount(amount, message));
    } else if (stage === 'choices') {
      for (const choice of choicesFor(current)) {
        if (/^(?:i should get going[.!]?|leave[.!]?|goodbye[.!]?)$/i.test(choice.label.trim()))
          continue;
        controls.append(button(choice.label, () => choose(choice)));
      }
      controls.append(button(current.decline || 'Leave', cancel));
    } else if (stage === 'pending') {
      const thinking = button('Thinking…', () => {});
      thinking.disabled = true;
      controls.append(thinking, button('Keep exploring', cancel));
    } else {
      controls.append(
        button(stage === 'intro' && choicesFor(current!).length ? 'Respond' : 'OK', () => {
          if (stage === 'intro' && choicesFor(current!).length) {
            stage = 'choices';
            render();
          } else if (stage === 'receipt' && !after && receiptRepeat) {
            stage = 'choices';
            committed = false;
            render();
          } else finish();
        }),
      );
      if (
        (stage === 'intro' && choicesFor(current!).length) ||
        (stage === 'receipt' && receiptRepeat && !after)
      )
        controls.append(button('Leave', cancel));
    }
    if (!amount) copy.append(controls);
    element.dataset.speaker = player ? 'player' : 'npc';
    element.append(portrait, copy);
    const input = amount && !committed ? element.querySelector('input') : null;
    (input || element.querySelector<HTMLButtonElement>('button:not([disabled])'))?.focus({
      preventScroll: true,
    });
  }
  function open(person: RuntimeDialogue, portrait?: (canvas: HTMLCanvasElement) => void) {
    if (!canInteract()) return false;
    session++;
    current = person;
    drawNPC = portrait;
    stage = 'intro';
    committed = false;
    amount = null;
    after = null;
    receiptRepeat = false;
    log.hidden = true;
    element.hidden = false;
    journal.classList.add('sf-conversing');
    render();
    return true;
  }
  function handleKey(
    event: Pick<KeyboardEvent, 'key' | 'preventDefault'> &
      Partial<Pick<KeyboardEvent, 'repeat' | 'shiftKey'>>,
  ) {
    if (!current || !canInteract()) return false;
    const key = event.key.toLowerCase(),
      buttons = [...element.querySelectorAll<HTMLButtonElement>('button:not([disabled])')],
      index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const input = amount && stage === 'amount' ? element.querySelector('input') : null;
    if (input && document.activeElement === input && key !== 'tab') return true;
    if (
      (
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] satisfies [
          string,
          string,
          string,
          string,
        ]
      ).includes(key)
    ) {
      event.preventDefault();
      const step = key === 'arrowup' || key === 'arrowleft' ? -1 : 1;
      buttons[index < 0 ? 0 : (index + step + buttons.length) % buttons.length]?.focus({
        preventScroll: true,
      });
      return true;
    }
    if (key === 'enter') {
      event.preventDefault();
      if (!event.repeat) (buttons[index] || buttons[0])?.click();
      return true;
    }
    if (key === 'tab') {
      const first = input || buttons[0];
      if (
        (event.shiftKey && document.activeElement === first) ||
        (event.shiftKey && index < 0 && !input) ||
        (!event.shiftKey && index === buttons.length - 1)
      ) {
        event.preventDefault();
        (event.shiftKey ? buttons.at(-1) : first)?.focus({ preventScroll: true });
      }
      return true;
    }
    return false;
  }
  function resolvePending(id: string, message: string | undefined) {
    if (!canInteract() || current?.id !== id || stage !== 'pending') return false;
    stage = 'receipt';
    amount = null;
    receiptRepeat = current.repeat;
    render(message);
    return true;
  }
  return {
    open,
    close,
    cancel,
    handleKey,
    resolvePending,
    get active() {
      return !!current;
    },
  };
}
