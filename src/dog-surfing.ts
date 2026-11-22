import type { Actor, InteractionSight, SignAtlas } from './types/world.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import type { Mesh } from './geometry.ts';
import { pose } from './geometry.ts';
import { westernCoastX } from './coastline.ts';
import { drawSurfboard } from './surfing.ts';
import { drawWalkingDog } from './companions.ts';
import { drawPlaque } from './southern-district.ts';
import { pitchAroundPoint, transformMeshRange } from './rendering/mesh-transform.ts';

export const DOG_SURFING = Object.freeze({
  z: 129,
  roundSeconds: 48,
  sign: 'PACIFICA DOG SURFING',
  names: ['Biscuit', 'Nori', 'Captain Pickles'] satisfies [string, string, string],
});
const dogColors = ['#b28958', '#e3d5bd', '#5b5b56'];
const jerseyColors = ['#d46c57', '#62a9c2', '#e9b44c'];
const boardColors = ['#e38f58', '#64aeb4', '#ab82bd'];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
export function dogSurfingRound(seconds: number) {
  const round = Math.floor(seconds / DOG_SURFING.roundSeconds),
    elapsed =
      ((seconds % DOG_SURFING.roundSeconds) + DOG_SURFING.roundSeconds) % DOG_SURFING.roundSeconds,
    scores = DOG_SURFING.names.map((name, i) => ({
      name,
      score: 7 + ((round * 7 + i * 3) % 30) / 10,
    }));
  const winner = scores.reduce((a, b) => (a.score >= b.score ? a : b));
  return { round, elapsed, scores, winner, judging: elapsed >= 36 };
}
export function dogSurfingDialogue(npc: Partial<Actor>, seconds: number) {
  const race = dogSurfingRound(seconds);
  return {
    ...npc,
    repeat: true,
    intro: race.judging
      ? contentText('dog-surfing.dogSurfingDialogue.intro-2.yes', {
          v0: race.scores.map((s) => s.name + ': ' + s.score.toFixed(1)).join(' · '),
          v1: race.winner.name,
        })
      : contentText('dog-surfing.dogSurfingDialogue.intro-2.no', {}),
    choices: [
      {
        label: contentText('dog-surfing.dogSurfingDialogue.label-5', {}),
        receipt: contentText('dog-surfing.dogSurfingDialogue.receipt-6', {}),
        contentNodeId: 'dog-surfing.dogSurfingDialogue.node-4',
        labelTextId: 'dog-surfing.dogSurfingDialogue.label-5',
        labelTextValues: {},
        receiptTextId: 'dog-surfing.dogSurfingDialogue.receipt-6',
        receiptTextValues: {},
      },
      {
        label: contentText('dog-surfing.dogSurfingDialogue.label-8', {}),
        receipt: contentText('dog-surfing.dogSurfingDialogue.receipt-9', {}),
        contentNodeId: 'dog-surfing.dogSurfingDialogue.node-7',
        labelTextId: 'dog-surfing.dogSurfingDialogue.label-8',
        labelTextValues: {},
        receiptTextId: 'dog-surfing.dogSurfingDialogue.receipt-9',
        receiptTextValues: {},
      },
    ],
    decline: contentText('dog-surfing.dogSurfingDialogue.decline-3', {}),
    contentNodeId: 'dog-surfing.dogSurfingDialogue.node-1',
    introTextId: race.judging
      ? 'dog-surfing.dogSurfingDialogue.intro-2.yes'
      : 'dog-surfing.dogSurfingDialogue.intro-2.no',
    introTextValues: race.judging
      ? {
          v0: race.scores.map((s) => s.name + ': ' + s.score.toFixed(1)).join(' · '),
          v1: race.winner.name,
        }
      : {},
    declineTextId: 'dog-surfing.dogSurfingDialogue.decline-3',
    declineTextValues: {},
  };
}
export function drawDogSurfingBeach(
  m: Mesh,
  ground: (x: number, z: number) => number,
  signs: SignAtlas,
) {
  const z = DOG_SURFING.z,
    x = westernCoastX(z) + 1.05,
    y = ground(x, z);
  for (const dz of [-2, 2] satisfies [number, number]) {
    m.rod(
      [x, y, z + dz] satisfies [number, number, number],
      [x, y + 1.7, z + dz] satisfies [number, number, number],
      0.035,
      '#a98c62',
      8,
    );
    m.tri(
      [x, y + 1.7, z + dz] satisfies [number, number, number],
      [x, y + 1.35, z + dz] satisfies [number, number, number],
      [x + 0.7, y + 1.55, z + dz] satisfies [number, number, number],
      dz < 0 ? '#e07f91' : '#6ac0c1',
    );
  }
  pose(m, x, y, z, Math.PI / 2, () => {
    for (const leg of [-1, 1])
      m.box(leg * 1.1 - 0.035, 0, -0.05, 0.07, 1.37, 0.1, '#9e805b', 'wood');
    m.box(-1.23, 1.07, -0.035, 2.46, 0.44, 0.07, '#294c50', 'wood');
    drawPlaque(m, signs, DOG_SURFING.sign, 0, 1.13, -0.04, 2.32, 0.3, false);
    drawPlaque(m, signs, DOG_SURFING.sign, 0, 1.13, 0.04, 2.32, 0.3);
    for (const [i, color] of jerseyColors.entries())
      m.box(-0.51 + i * 0.35, 1.02, 0, 0.3, 0.05, 0.08, color);
  });
}

