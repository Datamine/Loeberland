import { requiredFixture } from '../../tests/helpers/required.mts';
import { createWilderness } from '../../src/wilderness.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  fixtureGeometry,
  player,
  command,
  latestResult,
  requiredResult,
  storedPlayerFixture,
} from './fixtures.mts';
import { AIRSHIP_TERMINAL } from '../../src/airship.ts';
import { MP_PROTOCOL } from '../../src/multiplayer-protocol.ts';
import { FACTORY_CHAIRS } from '../../src/goblin-town.ts';
import { ITEM_STATS, ownedEquipmentDefense } from '../../src/item-stats.ts';
import { MONSTER_STATS, rollMonsterDrops } from '../../src/monster-drops.ts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';

test('a new profile gets starter supplies and cannot equip a railgun or boots from client preferences', async () => {
  const { game } = await fixture(),
    messages: import('../../src/types/network.ts').ServerEvent[] = [],
    p = await game.connect(
      {
        protocol: MP_PROTOCOL,
        token: 'f'.repeat(64),
        privateState: {
          'sf-purse-v1': '{"coins":999}',
          'sf-character-v1': '{"weapon":"railgun","boots":true}',
        },
      },
      {
        open: true,
        bufferedAmount: 0,
        send: (v: string) => messages.push(typeof v === 'string' ? JSON.parse(v) : v),
        close() {},
      },
    );
  try {
    assert.equal(p.inventory.economy.state.coins, 100);
    assert.equal(p.inventory.meta.tablets.downtown, 5);
    assert.equal(p.appearance.weapon, 'unarmed');
    assert.equal(p.appearance.boots, false);
    await command(game, p, 'equipAppearance', { look: { weapon: 'railgun', boots: true } });
    assert.equal(p.appearance.weapon, 'unarmed');
    assert.equal(p.appearance.boots, false);
    const gear = game.personal.runtime(p).expeditions.state;
    gear.railgun = true;
    gear.raptor = 'not-started';
    game.personal.runtime(p).save('sf-expeditions-v1')({ railgun: true, raptor: 'not-started' });
    await command(game, p, 'equipAppearance', { look: { weapon: 'railgun' } });
    assert.equal(p.appearance.weapon, 'unarmed');
    await command(game, p, 'playerAction', { verb: 'equipRailgun', on: true });
    assert.equal(requiredResult(messages).ok, false);
  } finally {
    await game.close();
  }
});

test('each owned chair seats the player until they move', async () => {
  const { game } = await fixture(),
    a = await player(game, 99001);
  try {
    for (const chair of FACTORY_CHAIRS) {
      const sit = (id: string | boolean = chair.id) =>
        command(game, a.p, 'activity', { mode: 'sit', chair: id });
      await sit();
      assert.equal(requiredResult(a.messages).ok, false);
      a.p.inventory.receive({ amount: 1, lootKind: 'equipment', itemId: chair.id });
      await sit();
      assert.equal(requiredResult(a.messages).ok, true);
      if (chair.id === 'ball-chair') {
        await sit(true);
        assert.equal(requiredResult(a.messages).ok, true);
      }
      game.tick(0.2);
      assert.equal(a.p.mode, 'sit');
      assert.equal(a.p.gesture, chair.gesture);
      await command(game, a.p, 'moveTo', { x: a.p.x + 1, z: a.p.z });
      assert.equal(a.p.mode, 'walk');
      assert.notEqual(a.p.gesture, chair.gesture);
    }
  } finally {
    await game.close();
  }
});

test('a Bind Tablet holds nearby monsters for ten seconds with PvP off', async (t) => {
  const geometry = fixtureGeometry();
  geometry.wilderness = {
    actors: [
      { id: 'near-goblin', combatKind: 'goblin', x: 93, z: 120 },
      { id: 'far-goblin', combatKind: 'goblin', x: 96, z: 120 },
    ],
  };
  const game = await createGame({ geometry, store: createMemoryStore(), random: () => 0.5 });
  t.after(() => game.close());
  const a = await player(game, 99011);
  const observer = await player(game, 99012);
  const [near, far] = game.shared.wilderness.actors;
  Object.assign(a.p, { x: 92, z: 120 });
  const hp = a.p.hp;
  assert.equal(a.p.inventory.receive({ lootKind: 'bind-tablet', amount: 1 }).ok, true);
  game.receive(a.p, {
    type: 'command',
    request: 1,
    action: 'breakBind',
    inventoryEpoch: a.p.inventory.meta.epoch,
  });
  await a.p.queue;
  assert.equal(requiredResult(a.messages).ok, true);
  assert.equal(a.p.hp, hp - 10);
  assert.equal(a.p.inventory.meta.bindTablets, 0);
  assert.equal(observer.p.boundUntil, undefined);
  assert.ok(observer.messages.some((event) => event.type === 'pvpBound' && event.target === near.id));
  assert.ok(!observer.messages.some((event) => event.type === 'pvpBound' && event.target === far.id));
  a.p.x = 90;
  const tick = (frames: number) => {
    for (let frame = 0; frame < frames; frame++) game.tick(0.05);
  };
  tick(199);
  assert.deepEqual([near.x, near.z], [93, 120]);
  assert.notDeepEqual([far.x, far.z], [96, 120]);
  tick(4);
  assert.notDeepEqual([near.x, near.z], [93, 120]);
});

