import type { TestGame, TestPlayer } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { fixtureGeometry, player, latestResult } from './fixtures.mts';
import { decodePlayerFrame } from '../../src/multiplayer-protocol.ts';
import { CAPTURE_DURATION, DEATH_DURATION } from '../../src/capture-animation.ts';
import { TABLET_TELEPORT_SECONDS } from '../../src/teleport-tablets.ts';
import { ITEM_STATS } from '../../src/item-stats.ts';
import { PLAYER_INTERACTION_RANGE } from '../player-proximity.mts';
import type { ServerPlayer } from '../../src/types/server.ts';
async function setup(geometry = fixtureGeometry()) {
  let time = 1000000;
  const game = await createGame({
    geometry,
    store: createMemoryStore(),
    now: () => time,
    random: () => 0.5,
  });
  return { game, advance: (ms: number) => (time += ms) };
}
async function act(
  game: TestGame,
  a: TestPlayer,
  action: string,
  args: Record<string, unknown> = {},
) {
  game.receive(a.p, {
    type: 'command',
    request: Math.random(),
    action,
    args,
    inventoryEpoch: a.p.inventory.meta.epoch,
  });
  await a.p.queue;
  return latestResult(a.messages);
}
function idlePose(p: ServerPlayer) {
  return { x: p.x, y: p.y, z: p.z, angle: 0, phase: 0, motion: 0, mode: 'walk', hp: p.hp };
}
test('following advances on server ticks with no follower poses, continues through leader turns and publishes the walking phase to both players', async () => {
  const { game, advance } = await setup(),
    a = await player(game, 901),
    b = await player(game, 902);
  b.p.x += 7;
  try {
    const distance = () => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
    assert.equal(
      requiredFixture(await act(game, b, 'moveTo', { x: b.p.x + 20, z: b.p.z })).ok,
      true,
    );
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    assert.equal(a.p.following, null, 'the approach has not started following');
    const start = a.p.x;
    for (let i = 0; i < 20; i++) {
      advance(50);
      game.tick(0.05);
    }
    assert.ok(a.p.x > start + 4);
    assert.ok(a.p.moving);
    assert.ok(b.p.moving);
    assert.ok(a.p.phase > 0);
    assert.ok(distance() > PLAYER_INTERACTION_RANGE);
    assert.ok(!a.messages.some((m) => m.type === 'following' && m.target === b.p.id));
    game.broadcast();
    for (const observer of [a, b]) {
      const frame = decodePlayerFrame(
          requiredFixture(observer.messages.filter((m) => m instanceof ArrayBuffer).at(-1)),
        ),
        follower = requiredFixture(frame).players.find((p) => p.id === a.p.id);
      assert.ok(follower);
      assert.ok(follower.moving);
      assert.ok(follower.phase > 0);
    }
    for (let i = 0; i < 65 && !a.p.following; i++) {
      advance(50);
      game.tick(0.05);
    }
    assert.ok(b.p.moving, 'the follower catches up before the leader stops');
    assert.ok(distance() <= PLAYER_INTERACTION_RANGE);
    assert.equal(a.p.following, b.p.id);

    await act(game, b, 'moveTo', { x: b.p.x, z: b.p.z + 7 });
    for (let i = 0; i < 50; i++) {
      advance(50);
      game.tick(0.05);
    }
    assert.ok(distance() <= 1.3);
    assert.equal(a.p.following, b.p.id);
    const stale = { ...idlePose(a.p), x: start };
    game.receive(a.p, { type: 'pose', pose: stale });
    assert.notEqual(
      a.p.x,
      start,
      'a throttled or stale browser pose cannot overwrite authoritative following',
    );
    await act(game, a, 'stopFollowing');
    const stopped = { x: a.p.x, z: a.p.z };
    b.p.x += 4;
    for (let i = 0; i < 20; i++) game.tick(0.05);
    assert.deepEqual({ x: a.p.x, z: a.p.z }, stopped);
    assert.equal(a.p.following, null);
  } finally {
    await game.close();
  }
});
test('following respects obstacles, guild admission, disconnects, map instances and transport modes', async () => {
  const geometry = fixtureGeometry();
  let blocked = false;
  geometry.canTravel = () => !blocked;
  geometry.lineClear = () => assert.fail('ordinary following must not trace weapon rays');
  const { game } = await setup(geometry),
    a = await player(game, 903),
    b = await player(game, 904);
  b.p.x += 5;
  try {
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: a.p.id })).ok, false);
    b.p.instance = { kind: 'kraken', id: 'private-b', layer: -2 };
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, false);
    b.p.instance = { kind: 'world', id: 'world', layer: 0 };
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    blocked = true;
    const x = a.p.x;
    game.tick(0.05);
    assert.equal(a.p.x, x);
    assert.equal(a.p.following, null);
    blocked = false;
    await act(game, a, 'followPlayer', { id: b.p.id });
    game.tick(0.05);
    const beforeRevision = a.p.x;
    blocked = true;
    geometry.navigationRevision = 1;
    game.tick(0.05);
    assert.equal(
      a.p.x,
      beforeRevision,
      'a changed tile graph must invalidate the route-edge cache',
    );
    assert.equal(a.p.following, null);
    blocked = false;
    await act(game, a, 'followPlayer', { id: b.p.id });
    b.p.mode = 'airship';
    game.tick();
    assert.equal(a.p.following, null);
    b.p.mode = 'walk';
    await act(game, a, 'followPlayer', { id: b.p.id });
    game.disconnect(b.p);
    game.tick();
    assert.equal(a.p.following, null);
  } finally {
    await game.close();
  }
});
test('followers run to respawns and long-distance teleports, then follow an arrest to the jail fence', async () => {
  const geometry = fixtureGeometry();
  const jail = geometry.detention;
  const landClearAt = geometry.landClearAt;
  geometry.landClearAt = (x, y) => landClearAt(x, y) && !jail.walkable(x + 0.5, y + 0.5);
  const { game, advance } = await setup(geometry);
  const a = await player(game, 923);
  const b = await player(game, 924);
  const tick = () => {
    advance(50);
    game.tick(0.05);
  };
  const distance = () => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
  const followUntil = (range: number) => {
    for (let i = 0; i < 1000 && distance() > range; i++) {
      tick();
      assert.equal(a.p.following, b.p.id);
    }
    assert.ok(distance() <= range);
  };
  try {
    b.p.x += 1;
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    b.p.hp = 0;
    b.p.respawnAllowed = true;
    followUntil(1.25);
    assert.equal(requiredFixture(await act(game, b, 'respawn')).ok, false);
    advance(DEATH_DURATION * 1000);
    assert.equal(requiredFixture(await act(game, b, 'respawn')).ok, true);
    followUntil(1.25);

    assert.equal(requiredFixture(await act(game, b, 'teleport', { x: 175, z: 118 })).ok, true);
    assert.ok(distance() > 80);
    followUntil(1.25);

    const { police } = game.personal.runtime(b.p);
    police.state.wanted = true;
    police.state.officers.push({
      x: b.p.x - 0.5,
      y: b.p.z - 0.5,
      angle: 0,
      phase: 0,
      repath: 1,
      index: 0,
      path: [],
    });
    tick();
    assert.ok(b.p.detainAt);
    advance(CAPTURE_DURATION * 1000);
    tick();
    assert.ok(jail.walkable(b.p.x, b.p.z));
    followUntil(Math.max(jail.w, jail.d) / 2 + 0.8);
    tick();
    assert.equal(a.p.following, b.p.id);
    assert.equal(a.p.moving, false);
    assert.ok(!jail.walkable(a.p.x, a.p.z));

    assert.equal(
      requiredFixture(await act(game, b, 'playerAction', { verb: 'rehabilitate' })).ok,
      true,
    );
    advance(3500);
    tick();
    assert.equal(b.p.personalJailed, false);
    followUntil(1.25);
  } finally {
    await game.close();
  }
});