export const dogSurfTrophyZ = DOG_SURFING.z + 3.1;
export function drawDogSurfTrophies(m: Mesh, x: number, y: number, z: number) {
  pose(m, x, y, z, Math.PI / 2, () => {
    m.box(-0.67, 0, -0.25, 1.34, 0.56, 0.5, '#547f86', 'wood');
    m.box(-0.7, 0.54, -0.28, 1.4, 0.065, 0.56, '#e4cf9c', 'wood');
    for (const [i, color] of ['#d4dcd4', '#e9bf5a', '#bb7952'].entries()) {
      const xx = (i - 1) * 0.41;
      const height = i === 1 ? 0.25 : 0.19;
      m.box(xx - 0.12, 0.61, -0.1, 0.24, 0.075, 0.2, '#3b2c28', 'wood');
      m.cylinder(xx, 0.69, 0, 0.035, height * 0.65, color, 10, 0.05, { metal: 0.6 });
      const bowl = 0.69 + height * 0.6;
      m.cylinder(xx, bowl, 0, 0.14, height * 0.55, color, 14, 0.046, { metal: 0.72 });
      for (const side of [-1, 1]) {
        m.rod([xx + side * 0.07, bowl, 0], [xx + side * 0.17, bowl + 0.05, 0], 0.019, color, 6);
        m.rod(
          [xx + side * 0.17, bowl + 0.05, 0],
          [xx + side * 0.12, bowl + 0.11, 0],
          0.019,
          color,
          6,
        );
      }
    }
  });
}

/** Two staggered runs per heat. The board starts and ends at the same shore mark. */
export function dogSurfingRun(elapsed: number, index: number) {
  const runLength = 15;
  const lane = DOG_SURFING.z + (index - 1) * 2.8;
  const time = elapsed - index * 2.25;
  const t = time >= 0 && time < 2 * runLength ? time % runLength : runLength;
  const paddling = t < 4.4;
  const turning = t >= 4.4 && t < 5.25;
  const progress = clamp((t - 5.25) / 6.15);
  const riding = t >= 5.25 && progress < 1;
  const swell = Math.sin(progress * Math.PI);
  const carve = progress * Math.PI * (2.2 + index * 0.75);
  const z = lane + Math.sin(carve) * swell * (0.42 + index * 0.23);
  const beachX = 0.44;
  const offshore = paddling ? -beachX + 8.75 * smooth(t / 4.4) : 8.31 - 8.75 * progress ** 1.18;
  const turn = smooth(clamp((t - 4.4) / 0.85));
  const angle =
    paddling || turning
      ? Math.PI * smooth(clamp(t / 0.7)) * (1 - turn)
      : Math.cos(carve) * swell * (0.35 + index * 0.13);
  const hop = index === 2 ? Math.sin(Math.PI * clamp((progress - 0.5) / 0.18)) * 0.52 : 0;
  const beachWalk = clamp((t - 11.4) / 3.6);
  return {
    x: westernCoastX(z) - offshore,
    z,
    offshore,
    angle,
    paddling,
    turning,
    riding,
    swell,
    hop,
    roll: swell * Math.cos(carve) * 0.26,
    pitch: riding ? 0.15 * Math.sin(carve) * swell - hop * 0.68 : 0,
    shoreDistance: Math.sin(Math.PI * beachWalk),
  };
}

