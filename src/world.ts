import { requiredValue } from './types/assert.ts';
import { createSFWorld } from './world/scene.ts';
import { createLoadingScreen } from './loading-screen.ts';
import { bootMultiplayer } from './multiplayer-client.ts';
import { refreshWorldMap } from './world-stream.ts';
export { createWorldModel } from './world/model.ts';

function startGame() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-refresh-map]'))
    button.addEventListener('click', () => {
      button.disabled = true;
      refreshWorldMap();
    });
  const loading = createLoadingScreen(
    requiredValue(document.getElementById('sf-loading'), 'Loading screen'),
  );
  if (document.documentElement.dataset.sfEntry === 'explore') loading.show();
  bootMultiplayer()
    .then((multiplayer) => {
      loading.bindClient(multiplayer);
      return createSFWorld({ multiplayer, loading });
    })
    .catch((error) => {
      console.error('World initialization:', error);
      loading.fail(error);
    });
}

if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof document.querySelectorAll === 'function'
) {
  const minimum = { width: 960, height: 600 };
  const viewport = window.matchMedia(
    `(min-width: ${minimum.width}px) and (min-height: ${minimum.height}px)`,
  );
  const mobile =
    /Android|iPhone|iPad|iPod|Windows Phone|\bMobile\b/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const notice = requiredValue(
    document.querySelector<HTMLDialogElement>('#sf-screen-requirement'),
    'Screen requirement',
  );
  const size = requiredValue(
    notice.querySelector<HTMLElement>('#sf-screen-requirement-size'),
    'Minimum screen size',
  );
  if (!mobile) {
    size.textContent =
      `Resize your browser window to at least ${minimum.width} × ${minimum.height} pixels to play.`;
    size.hidden = false;
  }
  let started = false;
  function updateScreen() {
    if (mobile || !viewport.matches) {
      if (!notice.open) notice.showModal();
      return;
    }
    if (notice.open) notice.close();
    if (!started) {
      started = true;
      startGame();
    }
  }
  notice.addEventListener('cancel', (event) => event.preventDefault());
  window.addEventListener(
    'keydown',
    (event) => {
      if (!notice.open) return;
      if (event.key === 'Escape') event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
  viewport.addEventListener('change', updateScreen);
  updateScreen();
}
