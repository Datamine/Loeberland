import type { IncomingMessage } from 'node:http';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameplayStore } from '../src/types/storage.ts';

export class CharacterBanned extends Error {}

export interface PlayerChatSubmission {
  owner: string;
  text: string;
  scope: 'nearby' | 'server';
  quick: boolean;
}

type ChatModerationVerdict =
  | 'allow'
  | 'unavailable'
  | { outcome: 'blocked' | 'banned'; warning: string };

export interface ChatModeration {
  review(message: PlayerChatSubmission): ChatModerationVerdict | Promise<ChatModerationVerdict>;
  delivered(message: PlayerChatSubmission, recipient: string): void;
  isBanned(owner: string): Promise<boolean>;
}

export interface ChatLogEntry {
  at: number;
  owner: string;
  x: number;
  y: number;
  z: number;
  scope: PlayerChatSubmission['scope'];
  message: string;
  outcome: 'allowed' | 'censored' | 'throttled' | 'not-allowed' | 'unavailable' | 'interrupted';
}

export interface ChatLog {
  append(entry: ChatLogEntry): void;
  drain(): Promise<void>;
}

export interface GamePolicy {
  allowNewCharacter(request: IncomingMessage, verified: boolean): boolean | 'verify';
  characterVerification?: {
    page(parentOrigin: string, challenge: string): { body: string; csp: string };
    verify(request: IncomingMessage, challenge: string, response: string): Promise<boolean>;
  };
  reserveCharacter?(
    request: IncomingMessage,
    owner: string,
    verified: boolean,
  ): false | 'verify' | (() => void);
  filterChat(message: PlayerChatSubmission): false | ((recipientOwner: string) => boolean) | undefined;
  openChatModeration?(store: Pick<GameplayStore, 'get' | 'batch'>): ChatModeration;
  openChatLog?(): Promise<ChatLog>;
}

export async function loadGamePolicy(path = process.env.GAME_POLICY_MODULE) {
  if (!path) return undefined;
  if (!isAbsolute(path)) throw new Error('GAME_POLICY_MODULE must be an absolute path');
  const { default: policy }: { default?: GamePolicy } = await import(pathToFileURL(path).href);
  if (typeof policy?.allowNewCharacter !== 'function' || typeof policy.filterChat !== 'function')
    throw new Error('GAME_POLICY_MODULE must export a game policy as its default export');
  if (policy.reserveCharacter !== undefined && typeof policy.reserveCharacter !== 'function')
    throw new Error('GAME_POLICY_MODULE reserveCharacter must be a function');
  if (policy.openChatModeration !== undefined && typeof policy.openChatModeration !== 'function')
    throw new Error('GAME_POLICY_MODULE openChatModeration must be a function');
  if (policy.openChatLog !== undefined && typeof policy.openChatLog !== 'function')
    throw new Error('GAME_POLICY_MODULE openChatLog must be a function');
  const verification = policy.characterVerification;
  if (
    verification !== undefined &&
    (typeof verification?.page !== 'function' || typeof verification.verify !== 'function')
  )
    throw new Error('GAME_POLICY_MODULE characterVerification must provide page and verify');
  return policy;
}
