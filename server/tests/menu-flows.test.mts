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
import { MOTORCYCLE_TRICKS } from '../../src/motorcycle.ts';
import { WAYMO_RENTAL } from '../../src/waymo-rental.ts';
import { marketStreetcarPose, marketStreetcarRider } from '../../src/market-streetcar.ts';
import { CONSTRUCTION_SITE } from '../../src/construction-layout.ts';
import { AI_LAB_PAY_INTERVAL } from '../../src/ai-lab.ts';
import { FISHING_COOLDOWN_MS, FISHING_DURATION } from '../../src/fishing.ts';
import { FIGHTER_LEVELS, FIGHTER_YARD, isYardFighter } from '../../src/fighter-yard-layout.ts';
import { GIRARD_HOME, SCAPEGOAT } from '../../src/girard-layout.ts';
import { POINT_REYES, POINT_REYES_URCHINS } from '../../src/point-reyes.ts';
import { rollMonsterDrops } from '../../src/monster-drops.ts';
import {
  GOBLIN_INDUSTRIALIST,
  GOBLIN_PHONE_BUYER,
  ROBE_SELLER,
} from '../../src/goblin-industrialist.ts';
import { FURNITURE_FACTORY, GOBLIN_INCUBATOR } from '../../src/goblin-town.ts';
import { houseClimb, SEARCH_HOMES } from '../../src/search-houses.ts';
import { ITEM_STATS } from '../../src/item-stats.ts';
import { PARROT_SCIENTIST, PROOF_BUYERS, proofBuyerChoice } from '../../src/stochastic-parrot.ts';
import { BURNING_MAN, burningManDialogue, type BurningManAction } from '../../src/burning-man.ts';
import {
  GOBLIN_SPACE_PROGRAM,
  GOOSE_CORP_SHIRT,
  MUD_BATH,
  VILLAGE_GOOSE,
  VILLAGE_POSTERS,
} from '../../src/goblin-space-layout.ts';
import { SEARCH_ROCKET } from '../../src/config/search-houses.ts';
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

test('the Market Street cable car takes nearby riders and lets them off on walkable ground', async () => {
  const a = await visitor();
  try {
    assert.equal((await act(a, 'travel', { kind: 'streetcarBoard' })).retryApproach, true);
    const car = () => marketStreetcarPose(geometry.streetcarRoute, time);
    stand(a, { x: car().x - 0.5, y: car().z - 0.5 });
    assert.equal((await act(a, 'travel', { kind: 'streetcarBoard' })).ok, true);
    assert.equal(a.p.mode, 'streetcar');
    assert.equal((await act(a, 'moveTo', { x: a.p.x + 3, z: a.p.z })).ok, false);
    tick(7);
    const expected = marketStreetcarRider(car(), geometry.terrainHeight(car().x, car().z));
    assert.deepEqual({ x: a.p.x, y: a.p.y, z: a.p.z, angle: a.p.angle }, expected);
    assert.equal((await act(a, 'travel', { kind: 'streetcarExit' })).ok, true);
    assert.equal(a.p.mode, 'walk');
    assert.ok(geometry.landClearAt(a.p.x - 0.5, a.p.z - 0.5));
    assert.equal(a.p.y, geometry.characterGround(a.p.x, a.p.z));
    assert.ok(Math.hypot(a.p.x - car().x, a.p.z - car().z) <= 1.25 + 1e-9);
  } finally {
    stop(a);
  }
});

test('construction pays AFK wages at the workbench and stops on request or movement', async () => {
  const { id, work } = CONSTRUCTION_SITE;
  const site = requiredFixture(geometry.sights.find((s) => s.id === id));
  const entry = requiredFixture(site.entry);
  assert.ok(geometry.landClearAt(entry.x, entry.y));
  assert.ok(geometry.pathTo(entry.x, entry.y, geometry.spawn)?.length);

  const a = await visitor();
  try {
    const interval = AI_LAB_PAY_INTERVAL * 10;
    const coins = () => a.p.inventory.economy.state.coins;
    const before = coins();
    const start = () => act(a, 'playerAction', { verb: 'constructionStart' });
    assert.equal((await start()).ok, false);
    stand(a, entry);
    assert.equal((await start()).ok, true);
    assert.equal(a.p.mode, 'construction');
    assert.equal(a.p.angle, work.angle);
    tick(interval - 0.05);
    assert.equal(coins(), before);
    tick(0.05);
    assert.equal(coins(), before + 1);
    tick(interval);
    assert.equal(coins(), before + 2);
    assert.equal(a.p.mode, 'construction');
    assert.equal((await act(a, 'playerAction', { verb: 'constructionStop' })).ok, true);
    assert.equal(a.p.mode, 'walk');
    tick(interval);
    assert.equal(coins(), before + 2);
    assert.equal((await start()).ok, true);
    assert.equal((await act(a, 'moveTo', { x: work.x + 1.3, z: work.z })).ok, true);
    tick(interval);
    assert.equal(a.p.mode, 'walk');
    assert.equal(coins(), before + 2);
  } finally {
    stop(a);
  }
});

test('construction caps paid work at 30 minutes and persists the one-hour break', async () => {
  const site = requiredFixture(geometry.sights.find((s) => s.id === CONSTRUCTION_SITE.id));
  const accountId = ++serial;
  let a = await player(game, accountId);
  const start = () => act(a, 'playerAction', { verb: 'constructionStart' });
  const coins = () => a.p.inventory.economy.state.coins;
  const workFor = (seconds: number) => {
    time += seconds * 1000;
    game.personal.tick(seconds);
  };
  const reconnect = async () => {
    await game.disconnect(a.p);
    a = await player(game, accountId);
    stand(a, site.entry);
  };
  try {
    stand(a, site.entry);
    const before = coins();
    assert.equal((await start()).ok, true);
    workFor(29 * 60 + 59);
    assert.equal(coins(), before + 89);
    assert.equal(a.p.mode, 'construction');

    // Pausing or reconnecting cannot refresh the work allowance.
    assert.equal((await act(a, 'playerAction', { verb: 'constructionStop' })).ok, true);
    await reconnect();
    time += 10_000;
    assert.equal((await start()).ok, true);
    workFor(60);
    assert.equal(coins(), before + 90);
    assert.equal(a.p.mode, 'walk');
    assert.ok(
      a.messages.some(
        (message) =>
          !(message instanceof ArrayBuffer) &&
          'type' in message &&
          message.type === 'notice' &&
          /shift is over/i.test(message.message),
      ),
    );

    assert.match((await start()).message || '', /60 minutes/);
    await reconnect();
    time += 60 * 60 * 1000 - 1;
    assert.equal(coins(), before + 90);
    const blocked = await start();
    assert.equal(blocked.ok, false);
    assert.match(blocked.message || '', /1 minute/);
    time++;
    assert.equal((await start()).ok, true);
    workFor(AI_LAB_PAY_INTERVAL * 10);
    assert.equal(coins(), before + 91);
    assert.equal(a.p.mode, 'construction');
  } finally {
    stop(a);
  }
});

