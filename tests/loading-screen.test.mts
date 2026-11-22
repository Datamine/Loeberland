import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingScreen } from '../src/loading-screen.ts';

function fixture(returningCharacter: boolean) {
  const node = () => ({
    textContent: '',
    dataset: {} as Record<string, string>,
    disabled: false,
    click: async () => {},
    submit: async () => {},
    hidden: false,
    addEventListener(type: string, fn: () => void | Promise<void>) {
      Object.assign(this, { [type]: fn });
    },
    setAttribute() {},
  });
  const field = { ...node(), value: '' },
    save = { ...node(), textContent: 'Save name' },
    hint = node(),
    form = {
      ...node(),
      querySelector: (s: string) =>
        s.includes('input') ? field : s.includes('save') ? save : hint,
    };
  const play = node(),
    elements: Record<string, ReturnType<typeof node>> = {
      '[data-loading-username]': form,
      '[data-loading-play]': play,
      '[data-character-login-link]': node(),
      '[data-loading-percent]': node(),
      '[data-loading-stage]': node(),
      progress: node(),
    };
  const element = { ...node(), querySelector: (s: string) => elements[s] || null };
  let renames = 0;
  const client = {
    state: {
      connected: true,
      returningCharacter,
      autoName: true,
      name: 'FogOtter123',
      renameAt: 0,
    },
    subscribe: () => () => {},
    command: () => {
      renames++;
      assert.fail('Keeping a name must not rename it');
    },
  };
  const loading = createLoadingScreen(element as unknown as HTMLElement);
  loading.bindClient(client);
  return {
    loading,
    element,
    form,
    play,
    login: elements['[data-character-login-link]'],
    stage: elements['[data-loading-stage]'],
    percent: elements['[data-loading-percent]'],
    get renames() {
      return renames;
    },
  };
}
test('returning characters can play or log in without going through the name picker', async () => {
  const previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  const f = fixture(true);
  try {
    const entering = f.loading.done();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(f.form.hidden, true);
    assert.equal(f.play.hidden, false);
    assert.equal(f.login.hidden, false);
    assert.equal(f.percent.textContent, '100% loaded');
    assert.equal(f.stage.hidden, true);
    await f.play.click();
    await entering;
    assert.equal(f.element.hidden, true);
    assert.equal(f.renames, 0);
  } finally {
    f.loading.hide();
    globalThis.requestAnimationFrame = previous;
  }
});
test('new characters retain the optional username step and Play button', async () => {
  const previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  const f = fixture(false);
  try {
    let entered = false;
    const entering = f.loading.done().then(() => (entered = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(entered, false);
    assert.equal(f.form.hidden, false);
    assert.equal(f.play.hidden, false);
    assert.equal(f.play.disabled, false);
    await f.play.click();
    await entering;
    assert.equal(entered, true);
    assert.equal(f.element.hidden, true);
    assert.equal(f.renames, 0);
  } finally {
    f.loading.hide();
    globalThis.requestAnimationFrame = previous;
  }
});
