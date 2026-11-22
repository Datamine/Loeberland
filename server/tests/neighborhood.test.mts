import {
  storedPlayerFixture,
  fixtureGeometry,
  player,
  command,
  requiredResult,
} from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';

import { makeNeighborhoodBench } from '../../src/neighborhood-interactions.ts';
import { JURASSIC } from '../../src/jurassic-layout.ts';
import { worldRecord, worldPatch, applyWorldPatches } from '../../src/world-deltas.ts';

async function setup() {
  const geometry = fixtureGeometry(),
    bench = makeNeighborhoodBench({
      id: 'test-bench',
      x: 94,
      z: 120,
      base: 1.15,
      height: 0.43,
      start: 0,
      count: 0,
    });
  geometry.sights = [bench];
  geometry.landClearAt = (x, y) => Math.hypot(x + 0.5 - bench.seat.x, y + 0.5 - bench.seat.z) > 0.3;
  geometry.merchants = [
    { label: 'tea', id: 'tea', x: 92.2, z: 120, base: 1.15, neighborhoodService: 'tea' },
    {
      label: 'flowers',
      id: 'flowers',
      x: 92.2,
      z: 120,
      base: 1.15,
      neighborhoodService: 'flowers',
    },
    { label: 'books', id: 'books', x: 92.2, z: 120, base: 1.15, neighborhoodService: 'books' },
    {
      label: 'Menotti’s barista',
      id: 'menottis-barista',
      x: 92.2,
      z: 120,
      base: 1.15,
      neighborhoodService: 'menottis',
    },
    { label: 'jurassic-scientist', id: 'jurassic-scientist', x: 92.2, z: 120, base: 1.15 },
  ];
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0.5 });
  return { game, geometry, bench };
}

test('picking up a sandwich grants the food without a loot announcement', async (t) => {
  const { game } = await setup();
  t.after(() => game.close());
  const a = await player(game, 28104);
  const cow = game.shared.cows[0];
  Object.assign(cow, { x: a.p.x + 0.6, z: a.p.z, hp: 1 });
  await command(game, a.p, 'attack', { id: cow.id, weapon: 'unarmed' });
  assert.equal(requiredResult(a.messages).ok, true);
  const sandwich = requiredFixture(
    [...game.shared.loot.values()].find((item) => item.lootKind === 'sandwich'),
  );
  await command(game, a.p, 'collect', { id: sandwich.id });
  const result = requiredResult(a.messages);
  assert.equal(result.ok, true);
  assert.equal(result.message, undefined);
  assert.equal(a.p.inventory.snapshot().sandwiches, 1);
});

test('Menotti’s charges for coffee and pays for clearing tables once per cooldown', async (t) => {
  const { game } = await setup();
  t.after(() => game.close());
  const { p, messages } = await player(game, 28105, { 'sf-purse-v1': '{"coins":1}' });
  const order = (offer: string) =>
    command(game, p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'menottis-barista',
      offer,
    });
  p.hp = 10;
  await order('coffee');
  assert.equal(requiredResult(messages).ok, true);
  assert.equal(p.inventory.economy.state.coins, 0);
  assert.equal(p.hp, 11);
  await order('coffee');
  assert.equal(requiredResult(messages).ok, false);
  await order('bus-tables');
  assert.equal(requiredResult(messages).ok, true);
  assert.equal(p.inventory.economy.state.coins, 1);
  await order('bus-tables');
  assert.equal(requiredResult(messages).ok, false);
  assert.equal(p.inventory.economy.state.coins, 1);
});

test('shopkeepers validate proximity, prices and options; tea heals and sobers, bouquets persist and books are free', async () => {
  const { game } = await setup(),
    a = await player(game, 28100, { 'sf-purse-v1': '{"coins":5}', 'sf-inebriation-v1': '40' });
  try {
    a.p.hp = 10;
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'tea',
      offer: 'jasmine',
      price: 0,
    });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.hp, 15);
    assert.equal(a.p.inventory.economy.state.coins, 4);
    assert.equal(game.personal.runtime(a.p).inebriation.state.percent, 30);
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'flowers',
      offer: 'bouquet',
    });
    assert.equal(a.p.inventory.economy.state.coins, 2);
    assert.equal(a.p.inventory.economy.state.bouquets, 1);
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'books',
      offer: 'garden',
    });
    assert.match(
      requiredFixture(requiredResult(a.messages).message),
      /conversation with the weather/,
    );
    assert.equal(a.p.inventory.economy.state.coins, 2);
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'tea',
      offer: 'forged',
    });
    assert.equal(requiredResult(a.messages).ok, false);
    a.p.x += 20;
    await command(game, a.p, 'playerAction', {
      verb: 'neighborhoodService',
      id: 'flowers',
      offer: 'bouquet',
    });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 2);
    await game.flush();
    const saved = await storedPlayerFixture(game.store, 'player:' + a.p.owner);
    assert.equal(saved.playerState.inventory.economy.bouquets, 1);
  } finally {
    await game.close();
  }
});

