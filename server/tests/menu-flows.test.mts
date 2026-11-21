import type { TestPlayer, CapturedMessage } from './fixtures.mts';
import { requiredFixture } from '../../tests/helpers/required.mts';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldModel } from '../../src/world.ts';
import { createGame } from '../game.mts';
import { createMemoryStore } from '../store.mts';
import { player, latestResult, requiredResult } from './fixtures.mts';
import { dialogueFixture } from '../../tests/helpers/dialogue-fixture.mts';
import { npcContextActions, npcOffersAttack } from '../../src/npc-interactions.ts';
import { neighborhoodShopDialogue } from '../../src/neighborhood-interactions.ts';
import { NEIGHBORHOOD_SERVICES } from '../../src/config/neighborhood-services.ts';
import { HAT_CATALOG } from '../../src/hat-catalog.ts';
import { haberdasherDialogue } from '../../src/haberdashery.ts';
import { createEconomy } from '../../src/economy.ts';
import { createQuestLog, monkeyQuestDialogue } from '../../src/quests.ts';
import { theyLiveDialogue, ALIEN_TARGETS } from '../../src/they-live.ts';
import { createExpeditions, scientistDialogue, ahabDialogue } from '../../src/jurassic.ts';
import { createSecretAdventures } from '../../src/secret-adventures.ts';
import { hitpointMaximum, SKILL_THRESHOLDS } from '../../src/progression.ts';
import { PEQUOD } from '../../src/jurassic-layout.ts';
import { configuredDialogue } from '../../src/dialogue-config.ts';
import { createSaltMail, saltActivistDialogue, saltClerkDialogue } from '../../src/salt-mail.ts';
import { rehabilitationDialogue } from '../../src/rehabilitation.ts';
import { HAIRSTYLES } from '../../src/config/hairstyles.ts';
import { guildDialogue } from '../../src/guild.ts';
import { guildStatusFor } from '../guild.mts';
import { ILLUMINATI_CAVE } from '../../src/map-instances.ts';
import { SF_SPACEPORT } from '../../src/southern-district.ts';
import { ATV_RENTAL, ATV_SPEED } from '../../src/atv.ts';
import { houseClimb, SEARCH_HOMES } from '../../src/search-houses.ts';
import { ITEM_STATS } from '../../src/item-stats.ts';
import type { Actor } from '../../src/types/world.ts';
import type { Point } from '../../src/types/geometry.ts';
import type { ServerPlayer } from '../../src/types/server.ts';

// Use production parcels, collision/navigation and authoritative handlers. The
// DOM double drives the actual dialogue UI; it does not replace its callbacks.
const geometry = Object.assign(createWorldModel(), { hospital: { x: 0, y: 0 } });
geometry.hospital = requiredFixture(geometry.sights.find((s) => s.id === 'ucsf')).entry;
let time = 1_000_000,
  serial = 64000;
const game = await createGame({
  geometry,
  store: createMemoryStore(),
  now: () => time,
  random: () => 0.5,
});
after(() => game.close());
const settle = async (a: TestPlayer) => {
  await a.p.queue;
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const npc = (predicate: (npc: Actor) => boolean) =>
  requiredFixture(geometry.merchants.find(predicate));
function stand(a: TestPlayer, point: Point | null) {
  assert.ok(point != null, 'Missing test fixture: point');
  Object.assign(a.p, {
    x: point.x + 0.5,
    z: point.y + 0.5,
    y: geometry.characterGround(point.x + 0.5, point.y + 0.5),
    mode: 'walk',
  });
}
function atNPC(
  a: {
    p: ServerPlayer;
    messages: CapturedMessage[];
    transport: {
      open: boolean;
      bufferedAmount: number;
      send: (value: string | ArrayBuffer) => number;
      close(code?: number, reason?: string): void;
    };
    token: string;
  },
  n?: Actor | undefined,
) {
  stand(a, geometry.approaches.merchant(requiredFixture(n)));
}
async function visitor(
  point = geometry.spawn,
  extra: { 'sf-inebriation-v1'?: string; 'sf-expeditions-v1'?: string } | undefined = {},
) {
  const a = await player(game, ++serial, { 'sf-purse-v1': '{"coins":1000000}', ...extra });
  stand(a, point);
  return a;
}
async function act(a: TestPlayer, action: string, args: Record<string, unknown> = {}) {
  game.receive(a.p, {
    type: 'command',
    request: serial++,
    action,
    args,
    inventoryEpoch: a.p.inventory.meta.epoch,
  });
  await a.p.queue;
  return requiredResult(a.messages);
}
function stop(a: TestPlayer) {
  game.disconnect(a.p);
}
function tick(seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 0.05) {
    time += 50;
    game.tick(0.05);
  }
}

