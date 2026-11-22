import test from 'node:test';
import assert from 'node:assert/strict';
import { ILLUMINATI_INSTANCE } from '../../src/map-instances.ts';
import { applyWorldPatches, type WorldMaps } from '../../src/world-deltas.ts';
import { fixture, player, type TestPlayer } from './fixtures.mts';

function readPolice(player: TestPlayer) {
  const maps: WorldMaps = {};
  return () => {
    for (const message of player.messages.splice(0))
      if (message.type === 'world') applyWorldPatches(maps, message.patches, message.removed);
    return [...(maps.police?.values() ?? [])];
  };
}

test('police movement is replicated to witnesses and removed when the pursuit ends', async () => {
  const { game, advance } = await fixture();
  try {
    const suspect = await player(game, 41001);
    const witness = await player(game, 41002);
    const distant = await player(game, 41003);
    const inside = await player(game, 41004);
    distant.p.x -= 60;
    inside.p.instance = ILLUMINATI_INSTANCE;
    const privatePolice = game.personal.runtime(suspect.p).police;
    privatePolice.start();
    assert.equal(privatePolice.state.officers.length, 3);

    const witnessPolice = readPolice(witness);
    const distantPolice = readPolice(distant);
    const insidePolice = readPolice(inside);
    game.broadcast();
    assert.ok(
      suspect.messages.some((m) => m.type === 'playerState' && m.state?.police?.wanted === true),
    );
    for (const messages of [witness.messages, distant.messages, inside.messages])
      assert.ok(messages.every((m) => m.type !== 'playerState' || !m.state?.police?.wanted));
    assert.deepEqual(readPolice(suspect)(), []);
    const first = witnessPolice();
    assert.equal(first.length, 3);
    assert.deepEqual(distantPolice(), []);
    assert.deepEqual(insidePolice(), []);

    advance(250);
    game.tick(0.25);
    game.broadcast();
    const moved = witnessPolice();
    assert.deepEqual(
      moved.map((n) => n.id),
      first.map((n) => n.id),
    );
    assert.ok(moved.every((n, i) => n.phase > first[i].phase));

    privatePolice.update(10, 0);
    assert.equal(privatePolice.state.wanted, false);
    advance(250);
    game.tick(0.25);
    game.broadcast();
    assert.deepEqual(witnessPolice(), []);
  } finally {
    await game.close();
  }
});
