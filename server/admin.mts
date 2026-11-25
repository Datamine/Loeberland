import type { GameCheckpoint, NameReservation } from '../src/types/storage.ts';
import { isRecord, errorMessage } from '../src/types/json.ts';
interface AdminBackend {
  kind: string;
  location: string;
  list: () => Promise<{ keys: string[]; names: NameReservation[] }>;
  get: (kind: string, key: string) => Promise<string | null | undefined>;
  save: (kind: string, key: string, original: string, value: object) => Promise<unknown>;
  close: () => Promise<unknown>;
}
interface AdminStore extends Omit<AdminBackend, 'get' | 'save'> {
  get: (kind: string, key: string) => Promise<string>;
  save: (kind: string, key: string, original: unknown, value: unknown) => Promise<unknown>;
}
interface AdminOptions {
  store?: AdminStore;
  port?: number;
  host?: string;
  username?: string;
  password?: string;
  readOnly?: boolean;
  publicHost?: string;
}
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  adminEditResult,
  checkpointRecord,
  editCheckpoint,
  pendingAdminEdit,
  type OwnerRecord,
} from './admin-edit.mts';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadUsernamePolicy, normalizeUsername, type UsernamePolicy } from './usernames.mts';

import type { BinaryLike } from 'crypto';

const defaultFile = fileURLToPath(new URL('./data/world.sqlite', import.meta.url));
const prefix = 'loeberland:v1:';
const fail = (status: number, message: string | undefined) =>
  Object.assign(new Error(message), { status });

function adminAuthorization(username: string | undefined, password: string | undefined) {
  if (
    typeof username !== 'string' ||
    !username ||
    /[:\x00-\x1f\x7f]/.test(username) ||
    typeof password !== 'string' ||
    !password ||
    /[\x00-\x1f\x7f]/.test(password)
  ) {
    throw Error(
      'Set ADMIN_USERNAME and ADMIN_PASSWORD in server/.env (or ADMIN_ENV_FILE) before starting the admin panel. The username cannot contain a colon.',
    );
  }
  const digest = (value: BinaryLike | Buffer<ArrayBuffer>) =>
    createHash('sha256').update(value).digest();
  const expected = digest(username + ':' + password);
  return (header: string | undefined) =>
    typeof header === 'string' &&
    /^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header) &&
    timingSafeEqual(expected, digest(Buffer.from(header.slice(6), 'base64')));
}

const isAccountKey = (key: string) =>
  /^character-(password|session|device|google|google-owner):/.test(key);
type PlayerParts = [state: string | null, username: string | null];

function validate(
  kind: string,
  key: string,
  value: unknown,
  allowUsername: UsernamePolicy | undefined,
): asserts value is Record<string, unknown> {
  if (!['state', 'usernames', 'player'].includes(kind) || typeof key !== 'string' || !key)
    throw fail(400, 'Choose an existing record.');
  if (!isRecord(value)) throw fail(400, 'The value must be a JSON object.');
  if (kind === 'player') {
    if (Object.keys(value).sort().join(',') !== 'state,username')
      throw fail(400, 'Player fields must be state and username.');
    if (value.state !== null) validate('state', 'player:' + key, value.state, allowUsername);
    if (value.username !== null) validate('usernames', key, value.username, allowUsername);
  }
  if (kind === 'usernames') {
    const name = normalizeUsername(value.name, allowUsername);
    if (!name.ok) throw fail(400, name.message);
    if (value.owner !== key || value.canonical !== name.canonical || value.name !== name.name)
      throw fail(400, 'Keep owner unchanged and canonical equal to the lowercase name.');
    if (
      typeof value.changed !== 'number' ||
      !Number.isSafeInteger(value.changed) ||
      value.changed < 0
    )
      throw fail(400, 'changed must be a nonnegative integer timestamp in milliseconds.');
    if (Object.keys(value).sort().join(',') !== 'canonical,changed,name,owner')
      throw fail(400, 'Username fields must be owner, canonical, name and changed.');
  }
  if (
    kind === 'state' &&
    key.startsWith('player:') &&
    Object.hasOwn(value, 'debugTeleport') &&
    typeof value.debugTeleport !== 'boolean'
  )
    throw fail(400, 'Allow debug teleport must be true or false.');
}

