export const SHRIMP_EXPERIMENT = {
  id: 'berkeley-experiment-wheel',
  scientist: 'berkeley-scientist',
  mode: 'scientificExperiment',
  reward: 100,
  inebriation: 20,
  limit: 10,
  durationMs: 8_000,
  revolutions: 12,
  wheel: { u: 12.75, v: 9.4, radius: 1.72, hub: 2.16, deck: 0.55 },
  tank: { u: 13.55, v: 6.7 },
  vendor: { u: 11.55, v: 6.65 },
  entry: { u: 10.52, v: 6.65 },
} as const;

export function experimentAngle(elapsedMs: number) {
  const t = Math.max(0, Math.min(1, elapsedMs / SHRIMP_EXPERIMENT.durationMs));
  return SHRIMP_EXPERIMENT.revolutions * 2 * Math.PI * t * t * (3 - 2 * t);
}