test('secondary weapons must be owned and the swap persists across rejoining', async (t) => {
  const { game } = await fixture();
  t.after(() => game.close());
  const account = 99013;
  let a = await player(game, account);
  const act = async (action: string, args: Record<string, unknown> = {}) => {
    await command(game, a.p, action, args);
    return requiredResult(a.messages);
  };
  a.p.inventory.receive({ lootKind: 'equipment', itemId: 'crowbar', amount: 1 });
  await act('equipAppearance', { look: { weapon: 'crowbar', secondaryWeapon: 'katana' } });
  assert.equal(a.p.appearance.secondaryWeapon, 'none');
  assert.equal((await act('switchWeapon')).ok, false);
  a.p.inventory.receive({ lootKind: 'equipment', itemId: 'katana', amount: 1 });
  const loadout = { weapon: 'crowbar', secondaryWeapon: 'katana' };
  await act('equipAppearance', { look: loadout });
  assert.equal((await act('switchWeapon')).ok, true);
  assert.equal(a.p.appearance.weapon, 'katana');
  assert.equal(a.p.appearance.secondaryWeapon, 'crowbar');
  await game.disconnect(a.p);
  a = await player(game, account);
  assert.equal(a.p.appearance.weapon, 'katana');
  assert.equal((await act('switchWeapon')).ok, true);
  assert.equal(a.p.appearance.weapon, loadout.weapon);
  assert.equal(a.p.appearance.secondaryWeapon, loadout.secondaryWeapon);
});

test('the furniture maker sells the Combat Lamp, which reaches enemies beyond crowbar range', async (t) => {
  const geometry = fixtureGeometry();
  const id = 'combat-lamp';
  const [maker, target] = [
    { id: 'lamp-vendor', combatKind: 'goblin-maker', x: 94, z: 120 },
    { id: 'lamp-target', combatKind: 'goblin', x: 100, z: 120 },
  ];
  geometry.wilderness = { actors: [maker, target] };
  const store = createMemoryStore();
  const game = await createGame({ geometry, store, random: () => 0.5 });
  t.after(() => game.close());
  const a = await player(game, 99009, {
    'sf-purse-v1': JSON.stringify({ coins: ITEM_STATS[id].price + 10 }),
  });
  const purse = a.p.inventory.economy.state;
  const buy = async () => {
    game.receive(a.p, {
      type: 'command',
      request: Math.random(),
      action: 'inventory',
      inventoryEpoch: a.p.inventory.meta.epoch,
      args: { op: 'trade', kind: id },
    });
    await a.p.queue;
    return requiredResult(a.messages);
  };
  a.p.x = maker.x - 5;
  assert.equal((await buy()).ok, false);
  a.p.x = maker.x - 1;
  const seller = requiredFixture(game.shared.wilderness.actors.find((actor) => actor.id === maker.id));
  seller.enemy = a.p.id;
  assert.equal((await buy()).ok, false);
  seller.enemy = null;
  assert.equal((await buy()).ok, true);
  assert.equal((await buy()).ok, false);
  assert.equal(purse.coins, 10);

  await command(game, a.p, 'equipAppearance', { look: { weapon: id } });
  assert.equal(a.p.appearance.weapon, id);
  const victim = requiredFixture(game.shared.wilderness.actors.find((actor) => actor.id === target.id));
  const hp = victim.hp;
  a.p.x = target.x - 2;
  await command(game, a.p, 'attack', { id: target.id, weapon: id });
  assert.equal(requiredResult(a.messages).ok, true);
  assert.ok(victim.hp < hp, 'the lamp lands a hit from two tiles away');
  await game.flush();
  const { playerState } = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.ok(playerState.inventory.economy.ownedEquipment.includes(id));
  assert.ok(playerState.inventory.collection.includes(id));
});

