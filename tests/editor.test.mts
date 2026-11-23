import type {
  PreviewWorld,
  PreviewEntity,
  InspectionTarget,
  EditorCatalog,
} from '../src/types/editor.ts';
import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readContent } from '../content/build.mts';
import { duplicateNPCNames, groupEditorRecords } from '../editor/groups.ts';
import { projectCatalog } from '../editor/project.mts';
import { planEditorWrite } from '../editor/write-plan.mts';
import {
  applicableDraft,
  draftKey,
  identityDraftChanges,
  readDraft,
  renamedActionLabel,
} from '../editor/drafts.ts';
import {
  collectTargets,
  inspectTarget,
  isInspectableNPC,
  serializeDialogue,
} from '../editor/catalog.mts';

function fixture(): PreviewWorld {
  return {
    places: [],
    sights: [],
    merchants: [],
    lives: [],
    parrots: [],
    jailStaff: [],
    restaurantDiners: [],
    expeditions: { cows: [] },
    airship: { home: { x: 92, z: 122 } },
    spawn: { x: 1, y: 1 },
  };
}
const record = (
  entity: PreviewEntity & { id: string; label: string },
  actor = true,
): InspectionTarget => ({
  entity,
  actor,
  group: actor ? 'npc' : 'object',
  source: actor ? 'merchants' : 'sights',
  key: (actor ? 'actor:' : 'sight:') + entity.id,
  id: entity.id,
  name: entity.label,
  kind: entity.kind || 'person',
  position: { x: entity.x || 1, z: entity.z || 1 },
});

test('repeated NPCs and objects share one editor entry while preserving every original record', () => {
  const placed = [
    { key: 'cow-1', name: 'Cow', kind: 'cow', group: 'npc', description: 'A cow.' },
    { key: 'cow-2', name: 'Cow', kind: 'cow', group: 'npc', description: 'A cow.' },
    { key: 'home-1', name: 'House', kind: 'residence', group: 'object', description: '' },
    { key: 'home-2', name: 'House', kind: 'residence', group: 'object', description: '' },
    { key: 'chef', name: 'Chef', kind: 'chef', group: 'npc', description: '' },
  ];
  const before = JSON.stringify(placed);
  const groups = groupEditorRecords(placed);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0].members.map((r) => r.key),
    ['cow-1', 'cow-2'] satisfies [string, string],
  );
  assert.deepEqual(
    groups[1].members.map((r) => r.key),
    ['home-1', 'home-2'] satisfies [string, string],
  );
  assert.equal(
    groups[0].members[1],
    placed[1],
    'placement IDs, menu paths and drafts keep their original records',
  );
  assert.equal(JSON.stringify(placed), before);
});

test('the eight cows have separately editable examine text under a shared definition', async () => {
  const source = await readContent();
  const catalog = projectCatalog(source);
  const cows = catalog.records.filter((record) => record.kind === 'cow');
  assert.equal(new Set(cows.map((cow) => cow.definitionId)).size, 1);
  const groups = groupEditorRecords(cows);
  assert.equal(groups.length, 8);
  assert.ok(groups.every(({ members }) => members.length === 1));

  const target = requiredFixture(groups.find((cow) => cow.key === 'actor:south-cow-1'));
  const after = 'A cow with a new examine text.';
  const next = planEditorWrite(catalog, source, [
    { record: target.key, path: ['description'], before: target.description, after },
  ]);
  const updated = projectCatalog(next).records.filter((record) => record.kind === 'cow');
  assert.deepEqual(
    updated.map(({ key, description }) => [key, description]),
    cows.map(({ key, description }) => [key, key === target.key ? after : description]),
  );
});