function drawCompetitionWave(m: Mesh, run: ReturnType<typeof dogSurfingRun>, seconds: number) {
  if (!run.riding || run.swell < 0.09 || run.offshore < 0.4) return;
  const crest = 0.44 * run.swell;
  pose(m, run.x - 0.28, 0.02, run.z, run.angle * 0.35, () => {
    for (let i = -4; i < 4; i++) {
      const z = i * 0.26;
      const end = z + 0.26;
      const profile = (v: number) => 1 - (v / 1.15) ** 2;
      const a = crest * profile(z);
      const b = crest * profile(end);
      m.quad([-1.03, 0, z], [-1.03, 0, end], [0, b, end], [0, a, z], '#559c9f', { water: 0.25 });
      m.quad([0, a, z], [0, b, end], [0.47, 0, end], [0.47, 0, z], '#75c0b5', { water: 0.25 });
      m.quad(
        [-0.05, a + 0.02, z],
        [-0.05, b + 0.02, end],
        [0.11, b * 0.82, end],
        [0.11, a * 0.82, z],
        '#ecf1df',
      );
    }
    for (let i = 0; i < 7; i++) {
      const f = (seconds * 2.6 + i / 7) % 1;
      m.sphere(
        -0.1 - f * 0.9,
        crest * (1 + 0.58 * Math.sin(f * Math.PI)),
        (i - 3) * 0.21,
        0.065,
        0.03,
        0.04,
        '#e0eee2',
        7,
        4,
      );
    }
  });
}

export function drawDogSurfingCompetition(
  m: Mesh,
  seconds: number,
  ground: (x: number, z: number) => number,
  addTarget: (start: number, sight: InteractionSight) => void,
) {
  const { elapsed } = dogSurfingRound(seconds);
  for (const [i, name] of DOG_SURFING.names.entries()) {
    const run = dogSurfingRun(elapsed, i);
    drawCompetitionWave(m, run, seconds);
    const { x, z, angle } = run;
    const onShore = !run.paddling && !run.turning && !run.riding;
    const beach = Math.max(0, ground(x, z));
    const base =
      Math.max(0.015, beach * smooth(clamp((0.45 - run.offshore) / 0.89))) +
      run.swell * 0.43 +
      run.hop;
    const start = m.data.length;
    pose(m, x, base, z, angle, () => {
      drawSurfboard(m, boardColors[i]);
      if (!onShore) {
        drawContestDog(m, i, seconds, 0, 0.12 - (run.paddling ? 0.045 : 0), 0, 0, run.paddling);
        transformMeshRange(m, start, pitchAroundPoint(0, 0.11, 0, Math.PI / 2, run.roll));
        transformMeshRange(m, start, pitchAroundPoint(0, 0.11, 0, 0, run.pitch));
      }
    });
    if (onShore) {
      const dogZ = z + run.shoreDistance * (i === 1 ? -0.7 : 0.7);
      const dogX = westernCoastX(dogZ) + 0.44 + run.shoreDistance * 0.5;
      const dogY = Math.max(0, ground(dogX, dogZ));
      drawContestDog(
        m,
        i,
        seconds,
        dogX,
        dogY + 0.12 * (1 - run.shoreDistance),
        dogZ,
        i === 1 ? -Math.PI / 2 : Math.PI / 2,
        run.shoreDistance > 0.025,
      );
    }
    addTarget(start, {
      id: 'pacifica-surf-dog-' + i,
      kind: 'surfing-dog',
      label: name,
      description: contentText('dog-surfing.contestant-' + i + '.description'),
    });
  }
}

function drawContestDog(
  m: Mesh,
  index: number,
  seconds: number,
  x: number,
  y: number,
  z: number,
  angle: number,
  moving: boolean,
) {
  drawWalkingDog(
    m,
    { x, z, angle, moving, phase: seconds * 13, color: dogColors[index] },
    seconds * 1000,
    () => y,
  );
  pose(m, x, y, z, angle, () => {
    m.box(-0.16, 0.39, -0.147, 0.32, 0.13, 0.294, jerseyColors[index], 'canvasWeave');
    m.box(-0.042, 0.51, -0.105, 0.084, 0.026, 0.21, '#f2dfab');
  });
}
