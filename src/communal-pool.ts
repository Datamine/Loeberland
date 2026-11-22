import { pose, type Mesh } from './geometry.ts';
import { drawPlaque } from './southern-district.ts';
import type { ParcelTerrain } from './types/parcels.ts';
import type { Actor, RenderedSite, SignAtlas } from './types/world.ts';

export const COMMUNAL_POOL = { id: 'communal-pool', name: 'Communal Pool', x: 64, z: 187 };
export const POOL_SWIMMER = 'pool-swimmer';

export function drawCommunalPool(m: Mesh, terrain: ParcelTerrain, signs: SignAtlas) {
  const { id, name, x, z } = COMMUNAL_POOL;
  const deck = terrain.height(x, z) + 0.025;
  const water = deck - 0.09;
  const start = m.data.length;
  const west = -1.5,
    east = 1.5,
    north = -1,
    south = 1;
  terrain.cutPlot({ cx: x + 0.15, cz: z + 0.08, w: 4.1, d: 3.3, height: deck - 0.045 });
  // The cut extends under the coping so every terrain vertex below the water is lowered.
  terrain.cutPlot({ cx: x, cz: z, w: 3.25, d: 2.25, height: deck - 1.08 });
  pose(m, x, deck, z, 0, () => {
    const stone = '#d2c4ab';
    m.box(-2, -0.09, -1.45, 4.18, 0.09, 0.45, stone, 'travertine');
    m.box(-2, -0.09, south, 4.18, 0.09, 0.84, stone, 'travertine');
    m.box(-2, -0.09, north, 0.5, 0.09, 2, stone, 'travertine');
    m.box(east, -0.09, north, 0.68, 0.09, 2, stone, 'travertine');
    m.box(west, -1.03, north, 3, 0.03, 2, '#63a2af', 'poolMosaic');
    for (const zz of [north - 0.08, south]) {
      m.box(west - 0.08, -1.02, zz, 3.16, 1, 0.08, '#6d9eb0', 'poolMosaic');
      m.box(west - 0.12, -0.025, zz - 0.025, 3.24, 0.064, 0.13, '#eee5cd', 'travertine');
    }
    for (const xx of [west - 0.08, east]) {
      m.box(xx, -1.02, north, 0.08, 1, 2, '#6d9eb0', 'poolMosaic');
      m.box(xx - 0.025, -0.025, north, 0.13, 0.064, 2, '#eee5cd', 'travertine');
    }
    m.quad(
      [west, water - deck, north],
      [west, water - deck, south],
      [east, water - deck, south],
      [east, water - deck, north],
      '#85c7c4',
      { water: 4 },
    );
    // Aluminium rails come up over the east deck; rungs continue below the surface.
    for (const zz of [-0.13, 0.13]) {
      m.rod([1.38, -0.65, zz], [1.38, 0.38, zz], 0.019, '#c7cec7', 9, { metal: 0.7 });
      m.rod([1.38, 0.38, zz], [1.72, 0.38, zz], 0.019, '#c7cec7', 9, { metal: 0.7 });
      m.rod([1.72, 0.38, zz], [1.72, 0, zz], 0.019, '#c7cec7', 9, { metal: 0.7 });
    }
    for (const yy of [-0.17, -0.34, -0.51])
      m.rod([1.38, yy, -0.13], [1.38, yy, 0.13], 0.014, '#c7cec7', 8);
    for (const dx of [-0.76, 0.76])
      m.box(dx - 0.027, -0.06, 1.71, 0.054, 0.88, 0.055, '#827052', 'wood');
    m.box(-0.85, 0.52, 1.69, 1.7, 0.25, 0.075, '#4d6861', 'wood');
    drawPlaque(m, signs, name, 0, 0.57, 1.771, 1.53, 0.15);
  });
  const people: Actor[] = [
    {
      name: 'Maya',
      x: 63,
      z: 187.48,
      approach: { x: 62.5, y: 188.15 },
      angle: Math.PI / 2,
      skin: '#b78561',
      shirt: '#ad5f73',
      hair: '#3b2c28',
      female: true,
      neighborLine: 'There’s always room for one more on the deck.',
    },
    {
      name: 'Eli',
      x: 64,
      z: 186.42,
      approach: { x: 63.5, y: 185.02 },
      angle: -Math.PI / 2,
      skin: '#cfaa85',
      shirt: '#4f8588',
      hair: '#765441',
      neighborLine: 'The water feels just right once you get your shoulders in.',
    },
    {
      name: 'Nina',
      x: 64.93,
      z: 187.42,
      approach: { x: 64.43, y: 188.15 },
      angle: Math.PI / 2,
      skin: '#8d614a',
      shirt: '#b59a63',
      hair: '#302c2e',
      female: true,
      neighborLine: 'We take turns opening the pool in the mornings.',
    },
  ].map((person, i) => ({
    ...person,
    id: id + '-swimmer-' + (i + 1),
    siteId: id,
    label: person.name,
    kind: POOL_SWIMMER,
    base: water - 0.89 + i * 0.025,
    height: 1.4,
    seated: true,
    stationary: true,
    regional: true,
    description: 'A neighbor cooling off in the communal pool.',
  }));
  const site: RenderedSite = {
    id,
    label: name,
    kind: id,
    entry: { x: 65.49, y: 187.15 },
    mapPoint: { x, y: z },
    description: 'A public mosaic-tiled swimming pool with a stone deck and a ladder.',
    start,
    count: m.data.length - start,
    lo: [x - 2, deck - 1.03, z - 1.45],
    hi: [x + 2.18, deck + 0.82, z + 1.84],
    solid: false,
    navigationPolygons: [
      [
        [x + west, z + north],
        [x + east, z + north],
        [x + east, z + south],
        [x + west, z + south],
      ],
    ],
  };
  return { site, people };
}