test('restaurant diners and the former shared pottery placements have independent editor definitions', async () => {
  const source = await readContent();
  const catalog = projectCatalog(source);
  const names = new Map([
    ['actor:lucindas-deli-diner-0', "Lucinda's Deli Diner"],
    ['actor:lucindas-deli-diner-1', "Lucinda's Deli Diner"],
    ['actor:shanghai-kelly-diner-0', "Shanghai Kelly's Diner"],
    ['actor:shanghai-kelly-diner-1', "Shanghai Kelly's Diner"],
    ['actor:rich-table-diner-0', 'Rich Table Diner'],
    ['actor:rich-table-diner-1', 'Rich Table Diner'],
    ['sight:southern-corner-129', 'Palmetto Pottery'],
    ['sight:southern-corner-53', 'The Mill'],
    ['actor:southern-corner-129-neighbor', 'Palmetto Pottery Shopkeeper'],
    ['actor:southern-corner-53-neighbor', 'The Mill Barista'],
  ]);
  const records = catalog.records.filter(({ key }) => names.has(key));
  assert.equal(records.length, names.size);
  assert.equal(groupEditorRecords(records).length, names.size);
  for (const record of records) {
    assert.equal(record.definitionId, record.key);
    assert.equal(record.name, names.get(record.key));
    assert.equal(catalog.records.filter((r) => r.definitionId === record.definitionId).length, 1);
    for (const variant of record.dialogues) {
      assert.deepEqual(source.dialogues.variants[variant.id].placements, [record.key]);
    }
  }

  const shopkeeper = requiredFixture(
    records.find(({ key }) => key === 'actor:southern-corner-53-neighbor'),
  );
  const peer = requiredFixture(
    records.find(({ key }) => key === 'actor:southern-corner-129-neighbor'),
  );
  const changedIntro = 'Welcome to my cafe.';
  const next = planEditorWrite(catalog, source, [
    {
      record: shopkeeper.key,
      path: ['name'],
      before: shopkeeper.name,
      after: 'Cafe Manager',
    },
    {
      record: shopkeeper.key,
      path: ['dialogues', 0, 'dialogue', 'intro'],
      before: requiredFixture(shopkeeper.dialogues[0].dialogue?.intro),
      after: changedIntro,
    },
  ]);
  const updated = projectCatalog(next).records;
  const edited = requiredFixture(updated.find(({ key }) => key === shopkeeper.key));
  assert.equal(edited.name, 'Cafe Manager');
  assert.equal(edited.dialogues[0].dialogue?.intro, changedIntro);
  assert.deepEqual(
    updated.find(({ key }) => key === peer.key),
    peer,
  );
});

test('duplicate NPC names can be filtered with or without matching examine text', () => {
  const records = [
    { group: 'npc', name: 'Cow', description: 'Brown spots.' },
    { group: 'npc', name: ' cow ', description: 'White spots.' },
    { group: 'npc', name: 'Diner', description: 'Enjoys dinner.' },
    { group: 'npc', name: 'Diner', description: 'Enjoys dinner.' },
    { group: 'npc', name: 'Giraffe', description: 'A tall animal.' },
    { group: 'object', name: 'Giraffe', description: 'A tall statue.' },
  ];
  assert.deepEqual([...duplicateNPCNames(records)], ['cow', 'diner']);
  assert.deepEqual([...duplicateNPCNames(records, { differentExamineText: true })], ['cow']);
});

test('name and NPC/Object drafts cover every placement and keep original source records intact', () => {
  const members = [
    { key: 'cow-1', name: 'Cow', group: 'npc' },
    { key: 'cow-2', name: 'Cow', group: 'npc' },
  ];
  const roots = new Map(members.map((r) => [r.key, r]));
  const changes = [
    ...identityDraftChanges(members, 'name', 'Bronze cow'),
    ...identityDraftChanges(members, 'group', 'object'),
  ];
  const drafts = Object.fromEntries(changes.map((c) => [draftKey(c.record, c.path), c]));
  for (const member of members) {
    assert.equal(readDraft(roots, drafts, member.key, ['name']), 'Bronze cow');
    assert.equal(readDraft(roots, drafts, member.key, ['group']), 'object');
    assert.equal(member.name, 'Cow');
    assert.equal(member.group, 'npc');
  }
  assert.ok(changes.every((c) => applicableDraft(roots, c)));
  assert.equal(
    readDraft(roots, {}, 'cow-1', ['group']),
    'npc',
    'discard restores the source category',
  );
  const reverse = identityDraftChanges(
    [{ key: 'statue', name: 'Statue', group: 'object' }],
    'group',
    'npc',
  );
  assert.equal(reverse[0].before, 'object');
  assert.equal(reverse[0].after, 'npc');
});

