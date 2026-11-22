import type { ContentBundle } from '../src/types/content.ts';

export type SharedChains = ContentBundle['dialogues']['shared'];

export function mergeDialogueSources(
  dialogues: object,
  tweetDerived: SharedChains,
  other: SharedChains,
) {
  for (const id of Object.keys(tweetDerived))
    if (Object.hasOwn(other, id)) throw new Error('Duplicate shared conversation: ' + id);
  return { ...dialogues, shared: { ...tweetDerived, ...other } };
}
