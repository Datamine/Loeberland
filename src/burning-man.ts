import type { QuestJournalEntry } from './quest-menu.ts';
import type { Actor, ActionReceipt, RuntimeChoice, RuntimeDialogue } from './types/world.ts';

export const BURNING_MAN = {
  id: 'burning-man',
  statue: 'burning-man-statue',
  matilda: 'burning-man-matilda',
  dj: 'burning-man-dj',
  partyDJ: 'burning-man-party-dj',
  waterClerk: 'in-n-out-clerk',
  u: 30,
  v: -11,
  burnMs: 4600,
  straw: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const,
} as const;

export const BURNING_MAN_STAGES = [
  'not-started',
  'fetch-water',
  'has-water',
  'find-dj',
  'dj-agreed',
  'ready',
  'burned',
  'completed',
] as const;
export type BurningManStage = (typeof BURNING_MAN_STAGES)[number];
export interface BurningManProgress {
  stage: BurningManStage;
  burnAt: number;
}
export type BurningManAction = 'start' | 'water' | 'deliver-water' | 'invite' | 'report' | 'reward';

export function burningManStrawAt(u: number, v: number) {
  return BURNING_MAN.straw.some(
    ([x, z]) => Math.abs(u - BURNING_MAN.u - x) <= 0.47 && Math.abs(v - BURNING_MAN.v - z) <= 0.47,
  );
}

export function burningManEntry(stage: BurningManStage): QuestJournalEntry {
  const descriptions: Record<BurningManStage, string> = {
    'not-started': 'Speak to Matilda by the wicker statue.',
    'fetch-water': 'Ask the In-N-Out clerk in Berkeley for a cup of water.',
    'has-water': 'Bring the cup of water back to Matilda.',
    'find-dj':
      'Find the DJ inside the Nightlife venue in San Francisco and invite him to the party.',
    'dj-agreed': 'Tell Matilda that the DJ is coming.',
    ready:
      'Equip your back rocket. Stand on one of the straw squares by The Man and use Light rocket.',
    burned: 'Speak to Matilda once the fire has died down.',
    completed: 'The party has water and music. The Man is charcoal.',
  };
  return {
    id: BURNING_MAN.id,
    title: 'Burning Man',
    startLocation: 'the wicker statue in Berkeley (speak to Matilda)',
    stage:
      stage === 'not-started' || stage === 'completed'
        ? stage
        : stage === 'has-water' || stage === 'dj-agreed' || stage === 'burned'
          ? 'carrying'
          : 'accepted',
    status:
      stage === 'not-started' ? 'Not started' : stage === 'completed' ? 'Complete' : 'In progress',
    description: descriptions[stage],
    rewardLabel: 'Party Boots',
  };
}

type Perform = (step: BurningManAction) => Promise<ActionReceipt> | ActionReceipt;

export function burningManDialogue(
  npc: Actor,
  stage: BurningManStage,
  perform: Perform,
): RuntimeDialogue {
  const action = (label: string, step: BurningManAction): RuntimeChoice => ({
    label,
    accept: () => perform(step),
    serverReceipt: true,
  });
  const page = (intro: string, label: string, next: RuntimeDialogue): RuntimeDialogue => ({
    intro,
    choices: [{ label, next }],
  });
  let dialogue: RuntimeDialogue;
  if (npc.id === BURNING_MAN.dj) {
    dialogue =
      stage === 'find-dj'
        ? {
            intro:
              'Berkeley? I’ve got one set left here. Tell me what kind of party it is while I pack my records.',
            choices: [
              {
                label: 'There’s a giant wicker man and nobody brought music.',
                next: {
                  intro:
                    'A room full of dancers and a man made of wicker. That’s a better brief than I got for tonight. I can come once I’ve played my last record.',
                  choices: [action('Invite the DJ to Matilda’s party', 'invite')],
                },
              },
            ],
          }
        : {
            intro:
              stage === 'dj-agreed'
                ? 'Go on ahead. I’ll bring my records.'
                : 'Give me a second. These two records are about to disagree.',
          };
  } else {
    switch (stage) {
      case 'not-started':
        dialogue = page(
          'I’m very thirsty.',
          'Why are you so thirsty?',
          page(
            'I don’t have any water.',
            'Why don’t you have any water?',
            page(
              'I forgot to bring it to the party.',
              'Why didn’t you buy any water at the store nearby?',
              {
                intro:
                  'I don’t believe in money. I did remember to bring four pairs of sunglasses, if that helps.',
                choices: [action('I’ll get you some water', 'start')],
              },
            ),
          ),
        );
        break;
      case 'fetch-water':
        dialogue = {
          intro:
            'Could you ask for a cup at In-N-Out? It’s down by the road. I’d go myself, but I promised to stay until the party got started.',
        };
        break;
      case 'has-water':
        dialogue = {
          intro:
            'Is that water? I’d begun to convince myself that thirst was a form of music. Which reminds me, we still need actual music.',
          choices: [action('Give Matilda the cup of water', 'deliver-water')],
        };
        break;
      case 'find-dj':
        dialogue = {
          intro:
            'I’m grateful for the water. Now everyone can hear that there’s no music. Could you ask the DJ at Nightlife in San Francisco if he’ll come?',
        };
        break;
      case 'dj-agreed':
        dialogue = {
          intro:
            'You’re back! Did the DJ say yes? I’ve been keeping the dance floor clear. It’s that part of the grass without people on it.',
          choices: [action('Tell Matilda the DJ is coming', 'report')],
        };
        break;
      case 'ready':
        dialogue = page(
          'Water, records, dancers. Now we need to light The Man. See the straw squares? If you have that rocket you can wear on your back, stand on the straw and light your rocket.',
          'Where can I get a back rocket?',
          {
            intro:
              'There were a lot of rockets going around on New Year’s Eve. I’d try looking in wardrobes in San Francisco, where people put them away after the parties.',
          },
        );
        break;
      case 'burned':
        dialogue = {
          intro:
            'Look at him. Even as charcoal he has better posture than any of us. I want you to have my Party Boots. They’ll get you an extra couple of inches above the dance floor.',
          choices: [action('Accept the Party Boots', 'reward')],
        };
        break;
      case 'completed':
        dialogue = {
          intro:
            'There you are! Take a turn around the dance floor in those boots. I want to see which colors come out when you move.',
        };
        break;
    }
  }
  return { ...npc, ...dialogue, contentResolved: true };
}
