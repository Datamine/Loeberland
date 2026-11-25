import { MP_CHARACTER_VERIFICATION_PATH } from './multiplayer-protocol.ts';
import { isRecord } from './types/json.ts';

export function showCharacterVerification(
  endpoint: string,
  challenge: string,
  {
    signal,
    submit,
    cancel,
  }: {
    signal: AbortSignal;
    submit: (response: string) => void;
    cancel: () => void;
  },
) {
  const url = new URL(MP_CHARACTER_VERIFICATION_PATH, endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.searchParams.set('parent', location.origin);
  url.searchParams.set('challenge', challenge);

  const dialog = document.createElement('dialog');
  dialog.className = 'sf-character-verification';
  dialog.setAttribute('aria-label', 'Verify to create a character');
  const title = document.createElement('h2');
  title.textContent = 'Verify to create a character';
  const frame = document.createElement('iframe');
  frame.title = 'Character verification';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Cancel';
  button.addEventListener('click', cancel);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancel();
  });

  window.addEventListener(
    'message',
    (event) => {
      const data: unknown = event.data;
      if (event.origin !== url.origin || event.source !== frame.contentWindow || !isRecord(data))
        return;
      if (
        data.type === 'characterVerification' &&
        typeof data.response === 'string' &&
        data.response.length > 0 &&
        data.response.length <= 2048
      )
        submit(data.response);
    },
    { signal },
  );
  signal.addEventListener(
    'abort',
    () => {
      dialog.close();
      dialog.remove();
    },
    { once: true },
  );
  frame.src = url.href;
  dialog.append(title, frame, button);
  document.body.append(dialog);
  dialog.showModal();
}