test('the Pacifica surf competition has examinable fixtures and a judge who patrols dry ground', () => {
  const judge = npc((n) => !!n.dogSurfJudge);
  const route = requiredFixture(judge.roam);
  assert.ok(route.points.length >= 3);
  assert.ok(route.points.every(({ x, y }) => geometry.landClearAt(x, y)));
  const initial = { x: judge.x, z: judge.z };
  tick(6);
  assert.ok(Math.hypot(judge.x - initial.x, judge.z - initial.z) > 0.1);
  assert.ok(geometry.landClearAt(judge.x - 0.5, judge.z - 0.5));
  for (const id of ['pacifica-dog-surfing', 'pacifica-dog-surf-trophies']) {
    const sight = requiredFixture(geometry.sights.find((s) => s.id === id));
    assert.ok(sight.description && sight.object?.sight === sight);
    assert.ok(geometry.landClearAt(sight.entry.x, sight.entry.y));
  }
});

test('Stochastic Parrot requires the grove, supports bait, and pays each buyer price only once', async () => {
  const scientist = npc((n) => n.id === PARROT_SCIENTIST);
  const bird = geometry.parrots[0];
  const mathematician = npc((n) => n.id === 'berkeley-mathematician');
  assert.ok(mathematician.roam?.points.length);
  const initial = { x: mathematician.x, z: mathematician.z };
  tick(5);
  assert.ok(Math.hypot(mathematician.x - initial.x, mathematician.z - initial.z) > 0.05);
  for (const [buyerId, price] of Object.entries(PROOF_BUYERS)) {
    const a = await visitor();
    const quest = (step: string, args = {}) =>
      act(a, 'playerAction', { verb: 'stochasticParrot', step, ...args });
    try {
      assert.equal((await quest('start')).ok, false);
      atNPC(a, scientist);
      assert.equal((await quest('start')).ok, true);
      assert.equal((await quest('catch', { id: bird.id })).ok, false);
      assert.equal((await quest('deliver')).ok, false);
      stand(a, requiredFixture(bird.approach));
      assert.equal((await quest('catch', { id: 'unknown-parrot' })).ok, false);
      assert.equal((await quest('catch', { id: bird.id, sandwich: true })).ok, false);
      assert.equal(a.p.inventory.receive({ lootKind: 'sandwich', amount: 1 }).ok, true);
      const sandwich = buyerId !== 'city-hall-clerk';
      assert.equal((await quest('catch', { id: bird.id, sandwich })).ok, true);
      assert.equal(a.p.inventory.meta.sandwiches, sandwich ? 0 : 1);
      assert.equal((await quest('catch', { id: bird.id, sandwich })).ok, false);
      assert.equal((await quest('deliver')).ok, false);
      atNPC(a, scientist);
      assert.equal((await quest('deliver')).ok, true);
      assert.equal(a.p.profile.playerState.quests.stochasticParrot.stage, 'proof');
      assert.ok(a.p.inventory.snapshot().collection.includes('collatz-proof'));
      assert.equal((await quest('sell', { id: buyerId })).ok, false);
      const buyer = npc((n) => n.id === buyerId);
      atNPC(a, buyer);
      const before = a.p.inventory.economy.state.coins;
      const pages =
        buyerId === 'berkeley-mathematician'
          ? ['Show the Collatz proof', ...Array.from({ length: 4 }, () => 'Keep listening')]
          : ['Offer the Collatz proof'];
      await choose(
        a,
        {
          ...buyer,
          intro: 'What have you brought me?',
          choices: [proofBuyerChoice(buyerId, () => quest('sell', { id: buyerId }))],
        },
        [...pages, 'Sell the proof for ' + price + (price === 1 ? ' coin' : ' coins')],
      );
      assert.equal(a.p.inventory.economy.state.coins, before + price);
      assert.equal(a.p.profile.playerState.quests.stochasticParrot.stage, 'sold');
      assert.equal((await quest('sell', { id: buyerId })).ok, false);
      assert.equal(a.p.inventory.economy.state.coins, before + price);
    } finally {
      stop(a);
    }
  }
});

