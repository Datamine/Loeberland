import { fixture, fixtureGeometry, player } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerMovement } from '../movement.mts';
import { createRegionalRoad } from '../../src/regional-road.ts';
import type { ServerEvent } from '../../src/types/network.ts';

test('the server parks at the San Francisco bridge limit, dismounts once, and allows driving back', async (t) => {
  const road = createRegionalRoad({
    route: [
      [0, 1, 0] satisfies [number, number, number],
      [20, 1, 0] satisfies [number, number, number],
      [20, 1, -20] satisfies [number, number, number],
    ],
  });
  const traffic = {
    nodes: [
      { x: 0, z: 0, neighbors: [1] },
      { x: 0, z: 10, neighbors: [0, 2] },
      { x: 10, z: 10, neighbors: [1] },
    ],
    edges: [
      { from: 0, to: 1, length: 10, street: 'Test road' },
      { from: 1, to: 2, length: 10, street: 'Test road' },
    ],
  };
  const { game } = await fixture();
  t.after(() => game.close());
  const { p } = await player(game, 44001, {
    'sf-ferrari-v1': '{"owned":true,"distance":10,"fuel":1}',
  });
  Object.assign(p, { x: 10, z: 0, y: 1 });
  const messages: ServerEvent[] = [];
  const movement = createServerMovement({
    geometry: {
      ...fixtureGeometry(),
      regionalRoad: road,
      streetTraffic: traffic,
      characterGround: () => 1,
      pathTo: () => assert.fail('driving must never consult pedestrian navigation'),
    },
    routes: game.routes,
    players: new Map([[p.id, p]]),
    send: (_player, message) => messages.push(message as ServerEvent),
    dirty: () => {},
    now: () => 0,
    following: { ...game.following, stop: () => false, owns: () => false },
  });

  const car = requiredFixture(movement.state(p).ferrari);
  const parking = car.sample(car.cityParking);
  assert.equal(movement.activity(p, { mode: 'ferrari' }).ok, true);
  assert.deepEqual(movement.move(p, { x: 9, z: 9 }), {
    ok: true,
    goal: { x: parking.x, z: parking.z },
  });
  for (let i = 0; i < 100; i++) {
    movement.tick(0.05);
    assert.ok(car.state.distance >= car.cityParking);
    assert.ok(road.contains(p.x, p.z));
  }
  assert.equal(p.mode, 'walk');
  assert.equal(movement.state(p).mode, 'walk');
  assert.equal(p.moving, false);
  assert.equal(car.state.riding, false);
  assert.equal(car.state.distance, car.cityParking);
  assert.equal(p.x, parking.x);
  assert.equal(p.z, parking.z);
  const notices = messages.flatMap((message) => (message.type === 'notice' ? [message.message] : []));
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Ferrari doesn't work in San Francisco/);
  const handoff = requiredFixture(messages.find((message) => message.type === 'position'));
  assert.equal(handoff.reason, 'ferrariDismount');
  assert.equal(handoff.x, parking.x);
  assert.equal(JSON.parse(p.profile.privateState['sf-ferrari-v1']).distance, car.cityParking);

  assert.equal(movement.activity(p, { mode: 'ferrari' }).ok, true);
  assert.equal(movement.move(p, { x: 25, z: -8 }).ok, true);
  car.refuel();
  for (let i = 0; i < 200 && car.state.target !== null; i++) {
    movement.tick(0.025);
    assert.ok(road.contains(p.x, p.z));
    if (car.state.empty) car.refuel();
  }
  assert.equal(p.x, 20);
  assert.equal(p.z, -8);
  assert.equal(p.mode, 'ferrari');
});
