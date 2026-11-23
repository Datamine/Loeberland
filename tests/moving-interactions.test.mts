import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_NAV, labPoint } from '../src/berkeley-lab.ts';
import { createInteractions } from '../src/world/interactions.ts';
import type { Point } from '../src/types/geometry.ts';
import type { ExpeditionLoot } from '../src/types/expeditions.ts';
import type { WorldContext } from '../src/world/scene.ts';
import type { CommandResult } from '../src/types/network.ts';

function fixture(results: CommandResult[] = []) {
  const target = { id: 'tesla-robotaxi-1', x: 8, z: 2 };
  const player = { x: 1.5, y: 1.5, sitting: false, dancing: false, path: [] };
  const moves: { x: number; z: number }[] = [];
  const actions: string[] = [];
  const context = {
    headless: true,
    player,
    streetTraffic: { cars: [target] },
    destination: null,
    multiplayer: {
      state: { connected: true },
      command: async (action: string) => {
        actions.push(action);
        return action === 'stopMoving' ? { ok: true } : results.shift() || { ok: true };
      },
    },
    multiplayerWorld: {
      selfMode: 'walk',
      stopFollowing() {},
      moveTo(x: number, z: number, callback?: (result: CommandResult) => void) {
        moves.push({ x, z });
        callback?.({ ok: true, goal: { x, z } });
      },
    },
    dialogue: { active: false },
    fishing: { cancel() {} },
    expeditions: { stop() {}, state: { loot: [] as ExpeditionLoot[] }, ship: { aboard: false } },
    quests: { theyLive: { isDefeated: () => false, state: {} } },
    economy: { state: { ownedEquipment: [] } },
    playerLook: { weapon: 'unarmed' },
    rocket: { state: { active: false } },
    capture: { state: { active: false } },
    surf: { state: { riding: false, jump: false } },
    tahoe: { state: { mode: 'ground' } },
    rope: { climbing: false },
    sutroClimb: { state: { active: false } },
    canvas: { focus() {} },
    skateboard: { riding: false },
    flying: () => false,
    canTravel: () => true,
    clearAt: (_x: number, _y: number) => true,
    pathTo: (x: number, y: number): Point[] | null => [{ x, y }],
    nearestNavigation: (x: number, y: number) => ({ x: x - 1, y }),
    drawMini() {},
    $: () => ({ hidden: true }),
  };
  const interaction = createInteractions(context as unknown as WorldContext);
  const selectTaxi = () =>
    interaction.goToSight({ id: target.id, kind: 'robotaxi', label: 'Tesla robotaxi' });
  return { target, player, moves, actions, interaction, selectTaxi, context };
}

test('Take follows the laboratory route and waits for the accepted destination on the item tile', async () => {
  const { player, moves, interaction, context } = fixture();
  const entrance = labPoint(7, 11);
  const drop = labPoint(7, 7);
  const goal = { x: drop.x + 0.2, z: drop.z - 0.1 };
  const collected: string[] = [];
  const world = Object.assign(context, {
    action: null as (() => void) | null,
    airship: { state: { active: false } },
    updateAdventureUI() {},
  });
  world.clearAt = LAB_NAV.free;
  world.pathTo = (x, y) => LAB_NAV.path(player, { x, y });
  world.nearestNavigation = () => assert.fail('City navigation must not be used for lab loot');
  const move = world.multiplayerWorld.moveTo;
  world.multiplayerWorld.moveTo = (x, z, callback) =>
    move(x, z, (result) => callback?.({ ...result, goal }));
  Object.assign(world.expeditions, {
    collect(item: { id: string }) {
      collected.push(item.id);
      return { ok: true };
    },
  });

  for (const lootKind of ['coins', 'sandwich']) {
    Object.assign(player, { x: entrance.x - 0.5, y: entrance.z - 0.5 });
    const item = {
      ...drop,
      id: lootKind,
      lootKind,
      label: lootKind,
      kind: 'loot',
      amount: 2,
      description: 'Dropped after a defeat.',
      expires: 60,
      network: true,
    };
    world.expeditions.state.loot.push(item);
    assert.equal(interaction.goToSight(item), true);
    assert.deepEqual(moves.at(-1), drop);
    assert.equal(world.action, null);
    const before = collected.length;
    Object.assign(player, { x: drop.x - 0.5, y: drop.z + 0.5 });
    interaction.updateMovingInteraction(performance.now());
    assert.equal(
      collected.length,
      before,
      'being within pickup range on an adjacent tile is not arrival',
    );
    Object.assign(player, { x: goal.x - 0.5, y: goal.z - 0.5 });
    interaction.updateMovingInteraction(performance.now());
    await Promise.resolve();
    interaction.updateMovingInteraction(performance.now());
    assert.equal(collected.length, before + 1);
  }
  assert.deepEqual(collected, ['coins', 'sandwich']);
});

