export const CREATURE_STRIKE_MS = 450;

const lunges: Readonly<Record<string, { duration: number; impact: number; reach: number }>> = {
  'tahoe-bear': { duration: 900, impact: 0.47, reach: 1.65 },
  'tahoe-fox': { duration: 700, impact: 0.45, reach: 1.15 },
  coyote: { duration: 740, impact: 0.45, reach: 1.25 },
  seagull: { duration: 730, impact: 0.46, reach: 1.05 },
};

export function creatureLunge(kind: string) {
  return Object.hasOwn(lunges, kind) ? lunges[kind] : undefined;
}

/** A transient pose sampled from the server's attack countdown. */
export function attackPulse(progress: number, start: number, peak: number, end: number) {
  if (progress <= start || progress >= end) return 0;
  const t = progress < peak ? (progress - start) / (peak - start) : (end - progress) / (end - peak);
  return t * t * (3 - 2 * t);
}
