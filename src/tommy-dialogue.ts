import type { ActionReceipt, Actor, RuntimeDialogue } from './types/world.ts';

export function tommyDialogue(
  tommy: Actor,
  name: string,
  hasReceivedSpoon: boolean,
  claimSpoon: () => Promise<ActionReceipt>,
): RuntimeDialogue {
  return {
    ...tommy,
    contentResolved: true,
    intro: 'Oh hi, Mark.',
    choices: [
      {
        label: `That's not my name. My name is ${name}`,
        ...(hasReceivedSpoon
          ? { receipt: 'Ha-ha, sorry. Good to see you again!' }
          : { accept: claimSpoon }),
      },
    ],
  };
}
