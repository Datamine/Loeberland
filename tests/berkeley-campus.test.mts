import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from '../src/geometry.ts';
import { createFerrari } from '../src/ferrari.ts';
import { createRegionalRoad } from '../src/regional-road.ts';
import { ALIEN_SITE_SIGNS, createEsotericCampus } from '../src/alien-sites.ts';
import { LAB_SIGN } from '../src/berkeley-lab.ts';

import {
  BERKELEY_CHURCH_ROOM,
  BERKELEY_SIDEWALKS,
  BERKELEY_HOMES,
  BERKELEY_INSTITUTE_ROOM,
  BERKELEY_NEIGHBORHOOD,
  MAD_HOUSE,
} from '../src/berkeley-campus.ts';
import { BURNING_MAN } from '../src/burning-man.ts';
import { drawBurningManGrove } from '../src/burning-man-models.ts';

const campus = createEsotericCampus(createFerrari(createRegionalRoad()));
test('Berkeley has a sculpted institute, campanile, library, reading hall and church', () => {
  const m = new Mesh();
  const signUV = [
    [0.13, 0.23],
    [0.37, 0.23],
    [0.37, 0.41],
    [0.13, 0.41],
  ];
  const site = campus.draw(m, new Map());
  const boardUV = [
    [0.53, 0.63],
    [0.77, 0.63],
    [0.77, 0.81],
    [0.53, 0.81],
  ];
  const church = campus.drawChurch(
    m,
    new Map([
      [LAB_SIGN, signUV],
      [ALIEN_SITE_SIGNS[2], boardUV],
    ]),
  );
  assert.equal(
    campus.layout.buildings.length,
    BERKELEY_HOMES.length + BERKELEY_NEIGHBORHOOD.length + 5,
  );
  const homes = campus.drawHomes(m).filter((home) => home.kind !== 'hot-trapdoor');
  assert.equal(homes.length, BERKELEY_HOMES.length + BERKELEY_NEIGHBORHOOD.length);
  for (const home of homes)
    assert.ok(
      campus.path(campus.gate, home.entry, () => null),
      'reachable front door for ' + home.id,
    );
  assert.ok(BERKELEY_NEIGHBORHOOD.filter((home) => home.style === 'victorian').length >= 8);
  assert.ok(BERKELEY_NEIGHBORHOOD.filter((home) => home.style === 'eichler').length >= 4);
  assert.equal(campus.residents.length, BERKELEY_HOMES.length);
  for (const [left, north, right, south] of BERKELEY_HOMES.map((home) => home.rect)) {
    assert.ok(south < 0 && BERKELEY_INSTITUTE_ROOM.z > 0);
    assert.ok(right - left < 2.7 && south - north < 2.3);
  }
  assert.ok(BERKELEY_CHURCH_ROOM.z < 0 && BURNING_MAN.v < 0);
  assert.ok(BURNING_MAN.u > Math.max(...campus.layout.buildings.map(({ rect }) => rect[2])));
  const grove = drawBurningManGrove(m, campus);
  for (const npc of [...grove.people, ...campus.residents]) {
    assert.ok(campus.contains(npc.x, npc.z), npc.id);
    assert.ok(
      campus.path(campus.gate, requiredFixture(npc.approach), () => null),
      npc.id,
    );
  }
  assert.ok(campus.layout.trees.length >= 6);
  assert.ok(m.data.every(Number.isFinite));
  assert.ok(m.data.length / 33 > 18000);
  assert.ok(site.hi[1] - requiredFixture(site.base) > 8);
  const instituteVertices = m.data.slice(site.start, site.start + site.count);
  for (let i = 0; i < instituteVertices.length; i += 11)
    assert.ok(
      campus.local(instituteVertices[i], instituteVertices[i + 2]).v > 1.6,
      'Institute picking excludes the highway and residential terrain',
    );
  assert.equal(site.kind, 'esoteric-institute');
  assert.equal(church.kind, 'unusual-church');
  assert.ok(church.hi[1] - requiredFixture(church.base) > 3);
  let posterVertices = 0,
    boardVertices = 0;
  assert.equal(church.enterableInstitute, true);
  assert.ok(campus.path(church.entry, church.inside, () => null));
  const interior = church.interior.mesh.data;
  for (let i = 0; i < interior.length; i += 11) {
    if (signUV.some(([u, v]) => interior[i + 9] === u && interior[i + 10] === v)) posterVertices++;
    if (boardUV.some(([u, v]) => interior[i + 9] === u && interior[i + 10] === v)) boardVertices++;
  }
  assert.equal(boardVertices, 6, 'the church noticeboard has a sign inside the chapel');
  assert.equal(posterVertices, 12, 'two posters use the shared Goose Corp artwork');
  assert.ok(
    campus.mapFeatures.some((f) => f.color === '#879c78'),
    'the minimap shows the campus lawns',
  );
});
test('the campus adjacency graph connects every lawn and path around solid buildings and props', () => {
  const targets = [
    [-11.8, 4.85],
    [MAD_HOUSE.x + 0.66, MAD_HOUSE.z - 0.37],
    [9.6, 16.8],
    [-7, 6] satisfies [number, number],
    [7, 5] satisfies [number, number],
    [-5, 14] satisfies [number, number],
    [5, 14] satisfies [number, number],
    [0, 14.8] satisfies [number, number],
    [0, 2.65] satisfies [number, number],
    [0, 7.25] satisfies [number, number],
    [0.6, 8.15] satisfies [number, number],
    [0, 5.7] satisfies [number, number],
  ];
  for (const [u, v] of targets) {
    const p = campus.point(u, v),
      to = { x: p.x - 0.5, y: p.z - 0.5 };
    for (const [from, end] of [
      [campus.gate, to],
      [to, campus.gate],
    ]) {
      const path = campus.path(from, end, () => null);
      assert.ok(path?.length);
      let previous = from;
      for (const next of path) {
        assert.ok(campus.segment(previous, next));
        previous = next;
      }
      assert.ok(Math.hypot(previous.x - end.x, previous.y - end.y) < 1e-7);
    }
    const hit = campus.raycast({
      origin: [p.x, campus.base + 10, p.z],
      dir: [0, -1, 0] satisfies [number, number, number],
    });
    assert.ok(hit);
    assert.ok(Math.abs(hit.point[1] - campus.ground()) < 1e-8);
  }
  for (const building of campus.layout.buildings) {
    const [x, z, xx, zz] = building.rect,
      p = campus.point((x + xx) / 2, (z + zz) / 2);
    assert.equal(
      campus.contains(p.x, p.z),
      ['institute', MAD_HOUSE.id, BERKELEY_CHURCH_ROOM.id].includes(building.id),
      'the Institute, church and scientist’s house have walkable interiors',
    );
  }
  const gate = campus.graph.regionAt(-campus.layout.bounds[0], -campus.layout.bounds[1]),
    regions = new Set([...campus.graph.regions].filter((n) => n >= 0));
  assert.deepEqual([...regions], [gate], 'there must be no stranded courtyard pockets');
});

