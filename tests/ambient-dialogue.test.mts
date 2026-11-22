import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT } from '../src/content-runtime.ts';
import { compileEntityDialogue } from '../src/content-game.ts';
import {
  AMBIENT_CHAINS,
  GOOSE_CHAINS,
  CONVERSATION_POOL,
  createConversationPicker,
  createAmbientDialogue,
} from '../src/dialogues/ambient.ts';
import { CASUAL_DIALOGUE_IDS } from '../src/dialogues/catalog.ts';
import { configuredDialogue } from '../src/dialogue-config.ts';
import { createEconomy } from '../src/economy.ts';
import { growthDialogue } from '../src/finance-ui.ts';
import { techMerchantDialogue } from '../src/tech-ventures.ts';
import { createInteractions } from '../src/world/interactions.ts';
import { dialogueFixture } from './helpers/dialogue-fixture.mts';
import type { RuntimeDialogue } from '../src/types/world.ts';

test('canonical conversations retain valid reachable branches and terminating endings without original tweet files', () => {
  assert.equal(AMBIENT_CHAINS.length, 100);
  assert.equal(new Set(CONVERSATION_POOL.map((c) => c.id)).size, CONVERSATION_POOL.length);
  for (const chain of CONVERSATION_POOL)
    assert.deepEqual(chain, CONTENT.dialogues.shared[chain.id]);
  for (const chain of CONVERSATION_POOL) {
    const seen = new Set();
    function visit(id: string, path = new Set<string>()) {
      assert.ok(!path.has(id), chain.id + ' has a cycle');
      const node = chain.nodes[id];
      assert.ok(node?.text?.trim(), chain.id + ': ' + id);
      if (seen.has(id)) return;
      seen.add(id);
      if (node.end) assert.equal(node.choices, undefined);
      else {
        assert.ok(node.choices);
        assert.ok(node.choices.length >= 2);
        assert.equal(new Set(node.choices.map((c) => c.text)).size, node.choices.length);
        for (const choice of node.choices) visit(choice.next, new Set([...path, id]));
      }
    }
    visit(chain.start);
    assert.equal(seen.size, Object.keys(chain.nodes).length, chain.id + ' has unreachable nodes');
  }
  assert.ok(
    GOOSE_CHAINS.every((c) => JSON.stringify(c).includes('Powerful and Evil Goose Corporation')),
  );
});

test('the picker draws the complete pool before repeating and does not mutate its source', () => {
  const before = JSON.stringify(CONVERSATION_POOL);
  const pick = createConversationPicker({ random: () => 0.37 });
  for (let cycle = 0; cycle < 2; cycle++) {
    const ids = new Set(Array.from({ length: CONVERSATION_POOL.length }, () => pick().id));
    assert.equal(ids.size, CONVERSATION_POOL.length);
  }
  assert.equal(JSON.stringify(CONVERSATION_POOL), before);
  assert.throws(() => createConversationPicker({ pool: [] }), /empty/);
});

const paths = (
  node?: RuntimeDialogue | undefined,
): import('../src/types/world.ts').RuntimeChoice[][] =>
  requiredFixture(requiredFixture(node).choices).flatMap((choice) =>
    choice.next ? paths(choice.next).map((rest) => [choice, ...rest]) : [[choice]],
  );

test('every ambient and Goose ending renders with the actual NPC and player, then closes without effects', () => {
  let endings = 0,
    effects = 0;
  const original = JSON.stringify(CONVERSATION_POOL);
  for (const chain of CONVERSATION_POOL) {
    const person = createAmbientDialogue(
      {
        id: 'someone',
        name: 'Actual NPC',
        female: true,
        skin: '#997755',
        repeat: true,
        choice: 'Buy',
        trade: 'equity',
        accept: () => {
          effects++;
        },
        after: () => effects++,
      },
      { chain },
    );
    assert.equal(person.id, 'someone');
    assert.equal(person.skin, '#997755');
    assert.equal(person.repeat, false);
    assert.equal(person.trade, undefined);
    assert.equal(person.accept, undefined);
    assert.equal(person.after, undefined);
    for (const path of paths(person)) {
      const f = dialogueFixture(
        { name: 'Actual Player' },
        {
          trade: () => {
            effects++;
            return { ok: true };
          },
        },
      );
      try {
        f.dialogue.open(person);
        assert.equal(f.element.children[0].children[0].textContent, 'Actual NPC');
        f.advance();
        assert.equal(f.element.children[0].children[0].textContent, 'Actual Player');
        for (const choice of path) {
          f.click(choice.label);
          assert.equal(f.element.dataset.speaker, 'npc');
          assert.equal(f.element.children[0].children[0].textContent, 'Actual NPC');
          if (choice.next) f.advance();
          else assert.ok(f.element.textContent.includes(requiredFixture(choice.receipt)));
        }
        f.advance();
        assert.equal(f.dialogue.active, false, chain.id);
        endings++;
      } finally {
        f.restore();
      }
    }
  }
  assert.equal(effects, 0);
  assert.equal(endings, 412);
  assert.equal(JSON.stringify(CONVERSATION_POOL), original);
});

test('service menus show their authored choices without a shortcut that repeats the intro', () => {
  let purchases = 0;
  const person = compileEntityDialogue(
    configuredDialogue('founder', { name: 'Seller' }),
    'actor:founder-merchant',
  );
  const f = dialogueFixture(
    {},
    {
      trade: () => {
        purchases++;
        return { ok: true };
      },
    },
  );
  try {
    f.dialogue.open(person);
    f.advance();
    assert.deepEqual(
      f.buttons().map((button) => button.textContent),
      ['Buy one share · 10 coins', 'What does a share get me?', 'Leave'],
    );
    f.click('Buy one share · 10 coins');
    assert.equal(purchases, 1);
  } finally {
    f.restore();
  }
});