test('choosing another destination cancels a pending follow', async () => {
  const { game } = await setup();
  const a = await player(game, 927);
  const b = await player(game, 928);
  b.p.x += 6;
  try {
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    assert.equal(a.p.following, null);
    game.tick(0.05);
    assert.equal(
      requiredFixture(await act(game, a, 'moveTo', { x: a.p.x, z: a.p.z + 3 })).ok,
      true,
    );
    for (let i = 0; i < 45; i++) game.tick(0.05);
    assert.equal(a.p.following, null);
    assert.ok(!game.following.owns(a.p));
    assert.ok(!a.messages.some((m) => m.type === 'following' && m.target === b.p.id));
  } finally {
    await game.close();
  }
});

test('followers head for the tablet landing while the target is still in transit', async () => {
  const geometry = fixtureGeometry();
  geometry.tabletDestinations = { downtown: { x: 140, y: 1.15, z: 119, label: 'Downtown' } };
  const { game, advance } = await setup(geometry);
  const a = await player(game, 925);
  const b = await player(game, 926);
  try {
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    b.p.inventory.meta.tablets.downtown = 1;
    assert.equal(requiredFixture(await act(game, b, 'useTablet', { destination: 'downtown' })).ok, true);
    const start = a.p.x;
    advance(50);
    game.tick(0.05);
    assert.ok(b.p.tabletTeleport);
    assert.ok(a.p.x > start);
    assert.equal(a.p.following, b.p.id);
    advance(TABLET_TELEPORT_SECONDS * 1000);
    for (let i = 0; i < 250; i++) {
      advance(50);
      game.tick(0.05);
    }
    assert.equal(b.p.mode, 'walk');
    assert.ok(Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) <= 1.25);
    assert.equal(a.p.following, b.p.id);
  } finally {
    await game.close();
  }
});