test('three climbable houses have reachable ladders and return the player to the front door', async () => {
  const climbable = SEARCH_HOMES.filter((home) => houseClimb(home.id));
  assert.equal(climbable.length, 3);
  const a = await visitor();
  try {
    const plain = requiredFixture(SEARCH_HOMES.find((home) => !houseClimb(home.id)));
    stand(a, plain.entry);
    assert.equal((await act(a, 'travel', { kind: 'houseRoof', id: plain.id })).ok, false);
    for (const house of climbable) {
      stand(a, house.entry);
      const foot = a.p.y;
      assert.equal((await act(a, 'travel', { kind: 'houseRoof', id: house.id })).ok, true);
      tick(0.5);
      assert.equal(a.p.mode, 'climb');
      assert.ok(a.p.y > foot, 'climbing raises the server pose');
      tick(2);
      assert.equal(a.p.mode, 'roof');
      assert.ok(a.p.y > foot + 2.5, 'arrival is on the roof');
      assert.equal((await act(a, 'travel', { kind: 'houseRoof' })).ok, true);
      tick(2.5);
      assert.equal(a.p.mode, 'walk');
      assert.equal(a.p.x, house.entry.x + 0.5);
      assert.equal(a.p.y, foot);
    }
  } finally {
    stop(a);
  }
});

test('the Industrious Goblin rents an ATV at both rates and the village roof supports air tricks', async () => {
  const a = await visitor();
  try {
    assert.equal((await act(a, 'travel', { kind: 'atvRent', minutes: 1 })).ok, false);
    atNPC(
      a,
      npc((n) => n.id === ATV_RENTAL.npcId),
    );
    assert.equal((await act(a, 'travel', { kind: 'atvRent', minutes: 1 })).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 999950);
    assert.equal(a.p.profile.playerState.activities.atvRentalUntil, time + 60_000);
    assert.equal((await act(a, 'travel', { kind: 'atvTrick', trick: 'roll' })).ok, false);
    const x = a.p.x;
    assert.equal((await act(a, 'moveTo', { x: x + 1.5, z: a.p.z })).ok, true);
    tick(0.1);
    assert.ok(Math.abs(a.p.x - x - ATV_SPEED * 0.1) < 1e-7, 'ATV uses exactly 150% of walk speed');
    const beforeDonut = { x: a.p.x, z: a.p.z };
    assert.equal((await act(a, 'travel', { kind: 'atvDonut' })).ok, true);
    tick(0.55);
    assert.ok(
      Math.hypot(a.p.x - beforeDonut.x, a.p.z - beforeDonut.z) > 1.4,
      'donut traces a circle',
    );
    tick(0.65);
    assert.ok(
      Math.hypot(a.p.x - beforeDonut.x, a.p.z - beforeDonut.z) < 1e-7,
      'the donut completes',
    );
    assert.equal((await act(a, 'travel', { kind: 'atvJump' })).ok, true);
    for (let i = 0; i < 160 && !game.movement.state(a.p).atv?.air; i++) tick(0.05);
    assert.ok(game.movement.state(a.p).atv?.air, 'the actual village roof launches the ATV');
    assert.equal((await act(a, 'travel', { kind: 'atvTrick', trick: 'roll' })).ok, true);
    tick(0.15);
    assert.ok(a.p.phase > 0.5, 'an air roll changes the replicated ATV pose');
    tick(1.2);
    assert.equal(game.movement.state(a.p).atv?.air, null);
    time += 60_000;
    tick(0.05);
    assert.equal(a.p.mode, 'walk');
    atNPC(
      a,
      npc((n) => n.id === ATV_RENTAL.npcId),
    );
    assert.equal((await act(a, 'travel', { kind: 'atvRent', minutes: 10 })).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 999450);
    assert.equal(a.p.profile.playerState.activities.atvRentalUntil, time + 600_000);
  } finally {
    stop(a);
  }
});

test('Cotogna sells an equippable metal rolling pin and SoMa has two aggressive level-five zombies', async () => {
  const a = await visitor();
  try {
    const chef = npc((n) => n.id === 'cotogna-chef');
    assert.equal((await act(a, 'inventory', { op: 'trade', kind: 'rolling-pin' })).ok, false);
    atNPC(a, chef);
    await choose(a, configuredDialogue('chef', chef, { buyTinfoil: () => undefined }), [
      'Buy a metal rolling pin · 20 coins',
    ]);
    assert.equal(a.p.inventory.economy.state.coins, 999980);
    assert.equal((await act(a, 'equipAppearance', { look: { weapon: 'rolling-pin' } })).ok, true);
    assert.equal(a.p.appearance.weapon, 'rolling-pin');
    assert.ok(ITEM_STATS['rolling-pin'].max > ITEM_STATS.unarmed.max, 'it hits harder than a fist');
    const zombies = game.shared.wilderness.actors.filter((n) => n.combatKind === 'soma-zombie');
    assert.equal(zombies.length, 2);
    for (const zombie of zombies) {
      assert.equal(zombie.level, 5);
      assert.equal(zombie.max, 25);
    }
    const target = zombies[0];
    stand(a, { x: target.x - 0.5, y: target.z - 0.5 });
    tick(0.1);
    assert.equal(target.enemy, a.p.id);
  } finally {
    stop(a);
  }
});

