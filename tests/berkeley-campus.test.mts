import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from '../src/geometry.ts';
import { createFerrari } from '../src/ferrari.ts';
import { createRegionalRoad } from '../src/regional-road.ts';
import { createEsotericCampus } from '../src/alien-sites.ts';
import { LAB_SIGN } from '../src/berkeley-lab.ts';

import {
  BERKELEY_CHURCH_ROOM,
  BERKELEY_HOMES,
  BERKELEY_INSTITUTE_ROOM,
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
  const church = campus.drawChurch(m, new Map([[LAB_SIGN, signUV]]));
  assert.equal(campus.layout.buildings.length, 15);
  const homes = campus.drawHomes(m).filter((home) => home.kind !== 'hot-trapdoor');
  assert.equal(homes.length, 10);
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
  assert.ok(site.hi[0] - site.lo[0] > 15);
  assert.equal(site.kind, 'esoteric-institute');
  assert.equal(church.kind, 'unusual-church');
  assert.ok(church.hi[1] - requiredFixture(church.base) > 3);
  let posterVertices = 0;
  assert.equal(church.enterableInstitute, true);
  assert.ok(campus.path(church.entry, church.inside, () => null));
  const interior = church.interior.mesh.data;
  for (let i = 0; i < interior.length; i += 11)
    if (signUV.some(([u, v]) => interior[i + 9] === u && interior[i + 10] === v)) posterVertices++;
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
