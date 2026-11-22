import type { UsernameClient } from './username-form.ts';
import { errorMessage } from './types/json.ts';
import { createLoadingNPC } from './loading-npc.ts';
import { createUsernameForm } from './username-form.ts';

/** Percentages describe completed initialization stages, never a timer. */
export const nextLoadingPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
export function createLoadingScreen(element: HTMLElement) {
  let percent = 0,
    npc:
      | ({
          start: () => void;
          stop: () => void;
          dispose: () => void;
          draw: (seconds: number) => void;
        } | null)
      | null = null,
    client: UsernameClient | null = null,
    ready = false,
    entering = false,
    timer: ReturnType<typeof setInterval> | null = null,
    unsubscribe: (() => void) | null = null,
    resolveReady: (() => void) | null = null,
    readyPromise: Promise<void> | null = null;
  const form = element.querySelector<HTMLFormElement>('[data-loading-username]'),
    play = element.querySelector<HTMLButtonElement>('[data-loading-play]');
  const loginLink = element.querySelector<HTMLButtonElement>('[data-character-login-link]');
  const loginForm = element.querySelector<HTMLFormElement>('[data-character-login]');
  const clock = element.querySelector<HTMLElement>('[data-loading-clock]');
  loginLink?.addEventListener('click', () => {
    loginForm!.hidden = !loginForm!.hidden;
    if (!loginForm!.hidden) loginForm!.querySelector('input')?.focus();
  });
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client?.state.connected || entering) return;
    const data = new FormData(loginForm);
    const status = loginForm.querySelector<HTMLElement>('[data-login-status]')!;
    entering = true;
    updatePlay();
    try {
      const result = await client.command('characterLogin', {
        name: String(data.get('username')).trim(),
        password: data.get('password'),
      });
      if (result.ok && result.loginToken) {
        localStorage.setItem('sf-mp-identity', result.loginToken);
        sessionStorage.setItem('sf-resume-character', '1');
        location.reload();
      } else status.textContent = result.message || 'Unable to log in.';
    } finally {
      entering = false;
      updatePlay();
    }
  });
  let username: ReturnType<typeof createUsernameForm> | null = null;
  username = form ? createUsernameForm(form, { allowBlank: true, onChange: updatePlay }) : null;
  function updatePlay() {
    if (form) form.hidden = client?.state.returningCharacter === true;
    const login = loginForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (login) login.disabled = entering || !client?.state.connected;
    if (play) play.disabled = !ready || entering || username?.pending || !client?.state.connected;
  }
  function report(value: number, label: string) {
    percent = Math.max(percent, Math.min(100, Math.round(value)));
    element.querySelector<HTMLElement>('[data-loading-percent]')!.textContent =
      percent + '% loaded';
    element.querySelector<HTMLElement>('[data-loading-stage]')!.textContent = label;
    element.querySelector<HTMLElementTagNameMap['progress']>('progress')!.value = percent;
    username?.update();
    updatePlay();
  }
  function updateClock() {
    if (!clock) return;
    const time = new Date();
    clock.style.setProperty(
      '--hour',
      ((time.getHours() % 12) + time.getMinutes() / 60) * 30 + 'deg',
    );
    clock.style.setProperty('--minute', (time.getMinutes() + time.getSeconds() / 60) * 6 + 'deg');
    clock.style.setProperty('--second', time.getSeconds() * 6 + 'deg');
  }
  function hide() {
    npc?.stop();
    element.hidden = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
    ready = false;
    const resolve = resolveReady;
    resolveReady = null;
    readyPromise = null;
    resolve?.();
  }
  function show() {
    percent = 0;
    ready = false;
    element.hidden = false;
    delete element.dataset.failed;
    element.querySelector<HTMLElement>('[data-loading-error]')!.textContent = '';
    if (play) play.hidden = true;
    if (loginLink) loginLink.hidden = true;
    if (loginForm) {
      loginForm.hidden = true;
      loginForm.reset();
    }
    const retry = element.querySelector<HTMLButtonElement>('[data-refresh-map]');
    if (retry) retry.hidden = true;
    npc ??= createLoadingNPC(element.querySelector<HTMLCanvasElement>('[data-loading-npc]'));
    npc?.start();
    report(0, 'Preparing San Francisco…');
    updateClock();
    timer ??= setInterval(() => {
      updateClock();
      username?.update();
      updatePlay();
    }, 1000);
    if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
  }
  play?.addEventListener('click', async () => {
    if (!ready || entering || !client?.state.connected) return;
    entering = true;
    updatePlay();
    try {
      const result = client.state.returningCharacter ? { ok: true } : await username!.save();
      if (result.ok && client.state.connected) hide();
    } finally {
      entering = false;
      updatePlay();
    }
  });
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const fields = [
        ...element.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button'),
      ].filter((n) => !n.disabled && !n.hidden && !n.closest('[hidden]')),
      index = fields.findIndex((field) => field === document.activeElement);
    if (
      fields.length &&
      (index < 0 ||
        (event.shiftKey && index === 0) ||
        (!event.shiftKey && index === fields.length - 1))
    ) {
      event.preventDefault();
      fields[event.shiftKey ? fields.length - 1 : 0].focus();
    }
  });
  return {
    hide,
    show,
    report,
    get visible() {
      return !element.hidden;
    },
    bindClient(value: UsernameClient | null) {
      unsubscribe?.();
      client = value;
      username?.setClient(value);
      unsubscribe =
        client?.subscribe(() => {
          updatePlay();
          if (!client?.state.connected) hide();
        }) ?? null;
      updatePlay();
    },
    async stage(value: number, label: string) {
      report(value, label);
      await nextLoadingPaint();
    },
    async done() {
      if (element.hidden) return;
      report(100, 'Ready to play');
      await nextLoadingPaint();
      const resume = globalThis.sessionStorage?.getItem('sf-resume-character') === '1';
      globalThis.sessionStorage?.removeItem('sf-resume-character');
      if (!play || resume) {
        hide();
        return;
      }
      ready = true;
      play.hidden = false;
      if (loginLink) loginLink.hidden = false;
      updatePlay();
      readyPromise ??= new Promise((resolve) => (resolveReady = resolve));
      await readyPromise;
    },
    fail(error: unknown) {
      npc?.stop();
      if (timer !== null) clearInterval(timer);
      timer = null;
      ready = false;
      if (play) play.hidden = true;
      if (loginLink) loginLink.hidden = true;
      if (loginForm) {
        loginForm.hidden = true;
        loginForm.reset();
      }
      element.hidden = false;
      element.dataset.failed = 'true';
      element.querySelector<HTMLElement>('[data-loading-stage]')!.textContent =
        'Loading failed. Reload to try again.';
      element.querySelector<HTMLElement>('[data-loading-error]')!.textContent = errorMessage(error);
      const retry = element.querySelector<HTMLButtonElement>('[data-refresh-map]');
      if (retry) retry.hidden = false;
    },
  };
}