test('identity drafts reject blank names and invalid categories and preserve source-conflict detection', () => {
  const members = [{ key: 'cow', name: 'Cow', group: 'npc' }];
  for (const value of ['', '  ', 'x'.repeat(81)] satisfies [string, string, string])
    assert.throws(() => identityDraftChanges(members, 'name', value), /name/);
  assert.throws(() => identityDraftChanges(members, 'group', 'shared'), /NPC or Object/);
  assert.throws(() => identityDraftChanges(members, 'id', 'new-id'), /Unknown identity field/);
  const roots = new Map([['cow', { ...members[0], name: 'Highland cow' }]]);
  const change = identityDraftChanges(members, 'name', 'Statue')[0];
  assert.equal(applicableDraft(roots, change), false);
  assert.equal(
    readDraft(roots, { [draftKey('cow', ['name'])]: change }, 'cow', ['name']),
    'Highland cow',
  );
});

test('renamed action previews preserve verbs, levels and literal user text', () => {
  assert.equal(renamedActionLabel('Observe Cow statue', 'Cow', 'Cow statue'), 'Observe Cow statue');
  assert.equal(
    renamedActionLabel('Attack Cow (Level 2)', 'Cow', 'Bronze cow'),
    'Attack Bronze cow (Level 2)',
  );
  assert.equal(renamedActionLabel('Walk here', 'Cow', 'Bronze cow'), 'Walk here');
  assert.equal(renamedActionLabel('Examine House', 'House', '<House> $&'), 'Examine <House> $&');
});

test('grouping keeps location-specific dialogue available and separates different entity types', () => {
  const groups = groupEditorRecords([
    {
      key: 'fuel-1',
      name: 'Fuel attendant',
      kind: 'fuel-attendant',
      group: 'npc',
      description: '',
      dialogues: ['First price'],
    },
    {
      key: 'fuel-2',
      name: 'Fuel attendant',
      kind: 'fuel-attendant',
      group: 'npc',
      description: '',
      dialogues: ['Second price'],
    },
    { key: 'other', name: 'Fuel attendant', kind: 'other', group: 'npc', description: '' },
    {
      key: 'object',
      name: 'Fuel attendant',
      kind: 'fuel-attendant',
      group: 'object',
      description: '',
    },
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0].members.map((r) => r.dialogues),
    [['First price'], ['Second price']],
  );
});

test('editor excludes generic pedestrians and children while keeping named women and yellow mobile targets', () => {
  for (const label of ['Man', 'Woman', 'Child', 'man', 'Woman '] satisfies [
    string,
    string,
    string,
    string,
    string,
  ])
    assert.equal(isInspectableNPC({ label }), false);
  assert.equal(isInspectableNPC({ label: 'Professor Meridian', female: true }), true);
  assert.equal(isInspectableNPC({ label: 'A named child', child: true }), false);
  const world = fixture();
  world.secretStairs = {
    id: 'illuminati-stairway',
    kind: 'secret-stairs',
    label: 'Illuminati passage',
  };
  world.merchants = [
    { id: 'woman', label: 'Woman' },
    { id: 'chef', label: 'Cotogna chef', kind: 'chef', x: 2, z: 2 },
  ];
  world.sights = [
    world.secretStairs,
    { id: 'bike', kind: 'bike', label: 'Bicycle' },
    { id: 'sand', kind: 'sand', label: 'Sand' },
  ];
  const targets = collectTargets(world);
  assert.ok(!targets.some((t) => t.id === 'woman' || t.id === 'sand'));
  assert.equal(requiredFixture(targets.find((t) => t.id === 'chef')).group, 'npc');
  assert.equal(requiredFixture(targets.find((t) => t.id === 'bike')).group, 'npc');
  assert.ok(targets.some((t) => t.id === 'shared-airship-rope'));
  assert.ok(targets.some((t) => t.id === 'illuminati-stairway'));
});

test('editor captures the real gym menu order and conditional training options', async () => {
  const world = fixture(),
    gym = {
      id: 'sf-fitness',
      kind: 'gym',
      label: 'SF Fitness',
      x: 1,
      z: 1,
      entry: { x: 1, y: 1 },
      description: 'A gym.',
    };
  world.sights = [gym];
  const r = await inspectTarget(world, record(gym, false));
  assert.match(r.actions[0].actions[0].label, /^Perform /);
  assert.equal(r.actions[0].actions.filter((a) => a.label.startsWith('Perform ')).length, 4);
  assert.ok(!r.actions[0].actions.some((a) => a.id === 'interaction.27'));
  const training = requiredFixture(r.actions.find((v) => v.states.includes('Training')));
  assert.equal(training.actions[0].id, 'interaction.27');
  assert.match(training.actions[0].label, /^Stop training\b/);
});

