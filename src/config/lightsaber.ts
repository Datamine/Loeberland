import { DEFENSE_WORKSHOP } from './defense-workshop.ts';

export const LIGHTSABER_TITLE = 'For Science';
export const LIGHTSABER_HITS = 10;
export const LIGHT_CRYSTAL = 'light-crystal';
export const LIGHTSABER_COLOR_PRICE = 10_000;
export const LIGHTSABER_SCIENTIST = 'berkeley-mad-scientist';
export const LIGHTSABER_INDUSTRIALIST = 'enterprising-industrialist';

export const LIGHTSABER_COLORS = {
  blue: { name: 'Electric blue', blade: '#239eff', core: '#cfebff' },
  violet: { name: 'Ion violet', blade: '#9555ff', core: '#eddeff' },
  pink: { name: 'Plasma pink', blade: '#ff3c9e', core: '#ffd7f6' },
  green: { name: 'Acid green', blade: '#71fc39', core: '#e3ffd4' },
  gold: { name: 'Solar gold', blade: '#ffc438', core: '#fff2b4' },
  red: { name: 'Crimson red', blade: '#ff334e', core: '#ffd6dc' },
} as const;
export type LightsaberColor = keyof typeof LIGHTSABER_COLORS;
export function lightsaberColor(value: unknown): LightsaberColor {
  return typeof value === 'string' && Object.hasOwn(LIGHTSABER_COLORS, value)
    ? (value as LightsaberColor)
    : 'blue';
}

export const LIGHTSABER_STAGES = [
  'not-started',
  'pitch',
  'research',
  'review',
  'approval',
  'fabrication',
  'completed',
] as const;
export type LightsaberStage = (typeof LIGHTSABER_STAGES)[number];

export const LIGHTSABER_STEPS = {
  'not-started': {
    npc: LIGHTSABER_INDUSTRIALIST,
    next: 'pitch',
    label: 'Show him the railgun',
    intro:
      'That’s a railgun. I have a crazy idea. What if we made its light into a sword? For science, obviously. Can you find someone to turn that into a product?',
    choice: 'Take the idea to Tim Apple',
    receipt: 'Pitch the idea to Tim Apple in Cupertino.',
    objective:
      'Show your railgun to the Enterprising Industrialist at the American Industrial Center.',
  },
  pitch: {
    npc: 'tim-apple',
    next: 'research',
    label: 'Pitch the Industrialist’s idea',
    intro:
      'A blade you never have to sharpen. That’s exactly the innovation we needed. But I need a scientist to tell me whether the blade will stay attached to the handle.',
    choice: 'Ask the Mad Scientist in Berkeley',
    receipt: 'Find the Mad Scientist at his house in Berkeley.',
    objective: 'Pitch the Industrialist’s idea to Tim Apple in Cupertino.',
  },
  research: {
    npc: LIGHTSABER_SCIENTIST,
    next: 'review',
    label: 'Ask about the lightsaber',
    intro:
      'For science? Finally! Tell Tim I’ve worked out the blade. It’ll take a railgun battery, and you’ll get ten good hits out of it. I scribbled the rest on the back of a lab bill.',
    choice: 'Take the research notes',
    receipt: 'Bring the Mad Scientist’s notes back to Tim Apple.',
    objective: 'Talk to the Mad Scientist at his house in Berkeley.',
  },
  review: {
    npc: 'tim-apple',
    next: 'approval',
    label: 'Bring Tim the research notes',
    intro:
      'Ten hits on a battery is fine. We’ll ship it in electric blue. Here’s the product brief. Take it back to the Industrialist so he can approve a prototype.',
    choice: 'Take the product brief',
    receipt: 'Return to the Enterprising Industrialist with the product brief.',
    objective: 'Bring the research notes back to Tim Apple in Cupertino.',
  },
  approval: {
    npc: LIGHTSABER_INDUSTRIALIST,
    next: 'fabrication',
    label: 'Present Tim’s product brief',
    intro:
      'The numbers work. Here’s my sign-off. Take the plans to the Defense Manufacturer at 53, 211. He’s the only one I trust to build the first one.',
    choice: 'Take the approved plans',
    receipt: 'Take the approved plans and a Light crystal to the Defense Manufacturer at 53, 211.',
    objective: 'Get the Enterprising Industrialist’s sign-off at the American Industrial Center.',
  },
  fabrication: {
    npc: DEFENSE_WORKSHOP.manufacturer.id,
    next: 'completed',
    label: 'Make the lightsaber',
    intro:
      'These plans will work. I need one Light crystal to focus the blade. Monsters sometimes drop them, and the tougher ones are more likely to have one. I’ll fit the first battery and set the blade to electric blue.',
    choice: 'Have the lightsaber made',
    receipt:
      'The Defense Manufacturer hands you a charged electric-blue Lightsaber. Equip it in Character.',
    objective: 'Find a Light crystal and bring it with the approved plans to the Defense Manufacturer at 53, 211.',
  },
} as const satisfies Record<
  Exclude<LightsaberStage, 'completed'>,
  {
    npc: string;
    next: LightsaberStage;
    label: string;
    intro: string;
    choice: string;
    receipt: string;
    objective: string;
  }
>;
