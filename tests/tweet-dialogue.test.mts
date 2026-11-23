import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CONTENT } from '../src/content-runtime.ts';
import { compileEntityDialogue } from '../src/content-game.ts';
import { validateContent } from '../src/content-validation.ts';
import {
  AMBIENT_CHAINS,
  CONVERSATION_POOL,
  createAmbientDialogue,
  createConversationPicker,
} from '../src/dialogues/ambient.ts';
import { importTweetDialogue } from '../tools/import-tweet-dialogues.mts';
import { projectCatalog } from '../editor/project.mts';
import { dialogueFixture } from './helpers/dialogue-fixture.mts';
import type { EditorDialogueNode } from '../src/types/editor.ts';
import type { SharedNode } from '../src/types/content.ts';

const imported = AMBIENT_CHAINS.filter((chain) => chain.id.startsWith('tweet_'));

test('the replacement includes every source line verbatim and only the requested old bakery conversation', () => {
  assert.equal(imported.length, 125);
  assert.deepEqual(
    AMBIENT_CHAINS.filter((chain) => !chain.id.startsWith('tweet_')).map((chain) => chain.id),
    ['ambient_037_the_croissant_alibi'],
  );
  const source = new URL('../source-tweets/', import.meta.url);
  const remaining = new Map<string, { speaker: string; text: string }>();
  for (const file of readdirSync(source).filter((file) => file.endsWith('.txt')))
    readFileSync(new URL(file, source), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const match = /^(NPC|CHARACTER):\s*(.+?)\s*$/.exec(line);
        if (match)
          remaining.set(`${file}/line-${index + 1}`, {
            speaker: match[1] === 'NPC' ? 'npc' : 'player',
            text: match[2],
          });
      });
  assert.equal(remaining.size, 518);
  for (const chain of imported) {
    const filename = chain.source_files![0];
    let id: string | undefined = chain.start;
    const seen = new Set<string>();
    while (id) {
      assert.ok(!seen.has(id), chain.id);
      seen.add(id);
      const node: SharedNode = chain.nodes[id];
      const key: string = `${filename}/${id}`;
      assert.deepEqual({ speaker: node.speaker, text: node.text }, remaining.get(key), key);
      remaining.delete(key);
      id = node.next;
    }
    assert.equal(seen.size, Object.keys(chain.nodes).length);
  }
  assert.equal(remaining.size, 0);
  assert.match(
    CONTENT.dialogues.shared.ambient_037_the_croissant_alibi.nodes.start.text,
    /^Look at this bakery queue/,
  );
});

test('every imported turn renders with its authored speaker and closes without game effects', () => {
  let turns = 0;
  for (const chain of imported) {
    const f = dialogueFixture({ name: 'Actual Player' });
    try {
      const person = compileEntityDialogue(
        createAmbientDialogue(
          {
            name: 'Actual NPC',
            skin: '#997755',
            choice: 'Buy',
            trade: 'equity',
            accept: () => assert.fail('An ambient conversation must not buy anything'),
            after: () => assert.fail('An ambient conversation must not run a deferred action'),
            next: { intro: 'Stale conversation' },
            contentResolved: true,
          },
          { chain },
        ),
        'actor:unregistered-pedestrian',
      );
      f.dialogue.open(person);
      let id: string | undefined = chain.start;
      while (id) {
        const node: SharedNode = chain.nodes[id];
        const speaker = node.speaker === 'player' ? 'Actual Player' : 'Actual NPC';
        assert.equal(f.element.dataset.speaker, node.speaker, `${chain.id}/${id}`);
        assert.equal(f.element.children[0].children[0].textContent, speaker);
        assert.equal(f.element.children[1].children[0].textContent, node.text);
        assert.equal(f.dialogue.active, true);
        assert.deepEqual(
          f.buttons().map((button) => button.textContent),
          node.next ? ['Continue', 'Leave'] : ['Continue'],
        );
        f.advance();
        id = node.next;
        turns++;
      }
      assert.equal(f.dialogue.active, false, chain.id);
    } finally {
      f.restore();
    }
  }
  assert.equal(turns, 518);
});

test('male-only source annotations apply to their block and the picker respects the NPC gender', () => {
  assert.equal(imported.filter((chain) => chain.npc_eligibility).length, 2);
  const sample = importTweetDialogue(
    'sample.txt',
    '{MALE NPC ONLY}\nNPC: Male only.\n====\nCHARACTER: Anyone.\nNPC: Hello.',
  );
  assert.deepEqual(sample[0].npc_eligibility, { genders: ['man'] });
  assert.equal(sample[1].npc_eligibility, undefined);
  assert.equal(sample[1].nodes[sample[1].start].speaker, 'player');
  assert.throws(() => importTweetDialogue('bad.txt', 'UNKNOWN: Hello.'), /unknown speaker/);
  const pick = createConversationPicker({ random: () => 0.37 });
  const femalePool = CONVERSATION_POOL.filter((chain) => !chain.npc_eligibility);
  for (let cycle = 0; cycle < 2; cycle++) {
    const women = new Set(
      Array.from({ length: femalePool.length }, () => pick({ female: true }).id),
    );
    assert.deepEqual(women, new Set(femalePool.map((chain) => chain.id)));
    const men = new Set(
      Array.from({ length: CONVERSATION_POOL.length }, () => pick({ gender: 'man' }).id),
    );
    assert.deepEqual(men, new Set(CONVERSATION_POOL.map((chain) => chain.id)));
  }
});

test('the editor exposes every sequential turn with its speaker and stable text binding', () => {
  const catalog = projectCatalog(CONTENT);
  for (const chain of imported) {
    const record = catalog.sharedDialogue.find((record) => record.id === chain.id)!;
    let projected: EditorDialogueNode | undefined = record.dialogue;
    let id: string | undefined = chain.start;
    let path: (string | number)[] = ['dialogue'];
    while (id) {
      const node: SharedNode = chain.nodes[id];
      assert.equal(projected?.intro, node.text);
      assert.equal(projected?.speaker, node.speaker);
      assert.deepEqual(record.bindings[JSON.stringify([...path, 'intro'])].path, [
        'shared',
        chain.id,
        'nodes',
        id,
        'text',
      ]);
      projected = projected?.next;
      id = node.next;
      path = [...path, 'next'];
    }
    assert.equal(projected, undefined);
  }
});

test('linear shared conversations reject broken links, cycles and conflicting endings', () => {
  for (const failure of ['missing', 'cycle', 'end', 'choices']) {
    const bundle = structuredClone(CONTENT);
    const chain = bundle.dialogues.shared[imported[0].id];
    const start = chain.nodes[chain.start];
    if (failure === 'missing') start.next = 'missing';
    if (failure === 'cycle') start.next = chain.start;
    if (failure === 'end') start.end = true;
    if (failure === 'choices')
      start.choices = [{ id: 'conflict', text: 'Again?', next: chain.start }];
    assert.throws(() => validateContent(bundle), /shared dialogue/i);
  }
});