test('professor quest branches come from the actual dispatcher without modifying the placed NPC', async () => {
  const world = fixture(),
    npc = {
      id: 'ada-meridian',
      label: 'Professor Ada Meridian',
      name: 'Professor Ada Meridian',
      researcher: true,
      x: 1,
      z: 1,
    };
  world.merchants = [npc];
  const before = JSON.stringify(npc),
    r = await inspectTarget(world, record(npc));
  assert.equal(JSON.stringify(npc), before);
  assert.equal(r.dialogues.length, 4);
  const start = r.dialogues.find((v) => v.states.includes('New visitor'));
  assert.ok(
    requiredFixture(requiredFixture(start).dialogue).choices.some(
      (c) => c.label === 'Accept quest' && c.binding,
    ),
  );
  assert.ok(requiredFixture(requiredFixture(start).dialogue).choices.every((c) => !c.sharedPool));
  assert.ok(
    requiredFixture(
      requiredFixture(r.dialogues.find((v) => v.states.includes('Monkey quest: carrying')))
        .dialogue,
    ).choices.some((c) => c.label === 'Introduce the monkey'),
  );
});

test('industrial armorer inspection includes the production ammo offer and quest stock states', async () => {
  const world = fixture(),
    npc = { id: 'industrial-armorer', label: 'Armorer', questRole: 'armorer', x: 1, z: 1 };
  world.merchants = [npc];
  const r = await inspectTarget(world, record(npc));
  assert.ok(
    r.dialogues.every((v) =>
      requiredFixture(v.dialogue).choices.some((c) => c.label === 'Buy 20 akimbo rounds · 5 coins'),
    ),
  );
  assert.ok(
    requiredFixture(
      requiredFixture(r.dialogues.find((v) => v.states.includes('Alien quest complete'))).dialogue,
    ).choices.some((c) => c.label === 'Buy battleaxe · 50 coins'),
  );
});

test('serializing menus reads text but never invokes a purchase callback', () => {
  let purchases = 0;
  const d = serializeDialogue({
    intro: () => 'Hello.',
    choices: [
      {
        label: 'Buy',
        accept: () => {
          purchases++;
        },
        receipt: 'Thanks.',
      },
    ],
  });
  assert.equal(purchases, 0);
  assert.equal(requiredFixture(d).intro, 'Hello.');
  assert.match(requiredFixture(requiredFixture(d).choices[0].binding), /purchases/);
});

test('generated editor embeds its full catalog and shared conversation trees without depending on a game server', async () => {
  const html = await readFile(new URL('../editor.html', import.meta.url), 'utf8');
  const match = html.match(
    /<script id="editor-catalog" type="application\/json">([\s\S]*?)<\/script>/,
  );
  assert.ok(match);
  const data = JSON.parse(match[1]) as EditorCatalog;
  assert.ok(data.records.filter((r) => r.group === 'object').length > 150);
  assert.ok(data.records.filter((r) => r.group === 'npc').length > 100);
  assert.ok(!data.records.some((r) => /^(Man|Woman|Child)$/.test(r.name)));
  assert.ok(
    data.records.every((r) => r.actions.length && r.actions.every((v) => v.actions.length)),
  );
  assert.ok(data.records.some((r) => r.id === 'ssf-battery-seller' && r.dialogues.length));
  assert.equal(
    requiredFixture(data.records.find((r) => r.id === 'illuminati-stairway')).source,
    'sights',
  );
  assert.ok(data.sharedDialogue.length >= 100);
  assert.ok(data.sharedDialogue.every((r) => !r.dialogue.sharedPool && r.dialogue.intro));
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet/);
});

test('nested dialogue menus inherit their exit label and repeat behavior from the game dialogue', () => {
  const tree = serializeDialogue({
    intro: 'Welcome.',
    decline: 'Another time',
    repeat: true,
    choices: [{ label: 'Tell me more', next: { intro: 'More.', choices: [] } }],
  });
  assert.equal(requiredFixture(requiredFixture(tree).choices[0].next).decline, 'Another time');
  assert.equal(requiredFixture(requiredFixture(tree).choices[0].next).repeat, true);
});
