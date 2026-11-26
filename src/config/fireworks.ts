export const PYROMANIAC_PETER = {
  id: 'pyromaniac-peter',
  name: 'Pyromaniac Peter',
  x: 58.25,
  z: 95.25,
  description: 'A man in a scuffed orange jacket with soot on his sleeves.',
} as const;

export const FIREWORKS_SECONDS = 1.9;
export const FIREWORK_ENFORCEMENT = {
  kind: 'municipal-code-enforcement-officer',
  name: 'Municipal Code Enforcement Officer',
  chance: 1 / 3,
  fine: 100,
  talkRange: 2.65,
  citation: 'You fired a firework without a permit. The fine is 100 coins.',
} as const;