test('Burning Man requires water, a DJ and a rocket lit on the straw before awarding wearable boots', async () => {
  const a = await visitor();
  const party = () => a.p.profile.playerState.quests.burningMan;
  const matilda = npc((actor) => actor.id === BURNING_MAN.matilda);
  const dj = npc((actor) => actor.id === BURNING_MAN.dj);
  const clerk = npc((actor) => actor.id === BURNING_MAN.waterClerk);
  const step = (step: BurningManAction) => act(a, 'playerAction', { verb: 'burningMan', step });
  const light = () => act(a, 'lightDecorativeRocket');
  const straw = BURNING_MAN.straw.map(([x, z]) => {
    const at = geometry.esotericCampus.point(BURNING_MAN.u + x, BURNING_MAN.v + z);
    return { x: at.x - 0.5, y: at.z - 0.5 };
  });
  try {
    assert.ok(straw.every(({ x, y }) => geometry.landClearAt(x, y)));
    assert.equal((await step('start')).ok, false);
    atNPC(a, matilda);
    await choose(a, burningManDialogue(matilda, party().stage, step), [
      'Why are you so thirsty?',
      'Why don’t you have any water?',
      'Why didn’t you buy any water at the store nearby?',
      'I’ll get you some water',
    ]);
    assert.equal(party().stage, 'fetch-water');
    assert.equal((await step('water')).ok, false);
    atNPC(a, clerk);
    assert.equal((await step('water')).ok, true);
    assert.equal(party().stage, 'has-water');
    assert.equal((await step('water')).ok, false);
    atNPC(a, matilda);
    assert.equal((await step('deliver-water')).ok, true);
    assert.equal(party().stage, 'find-dj');
    assert.equal((await step('invite')).ok, false);
    atNPC(a, dj);
    await choose(a, burningManDialogue(dj, party().stage, step), [
      'There’s a giant wicker man and nobody brought music.',
      'Invite the DJ to Matilda’s party',
    ]);
    assert.equal(party().stage, 'dj-agreed');
    atNPC(a, matilda);
    assert.equal((await step('report')).ok, true);
    assert.equal(party().stage, 'ready');
    assert.equal((await step('reward')).ok, false);
    stand(a, straw[0]);
    assert.equal((await light()).ok, false);
    const wardrobe = requiredFixture(
      geometry.searchSites.find((site) => site.id === 'house-search-6'),
    );
    stand(a, wardrobe.entry);
    assert.equal((await act(a, 'searchHouse', { id: wardrobe.id })).ok, true);
    assert.equal(
      (await act(a, 'equipAppearance', { look: { back: 'new-year-rocket', boots: 'party-boots' } }))
        .ok,
      true,
    );
    assert.equal(a.p.appearance.boots, false);
    atNPC(a, matilda);
    assert.equal((await light()).ok, true);
    assert.equal(party().stage, 'ready', 'lighting off the straw only lights the rocket');
    time += SEARCH_ROCKET.cooldownMs + 1;
    stand(a, straw[0]);
    assert.equal((await light()).ok, true);
    assert.deepEqual(party(), { stage: 'burned', burnAt: time });
    atNPC(a, matilda);
    assert.equal((await step('reward')).ok, false);
    time += BURNING_MAN.burnMs;
    assert.equal((await step('reward')).ok, true);
    assert.equal((await step('reward')).ok, false);
    assert.equal(party().stage, 'completed');
    assert.equal(
      a.p.inventory.economy.state.ownedEquipment.filter((id) => id === 'party-boots').length,
      1,
    );
    assert.ok(a.p.inventory.snapshot().collection.includes('party-boots'));
    assert.equal((await act(a, 'equipAppearance', { look: { boots: 'party-boots' } })).ok, true);
    assert.equal(a.p.appearance.boots, 'party-boots');
  } finally {
    stop(a);
  }
});

test('the mud bath pays only seated bathers and the chief engineer exchanges mud for stackable fish', async () => {
  const accountId = ++serial;
  let a = await player(game, accountId);
  const { p } = a;
  const purse = p.inventory.economy.state;
  const engineer = npc((n) => n.id === GOBLIN_SPACE_PROGRAM.engineer.id);
  const soak = () => act(a, 'activity', { mode: 'sit', mudBath: true });
  const standUp = () => act(a, 'activity', { mode: 'walk' });
  const trade = () => act(a, 'playerAction', { verb: 'tradeMud' });
  try {
    assert.ok(geometry.sights.some((sight) => sight.id === GOBLIN_SPACE_PROGRAM.id));
    assert.ok(geometry.landClearAt(MUD_BATH.entry.x, MUD_BATH.entry.y));
    assert.equal((await soak()).ok, false);
    stand(a, MUD_BATH.entry);
    assert.equal((await act(a, 'activity', { mode: 'sit' })).ok, true);
    tick(5);
    assert.equal(purse.mud, 0, 'ordinary sitting does not collect mud');
    assert.equal((await standUp()).ok, true);
    p.moving = true;
    assert.equal((await soak()).ok, true);
    assert.equal(p.mode, 'sit');
    assert.equal(p.moving, false);
    tick(4.95);
    assert.equal(purse.mud, 0);
    tick(0.05);
    assert.equal(purse.mud, 1);
    tick(10);
    assert.equal(purse.mud, 3);
    assert.ok(p.profile.collection.includes('mud'));
    assert.equal((await standUp()).ok, true);
    tick(6);
    assert.equal(purse.mud, 3);
    assert.equal((await trade()).ok, false, 'the engineer must be nearby');
    atNPC(a, engineer);
    for (let i = 1; i <= 3; i++) {
      const tradeResult = await trade();
      assert.equal(tradeResult.ok, true);
      assert.equal(purse.mud, 3 - i);
      assert.equal(purse.fish, i * 5);
    }
    assert.equal((await trade()).ok, false);
    assert.equal(purse.fish, 15);
    assert.equal(JSON.parse(p.profile.privateState['sf-purse-v1']!).fish, 15);

    const wharf = requiredFixture(geometry.fishingSite).entry;
    const cast = () => act(a, 'playerAction', { verb: 'fish' });
    stand(a, wharf);
    assert.equal((await cast()).ok, true);
    tick(FISHING_DURATION);
    assert.equal(purse.fish, 16);
    assert.equal(JSON.parse(p.profile.privateState['sf-purse-v1']!).fish, 16);
    assert.match((await cast()).message || '', /again in 60s/);

    await game.disconnect(a.p);
    a = await player(game, accountId);
    stand(a, wharf);
    time += FISHING_COOLDOWN_MS - 1;
    assert.equal((await cast()).ok, false);
    time++;
    assert.equal((await cast()).ok, true);
    tick(FISHING_DURATION);
    assert.equal(a.p.inventory.economy.state.fish, 17);
  } finally {
    stop(a);
  }
});