test('server chase-to-attack continues to approach and fight without a focused client', async () => {
  const { game, advance } = await setup(),
    gear = {
      'sf-character-v1': '{"weapon":"bayonet"}',
      'sf-quests-v1': '{"theyLive":{"bayonet":true}}',
    },
    a = await player(game, 905, gear),
    b = await player(game, 906);
  b.p.x += 6;
  try {
    assert.equal(
      requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id, attack: true })).ok,
      false,
    );
    await act(game, a, 'pvp', { enabled: true });
    await act(game, b, 'pvp', { enabled: true });
    assert.equal(
      requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id, attack: true })).ok,
      true,
    );
    const range = ITEM_STATS.bayonet.range;
    const distance = () => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
    for (let i = 0; i < 35 && b.p.hp === 30; i++) {
      advance(50);
      game.tick(0.05);
      if (distance() > range || a.p.moving) assert.equal(b.p.hp, 30);
    }
    assert.ok(b.p.hp < 30);
    assert.ok(distance() <= range && !a.p.moving);
    const previous = b.p.hp;
    b.p.x = a.p.x + range + 0.2;
    advance(1200);
    game.tick(0.05);
    assert.equal(b.p.hp, previous, 'leaving range resumes the chase before any further hit');
    for (let i = 0; i < 15 && b.p.hp === previous; i++) {
      advance(50);
      game.tick(0.05);
      if (distance() > range || a.p.moving) assert.equal(b.p.hp, previous);
    }
    assert.ok(b.p.hp < previous);
    await act(game, a, 'personalTransit', { kind: 'jail' });
    assert.equal(a.p.following, null);
  } finally {
    await game.close();
  }
});
test('following never routes through members-only grounds and path planning stays bounded', async () => {
  const geometry = fixtureGeometry();
  let plans = 0;
  geometry.pathTo = (x, y) => {
    plans++;
    return [{ x, y }];
  };
  geometry.places = [{ id: 'freemasons-guild', x: 95, y: 118, w: 4, d: 4 }];
  const { game, advance } = await setup(geometry),
    a = await player(game, 907),
    b = await player(game, 908);
  b.p.x = 98;
  try {
    await act(game, a, 'followPlayer', { id: b.p.id });
    for (let i = 0; i < 100; i++) {
      advance(50);
      game.tick(0.05);
    }
    assert.ok(a.p.x < 95.05);
    assert.equal(a.p.following, null);
    assert.ok(plans <= 2, 'a stationary leader must not trigger repeated pathfinding');
  } finally {
    await game.close();
  }
});

test('reciprocal follows orbit together and a walk command ends the orbit', async () => {
  const geometry = fixtureGeometry();
  let blocked = false;
  geometry.canTravel = () => !blocked;
  const { game, advance } = await setup(geometry);
  const a = await player(game, 921);
  const b = await player(game, 922);
  try {
    // Players can start a reciprocal follow even if they are standing on the same tile.
    const center = { x: a.p.x, z: a.p.z };
    assert.equal(requiredFixture(await act(game, a, 'followPlayer', { id: b.p.id })).ok, true);
    const reply = requiredFixture(await act(game, b, 'followPlayer', { id: a.p.id }));
    assert.equal(reply.ok, true);
    assert.equal(reply.message, undefined);
    let angle = 0;
    let swept = 0;
    for (let i = 0; i < 100; i++) {
      advance(50);
      game.tick(0.05);
      assert.ok(Math.abs((a.p.x + b.p.x) / 2 - center.x) < 1e-6);
      assert.ok(Math.abs((a.p.z + b.p.z) / 2 - center.z) < 1e-6);
      const next = Math.atan2(a.p.z - center.z, a.p.x - center.x);
      if (i > 0) swept += Math.atan2(Math.sin(next - angle), Math.cos(next - angle));
      angle = next;
    }
    assert.ok(Math.abs(swept) > 2 * Math.PI);
    assert.ok(Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) >= 1.49);
    assert.ok(a.p.moving && b.p.moving);
    const before = [a.p.x, a.p.z, b.p.x, b.p.z];
    blocked = true;
    game.tick(0.05);
    assert.deepEqual([a.p.x, a.p.z, b.p.x, b.p.z], before);

    blocked = false;
    await act(game, a, 'moveTo', { x: center.x + 3, z: center.z });
    assert.equal(a.p.following, null);
    assert.equal(b.p.following, a.p.id);
  } finally {
    await game.close();
  }
});
