import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy, TRADE_PRICES, MERCHANTS } from '../src/economy.ts';
import { drawGPUFactory, drawBeachSand, GPU_FACTORY_SIGNS } from '../src/gpu-factory.ts';
import { GPU_FACTORY } from '../src/gpu-layout.ts';
import { Mesh } from '../src/geometry.ts';
import { buildingNPCService } from '../src/building-interactions.ts';

test('Ocean Beach sand stacks, survives reloads, and sells for exactly twenty coins per sack', () => {
  let saved;
  const e = createEconomy({ coins: 25 }, (s) => (saved = s)),
    before = { ...e.state };
  assert.equal(e.trade('sand-sale').ok, false);
  assert.deepEqual(e.state, before);
  for (let i = 0; i < 3; i++) assert.equal(e.trade('collect-sand').ok, true);
  assert.equal(e.state.sand, 3);
  assert.equal(e.state.coins, 25);
  const restored = createEconomy(saved);
  assert.equal(restored.state.sand, 3);
  assert.equal(TRADE_PRICES.sand, 20);
  assert.equal(requiredFixture(MERCHANTS['gpu-buyer'].choices)[0].trade, 'sand-sale');
  for (let i = 0; i < 3; i++) {
    const coins = restored.state.coins;
    assert.equal(restored.trade('sand-sale').ok, true);
    assert.equal(restored.state.coins, coins + 20);
  }
  assert.equal(restored.state.sand, 0);
  assert.equal(restored.state.sandDelivered, 3);
  assert.equal(restored.trade('sand-sale').ok, false);
  assert.equal(restored.state.coins, 85);
  for (const sand of [-1, '7', NaN, Infinity] satisfies [number, string, number, number])
    assert.equal(createEconomy({ sand }).state.sand, 0);
});

test('jacket earnings respect ownership and equipment, compound with the iPhone, and carry fractions', () => {
  let torso = 'leather-jacket';
  const economy = createEconomy({ coins: 0, iphoneOwned: true }, undefined, () => torso);
  assert.equal(economy.credit(20).earned, 20);
  economy.state.ownedEquipment.push('leather-jacket');
  assert.equal(economy.credit(20).earned, 24);
  economy.equipPhone(true);
  assert.equal(economy.credit(20).earned, 30);
  assert.equal(economy.credit(2).earned, 3);
  assert.equal(economy.credit(20, 100).earned, 130);
  economy.equipPhone(false);
  for (let i = 0; i < 4; i++) assert.equal(economy.credit(1).earned, 1);
  const restored = createEconomy(economy.state, undefined, () => torso);
  assert.equal(restored.credit(1).earned, 2);
  torso = 'shirt';
  assert.equal(restored.credit(20).earned, 20);
  restored.equipPhone(true);
  assert.equal(restored.credit(20).earned, 25);
});
test('the factory is scenery with a distinct NPC service, not a building conversation proxy', () => {
  assert.equal(buildingNPCService({ kind: 'gpu-factory' }), 'gpu-buyer');
  assert.match(requiredFixture(MERCHANTS['gpu-buyer'].intro), /sand.*GPUs/);
  assert.doesNotMatch(requiredFixture(MERCHANTS['gpu-buyer'].intro), /Ocean Beach/);
  assert.match(requiredFixture(MERCHANTS['gpu-buyer'].intro), /\{sandPrice\}/);
  assert.equal(MERCHANTS['gpu-buyer'].repeat, true);
});
test('factory, roof glazing, cooling equipment and sand collection props use finite bounded geometry', () => {
  const m = new Mesh(),
    signs = new Map(
      GPU_FACTORY_SIGNS.map((s) => [
        s,
        [
          [0, 0] satisfies [number, number],
          [1, 0] satisfies [number, number],
          [1, 1] satisfies [number, number],
          [0, 1] satisfies [number, number],
        ],
      ]),
    ),
    site = drawGPUFactory(m, signs, () => GPU_FACTORY.base);
  assert.ok(site.navigationPolygons.length >= 4);
  assert.deepEqual(site.entry, GPU_FACTORY.entry);
  drawBeachSand(m, { x: 0, z: 0 }, 0, signs);
  assert.ok(m.data.every(Number.isFinite));
  assert.ok(m.data.length / 33 < 6000);
});
