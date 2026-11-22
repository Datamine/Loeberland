export const CREATURE_STRIKE_MS = 450;

/** A transient pose sampled from the server's attack countdown. */
export function attackPulse(progress: number, start: number, peak: number, end: number) {
  if (progress <= start || progress >= end) return 0;
  const t = progress < peak ? (progress - start) / (peak - start) : (end - progress) / (end - peak);
  return t * t * (3 - 2 * t);
}
