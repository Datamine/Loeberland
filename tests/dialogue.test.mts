import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_DIALOGUES } from '../src/config/dialogue.ts';
import { configuredDialogue } from '../src/dialogue-config.ts';
import { rehabilitationDialogue } from '../src/rehabilitation.ts';
import { bankerDialogue } from '../src/banking.ts';
import { taxDialogue } from '../src/southern-district.ts';
import { createEconomy } from '../src/economy.ts';
import { drawCharacter } from '../src/characters.ts';
import { Mesh } from '../src/geometry.ts';
import { drawHumanNPC, drawHumanNPCHead } from '../src/human-npc.ts';
import { drawNPCChatHead, drawPlayerChatHead } from '../src/chat-head.ts';

import { dialogueFixture as fixture } from './helpers/dialogue-fixture.mts';

test('speaker names appear above the matching portrait and player turns use the actual username', () => {
  const player = { name: 'HarborAda' },
    f = fixture(player);
  try {
    const open = () => {
      f.dialogue.open({
        name: 'Ray',
        intro: 'Welcome to the guild.',
        choices: [{ label: 'Hello.', receipt: 'Good day.' }],
      });
    };
    open();
    let portrait = f.element.children[0];
    assert.equal(portrait.children[0].className, 'sf-chat-name');
    assert.equal(portrait.children[0].textContent, 'Ray');
    assert.equal(portrait.children[1].className, 'sf-chat-portrait');
    f.advance();
    assert.equal(f.element.dataset.speaker, 'player');
    assert.equal(f.element.children[0].children[0].textContent, 'HarborAda');
    f.dialogue.close();
    player.name = 'HarborBea';
    open();
    f.advance();
    assert.equal(f.element.children[0].children[0].textContent, 'HarborBea');
  } finally {
    f.restore();
  }
});

test('an NPC chathead uses the head and outfit of the rendered actor', () => {
  const npc = { x: 42, z: 12, skin: '#bd9369' };
  const appearance = { topHat: true, sunglasses: true, hair: '#774936' };
  const renderedSkin = '#8f5e41';
  drawHumanNPC(new Mesh(), npc, 0, { skin: renderedSkin, appearance });
  const portrait = new Mesh();
  const expected = new Mesh();
  drawHumanNPCHead(portrait, npc, Math.PI / 2);
  drawCharacter(expected, 0, 0, 0, Math.PI / 2, 0, false, renderedSkin, undefined, {
    ...appearance,
    mode: 'idle',
    headOnly: true,
  });
  assert.ok(portrait.data.length > 0);
  assert.deepEqual(portrait.data, expected.data);
  assert.ok(portrait.data.every((value, i) => i % 11 !== 1 || value > 1.4));
});

test('loose long hair frames the visible neck in NPC and player portraits', () => {
  const look = { hair: '#3d2013', skin: '#c9a688' };
  for (const draw of [
    (canvas: HTMLCanvasElement) =>
      drawPlayerChatHead(canvas, { ...look, gender: 'woman', hairstyle: 'long' }),
    (canvas: HTMLCanvasElement) =>
      drawNPCChatHead(canvas, { ...look, female: true, longHair: true }, false),
  ]) {
    const size = 160;
    const data = new Uint8ClampedArray(size * size * 4);
    const canvas = {
      width: size,
      height: size,
      getContext: () => ({ createImageData: () => ({ data }), putImageData() {} }),
    } as unknown as HTMLCanvasElement;
    draw(canvas);
    const neck = (136 * size + 80) * 4;
    const sideLock = (136 * size + 50) * 4;
    assert.equal(data[neck + 3], 255);
    assert.equal(data[sideLock + 3], 255);
    assert.ok(data[neck] > 125, 'skin remains visible through the center below the chin');
    assert.ok(data[sideLock] < 80, 'hair still hangs beside the neck');
  }
});

