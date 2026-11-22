import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCountryside } from '../src/countryside.ts';
import { createRegionalRoad } from '../src/regional-road.ts';
import { createFerrari } from '../src/ferrari.ts';
import { createEsotericCampus } from '../src/alien-sites.ts';
import { TAHOE_BOUNDS } from '../src/tahoe.ts';
import { EAST_BAY_COAST_X, eastBayShoreX } from '../src/geography.ts';
const road = createRegionalRoad(),
  campus = createEsotericCampus(createFerrari(road)),
  grass = createCountryside({
    road,
    campus,
    parcels: [{ x: 400, z: -300, w: 4, d: 3, angle: 0.6 }],
  });
test('regional lawns are walkable off the highway and solid parcels and water remain blocked', () => {
  for (const [x, z] of [
    [180, -10] satisfies [number, number],
    [350, -150] satisfies [number, number],
    [720, -530] satisfies [number, number],
    [1000, -730] satisfies [number, number],
  ]) {
    assert.ok(grass.contains(x, z));
    const a = { x: x - 0.5, y: z - 0.5 },
      b = { x: x + 8, y: z - 4 };
    assert.ok(grass.segment(a, b));
    assert.deepEqual(
      grass.path(a, b, () => null),
      [b],
    );
  }
  assert.equal(grass.contains(EAST_BAY_COAST_X - 1, 0), false);
  assert.equal(grass.contains(400, -300), false);
  for (const o of grass.obstacles) assert.equal(grass.contains(o.x, o.z), false);
});
test('native visibility adjacency routes around buildings and the Tahoe boundary without a huge empty grid', () => {
  assert.ok(grass.nodes.length < 60);
  const from = { x: 390, y: -300.5 },
    to = { x: 410, y: -300.5 },
    path = grass.path(from, to, () => null);
  assert.ok(requiredFixture(path).length > 1);
  let previous = from;
  for (const next of requiredFixture(path)) {
    assert.ok(grass.segment(previous, next));
    previous = next;
  }
  assert.deepEqual(previous, to);
  const b = TAHOE_BOUNDS,
    a = { x: b.west - 2, y: b.north + 10 },
    c = { x: b.east + 2, y: b.north + 10 },
    around = grass.path(a, c, () => null);
  assert.ok(around);
  previous = a;
  for (const next of around) {
    assert.ok(grass.segment(previous, next));
    previous = next;
  }
});
test('grass picking and foot heights match the actual regional backdrop triangles', () => {
  for (const [x, z] of [
    [180, -10] satisfies [number, number],
    [350, -150] satisfies [number, number],
    [720, -530] satisfies [number, number],
    [1000, -730] satisfies [number, number],
    [TAHOE_BOUNDS.west - 1, TAHOE_BOUNDS.north + 7] satisfies [number, number],
  ]) {
    const y = grass.height(x, z),
      hit = grass.raycast({
        origin: [x, y + 30, z] satisfies [number, number, number],
        dir: [0, -1, 0] satisfies [number, number, number],
      });
    assert.ok(hit);
    assert.ok(Math.abs(hit.point[1] - y) < 1e-7);
  }
});

test('the East Bay beach slopes to the water and follows the same shoreline for picking and walking', () => {
  for (const z of [-23.2, 19.7, 62.6]) {
    const shore = eastBayShoreX(z);
    assert.equal(grass.contains(shore - 0.15, z), false);
    for (const x of [shore + 0.4, shore + 1, shore + 2, 126]) {
      assert.ok(grass.contains(x, z));
      const hit = grass.raycast({ origin: [x, 8, z], dir: [0, -1, 0] });
      assert.ok(hit && Math.abs(hit.point[1] - grass.height(x, z)) < 1e-8);
    }
    assert.ok(grass.height(shore + 0.3, z) < grass.height(shore + 1.3, z));
  }
});
