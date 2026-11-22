import test from 'node:test';
import assert from 'node:assert/strict';
import { createInteractions } from '../src/world/interactions.ts';
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
      moveTo(x: number, z: number, callback: (result: CommandResult) => void) {
        moves.push({ x, z });
        callback({ ok: true, goal: { x, z } });
      },
    },
    dialogue: { active: false },
    fishing: { cancel() {} },
    expeditions: { stop() {}, state: {}, ship: { aboard: false } },
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
    clearAt: () => true,
    pathTo: (x: number, y: number) => [{ x, y }],
    nearestNavigation: (x: number, y: number) => ({ x: x - 1, y }),
    drawMini() {},
    $: () => ({ hidden: true }),
  };
  const interaction = createInteractions(context as unknown as WorldContext);
  const selectTaxi = () =>
    interaction.goToSight({ id: target.id, kind: 'robotaxi', label: 'Tesla robotaxi' });
  return { target, player, moves, actions, interaction, selectTaxi };
}

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
