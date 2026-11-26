import {
  storedPlayerFixture,
  fixtureGeometry,
  player,
  command,
  latestResult,
  requiredResult,
} from './fixtures.mts';
import type { TestPlayer } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';

import { SEARCH_HOMES } from '../../src/search-houses.ts';
import { BERKELEY_HOUSE_SEARCHES } from '../../src/config/search-houses.ts';
import { ownedEquipmentDefense } from '../../src/item-stats.ts';
import { equipmentOptions } from '../../src/equipment-options.ts';
import type { Site } from '../../src/types/world.ts';

async function setup(random = () => 0.5) {
  let time = 1000000;
  const geometry = fixtureGeometry();
  geometry.searchSites = SEARCH_HOMES.map((h) => ({
    id: h.search.id,
    kind: 'house-search',
    houseId: h.id,
    label: h.search.label,
    x: h.target.x,
    z: h.target.z,
    entry: h.approach,
    base: 1.15,
  }));
  for (const [i, [houseId, definition]] of Object.entries(BERKELEY_HOUSE_SEARCHES).entries())
    geometry.searchSites.push({
      id: definition.id,
      kind: 'house-storage',
      houseId,
      label: definition.label,
      x: 140 + i,
      z: -1,
      entry: { x: 139.5 + i, y: -1.5 },
      base: 1.2,
    });
  geometry.placeAt = (x: number, y: number) => {
    const s = requiredFixture(geometry.searchSites).find(
      (s) => s.id !== 'house-search-2' && Math.hypot(x - s.entry.x, y - s.entry.y) < 0.4,
    );
    return s ? { id: requiredFixture(s.houseId) } : null;
  };
  const store = createMemoryStore(),
    game = await createGame({ geometry, store, now: () => time, random });
  return { game, store, geometry, now: () => time, advance: (ms: number) => (time += ms) };
}
function stand(a: TestPlayer, site: Site) {
  Object.assign(a.p, { x: site.entry.x + 0.5, z: site.entry.y + 0.5, y: site.base });
}
test('Berkeley drawers and breadboxes grant the authored coin and sandwich rewards once', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 57012);
    const first = SEARCH_HOMES.length;
    const before = a.p.inventory.economy.state.coins;
    assert.equal(requiredFixture(await search(f, a, first)).ok, true);
    assert.equal(requiredFixture(await search(f, a, first + 1)).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, before + 22);
    assert.equal(a.p.inventory.meta.sandwiches, 2);
    assert.equal(requiredFixture(await search(f, a, first)).ok, false);
  } finally {
    await f.game.close();
  }
});
async function search(f: Awaited<ReturnType<typeof setup>>, a: TestPlayer, index: number) {
  const site = requiredFixture(f.geometry.searchSites)[index];
  stand(a, site);
  await command(f.game, a.p, 'searchHouse', { id: site.id });
  return latestResult(a.messages);
}
test('each character can keep each authored reward once; other players have their own containers', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 57001),
      b = await player(f.game, 57002);
    assert.equal(requiredFixture(await search(f, a, 2)).ok, true);
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('backpack'));
    for (const i of [0, 1, 3, 4, 5, 6, 7] satisfies [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ])
      assert.equal(requiredFixture(await search(f, a, i)).ok, true);
    assert.equal(a.p.profile.houseSearches.length, 8);
    assert.equal(a.p.inventory.meta.sandwiches, 6);
    assert.equal(a.p.inventory.economy.state.coins, 175);
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('new-year-rocket'));
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('clock-amulet'));
    assert.equal(requiredFixture(await search(f, a, 1)).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 175);
    assert.equal(requiredFixture(await search(f, b, 1)).ok, true);
    assert.equal(b.p.inventory.economy.state.coins, 50);
    await f.game.flush();
    const saved = await storedPlayerFixture(f.store, 'player:' + a.p.owner);
    assert.equal(saved.playerState.progress.houseSearches.length, 8);
    assert.ok(saved.playerState.inventory.collection.includes('clock-amulet'));
  } finally {
    await f.game.close();
  }
});
test('the wardrobe rolls once for a wearable barrel worth two defense', async () => {
  let roll = 0.2;
  const f = await setup(() => roll);
  const index = SEARCH_HOMES.findIndex((home) => home.search.id === 'house-search-6');
  try {
    const miss = await player(f.game, 57013);
    const hit = await player(f.game, 57014);
    const missed = miss.p.inventory.economy.state;
    const found = hit.p.inventory.economy.state;
    await command(f.game, hit.p, 'equipAppearance', { look: { torso: 'barrel' } });
    assert.equal(ownedEquipmentDefense(found, hit.p.appearance), 0);
    assert.equal(requiredFixture(await search(f, miss, index)).ok, true);
    assert.ok(missed.ownedEquipment.includes('new-year-rocket'));
    assert.ok(!missed.ownedEquipment.includes('barrel'));

    roll = 0;
    assert.equal(requiredFixture(await search(f, miss, index)).ok, false);
    const result = requiredFixture(await search(f, hit, index));
    assert.equal(result.ok, true);
    assert.match(result.message ?? '', /also find a barrel/i);
    assert.ok(found.ownedEquipment.includes('new-year-rocket'));
    assert.ok(found.ownedEquipment.includes('barrel'));
    assert.ok(equipmentOptions(found).torso.some((option) => option.value === 'barrel'));
    await command(f.game, hit.p, 'equipAppearance', { look: { torso: 'barrel' } });
    assert.equal(hit.p.appearance.torso, 'barrel');
    assert.equal(ownedEquipmentDefense(found, hit.p.appearance), 2);
    assert.equal(requiredFixture(await search(f, hit, index)).ok, false);
    await f.game.flush();
    const saved = await storedPlayerFixture(f.store, 'player:' + hit.p.owner);
    assert.equal(saved.playerState.appearance.torso, 'barrel');
    assert.ok(saved.playerState.inventory.collection.includes('barrel'));
  } finally {
    await f.game.close();
  }
});

