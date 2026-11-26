import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestMenu } from '../src/quest-menu.ts';
import { createCollectionMenu } from '../src/collection-menu.ts';
import { COLLECTION_ITEMS } from '../src/config/collection.ts';
import { dialogueFixture } from './helpers/dialogue-fixture.mts';
import { createExpeditions } from '../src/jurassic.ts';

test('quest journal lists the names and starting places of unstarted quests and keeps future steps hidden', () => {
  const fixture = dialogueFixture();
  try {
    const make = () => fixture.doc.createElement('div');
    const content = make(),
      button = make();
    let entries: import('../src/quest-menu.ts').QuestJournalEntry[] = [
      {
        id: 'hidden',
        title: 'Hidden adventure',
        stage: 'not-started',
        status: 'Not started',
        startLocation: 'The docks',
        description: 'Secret future objective',
      },
    ];
    const menu = createQuestMenu({
      element: make(),
      content,
      button,
      shade: make(),
      canvas: make(),
      quests: { entries: () => entries },
      beforeOpen() {},
    });
    assert.match(content.textContent, /Hidden adventure/);
    assert.match(content.textContent, /Starts at The docks/);
    assert.match(button.getAttribute('aria-label') || '', /Hidden adventure, Not started/);
    assert.doesNotMatch(content.textContent, /Secret future objective/);
    entries.push({
      id: 'discovered',
      title: 'An adventure',
      stage: 'accepted',
      status: 'In progress',
      description: 'You received a letter.',
      rewardLabel: 'Secret reward',
      targets: [
        { area: 'Letter received', done: true },
        { area: 'Hidden destination', done: false },
      ],
    });
    menu.render();
    assert.match(content.textContent, /Letter received/);
    assert.doesNotMatch(
      content.textContent,
      /Secret reward|Hidden destination|Secret future objective/,
    );
    entries[1].stage = 'completed';
    menu.render();
    assert.match(content.textContent, /Reward: Secret reward/);
  } finally {
    fixture.restore();
  }
});

test('the Item Log shows a short source hint until each item is discovered', () => {
  const fixture = dialogueFixture();
  try {
    const make = () => fixture.doc.createElement('div');
    fixture.doc.createDocumentFragment = make;
    const content = make(),
      summary = make();
    let found: string[] = [];
    const menu = createCollectionMenu({
      element: make(),
      content,
      summary,
      button: make(),
      shade: make(),
      canvas: make(),
      getFound: () => found,
      beforeOpen() {},
    });
    menu.render();
    assert.match(content.textContent, /Undiscovered/);
    assert.doesNotMatch(content.textContent, /Railgun|Alien Evidence Certificate|Sandwich/);
    const rows = content.querySelectorAll('li');
    assert.equal(rows.length, COLLECTION_ITEMS.length);
    for (const row of rows) {
      assert.equal(row.dataset.found, 'false');
      const hints = row.querySelectorAll('small');
      assert.equal(hints.length, 1);
      assert.match(hints[0].textContent, /^\S+(?: \S+){0,2}$/);
    }
    for (const [id, hint] of [
      ['light-crystal', 'Any NPC'],
      ['missile-launcher', 'Madder Scientist'],
      ['fish', 'Fishing Spot'],
      ['sand', 'Ocean Beach'],
    ]) {
      assert.equal(COLLECTION_ITEMS.find((item) => item.id === id)?.hint, hint);
      assert.ok(content.querySelectorAll('small').some((element) => element.textContent === hint));
    }
    found = ['sandwich'];
    menu.render();
    const sandwichRow = content.querySelectorAll('li').find((row) => row.dataset.found === 'true');
    assert.equal(sandwichRow?.textContent, '✓ Sandwich');
    assert.equal(sandwichRow?.querySelectorAll('small').length, 0);
    assert.equal(content.querySelectorAll('small').length, COLLECTION_ITEMS.length - 1);
    assert.doesNotMatch(content.textContent, /Railgun|Alien Evidence Certificate/);
    assert.match(summary.textContent, /^1 \/ /);
  } finally {
    fixture.restore();
  }
});

test('the kraken adventure is discovered by boarding and remains recorded after leaving or reconnecting', () => {
  let saved;
  const game = createExpeditions({
    saved: { railgun: true, raptorDefeated: true },
    onSave: (state) => {
      saved = state;
    },
  });
  assert.equal(game.entries().find((q) => q.id === 'pequod-kraken')?.stage, 'not-started');
  assert.equal(game.board().ok, true);
  game.abandonShip();
  assert.ok(game.entries().some((q) => q.id === 'pequod-kraken'));
  const restored = createExpeditions({ saved });
  assert.ok(restored.entries().some((q) => q.id === 'pequod-kraken'));
});