test('dialogue branches retain the NPC portrait and player choices use a separate portrait', () => {
  const f = fixture();
  let portraits = 0;
  try {
    f.dialogue.open(
      {
        name: 'Haberdasher',
        intro: 'Hello.',
        choices: [{ label: 'Hats', next: { intro: 'Of course.' } }],
      },
      () => portraits++,
    );
    assert.equal(portraits, 1);
    f.advance();
    assert.equal(portraits, 1);
    f.click('Hats');
    assert.equal(portraits, 2);
    f.dialogue.close();
    f.dialogue.open({ name: 'Someone else', intro: 'Hi.' });
    assert.equal(portraits, 2);
  } finally {
    f.restore();
  }
});

test('the coin form stays in the dialogue during validation, payment and a retry', async () => {
  const f = fixture();
  const payments: number[] = [];
  const field = () => requiredFixture(f.element.querySelector('input'));
  const submit = () => requiredFixture(f.element.querySelector('form')).submit();
  try {
    f.dialogue.open({
      name: 'Entrepreneur',
      intro: 'Invest today.',
      choices: [
        {
          label: 'Invest coins',
          amount: {
            prompt: 'How many coins?',
            submit: async (coins) => {
              payments.push(coins);
              return coins > 9
                ? { ok: false, message: 'You don’t have that many coins.' }
                : { ok: true, message: 'I’ll take those coins.' };
            },
          },
        },
      ],
    });
    f.advance();
    f.click('Invest coins');
    assert.equal(field(), f.doc.activeElement);
    field().value = '1.5';
    submit();
    assert.match(f.element.textContent, /positive whole number/);
    assert.deepEqual(payments, []);
    field().value = '10';
    submit();
    assert.equal(field().disabled, true);
    submit();
    await Promise.resolve();
    assert.match(f.element.textContent, /don’t have that many/);
    assert.equal(field().value, '10');
    field().value = '4';
    submit();
    await Promise.resolve();
    assert.deepEqual(payments, [10, 4]);
    assert.equal(f.element.querySelector('form'), undefined);
    assert.match(f.element.textContent, /I’ll take those coins/);
  } finally {
    f.restore();
  }
});

