import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { validateContent } from './validate.js';
import type { PathLike } from 'fs';
import type { ContentBundle } from '../src/types/content.ts';
import itemDefaults from './items.json' with { type: 'json' };
import { mergeDialogueSources, type SharedChains } from './dialogue-sources.ts';
import {
  mergeWorldMessages,
  splitWorldMessages,
  type WorldMessageSources,
} from './world-message-sources.ts';

const contentFiles = ['entities', 'dialogues', 'texts', 'items'] as const;
export const contentSourcePaths = {
  entities: 'entities.json',
  items: 'items.json',
  dialogues: 'dialogues.json',
  texts: 'texts.json',
  worldMessages: 'world-messages.json',
  tweetDerived: 'dialogues/tweet-derived/chains.json',
  other: 'dialogues/other/chains.json',
} as const;
type ContentSources = Pick<ContentBundle, 'entities' | 'texts' | 'items'> & {
  dialogues: Omit<ContentBundle['dialogues'], 'shared'>;
  tweetDerived: SharedChains;
  other: SharedChains;
  worldMessages: WorldMessageSources;
};
export const contentSourceKeys = Object.keys(contentSourcePaths) as (keyof ContentSources)[];
export const gameRoot = new URL('../', import.meta.url).pathname;
export function contentRevision(bundle: ContentBundle) {
  return createHash('sha256')
    .update(JSON.stringify(contentFiles.map((key) => bundle[key])))
    .digest('hex')
    .slice(0, 20);
}
export function writableContentSources(
  bundle: ContentBundle,
  tweetIds: Iterable<string>,
): ContentSources {
  const ids = new Set(tweetIds);
  const { shared, ...dialogues } = bundle.dialogues;
  const tweetDerived: SharedChains = {},
    other: SharedChains = {};
  for (const [id, chain] of Object.entries(shared))
    (ids.has(id) ? tweetDerived : other)[id] = chain;
  return {
    entities: bundle.entities,
    items: bundle.items ?? { schema: 1, items: itemDefaults.items },
    dialogues,
    ...splitWorldMessages(bundle.texts),
    tweetDerived,
    other,
  };
}
export async function readAuthoredContent(root = gameRoot) {
  const values = await Promise.all(
    contentSourceKeys.map(async (key) => [
      key,
      JSON.parse(await readFile(resolve(root, 'content', contentSourcePaths[key]), 'utf8')),
    ]),
  );
  const sources = Object.fromEntries(values) as ContentSources;
  const { entities, items, dialogues, texts, worldMessages, tweetDerived, other } = sources;
  const bundle = validateContent({
    entities,
    items,
    dialogues: mergeDialogueSources(dialogues, tweetDerived, other),
    texts: mergeWorldMessages(texts, worldMessages),
  });
  return { sources, bundle: Object.assign(bundle, { revision: contentRevision(bundle) }) };
}
export async function readContent(root = gameRoot) {
  return (await readAuthoredContent(root)).bundle;
}
export async function atomicWrite(
  path: PathLike,
  text:
    | string
    | NodeJS.ArrayBufferView<ArrayBufferLike>
    | Iterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>>
    | AsyncIterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>>,
) {
  const temporary = path + '.' + randomBytes(6).toString('hex') + '.tmp';
  await writeFile(temporary, text);
  await rename(temporary, path);
}
export async function publishContent(input: unknown, root = gameRoot) {
  const bundle = validateContent(input);
  const revision = contentRevision(bundle);
  bundle.revision = revision;
  await atomicWrite(resolve(root, 'content/runtime.json'), JSON.stringify(bundle) + '\n');
  await atomicWrite(
    resolve(root, 'content/manifest.json'),
    JSON.stringify({ schema: 1, revision: bundle.revision }) + '\n',
  );
  return Object.assign(bundle, { revision });
}