test('Take retries a transient range refusal after walking back onto the loot tile', async () => {
  const { player, moves, interaction, context } = fixture();
  Object.assign(context, { airship: { state: { active: false } }, updateAdventureUI() {} });
  const item = {
    id: 'coins',
    kind: 'loot',
    lootKind: 'coins',
    label: 'Coins',
    description: '',
    amount: 4,
    expires: 60,
    x: 2,
    z: 2,
    network: true,
  };
  context.expeditions.state.loot.push(item);
  let attempts = 0;
  Object.assign(context.expeditions, {
    collect: () => ({
      ok: true,
      pending: true,
      promise: Promise.resolve(++attempts === 1 ? { ok: false, retryApproach: true } : { ok: true }),
    }),
  });
  interaction.goToSight(item);
  assert.equal(attempts, 1);
  await Promise.resolve();
  await Promise.resolve();
  player.x = 2.55;
  const later = performance.now() + 300;
  interaction.updateMovingInteraction(later);
  assert.deepEqual(moves, [{ x: 2, z: 2 }]);
  assert.equal(attempts, 1);
  player.x = 1.5;
  interaction.updateMovingInteraction(later + 50);
  await Promise.resolve();
  await Promise.resolve();
  interaction.updateMovingInteraction(later + 100);
  assert.equal(attempts, 2);
});

test('kicking follows a moving taxi and retries a transient range refusal only after reacquiring it', async () => {
  const { target, player, moves, actions, interaction, selectTaxi } = fixture([
    { ok: false, retryApproach: true },
    { ok: true },
  ]);
  selectTaxi();
  assert.deepEqual(moves, [{ x: 8, z: 2 }]);
  const started = performance.now();
  target.x = 12;
  interaction.updateMovingInteraction(started + 400);
  assert.deepEqual(moves.at(-1), { x: 12, z: 2 });
  assert.deepEqual(actions, []);

  player.x = 10;
  interaction.updateMovingInteraction(started + 450);
  await Promise.resolve();
  assert.deepEqual(actions, ['stopMoving', 'kickTaxi']);
  target.x = 16;
  interaction.updateMovingInteraction(started + 950);
  assert.deepEqual(moves.at(-1), { x: 16, z: 2 });
  player.x = 14;
  interaction.updateMovingInteraction(started + 1000);
  await Promise.resolve();
  assert.deepEqual(actions, ['stopMoving', 'kickTaxi', 'stopMoving', 'kickTaxi']);
  target.x += 3;
  interaction.updateMovingInteraction(started + 1500);
  assert.equal(moves.length, 3);
});

test('an NPC action follows the target, cancels cleanly, and executes once when reacquired', async () => {
  const { target, player, moves, actions, interaction } = fixture();
  const citizen = { ...target, id: 'new-pedestrian', label: 'Man' };
  interaction.interactCitizen(citizen, 'steal');
  const started = performance.now();
  citizen.x = 13;
  interaction.updateMovingInteraction(started + 400);
  assert.deepEqual(moves, [
    { x: 7, z: 2 },
    { x: 12, z: 2 },
  ]);
  assert.deepEqual(actions, []);
  assert.equal(interaction.cancelMovingInteraction(), true);
  player.x = 12;
  interaction.updateMovingInteraction(started + 800);
  assert.deepEqual(actions, ['stopMoving']);

  citizen.x = 20;
  interaction.interactCitizen(citizen, 'steal');
  assert.deepEqual(moves.at(-1), { x: 19, z: 2 });
  player.x = 18;
  interaction.updateMovingInteraction(performance.now());
  await Promise.resolve();
  interaction.updateMovingInteraction(performance.now());
  assert.deepEqual(actions, ['stopMoving', 'stopMoving', 'playerAction']);
});
