import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MP_PROTOCOL } from '../../src/multiplayer-protocol.ts';
import { characterAppearance, normalizeCharacter } from '../../src/character-config.ts';
import { equipmentOptions } from '../../src/equipment-options.ts';
import { command, fixture, player, requiredResult } from './fixtures.mts';

test('Character Save persists the wardrobe and password and restores the same character on login', async () => {
  const { game } = await fixture();
  try {
    const original = await player(game, 41, {
      'sf-purse-v1': '{"coins":25,"ownedEquipment":["bayonet"]}',
      'sf-expeditions-v1': '{}',
    });
    const other = await player(game, 42);
    const name = original.p.name;
    const save = {
      name,
      look: { ...original.p.appearance, shirt: '#182c5b', weapon: 'bayonet' },
      phone: false,
      pvp: false,
      password: 'fixture-password',
    };
    await command(game, original.p, 'saveCharacter', { ...save, password: 'short' });
    assert.equal(requiredResult(original.messages).ok, false);
    assert.notEqual(original.p.appearance.shirt, save.look.shirt);

    await command(game, original.p, 'saveCharacter', save);
    const saved = requiredResult(original.messages);
    assert.equal(saved.ok, true);
    assert.equal(saved.hasCharacterPassword, true);
    assert.ok(saved.loginToken);
    assert.equal(original.p.appearance.shirt, save.look.shirt);
    assert.equal(original.p.appearance.weapon, 'bayonet');
    await assert.rejects(
      game.connect({ protocol: MP_PROTOCOL, token: original.token }, other.transport),
      /expired/,
    );
    await command(game, other.p, 'characterLogin', { name, password: 'incorrect-password' });
    assert.equal(requiredResult(other.messages).ok, false);
    await command(game, other.p, 'characterLogin', {
      name: name.toUpperCase(),
      password: save.password,
    });
    const login = requiredResult(other.messages);
    assert.ok(login.ok && login.loginToken);
    const copy = await game.connect(
      { protocol: MP_PROTOCOL, token: login.loginToken },
      other.transport,
    );
    assert.equal(copy.owner, original.p.owner);
    assert.equal(copy.name, name);
    assert.equal(copy.appearance.shirt, save.look.shirt);
    assert.equal(copy.appearance.weapon, 'bayonet');
    assert.equal(characterAppearance(normalizeCharacter(copy.appearance)).bayonet, true);
    assert.equal(copy.profile.playerState.quests.theyLive.started, false);
    assert.equal(copy.inventory.economy.state.coins, 25);
    await command(game, copy, 'saveCharacter', {
      ...save,
      password: 'replacement-password',
      currentPassword: save.password,
    });
    const changed = requiredResult(other.messages);
    assert.ok(changed.ok && changed.loginToken);
    await assert.rejects(
      game.connect({ protocol: MP_PROTOCOL, token: login.loginToken }, other.transport),
      /expired/,
    );
  } finally {
    await game.close();
  }
});

test('older weapon awards appear in the wardrobe and can be equipped after reconnecting', async () => {
  const { game } = await fixture();
  try {
    const a = await player(game, 44, {
      'sf-quests-v1': '{"theyLive":{"bayonet":true}}',
      'sf-expeditions-v1': '{"raptor":"completed","railgun":true,"equipped":false}',
      'sf-character-v1': '{"weapon":"bayonet"}',
    });
    assert.equal(a.p.appearance.weapon, 'bayonet');
    const loadout = a.p.inventory.snapshot();
    assert.deepEqual(loadout.purse.ownedEquipment, ['bayonet', 'railgun']);
    assert.deepEqual(
      equipmentOptions(loadout.purse).weapon.map((item) => item.value),
      ['unarmed', 'bayonet', 'railgun'],
    );
    await command(game, a.p, 'saveCharacter', {
      name: a.p.name,
      look: { ...a.p.appearance, weapon: 'railgun' },
      phone: false,
      pvp: false,
    });
    assert.equal(requiredResult(a.messages).ok, true);
    const reloaded = await player(game, 44);
    assert.equal(reloaded.p.appearance.weapon, 'railgun');
    assert.deepEqual(reloaded.p.inventory.economy.state.ownedEquipment, ['bayonet', 'railgun']);
  } finally {
    await game.close();
  }
});

test('the password reminder follows played time and stops after saving a password', async () => {
  const { game } = await fixture();
  try {
    const { p, messages } = await player(game, 43);
    const reminders = () =>
      messages.filter((event) => event.type === 'notice' && /Set a password/.test(event.message))
        .length;
    p.profile.characterPlaySeconds = 3599;
    game.tick(1);
    assert.equal(reminders(), 0);
    await command(game, p, 'beginPlay');
    game.tick(1);
    assert.equal(reminders(), 1);
    p.profile.characterPlaySeconds = 4199;
    game.tick(1);
    assert.equal(reminders(), 2);
    await command(game, p, 'saveCharacter', {
      name: p.name,
      look: p.appearance,
      phone: false,
      pvp: false,
      password: 'fixture-password',
    });
    assert.equal(requiredResult(messages).ok, true);
    p.profile.characterPlaySeconds = 4799;
    game.tick(1);
    assert.equal(reminders(), 2);
  } finally {
    await game.close();
  }
});