test('selected mid-level enemies drop a Defence amulet that grants one point only when equipped', async (t) => {
  const id = 'defence-amulet';
  for (const kind of ['goblin-veteran', 'legacy-bug-20', 'emf-disciple']) {
    const { level } = MONSTER_STATS[kind];
    assert.ok(level >= 10 && level <= 30);
    assert.ok(rollMonsterDrops(kind, () => 0.039).some((drop) => drop.itemId === id));
    assert.ok(!rollMonsterDrops(kind, () => 0.04).some((drop) => drop.itemId === id));
  }
  assert.ok(!rollMonsterDrops('goblin', () => 0.039).some((drop) => drop.itemId === id));
  const geometry = fixtureGeometry();
  geometry.wilderness = { actors: [{ id: 'veteran', combatKind: 'goblin-veteran', x: 94, z: 120 }] };
  const store = createMemoryStore();
  const game = await createGame({ geometry, store, random: () => 0.039 });
  t.after(() => game.close());
  const a = await player(game, 99010);
  const purse = a.p.inventory.economy.state;
  const defense = () => ownedEquipmentDefense(purse, a.p.appearance);
  const equip = (neck: string) => command(game, a.p, 'equipAppearance', { look: { neck } });
  await equip(id);
  assert.equal(a.p.appearance.neck, 'none');
  const veteran = game.shared.wilderness.actors[0];
  game.shared.wilderness.damage(veteran.id, veteran.hp, a.p);
  const amulet = requiredFixture([...game.shared.loot.values()].find((drop) => drop.itemId === id));
  Object.assign(a.p, { x: amulet.x, y: amulet.base, z: amulet.z });
  await command(game, a.p, 'collect', { id: amulet.id });
  assert.equal(requiredResult(a.messages).ok, true);
  assert.equal(defense(), 0);
  await equip(id);
  assert.equal(a.p.appearance.neck, id);
  assert.equal(defense(), 1);
  await equip('none');
  assert.equal(defense(), 0);
  await game.flush();
  const { playerState } = await storedPlayerFixture(store, 'player:' + a.p.owner);
  assert.ok(playerState.inventory.collection.includes(id));
});

test('a passenger can climb up and down the deployed rope without a grappling hook', async () => {
  const { game, geometry } = await fixture(),
    a = await player(game, 99002),
    b = await player(game, 99003),
    home = geometry.airship.home;
  try {
    Object.assign(a.p, {
      x: AIRSHIP_TERMINAL.boarding.x + 0.5,
      z: AIRSHIP_TERMINAL.boarding.y + 0.5,
      y: home.y,
    });
    game.receive(a.p, {
      type: 'command',
      request: 1,
      action: 'airshipBoard',
      args: { price: game.shared.snapshot().airship.rentalPrice },
      inventoryEpoch: a.p.inventory.meta.epoch,
    });
    await a.p.queue;
    assert.equal(requiredResult(a.messages).ok, true);
    Object.assign(game.shared.airship.state, {
      phase: 'flying',
      position: { x: 140, y: 30, z: 150 },
      speed: 0,
    });
    await command(game, a.p, 'airshipRope');
    assert.equal(requiredResult(a.messages).ok, true);
    const bottom = game.shared.snapshot().airship.rope.bottom;
    assert.ok(bottom != null, 'Missing test fixture: bottom');
    Object.assign(b.p, { x: bottom.x, z: bottom.z, y: bottom.y });
    assert.equal(b.p.profile.grapplingHook, false);
    await command(game, b.p, 'airshipClimbUp');
    assert.equal(requiredResult(b.messages).ok, true);
    for (let i = 0; i < 200; i++) game.tick(0.05);
    assert.ok(game.shared.snapshot().airship.passengers.includes(b.p.id));
    await command(game, b.p, 'airshipClimbDown');
    assert.equal(requiredResult(b.messages).ok, true);
    await command(game, a.p, 'airshipRope', { retract: true });
    assert.equal(requiredResult(a.messages).ok, false, 'the pilot must wait for the climber');
    for (let i = 0; i < 200; i++) game.tick(0.05);
    assert.equal(b.p.mode, 'walk');
    assert.ok(Math.hypot(b.p.x - bottom.x, b.p.y - bottom.y, b.p.z - bottom.z) < 1e-6);
    assert.ok(!game.shared.snapshot().airship.passengers.includes(b.p.id));
    await command(game, a.p, 'airshipRope', { retract: true });
    assert.equal(requiredResult(a.messages).ok, true);
    assert.equal(game.shared.snapshot().airship.rope.deployed, false);

    await command(game, a.p, 'airshipRope');
    assert.equal(requiredResult(a.messages).ok, true);
    await command(game, b.p, 'airshipClimbUp');
    assert.equal(requiredResult(b.messages).ok, true);
    await command(game, a.p, 'airshipClimbDown');
    assert.equal(requiredResult(a.messages).ok, true);
    for (let i = 0; i < 200; i++) game.tick(0.05);
    const ship = () => game.shared.snapshot().airship;
    assert.deepEqual(ship().passengers, [b.p.id]);
    assert.equal(ship().captain, b.p.id);
    assert.ok(b.messages.some((m) => m.type === 'notice' && /airship pilot/.test(m.message)));
    const fare = b.p.inventory.economy.state.coins;
    await command(game, b.p, 'airshipInvite');
    assert.equal(requiredResult(b.messages).ok, true);
    await command(game, b.p, 'airshipRope', { retract: true });
    assert.equal(requiredResult(b.messages).ok, false, 'the traveler is still on the rope');
    for (let i = 0; i < 400 && ship().rope.passenger?.phase !== 'aboard'; i++) game.tick(0.05);
    const traveler = requiredFixture(ship().rope.passenger);
    assert.equal(traveler.phase, 'aboard');
    assert.ok(traveler.gender === 'woman' || traveler.gender === 'man');
    assert.equal(b.p.inventory.economy.state.coins, fare + 5);
    await command(game, b.p, 'airshipRope', { retract: true });
    assert.equal(requiredResult(b.messages).ok, true);
    assert.deepEqual(ship().rope.passenger, traveler);
    await command(game, a.p, 'airshipTarget', { x: 145, z: 150 });
    assert.equal(requiredResult(a.messages).ok, false);
    await command(game, b.p, 'airshipTarget', { x: 145, z: 150 });
    assert.equal(requiredResult(b.messages).ok, true);
    for (let i = 0; i < 80; i++) game.tick(0.05);
    assert.ok(ship().position.x > 140);
    assert.deepEqual(ship().rope.passenger, traveler);
    assert.equal(b.p.inventory.economy.state.coins, fare + 5);
  } finally {
    await game.close();
  }
});