test('every fixed conversation has data-only, unambiguous branches and resolvable actions/templates', () => {
  const dynamic = new Set(['haberdasher', 'growth-capital'] satisfies [string, string]);
  let count = 0;
  const walk = (
    node: import('../src/types/content.ts').LegacyServiceNode,
    id: string,
    nested = false,
  ) => {
    assert.ok(node.intro || node.skipIntro, id + ' needs a spoken opening or explicit topic menu');
    if (!node.choices) {
      assert.ok(
        dynamic.has(id) || (nested && node.intro && node.repeat === false && !node.skipIntro),
        id + ' has no choices or terminal line',
      );
      return;
    }
    assert.ok(node.choices.length, id + ' has an empty menu');
    const labels = new Set();
    for (const choice of node.choices) {
      count++;
      assert.ok(choice.label?.trim());
      assert.ok(!labels.has(choice.label), id + ' duplicates ' + choice.label);
      labels.add(choice.label);
      assert.equal(
        (['action', 'trade', 'next'] as const).filter((key) => choice[key]).length,
        choice.next || choice.action || choice.trade ? 1 : 0,
        id + ' has conflicting actions',
      );
      assert.ok(
        choice.next || choice.action || choice.trade || choice.receipt,
        id + ' has a dead end',
      );
      if (choice.next) walk(choice.next, id, true);
    }
  };
  const noFunctions = (value: unknown) => {
    assert.notEqual(typeof value, 'function');
    if (value && typeof value === 'object') Object.values(value).forEach(noFunctions);
  };
  for (const [id, node] of Object.entries(NPC_DIALOGUES)) {
    noFunctions(node);
    walk(node, id);
    const tokens = [...JSON.stringify(node).matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
      values = Object.fromEntries(tokens.map((key) => [key, 'example'] satisfies [string, string]));
    const handlers = new Proxy({}, { get: () => () => ({ ok: true }) });
    assert.ok(configuredDialogue(id, { name: 'Test' }, handlers, values).intro);
  }
  assert.ok(
    count >= 50,
    'Audit the service catalog; ambient branches have their own full UI audit',
  );
  assert.throws(() => configuredDialogue('rehabilitation'), /Missing dialogue action begin/);
});

test('rehabilitation asks about side effects before explicit consent, and only receipt OK starts the procedure', () => {
  const f = fixture();
  let starts = 0;
  const run = () => {
    f.dialogue.open(rehabilitationDialogue({ name: 'Specialist' }, () => starts++));
    f.advance();
    assert.equal(f.element.dataset.speaker, 'player');
    assert.equal(starts, 0);
    f.click('Yes. Are there any side effects?');
    assert.match(f.element.textContent, /Not at all/);
    assert.equal(starts, 0);
    f.advance();
    f.click('All right. Begin rehabilitation.');
    assert.match(f.element.textContent, /Stand still/);
    assert.equal(starts, 0);
  };
  try {
    run();
    f.dialogue.close();
    assert.equal(starts, 0);
    run();
    f.advance();
    assert.equal(starts, 1);
    assert.equal(f.dialogue.active, false);
  } finally {
    f.restore();
  }
});

test('rehabilitation information can return to choices without starting treatment', () => {
  const f = fixture();
  try {
    f.dialogue.open(
      rehabilitationDialogue({ name: 'Specialist' }, () => assert.fail('No consent')),
    );
    f.advance();
    f.click('What does rehabilitation involve?');
    assert.match(f.element.textContent, /UCSF/);
    f.advance();
    assert.ok(f.buttons().some((b) => b.textContent.includes('side effects')));
    f.click('No thanks. I’ll stay here.');
    assert.equal(f.dialogue.active, false);
  } finally {
    f.restore();
  }
});

test('tax submenus repeat questions without Back, and reopening does not inherit payment actions', () => {
  const f = fixture(),
    economy = createEconomy({ coins: 37 });
  try {
    f.dialogue.open(taxDialogue(economy));
    f.advance();
    f.click('I have some questions.');
    f.click('Where is my money going?');
    assert.match(f.element.textContent, /California high-speed rail/);
    assert.equal(economy.state.coins, 37);
    f.advance();
    assert.ok(f.buttons().some((b) => b.textContent === 'Where is my money going?'));
    assert.ok(!f.buttons().some((b) => b.textContent === 'Back'));
    f.click('Leave');
    assert.equal(f.dialogue.active, false);
    f.dialogue.open(taxDialogue(economy));
    f.advance();
    f.click('Pay taxes · all coins');
    assert.equal(economy.state.coins, 0);
    f.advance();
    assert.ok(f.buttons().some((b) => b.textContent === 'I have some questions.'));
    assert.equal(
      f
        .buttons()
        .filter((b) =>
          (['Leave', 'Close', 'Cancel'] satisfies [string, string, string]).includes(b.textContent),
        ).length,
      1,
    );
  } finally {
    f.restore();
  }
});

test('the banker opens the account immediately after confirmation despite repeatable topics', () => {
  const f = fixture();
  let opened = 0;
  try {
    f.dialogue.open(
      bankerDialogue(
        { name: 'Banker' },
        { open: () => opened++, coffee: () => ({ ok: true, message: 'Coffee' }) },
      ),
    );
    f.advance();
    f.click('I’d like to deposit or withdraw coins.');
    assert.equal(opened, 0);
    f.advance();
    assert.equal(opened, 1);
    assert.equal(f.dialogue.active, false);
  } finally {
    f.restore();
  }
});

test('a failed purchase never shows the configured success reply and the player can retry', async () => {
  const f = fixture();
  try {
    const person = configuredDialogue(
      'square-coffee',
      { name: 'Barista' },
      { coffee: async () => ({ ok: false, message: 'You need a coin.' }) },
    );
    f.dialogue.open(person);
    f.advance();
    f.click('A coffee, please · 1 coin');
    await Promise.resolve();
    await Promise.resolve();
    assert.match(f.element.textContent, /You need a coin/);
    assert.doesNotMatch(f.element.textContent, /Here’s your coffee/);
    f.advance();
    assert.ok(f.buttons().some((b) => b.textContent === 'A coffee, please · 1 coin'));
  } finally {
    f.restore();
  }
});

test('closing and reopening the same NPC ignores old pending receipts, with no duplicate purchase or follow-up', async () => {
  const f = fixture(),
    pending: ((arg0: { ok: boolean; message: string; after: () => number }) => void)[] = [];
  let calls = 0,
    after = 0;
  const person = {
    name: 'Merchant',
    intro: 'Hello',
    choices: [
      {
        label: 'Purchase',
        accept: () => {
          calls++;
          return new Promise<import('../src/types/world.ts').ActionReceipt>((resolve) =>
            pending.push(resolve),
          );
        },
      },
    ],
  };
  try {
    f.dialogue.open(person);
    f.advance();
    const first = f.buttons()[0];
    first.click();
    first.click();
    assert.equal(calls, 1);
    f.dialogue.cancel();
    f.dialogue.open(person);
    f.advance();
    f.click('Purchase');
    assert.equal(calls, 2);
    pending[0]({ ok: true, message: 'Old reply', after: () => after++ });
    await Promise.resolve();
    await Promise.resolve();
    assert.doesNotMatch(f.element.textContent, /Old reply/);
    pending[1]({ ok: true, message: 'New reply', after: () => after++ });
    await Promise.resolve();
    await Promise.resolve();
    assert.match(f.element.textContent, /New reply/);
    f.advance();
    assert.equal(after, 1);
  } finally {
    f.restore();
  }
});

test('arrow and Enter keys navigate choices without exposing a question heading or a default purchase action', () => {
  const f = fixture();
  try {
    const person = configuredDialogue('dog-walker', { name: 'Walker' });
    f.dialogue.open(person);
    f.advance();
    assert.doesNotMatch(f.element.textContent, /Don't Purchase|What would you like to ask/);
    const key = (key: string) => f.dialogue.handleKey({ key, preventDefault() {} });
    key('ArrowDown');
    assert.ok(person?.choices != null, 'Missing test fixture: person.choices');
    assert.equal(requiredFixture(f.doc.activeElement).textContent, person.choices[1].label);
    key('Enter');

    const expectedText = person.choices[1].next?.intro || person.choices[1].receipt;
    assert.ok(typeof expectedText === 'string');
    assert.ok(f.element.textContent.includes(expectedText));
  } finally {
    f.restore();
  }
});

test('Ahab waits for boarding authorization and displays a refusal instead of unfurling the sails', async () => {
  const { ahabDialogue } = await import('../src/jurassic.ts'),
    f = fixture();
  let resolve!: (value: import('../src/types/world.ts').ActionReceipt) => void;
  const game = {
    state: {},
    hasRailgun: () => true,
    ship: { aboard: false },
    board: () => new Promise<import('../src/types/world.ts').ActionReceipt>((r) => (resolve = r)),
  };
  try {
    f.dialogue.open(ahabDialogue({ name: 'Ahab' }, game));
    f.advance();
    f.click('What happened to Moby Dick?');
    f.advance();
    f.click('Board the Pequod');
    assert.match(f.element.textContent, /Waiting for the server/);
    assert.doesNotMatch(f.element.textContent, /unfurls/);
    resolve({ ok: false, message: 'Visit Captain Ahab on the beach.' });
    await Promise.resolve();
    await Promise.resolve();
    assert.match(f.element.textContent, /Visit Captain Ahab/);
    assert.doesNotMatch(f.element.textContent, /unfurls/);
    f.advance();
    assert.equal(f.dialogue.active, false);
    f.dialogue.open(ahabDialogue({ name: 'Ahab' }, { ...game, state: { krakenReward: true } }));
    f.advance();
    assert.ok(!f.buttons().some((b) => /Board the Pequod/.test(b.textContent)));
  } finally {
    f.restore();
  }
});
