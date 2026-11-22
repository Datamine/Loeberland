export const POINT_REYES = Object.freeze({
  id: 'point-reyes',
  kind: 'beach',
  label: 'Point Reyes',
  entry: { x: -20.3, y: -69.9 },
  description:
    'A stretch of rocky coastline north of Bolinas. Sea urchins creep along the exposed shore.',
});

export const POINT_REYES_URCHINS = Object.freeze(
  [
    { x: -19.5, z: -67.25 },
    { x: -20.7, z: -71.35 },
    { x: -22.1, z: -75.9 },
    { x: -18.9, z: -65.15 },
    { x: -20.1, z: -69.35 },
    { x: -21.4, z: -73.6 },
  ].map((position, i) => ({
    id: 'point-reyes-urchin-' + (i + 1),
    combatKind: 'sea-urchin',
    ...position,
  })),
);
