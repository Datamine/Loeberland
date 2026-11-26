export const WAYWARD_CAMP = {
  fire: { id: 'wayward-campfire', x: 131, z: -20.3, w: 0.96, d: 0.96 },
  wagon: { id: 'wayward-camp-wagon', x: 127.9, z: -20.8, w: 3.25, d: 1.96 },
  horse: { id: 'wayward-camp-horse', x: 132.8, z: -22.6, w: 3.06, d: 1.22 },
} as const;

export const WAYWARD_CAMP_PARCELS = Object.values(WAYWARD_CAMP);
export const WAYWARD_CAMP_CROSSINGS = [
  { x: 126.25, z: -19.4 },
  { x: 132.5, z: -20.85 },
  { x: 135.5, z: -24.5 },
] as const;

export const SLEEPING_HORSE_EXAMINE =
  "It's tired of everyone else's nonsense. This horse isn't going any further and that's that.";

export const NEER_DO_WELLS = [
  [5, 128.3, -18.7],
  [11, 131.55, -18.35],
  [17, 135.1, -20.45],
  [25, 130.6, -21.3],
].map(([level, x, z]) => {
  const id = 'neer-do-well-' + level;
  return { id, combatKind: id, level, x, z };
});

export const WAYWARD_GOBLINS = [
  [8, 130.65, -18.9],
  [10, 132.4, -19.55],
  [12, 132, -20.85],
  [15, 133.95, -20.7],
  [18, 129.35, -19.05],
].map(([level, x, z]) => {
  const id = 'wayward-goblin-' + level;
  return { id, combatKind: id, level, x, z };
});
