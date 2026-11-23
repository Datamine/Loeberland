# NPC conversations

Edit the live dialogue sources under [content](../../content/README.md).

| Source                                                                                             | Content                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`content/dialogues/tweet-derived/chains.json`](../../content/dialogues/tweet-derived/chains.json) | 125 source conversations plus the preserved bakery queue conversation     |
| [`content/dialogues/other/chains.json`](../../content/dialogues/other/chains.json)                 | Special-purpose pedestrian conversations, including the Goose Corp rumors |
| [`content/dialogues.json`](../../content/dialogues.json)                                           | Named, quest, shop and travel dialogue templates and state variants       |

Ordinary adult pedestrians draw from the tweet-derived conversations plus
the conversations in `other/chains.json`. Children retain their separate rumor pool.
A shuffled bag for each NPC gender avoids repeats until its eligible pool has been drawn.
Names and portraits come from the actual NPC. Named NPCs keep their authored
topics, including the Goose Corp topics for Ray and Leo.

Each shared conversation has a `start` node ID and a `nodes` map. Sequential
nodes have a `speaker` (`npc` or `player`) and link directly to a `next` node ID.
The UI advances each line with Continue and uses the matching portrait, including
player openings and endings. Branching conversations retain their player choices.
An `end: true` node closes after its line is acknowledged.
Keep every edge valid and every node reachable.

`source-tweets/*.txt` is the source for the new tweet dialogue. `NPC:` and
`CHARACTER:` label each line; lines of equals signs separate independent
conversations. `{MALE NPC ONLY}` restricts the following conversation to male NPCs.
Run `npm run import:tweet-dialogues` to update both `tweet-derived/chains.json` and
`tweet-derived/archive.json`; the importer keeps `ambient_037_the_croissant_alibi`
unchanged and never writes to `other/`. The archive contains the same conversation
catalog and source provenance. `other/goose-corp-lore.json` contains the original Goose Corp
catalog, including lore books. Edit `other/chains.json` to change those pedestrian
conversations; edit the source text and reimport for the new tweet dialogue.

`ambient.ts` selects and converts shared conversations to the dialogue UI.
`catalog.ts` exposes service and lore compatibility exports.
`services.json` holds the original service catalog. Live service templates are in
`content/dialogues.json`, with callbacks bound in `src/dialogue-config.ts`.
Keep action IDs, argument IDs and `{tokens}` intact when editing.

Named and service NPCs should speak as characters, without giving a walkthrough.
Keep their requests, prices, consent choices, and receipts for completed actions
clear. Do not reveal hidden odds, optimization strategies, exact quest routes,
undiscovered rewards, or future unlocks. Guide messages and examine descriptions
follow the same rule. Journals record discoveries and completed milestones.
Collection entries reveal names after discovery. Help explains controls only.

From the repo root, run `npm run build:editor` after editing source JSON to
publish the content. The main build also embeds the published defaults for
offline play.
