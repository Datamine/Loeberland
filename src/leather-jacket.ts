import { LEATHER_JACKET } from './config/leather-jacket.ts';
import type { EconomyState } from './types/content.ts';
import type { ActionReceipt, Actor, RuntimeDialogue } from './types/world.ts';

export function leatherJacketDialogue(
  seller: Actor,
  purse: Pick<EconomyState, 'sandDelivered' | 'ownedEquipment'>,
  buy: () => Promise<ActionReceipt>,
): RuntimeDialogue {
  const { item, sandRequired } = LEATHER_JACKET;
  const remaining = sandRequired - purse.sandDelivered;
  const owned = purse.ownedEquipment.includes(item);
  return {
    ...seller,
    contentResolved: true,
    intro: owned
      ? 'A jacket like that remembers what you paid. Wear it well.'
      : remaining > 0
        ? `I do business with people who’ve put in the work here. Deliver ${sandRequired} sacks of sand to the GPU Factory. You have ${remaining} to go.`
        : 'Procurement tells me you’ve put in the work. I’ll let you see the jacket. It’s a big deal, and wearing it takes a real sacrifice.',
    choices:
      owned || remaining > 0
        ? []
        : [
            {
              label: 'Ask what the jacket costs',
              next: {
                intro:
                  'Your Hitpoints level goes back to level 1. Every bit of Hitpoints XP you’ve earned goes with it. Are you willing to start over?',
                choices: [
                  {
                    label: 'Reset my Hitpoints to level 1 and take the jacket',
                    accept: buy,
                  },
                ],
              },
            },
          ],
  };
}