test('the chief engineer awards the Goose Corp T-shirt only after 100 more mud', async () => {
  const a = await visitor();
  const purse = a.p.inventory.economy.state;
  const progress = () => a.p.profile.playerState.progress.goblinSpaceMud;
  const trade = (all = false) => act(a, 'playerAction', { verb: 'tradeMud', all });
  try {
    for (const id of [VILLAGE_GOOSE.id, VILLAGE_POSTERS.id]) {
      const site = requiredFixture(geometry.sights.find((sight) => sight.id === id));
      assert.ok(geometry.landClearAt(site.entry.x, site.entry.y));
    }
    purse.mud = 101;
    assert.equal((await trade(true)).ok, false);
    atNPC(
      a,
      npc((n) => n.id === GOBLIN_SPACE_PROGRAM.engineer.id),
    );
    assert.match((await trade(true)).message ?? '', /bring me more mud anytime/);
    assert.equal(progress(), 1);
    assert.equal(purse.mud, 100);
    assert.equal(purse.fish, 5);
    purse.mud = 99;
    assert.equal((await trade(true)).ok, true);
    assert.equal(progress(), 100);
    assert.equal(purse.fish, 500);
    assert.ok(!purse.ownedEquipment.includes(GOOSE_CORP_SHIRT));
    purse.mud = 1;
    assert.match((await trade()).message ?? '', /Goose Corp T-shirt/);
    assert.equal(progress(), 101);
    assert.equal(purse.fish, 505);
    assert.ok(purse.ownedEquipment.includes(GOOSE_CORP_SHIRT));
    assert.ok(a.p.inventory.snapshot().collection.includes(GOOSE_CORP_SHIRT));
    assert.equal((await act(a, 'equipAppearance', { look: { torso: GOOSE_CORP_SHIRT } })).ok, true);
    assert.equal(a.p.appearance.torso, GOOSE_CORP_SHIRT);
    purse.ownedEquipment.splice(purse.ownedEquipment.indexOf(GOOSE_CORP_SHIRT), 1);
    purse.mud = 100;
    assert.equal((await trade(true)).ok, true);
    assert.ok(!purse.ownedEquipment.includes(GOOSE_CORP_SHIRT));
    assert.equal(progress(), 101);
    assert.equal(purse.fish, 1005);
  } finally {
    stop(a);
  }
});

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
  const parked = requiredFixture(geometry.sights.find((s) => s.id === ATV_RENTAL.siteId));
  const rent = (minutes: number) => act(a, 'travel', { kind: 'atvRent', minutes });
  const mount = () => act(a, 'travel', { kind: 'atvMount' });
  const atCounter = () => stand(a, { x: ATV_RENTAL.npc.x - 0.5, y: ATV_RENTAL.npc.z - 0.5 });
  try {
    assert.equal((await rent(1)).ok, false);
    stand(a, parked.entry);
    assert.equal((await mount()).ok, false);
    atCounter();
    assert.equal((await rent(1)).ok, true);
    assert.equal(a.p.mode, 'walk');
    assert.equal(a.p.x, ATV_RENTAL.npc.x);
    assert.equal(a.p.inventory.economy.state.coins, 999950);
    assert.equal(a.p.profile.playerState.activities.atvRentalUntil, time + 60_000);
    assert.partialDeepStrictEqual(game.personal.components(a.p).get('travel')?.value, {
      atvRentalUntil: time + 60_000,
    });
    assert.equal((await mount()).ok, false);
    assert.equal((await rent(1)).ok, false);
    assert.ok(geometry.landClearAt(parked.entry.x, parked.entry.y));
    assert.equal(
      (await act(a, 'moveTo', { x: parked.entry.x + 0.5, z: parked.entry.y + 0.5 })).ok,
      true,
    );
    for (let i = 0; i < 100 && a.p.moving; i++) tick(0.05);
    assert.equal((await mount()).ok, true);
    assert.equal(a.p.mode, 'atv');
    assert.equal(a.p.x, ATV_RENTAL.parking.x);
    assert.equal((await act(a, 'travel', { kind: 'atvTrick', trick: 'roll' })).ok, false);
    const x = a.p.x;
    assert.equal((await act(a, 'moveTo', { x: x + 1.5, z: a.p.z })).ok, true);
    tick(0.1);
    assert.ok(Math.abs(a.p.x - x - ATV_SPEED * 0.1) < 1e-7, 'ATV uses exactly 150% of walk speed');
    const beforeDonut = { x: a.p.x, z: a.p.z };
    assert.equal((await act(a, 'travel', { kind: 'atvDonut' })).ok, true);
    tick(0.55);
    assert.equal(a.p.gesture, 'atv-donut');
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
    tick(0.05);
    assert.equal(a.p.gesture, 'atv-air');
    assert.equal((await act(a, 'travel', { kind: 'atvTrick', trick: 'roll' })).ok, true);
    tick(0.15);
    assert.equal(a.p.gesture, 'atv-trick');
    assert.ok(a.p.phase > 0.5, 'an air roll changes the replicated ATV pose');
    tick(1.2);
    assert.equal(game.movement.state(a.p).atv?.air, null);
    time += 60_000;
    tick(0.05);
    assert.equal(a.p.mode, 'walk');
    stand(a, parked.entry);
    assert.equal((await mount()).ok, false);
    atCounter();
    assert.equal((await rent(10)).ok, true);
    assert.equal(a.p.mode, 'walk');
    assert.equal(a.p.inventory.economy.state.coins, 999450);
    assert.equal(a.p.profile.playerState.activities.atvRentalUntil, time + 600_000);
  } finally {
    stop(a);
  }
});

test('motorcycle tricks require a mounted rider, finish on a timer, and clear on parking', async () => {
  const a = await visitor();
  const perform = (trick: string) => act(a, 'travel', { kind: 'motorcycleTrick', trick });
  try {
    assert.equal((await perform(MOTORCYCLE_TRICKS[0].id)).ok, false);
    atNPC(
      a,
      npc((n) => n.kind === 'motorcycle-clerk'),
    );
    assert.equal((await act(a, 'playerAction', { verb: 'rentMotorcycle' })).ok, true);
    stand(a, geometry.motorcycle.home);
    assert.equal((await act(a, 'activity', { mode: 'motorcycle' })).ok, true);
    assert.equal((await perform('unknown')).ok, false);
    for (const { id, duration } of MOTORCYCLE_TRICKS) {
      assert.equal((await perform(id)).ok, true);
      assert.equal(a.p.gesture, id);
      assert.equal((await perform(id)).ok, false);
      tick(duration + 0.01);
      assert.equal(a.p.mode, 'motorcycle');
      assert.equal(a.p.gesture, '');
    }
    assert.equal((await perform(MOTORCYCLE_TRICKS[0].id)).ok, true);
    assert.equal((await act(a, 'activity', { mode: 'walk' })).ok, true);
    assert.equal(a.p.gesture, '');
    assert.equal((await perform(MOTORCYCLE_TRICKS[0].id)).ok, false);
  } finally {
    stop(a);
  }
});

