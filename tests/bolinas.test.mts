import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, rayTriangleAt } from '../src/geometry.ts';
import { GOBLIN_INCUBATOR } from '../src/goblin-town.ts';
import { goblinModelVariant } from '../src/wilderness-models.ts';
import {
  BOLINAS,
  BOLINAS_COTTAGES,
  BOLINAS_PATH,
  CULTIST_COTTAGE,
  BOLINAS_CULTIST,
  EMF_DISCIPLES,
  EMF_WARRIOR,
  bolinasBlocks,
  drawBolinas,
} from '../src/bolinas.ts';
import { MARIN_OUTLINE, marinElevation } from '../src/geography.ts';
import { createMarinLand } from '../src/marin-land.ts';
import { createDetentionSite } from '../src/encounters.ts';
import {
  minimapActors,
  minimapShopMarkers,
  minimapShops,
  minimapTasks,
} from '../src/minimap-layers.ts';
import { characterAppearance, normalizeCharacter } from '../src/character-config.ts';
import { drawCharacter } from '../src/characters.ts';
import { CULTIST_HOME } from '../src/search-houses.ts';

test('Bolinas and its warrior are connected to Marin, with cottages blocking their footprints and a continuous trail', () => {
  const detention = createDetentionSite(1.5),
    gate = { x: 28, y: -2 },
    land = createMarinLand({
      polygon: MARIN_OUTLINE.map((p) => p.map((v) => v * 1.5)),
      detention,
      gate,
    });
  assert.ok(land.contains(EMF_WARRIOR.x, EMF_WARRIOR.z));
  assert.ok(land.path(gate, BOLINAS.entry, () => null));
  assert.ok(
    land.path(BOLINAS.entry, { x: EMF_WARRIOR.x - 0.5, y: EMF_WARRIOR.z - 0.5 }, () => null),
  );
  for (const h of BOLINAS_COTTAGES) {
    if (h === CULTIST_COTTAGE) continue;
    assert.equal(bolinasBlocks(h.x, h.z), true);
    assert.equal(land.contains(h.x, h.z), false);
  }
  for (const npc of [BOLINAS_CULTIST, ...EMF_DISCIPLES])
    assert.ok(land.contains(npc.x, npc.z), npc.id);
  assert.ok(land.path(CULTIST_HOME.entry, CULTIST_HOME.approach, () => null));
  for (const [x, z] of BOLINAS_PATH) assert.ok(land.onLand(x, z));
  const mesh = new Mesh();
  drawBolinas(mesh, (x, z) => marinElevation(x / 1.5, z / 1.5));
  assert.ok(mesh.data.length > 1000);
  assert.ok(mesh.data.every(Number.isFinite));
});

test('minimap layers mark sellers and task givers independently', () => {
  const citizen = { x: 1, z: 2 },
    vendor = { x: 3, z: 4, kind: 'battery-seller' },
    armorer = { x: 5, z: 6, questRole: 'armorer' },
    monster = { x: 7, z: 8, hp: 10 },
    dead = { x: 9, z: 10, hp: 0, expeditionRole: 'scientist' },
    barista = { x: 11, z: 12, neighborhoodService: 'menottis' },
    chore = { x: 13, z: 14, neighborhoodService: 'mazarine' },
    bookseller = { x: 15, z: 16, neighborhoodService: 'books' },
    scientist = { x: 17, z: 18, expeditionRole: 'scientist' },
    buyer = { x: 19, z: 20, kind: 'gpu-buyer' },
    chef = { x: 21, z: 22, kind: 'chef', id: 'cotogna-chef' };
  const actors = minimapActors({
    cityLife: { people: [citizen] },
    merchants: [vendor, armorer, barista, chore, bookseller, buyer, chef],
    wilderness: { actors: [monster, scientist, dead] },
  });
  assert.deepEqual(actors, [
    vendor,
    armorer,
    barista,
    chore,
    bookseller,
    buyer,
    chef,
    citizen,
    monster,
    scientist,
  ]);
  assert.deepEqual(minimapShops(actors), [vendor, armorer, barista, chef]);
  assert.deepEqual(minimapTasks(actors), [armorer, barista, chore, buyer, chef, scientist]);
});

