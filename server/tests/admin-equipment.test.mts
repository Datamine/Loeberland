import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adminEquipmentOptions, grantAndEquip } from '../admin-equipment.ts';
import { createPlayerDocument } from '../../src/player-document.ts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { fixtureGeometry, player } from './fixtures.mts';

test('admin can unlock locked gear that the game accepts on login', async (t) => {
  const document = createPlayerDocument({ appearance: { hair: '#112233' } });
  const draft = { player: { appearance: document.appearance }, ...document };
  const hat = adminEquipmentOptions.hat[1].value;
  for (const [slot, item] of [
    ['torso', 'ice-top'],
    ['legs', 'black-cloak-bottom'],
    ['boots', 'true'],
    ['neck', 'clock-amulet'],
    ['hat', hat],
    ['sunglasses', 'true'],
    ['back', 'cape'],
    ['weapon', 'railgun'],
  ] as const) {
    assert.equal(grantAndEquip(draft, slot, item), true);
  }
  assert.equal(grantAndEquip(draft, 'torso', 'ice-top'), true);
  assert.equal(grantAndEquip(draft, 'torso', 'clock-amulet'), false);
  assert.deepEqual(document.inventory.economy.ownedEquipment, [
    'ice-top',
    'black-cloak-bottom',
    'combat-boots',
    'clock-amulet',
    'railgun',
  ]);
  assert.deepEqual(document.inventory.economy.ownedHats, [hat]);
  assert.equal(document.quests.expeditions.raptor, 'not-started');
  assert.equal(document.quests.expeditions.krakenReward, false);
  Object.assign(document, { appearance: draft.player.appearance });
  const store = createMemoryStore();
  const id = 8850;
  const owner = createHash('sha256').update(id.toString(16).padStart(64, '0')).digest('hex');
  await store.batch([['player:' + owner, { playerState: document }]]);
  const game = await createGame({ store, geometry: fixtureGeometry() });
  t.after(() => game.close());
  const { p } = await player(game, id);
  const look = p.appearance;
  assert.equal(look.weapon, 'railgun');
  assert.equal(look.back, 'cape');
  assert.equal(look.torso, 'ice-top');
  assert.equal(look.legs, 'black-cloak-bottom');
  assert.equal(look.boots, true);
  assert.equal(look.hat, hat);
  assert.equal(look.neck, 'clock-amulet');
  assert.equal(look.sunglasses, true);
  assert.equal(look.hair, '#112233');
});

test('granting the bayonet leaves the quest untouched and putting it away retains ownership', () => {
  const document = createPlayerDocument();
  const draft = { player: {}, ...document };
  assert.equal(grantAndEquip(draft, 'weapon', 'bayonet'), true);
  assert.equal(document.quests.theyLive.started, false);
  assert.deepEqual(document.inventory.economy.ownedEquipment, ['bayonet']);
  assert.equal(document.quests.theyLive.completed, false);
  assert.equal(grantAndEquip(draft, 'weapon', 'unarmed'), true);
  assert.deepEqual(document.inventory.economy.ownedEquipment, ['bayonet']);
});