test('distant, outside, invented and full-bag searches cannot claim rewards', async () => {
  const f = await setup();
  try {
    const a = await player(f.game, 57003),
      site = requiredFixture(f.geometry.searchSites)[0];
    await command(f.game, a.p, 'searchHouse', {
      id: site.id,
      reward: { item: 'coins', amount: 100000 },
    });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(a.p.inventory.meta.sandwiches, 0);
    stand(a, site);
    a.p.x += 1;
    await command(f.game, a.p, 'searchHouse', { id: site.id });
    assert.equal(
      requiredResult(a.messages).ok,
      false,
      'outside the room must not reach through a wall',
    );
    await command(f.game, a.p, 'searchHouse', { id: 'invented' });
    assert.equal(requiredResult(a.messages).ok, false);
    a.p.inventory.receive({ lootKind: 'sandwich', amount: 4 });
    assert.equal(requiredFixture(await search(f, a, 0)).ok, false);
    assert.ok(!a.p.profile.houseSearches?.includes(site.id));
    a.p.inventory.meta.sandwiches = 0;
    a.p.inventory.save();
    assert.equal(requiredFixture(await search(f, a, 0)).ok, true);
    assert.equal(a.p.inventory.meta.sandwiches, 3);
  } finally {
    await f.game.close();
  }
});
test('the rocket and amulet must be owned; ignition lasts ten seconds, cannot restart before one minute, and survives a restart', async () => {
  const f = await setup();
  let game = f.game;
  try {
    const a = await player(game, 57004);
    await command(game, a.p, 'equipAppearance', {
      look: { back: 'new-year-rocket', neck: 'clock-amulet', rocketBurnUntil: 9e15 },
    });
    assert.equal(a.p.appearance.back, 'none');
    assert.equal(a.p.appearance.neck, 'none');
    await command(game, a.p, 'lightDecorativeRocket');
    assert.equal(requiredResult(a.messages).ok, false);
    await search(f, a, 5);
    await search(f, a, 7);
    await command(game, a.p, 'equipAppearance', {
      look: { back: 'new-year-rocket', neck: 'clock-amulet' },
    });
    assert.equal(a.p.appearance.back, 'new-year-rocket');
    assert.equal(a.p.appearance.neck, 'clock-amulet');
    await command(game, a.p, 'lightDecorativeRocket');
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(a.p.appearance.rocketBurnUntil, f.now() + 10000);
    assert.equal(a.p.profile.decorativeRocketReadyAt, f.now() + 60000);
    await command(game, a.p, 'lightDecorativeRocket');
    assert.equal(requiredResult(a.messages).ok, false);
    f.advance(10000);
    game.tick(0.05);
    assert.equal(a.p.appearance.rocketBurnUntil, 0);
    await game.close();
    game = await createGame({ geometry: f.geometry, store: f.store, now: f.now });
    const b = await player(game, 57004);
    assert.equal(b.p.appearance.back, 'new-year-rocket');
    assert.equal(b.p.appearance.neck, 'clock-amulet');
    assert.equal(b.p.profile.houseSearches.length, 2);
    await command(game, b.p, 'lightDecorativeRocket');
    assert.equal(requiredResult(b.messages).ok, false);
    f.advance(50000);
    await command(game, b.p, 'lightDecorativeRocket');
    assert.equal(requiredResult(b.messages).ok, true);
  } finally {
    await game.close();
  }
});
