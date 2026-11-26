import assert from 'node:assert/strict';
import test from 'node:test';
import { FIREWORK_ENFORCEMENT } from '../../src/config/fireworks.ts';
import { INCUBATOR_CAVE } from '../../src/goblin-incubator-cave.ts';
import { npcContextActions, npcPrimaryVerb } from '../../src/npc-interactions.ts';
import { applyWorldPatches, type WorldMaps } from '../../src/world-deltas.ts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import {
  fixtureGeometry,
  player,
  requiredResult,
  storedPlayerFixture,
  type TestPlayer,
} from './fixtures.mts';

const { kind, chance, fine } = FIREWORK_ENFORCEMENT;

async function fixture() {
  let now = 1_000_000;
  let roll = 0;
  const geometry = fixtureGeometry();
  geometry.spawn = { x: 47, y: 47 };
  const store = createMemoryStore();
  const game = await createGame({ geometry, store, now: () => now, random: () => roll });
  async function act(
    person: TestPlayer,
    action: string,
    args: Record<string, unknown> = {},
    epoch = person.p.inventory.meta.epoch,
  ) {
    game.receive(person.p, {
      type: 'command',
      request: Math.random(),
      action,
      args,
      inventoryEpoch: epoch,
    });
    await person.p.queue;
    return requiredResult(person.messages);
  }
  const detonate = (person: TestPlayer) => act(person, 'inventory', { op: 'detonateFireworks' });
  const decide = (person: TestPlayer, id: string, decision: 'pay' | 'fight', epoch?: number) =>
    act(person, 'fireworkCitation', { id, decision }, epoch);
  const officers = () => game.shared.wilderness.actors.filter((actor) => actor.combatKind === kind);
  const step = (seconds: number) => {
    now += seconds * 1000;
    game.tick(seconds);
  };
  return {
    game,
    store,
    act,
    detonate,
    decide,
    officers,
    step,
    setRoll: (value: number) => {
      roll = value;
    },
  };
}

test('only successful fireworks on San Francisco land get a one-in-three enforcement roll', async (t) => {
  const { game, detonate, officers, setRoll } = await fixture();
  t.after(() => game.close());
  const a = await player(game, 4730);

  assert.equal((await detonate(a)).ok, false);
  assert.equal(officers().length, 0);
  a.p.inventory.meta.fireworks = 7;
  setRoll(chance);
  assert.equal((await detonate(a)).fireworkCitation, undefined);
  setRoll(0);
  for (const [x, z] of [
    [120, 7],
    [55, 99],
    [45, -38],
    [2, 55],
  ]) {
    Object.assign(a.p, { x, z });
    const result = await detonate(a);
    assert.equal(result.ok, true);
    assert.equal(result.fireworkCitation, undefined, x + ', ' + z);
  }
  Object.assign(a.p, { x: 47.5, z: 47.5 });
  const surface = a.p.instance;
  a.p.instance = INCUBATOR_CAVE;
  assert.equal((await detonate(a)).fireworkCitation, undefined);
  a.p.instance = surface;
  assert.equal(officers().length, 0);
  assert.equal(a.messages.filter((m) => m.type === 'fireworks').length, 6);

  setRoll(chance - 0.0001);
  const result = await detonate(a);
  assert.equal(result.ok, true);
  assert.equal(result.inventory?.fireworks, 0);
  assert.equal(officers().length, 1);
  assert.equal(result.fireworkCitation, officers()[0].id);
});

test('the level-20 officer waits for the cited player and accepts the fine exactly once', async (t) => {
  const { game, store, act, detonate, decide, officers, step } = await fixture();
  t.after(() => game.close());
  const a = await player(game, 4731, { 'sf-purse-v1': '{"coins":150}' });
  const witness = await player(game, 4732, { 'sf-purse-v1': '{"coins":300}' });
  a.p.inventory.meta.fireworks = 1;

  const { fireworkCitation: id } = await detonate(a);
  assert.ok(id);
  const [officer] = officers();
  assert.equal(officer.id, id);
  assert.equal(officer.level, 20);
  assert.equal(officer.label, FIREWORK_ENFORCEMENT.name);
  assert.equal(officer.enemy, null);
  assert.ok(officer.citationPending);
  assert.equal(a.p.inventory.economy.state.coins, 150);
  assert.equal(officer.dispatchedFor, a.p.id);
  assert.equal(npcPrimaryVerb(officer, false, a.p.id), 'talk');
  assert.equal(npcPrimaryVerb(officer, false, witness.p.id), 'examine');
  assert.deepEqual(npcContextActions(officer, { primary: 'examine' }), ['examine']);
  game.broadcast();
  const maps: WorldMaps = {};
  for (const message of witness.messages)
    if (message.type === 'world') applyWorldPatches(maps, message.patches, message.removed);
  assert.equal(maps.wilderness?.get(id)?.citationPending, true);
  assert.ok(maps.wilderness?.get(id)?.speechLine?.includes('permit'));
  const hp = a.p.hp;
  step(62);
  assert.equal(officer.hp, officer.max);
  assert.equal(a.p.hp, hp);
  assert.equal(officers().length, 1, 'the officer is still waiting for an answer');

  assert.equal((await decide(witness, id, 'pay')).ok, false);
  assert.equal((await decide(witness, id, 'fight')).ok, false);
  assert.equal((await act(witness, 'attack', { id, weapon: 'unarmed' })).ok, false);
  assert.equal(witness.p.inventory.economy.state.coins, 300);
  const original = { x: a.p.x, z: a.p.z };
  a.p.x += 8;
  assert.equal((await decide(a, id, 'pay')).ok, false);
  Object.assign(a.p, original);
  assert.equal((await decide(a, id, 'pay', a.p.inventory.meta.epoch + 1)).ok, false);
  assert.equal(a.p.inventory.economy.state.coins, 150);

  assert.equal((await decide(a, id, 'pay')).ok, true);
  assert.equal(a.p.inventory.economy.state.coins, 150 - fine);
  assert.equal(officers().length, 0);
  assert.equal((await decide(a, id, 'pay')).ok, false);
  assert.equal(a.p.inventory.economy.state.coins, 50);
  const saved = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.equal(saved.playerState.inventory.economy.coins, 50);
});

test('a player who refuses an unpaid fine fights the officer without being charged', async (t) => {
  const { game, act, detonate, decide, officers, step, setRoll } = await fixture();
  t.after(() => game.close());
  const a = await player(game, 4733, { 'sf-purse-v1': '{"coins":99}' });
  a.p.inventory.meta.fireworks = 1;
  const { fireworkCitation: id } = await detonate(a);
  assert.ok(id);
  const [officer] = officers();

  assert.equal((await decide(a, id, 'pay')).ok, false);
  assert.equal(officer.enemy, null);
  assert.equal((await act(a, 'attack', { id, weapon: 'unarmed' })).ok, false);
  assert.equal((await decide(a, id, 'fight')).ok, true);
  assert.equal(officer.citationPending, false);
  assert.equal(officer.enemy, a.p.id);
  assert.equal(npcPrimaryVerb(officer, false, a.p.id), 'attack');
  assert.equal((await decide(a, id, 'pay')).ok, false);
  assert.equal((await act(a, 'attack', { id, weapon: 'unarmed' })).ok, true);
  for (let i = 0; i < 22; i++) step(0.1);
  assert.ok(a.messages.some((m) => m.type === 'damage' && m.attacker === id));
  setRoll(0.5);
  game.shared.wilderness.damage(id, officer.hp, a.p);
  step(0.05);
  assert.equal(officers().length, 0);
  assert.equal(a.p.inventory.economy.state.coins, 99);
});
