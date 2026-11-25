import { contentText } from '../src/content-runtime.ts';
interface ValidName {
  ok: true;
  name: string;
  canonical: string;
}
interface InvalidName {
  ok: false;
  message: string;
  retryAt?: number;
}
type RenameResult =
  | (ValidName & { retryAt?: number; unchanged?: boolean })
  | { ok: true; name: string; unchanged: true; retryAt: number }
  | InvalidName;
import { randomInt } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export type UsernamePolicy = (canonical: string) => boolean;

export async function loadUsernamePolicy(path = process.env.USERNAME_POLICY_MODULE) {
  if (!path) return undefined;
  if (!isAbsolute(path)) throw new Error('USERNAME_POLICY_MODULE must be an absolute path');
  const { default: policy }: { default?: UsernamePolicy } = await import(pathToFileURL(path).href);
  if (typeof policy !== 'function')
    throw new Error('USERNAME_POLICY_MODULE must export a username policy as its default export');
  return policy;
}

export const RENAME_COOLDOWN_MS = 60_000;
const nameBeginnings = [
  'Fog',
  'Bay',
  'Oak',
  'Pine',
  'Dune',
  'Moon',
  'Sun',
  'Moss',
  'Wild',
  'Blue',
  'Red',
  'Sea',
  'Gold',
  'Star',
  'Lake',
  'Mist',
  'Sky',
  'Rose',
  'Dawn',
  'Hill',
  'Cove',
  'Reed',
  'Glen',
  'Fern',
];
const nameEndings = [
  'Otter',
  'Fox',
  'Duck',
  'Wren',
  'Bear',
  'Seal',
  'Lynx',
  'Finch',
  'Kite',
  'Owl',
  'Wolf',
  'Hare',
  'Moth',
  'Puma',
  'Lark',
  'Trout',
] satisfies [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
/** Generated names follow the same syntax and availability rules as chosen
 * names. Their persisted changed=0 leaves the first rename unlocked. */
export function generateUsername(
  unavailable: (canonical: string) => boolean = () => false,
  draw = randomInt,
) {
  for (let attempt = 0; attempt < 128; attempt++) {
    const candidate =
        nameBeginnings[draw(nameBeginnings.length)] +
        nameEndings[draw(nameEndings.length)] +
        draw(36 ** 3)
          .toString(36)
          .padStart(3, '0'),
      result = normalizeUsername(candidate);
    if (result.ok && !unavailable(result.canonical)) return result;
  }
  throw new Error('Unable to assign an available username. Please reconnect.');
}
export function normalizeUsername(
  value: unknown,
  allowUsername?: UsernamePolicy,
): ValidName | InvalidName {
  if (typeof value !== 'string')
    return {
      ok: false,
      message: contentText(
        'world-message.server.usernames.choose-a-username-with-1-12-letters-numbers-or-underscores',
      ),
    };
  const name = value.normalize('NFKC').trim();
  if (!/^[A-Za-z0-9_]{1,12}$/.test(name))
    return {
      ok: false,
      message: contentText(
        'world-message.server.usernames.use-1-12-letters-numbers-or-underscores',
      ),
    };
  const canonical = name.toLowerCase();
  if (/^guest\d+$/.test(canonical) || allowUsername?.(canonical) === false)
    return {
      ok: false,
      message: contentText(
        'world-message.server.usernames.that-username-is-unavailable-please-choose-another',
      ),
    };
  return { ok: true, name, canonical };
}
export function renameDecision({
  normalized: result,
  owner,
  now,
  lastChanged = 0,
  current = null,
  takenBy = null,
}: {
  normalized: ValidName | InvalidName;
  owner: string;
  now: number;
  lastChanged?: number;
  current?: string | null;
  takenBy?: string | null;
}): RenameResult {
  if (!result.ok) return result;
  if (current?.toLowerCase() === result.canonical)
    return {
      ok: true,
      name: current,
      unchanged: true,
      retryAt: lastChanged ? lastChanged + RENAME_COOLDOWN_MS : 0,
    };
  if (lastChanged && now < lastChanged + RENAME_COOLDOWN_MS)
    return {
      ok: false,
      message: contentText(
        'world-message.server.usernames.wait-seconds-before-changing-your-username',
        { value1: String(Math.ceil((lastChanged + RENAME_COOLDOWN_MS - now) / 1000)) },
      ),
      retryAt: lastChanged + RENAME_COOLDOWN_MS,
    };
  if (takenBy && takenBy !== owner)
    return {
      ok: false,
      message: contentText('world-message.server.usernames.that-username-is-already-taken'),
    };
  return { ...result, retryAt: now + RENAME_COOLDOWN_MS };
}