export async function openAdminStore({
  filename = process.env.STATE_FILE || defaultFile,
  redisURL = process.env.REDIS_URL,
  queueEdits = false,
} = {}) {
  const allowUsername = await loadUsernamePolicy();
  let adapter: AdminBackend;
  let saveLegacyPlayer: (owner: string, previous: PlayerParts, next: OwnerRecord) => Promise<void>;
  let enqueue:
    ((kind: string, key: string, original: string, value: object) => Promise<void>) | undefined;
  if (redisURL) {
    const { createClient } = await import('redis');
    const client = createClient({
      url: redisURL,
      socket: { connectTimeout: 5000, reconnectStrategy: false },
    });
    client.on('error', (error) => console.error('Admin Redis:', error.message));
    await client.connect();
    const namesKey = prefix + 'names',
      leaseKey = prefix + 'simulation-owner';
    saveLegacyPlayer = async (owner, [state, username], next) => {
      const result = await client.eval(
        `
        if redis.call('EXISTS', KEYS[1]) == 1 then return -2 end
        if (redis.call('GET', KEYS[2]) or '') ~= ARGV[2] or
           (redis.call('HGET', KEYS[3], ARGV[1]) or '') ~= ARGV[3] then return 0 end
        if ARGV[5] ~= '' then
          local names = redis.call('HGETALL', KEYS[3])
          for i = 1, #names, 2 do
            if names[i] ~= ARGV[1] and cjson.decode(names[i+1]).canonical == ARGV[6] then return -3 end
          end
        end
        if ARGV[4] ~= '' then redis.call('SET', KEYS[2], ARGV[4]) end
        if ARGV[5] ~= '' then redis.call('HSET', KEYS[3], ARGV[1], ARGV[5]) end
        return 1
        `,
        {
          keys: [leaseKey, prefix + 'player:' + owner, namesKey],
          arguments: [
            owner,
            state ?? '',
            username ?? '',
            next.state === null ? '' : JSON.stringify(next.state),
            next.username ? JSON.stringify(next.username) : '',
            next.username?.canonical ?? '',
          ],
        },
      );
      if (result === -2)
        throw fail(409, 'Stop the game server first; its Redis ownership lease is still active.');
      if (result === -3) throw fail(409, 'That username is already taken.');
      if (result !== 1)
        throw fail(409, 'This record changed or was deleted. Reload it before saving.');
    };
    if (queueEdits) {
      enqueue = async (kind, key, original, value) => {
        const id = randomUUID();
        const owner = await client.get(leaseKey);
        if (!owner) throw fail(409, 'The game is restarting. Reload the record and try again.');
        const queued = await client.eval(
          `
          if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
          if redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', 120) then return 1 end
          return 0
          `,
          {
            keys: [leaseKey, pendingAdminEdit],
            arguments: [owner, JSON.stringify({ id, owner, kind, key, original, value })],
          },
        );
        if (queued === -1)
          throw fail(409, 'The game is restarting. Reload the record and try again.');
        if (queued !== 1) throw fail(409, 'Another admin edit is pending. Wait for it to finish.');
        const deadline = Date.now() + 120_000;
        do {
          const result = await client.get(adminEditResult(id));
          if (result === 'ok') return;
          if (result) throw fail(409, result);
          await delay(500);
        } while (Date.now() < deadline);
        throw fail(
          504,
          'The edit was not confirmed. Reload the record to check its current value.',
        );
      };
    }
    adapter = {
      kind: 'redis',
      location: 'Redis · ' + prefix,
      async list() {
        const names = Object.values(await client.hGetAll(namesKey)).map(
            (value) => JSON.parse(value) as NameReservation,
          ),
          keys = [];
        for await (const batch of client.scanIterator({ MATCH: prefix + '*', COUNT: 200 })) {
          for (const key of batch)
            if (key !== namesKey && key !== leaseKey) keys.push(key.slice(prefix.length));
        }
        return { keys: [...new Set(keys)], names };
      },
      async get(kind: string, key: string) {
        return kind === 'state' ? client.get(prefix + key) : client.hGet(namesKey, key);
      },
      async save(kind: string, key: string, original: string, value: object) {
        const script =
          kind === 'state'
            ? `
                    if redis.call('EXISTS', KEYS[1]) == 1 then return -2 end
                    local current = redis.call('GET', KEYS[2])
                    if not current or current ~= ARGV[1] then return 0 end
                    redis.call('SET', KEYS[2], ARGV[2]); return 1
                `
            : `
                    if redis.call('EXISTS', KEYS[1]) == 1 then return -2 end
                    local current = redis.call('HGET', KEYS[2], ARGV[3])
                    if not current or current ~= ARGV[1] then return 0 end
                    local names = redis.call('HGETALL', KEYS[2])
                    for i = 1, #names, 2 do
                        if names[i] ~= ARGV[3] and cjson.decode(names[i+1]).canonical == ARGV[4] then return -3 end
                    end
                    redis.call('HSET', KEYS[2], ARGV[3], ARGV[2]); return 1
                `;
        const result = await client.eval(script, {
          keys: [leaseKey, kind === 'state' ? prefix + key : namesKey] satisfies [string, string],
          arguments: [
            original,
            JSON.stringify(value),
            key,
            'canonical' in value ? String(value.canonical) : '',
          ],
        });
        if (result === -2)
          throw fail(
            409,
            'Stop the game server first; its Redis ownership lease is still active. Wait up to 15 seconds after stopping.',
          );
        if (result === -3) throw fail(409, 'That username is already taken.');
        if (result !== 1)
          throw fail(409, 'This record changed or was deleted. Reload it before saving.');
      },
      close: () => client.close(),
    };
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    // Refuse a typo instead of silently creating an empty database.
    const { stat } = await import('node:fs/promises');
    if (filename !== ':memory:')
      await stat(filename).catch(() => {
        throw Error(
          'SQLite database not found: ' + filename + '. Set STATE_FILE to the existing database.',
        );
      });
    const db = new DatabaseSync(filename);
    try {
      db.exec('PRAGMA busy_timeout=5000');
      db.prepare('SELECT key, value FROM state LIMIT 0').all();
      db.prepare('SELECT owner, canonical, name, changed FROM usernames LIMIT 0').all();
    } catch (error) {
      db.close();
      throw error;
    }
    saveLegacyPlayer = async (owner, [state, username], next) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const stateKey = 'player:' + owner;
        const currentState =
          db.prepare('SELECT value FROM state WHERE key=?').get(stateKey)?.value ?? null;
        const currentName = db
          .prepare('SELECT owner, canonical, name, changed FROM usernames WHERE owner=?')
          .get(owner);
        if (
          currentState !== state ||
          (currentName ? JSON.stringify(currentName) : null) !== username
        )
          throw fail(409, 'This record changed or was deleted. Reload it before saving.');
        if (next.state !== null)
          db.prepare('UPDATE state SET value=? WHERE key=?').run(
            JSON.stringify(next.state),
            stateKey,
          );
        if (next.username)
          db.prepare('UPDATE usernames SET canonical=?, name=?, changed=? WHERE owner=?').run(
            next.username.canonical,
            next.username.name,
            next.username.changed,
            owner,
          );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (errorMessage(error).includes('UNIQUE constraint failed'))
          throw fail(409, 'That username is already taken.');
        throw error;
      }
    };
    adapter = {
      kind: 'sqlite',
      location: filename,
      async list() {
        return {
          keys: db
            .prepare('SELECT key FROM state ORDER BY key')
            .all()
            .map((row) => row.key as string),
          names: db
            .prepare('SELECT owner, canonical, name, changed FROM usernames ORDER BY name')
            .all() as unknown as NameReservation[],
        };
      },
      async get(kind: string, key: string) {
        if (kind === 'state')
          return (
            (db.prepare('SELECT value FROM state WHERE key=?').get(key)?.value as
              string | undefined) ?? null
          );
        const row = db
          .prepare('SELECT owner, canonical, name, changed FROM usernames WHERE owner=?')
          .get(key);
        return row ? JSON.stringify(row) : null;
      },
      async save(kind: string, key: string, original: string, value: object) {
        let result;
        try {
          if (kind === 'state')
            result = db
              .prepare('UPDATE state SET value=? WHERE key=? AND value=?')
              .run(JSON.stringify(value), key, original);
          else {
            const old = JSON.parse(original) as NameReservation,
              row = value as NameReservation;
            result = db
              .prepare(
                'UPDATE usernames SET canonical=?, name=?, changed=? WHERE owner=? AND canonical=? AND name=? AND changed=?',
              )
              .run(row.canonical, row.name, row.changed, key, old.canonical, old.name, old.changed);
          }
        } catch (error) {
          if (errorMessage(error).includes('UNIQUE constraint failed'))
            throw fail(409, 'That username is already taken.');
          throw error;
        }
        if (Number(result.changes) !== 1)
          throw fail(409, 'This record changed or was deleted. Reload it before saving.');
      },
      close: async () => db.close(),
    };
  }
  // Keep the editor's player/world view after migration. Legacy keys are
  // deliberately ignored: saving one would not change the restored game.
  const registry = JSON.parse((await adapter.get('state', 'checkpoint:games')) || 'null');
  const checkpointed = !!registry?.world || !!enqueue;
  if (checkpointed) {
    const backend = adapter,
      key = 'checkpoint:game:world';
    const read = async () => {
      const raw = await backend.get('state', key);
      if (!raw) throw fail(409, 'World checkpoint is missing.');
      return { raw, document: JSON.parse(raw) as GameCheckpoint };
    };
    adapter = {
      ...backend,
      async list() {
        const { document } = await read();
        return { keys: document.records.map(([key]) => key).sort(), names: document.names };
      },
      async get(kind: string, id: string) {
        const { document } = await read(),
          value = checkpointRecord(document, kind, id);
        return value === undefined ? null : JSON.stringify(value);
      },
      async save(kind: string, id: string, original: string, value: object) {
        const { raw, document } = await read();
        const conflict = editCheckpoint(document, { kind, key: id, original, value }, !!enqueue);
        if (conflict) throw fail(409, conflict);
        if (enqueue) return enqueue(kind, id, original, value);
        await backend.save('state', key, raw, document);
      },
    };
  }
  const readLegacyPlayer = async (owner: string) => {
    const [state, username] = await Promise.all([
      adapter.get('state', 'player:' + owner),
      adapter.get('usernames', owner),
    ]);
    const previous: PlayerParts = [state ?? null, username ?? null];
    const raw =
      state == null && username == null
        ? null
        : JSON.stringify({
            state: JSON.parse(state ?? 'null'),
            username: JSON.parse(username ?? 'null'),
          });
    return { previous, raw };
  };
  return {
    ...adapter,
    async get(kind: string, key: string) {
      if (!['state', 'usernames', 'player'].includes(kind) || typeof key !== 'string' || !key)
        throw fail(400, 'Choose an existing record.');
      if (
        adapter.kind === 'redis' &&
        kind === 'state' &&
        (['names', 'simulation-owner'] satisfies [string, string]).includes(key)
      )
        throw fail(400, 'This is an internal Redis key.');
      const raw =
        kind === 'player' && !checkpointed
          ? (await readLegacyPlayer(key)).raw
          : await adapter.get(kind, key);
      if (raw == null) throw fail(404, 'Record not found.');
      return raw;
    },
    async save(kind: string, key: string, original: unknown, value: unknown) {
      validate(kind, key, value, allowUsername);
      if (typeof original !== 'string') throw fail(400, 'Reload the record before saving.');
      if (kind === 'player') {
        let base: unknown;
        try {
          base = JSON.parse(original);
        } catch {
          throw fail(400, 'Reload the record before saving.');
        }
        if (
          !isRecord(base) ||
          (base.state === null) !== (value.state === null) ||
          (base.username === null) !== (value.username === null)
        )
          throw fail(400, 'Keep missing player state or username fields null.');
        if (!checkpointed) {
          const { previous, raw } = await readLegacyPlayer(key);
          if (raw !== original)
            throw fail(409, 'This record changed or was deleted. Reload it before saving.');
          return saveLegacyPlayer(key, previous, value as unknown as OwnerRecord);
        }
      }
      if (
        adapter.kind === 'redis' &&
        kind === 'state' &&
        (['names', 'simulation-owner'] satisfies [string, string]).includes(key)
      )
        throw fail(400, 'This is an internal Redis key.');
      await adapter.save(kind, key, original, value);
    },
  };
}

