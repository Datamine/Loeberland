import type { CommandResult, ServerEvent } from './types/network.ts';
interface ConnectionState {
  connected: boolean;
  configured?: boolean;
  status?: string;
  reloadOnWelcome?: boolean;
}
interface CommandClient {
  state: ConnectionState;
  command: (action: string, args?: object) => Promise<CommandResult>;
}
interface ConnectionClient {
  state: ConnectionState;
  subscribe: (listener: (message: ServerEvent) => void) => unknown;
}
interface ConnectionGateOptions {
  client: ConnectionClient | null;
  element: HTMLElement;
  world: HTMLElement;
  notice?: HTMLElement;
  onDisconnect?: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  locationObject?: Pick<Location, 'href'>;
}
import { multiplayerEndpoint } from './multiplayer-client.ts';
import { CHARACTER_BANNED_MESSAGE } from './multiplayer-protocol.ts';
import { contentText } from './content-runtime.ts';

export function serverConnected<T extends { state: { connected: boolean } }>(
  client: T | null | undefined,
): client is T {
  return client?.state.connected === true;
}
export function serverCommand(
  client: CommandClient | null,
  action: string,
  args: object = {},
): Promise<CommandResult> {
  return serverConnected(client)
    ? client.command(action, args)
    : Promise.resolve({ ok: false, message: contentText('world-message.connection.required') });
}

/** Pause gameplay while the server is unavailable or needs initial setup. */
export function createServerConnectionGate({
  client,
  element,
  world,
  notice,
  onDisconnect = () => {},
  storage = localStorage,
  locationObject = location,
}: ConnectionGateOptions) {
  const form = element.querySelector<HTMLElementTagNameMap['form']>('form')!,
    input = form.querySelector<HTMLElementTagNameMap['input']>('input')!,
    status = element.querySelector<HTMLElement>('[data-connection-message]')!,
    title = element.querySelector<HTMLElementTagNameMap['h2']>('h2')!,
    home = element.querySelector<HTMLElementTagNameMap['a']>('a')!;
  let active = false,
    blocked = false,
    seenConnection = serverConnected(client);
  input.value =
    new URL(locationObject.href).searchParams.get('server') ||
    storage.getItem('sf-multiplayer-endpoint') ||
    '';
  function update() {
    const connected = serverConnected(client);
    if (connected) seenConnection = true;
    const otherTab = client?.state.status === 'Character open in another tab';
    const banned = client?.state.status === CHARACTER_BANNED_MESSAGE;
    const needsSetup = !otherTab && !banned && !seenConnection && !client?.state.configured;
    const reconnecting = !needsSetup && !otherTab && !banned;
    if (banned) title.textContent = CHARACTER_BANNED_MESSAGE;
    else if (reconnecting)
      title.textContent =
        client?.state.status === 'Server Updating...' ? 'Server Updating...' : 'Reconnecting...';
    else title.textContent = otherTab ? 'Character open in another tab' : 'Connect to San Francisco';
    status.hidden = reconnecting || banned;
    status.textContent = otherTab
      ? 'Close the other tab and reload here.'
      : needsSetup
        ? 'Enter the game server address to play.'
        : '';
    form.hidden = home.hidden = !needsSetup;

    const next = active && !connected;
    if (next !== blocked) {
      blocked = next;
      world.inert = blocked;
      element.hidden = !blocked;
      if (blocked) {
        onDisconnect();
        if (seenConnection && client) client.state.reloadOnWelcome = true;
        (needsSetup ? input : element).focus({ preventScroll: true });
      }
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.hidden) return;
    const value = multiplayerEndpoint(input.value, locationObject.href);
    if (!value) {
      status.textContent = 'Enter a ws:// or wss:// server address. HTTPS pages require wss://.';
      return;
    }
    storage.setItem('sf-multiplayer-endpoint', value);
    const url = new URL(locationObject.href);
    url.searchParams.delete('offline');
    url.searchParams.delete('server');
    locationObject.href = url.href;
  });
  // Native inert also blocks focus and accessibility traversal. Capture guards
  // cover already queued events and programmatic activation of old controls.
  function guard(event: Event) {
    if (blocked && world.contains(event.target as Node | null)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  const events = [
    'click',
    'pointerdown',
    'pointermove',
    'pointerup',
    'contextmenu',
    'wheel',
    'keydown',
    'input',
    'change',
    'submit',
  ] satisfies [string, string, string, string, string, string, string, string, string, string];
  for (const name of events)
    world.ownerDocument.addEventListener(name, guard, { capture: true, passive: false });
  let noticeTimer: ReturnType<typeof setTimeout>;
  client?.subscribe((message) => {
    if (message.type === 'notice' && message.id === 'server-update' && notice) {
      notice.hidden = false;
      notice.textContent = message.message;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        notice.hidden = true;
      }, 12_000);
    } else if (message.type === 'connection') {
      if (client.state.connected && notice) {
        clearTimeout(noticeTimer);
        notice.hidden = true;
      }
      update();
    }
  });
  return {
    update,
    setActive(value: boolean) {
      active = value;
      update();
    },
    get blocked() {
      return blocked;
    },
  };
}
