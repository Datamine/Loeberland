import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from '../src/geometry.ts';
import { createInteractions } from '../src/world/interactions.ts';
import { createRuntime } from '../src/world/runtime.ts';
import type { WorldContext } from '../src/world/scene.ts';

function view(height: number) {
  const context = {
    width: 1200,
    height: 600,
    camera: {
      eye: [500, height, 500],
      right: [1, 0, 0],
      up: [0, 0, -1],
      back: [0, 1, 0],
      tan: 0.5,
    },
    player: { x: 55, y: 55 },
    N: 1500,
    TERRAIN_GRID: 1,
    TERRAIN_RES: 1 / 1500,
    heights: [
      [1, 1],
      [1, 1],
    ],
    insidePolygon: () => true,
    activeInstituteRoom: () => null,
    dynamicTargets: [] as object[],
    objects: [],
    searchSites: [],
    loreSites: [],
    frameID: 0,
  };
  return { context, runtime: createRuntime(context as unknown as WorldContext) };
}

test('distant world surfaces and objects remain pickable throughout the visible depth', () => {
  const { runtime, context } = view(350);
  assert.deepEqual(runtime.tileAt(600, 300), { x: 499.5, y: 499.5 });
  const mesh = new Mesh();
  mesh.tri([498, 3, 498], [500, 3, 503], [502, 3, 498], '#cccccc');
  const object = { mesh, start: 0, count: 3, lo: [498, 3, 498], hi: [502, 3, 503] };
  context.dynamicTargets.push(object);
  assert.equal(runtime.pick(600, 300), object);

  // The edge ray travels more than 850 units before reaching this tile,
  // but the tile is still within the camera's 850 units of forward depth.
  const edge = view(800);
  const tile = edge.runtime.tileAt(1140, 300);
  assert.ok(Math.abs(tile.x - (500 + 799 * 0.9 - 0.5)) < 1e-8);
  assert.ok(Math.abs(tile.y - 499.5) < 1e-8);

  const clipped = view(900);
  assert.ok(Number.isNaN(clipped.runtime.tileAt(600, 300).x));
});

test('a missed ground ray cannot submit an invalid movement command', () => {
  const context = {
    multiplayer: { state: { connected: true } },
    multiplayerWorld: { moveTo: () => assert.fail('A ray miss must not send a movement command') },
  };
  const { walkTo } = createInteractions(context as unknown as WorldContext);
  assert.equal(walkTo(NaN, 50), false);
  assert.equal(walkTo(50, Infinity), false);
});
