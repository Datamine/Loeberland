import type { GameCheckpoint, NameReservation } from '../src/types/storage.ts';
import { isDeepStrictEqual } from 'node:util';
import { isRecord } from '../src/types/json.ts';

export const pendingAdminEdit = 'loeberland:admin-edit:pending';
export const adminEditResult = (id: string) => 'loeberland:admin-edit:result:' + id;

export interface AdminEdit {
  id: string;
  owner: string;
  kind: string;
  key: string;
  original: string;
  value: object;
}

export interface OwnerRecord {
  state: unknown;
  username: NameReservation | null;
}

export function checkpointRecord(document: GameCheckpoint, kind: string, key: string) {
  if (kind === 'player') {
    const state = document.records.find(([id]) => id === 'player:' + key)?.[1] ?? null;
    const username = document.names.find((row) => row.owner === key) ?? null;
    return state === null && username === null ? undefined : { state, username };
  }
  return kind === 'state'
    ? document.records.find(([id]) => id === key)?.[1]
    : document.names.find((row) => row.owner === key);
}

const stale = 'This record changed or was deleted. Reload it before saving.';

function mergeEdit(original: unknown, value: unknown, current: unknown): unknown {
  if (isDeepStrictEqual(original, value)) return current;
  if (isDeepStrictEqual(original, current) || isDeepStrictEqual(value, current)) return value;
  if (!isRecord(original) || !isRecord(value) || !isRecord(current)) throw new Error(stale);
  const entries = new Map(Object.entries(current));
  for (const key of new Set([...Object.keys(original), ...Object.keys(value)])) {
    const merged = mergeEdit(
      Object.hasOwn(original, key) ? original[key] : undefined,
      Object.hasOwn(value, key) ? value[key] : undefined,
      entries.get(key),
    );
    if (merged === undefined) entries.delete(key);
    else entries.set(key, merged);
  }
  return Object.fromEntries(entries);
}

/** Offline edits use whole-record CAS. Live edits keep changes to fields the
 * editor did not touch and reject conflicting writes to the edited fields. */
export function editCheckpoint(
  document: GameCheckpoint,
  edit: Omit<AdminEdit, 'id' | 'owner'>,
  live = false,
) {
  const { kind, key, original } = edit;
  const current = checkpointRecord(document, kind, key);
  let value = edit.value;
  if (JSON.stringify(current) !== original) {
    if (!live || current === undefined) return stale;
    try {
      const merged = mergeEdit(JSON.parse(original), value, current);
      if (!isRecord(merged)) return stale;
      value = merged;
    } catch {
      return stale;
    }
  }
  if (document.version >= Number.MAX_SAFE_INTEGER) return 'Game state version exhausted.';
  const player = kind === 'player' ? (value as OwnerRecord) : null;
  const name = kind === 'usernames' ? (value as NameReservation) : player?.username;
  if (name) {
    if (document.names.some((row) => row.owner !== key && row.canonical === name.canonical))
      return 'That username is already taken.';
    document.names = document.names.map((row) => (row.owner === key ? name : row));
  }
  if (kind === 'state' || (player && player.state !== null)) {
    const stateKey = player ? 'player:' + key : key;
    document.records = document.records.map(([id, entry]) => [
      id,
      id === stateKey ? (player ? player.state : value) : entry,
    ]);
  }
  document.version++;
  document.savedAt = Date.now();
  return null;
}
