import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTER_BONES, sampleBreakdancePose } from '../src/characters.ts';
import { createAdvisoryDancerMesh } from '../src/ui/advisory-dancer.ts';

test('the breakdance loop plants one hand, kicks both feet up, and recovers to standing', () => {
  const { pelvis, leftHand, leftFoot, rightFoot } = CHARACTER_BONES;
  const freeze = sampleBreakdancePose(Math.PI);
  const stand = sampleBreakdancePose(0);
  assert.ok(freeze.joints[leftHand * 3 + 1] < 0.09);
  assert.ok(freeze.joints[leftFoot * 3 + 1] > 0.3);
  assert.ok(freeze.joints[rightFoot * 3 + 1] > 0.5);
  assert.ok(stand.joints[pelvis * 3 + 1] > freeze.joints[pelvis * 3 + 1]);
  assert.ok(stand.joints[leftHand * 3 + 1] > 0.7);
});

test('the advisory scene stays finite throughout a seamless loop', () => {
  const makeMesh = createAdvisoryDancerMesh();
  const first = [...makeMesh(0).data];
  for (let t = 0; t <= 4.8; t += 0.2) {
    const frame = makeMesh(t).data;
    assert.equal(frame.length, first.length);
    assert.ok(frame.every(Number.isFinite));
    assert.ok(frame.length / 33 < 3500);
  }
  assert.ok(makeMesh(4.8).data.every((value, i) => Math.abs(value - first[i]) < 1e-6));
});
