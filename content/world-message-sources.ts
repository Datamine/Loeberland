import type { ContentBundle } from '../src/types/content.ts';

type Texts = ContentBundle['texts'];
export type WorldMessageSources = Texts['texts'];
export const WORLD_MESSAGE_PREFIX = 'world-message.';

export function mergeWorldMessages<T extends { texts: WorldMessageSources }>(
  texts: T,
  messages: WorldMessageSources,
): T {
  return { ...texts, texts: { ...texts.texts, ...messages } };
}

export function splitWorldMessages(texts: Texts) {
  const general: Texts['texts'] = {};
  const worldMessages: WorldMessageSources = {};
  for (const [id, entry] of Object.entries(texts.texts))
    (id.startsWith(WORLD_MESSAGE_PREFIX) ? worldMessages : general)[id] = entry;
  return { texts: { ...texts, texts: general }, worldMessages };
}
