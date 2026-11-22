import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createEditorWriter } from '../editor/writer.mts';
import { planEditorWrite } from '../editor/write-plan.mts';
import { projectCatalog } from '../editor/project.mts';
import {
  contentSourceKeys,
  contentSourcePaths,
  readContent,
  writableContentSources,
} from '../content/build.mts';
import { contentFixture } from './helpers/content-fixture.mts';

const change = (
  path: (string | number)[],
  before: string,
  after: string,
  record = 'actor:goblin',
) => ({ record, path, before, after });
test('world message edits bind to their own source and preserve runtime placeholders', () => {
  const source = contentFixture();
  const id = 'world-message.test-delivery';
  source.texts.texts[id] = { template: 'Delivery for {name}.' };
  const catalog = projectCatalog(source);
  assert.deepEqual(
    catalog.worldMessages.map((record) => record.key),
    [id],
  );
  const next = planEditorWrite(catalog, source, [
    change(['template'], 'Delivery for {name}.', 'Food for {name}.', id),
  ]);
  const files = writableContentSources(next, []);
  assert.equal(files.worldMessages[id].template, 'Food for {name}.');
  assert.equal(files.texts.texts[id], undefined);
});
test('edits address stable definitions, actions and dialogue choices after text and ordering changes', () => {
  const source = contentFixture(),
    catalog = projectCatalog(source, 'revision');
  const next = planEditorWrite(catalog, source, [
    change(['name'], 'Goblin', 'Maker'),
    change(['group'], 'npc', 'object'),
    change(
      ['actions', 0, 'actions', 0, 'label'] satisfies [string, number, string, number, string],
      'Talk to {name}',
      'Inspect {name}',
    ),
    change(
      ['dialogues', 0, 'dialogue', 'intro'] satisfies [string, number, string, string],
      'Welcome, {v0}.',
      'Hello {v0}!',
    ),
    change(
      ['dialogues', 0, 'dialogue', 'choices', 0, 'condition'] satisfies [
        string,
        number,
        string,
        string,
        number,
        string,
      ],
      JSON.stringify(
        source.dialogues.variants.conversation.nodes.greeting.choices[0].when,
        null,
        2,
      ),
      '{"path":"quests.monkey.stage","eq":"accepted"}',
    ),
  ]);
  assert.equal(next.entities.definitions.goblin.name, 'Maker');
  assert.equal(next.entities.definitions.goblin.category, 'object');
  assert.equal(next.texts.texts.hello.template, 'Hello {v0}!');
  assert.ok(
    next?.dialogues?.variants?.conversation?.nodes != null,
    'Missing test fixture: next.dialogues.variants.conversation.nodes',
  );
  next.dialogues.variants.conversation.nodes.greeting.choices.reverse();
  const updated = projectCatalog(next, 'new');
  const final = planEditorWrite(updated, next, [
    change(
      ['dialogues', 0, 'dialogue', 'choices', 1, 'label'] satisfies [
        string,
        number,
        string,
        string,
        number,
        string,
      ],
      'Buy',
      'Purchase',
    ),
  ]);
  assert.ok(
    final?.dialogues?.variants?.conversation?.nodes != null,
    'Missing test fixture: final.dialogues.variants.conversation.nodes',
  );
  assert.equal(
    requiredFixture(
      final.dialogues.variants.conversation.nodes.greeting.choices.find((c) => c.id === 'purchase'),
    ).label,
    'Purchase',
  );
  assert.equal(source.entities.definitions.goblin.name, 'Goblin');
  assert.equal(projectCatalog(final).records[1].name, 'Maker');
});
test('invalid conditions, names, categories and stale or executable fields are rejected', () => {
  const source = contentFixture(),
    catalog = projectCatalog(source);
  for (const edit of [
    change(['name'], 'Goblin', ''),
    change(['group'], 'npc', 'shared'),
    change(['name'], 'Old', 'New'),
    change(
      ['dialogues', 0, 'dialogue', 'choices', 0, 'binding'] satisfies [
        string,
        number,
        string,
        string,
        number,
        string,
      ],
      'buy',
      'evil',
    ),
    change(
      ['actions', 0, 'condition'] satisfies [string, number, string],
      'true',
      '{"javascript":"evil()"}',
    ),
    change(
      ['actions', 0, 'condition'] satisfies [string, number, string],
      'true',
      '{"path":"__proto__.x","eq":true}',
    ),
  ])
    assert.throws(() => planEditorWrite(catalog, source, [edit]));
});
async function request(
  writer: ReturnType<typeof createEditorWriter>,
  payload?: {
    catalogFingerprint: string | undefined;
    changes:
      | { record: string; path: (string | number)[]; before: string; after: string }[]
      | { record: string; path: (string | number)[]; before: string; after: string }[];
  },
  token = writer.status().token,
) {
  const req = Object.assign(Readable.from([JSON.stringify(payload)]), {
    headers: {} as Record<string, string>,
  });
  Object.assign(req, {
    url: '/__editor/save',
    method: 'POST',
    headers: { 'x-editor-token': token },
  });
  let code: number | undefined, result!: { job: import('../src/types/editor.ts').EditorSaveJob };
  await writer.handle(req, {
    writeHead(s: number) {
      code = s;
    },
    end(s: string) {
      result = JSON.parse(s);
    },
  });
  return { code, result };
}
async function temporary(t: test.TestContext, rebuild?: (() => Promise<never>) | undefined) {
  const root = await mkdtemp(join(tmpdir(), 'sf-json-editor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'content'), { recursive: true });
  await mkdir(join(root, 'editor'), { recursive: true });
  const source = contentFixture();
  source.dialogues.shared = {
    'tweet-test': {
      id: 'tweet-test',
      start: 'start',
      nodes: { start: { id: 'start', text: 'Tweet story.', end: true } },
    },
    'other-test': {
      id: 'other-test',
      start: 'start',
      nodes: { start: { id: 'start', text: 'Goose rumor.', end: true } },
    },
  };
  const sources = writableContentSources(source, ['tweet-test']);
  for (const key of contentSourceKeys) {
    const file = join(root, 'content', contentSourcePaths[key]);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(sources[key]));
  }
  await writeFile(join(root, 'editor.html'), 'original');
  return {
    root,
    writer: createEditorWriter({ root, ...(rebuild ? { rebuild } : {}) }),
    source: await readContent(root),
  };
}
test('filesystem saves publish fresh JSON and editor content without a world build', async (t) => {
  const { root, writer, source } = await temporary(t),
    payload = {
      catalogFingerprint: source.revision,
      changes: [change(['name'], 'Goblin', 'Workshop goblin')],
    };
  assert.equal((await request(writer, payload, 'invalid')).code, 403);
  assert.equal((await request(writer, { ...payload, catalogFingerprint: 'stale' })).code, 409);
  const saved = await request(writer, payload);
  assert.equal(saved.code, 200);
  assert.ok(saved?.result != null, 'Missing test fixture: saved.result');
  assert.equal(saved.result.job.phase, 'done');
  assert.equal((await readContent(root)).entities.definitions.goblin.name, 'Workshop goblin');
  const runtime = JSON.parse(await readFile(join(root, 'content/runtime.json'), 'utf8'));
  assert.equal(runtime.entities.definitions.goblin.name, 'Workshop goblin');
  assert.equal(
    JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8')).revision,
    runtime.revision,
  );
  assert.match(await readFile(join(root, 'editor.html'), 'utf8'), /Workshop goblin/);
  await writeFile(
    join(root, 'editor/build-meta.json'),
    JSON.stringify({ fingerprint: 'newer-editor-build' }),
  );
  const req = Object.assign(Readable.from([]), { headers: {} as Record<string, string> });
  Object.assign(req, { url: '/__editor/status', method: 'GET' });
  let status!: import('../src/types/editor.ts').WriterStatus;
  await writer.handle(req, {
    writeHead() {},
    end(value: string) {
      status = JSON.parse(value);
    },
  });
  assert.ok(status != null, 'Missing test fixture: status');
  assert.equal(status.job, null, 'an external rebuild must not cause a stale-job reload loop');
});
test('shared dialogue edits save in their original source folders', async (t) => {
  const { root, writer, source } = await temporary(t);
  const result = await request(writer, {
    catalogFingerprint: source.revision,
    changes: [
      change(['dialogue', 'intro'], 'Tweet story.', 'A new tweet story.', 'shared:tweet-test'),
      change(['dialogue', 'intro'], 'Goose rumor.', 'A new goose rumor.', 'shared:other-test'),
    ],
  });
  assert.equal(result.code, 200, JSON.stringify(result.result));
  const readGroup = async (key: 'tweetDerived' | 'other') =>
    JSON.parse(await readFile(join(root, 'content', contentSourcePaths[key]), 'utf8'));
  const tweetDerived = await readGroup('tweetDerived');
  const other = await readGroup('other');
  assert.deepEqual(Object.keys(tweetDerived), ['tweet-test']);
  assert.deepEqual(Object.keys(other), ['other-test']);
  assert.equal(tweetDerived['tweet-test'].nodes.start.text, 'A new tweet story.');
  assert.equal(other['other-test'].nodes.start.text, 'A new goose rumor.');
});
test('publication failure rolls source files back and permits a clean retry', async (t) => {
  const { root, writer, source } = await temporary(t, async () => {
    throw Error('disk unavailable');
  });
  const before = await readFile(join(root, 'content/entities.json'), 'utf8');
  const otherFile = join(root, 'content', contentSourcePaths.other);
  const beforeOther = await readFile(otherFile, 'utf8');
  assert.equal(
    (
      await request(writer, {
        catalogFingerprint: source.revision,
        changes: [
          change(['name'], 'Goblin', 'Maker'),
          change(['dialogue', 'intro'], 'Goose rumor.', 'A changed rumor.', 'shared:other-test'),
        ],
      })
    ).code,
    500,
  );
  assert.equal(await readFile(join(root, 'content/entities.json'), 'utf8'), before);
  assert.equal(await readFile(otherFile, 'utf8'), beforeOther);
  assert.equal(writer.status().busy, false);
});

test('resetting a condition to true removes it so fallback variants retain their priority', () => {
  const source = contentFixture(),
    catalog = projectCatalog(source);
  const path = ['dialogues', 0, 'dialogue', 'choices', 0, 'condition'] satisfies [
    string,
    number,
    string,
    string,
    number,
    string,
  ];
  const before = requiredFixture(
    requiredFixture(catalog.records[0].dialogues[0].dialogue).choices,
  )[0].condition;
  const next = planEditorWrite(catalog, source, [change(path, before, 'true')]);
  assert.ok(
    next?.dialogues?.variants?.conversation?.nodes != null,
    'Missing test fixture: next.dialogues.variants.conversation.nodes',
  );
  assert.equal(
    Object.hasOwn(next.dialogues.variants.conversation.nodes.greeting.choices[0], 'when'),
    false,
  );
});