test('tree and park swings animate independently and free their seats on exit or walking away', async () => {
  const tree = requiredFixture(geometry.sights.find((s) => s.id === 'tree-swing'));
  const west = requiredFixture(geometry.sights.find((s) => s.id === 'park-swing-west'));
  const east = requiredFixture(geometry.sights.find((s) => s.id === 'park-swing-east'));
  const a = await visitor(),
    b = await visitor();
  const board = (rider: TestPlayer, id: string) => act(rider, 'travel', { kind: 'swingBoard', id });
  const exit = (rider: TestPlayer) => act(rider, 'travel', { kind: 'swingExit' });
  const occupiedSeat = (rider: TestPlayer) => rider.p.seat?.id;
  try {
    assert.equal((await board(a, tree.id)).ok, false);
    stand(a, tree.entry);
    stand(b, tree.entry);
    assert.equal((await board(a, tree.id)).ok, true);
    assert.equal(a.p.mode, 'swing');
    assert.equal(a.p.x, 45.5);
    assert.equal(a.p.z, 79.5);
    assert.equal((await board(b, tree.id)).ok, false);
    tick(0.65);
    assert.ok(a.p.phase > 0.2);
    tick(1.35);
    assert.ok(a.p.phase < -0.4);
    assert.equal((await exit(a)).ok, true);
    assert.equal(a.p.mode, 'walk');
    assert.equal(a.p.seat, null);
    assert.equal(a.p.z, tree.entry.y + 0.5);
    assert.equal((await board(b, tree.id)).ok, true);
    assert.equal(
      (await act(b, 'moveTo', { x: tree.entry.x + 0.5, z: tree.entry.y + 0.5 })).ok,
      true,
    );
    assert.equal(b.p.mode, 'walk');
    assert.equal(b.p.seat, null);

    stand(a, west.entry);
    stand(b, east.entry);
    assert.equal((await board(a, west.id)).ok, true);
    assert.equal((await board(b, east.id)).ok, true);
    assert.equal(occupiedSeat(a), west.id);
    assert.equal(occupiedSeat(b), east.id);
    const saved = game.movement.savePosition(b.p, b.p);
    assert.equal(saved.x, east.entry.x + 0.5);
    assert.equal(saved.z, east.entry.y + 0.5);
    assert.equal(saved.y, geometry.characterGround(saved.x, saved.z));
  } finally {
    stop(a);
    stop(b);
  }
});

test('the Goblin Founder hands out a fish for 10 coins which conveys no startup equity', async () => {
  const a = await visitor();
  const founder = npc((n) => n.id === GOBLIN_INCUBATOR.founder.id);
  const cityFounder = npc((n) => n.id === 'founder-merchant');
  const incubator = requiredFixture(geometry.sights.find((s) => s.id === GOBLIN_INCUBATOR.id));
  const buy = () => act(a, 'inventory', { op: 'trade', kind: 'equity' });
  const purse = a.p.inventory.economy.state;
  try {
    assert.equal(founder.roam, undefined);
    assert.ok(incubator.entry.y > FURNITURE_FACTORY.z);
    assert.ok(geometry.landClearAt(incubator.entry.x, incubator.entry.y));
    assert.equal((await buy()).ok, false);
    atNPC(a, founder);
    purse.coins = 9;
    assert.equal((await buy()).ok, false);
    assert.equal(purse.coins, 9);
    assert.equal(purse.equity, 0);
    purse.coins = 10;
    const result = await choose(a, configuredDialogue('founder', founder), [
      'Buy one share · 10 coins',
    ]);
    assert.equal(result.result?.ok, true);
    assert.equal(purse.coins, 0);
    assert.equal(purse.equity, 0);
    assert.equal(purse.fish, 1);
    purse.coins = 10;
    assert.equal((await buy()).ok, true);
    assert.equal(purse.coins, 0);
    assert.equal(purse.equity, 0);
    assert.equal(purse.fish, 2);
    assert.equal((await act(a, 'inventory', { op: 'trade', kind: 'secondary' })).ok, false);
    atNPC(a, cityFounder);
    purse.coins = 10;
    await choose(a, configuredDialogue('founder', cityFounder), ['Buy one share · 10 coins']);
    assert.equal(purse.coins, 0);
    assert.equal(purse.equity, 1);
  } finally {
    stop(a);
  }
});

test('a 12-coin Waymo drives from dispatch, then runs at triple walk speed for one minute', async () => {
  const a = await visitor({ x: 86.5, y: 76.5 });
  const travel = (kind: string) => act(a, 'travel', { kind });
  const movement = game.movement.state(a.p);
  try {
    assert.equal((await travel('waymoCall')).ok, true);
    assert.equal(a.p.inventory.economy.state.coins, 999988);
    const cab = requiredFixture(movement.waymo);
    assert.deepEqual({ x: cab.x, z: cab.z }, WAYMO_RENTAL.dispatch);
    assert.equal(cab.phase, 'dispatch');
    assert.equal((await travel('waymoBoard')).ok, false);
    assert.equal((await travel('waymoCall')).ok, false);
    tick(0.05);
    assert.ok(Math.hypot(cab.x - WAYMO_RENTAL.dispatch.x, cab.z - WAYMO_RENTAL.dispatch.z) > 0);
    stand(a, { x: 86.5, y: 74.5 });
    for (let i = 0; i < 80 && cab.phase === 'dispatch'; i++) tick(0.05);
    assert.equal(cab.phase, 'parked');
    assert.ok(Math.hypot(cab.x - a.p.x, cab.z - a.p.z) < 0.1);
    assert.equal(cab.expiresAt, time + 60_000);
    assert.equal((await travel('waymoBoard')).ok, true);
    const start = { x: a.p.x, z: a.p.z };
    assert.equal(a.p.mode, 'waymo');
    assert.equal((await act(a, 'moveTo', { x: start.x, z: start.z - 1 })).ok, true);
    tick(0.05);
    assert.ok(
      Math.abs(Math.hypot(a.p.x - start.x, a.p.z - start.z) - WAYMO_RENTAL.speed * 0.05) < 1e-7,
    );
    assert.equal((await travel('waymoExit')).ok, true);
    assert.equal(cab.phase, 'parked');
    assert.equal((await travel('waymoBoard')).ok, true);
    time = cab.expiresAt;
    tick(0.05);
    assert.equal(a.p.mode, 'walk');
    assert.equal(movement.waymo, undefined);
  } finally {
    stop(a);
  }
});

