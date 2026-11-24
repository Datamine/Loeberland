import type { IncomingMessage } from 'node:http';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface GamePolicy {
  allowNewCharacter(request: IncomingMessage): boolean;
  reserveCharacter?(request: IncomingMessage, owner: string): false | (() => void);
  filterChat(message: {
    owner: string;
    text: string;
    scope: 'nearby' | 'server';
    quick: boolean;
  }): false | ((recipientOwner: string) => boolean) | undefined;
}

export async function loadGamePolicy(path = process.env.GAME_POLICY_MODULE) {
  if (!path) return undefined;
  if (!isAbsolute(path)) throw new Error('GAME_POLICY_MODULE must be an absolute path');
  const { default: policy }: { default?: GamePolicy } = await import(pathToFileURL(path).href);
  if (typeof policy?.allowNewCharacter !== 'function' || typeof policy.filterChat !== 'function')
    throw new Error('GAME_POLICY_MODULE must export a game policy as its default export');
  if (policy.reserveCharacter !== undefined && typeof policy.reserveCharacter !== 'function')
    throw new Error('GAME_POLICY_MODULE reserveCharacter must be a function');
  return policy;
}
