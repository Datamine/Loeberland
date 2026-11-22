import test from 'node:test';
import assert from 'node:assert/strict';
import { createHighScores } from '../high-scores.mts';
import { createMemoryStore } from '../store.mts';
import { hydratePlayerProfile } from '../../src/player-document.ts';
import type { NameReservation } from '../../src/types/storage.ts';

test('high scores rank online and offline characters by bank plus purse and by Strength XP', async () => {
  const store = createMemoryStore();
  const names = new Map<string, NameReservation>();
  const profiles = new Map();
  const now = 3_600_001;
  for (let i = 1; i <= 22; i++) {
    const owner = 'p' + i,
      name = 'Player_' + i;
    names.set(owner, { owner, name, canonical: name.toLowerCase(), changed: 0 });
    const profile = hydratePlayerProfile({});
    profile.playerState.inventory.economy.coins = i;
    profile.playerState.skills.strength.xp = 1800 - i;
    if (i === 1) profile.playerState.finance.bank = { balance: 100, updatedAt: 1 };
    if (i === 22) profiles.set(owner, profile);
    else await store.batch([['player:' + owner, { playerState: profile.playerState }]]);
  }
  const scores = await createHighScores(store, names, profiles, () => now)();
  assert.equal(scores.coins.length, 20);
  assert.equal(scores.strength.length, 20);
  assert.equal(scores.coins[0].name, 'Player_1');
  assert.ok(Math.abs(scores.coins[0].coins - 106) < 1e-10);
  assert.equal(scores.coins[1].name, 'Player_22');
  assert.equal(scores.strength[0].xp, 1799);
  assert.ok(scores.strength[0].level > 1);
  assert.equal('owner' in scores.coins[0], false);
});
