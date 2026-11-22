/** A sampled display pose is independent of authoritative movement state. */
export interface AnimationPose {
  mode: string;
  x?: number;
  z?: number;
  hp?: number;
  motion?: number;
  moving?: boolean;
  gesture?: string;
  phase?: number;
}
export interface AnimationFrame {
  mode: string;
  atvTravel: number;
  modeAt: number;
  motion: number;
  run: number;
  sitBlend: number;
  danceBlend: number;
  action: string | null;
  actionT: number;
  gestureStarted: number;
  fall: number;
}