test('shop markers combine sellers at a venue and include paid travel and teleport vendors', () => {
  const armorer = { id: 'industrial-armorer', questRole: 'armorer', x: 82.6, z: 77.4 },
    industrialist = {
      id: 'enterprising-industrialist',
      kind: 'enterprising-industrialist',
      x: 87,
      z: 79,
    },
    scientist = { id: 'goblin-scientist', kind: 'goblin-scientist', x: 39, z: -21 },
    crew = { kind: 'crew', siteId: 'sf-spaceport', x: 105, z: 119 },
    coffee = { kind: 'coffee-stall-vendor', x: 38.8, z: 79.9 },
    buyer = { kind: 'rich-table-chef', x: 60, z: 51 };
  const sites = [
    {
      id: 'american-industrial-center',
      entry: { x: 82.1, y: 76.9 },
      object: { x: 83, y: 75, w: 4, d: 4 },
    },
    { id: 'sf-spaceport', mapPoint: { x: 102, y: 119 }, entry: { x: 105, y: 119 } },
  ];
  const shops = minimapShops([armorer, scientist, crew, industrialist, buyer, coffee]);
  assert.deepEqual(shops, [armorer, scientist, crew, industrialist, coffee]);
  assert.deepEqual(minimapShopMarkers(shops, sites), [
    { x: 85, z: 77 },
    scientist,
    { x: 102, z: 119 },
    coffee,
  ]);
  assert.deepEqual(minimapShopMarkers(minimapShops([industrialist]), sites), [{ x: 85, z: 77 }]);
});

test('task markers include jobs, buyers, and active quest handoffs', () => {
  const matilda = { x: 1, z: 1, kind: 'burning-man-matilda' },
    clerk = { x: 2, z: 1, kind: 'burger-clerk', id: 'in-n-out-clerk' },
    partner = { x: 3, z: 1, kind: 'capital' },
    parent = { x: 4, z: 1, stroller: true, id: 'noe-parent-1' },
    parrot = { x: 5, z: 1, parrot: true },
    mathematician = { x: 6, z: 1, id: 'berkeley-mathematician' },
    ventureExchange = { x: 7, z: 1, kind: 'secondary' },
    softwareBuyer = { x: 8, z: 1, kind: 'software-buyer' };
  const actors = minimapActors({
    merchants: [matilda, clerk, partner, parent, mathematician, ventureExchange, softwareBuyer],
    parrots: [parrot],
  });
  const always = [matilda, partner, parent, ventureExchange, softwareBuyer];
  assert.deepEqual(minimapTasks(actors), always);
  assert.deepEqual(minimapTasks(actors, { burningMan: 'fetch-water', parrot: 'accepted' }), [
    matilda,
    clerk,
    partner,
    parent,
    ventureExchange,
    softwareBuyer,
    parrot,
  ]);
  assert.deepEqual(minimapTasks(actors, { parrot: 'proof' }), [
    matilda,
    partner,
    parent,
    mathematician,
    ventureExchange,
    softwareBuyer,
  ]);
});

test('the Goblin Startup Incubator is a pickable depression with a reachable founder in a goblin model', () => {
  const detention = createDetentionSite(1.5);
  const gate = { x: 28, y: -2 };
  const land = createMarinLand({
    polygon: MARIN_OUTLINE.map((p) => p.map((v) => v * 1.5)),
    detention,
    gate,
  });
  const { x, z, founder, entry } = GOBLIN_INCUBATOR;
  assert.deepEqual([x, z], [45, -40]);
  assert.equal(land.height(43, -38), detention.terrain(43, -38));
  assert.equal(land.height(34.15, -28), detention.terrain(34.15, -28));
  const natural = detention.terrain(x, z);
  assert.ok(land.height(x, z) < natural - 0.8);
  assert.ok(land.onLand(x, z));
  assert.equal(land.contains(x, z), false);
  assert.ok(land.path(gate, entry, () => null));
  assert.ok(land.contains(founder.x, founder.z));

  const mesh = new Mesh();
  const pit = land.drawIncubator(mesh);
  const ray = { origin: [x, natural + 3, z], dir: [0, -1, 0] };
  let nearest = Infinity;
  for (let i = pit.start; i < pit.start + pit.count; i += 33)
    nearest = Math.min(nearest, rayTriangleAt(ray, mesh.data, i) ?? Infinity);
  assert.ok(Number.isFinite(nearest) && nearest > 3.6, 'nothing covers the mud below grade');
  assert.equal(land.raycast(ray)?.distance, nearest);
  assert.equal(goblinModelVariant({ ...founder, kind: 'founder' }), 'founder');
  assert.equal(goblinModelVariant({ id: 'founder-merchant', kind: 'founder' }), undefined);
});

test('the equipped tinfoil suit survives normalization and has a finite full-body silver model', () => {
  const look = characterAppearance(normalizeCharacter({ torso: 'tinfoil-suit' }));
  assert.equal(look.tinfoil, true);
  const mesh = new Mesh();
  drawCharacter(mesh, 0, 0, 0, 0, 0, false, '#bd9369', '#556644', look);
  assert.ok(mesh.data.length > 0);
  assert.ok(mesh.data.every(Number.isFinite));
});
