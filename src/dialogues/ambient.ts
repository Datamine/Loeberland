import type { RuntimeDialogue } from '../types/world.ts';
// CONTENT-BINDINGS-MIGRATED
import { CONTENT, contentText } from '../content-runtime.ts';
import tweetDerived from '../../content/dialogues/tweet-derived/chains.json' with { type: 'json' };
import other from '../../content/dialogues/other/chains.json' with { type: 'json' };
import { applyDialogueEdits } from '../world-edits.ts';
import type { SharedConversation } from '../types/content.ts';

export const AMBIENT_CHAINS = Object.freeze(
  Object.keys(tweetDerived).map((id) => CONTENT.dialogues.shared[id]),
);
export const GOOSE_CHAINS = Object.freeze(
  ['goose_corp_1', 'goose_corp_2'].map((id) => CONTENT.dialogues.shared[id]),
);
export const CONVERSATION_POOL = Object.freeze([
  ...AMBIENT_CHAINS,
  ...Object.keys(other).map((id) => CONTENT.dialogues.shared[id]),
]);
const simulationChains = Object.keys(other)
  .filter((id) => id.startsWith('simulation_'))
  .map((id) => CONTENT.dialogues.shared[id]);

export function childConversation(random = Math.random) {
  if (simulationChains.length && random() < 0.2)
    return simulationChains[Math.floor(random() * simulationChains.length)];
  return GOOSE_CHAINS[1];
}

/** Draw without replacement so a walk through town does not repeat one topic. */
export function createConversationPicker({ pool = CONVERSATION_POOL, random = Math.random } = {}) {
  if (!pool.length) throw new Error('The NPC conversation pool is empty.');
  let bag: SharedConversation[] = [];
  return () => {
    if (!bag.length) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };
}

const pickConversation = createConversationPicker();

/** Translate authored graph edges into the existing portrait/choice UI.
 * Copy appearance only: a conversation must never inherit an NPC's trade,
 * purchase callback, repeat flag, or deferred quest action. */
export function createAmbientDialogue<T extends RuntimeDialogue>(
  npc: T = {} as T,
  { chain = pickConversation() }: { chain?: SharedConversation } = {},
): T & RuntimeDialogue {
  const person = { ...npc };
  for (const key of [
    'intro',
    'question',
    'choices',
    'choice',
    'accept',
    'trade',
    'receipt',
    'repeat',
    'decline',
    'skipIntro',
    'after',
    'ambientConversation',
  ] as const)
    delete person[key];
  function node(id: string, path = new Set<string>()): RuntimeDialogue {
    const source = chain.nodes[id];
    if (!source || path.has(id))
      throw new Error('Invalid conversation edge in ' + chain.id + ': ' + id);
    const nextPath = new Set([...path, id]);
    return {
      intro: source.text,
      repeat: false,
      choices: (source.choices || [])
        .filter(
          (choice) =>
            !/^(?:i should get going[.!]?|leave[.!]?|goodbye[.!]?)$/i.test(choice.text.trim()),
        )
        .map((choice) => {
          const target = chain.nodes[choice.next];
          if (!target)
            throw new Error('Missing conversation node in ' + chain.id + ': ' + choice.next);
          return target.end
            ? {
                label: choice.text,
                receipt: target.text,
                repeat: false,
                contentNodeId: 'dialogues.ambient.node.node-3',
              }
            : {
                label: choice.text,
                next: node(choice.next, nextPath),
                contentNodeId: 'dialogues.ambient.node.node-6',
              };
        }),
      contentNodeId: 'dialogues.ambient.node.node-1',
    };
  }
  return applyDialogueEdits(
    {
      ...person,
      name: npc.name || npc.named || npc.label || (npc.female ? 'Woman' : 'Man'),
      decline: contentText('dialogues.ambient.createAmbientDialogue.decline-9', {}),
      ambientConversation: true,
      conversationId: chain.id,
      ...node(chain.start),
    },
    'shared:' + chain.id,
  );
}