async function choose(
  a: TestPlayer,
  person: import('../../src/types/world.ts').RuntimeDialogue,
  labels: string[],
  { ok = true, message = null }: { ok?: boolean; message?: RegExp | null } | undefined = {},
) {
  const f = dialogueFixture(
    { name: a.p.name },
    { trade: (kind) => act(a, 'inventory', { op: 'trade', kind }) },
  );
  try {
    f.dialogue.open(person);
    f.advance();
    for (const label of labels) {
      f.click(label);
      await settle(a);
      if (
        f
          .buttons()
          .some((b) => (['OK', 'Respond'] satisfies [string, string]).includes(b.textContent)) &&
        label !== labels.at(-1)
      ) {
        f.advance();
      }
    }
    const result = latestResult(a.messages);
    if (result) assert.equal(result.ok, ok, person.name + ': ' + result.message);
    if (message) assert.match(f.element.textContent, message);
    return { text: f.element.textContent, result };
  } finally {
    f.dialogue.cancel();
    f.restore();
  }
}

test('every authored actor has usable context actions, protected actors have no attack, and players have no Examine', (t) => {
  const actors = [
    ...geometry.merchants,
    ...geometry.parrots,
    ...geometry.jailStaff,
    ...geometry.restaurantDiners,
    ...geometry.lives.flatMap((l) => requiredFixture(l).people),
    ...geometry.expeditions.cows,
    ...geometry.wilderness.actors,
  ];
  const valid = new Set([
    'talk',
    'attack',
    'steal',
    'pet',
    'examine',
    'walk',
    'duel',
    'follow',
    'unfollow',
  ] satisfies [string, string, string, string, string, string, string, string, string]);
  for (const actor of actors) {
    const actions = npcContextActions(actor);
    assert.ok(actions.length, actor.id);
    assert.equal(new Set(actions).size, actions.length);
    assert.ok(
      actions.every((action) => valid.has(action)),
      actor.id,
    );
    assert.ok(actions.includes('examine'));
    assert.ok(actions.includes('walk'));
    if (!npcOffersAttack(actor))
      assert.ok(!actions.includes('attack'), actor.id + ' should be protected');
  }
  assert.deepEqual(
    npcContextActions({ networkPlayer: true }, { duel: true, following: true, pvp: true }),
    ['duel', 'follow', 'unfollow', 'attack', 'walk'] satisfies [
      string,
      string,
      string,
      string,
      string,
    ],
  );
  assert.deepEqual(npcContextActions({ police: true }), ['walk', 'examine'] satisfies [
    string,
    string,
  ]);
  t.diagnostic(`${actors.length} placed actors; player/PvP/follow/duel variants`);
});

test('every offer at every neighborhood shop executes through its real menu and commits the configured effect', async (t) => {
  let count = 0;
  for (const n of geometry.merchants.filter((n) => n.neighborhoodService))
    for (const offer of NEIGHBORHOOD_SERVICES[requiredFixture(n.neighborhoodService)].offers) {
      const a = await visitor(undefined, { 'sf-inebriation-v1': '40' });
      atNPC(a, n);
      a.p.hp = 10;
      try {
        const person = neighborhoodShopDialogue(n, (id, offer) =>
          act(a, 'playerAction', { verb: 'neighborhoodService', id, offer }),
        );
        assert.ok(person?.choices != null, 'Missing test fixture: person.choices');
        const choice = person.choices.find((c) => c.id === offer.id);
        assert.ok(choice, n.id + ': ' + offer.id);
        const before = a.p.inventory.economy.state.coins;
        await choose(a, person, [choice.label]);
        assert.equal(
          a.p.inventory.economy.state.coins,
          before - (offer.price || 0) + (offer.reward || 0),
        );
        if (offer.heal) assert.equal(a.p.hp, 15);
        if (offer.sober) assert.equal(game.personal.runtime(a.p).inebriation.state.percent, 30);
        if (offer.bouquet) assert.equal(a.p.inventory.economy.state.bouquets, 1);
        if (offer.sandwich) assert.equal(a.p.inventory.meta.sandwiches, 1);
        if (offer.reward)
          await choose(a, person, [choice.label], { ok: false, message: /Come back/ });
        if (offer.showMs) {
          assert.equal(n.showStartedAt, time);
          time += offer.showMs + 1;
        }
        count++;
      } finally {
        stop(a);
      }
    }
  assert.ok(count > 20);
  t.diagnostic(`${count} real shop/offer combinations`);
});

