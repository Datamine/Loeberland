import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import type { SharedConversation, SharedNode } from '../src/types/content.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const bakeryId = 'ambient_037_the_croissant_alibi';

/** Keep each authored line and speaker; separators start independent conversations. */
export function importTweetDialogue(filename: string, source: string): SharedConversation[] {
  const conversations: SharedConversation[] = [];
  let lines: { number: number; speaker: 'npc' | 'player'; text: string }[] = [];
  let maleOnly = false;
  function flush() {
    if (!lines.length) return;
    const id = `tweet_${filename.replace(/\.txt$/, '')}_${conversations.length + 1}`;
    const nodes: Record<string, SharedNode> = {};
    lines.forEach((line, index) => {
      const key = `line-${line.number}`;
      nodes[key] = {
        id: key,
        speaker: line.speaker,
        text: line.text,
        ...(index + 1 < lines.length ? { next: `line-${lines[index + 1].number}` } : { end: true }),
      };
    });
    conversations.push({
      id,
      title: lines[0].text.length > 80 ? lines[0].text.slice(0, 77) + '...' : lines[0].text,
      source_directory: 'source-tweets',
      source_files: [filename],
      ...(maleOnly ? { npc_eligibility: { genders: ['man'] } } : {}),
      start: `line-${lines[0].number}`,
      nodes,
    });
    lines = [];
    maleOnly = false;
  }
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (/^=+$/.test(line)) {
      flush();
      return;
    }
    if (line === '{MALE NPC ONLY}') {
      if (lines.length) throw new Error(`${filename}:${index + 1}: misplaced NPC restriction`);
      maleOnly = true;
      return;
    }
    const match = /^(NPC|CHARACTER):\s*(.+)$/.exec(line);
    if (!match) throw new Error(`${filename}:${index + 1}: missing or unknown speaker`);
    lines.push({
      number: index + 1,
      speaker: match[1] === 'NPC' ? 'npc' : 'player',
      text: match[2],
    });
  });
  flush();
  return conversations;
}

export async function importTweetDialogues() {
  const destination = resolve(root, 'content/dialogues/tweet-derived');
  const options = await resolveConfig(resolve(destination, 'chains.json'));
  const json = (value: unknown) => format(JSON.stringify(value), { ...options, parser: 'json' });
  const existing: Record<string, SharedConversation> = JSON.parse(
    await readFile(resolve(destination, 'chains.json'), 'utf8'),
  );
  const bakery = existing[bakeryId];
  if (!bakery?.nodes[bakery.start].text.startsWith('Look at this bakery queue'))
    throw new Error('The preserved bakery conversation is missing.');
  const chains: Record<string, SharedConversation> = {};
  const source = resolve(root, 'source-tweets');
  for (const filename of (await readdir(source)).filter((f) => f.endsWith('.txt')).sort())
    for (const chain of importTweetDialogue(
      filename,
      await readFile(resolve(source, filename), 'utf8'),
    ))
      chains[chain.id] = chain;
  chains[bakery.id] = bakery;
  await writeFile(resolve(destination, 'chains.json'), await json(chains));
  await writeFile(
    resolve(destination, 'archive.json'),
    await json({
      schema_version: 1,
      language: 'en',
      description:
        'Dialogue imported verbatim from source-tweets, plus the preserved bakery queue conversation. No quest, reward, or game-state effects are implied.',
      npc_eligibility: { genders: ['man', 'woman'], requires_named_character: false },
      selection: {
        method: 'shuffle-without-replacement',
        pool: 'dialogues',
        start_field: 'start',
      },
      dialogues: Object.values(chains),
    }),
  );
  return chains;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chains = await importTweetDialogues();
  console.log(
    `Imported ${Object.keys(chains).length - 1} conversations; preserved the bakery queue conversation.`,
  );
}
