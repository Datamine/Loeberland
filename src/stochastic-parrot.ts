import type { QuestJournalEntry } from './quest-menu.ts';
import type { RuntimeChoice } from './types/world.ts';

export const PARROT_QUEST_STAGES = [
  'not-started',
  'accepted',
  'carrying',
  'proof',
  'sold',
] as const;
export type ParrotQuestStage = (typeof PARROT_QUEST_STAGES)[number];
export const PARROT_SCIENTIST = 'goblin-scientist';
export const PROOF_ITEM = 'Proof of the Collatz conjecture';
export const PROOF_BUYERS = {
  'city-hall-clerk': 3,
  'enterprising-industrialist': 4,
  'berkeley-mathematician': 1,
} as const;

export function proofPrice(id: string | undefined) {
  return id && Object.hasOwn(PROOF_BUYERS, id) ? PROOF_BUYERS[id as keyof typeof PROOF_BUYERS] : 0;
}

export function parrotQuestEntry(stage: ParrotQuestStage): QuestJournalEntry {
  const [status, description] = {
    'not-started': ['Not started', 'Ask the Goblin Scientist about the latest innovation.'],
    accepted: [
      'In progress',
      'Catch a parrot in the grove north of Coit Tower. You can lure one with a sandwich.',
    ],
    carrying: [
      'Ready to turn in',
      'Bring the stochastic parrot back to the Goblin Scientist at the Goblin AI Lab.',
    ],
    proof: [
      'Complete',
      'You can sell the proof to the City Hall Clerk, the Enterprising Industrialist, or the Berkeley Mathematician.',
    ],
    sold: ['Complete', 'The lab has its stochastic parrot, and your proof has a new owner.'],
  }[stage];
  return {
    id: 'stochastic-parrot',
    title: 'Stochastic Parrot',
    startLocation: 'Goblin AI Lab, east of Goblin Village (speak to the Goblin Scientist)',
    stage: stage === 'proof' || stage === 'sold' ? 'completed' : stage,
    status,
    description,
    rewardLabel: PROOF_ITEM,
  };
}

const mathematicianPages = [
  'Oh man. Hooray! Hooray! Is that the Collatz conjecture? I was supposed to get lunch. Lunch can wait.',
  'I spent an entire winter on the odd numbers. Every night I said, “Just one more lemma.” By March my thesis adviser had stopped answering the phone.',
  'Wait, this part handles all the trajectories at once? Run your finger down that page. No, the other page. There it is. Oh, that is beautiful.',
  'Hooray again! I’m going to call my old adviser. Then the department. Then my mother, who still thinks I work on fractions.',
  'I would like to buy it. I have one coin. I can also tell nearly everyone alive what an extraordinary proof this is.',
];

export function proofBuyerChoice(
  buyer: string,
  sell: NonNullable<RuntimeChoice['accept']>,
): RuntimeChoice {
  const price = proofPrice(buyer);
  const offer = {
    label: 'Sell the proof for ' + price + (price === 1 ? ' coin' : ' coins'),
    accept: sell,
    serverReceipt: true,
  };
  if (buyer === 'berkeley-mathematician') {
    let choices: RuntimeChoice[] = [offer];
    for (const intro of [...mathematicianPages].reverse())
      choices = [{ label: 'Keep listening', next: { intro, choices } }];
    return { ...choices[0], label: 'Show the Collatz proof' };
  }
  return {
    label: 'Offer the Collatz proof',
    next: {
      intro:
        buyer === 'city-hall-clerk'
          ? 'A proof of the Collatz conjecture. I can file it under Completed Mathematics. The acquisition budget will cover three coins.'
          : 'Can the proof be patented? Never mind. I’ll pay four coins for the original and hang it in my office.',
      choices: [offer],
    },
  };
}