test('every purchasable hat menu charges its actual price, grants ownership and selects the purchased hat', async (t) => {
  const n = npc((n) => n.kind === 'haberdasher');
  let count = 0;
  for (const hat of HAT_CATALOG.filter((h) => !h.dropOnly)) {
    const a = await visitor();
    atNPC(a, n);
    let worn = null;
    try {
      const economy = createEconomy(a.p.inventory.economy.state);
      economy.buyHat = (id) => ({
        ok: true,
        pending: true,
        promise: act(a, 'inventory', { op: 'buyHat', id }),
      });
      const person = haberdasherDialogue(n, economy, (id) => (worn = id)),
        choice = person.choices.find((c) => c.label.startsWith(hat.name + ' · '));
      assert.ok(choice != null, 'Missing test fixture: choice');
      await choose(a, person, [choice.label]);
      assert.equal(a.p.inventory.economy.state.coins, 1_000_000 - hat.price);
      assert.ok(a.p.inventory.economy.state.ownedHats.includes(hat.id));
      assert.equal(worn, hat.id);
      count++;
    } finally {
      stop(a);
    }
  }
  t.diagnostic(`${count} hat purchases`);
});

test('They Live menus progress from no quest through evidence, permit, weapon, reward and the unlocked battleaxe', async () => {
  const a = await visitor(),
    r = game.personal.runtime(a.p),
    clerk = npc((n) => n.questRole === 'clerk'),
    researcher = npc((n) => n.questRole === 'esoteric'),
    armorer = npc((n) => n.questRole === 'armorer');
  const quest = {
    ...createQuestLog().theyLive,
    certificate: () => act(a, 'playerAction', { verb: 'certificate' }),
    permit: () => act(a, 'playerAction', { verb: 'permit' }),
    weapon: () => act(a, 'playerAction', { verb: 'bayonet' }),
    reward: () => act(a, 'playerAction', { verb: 'skateboard' }),
  };
  const sync = () => Object.assign(quest.state, structuredClone(r.quests.theyLive.state));
  try {
    atNPC(a, clerk);
    await choose(a, theyLiveDialogue(requiredFixture(clerk), quest), ['Ask about the office']);
    assert.equal(r.quests.theyLive.state.started, false);
    assert.ok(geometry?.sunglassesSite != null, 'Missing test fixture: geometry.sunglassesSite');
    stand(a, geometry.sunglassesSite.entry);
    assert.equal(
      requiredFixture(await act(a, 'playerAction', { verb: 'pickSunglasses' })).ok,
      true,
    );
    sync();
    atNPC(a, clerk);
    await choose(
      a,
      theyLiveDialogue(requiredFixture(clerk), quest),
      ['What evidence do you need?'],
      {
        message: /Documentary evidence/,
      },
    );
    atNPC(a, researcher);
    await choose(a, theyLiveDialogue(requiredFixture(researcher), quest), ['Report the aliens'], {
      message: /Certificate/,
    });
    sync();
    atNPC(a, clerk);
    await choose(a, theyLiveDialogue(requiredFixture(clerk), quest), [
      'Receive alien-removal permit',
    ]);
    sync();
    atNPC(a, armorer);
    await choose(a, theyLiveDialogue(requiredFixture(armorer), quest), ['Collect bayonet']);
    sync();
    assert.equal(r.quests.theyLive.state.bayonet, true);
    for (const target of ALIEN_TARGETS)
      assert.equal(r.quests.theyLive.defeat(target.id, { revealed: true }).ok, true);
    sync();
    atNPC(a, clerk);
    await choose(a, theyLiveDialogue(requiredFixture(clerk), quest), ['Accept skateboard']);
    sync();
    assert.equal(r.quests.theyLive.state.skateboard, true);
    atNPC(a, armorer);
    await choose(
      a,
      theyLiveDialogue(requiredFixture(armorer), quest, {
        buyBattleaxe: () => act(a, 'buyBattleaxe'),
      }),
      ['Buy battleaxe · 50 coins'],
    );
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('battleaxe'));
  } finally {
    stop(a);
  }
});

test('Monkey Business accepts, steals, completes and keeps its completion dialogue without repeating the reward', async () => {
  const a = await visitor(),
    r = game.personal.runtime(a.p),
    professor = npc((n) => n.id === 'ada-meridian'),
    questSource = createQuestLog(),
    quests = {
      ...questSource,
      get carrying() {
        return questSource.carrying;
      },
      accept: () => act(a, 'playerAction', { verb: 'acceptMonkey' }),
      complete: () => act(a, 'playerAction', { verb: 'completeMonkey' }),
    };
  const sync = () => Object.assign(quests.state, structuredClone(r.quests.state));
  try {
    atNPC(a, professor);
    await choose(a, monkeyQuestDialogue(professor, quests, createEconomy()), ['Accept quest']);
    sync();
    await choose(
      a,
      monkeyQuestDialogue(professor, quests, createEconomy()),
      ['Why not use a job board?'],
      {
        message: /corner office/,
      },
    );
    stand(a, requiredFixture(geometry.sights.find((s) => s.id === 'zoo-monkeys')).entry);
    assert.equal(requiredFixture(await act(a, 'playerAction', { verb: 'stealMonkey' })).ok, true);
    assert.equal(r.keeper.state.phase, 'chasing');
    sync();
    atNPC(a, professor);
    await choose(a, monkeyQuestDialogue(professor, quests, createEconomy()), [
      'Introduce the monkey',
    ]);
    sync();
    assert.equal(a.p.inventory.economy.state.coins, 1_000_025);
    assert.equal(r.quests.state.monkey, 'completed');
    await choose(a, monkeyQuestDialogue(professor, quests, createEconomy()), [
      'Ask about the monkey',
    ]);
    assert.equal(a.p.inventory.economy.state.coins, 1_000_025);
  } finally {
    stop(a);
  }
});