test('blocked clicks choose the nearest reachable tile and return its actual goal', async () => {
  const { game, geometry } = await fixture(),
    a = await player(game, 99004);
  try {
    geometry.landClearAt = (x, y) => x >= 90 && x < 95 && y >= 118 && y <= 122;
    geometry.pathTo = (x, y) => (geometry.landClearAt(x, y) ? [{ x, y }] : null);
    await command(game, a.p, 'moveTo', { x: 100.5, z: 120.5 });
    const result = latestResult(a.messages);
    assert.equal(requiredFixture(result).ok, true);
    assert.deepEqual(requiredFixture(result).goal, { x: 95, z: 120.5 });
    for (let i = 0; i < 60; i++) game.tick(0.05);
    assert.ok(geometry.landClearAt(a.p.x - 0.5, a.p.z - 0.5));
    assert.equal(a.p.x, requiredFixture(requiredFixture(result).goal).x);
  } finally {
    await game.close();
  }
});

test('attacking a revealed alien without a permit raises the police alarm', async () => {
  const { game } = await fixture(),
    a = await player(game, 99005, {
      'sf-sunglasses-v1': '{"owned":true}',
      'sf-character-v1': '{"sunglasses":true}',
    });
  try {
    const target = {
      label: 'unpermitted-alien',
      id: 'unpermitted-alien',
      alienId: 'alien-civic',
      x: a.p.x + 0.5,
      z: a.p.z,
      base: a.p.y,
    };
    game.shared.npcById.set(target.id, target);
    await command(game, a.p, 'playerAction', {
      verb: 'attackPersonal',
      id: target.id,
      weapon: 'railgun',
    });
    assert.equal(requiredResult(a.messages).ok, false);
    assert.equal(game.personal.runtime(a.p).police.state.wanted, true);
  } finally {
    await game.close();
  }
});

test('waterfront seagulls award experience without turning zero damage into a combat hit', async () => {
  const { game } = await fixture(),
    a = await player(game, 99006);
  try {
    const bird = createWilderness({
      spawns: [{ id: 'test-seagull', combatKind: 'seagull', x: a.p.x + 0.5, z: a.p.z }],
    }).actors[0];
    game.shared.wilderness.actors.push(bird);
    const hp = a.p.hp;
    await command(game, a.p, 'attack', { id: bird.id, weapon: 'unarmed' });
    game.tick(0.7);
    assert.equal(a.p.hp, hp);
    assert.ok(a.p.hitpointsXP > 0);
  } finally {
    await game.close();
  }
});
