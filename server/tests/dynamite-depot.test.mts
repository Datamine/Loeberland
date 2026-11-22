import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DYNAMITE_DEPOT } from '../../src/config/dynamite-depot.ts';
import { command, fixture, player } from './fixtures.mts';

test('walking across the Dynamite Depot with a lit rocket launches and lands at one HP', async () => {
  const { game, advance } = await fixture();
  try {
    const { p, messages } = await player(game, 44, {
      'sf-purse-v1': JSON.stringify({ ownedEquipment: ['new-year-rocket'] }),
      'sf-character-v1': JSON.stringify({ back: 'new-year-rocket' }),
    });
    const { x, z, seconds } = DYNAMITE_DEPOT;
    Object.assign(p, { x: x - 1.5, z });
    const steps = (n: number) => {
      for (let i = 0; i < n; i++) {
        advance(25);
        game.tick(0.025);
      }
    };
    await command(game, p, 'moveTo', { x: x + 1.5, z });
    steps(80);
    assert.equal(p.mode, 'walk', 'the unlit rocket leaves the character on the ground');
    p.profile.decorativeRocketBurnUntil = advance(1) + 30_000;
    await command(game, p, 'moveTo', { x: x - 1.5, z });
    for (let i = 0; i < 80 && !p.depotLaunch; i++) steps(1);
    assert.equal(p.mode, 'depotLaunch');
    const hp = p.hp;
    const base = p.y;
    await command(game, p, 'moveTo', { x: x + 7, z });
    steps(Math.round(seconds / 0.05));
    assert.ok(Math.abs(p.y - base - 100) < 0.001);
    assert.equal(p.hp, hp);
    steps(Math.round(seconds / 0.05) + 1);
    assert.equal(p.mode, 'walk');
    assert.equal(p.y, base);
    assert.equal(p.hp, 1);
    assert.equal(p.respawnAllowed, undefined);
    assert.ok(
      messages.some(
        (event) => event.type === 'damage' && event.damage === hp - 1 && event.hp === 1,
      ),
    );
    steps(80);
    assert.equal(p.mode, 'walk', 'standing on the pile does not start another flight');
  } finally {
    await game.close();
  }
});