test('salt courier choices deliver the letter while preserving the clerk’s independent quest options', async () => {
  const a = await visitor(),
    activist = npc((n) => n.kind === 'salt-activist'),
    clerk = npc((n) => n.questRole === 'clerk'),
    economy = createEconomy();
  economy.trade = (kind) => ({
    ok: true,
    pending: true,
    promise: act(a, 'inventory', { op: 'trade', kind }).then((result) => {
      Object.assign(economy.state, a.p.inventory.economy.state);
      return result;
    }),
  });
  const mail = createSaltMail(economy);
  try {
    atNPC(a, activist);
    await choose(
      a,
      saltActivistDialogue(activist, mail, economy),
      ['Take a letter · 50 coins on delivery'],
      { message: /Deliver it to the City Hall clerk/ },
    );
    assert.equal(mail.carrying, true);
    atNPC(a, clerk);
    const person = saltClerkDialogue(
      theyLiveDialogue(requiredFixture(clerk), createQuestLog().theyLive),
      mail,
    );
    assert.equal(requiredFixture(person.choices).length, 2);
    await choose(a, person, ['Deliver conservation letter · 50 coins'], {
      message: /pays you 50 coins/,
    });
    assert.equal(a.p.inventory.economy.state.coins, 1_000_050);
    assert.equal(mail.carrying, false);
  } finally {
    stop(a);
  }
});

test('Jurassic dialogue actually issues a railgun, accepts shared remains and completes the recovery protocol', async () => {
  const a = await visitor(undefined, { 'sf-expeditions-v1': '{}' }),
    scientist = npc((n) => n.expeditionRole === 'scientist'),
    r = game.personal.runtime(a.p),
    expeditions = {
      ...createExpeditions(),
      startQuest: () => act(a, 'playerAction', { verb: 'startRaptor' }),
      finishQuest: () => act(a, 'playerAction', { verb: 'finishRaptor' }),
    };
  try {
    atNPC(a, scientist);
    await choose(a, scientistDialogue(scientist, expeditions), ['Do you have a quest for me?'], {
      message: /Railgun issued/,
    });
    assert.equal(r.expeditions.state.railgun, true);
    Object.assign(expeditions.state, r.expeditions.state);
    await choose(a, scientistDialogue(scientist, expeditions), ['Review recovery protocol']);
    const target = game.shared.raptor;
    Object.assign(target, { phase: 'loose', hp: 1, x: a.p.x + 0.5, z: a.p.z, path: [] });
    assert.equal(
      requiredFixture(await act(a, 'attack', { id: target.id, weapon: 'railgun' })).ok,
      true,
    );
    const remains = [...game.shared.loot.values()].find((l) => l.lootKind === 'raptor');
    assert.ok(remains);
    assert.equal(requiredFixture(await act(a, 'collect', { id: remains.id })).ok, true);
    Object.assign(expeditions.state, r.expeditions.state);
    atNPC(a, scientist);
    await choose(
      a,
      scientistDialogue(scientist, expeditions),
      ['Hand over the remains and demand an explanation'],
      { message: /good test/ },
    );
    assert.equal(r.expeditions.state.raptor, 'completed');
  } finally {
    stop(a);
  }
});

