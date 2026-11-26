import { createEconomy } from '../src/economy.ts';
import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_DIALOGUES } from '../src/config/dialogue.ts';
import { configuredDialogue } from '../src/dialogue-config.ts';
import { dialogueFixture } from './helpers/dialogue-fixture.mts';
import { scientistDialogue } from '../src/jurassic.ts';
import { compileEntityDialogue } from '../src/content-game.ts';
import { createSaltMail } from '../src/salt-mail.ts';
import { createFuelDialogue, refuelFerrariFromCan } from '../src/fuel.ts';
import { setupMultiplayerSettings } from '../src/multiplayer-world.ts';
import type { RuntimeDialogue } from '../src/types/world.ts';

const choices = (node: RuntimeDialogue): import('../src/types/world.ts').RuntimeChoice[] =>
  node.choices ||
  (node.choice
    ? [{ label: node.choice, accept: node.accept, trade: node.trade, receipt: node.receipt }]
    : []);
const paths = (node: RuntimeDialogue): import('../src/types/world.ts').RuntimeChoice[][] =>
  choices(node).flatMap((choice) =>
    choice.next ? paths(choice.next).map((path) => [choice, ...path]) : [[choice]],
  );
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test('every configured dialogue leaf renders, invokes exactly one bound action, handles refusal, and closes cleanly', async (t) => {
  let conversations = 0,
    branches = 0;
  for (const [id, template] of Object.entries(NPC_DIALOGUES)) {
    const tokens = [...JSON.stringify(template).matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const values = Object.fromEntries(
      tokens.map((key) => [key, 'example'] satisfies [string, string]),
    );
    for (const fail of [false, true] satisfies [boolean, boolean]) {
      const calls: { action: PropertyKey; args: unknown[] }[] = [],
        handlers = new Proxy(
          {} as Record<
            string,
            (...args: unknown[]) => Promise<import('../src/types/world.ts').ActionReceipt>
          >,
          {
            get:
              (_, action) =>
              (...args: unknown[]) => {
                calls.push({ action, args });
                return Promise.resolve({
                  ok: !fail,
                  message: fail ? 'Server refused this action.' : 'Server confirmed this action.',
                });
              },
          },
        );
      const person = configuredDialogue(id, { name: 'Audit NPC' }, handlers, values);
      for (const path of paths(person)) {
        const before = calls.length,
          f = dialogueFixture({ name: 'Audit player' }, { trade: (kind) => handlers.trade(kind) });
        try {
          f.dialogue.open(person);
          f.advance();
          for (const choice of path) {
            assert.ok(
              f
                .buttons()
                .every(
                  (button) =>
                    !(['Back', 'Close', 'Cancel'] satisfies [string, string, string]).includes(
                      button.textContent,
                    ),
                ),
              id + ' has a duplicate or obsolete navigation option',
            );
            try {
              f.click(choice.label);
            } catch (error) {
              assert.ok(error instanceof Error);
              error.message = id + ': ' + error.message;
              throw error;
            }
            if (choice.next && !choice.next.skipIntro) f.advance();
          }
          await settle();
          const leaf = path.at(-1),
            hasAction = !!(requiredFixture(leaf).accept || requiredFixture(leaf).trade);
          assert.equal(calls.length - before, hasAction ? 1 : 0, id + ' action count');
          if (hasAction && fail)
            assert.match(
              f.element.textContent,
              /Server refused this action/,
              id + ' hid a failed receipt',
            );
          assert.equal(
            f.element
              .querySelectorAll('button')
              .filter((button) =>
                (['Leave', 'Close', 'Cancel'] satisfies [string, string, string]).includes(
                  button.textContent,
                ),
              ).length <= 1,
            true,
            id + ' duplicates exits',
          );
          f.advance();
          if (f.dialogue.active) f.dialogue.cancel();
          assert.equal(f.dialogue.active, false);
          branches++;
        } finally {
          f.restore();
        }
      }
    }
    conversations++;
  }
  assert.ok(conversations >= 50);
  assert.ok(branches >= 200);
  t.diagnostic(
    `${conversations} conversation templates; ${branches} successful/refused leaf paths`,
  );
});

test('starting Jurassic recovery waits for the actual server receipt instead of announcing an unissued railgun', async () => {
  let resolve!: (receipt: import('../src/types/world.ts').ActionReceipt) => void;
  let starts = 0;
  const f = dialogueFixture(),
    game = {
      state: { raptor: 'not-started' as const },
      finishQuest: () => ({ ok: false }),
      startQuest: () => {
        starts++;
        return {
          ok: true,
          pending: true,
          promise: new Promise<import('../src/types/world.ts').ActionReceipt>((r) => (resolve = r)),
        };
      },
    };
  try {
    f.dialogue.open(
      compileEntityDialogue(
        scientistDialogue({ name: 'Scientist' }, game),
        'actor:jurassic-scientist',
      ),
    );
    f.advance();
    f.click('Do you have a quest for me?');
    assert.match(f.element.textContent, /fully charged railgun/);
    assert.match(f.element.textContent, /Chase it south before it reaches the pedestrians/);
    assert.equal(starts, 0);
    f.advance();
    f.click('I’ll recover the raptor.');
    assert.equal(starts, 1);
    assert.match(f.element.textContent, /Waiting for the server/);
    assert.doesNotMatch(f.element.textContent, /gives you a railgun/);
    resolve({ ok: false, message: 'The scientist is too far away.' });
    await settle();
    assert.match(f.element.textContent, /too far away/);
  } finally {
    f.restore();
  }
});

test('salt mail and fuel-can messages describe the settled result and never predict success on refusal', async () => {
  let resolve!: (receipt: import('../src/types/world.ts').ActionReceipt) => void;
  const economy = {
      ...createEconomy(),
      state: { ...createEconomy().state, saltLetters: 0 },
      trade: () => ({
        ok: true,
        pending: true,
        promise: new Promise<import('../src/types/world.ts').ActionReceipt>((r) => (resolve = r)),
      }),
    },
    mail = createSaltMail(economy);
  for (const [action, success] of [
    [mail.collect, /sealed salt-conservation letter/],
    [mail.deliver, /pays you 50 coins/],
  ] satisfies [() => import('../src/types/world.ts').ActionReceipt, RegExp][]) {
    const request = action();
    resolve({ ok: false, message: 'Too far from the clerk.' });
    assert.equal(requiredFixture(await request.promise).message, 'Too far from the clerk.');
    const accepted = action();
    resolve({ ok: true });
    assert.match(requiredFixture(requiredFixture(await accepted.promise).message), success);
  }
  let refuels = 0;
  const car = {
    state: { owned: true, fuel: 0, distance: 0 },
    position: { x: 0, z: 0 },
    sample: () => ({ x: 0, z: 0 }),
    refuel: () => refuels++,
  };
  const pump = createFuelDialogue({ paid: true, label: 'Fuel', distance: 0 }, car, economy);
  assert.ok(pump?.choices != null, 'Missing test fixture: pump.choices');
  const can = requiredFixture(
    requiredFixture(pump.choices.find((choice) => choice.label.startsWith('Fuel can'))).accept,
  )();
  resolve({ ok: false, message: 'Purchase refused.' });
  assert.equal(
    requiredFixture(await requiredFixture(await can).promise).message,
    'Purchase refused.',
  );
  const pour = refuelFerrariFromCan(car, economy);
  assert.equal(refuels, 0);
  resolve({ ok: false, message: 'Walk to your Ferrari.' });
  assert.equal(requiredFixture(await pour.promise).ok, false);
  assert.equal(refuels, 0);
  const accepted = refuelFerrariFromCan(car, economy);
  resolve({ ok: true });
  assert.match(requiredFixture(requiredFixture(await accepted.promise).message), /full tank/i);
  assert.equal(refuels, 0, 'online use must not issue a duplicate refuel command');
});

test('the PvP checkbox keeps its draft when multiplayer status updates', () => {
  const previous = globalThis.document;
  const checkbox = { checked: true };
  const grapple = { disabled: false, hidden: false };
  const nodes = {
    'sf-pvp-enabled': checkbox,
    'sf-grapple-button': grapple,
  };
  globalThis.document = {
    getElementById: (id: keyof typeof nodes) => nodes[id],
  } as unknown as Document;
  try {
    const state = { connected: true, grapplingHook: false, pvp: { enabled: false, disableAt: 0 } };
    const settings = setupMultiplayerSettings({ state });
    assert.equal(checkbox.checked, true);
    assert.equal(grapple.disabled, true);
    assert.equal(grapple.hidden, true);
    state.grapplingHook = true;
    settings.update();
    assert.equal(grapple.hidden, false);
    assert.equal(grapple.disabled, false);
    state.connected = false;
    settings.update();
    assert.equal(grapple.hidden, false);
    assert.equal(grapple.disabled, true);
    state.grapplingHook = false;
    settings.update();
    assert.equal(grapple.hidden, true);
    assert.equal(checkbox.checked, true);
  } finally {
    globalThis.document = previous;
  }
});
