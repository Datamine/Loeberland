import type { WorldPoint } from '../types/geometry.ts';

export const GOBLIN_CATAPULT = {
  id: 'strange-contraption',
  name: 'Strange Contraption',
  description: 'A copper dial is marked A, B, and Probably. Its needle is stuck on Probably.',
  mode: 'catapult',
  verb: 'goblinCatapultExperiment',
  reward: 5,
  x: 52.2,
  z: -17.36,
  scientist: {
    id: 'goblin-catapult-scientist',
    name: 'Goblin Scientist',
    description: 'A goblin in a laboratory coat, making notes on a stained clipboard.',
    x: 50.58,
    z: -16.97,
    approach: { x: 49.94, y: -18.49 },
  },
  landing: { u: -15.5, v: -25.2 },
  mountSeconds: 0.8,
  releaseSeconds: 1.8,
  resetSeconds: 0.85,
  flightSeconds: 5.2,
  flightRise: 26,
  pivot: 0.97,
  arm: 1.36,
} as const;
export const CATAPULT_DURATION = GOBLIN_CATAPULT.releaseSeconds + GOBLIN_CATAPULT.flightSeconds;

type FlightPoint = WorldPoint & { y: number };
export type CatapultRig = WorldPoint & { base: number; angle: number };
export type CatapultFlight = {
  rig: CatapultRig;
  from: FlightPoint;
  landing: FlightPoint;
};

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const interpolate = (a: FlightPoint, b: FlightPoint, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export function catapultArmAngle(elapsed: number) {
  const neutral = -0.21;
  const lift = 1.37;
  const beforeRelease = GOBLIN_CATAPULT.releaseSeconds - 0.52;
  if (elapsed >= GOBLIN_CATAPULT.releaseSeconds)
    return (
      lift +
      (neutral - lift) *
        smooth(clamp((elapsed - GOBLIN_CATAPULT.releaseSeconds) / GOBLIN_CATAPULT.resetSeconds))
    );
  if (elapsed <= beforeRelease) return neutral;
  return neutral + (lift - neutral) * clamp((elapsed - beforeRelease) / 0.52) ** 2.3;
}

export function catapultSeat(angle: number) {
  return {
    y: GOBLIN_CATAPULT.pivot + GOBLIN_CATAPULT.arm * Math.sin(angle),
    z: -GOBLIN_CATAPULT.arm * Math.cos(angle),
  };
}

export function catapultPose(flight: CatapultFlight, elapsed: number) {
  const { rig, from, landing } = flight;
  const { mountSeconds, releaseSeconds, flightRise, flightSeconds } = GOBLIN_CATAPULT;
  const chair = (time: number) => {
    const local = catapultSeat(catapultArmAngle(time));
    return {
      x: rig.x + Math.cos(rig.angle) * local.z,
      y: rig.base + local.y,
      z: rig.z + Math.sin(rig.angle) * local.z,
    };
  };
  if (elapsed < mountSeconds) {
    const t = clamp(elapsed / mountSeconds);
    const p = interpolate(from, chair(0), smooth(t));
    return { ...p, y: p.y + Math.sin(t * Math.PI) * 0.13 };
  }
  if (elapsed < releaseSeconds) return chair(elapsed);
  const t = clamp((elapsed - releaseSeconds) / flightSeconds);
  const p = interpolate(chair(releaseSeconds), landing, t);
  return { ...p, y: p.y + 4 * flightRise * t * (1 - t) };
}