test('Ahab’s menu boards a private hunt, arrives at the boss, collects the cape once, and returns to the beach', async () => {
  const a = await visitor(),
    captain = npc((n) => n.id === 'captain-ahab'),
    r = game.personal.runtime(a.p),
    expeditionSource = createExpeditions({ saved: { railgun: true } }),
    listeners: ((event: import('../../src/types/network.ts').ServerEvent) => void)[] = [];
  const client = {
    state: { connected: true, id: a.p.id },
    subscribe: (fn: (event: import('../../src/types/network.ts').ServerEvent) => void) => {
      listeners.push(fn);
      return () => {};
    },
    command: async (action: string, args?: {} | undefined) => {
      const before = a.messages.length,
        result = await act(a, action, args);
      for (const message of a.messages.slice(before))
        if (message.type) for (const fn of listeners) fn(message);
      return result;
    },
  };
  const secret = createSecretAdventures({ client, ground: geometry.characterGround });
  const expeditions = {
    ...expeditionSource,
    board: () => secret.boardKraken(expeditionSource),
    returnShip: () => act(a, 'playerAction', { verb: 'returnShip' }),
  };
  const tick = () => {
    time += 50;
    game.tick(0.05);
    Object.assign(expeditions.ship, r.expeditions.ship);
    Object.assign(expeditions.state, { krakenReward: r.expeditions.state.krakenReward });
  };
  try {
    atNPC(a, captain);
    const shore = { x: a.p.x, y: a.p.y, z: a.p.z };
    await choose(
      a,
      ahabDialogue(captain, expeditions),
      ['What happened to Moby Dick?', 'Board the Pequod'] satisfies [string, string],
      { message: /unfurls the sails/ },
    );
    assert.equal(a.p.instance.kind, 'kraken');
    for (let i = 0; i < 122; i++) tick();
    assert.equal(r.expeditions.ship.phase, 'fighting');
    assert.equal(r.expeditions.kraken.visible, true);
    assert.ok(
      geometry?.expeditions?.ship?.home != null,
      'Missing test fixture: geometry.expeditions.ship.home',
    );
    assert.equal(a.p.x, geometry.expeditions.ship.home.x - PEQUOD.travel);
    a.p.hitpointsXP = SKILL_THRESHOLDS.at(-1)!;
    a.p.max = a.p.hp = hitpointMaximum(a.p.hitpointsXP);
    assert.equal(
      requiredFixture(await act(a, 'playerAction', { verb: 'attackKraken', weapon: 'railgun' })).ok,
      true,
    );
    for (let i = 0; i < 3500 && r.expeditions.kraken.hp > 0; i++) {
      a.p.hp = a.p.max;
      if (!a.p.inventory.meta.railgunCharge) {
        a.p.inventory.meta.railgunBatteries = 1;
        assert.equal(requiredFixture(await act(a, 'inventory', { op: 'chargeRailgun' })).ok, true);
        await act(a, 'playerAction', { verb: 'attackKraken', weapon: 'railgun' });
      }
      tick();
    }
    assert.equal(r.expeditions.kraken.hp, 0);
    assert.equal(r.expeditions.ship.phase, 'victory');
    const loot = r.expeditions.state.loot.find((l) => l.lootKind === 'kraken');
    assert.ok(loot);
    assert.equal(
      requiredFixture(await act(a, 'playerAction', { verb: 'collectPersonal', id: loot.id })).ok,
      true,
    );
    assert.equal(a.p.inventory.economy.state.coins, 1_000_100);
    assert.equal(r.expeditions.state.cape, true);
    assert.equal(
      requiredFixture(await act(a, 'playerAction', { verb: 'collectPersonal', id: loot.id })).ok,
      false,
    );
    await choose(a, ahabDialogue(captain, expeditions), ['Sail back to shore']);
    for (let i = 0; i < 102; i++) tick();
    assert.equal(a.p.instance.kind, 'world');
    assert.deepEqual({ x: a.p.x, y: a.p.y, z: a.p.z }, shore);
    assert.ok(!ahabDialogue(captain, expeditions).choices);
    assert.match(ahabDialogue(captain, expeditions).intro, /already claimed/);
  } finally {
    stop(a);
  }
});

test('rehabilitation’s final consent leads to UCSF, a valid changed appearance and 100% inebriation', async () => {
  const a = await visitor(),
    r = game.personal.runtime(a.p),
    oldGender = a.p.appearance.gender;
  a.p.personalJailed = true;
  r.police.state.jailed = true;
  Object.assign(a.p, {
    x: geometry.detention.x,
    z: geometry.detention.z,
    y: geometry.detention.base + 0.18,
  });
  const specialist = geometry.jailStaff[0],
    f = dialogueFixture();
  try {
    f.dialogue.open(
      rehabilitationDialogue(specialist, () => act(a, 'playerAction', { verb: 'rehabilitate' })),
    );
    f.advance();
    f.click('Yes. Are there any side effects?');
    f.advance();
    f.click('All right. Begin rehabilitation.');
    assert.equal(a.p.rehabilitateAt, undefined);
    f.advance();
    await settle(a);
    assert.equal(requiredResult(a.messages).ok, true);
    assert.ok(requiredFixture<number>(a.p.rehabilitateAt) > time);
    time += 3600;
    game.tick(0.05);
    assert.equal(a.p.personalJailed, false);
    assert.equal(a.p.x, geometry.hospital.x + 0.5);
    assert.equal(a.p.z, geometry.hospital.y + 0.5);
    assert.equal(r.inebriation.state.percent, 100);
    assert.ok(
      HAIRSTYLES[a.p.appearance.gender === 'woman' ? 'woman' : 'man'].some(
        (h) => h.id === a.p.appearance.hairstyle,
      ),
    );
    assert.notEqual(a.p.appearance.gender, oldGender);
  } finally {
    f.dialogue.cancel();
    f.restore();
    stop(a);
  }
});