test('Point Reyes urchins are level 28 and Rich Table buys their rare Uni', async () => {
  const pointReyes = requiredFixture(geometry.sights.find((s) => s.id === POINT_REYES.id));
  assert.ok(geometry.pathTo(pointReyes.entry.x, pointReyes.entry.y, geometry.spawn)?.length);
  const urchins = POINT_REYES_URCHINS.map(({ id }) =>
    requiredFixture(game.shared.wilderness.actors.find((actor) => actor.id === id)),
  );
  const attackSpot = (actor: (typeof urchins)[number]) => ({
    x: actor.x + 0.65 - 0.5,
    y: actor.z - 0.5,
  });
  for (const actor of urchins) {
    const spot = attackSpot(actor);
    assert.equal(actor.level, 28);
    assert.ok(geometry.pathTo(spot.x, spot.y, pointReyes.entry)?.length);
  }
  assert.equal(rollMonsterDrops('sea-urchin', () => 0)[1].lootKind, 'uni');
  for (const [roll, kind] of [
    [0.2, 'coins'],
    [0.99, 'sandwich'],
  ] as const) {
    const drops = rollMonsterDrops('sea-urchin', () => roll);
    assert.deepEqual(
      drops.map((drop) => [drop.lootKind, drop.amount]),
      [[kind, 3]],
    );
  }

  const target = urchins[0];
  const a = await visitor(attackSpot(target));
  try {
    assert.equal((await act(a, 'attack', { id: target.id, weapon: 'unarmed' })).ok, true);
    assert.ok(target.hp < target.max);
    assert.equal(target.enemy, a.p.id);
    const before = a.p.hp;
    tick(0.65);
    assert.ok(a.p.hp < before);
    const sale = () => act(a, 'inventory', { op: 'trade', kind: 'sell-uni' });
    assert.equal(a.p.inventory.receive({ lootKind: 'uni', amount: 2 }).ok, true);
    assert.equal((await sale()).ok, false);
    const richTable = requiredFixture(geometry.sights.find((site) => site.id === 'rich-table'));
    Object.assign(a.p, { x: richTable.entry.x + 0.5, z: richTable.entry.y + 0.5 });
    const coins = a.p.inventory.economy.state.coins;
    assert.equal((await sale()).ok, true);
    assert.equal(a.p.inventory.snapshot().uni, 1);
    assert.equal(a.p.inventory.economy.state.coins, coins + 40);
  } finally {
    stop(a);
  }
});

test('Girard’s backyard goat returns half damage from every hit and drops only coins', async () => {
  const house = requiredFixture(geometry.sights.find((s) => s.id === GIRARD_HOME.id));
  const entry = requiredFixture(house.entry);
  const girard = npc((n) => n.id === GIRARD_HOME.resident.id);
  const goat = requiredFixture(game.shared.wilderness.actors.find((n) => n.id === SCAPEGOAT.id));
  const fightSpot = { x: goat.x + 0.53 - 0.5, y: goat.z - 0.5 };
  assert.ok(geometry.pathTo(entry.x, entry.y, geometry.spawn)?.length);
  assert.ok(geometry.pathTo(fightSpot.x, fightSpot.y, entry)?.length);
  assert.equal(npcOffersAttack(girard), false);
  assert.equal(goat.hp, 100);
  const a = await visitor(fightSpot);
  try {
    const attack = () => act(a, 'attack', { id: goat.id, weapon: 'unarmed' });
    const before = a.p.hp;
    assert.equal((await attack()).ok, true);
    assert.equal(goat.hp, 98);
    assert.equal(a.p.hp, before - 1);
    assert.equal(goat.enemy, null);
    await act(a, 'stopAttack');
    tick(2.1);
    assert.equal(a.p.hp, before - 1, 'the goat has no attack between hits');

    goat.hp = 1;
    stand(a, { x: goat.x + 0.53 - 0.5, y: goat.z - 0.5 });
    const oldLoot = new Set(game.shared.loot.keys());
    assert.equal((await attack()).ok, true);
    assert.equal(goat.hp, 0);
    assert.equal(a.p.hp, before - 2, 'the fatal hit also reflects damage, rounded up');
    assert.deepEqual(
      [...game.shared.loot.values()]
        .filter((item) => !oldLoot.has(item.id))
        .map((item) => ({ kind: item.lootKind, amount: item.amount, owner: item.owner })),
      [{ kind: 'coins', amount: 10, owner: a.p.owner }],
    );
  } finally {
    stop(a);
  }
});

test('Tyler’s 10-coin pass opens the Fighter Yard and its non-aggressive Fighters drop coins', async () => {
  const a = await visitor();
  const purse = a.p.inventory.economy.state;
  const tyler = npc((n) => n.id === FIGHTER_YARD.tyler.id);
  const fighters = game.shared.wilderness.actors.filter((n) => isYardFighter(n.combatKind));
  const fighter = requiredFixture(fighters.find((n) => n.level === 3));
  const admission = () => act(a, 'inventory', { op: 'trade', kind: 'fighter-yard-admission' });
  const enter = () =>
    act(a, 'moveTo', { x: FIGHTER_YARD.inside.x + 0.5, z: FIGHTER_YARD.inside.y + 0.5 });
  const attack = () => act(a, 'attack', { id: fighter.id, weapon: 'unarmed' });
  try {
    assert.deepEqual(
      fighters.map((n) => n.level),
      [...FIGHTER_LEVELS],
    );
    for (const n of fighters) {
      assert.equal(n.label, 'Fighter');
      assert.ok(
        rollMonsterDrops(n.combatKind, () => 0.999).some((drop) => drop.lootKind === 'coins'),
      );
    }
    assert.equal((await admission()).ok, false);
    atNPC(a, tyler);
    assert.equal((await enter()).ok, false);
    assert.equal((await attack()).ok, false);
    purse.coins = 9;
    assert.equal((await admission()).ok, false);
    assert.equal(purse.coins, 9);
    purse.coins = 10;
    assert.equal((await admission()).ok, true);
    assert.equal(purse.coins, 0);
    assert.ok(purse.ownedEquipment.includes(FIGHTER_YARD.pass));
    assert.equal((await admission()).ok, false);
    assert.equal((await enter()).ok, true);
    tick(1);
    assert.ok(
      Math.hypot(a.p.x - FIGHTER_YARD.inside.x - 0.5, a.p.z - FIGHTER_YARD.inside.y - 0.5) < 0.12,
    );
    assert.ok(fighters.every((n) => n.enemy === null));
    assert.equal((await attack()).ok, true);
    assert.equal(fighter.enemy, a.p.id);
    assert.ok(fighters.filter((n) => n !== fighter).every((n) => n.enemy === null));
  } finally {
    stop(a);
  }
});

