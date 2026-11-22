# NPC conversations

Edit the live dialogue sources under [content](../../content/README.md).

| Source                                                                                             | Content                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`content/dialogues/tweet-derived/chains.json`](../../content/dialogues/tweet-derived/chains.json) | 100 tweet-derived branching pedestrian conversations                      |
| [`content/dialogues/other/chains.json`](../../content/dialogues/other/chains.json)                 | Special-purpose pedestrian conversations, including the Goose Corp rumors |
| [`content/dialogues.json`](../../content/dialogues.json)                                           | Named, quest, shop and travel dialogue templates and state variants       |

Ordinary adult pedestrians draw from the 100 tweet-derived conversations plus
the two Goose Corp rumors. Children use the pond rumor in `other/chains.json`.
A shuffled bag avoids repeating a conversation until the pool has been drawn.
Names and portraits come from the actual NPC. Named NPCs keep their authored
topics, including the Goose Corp topics for Ray and Leo.

Each shared conversation has a `start` node ID and a `nodes` map. Player choices
link to a `next` node ID. An `end: true` node closes after its line is acknowledged.
Keep every edge valid and every node reachable.

`tweet-derived/archive.json` preserves the original tweet adaptation catalog and
source provenance. `other/goose-corp-lore.json` contains the original Goose Corp
catalog, including lore books. Edit the corresponding `chains.json` to change
the game’s pedestrian conversations.

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
