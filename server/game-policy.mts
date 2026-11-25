import type { IncomingMessage } from 'node:http';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface GamePolicy {
  allowNewCharacter(request: IncomingMessage, verified: boolean): boolean | 'verify';
  characterVerification?: {
    page(parentOrigin: string, challenge: string): { body: string; csp: string };
    verify(request: IncomingMessage, challenge: string, response: string): Promise<boolean>;
  };
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
  const verification = policy.characterVerification;
  if (
    verification !== undefined &&
    (typeof verification?.page !== 'function' || typeof verification.verify !== 'function')
  )
    throw new Error('GAME_POLICY_MODULE characterVerification must provide page and verify');
  return policy;
}
