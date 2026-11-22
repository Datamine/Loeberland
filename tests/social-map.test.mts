import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from '../src/geometry.ts';
import { drawSocialBuildings, socialNavigationPolygons } from '../src/social-buildings.ts';
import {
  CONFERENCE_PANELS,
  TWITTER_HQ,
  SALES_CONFERENCE,
  socialFixtures,
  streamDistance,
} from '../src/social-layout.ts';
import { drawBottlePostAnimation, drawRunoffBanks } from '../src/bottle-post.ts';
import { partitionRunoff } from '../src/runoff-surface.ts';
import {
  insideInstitute,
  instituteHiddenSections,
  raycastInstituteFloor,
} from '../src/institute-interiors.ts';
import { compileEntityDialogue } from '../src/content-game.ts';
import { sampleCharacterPose } from '../src/characters.ts';

const area = (poly: readonly (readonly number[])[]) =>
  Math.abs(
    poly.reduce<number>((n, a, i) => {
      const b = poly[(i + 1) % poly.length];
      return n + a[0] * b[2] - b[0] * a[2];
    }, 0) / 2,
  );
test('the runoff partitions terrain without gaps, double surfaces, or changes to the topography', () => {
  let wet = 0;
  for (let z = 113.5; z < 114.9; z += 0.125)
    for (let x = 10; x < 16.9; x += 0.125) {
      const h = (x: number, z: number) => 2 + x * 0.08 - z * 0.006,
        a = [x, h(x, z), z] satisfies [number, number, number],
        b = [x + 0.125, h(x + 0.125, z), z] satisfies [number, number, number],
        c = [x + 0.125, h(x + 0.125, z + 0.125), z + 0.125] satisfies [number, number, number],
        d = [x, h(x, z + 0.125), z + 0.125] satisfies [number, number, number];
      for (const tri of [
        [a, c, b],
        [a, d, c],
      ]) {
        let sum = 0;
        partitionRunoff(
          tri,
          (poly) => {
            sum += area(poly);
          },
          (poly) => {
            sum += area(poly);
            wet += area(poly);
            for (const p of poly) {
              assert.ok(Math.abs(p[1] - h(p[0], p[2])) < 1e-8);
              assert.ok(streamDistance(p[0], p[2]) < 0.004);
            }
          },
        );
        assert.ok(Math.abs(sum - area(tri)) < 1e-8);
      }
    }
  assert.ok(wet > 2 && wet < 4);
});
test('social room fixtures share native collision shapes and cut away toward every camera angle', () => {
  const scene = new Mesh(),
    sites = drawSocialBuildings(scene, new Map());
  assert.equal(sites.length, 2);
  assert.ok(scene.data.every(Number.isFinite));
  for (const s of sites) {
    assert.ok(s.interior.mesh.data.every(Number.isFinite));
    assert.ok(s.interior.mesh.data.length / 33 < 2000);
    assert.equal(s.navigationPolygons.length, socialNavigationPolygons(s).length);
    const walls = 'ellipse' in s ? CONFERENCE_PANELS - 2 : 5;
    assert.equal(s.navigationPolygons.length, walls + socialFixtures(s).length);
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
      const hidden = instituteHiddenSections(
        s,
        s.interior.sections,
        [s.x + 20 * Math.cos(yaw), 15, s.z + 20 * Math.sin(yaw)] satisfies [number, number, number],
        true,
      );
      assert.ok(hidden.some((p) => p.kind === 'roof'));
      assert.equal(
        hidden.some((p) => p.kind === 'machine' || p.kind === 'furniture' || p.kind === 'floor'),
        false,
      );
    }
  }
});
test('the tent floor and indoor check follow the round footprint', () => {
  const tent = SALES_CONFERENCE;
  const center = { origin: [tent.x, 10, tent.z], dir: [0, -1, 0] };
  const corner = { origin: [tent.x + tent.w * 0.44, 10, tent.z + tent.d * 0.43], dir: center.dir };
  assert.ok(insideInstitute(tent, tent.x, tent.z));
  assert.equal(insideInstitute(tent, corner.origin[0], corner.origin[2]), false);
  assert.ok(raycastInstituteFloor(tent, center));
  assert.equal(raycastInstituteFloor(tent, corner), null);
});

test('the Poster has an authored reply in a dialogue panel', () => {
  const person = compileEntityDialogue(
    { id: 'twitter-poster', label: 'Poster', choices: [] },
    'actor:twitter-poster',
  );
  assert.equal(person.name, 'Poster');
  assert.equal(person.intro, 'Very busy, someone is wrong on the internet.');
  assert.deepEqual(person.choices, []);
});

test('bottle posting is animated with a bound on dynamic geometry and proper rig motion', () => {
  const terrain = { height: () => 3 },
    worker = {
      id: 'worker',
      label: 'Worker',
      kind: 'twitter-worker',
      x: TWITTER_HQ.x + 0.38,
      z: TWITTER_HQ.z - 0.65,
      base: 3.015,
      angle: Math.PI,
      skin: '#aa7d5e',
      shirt: '#69848c',
    },
    poster = {
      id: 'poster',
      label: 'Poster',
      kind: 'twitter-poster',
      x: TWITTER_HQ.x + 1.35,
      z: TWITTER_HQ.z + 0.86,
      base: 3.015,
      angle: -Math.PI / 2,
      skin: '#b79577',
      shirt: '#8b788b',
    };
  let before: number[] | null = null;
  for (const t of [0, 1200, 2800] satisfies [number, number, number]) {
    const m = new Mesh(),
      targets: import('../src/types/world.ts').Actor[] = [];
    drawBottlePostAnimation(m, t, terrain, [worker, poster], {
      addTarget: (s, n) => targets.push(n),
    });
    assert.ok(m.data.every(Number.isFinite));
    assert.equal(targets.length, 2);
    assert.ok(m.data.length / 33 < 12000);
    if (before) assert.notDeepEqual(m.data, before);
    before = m.data;
  }
  const banks = new Mesh();
  drawRunoffBanks(banks, terrain);
  assert.ok(banks.data.every(Number.isFinite));
  assert.ok(banks.data.length / 33 < 9000);
  const a = sampleCharacterPose('idle', 0, { action: 'bottle-post', actionT: 0.15 }),
    b = sampleCharacterPose('idle', 0, { action: 'bottle-post', actionT: 0.7 });
  assert.notDeepEqual([...a.joints], [...b.joints]);
});
