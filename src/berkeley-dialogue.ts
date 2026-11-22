import churchDialogue from '../content/dialogues/other/berkeley-church.json' with { type: 'json' };
import type { RuntimeDialogue } from './types/world.ts';

export function unusualPastorDialogue(npc: RuntimeDialogue, confront: () => void): RuntimeDialogue {
  const { intro, choices } = churchDialogue.pastor;
  return {
    ...npc,
    contentResolved: true,
    intro,
    choices: choices.map((choice) =>
      choice.repeat ? choice : { ...choice, accept: () => ({ ok: true, after: confront }) },
    ),
  };
}
