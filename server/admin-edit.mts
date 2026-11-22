import type { GameCheckpoint, NameReservation } from '../src/types/storage.ts';

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

/** Apply only the edited record to the latest checkpoint. */
export function editCheckpoint(document: GameCheckpoint, edit: Omit<AdminEdit, 'id' | 'owner'>) {
  const { kind, key, original, value } = edit;
  if (JSON.stringify(checkpointRecord(document, kind, key)) !== original)
    return 'This record changed or was deleted. Reload it before saving.';
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
