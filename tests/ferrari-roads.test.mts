import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredFixture } from './helpers/required.mts';
import { createRegionalRoad } from '../src/regional-road.ts';
import { createFerrari, FERRARI_SPEED } from '../src/ferrari.ts';
import { createCityStreetDistance } from '../src/ferrari-roads.ts';

function roadFixture() {
  const road = createRegionalRoad({
    route: [
      [0, 1, 0] satisfies [number, number, number],
      [20, 2, 0] satisfies [number, number, number],
      [20, 3, -20] satisfies [number, number, number],
      [40, 4, -20] satisfies [number, number, number],
    ],
  });
  const traffic = {
    nodes: [
      { x: 0, z: 0, neighbors: [1] },
      { x: 0, z: 10, neighbors: [0, 2] },
      { x: 10, z: 10, neighbors: [1] },
      { x: 8, z: 5, neighbors: [4] },
      { x: 10, z: 5, neighbors: [3] },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ],
  };
  const cityStreetDistanceSquared = createCityStreetDistance({
    gate: road.points[0],
    traffic: () => traffic,
  });
  return { road, cityStreetDistanceSquared };
}

test('city destinations and the west end of the bridge select the same parking spot', () => {
  const { road, cityStreetDistanceSquared } = roadFixture();
  const car = createFerrari(road, { owned: true, distance: 16 }, () => {}, {
    cityStreetDistanceSquared,
  });
  const parking = car.sample(car.cityParking);

  assert.equal(car.destinationFor(NaN, 0), null);
  assert.equal(cityStreetDistanceSquared(9, 5.1), (5.1 - 10) ** 2);
  assert.deepEqual(car.destinationFor(9, 9), parking);
  assert.deepEqual(car.destinationFor(0, 0), parking);
  assert.deepEqual(car.destinationFor(25, -8), car.sample(28));

  car.mount();
  assert.ok(car.driveTo(9, 9));
  assert.equal(car.update(5), 'city-limit');
  assert.equal(car.state.riding, false);
  assert.equal(car.state.target, null);
  assert.equal(car.state.speed, 0);
  assert.equal(car.state.distance, car.cityParking);

  car.mount();
  assert.equal(car.update(0.05), null);
  assert.equal(car.state.riding, true);
  assert.ok(car.driveTo(25, -8));
  assert.ok(car.update(0.05) === null && car.state.distance > car.cityParking);
});

test('regional drives stay on the road and respect the movement budget through its bends', () => {
  const { road } = roadFixture();
  const car = createFerrari(road, { distance: 16 });
  car.mount();

  for (const [x, z] of [
    [200, -40] satisfies [number, number],
    [18, -8] satisfies [number, number],
    [31, -16] satisfies [number, number],
  ]) {
    car.refuel();
    const goal = requiredFixture(car.destinationFor(x, z));
    assert.ok(car.driveTo(x, z));
    for (let tick = 0; tick < 1000 && car.state.target !== null; tick++) {
      const before = car.state.distance;
      const result = car.update(0.025);
      assert.ok(Math.abs(car.state.distance - before) <= FERRARI_SPEED * 0.025 + 1e-9);
      assert.ok(road.contains(car.position.x, car.position.z));
      if (result === 'empty') car.refuel();
    }
    assert.equal(car.state.distance, goal.distance);
  }
});

test('old city saves move the parked car to the bridge and preserve ownership and fuel', () => {
  const { road } = roadFixture();
  const car = createFerrari(road, {
    owned: true,
    distance: 0,
    fuel: 0.37,
    localPosition: { x: 7, y: 1, z: 8, angle: 0 },
  });
  assert.equal(car.state.distance, car.cityParking);
  assert.equal(car.state.fuel, 0.37);
  assert.equal(car.state.owned, true);
  assert.equal(car.state.riding, false);

  car.applySaved({
    owned: true,
    distance: 12,
    fuel: 0.23,
    localPosition: { x: 12, y: 1.6, z: 0, angle: 0 },
  });
  assert.equal(car.state.distance, 12, 'an older highway save stays on the highway');
  assert.equal(car.state.fuel, 0.23);
});
