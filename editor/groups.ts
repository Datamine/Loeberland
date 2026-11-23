interface GroupableRecord {
  definitionId?: string;
  group: string;
  kind: string;
  name: string;
  description: string;
}
export function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase('en');
}

export function npcNamesWithDifferentExamineText(
  records: Iterable<Pick<GroupableRecord, 'group' | 'name' | 'description'>>,
) {
  const firstExamineText = new Map<string, string>();
  const repeatedNames = new Set<string>();
  for (const { group, name, description } of records) {
    if (group !== 'npc') continue;
    const key = normalizedName(name);
    const first = firstExamineText.get(key);
    if (first === undefined) firstExamineText.set(key, description);
    else if (first !== description) repeatedNames.add(key);
  }
  return repeatedNames;
}

/** Group placements with the same definition and examine text while retaining their records. */
export function groupEditorRecords<T extends GroupableRecord>(
  records: readonly T[],
): (T & { members: T[] })[] {
  const groups = new Map<string, T & { members: T[] }>();
  for (const record of records) {
    const identity = record.definitionId
      ? [record.definitionId]
      : [record.group, record.kind, normalizedName(record.name)];
    const signature = JSON.stringify([...identity, record.description]);
    const existing = groups.get(signature);
    if (existing) existing.members.push(record);
    else groups.set(signature, { ...record, members: [record] });
  }
  return [...groups.values()];
}