test('the neighborhood has two connected blocks and clear grass at the former highway frontage', () => {
  for (const x of [133, 133.75, 134.5]) assert.equal(campus.surfaceType(x, 6), 'grass');
  const aroundBlocks = [
    [-13, -24.95],
    [3, -24.95],
    [18, -24.95],
    [18, -16.45],
    [3, -16.45],
    [-13, -16.45],
    [-13, -24.95],
  ].map(([u, v]) => campus.point(u, v));
  for (const [i, start] of aroundBlocks.slice(0, -1).entries()) {
    const end = aroundBlocks[i + 1];
    for (let f = 0; f <= 1; f += 0.05)
      assert.equal(
        campus.surfaceType(start.x + f * (end.x - start.x), start.z + f * (end.z - start.z)),
        'road',
      );
  }
  const roads = campus.layout.roads;
  for (const [i, [a, b, c, d]] of roads.entries())
    for (const [x, z, xx, zz] of roads.slice(i + 1))
      assert.ok(
        Math.min(c, xx) - Math.max(a, x) < 1e-7 || Math.min(d, zz) - Math.max(b, z) < 1e-7,
        'street meshes meet at their edges',
      );
});

test('residential lights glow over the street and verge fixtures leave sidewalks clear', () => {
  const mesh = new Mesh();
  const lights = campus.drawStreetlights(mesh);
  assert.equal(lights.length, campus.layout.streetLamps.length);
  assert.ok(lights.length >= 8 && mesh.data.every(Number.isFinite));
  for (const [i, post] of campus.layout.streetLamps.entries()) {
    const light = lights[i];
    const { x, z } = campus.point(post.u, post.v);
    assert.ok(light.y > campus.ground() + 2);
    assert.ok(light.strength > 0 && light.poolStrength > 0);
    assert.equal(campus.contains(x, z), false);
  }
  const fixtures = [
    ...campus.layout.streetLamps,
    ...campus.layout.hydrants,
    ...campus.layout.mailboxes,
  ];
  for (const { u, v } of fixtures) {
    const p = campus.point(u, v);
    const { r } = requiredFixture(
      campus.layout.obstacles.find((obstacle) => obstacle.u === u && obstacle.v === v),
    );
    assert.equal(campus.contains(p.x, p.z), false);
    for (const [left, north, right, south] of BERKELEY_SIDEWALKS) {
      const x =
        right - left < south - north ? (left + right) / 2 : Math.max(left, Math.min(right, u));
      const z =
        south - north < right - left ? (north + south) / 2 : Math.max(north, Math.min(south, v));
      assert.ok(
        Math.hypot(x - u, z - v) > r + 0.16 + 0.125,
        'fixture is clear of pedestrian routes',
      );
    }
  }
});