test('Ray’s donation menu, the Old Man, the stairs and the bomber form a complete admission journey', async () => {
  const a = await visitor(),
    ray = npc((n) => n.kind === 'guild-master'),
    elder = npc((n) => n.kind === 'illuminati-elder');
  a.p.inventory.meta.peptides = 24;
  a.p.inventory.save();
  try {
    for (let i = 0; i < 24; i++) {
      atNPC(a, ray);
      const person = guildDialogue(ray, {
        status: () => guildStatusFor(a.p, () => time),
        act: (kind: string) => act(a, kind === 'donate' ? 'guildDonate' : 'guildCheckIn'),
      });
      await choose(a, person, ['Donate 1 peptide']);
    }
    assert.equal(requiredFixture(a.p.profile.guild).member, true);
    assert.equal(a.p.inventory.meta.peptides, 0);
    atNPC(a, elder);
    await choose(
      a,
      {
        ...elder,
        intro: 'Donate 250,000 coins to join the Illuminati.',
        choice: 'Donate 250,000 coins',
        accept: () => act(a, 'joinIlluminati'),
      },
      ['Donate 250,000 coins'],
    );
    assert.equal(a.p.inventory.economy.state.coins, 750000);
    stand(a, geometry.secretStairs.entry);
    assert.equal(requiredFixture(await act(a, 'instanceEnter', { kind: 'illuminati' })).ok, true);
    Object.assign(a.p, { ...ILLUMINATI_CAVE.boarding, y: ILLUMINATI_CAVE.floor + 0.025 });
    assert.equal(requiredFixture(await act(a, 'bomberBoard')).ok, true);
    assert.equal(a.p.mode, 'bomber');
    assert.equal(a.p.profile.bomber, true);
    assert.equal(requiredFixture(await act(a, 'bomberReturn')).ok, true);
    Object.assign(a.p, { ...ILLUMINATI_CAVE.entrance, y: ILLUMINATI_CAVE.floor + 0.025 });
    assert.equal(requiredFixture(await act(a, 'instanceLeave')).ok, true);
    assert.equal(a.p.instance.kind, 'world');
  } finally {
    stop(a);
  }
});

test('both real rocket attendants complete their journeys and charge only once per flight', async () => {
  const a = await visitor();
  try {
    for (const [id, destination] of [
      ['sf-spaceport', geometry.tahoe.spaceport],
      ['tahoe-spaceport', SF_SPACEPORT],
    ] as const) {
      const attendant = npc((n) => n.kind === 'crew' && n.siteId === id);
      atNPC(a, attendant);
      const f = dialogueFixture();
      let launched;
      try {
        f.dialogue.open(
          configuredDialogue(
            'rocket',
            attendant,
            {
              launch: () => ({
                ok: true,
                after: () => (launched = act(a, 'travel', { kind: 'rocket' })),
              }),
            },
            { destination: id === 'sf-spaceport' ? 'to Lake Tahoe' : 'back to San Francisco' },
          ),
        );
        f.advance();
        f.click('Launch · 1 coin');
        assert.equal(game.movement.state(a.p).rocket.state.active, false);
        f.advance();
        assert.equal(
          requiredFixture<import('../../src/types/network.ts').CommandResult>(await launched).ok,
          true,
        );
        const rocket = game.movement.state(a.p).rocket;
        tick(rocket.duration + 0.1);
        assert.equal(rocket.state.active, false);
        assert.equal(a.p.x, destination.entry.x + 0.5);
        assert.equal(a.p.z, destination.entry.y + 0.5);
        assert.equal(a.p.mode, 'walk');
      } finally {
        f.dialogue.cancel();
        f.restore();
      }
    }
    assert.equal(a.p.inventory.economy.state.coins, 999998);
  } finally {
    stop(a);
  }
});

test('the actual gondola, summit ski-rental choice and skiing form a complete return trip', async () => {
  const a = await visitor(geometry.tahoe.baseEntry),
    tahoe = game.movement.state(a.p).tahoe;
  try {
    assert.equal(requiredFixture(await act(a, 'travel', { kind: 'gondola' })).ok, true);
    for (let i = 0; i < 3000 && tahoe.state.mode !== 'ground'; i++) tick(0.05);
    assert.equal(tahoe.state.mode, 'ground');
    assert.equal(a.p.x, tahoe.summitEntry.x + 0.5);
    assert.equal(a.p.z, tahoe.summitEntry.y + 0.5);
    const attendant = npc((n) => n.kind === 'lift');
    atNPC(a, attendant);
    const person = configuredDialogue('ski-lift', attendant, {
      rentSkis: () => act(a, 'inventory', { op: 'trade', kind: 'skis' }),
    });
    assert.ok(person?.choices != null, 'Missing test fixture: person.choices');
    await choose(a, person, [person.choices[0].label]);
    assert.equal(tahoe.state.rented, true);
    assert.equal(a.p.inventory.economy.state.coins, 999999);
    stand(a, tahoe.summitEntry);
    assert.equal(requiredFixture(await act(a, 'travel', { kind: 'ski' })).ok, true);
    for (let i = 0; i < 6000 && tahoe.state.mode !== 'ground'; i++) tick(0.05);
    assert.equal(tahoe.state.mode, 'ground');
    assert.equal(a.p.mode, 'walk');
    assert.ok(Math.hypot(a.p.x - tahoe.baseEntry.x - 0.5, a.p.z - tahoe.baseEntry.y - 0.5) < 4);
  } finally {
    stop(a);
  }
});