test('benches have exclusive server-owned seated poses, double sobering and a safe walkable exit', async () => {
  const { game, bench, geometry } = await setup(),
    a = await player(game, 28101, { 'sf-inebriation-v1': '40' }),
    b = await player(game, 28102);
  try {
    for (const person of [a, b])
      Object.assign(person.p, { x: bench.entry.x + 0.5, z: bench.entry.y + 0.5 });
    await command(game, a.p, 'activity', { mode: 'sit', seat: bench.id });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.mode, 'bench');
    assert.equal(a.p.x, bench.seat.x);
    assert.equal(a.p.angle, bench.seat.angle);
    await command(game, b.p, 'activity', { mode: 'sit', seat: bench.id });
    assert.equal(requiredResult(b.messages).ok, false);
    game.tick(3);
    assert.equal(game.personal.runtime(a.p).inebriation.state.percent, 38);
    assert.equal(a.p.x, bench.seat.x);
    const saved = game.movement.savePosition(a.p, { x: a.p.x, y: a.p.y, z: a.p.z });
    assert.ok(geometry.landClearAt(requiredFixture(saved.x) - 0.5, requiredFixture(saved.z) - 0.5));
    await command(game, a.p, 'moveTo', { x: 98, z: 123 });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.seat, null);
    game.tick(0.5);
    assert.equal(a.p.mode, 'walk');
    assert.ok(geometry.landClearAt(a.p.x - 0.5, a.p.z - 0.5));
    await command(game, b.p, 'activity', { mode: 'sit', seat: bench.id });
    assert.equal(requiredResult(b.messages).ok, true);
    await command(game, b.p, 'activity', { mode: 'walk' });
    assert.equal(b.p.seat, null);
  } finally {
    await game.close();
  }
});

test('raptor remains survive the compact world channel as shared loot and advance the personal recovery quest durably', async () => {
  const { game } = await setup(),
    a = await player(game, 28103, { 'sf-expeditions-v1': '{}' });
  try {
    a.p.inventory.meta.railgunCharge = 0;
    await command(game, a.p, 'playerAction', { verb: 'startRaptor' });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.inventory.meta.railgunCharge, 25);
    assert.equal(a.p.appearance.weapon, 'railgun');
    const raptor = game.shared.raptor;
    assert.equal(raptor.phase, 'releasing');
    for (let i = 0; i < 75; i++) game.tick(0.05);
    assert.equal(raptor.phase, 'loose');
    assert.ok(Math.hypot(raptor.x - JURASSIC.runout.x, raptor.z - JURASSIC.runout.z) < 0.001);
    raptor.hp = 1;
    Object.assign(a.p, { x: raptor.x - 0.6, z: raptor.z });
    await command(game, a.p, 'attack', { id: game.shared.raptor.id, weapon: 'railgun' });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.inventory.meta.railgunCharge, 24);
    const item = [...game.shared.loot.values()].find((n) => n.lootKind === 'raptor');
    assert.ok(item);
    const packed = requiredFixture(worldPatch(item.id, worldRecord('loot', item), undefined)),
      decoded = applyWorldPatches({}, { loot: [packed] }).loot[0];
    assert.equal(decoded.network, true);
    await command(
      game,
      a.p,
      decoded.network ? 'collect' : 'playerAction',
      decoded.network ? { id: decoded.id } : { verb: 'collectPersonal', id: decoded.id },
    );
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(game.personal.runtime(a.p).expeditions.state.raptor, 'carrying');
    assert.equal(game.shared.loot.has(item.id), false);
    await command(game, a.p, 'collect', { id: item.id });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(game.personal.runtime(a.p).expeditions.state.raptor, 'carrying');
    await game.flush();
    const saved = await storedPlayerFixture(game.store, 'player:' + a.p.owner);
    assert.equal(saved.playerState.quests.expeditions.raptor, 'carrying');
    assert.equal(saved.playerState.appearance.weapon, 'railgun');
  } finally {
    await game.close();
  }
});