export async function startAdmin({
  store: providedStore,
  port = Number(process.env.ADMIN_PORT || 8788),
  host = process.env.ADMIN_HOST || '127.0.0.1',
  username = process.env.ADMIN_USERNAME,
  password = process.env.ADMIN_PASSWORD,
  readOnly = process.env.ADMIN_READ_ONLY === '1',
  publicHost = process.env.ADMIN_PUBLIC_HOST,
}: AdminOptions = {}) {
  const authorized = adminAuthorization(username, password);
  const publicOrigin = readOnly && publicHost ? new URL(`https://${publicHost}`) : null;
  const failures = new Map<string, { count: number; until: number }>();
  const queueEdits =
    !providedStore && readOnly && process.env.ADMIN_QUEUE_EDITS === '1' && !!process.env.REDIS_URL;
  const inspectionOnly = readOnly && !queueEdits;
  const store = providedStore || (await openAdminStore({ queueEdits }));
  const token = randomBytes(32).toString('hex');
  const html = (await readFile(new URL('./admin.html', import.meta.url), 'utf8'))
    .replace('__ADMIN_TOKEN__', token)
    .replace('__ADMIN_READ_ONLY__', JSON.stringify(inspectionOnly))
    .replace('__ADMIN_LIVE_EDITS__', JSON.stringify(queueEdits))
    .replace(
      '__ADMIN_NOTICE__',
      queueEdits
        ? 'Saving applies the edited fields to the running game through Redis.'
        : inspectionOnly
          ? 'Read-only inspection. The game can keep running. Stop it before opening an editing session.'
          : 'Stop the game server before editing. After saving, restart the game server to load your changes.',
    );
  let origin = '';
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown, type = 'application/json') => {
      res.writeHead(status, {
        'Content-Type': type + '; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
      });
      res.end(type === 'application/json' ? JSON.stringify(value) : String(value));
    };
    try {
      const forwarded = req.headers['x-admin-client-ip'];
      const client =
        publicOrigin && req.headers.host === publicOrigin.host && typeof forwarded === 'string'
          ? forwarded
          : req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const failure = failures.get(client);
      if (req.headers.authorization && failure && failure.until > now && failure.count >= 5) {
        res.setHeader('Retry-After', Math.ceil((failure.until - now) / 1000));
        send(429, { error: 'Too many failed sign-ins. Try again later.' });
        return;
      }
      if (!authorized(req.headers.authorization)) {
        if (req.headers.authorization) {
          if (!failure || failure.until <= now) {
            if (failures.size >= 4096) {
              for (const [address, entry] of failures)
                if (entry.until <= now) failures.delete(address);
              if (failures.size >= 4096) failures.delete(failures.keys().next().value!);
            }
            failures.set(client, { count: 1, until: now + 60_000 });
          } else if (++failure.count === 5) {
            failure.until = now + 60_000;
          }
        }
        res.setHeader('WWW-Authenticate', 'Basic realm="Explore SF admin", charset="UTF-8"');
        send(401, { error: 'Admin authentication required.' });
        return;
      }
      failures.delete(client);
      const requestOrigin =
        req.headers.host === new URL(origin).host
          ? origin
          : req.headers.host === publicOrigin?.host
            ? publicOrigin?.origin
            : null;
      if (
        !requestOrigin ||
        (req.headers.origin && req.headers.origin !== requestOrigin) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      )
        throw fail(403, 'Open the admin panel using its configured URL.');
      const url = new URL(req.url || '/', requestOrigin);
      if (req.method === 'GET' && url.pathname === '/') {
        send(200, html, 'text/html');
        return;
      }
      if (req.headers['x-admin-token'] !== token) throw fail(403, 'Reload the editor page.');
      if (req.method === 'GET' && url.pathname === '/api/records') {
        const { keys, names } = await store.list(),
          owners = new Map(names.map((row) => [row.owner, row.name]));
        for (const key of keys)
          if (key.startsWith('player:') && !owners.has(key.slice(7)))
            owners.set(key.slice(7), 'Unnamed player');
        const records = keys
          .filter((key) => !isAccountKey(key) && !key.startsWith('player:'))
          .map((key) => ({
            kind: 'state',
            key,
            label: key,
          }));
        records.push(...Array.from(owners, ([key, label]) => ({ kind: 'player', key, label })));
        send(200, {
          backend: store.kind,
          location: store.location,
          readOnly: inspectionOnly,
          records,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/record') {
        const key = url.searchParams.get('key') || '';
        if (isAccountKey(key)) throw fail(404, 'Record not found.');
        send(200, { raw: await store.get(url.searchParams.get('kind') || '', key) });
        return;
      }
      if (req.method === 'PUT' && url.pathname === '/api/record') {
        if (inspectionOnly)
          throw fail(
            403,
            'This panel is read-only. Stop the game and open an editing session to save changes.',
          );
        if (!req.headers['content-type']?.startsWith('application/json'))
          throw fail(415, 'Send JSON.');
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16 * 1024 * 1024) throw fail(413, 'Record exceeds the 16 MB editor limit.');
          chunks.push(chunk);
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw fail(400, 'Invalid JSON.');
        }
        if (!isRecord(body)) throw fail(400, 'Send a record object.');
        if (typeof body.kind !== 'string' || typeof body.key !== 'string')
          throw fail(400, 'Choose an existing record.');
        if (isAccountKey(body.key)) throw fail(404, 'Record not found.');
        await store.save(body.kind, body.key, body.original, body.value);
        send(200, { raw: await store.get(body.kind, body.key) });
        return;
      }
      throw fail(404, 'Not found.');
    } catch (error) {
      send(isRecord(error) && typeof error.status === 'number' ? error.status : 500, {
        error: errorMessage(error),
      });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    await store.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Admin server did not bind a TCP port.');
  origin = 'http://127.0.0.1:' + address.port;
  return {
    server,
    origin,
    token,
    liveEdits: queueEdits,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await store.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: node server/admin.mjs [--check-auth]\n\nLoads server/.env automatically; ADMIN_ENV_FILE selects another env file.\nADMIN_USERNAME and ADMIN_PASSWORD are required for HTTP Basic Auth.\nADMIN_READ_ONLY=1 allows safe access while the game runs. Set ADMIN_QUEUE_EDITS=1 on both the game and editor to enable live Redis saves in this mode.\nFor offline editing, stop the game before saving.\nSTATE_FILE selects an existing SQLite database (default: server/data/world.sqlite).\nREDIS_URL selects Redis instead. ADMIN_PORT defaults to 8788.\nADMIN_HOST defaults to 127.0.0.1; use 0.0.0.0 inside a container with a loopback-only published port.',
    );
  } else {
    try {
      try {
        process.loadEnvFile(process.env.ADMIN_ENV_FILE || new URL('.env', import.meta.url));
      } catch (error) {
        if (!isRecord(error) || error.code !== 'ENOENT' || process.env.ADMIN_ENV_FILE) throw error;
      }
      if (process.argv.includes('--check-auth')) {
        adminAuthorization(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
        console.log('Admin authentication is configured.');
        process.exit(0);
      }
      const admin = await startAdmin();
      console.log(
        'Database editor: ' +
          admin.origin +
          '\nHTTP Basic Auth is required.\n' +
          (admin.liveEdits
            ? 'Edits apply to the running game through Redis.'
            : process.env.ADMIN_READ_ONLY === '1'
            ? 'Read-only inspection; the game can keep running.'
            : 'Stop the game server before editing. Restart it after saving to load changes.') +
          '\nPress Ctrl+C to close the editor.',
      );
      let closing = false;
      const close = async () => {
        if (closing) return;
        closing = true;
        try {
          await admin.close();
        } catch (error) {
          console.error(errorMessage(error));
          process.exitCode = 1;
        }
      };
      process.on('SIGINT', close);
      process.on('SIGTERM', close);
    } catch (error) {
      console.error(errorMessage(error));
      process.exitCode = 1;
    }
  }
}
