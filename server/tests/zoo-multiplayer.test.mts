import test from 'node:test';
import assert from 'node:assert/strict';
import { ILLUMINATI_INSTANCE } from '../../src/map-instances.ts';
import { fixture, player, command, requiredResult, type TestPlayer } from './fixtures.mts';

const caughtByTiger = ({ messages }: TestPlayer) =>
  messages.some((message) => message.type === 'caught' && message.source === 'tiger');

test('the loose tiger can catch bystanders immediately after catching the player who released it', async () => {
  const { game } = await fixture();
  try {
    const releaser = await player(game, 42001);
    const bystander = await player(game, 42002);
    Object.assign(releaser.p, { x: 16, z: 90.5 });
    await command(game, releaser.p, 'releaseTiger');
    assert.equal(requiredResult(releaser.messages).ok, true);
    const tiger = game.shared.tiger;
    for (let i = 0; i < 40 && !tiger.dangerous; i++) game.shared.tick(0.05);
    assert.ok(tiger.dangerous);
    const { x, y } = tiger.state.tiger;
    Object.assign(releaser.p, { x: x + 3.5, z: y + 0.5 });
    Object.assign(bystander.p, { x: x + 5.5, z: y + 0.5 });
    game.shared.tick(0.05);
    assert.equal(game.shared.snapshot(bystander.p).tiger?.targetId, releaser.p.id);

    const at = tiger.state.tiger;
    Object.assign(releaser.p, { x: at.x + 0.5, z: at.y + 0.5 });
    Object.assign(bystander.p, { x: at.x + 0.7, z: at.y + 0.5 });
    game.shared.tick(0.05);
    assert.ok(caughtByTiger(releaser));
    assert.ok(!caughtByTiger(bystander));
    game.shared.tick(0.05);
    assert.ok(caughtByTiger(bystander));
  } finally {
    await game.close();
  }
});

test('the loose tiger pursues a visible player past a closer player in an invisibility cloak', async (t) => {
  const { game } = await fixture();
  t.after(() => game.close());
  const hidden = await player(game, 42006, {
    'sf-purse-v1': JSON.stringify({ ownedEquipment: ['invisibility-cloak'] }),
    'sf-character-v1': '{"back":"invisibility-cloak"}',
  });
  const releaser = await player(game, 42007);
  Object.assign(releaser.p, { x: 16, z: 90.5 });
  await command(game, releaser.p, 'releaseTiger');
  assert.equal(requiredResult(releaser.messages).ok, true);
  const { tiger } = game.shared;
  for (let i = 0; i < 40 && !tiger.dangerous; i++) game.shared.tick(0.05);
  assert.ok(tiger.dangerous);
  const { x, y } = tiger.state.tiger;
  Object.assign(hidden.p, { x: x + 0.5, z: y + 0.5 });
  Object.assign(releaser.p, { x: x + 3.5, z: y + 0.5 });
  game.shared.tick(0.05);
  assert.equal(game.shared.snapshot(hidden.p).tiger?.targetId, releaser.p.id);
  assert.equal(caughtByTiger(hidden), false);
});

test('Animal Control stays visible to watchers near the officers even when the tiger is far away', async () => {
  const { game } = await fixture();
  try {
    const witness = await player(game, 42003);
    const distant = await player(game, 42004);
    const inside = await player(game, 42005);
    Object.assign(witness.p, { x: 185, z: 55 });
    Object.assign(distant.p, { x: 185, z: -65 });
    Object.assign(inside.p, { x: 185, z: 55, instance: ILLUMINATI_INSTANCE });
    const zoo = game.shared.tiger.state;
    zoo.phase = 'returning';
    zoo.wardens.push({
      x: 185,
      y: 53,
      index: 0,
      angle: 0,
      travel: 0,
      moving: true,
      path: [],
      target: null,
      repath: 0,
      home: { x: 185, y: 53 },
      pace: 5,
      netAt: 100,
    });
    assert.ok(game.shared.snapshot(witness.p).tiger?.wardens.length);
    assert.equal(game.shared.snapshot(distant.p).tiger, null);
    assert.equal(game.shared.snapshot(inside.p).tiger, null);

    const lastZoo = ({ messages }: TestPlayer) =>
      messages
        .flatMap((message) =>
          message.type === 'world' && 'tiger' in message.state ? [message.state.tiger] : [],
        )
        .at(-1);
    game.broadcast();
    assert.ok(lastZoo(witness)?.wardens.length);
    assert.equal(lastZoo(distant), null);
    assert.equal(lastZoo(inside), null);

    witness.p.z = -65;
    game.shared.tick(0.25);
    game.broadcast();
    assert.equal(lastZoo(witness), null);
  } finally {
    await game.close();
  }
});