test('every placed bench accepts Sit from its visible approach and releases the player onto walkable ground', async (t) => {
  const a = await visitor(),
    benches = geometry.sights.filter((s) => s.kind === 'bench');
  assert.ok(benches.length > 10);
  try {
    for (const bench of benches) {
      stand(a, bench.entry);
      const seated = await act(a, 'activity', { mode: 'sit', seat: bench.id });
      assert.equal(
        requiredFixture(seated).ok,
        true,
        bench.id + ': ' + requiredFixture(seated).message,
      );
      assert.equal(a.p.mode, 'bench');
      assert.equal(requiredFixture(a.p.seat).id, bench.id);
      assert.equal(requiredFixture(await act(a, 'activity', { mode: 'walk' })).ok, true);
      assert.equal(a.p.seat, null);
      assert.ok(geometry.landClearAt(a.p.x - 0.5, a.p.z - 0.5), bench.id + ' has a blocked exit');
    }
    t.diagnostic(`${benches.length} bench menus and exits`);
  } finally {
    stop(a);
  }
});

test('Bolinas grocer calls officers from connected Marin ground for attacks and theft', async () => {
  const grocer = npc((n) => n.id === 'bolinas-grocer');
  for (const steal of [false, true]) {
    const a = await visitor(requiredFixture(grocer.approach));
    try {
      assert.equal(
        (
          await act(a, 'playerAction', {
            verb: 'attackPersonal',
            id: grocer.id,
            weapon: 'unarmed',
            steal,
          })
        ).ok,
        true,
      );
      const { police } = game.personal.runtime(a.p);
      assert.ok(police.state.officers.length);
      assert.ok(
        police.state.officers.every((officer) =>
          geometry.marinLand.contains(officer.x + 0.5, officer.y + 0.5),
        ),
      );
      tick(3);
      assert.equal(a.p.personalJailed, true);
      assert.equal(police.state.officers.length, 0);
    } finally {
      stop(a);
    }
  }
});

test('the factory sells all three chairs and a Noe Valley stroller parent buys them back', async () => {
  const maker = requiredFixture(
    game.shared.wilderness.actors.find((n) => n.combatKind === 'goblin-maker'),
  );
  const parent = requiredFixture([...game.shared.npcById.values()].find((n) => n.stroller));
  const a = await visitor({ x: maker.x - 0.5, y: maker.z - 0.5 });
  const trade = (item: string, transaction: 'buy' | 'sell') =>
    act(a, 'playerAction', { verb: 'tradeFactoryChair', item, trade: transaction });
  try {
    const chairs = ['ball-chair', 'eames-chair', 'bertoia-chair'];
    for (const chair of chairs) assert.equal((await trade(chair, 'buy')).ok, true);
    assert.equal((await trade(chairs[0], 'buy')).ok, false);
    assert.equal((await trade(chairs[0], 'sell')).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 999400);
    stand(a, { x: parent.x - 0.5, y: parent.z - 0.5 });
    for (const chair of chairs) assert.equal((await trade(chair, 'sell')).ok, true);
    assert.equal((await trade(chairs[0], 'sell')).ok, false);
    assert.equal(a.p.inventory.economy.state.coins, 1000060);
  } finally {
    stop(a);
  }
});

test('either taxi dispatches a level-five Robocop that expires after a minute out of combat', async () => {
  for (const tesla of [false, true]) {
    const car = requiredFixture(geometry.streetTraffic.cars.find((n) => n.tesla === tesla));
    const a = await visitor({ x: car.x - 0.5, y: car.z - 0.5 });
    try {
      const result = await act(a, 'kickTaxi', { id: car.id });
      assert.equal(result.ok, true, result.message);
      const responder = requiredFixture(
        game.shared.wilderness.actors.find((n) => n.dispatchedFor === a.p.id),
      );
      assert.equal(responder.level, 5);
      assert.equal(responder.enemy, a.p.id);
      assert.equal((await act(a, 'kickTaxi', { id: car.id })).ok, false);
      stand(a, geometry.spawn);
      game.shared.wilderness.update(59.9, []);
      assert.ok(game.shared.wilderness.actors.includes(responder));
      game.shared.wilderness.update(0.11, []);
      assert.ok(!game.shared.wilderness.actors.includes(responder));
    } finally {
      stop(a);
    }
  }
});