test('Tim Apple and the Sand Hill partner offer information without committing a transaction', () => {
  let transactions = 0;
  const transact = () => {
    transactions++;
    return { ok: true };
  };
  const f = dialogueFixture();
  try {
    for (const owned of [false, true]) {
      const economy = createEconomy({ iphoneOwned: owned });
      const tim = techMerchantDialogue(
        { kind: 'tim-apple' },
        { buyPhone: transact, equipPhone: transact, buyRobotaxi: transact },
        economy,
      );
      f.dialogue.open(compileEntityDialogue(tim, 'actor:tim-apple', { economy }));
      f.advance();
      f.click(owned ? 'When should I put the phone away?' : 'Is there a catch?');
      assert.match(f.element.textContent, /doomscrolling/);
      assert.equal(transactions, 0);
      f.advance();
      f.click(owned ? 'Equip iPhone' : 'Buy an iPhone · 100 coins');
      assert.equal(transactions, 1);
      f.advance();
      assert.equal(f.dialogue.active, false);
      transactions = 0;
    }
    for (const funded of [false, true]) {
      const capital = growthDialogue(
        undefined,
        { buy: transact, list: transact, sell: transact },
        { capital: true, funded, claimFunding: transact },
      );
      const person = compileEntityDialogue(capital, 'actor:sand-hill-partner', {
        strength: { state: { xp: 0, funded } },
      });
      f.dialogue.open(person);
      f.advance();
      f.click('What am I buying?');
      assert.match(f.element.textContent, /private when you buy it/);
      f.advance();
      f.click('What does taking it public mean?');
      assert.match(f.element.textContent, /stockbroker in Times Square/);
      assert.equal(transactions, 0);
      f.advance();
      assert.equal(
        f.buttons().some((button) => button.textContent === 'Ask about founder funding'),
        !funded,
      );
      f.click('Buy growth equity · 1,000 coins');
      assert.equal(transactions, 1);
      transactions = 0;
    }
  } finally {
    f.restore();
  }
});

test('Orin’s tablet story is a distinct branch that ends without reopening his shop menu', () => {
  const person = compileEntityDialogue(
    configuredDialogue(
      'wizard',
      { id: 'tablet-wizard' },
      {
        buyTablet: () => {
          throw Error('Unexpected purchase');
        },
      },
    ),
    'actor:tablet-wizard',
  );
  const f = dialogueFixture();
  try {
    f.dialogue.open(person);
    f.advance();
    assert.ok(f.buttons().every((button) => button.textContent !== 'Let’s just talk.'));
    f.click('How did you invent the tablets?');
    assert.match(f.element.textContent, /I used to walk to Cupertino/);
    f.advance();
    assert.equal(f.dialogue.active, false);
  } finally {
    f.restore();
  }
});

test('casual named roles all use the shared pool while Goose Corp conversations remain accessible', () => {
  for (const id of CASUAL_DIALOGUE_IDS) {
    const d = configuredDialogue(id, { name: 'Actual person' });
    assert.ok(
      CONVERSATION_POOL.some((c) => c.id === d.conversationId),
      id,
    );
    assert.equal(d.name, 'Actual person');
  }
  assert.ok(
    requiredFixture(configuredDialogue('square-books').choices).some(
      (c) => c.label === 'Who is Goose Corp?',
    ),
  );
  assert.ok(
    requiredFixture(configuredDialogue('guild-rumours').choices).some(
      (c) => c.label === 'Who sponsors the refreshments?',
    ),
  );
});

test('Talk to an ordinary pedestrian opens real choices, holds the speaker, and releases them on exit', () => {
  let interactions!: ReturnType<typeof createInteractions>;
  const f = dialogueFixture({}, { onClose: () => interactions.releaseNPC() });
  const context = {
    approachingNPC: null as import('../src/types/world.ts').Actor | null,
    player: { x: 0, y: 0, path: [1], speed: 1 },
    keys: new Set(['w']),
    quests: {
      theyLive: { isDefeated: () => false },
      state: { stochasticParrot: 'not-started' },
    },
    flying: () => false,
    chase: { state: {} },
    surf: { state: {} },
    rocket: { state: {} },
    rope: {},
    tahoe: { state: { mode: 'ground' } },
    sutroClimb: { state: {} },
    dialogue: f.dialogue,
    npcRevealed: () => false,
    nearestNavigation: () => ({ x: 0, y: 0 }),
    $: () => ({ hidden: true }),
    canvas: { focus() {} },
  };
  try {
    interactions = createInteractions(
      context as unknown as import('../src/world/scene.ts').WorldContext,
    );
    const npc = {
      waiting: false,
      id: 'pedestrian-1',
      label: 'Woman',
      female: true,
      x: 0.5,
      z: 0.5,
      speech: 'Old overhead conversation',
      speechUntil: Infinity,
    };
    interactions.interactCitizen(npc, 'talk');
    assert.equal(f.dialogue.active, true);
    assert.equal(context.approachingNPC, npc);
    assert.equal(npc.waiting, true);
    assert.equal(npc.speech, '');
    assert.equal(npc.speechUntil, 0);
    assert.deepEqual(context.player.path, []);
    assert.equal(context.player.speed, 0);
    f.advance();
    assert.ok(f.buttons().length >= 3);
    f.click('Leave');
    assert.equal(npc.waiting, false);
    assert.equal(context.approachingNPC, null);
  } finally {
    f.restore();
  }
});