test('the clay phone trades for 10 and 35 coins and each 10-coin robe piece equips separately', async () => {
  const a = await visitor();
  const purse = a.p.inventory.economy.state;
  const trade = (kind: string) => act(a, 'inventory', { op: 'trade', kind });
  try {
    assert.equal((await trade('goblin-phone')).ok, false);
    assert.equal((await trade('decorative-robe-top')).ok, false);
    assert.equal((await trade('cashmere-turtleneck')).ok, false);
    atNPC(
      a,
      npc((n) => n.id === GOBLIN_INDUSTRIALIST.id),
    );
    const purchase = await trade('goblin-phone');
    assert.equal(purchase.ok, true);
    assert.match(purchase.message || '', /good notepad/);
    assert.equal(purse.coins, 999990);
    assert.equal((await trade('goblin-phone-sale')).ok, false);
    atNPC(
      a,
      npc((n) => n.id === GOBLIN_PHONE_BUYER),
    );
    assert.equal((await trade('goblin-phone-sale')).ok, true);
    assert.equal(purse.coins, 1000025);
    assert.equal((await trade('goblin-phone-sale')).ok, false);
    atNPC(
      a,
      npc((n) => n.id === ROBE_SELLER),
    );
    assert.equal((await trade('decorative-robe-top')).ok, true);
    assert.equal(purse.coins, 1000015);
    await act(a, 'equipAppearance', {
      look: { torso: 'decorative-robe-top', legs: 'decorative-robe-bottom' },
    });
    assert.equal(a.p.appearance.torso, 'decorative-robe-top');
    assert.equal(a.p.appearance.legs, 'trousers');
    assert.equal((await trade('decorative-robe-bottom')).ok, true);
    assert.equal(purse.coins, 1000005);
    await act(a, 'equipAppearance', {
      look: { torso: 'decorative-robe-top', legs: 'decorative-robe-bottom' },
    });
    assert.equal(a.p.appearance.legs, 'decorative-robe-bottom');
    assert.equal((await trade('cashmere-turtleneck')).ok, true);
    assert.equal(purse.coins, 999505);
    assert.equal(
      (await act(a, 'equipAppearance', { look: { torso: 'cashmere-turtleneck' } })).ok,
      true,
    );
    assert.equal(a.p.appearance.torso, 'cashmere-turtleneck');
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
    ['trade', 'duel', 'follow', 'unfollow', 'attack', 'walk'],
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
    assert.ok(a.p.inventory.snapshot().purse.ownedEquipment.includes('bayonet'));
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
    await choose(
      a,
      scientistDialogue(scientist, expeditions),
      ['Do you have a quest for me?', 'I’ll recover the raptor.'],
      { message: /Railgun issued/ },
    );
    assert.equal(r.expeditions.state.railgun, true);
    assert.ok(a.p.inventory.snapshot().purse.ownedEquipment.includes('railgun'));
    assert.equal(a.p.appearance.weapon, 'unarmed');
    assert.equal(a.p.inventory.meta.railgunCharge, 25);
    Object.assign(expeditions.state, r.expeditions.state);
    await choose(a, scientistDialogue(scientist, expeditions), ['Check the cage'], {
      message: /already out/,
    });
    const target = game.shared.raptor;
    assert.equal(target.hp, 72);
    const blocked = await act(a, 'attack', { id: game.shared.cows[0].id, weapon: 'railgun' });
    assert.equal(blocked.ok, false);
    assert.match(blocked.message || '', /on loan.*Switch weapons/);
    assert.equal(a.p.inventory.meta.railgunCharge, 25);
    tick(3);
    assert.equal(target.phase, 'loose');
    assert.ok(target.z > 100);
    Object.assign(target, { hp: 12, x: a.p.x + 0.5, z: a.p.z, path: [], prey: null, repath: 2 });
    assert.equal(
      requiredFixture(await act(a, 'attack', { id: target.id, weapon: 'railgun' })).ok,
      true,
    );
    assert.equal(target.hp, 2);
    assert.equal(a.p.inventory.meta.railgunCharge, 24);
    assert.equal(r.expeditions.state.raptorDefeated, false);
    tick(0.85);
    assert.equal(r.expeditions.state.raptorDefeated, true);
    assert.equal(a.p.inventory.meta.railgunCharge, 23);
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

test('the Bolinas Cultist attacks after Talk and their cottage wardrobe grants the Goose Costume once', async () => {
  const a = await visitor();
  try {
    const cultist = requiredFixture(
      game.shared.wilderness.actors.find((n) => n.id === 'bolinas-cultist'),
    );
    assert.equal(cultist.level, 6);
    assert.ok(npcContextActions(cultist).includes('talk'));
    const talk = () => act(a, 'talkCultist', { id: cultist.id });
    assert.equal((await talk()).ok, false);
    stand(a, { x: cultist.x - 0.5, y: cultist.z });
    const answer = await talk();
    assert.equal(answer.ok, true);
    assert.match(answer.message || '', /nothing to tell you/);
    assert.equal(cultist.enemy, a.p.id);
    tick(0.8);
    assert.ok(a.p.hp < a.p.max);

    const cottage = requiredFixture(
      geometry.places.find((p) => p.id === 'bolinas-cultist-cottage'),
    );
    const wardrobe = requiredFixture(geometry.searchSites.find((s) => s.houseId === cottage.id));
    const search = () => act(a, 'searchHouse', { id: wardrobe.id });
    stand(a, cottage.entry);
    assert.equal((await search()).ok, false);
    assert.ok(geometry.pathTo(wardrobe.entry.x, wardrobe.entry.y, cottage.entry)?.length);
    stand(a, wardrobe.entry);
    assert.equal((await search()).ok, true);
    assert.ok(a.p.inventory.economy.state.ownedEquipment.includes('goose-costume'));
    assert.equal((await search()).ok, false);
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
      const start = { x: a.p.x - 0.5, y: a.p.z - 0.5 };
      stand(a, { x: start.x + 6, y: start.y });
      const distant = await act(a, 'kickTaxi', { id: car.id });
      assert.equal(distant.ok, false);
      assert.equal(distant.retryApproach, true);
      assert.ok(!game.shared.wilderness.actors.some((n) => n.dispatchedFor === a.p.id));
      stand(a, start);
      const result = await act(a, 'kickTaxi', { id: car.id });
      assert.equal(result.ok, true, result.message);
      const responder = requiredFixture(
        game.shared.wilderness.actors.find((n) => n.dispatchedFor === a.p.id),
      );
      assert.equal(responder.level, 5);
      assert.equal(responder.enemy, a.p.id);
      const duplicate = await act(a, 'kickTaxi', { id: car.id });
      assert.equal(duplicate.ok, false);
      assert.equal(duplicate.retryApproach, undefined);
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

test('SF Fitness retains the cumulative session limit and cooldown when reconnecting', async () => {
  const { SF_FITNESS } = await import('../../src/fitness-layout.ts');
  const account = ++serial;
  const start = (a: TestPlayer) => act(a, 'playerAction', { verb: 'train', exercise: 'bench' });
  let a = await player(game, account, {
    'sf-strength-v1': JSON.stringify({ xp: requiredFixture(SKILL_THRESHOLDS.at(-1)) - 20 }),
  });
  stand(a, SF_FITNESS.entry);
  a.p.profile.playerState.activities.gym.workedSeconds = 1799;
  assert.equal((await start(a)).ok, true);
  time += 1_000;
  game.personal.tick(1);
  assert.equal(a.p.training, false);
  const ready = a.p.profile.playerState.activities.gym.readyAt;
  assert.equal(ready - time, 3_600_000);
  assert.match((await start(a)).message || '', /60/);
  await game.disconnect(a.p);
  a = await player(game, account);
  stand(a, SF_FITNESS.entry);
  assert.equal((await start(a)).ok, false);
  time = ready;
  assert.equal((await start(a)).ok, true);
  game.personal.tick(1);
  assert.equal(a.p.training, false, 'training stops at the Strength cap');
  assert.equal(a.p.level, 25);
  await game.disconnect(a.p);
});

test('the industrialist sells iron armor and a trimming kit upgrades the equipped piece once', async () => {
  const a = await visitor();
  try {
    const buy = () => act(a, 'inventory', { op: 'trade', kind: 'iron-armor' });
    assert.equal((await buy()).ok, false);
    atNPC(
      a,
      npc((n) => n.id === 'enterprising-industrialist'),
    );
    assert.equal((await buy()).ok, true);
    a.p.appearance.torso = 'iron-armor';
    const trim = () => act(a, 'inventory', { op: 'trimArmor' });
    assert.equal((await trim()).ok, false);
    assert.equal(a.p.inventory.receive({ lootKind: 'armor-trimming-kit', amount: 1 }).ok, true);
    assert.equal((await trim()).ok, true);
    assert.equal(a.p.inventory.meta.armorTrimmingKits, 0);
    assert.equal(a.p.appearance.torso, 'gold-trimmed-iron-armor');
    assert.equal((await trim()).ok, false);
  } finally {
    stop(a);
  }
});

test('the entrepreneur keeps exactly the coins handed over with no investment position', async () => {
  const a = await visitor();
  const fund = (amount: number) => act(a, 'inventory', { op: 'fundBiomed', amount });
  const purse = a.p.inventory.economy.state;
  try {
    assert.equal((await fund(123)).ok, false);
    atNPC(
      a,
      npc((n) => n.id === 'biomed-entrepreneur'),
    );
    const before = purse.coins;
    assert.equal((await fund(-1)).ok, false);
    assert.equal((await fund(1.25)).ok, false);
    assert.equal((await fund(before + 1)).ok, false);
    assert.equal((await fund(123)).ok, true);
    assert.equal(purse.coins, before - 123);
    assert.equal(purse.equity, 0);
  } finally {
    stop(a);
  }
});

test('a Bind Tablet consumes one item, costs 10 hitpoints and blocks neighboring PvP movement for ten seconds', async () => {
  const a = await visitor(),
    b = await visitor(),
    spectator = await visitor(),
    outside = await visitor();
  const base = geometry.spawn;
  try {
    const activate = () => act(a, 'breakBind');
    assert.equal(a.p.inventory.receive({ lootKind: 'bind-tablet', amount: 1 }).ok, true);
    assert.equal((await activate()).ok, false);
    for (const p of [a, b, outside]) await act(p, 'pvp', { enabled: true });
    stand(b, { x: base.x + 1, y: base.y + 1 });
    stand(outside, { x: base.x + 2, y: base.y });
    const hp = a.p.hp;
    assert.equal((await activate()).ok, true);
    assert.equal(a.p.hp, hp - 10);
    assert.equal(a.p.inventory.meta.bindTablets, 0);
    assert.equal(b.p.boundUntil, time + 10_000);
    assert.equal(spectator.p.boundUntil, undefined);
    assert.equal(outside.p.boundUntil, undefined);
    assert.ok(
      spectator.messages.some(
        (message) => !(message instanceof ArrayBuffer) && message.type === 'pvpBound',
      ),
    );
    const x = b.p.x,
      z = b.p.z;
    const move = () => act(b, 'moveTo', { x: a.p.x, z: a.p.z });
    assert.equal((await move()).ok, false);
    assert.equal(b.p.x, x);
    assert.equal(b.p.z, z);
    time += 10_000;
    assert.equal((await move()).ok, true);
  } finally {
    for (const p of [a, b, spectator, outside]) stop(p);
  }
});

test('the legacy company has a connected walk-in bug room and the trampoline bounces safely', async () => {
  const { LEGACY_SOFTWARE, legacyBugSpawns } = await import('../../src/legacy-software-layout.ts');
  const { TRAMPOLINE } = await import('../../src/backyard-details.ts');
  for (const bug of legacyBugSpawns()) {
    assert.ok(geometry.pathTo(bug.x - 0.5, bug.z - 0.5, LEGACY_SOFTWARE.entry)?.length, bug.id);
  }
  const a = await visitor({ x: TRAMPOLINE.x - 0.5, y: TRAMPOLINE.z - 0.5 });
  try {
    const { y, hp } = a.p;
    assert.equal((await act(a, 'playerAction', { verb: 'trampoline' })).ok, true);
    tick(0.6);
    assert.ok(a.p.y > y + 2);
    tick(0.8);
    assert.equal(a.p.mode, 'walk');
    assert.equal(a.p.hp, hp);
  } finally {
    stop(a);
  }
});
