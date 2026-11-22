import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { isRecord } from '../src/types/json.ts';
import type { GameplayStore } from '../src/types/storage.ts';

const derive = promisify(scrypt);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value) <= 256;
export function createCharacterAccounts(store: GameplayStore, now: () => number) {
  const attempts = new Map<string, { count: number; expires: number }>();
  const deviceOwners = new Map<string, Promise<string>>();
  let working = 0;
  async function credential(owner: string) {
    const value = await store.get('character-password:' + owner);
    return isRecord(value) && typeof value.salt === 'string' && typeof value.hash === 'string'
      ? { salt: value.salt, hash: value.hash }
      : null;
  }
  async function matches(password: unknown, record: Awaited<ReturnType<typeof credential>>) {
    if (!validPassword(password)) return false;
    const expected = record ? Buffer.from(record.hash, 'hex') : Buffer.alloc(32);
    const actual = (await derive(
      password,
      record?.salt || 'loeberland-character-login',
      32,
    )) as Buffer;
    return !!record && expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  async function resolveOwner(id: string, checkNewOwner: () => void) {
    const session = await store.get('character-session:' + id);
    if (!isRecord(session)) {
      const deviceKey = 'character-device:' + id;
      const saved = await store.get(deviceKey);
      const owner = typeof saved === 'string' ? saved : id;
      if (!(await credential(owner))) {
        if (typeof saved === 'string') return saved;
        if (
          (await store.get('player:' + id)) ||
          (await store.names()).some((row) => row.owner === id)
        )
          return id;
        checkNewOwner();
        const assigned = randomUUID();
        await store.batch([[deviceKey, assigned]]);
        return assigned;
      }
    }
    if (
      !isRecord(session) ||
      typeof session.owner !== 'string' ||
      typeof session.expires !== 'number' ||
      session.expires <= now() ||
      (await credential(session.owner))?.salt !== session.version
    )
      throw new Error('Your character login has expired. Log in again.');
    return session.owner;
  }
  async function ownerFor(token: string, checkNewOwner: () => void) {
    const id = hashToken(token);
    const pending = deviceOwners.get(id);
    if (pending) return pending;
    const resolving = resolveOwner(id, checkNewOwner);
    deviceOwners.set(id, resolving);
    try {
      return await resolving;
    } finally {
      deviceOwners.delete(id);
    }
  }
  function permitted(keys: string[]) {
    const time = now();
    for (const [key, entry] of attempts) if (entry.expires <= time) attempts.delete(key);
    if (
      working >= 4 ||
      attempts.size >= 10_000 ||
      keys.some((key) => (attempts.get(key)?.count || 0) >= 6)
    )
      return false;
    for (const key of keys) {
      const entry = attempts.get(key);
      if (entry) entry.count++;
      else attempts.set(key, { count: 1, expires: time + 60_000 });
    }
    return true;
  }
  async function logIn(
    requester: string,
    name: string,
    owner: string | undefined,
    password: unknown,
  ) {
    const fail = {
      ok: false,
      message: 'Unable to log in with that username and password. Try again shortly.',
    };
    if (!permitted(['device:' + requester, 'name:' + name])) return fail;
    working++;
    try {
      const record = owner ? await credential(owner) : null;
      if (!(await matches(password, record)) || !owner || !record) return fail;
      const { token, session } = newSession(owner, record.salt);
      await store.batch([session]);
      return { ok: true, loginToken: token };
    } finally {
      working--;
    }
  }
  function newSession(owner: string, version: string) {
    const token = randomBytes(32).toString('hex');
    const session: [string, { owner: string; version: string; expires: number }] = [
      'character-session:' + hashToken(token),
      { owner, version, expires: now() + 180 * 24 * 60 * 60 * 1000 },
    ];
    return { token, session };
  }
  async function preparePassword(owner: string, password: unknown, current: unknown) {
    if (!validPassword(password))
      return { error: 'Use a password of 8 or more characters (up to 256 bytes).' };
    if (!permitted(['password:' + owner]))
      return { error: 'Please wait before trying another password change.' };
    working++;
    try {
      const existing = await credential(owner);
      if (existing && !(await matches(current, existing)))
        return { error: 'Your current password is incorrect.' };
      const salt = randomBytes(16).toString('hex');
      const hash = ((await derive(password, salt, 32)) as Buffer).toString('hex');
      return {
        save: async () => {
          const { token, session } = newSession(owner, salt);
          await store.batch([['character-password:' + owner, { salt, hash }], session]);
          return token;
        },
      };
    } finally {
      working--;
    }
  }
  return {
    ownerFor,
    logIn,
    preparePassword,
    hasPassword: async (owner: string) => !!(await credential(owner)),
  };
}
