import { requiredValue } from './types/assert.ts';
interface MonsterPose {
  id?: string | number;
  modelVariant?: 'mechanic';
  combatKind: string;
  x: number;
  z: number;
  base: number;
  angle: number;
  phase?: number;
  motion?: number;
  affection?: number;
}
import { drawHumanNPC } from './human-npc.ts';
import type { Mesh } from './geometry.ts';
import { pose } from './geometry.ts';
import { MONSTER_STATS } from './monster-drops.ts';
import { drawBison } from './bison-model.ts';

/** A four-beat walk: each planted paw travels backward by exactly the
 * distance covered by the body, then lifts and swings forward to its next step. */
export function sampleBearWalk(phase: number, motion = 1) {
  const stride = MONSTER_STATS.bear.walkStride,
    stance = 0.68,
    reach = stride * stance * 0.5;
  const paws = [];
  for (const side of [-1, 1] satisfies [number, number])
    for (const end of [-1, 1] satisfies [number, number]) {
      const offset = (side === -1 ? 0 : 0.5) + (end === -1 ? 0.25 : 0),
        cycle = (((phase / (Math.PI * 2) + offset) % 1) + 1) % 1;
      const contact = cycle < stance,
        u = contact ? cycle / stance : (cycle - stance) / (1 - stance);
      const swing = u * u * (3 - 2 * u),
        z = (contact ? reach - 2 * reach * u : -reach + 2 * reach * swing) * motion;
      paws.push({
        side,
        end,
        x: side * 0.3,
        y: 0.1 + (contact ? 0 : Math.sin(Math.PI * u) * 0.18) * motion,
        z: end * 0.39 + z,
        contact,
      });
    }
  return {
    paws,
    bob: (1 - Math.cos(phase * 2)) * 0.012 * motion,
    sway: Math.sin(phase) * 0.026 * motion,
    headBob: Math.sin(phase * 2 - 0.45) * 0.018 * motion,
  };
}

export function drawWildMonster(m: Mesh, actor: MonsterPose, time = 0) {
  const stats = requiredValue(
    MONSTER_STATS[actor.combatKind],
    'Unknown monster model: ' + actor.combatKind,
  );
  if (stats.model === 'seagull') {
    pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
      const step = Math.sin(actor.phase || 0) * (actor.motion || 0) * 0.08;
      m.sphere(0, 0.3, 0, 0.25, 0.18, 0.15, '#e6e5dc', 14, 8);
      m.sphere(0.18, 0.45, 0, 0.12, 0.13, 0.1, '#f5f0df', 12, 8);
      m.rod(
        [0.24, 0.43, 0] satisfies [number, number, number],
        [0.4, 0.42, 0] satisfies [number, number, number],
        0.035,
        '#d6a23c',
        6,
      );
      for (const s of [-1, 1] satisfies [number, number]) {
        m.sphere(-0.06, 0.34, s * 0.13, 0.22, 0.055, 0.035, '#89959c', 12, 6);
        m.sphere(0.22, 0.48, s * 0.085, 0.016, 0.017, 0.012, '#252d32', 8, 4);
        m.rod(
          [0, 0.22, s * 0.07] satisfies [number, number, number],
          [s * step, 0.04, s * 0.07] satisfies [number, number, number],
          0.018,
          '#d9a943',
          6,
        );
        m.box(s * step - 0.025, 0.02, s * 0.07 - 0.025, 0.12, 0.025, 0.07, '#d9a943');
      }
    });
    return;
  }
  if (stats.model === 'goblin') {
    pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
      const green = '#6f9554',
        cloth =
          actor.modelVariant === 'mechanic'
            ? '#a47738'
            : actor.combatKind === 'goblin-maker'
              ? '#805069'
              : '#83634a',
        step = Math.sin(actor.phase || 0) * (actor.motion || 0) * 0.12;
      m.sphere(0, 0.67, 0, 0.25, 0.28, 0.17, cloth, 14, 8);
      m.sphere(0, 0.89, -0.028, 0.171, 0.08, 0.155, '#c4a170', 13, 7);
      m.sphere(0, 0.585, 0, 0.247, 0.063, 0.174, '#423c2b', 14, 7, 'canvasWeave');
      m.box(-0.05, 0.561, 0.168, 0.1, 0.053, 0.04, '#b79b58', { metal: 0.55 });
      m.sphere(0, 1.03, 0.03, 0.24, 0.23, 0.19, green, 16, 10);
      m.sphere(0, 0.95, 0.156, 0.15, 0.103, 0.104, '#77934d', 13, 8);
      m.rod([-0.088, 0.94, 0.238], [0.088, 0.94, 0.238], 0.012, '#443f2e', 7);
      m.sphere(0, 0.99, 0.23, 0.085, 0.075, 0.1, green, 10, 6);
      for (const s of [-1, 1] satisfies [number, number]) {
        m.tri(
          [s * 0.18, 1.12, 0] satisfies [number, number, number],
          [s * 0.5, 1.23, -0.03] satisfies [number, number, number],
          [s * 0.22, 0.98, 0.02] satisfies [number, number, number],
          green,
        );
        m.tri(
          [s * 0.22, 0.98, 0.02] satisfies [number, number, number],
          [s * 0.5, 1.23, -0.03] satisfies [number, number, number],
          [s * 0.18, 1.12, 0] satisfies [number, number, number],
          green,
        );
        m.sphere(s * 0.175, 1.01, 0.141, 0.073, 0.075, 0.053, '#8aa45e', 10, 7);
        m.rod([s * 0.064, 0.928, 0.247], [s * 0.081, 0.973, 0.244], 0.014, '#ddd0a2', 7);
        m.rod([s * 0.052, 1.12, 0.211], [s * 0.152, 1.138, 0.179], 0.022, '#4c603b', 7);
        m.sphere(s * 0.1, 1.08, 0.192, 0.04, 0.025, 0.015, '#e9c96e', 10, 6);
        m.sphere(s * 0.1, 1.08, 0.206, 0.013, 0.021, 0.009, '#242b24', 8, 4);
        m.rod(
          [s * 0.23, 0.8, 0] satisfies [number, number, number],
          [s * 0.33, 0.43, s * step] satisfies [number, number, number],
          0.065,
          green,
          8,
        );
        m.rod(
          [s * 0.13, 0.55, 0] satisfies [number, number, number],
          [s * 0.14, 0.16, s * step] satisfies [number, number, number],
          0.075,
          '#3d4636',
          8,
        );
        m.sphere(s * 0.34, 0.428, s * step, 0.082, 0.086, 0.065, '#8ca968', 10, 7);
        m.rod([s * 0.142, 0.08, s * step], [s * 0.14, 0.265, s * step], 0.091, '#313433', 10);
        m.sphere(s * 0.14, 0.094, s * step + 0.062, 0.095, 0.082, 0.152, '#2a2b2b', 12, 7);
        for (const y of [0.12, 0.22] satisfies [number, number])
          m.box(s * 0.14 - 0.055, y, s * step + 0.195, 0.11, 0.035, 0.018, '#c4ced1', {
            metal: 0.8,
          });
      }
      if (actor.modelVariant === 'mechanic') {
        m.sphere(0, 1.185, 0.014, 0.255, 0.14, 0.216, '#a57832', 14, 7);
        m.box(-0.182, 1.165, 0.09, 0.364, 0.045, 0.2, '#776441');
        for (const side of [-1, 1])
          m.rod([side * 0.17, 0.5, 0.174], [side * 0.123, 0.84, 0.13], 0.021, '#443f35', 6);
      }
      if (actor.combatKind === 'goblin-maker') {
        m.box(-0.149, 0.45, 0.134, 0.298, 0.36, 0.047, '#b7814e', 'canvasWeave');
        m.box(-0.11, 0.469, 0.186, 0.22, 0.123, 0.025, '#90623f', 'wood');
        m.rod(
          [0.33, 0.44, 0.05] satisfies [number, number, number],
          [0.33, 0.76, 0.05] satisfies [number, number, number],
          0.035,
          '#ac8956',
          8,
        );
        m.box(0.19, 0.72, -0.02, 0.28, 0.16, 0.16, '#b4c1c2', { metal: 0.65 });
      }
    });
    return;
  }
  if (stats.model === 'bison') {
    drawBison(m, actor, time);
    return;
  }
  if (stats.model === 'shark') {
    drawLandshark(m, actor);
    return;
  }
  if (stats.model === 'robocop') {
    drawHumanNPC(m, actor, time, {
      x: actor.x,
      z: actor.z,
      base: actor.base,
      angle: actor.angle,
      phase: actor.phase || 0,
      seated: false,
      skin: '#8c8476',
      shirt: '#86999d',
      appearance: { pants: '#3b4c57', boots: true, uniform: true, hair: '#34464b' },
      reduced: false,
    });
    pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
      const steel = { metal: 0.85 };
      m.sphere(0, 1.64, 0, 0.17, 0.17, 0.15, '#a1b7bf', 12, 8, steel);
      m.box(-0.136, 1.588, 0.08, 0.272, 0.064, 0.074, '#253a42', steel);
      m.box(-0.113, 1.623, 0.155, 0.226, 0.014, 0.012, '#e26c64', { emissive: 0.8 });
      for (const side of [-1, 1]) {
        m.sphere(side * 0.23, 1.31, 0, 0.115, 0.1, 0.14, '#687e87', 10, 6, steel);
        m.box(
          side * 0.108 - 0.047,
          1.13,
          0.143,
          0.094,
          0.057,
          0.026,
          side === 1 ? '#577fb6' : '#bd5752',
          { emissive: 0.4 },
        );
      }
    });
    return;
  }
  if (stats.model === 'terminator') {
    drawHumanNPC(m, actor, time, {
      x: actor.x,
      z: actor.z,
      base: actor.base,
      angle: actor.angle,
      phase: actor.phase || 0,
      seated: false,
      skin: '#b3bfc0',
      shirt: '#333c41',
      appearance: {
        coat: true,
        backpack: false,
        akibo: true,
        hair: '#283034',
        pants: '#454d50',
        sunglasses: true,
        motion: actor.motion || 0,
        time: time * 0.001,
      },
      reduced: false,
    });
    pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
      m.sphere(-0.055, 1.6, 0.153, 0.036, 0.022, 0.018, '#ff4139', 12, 7, { emissive: 0.9 });
    });
    return;
  }
  if (stats.model === 'human') {
    const look = requiredValue(
      stats.appearance,
      'Human monster appearance is missing: ' + actor.combatKind,
    );
    const zombie = actor.combatKind === 'soma-zombie';
    const second = zombie && actor.id === 'soma-zombie-2';
    drawHumanNPC(m, actor, time, {
      x: actor.x,
      z: actor.z,
      base: actor.base,
      angle: actor.angle,
      phase: actor.phase || 0,
      seated: false,
      skin: second ? '#829460' : look.skin,
      shirt: second ? '#77794d' : look.shirt,
      appearance: {
        ...look,
        ...(zombie && { action: 'zombie', actionT: 0.5 }),
        ...(second && { female: true, hairstyle: 'bob', pants: '#695952' }),
        backpack: false,
        motion: actor.motion || 0,
        time: time * 0.001,
      },
      reduced: false,
    });
    if (actor.combatKind === 'emf-warrior')
      pose(m, actor.x, actor.base, actor.z, actor.angle - Math.PI / 2, () => {
        m.box(-0.24, 0.65, -0.23, 0.48, 0.55, 0.2, '#444e47', { metal: 0.4 });
        for (const side of [-1, 1] satisfies [number, number]) {
          m.rod(
            [side * 0.18, 1.12, -0.16] satisfies [number, number, number],
            [side * 0.25, 2.22, -0.16] satisfies [number, number, number],
            0.012,
            '#c4cccc',
            6,
            {
              metal: 0.8,
            },
          );
          m.sphere(side * 0.14, 0.94, -0.245, 0.04, 0.04, 0.015, '#d7a55c', 8, 5, {
            emissive: 0.4,
          });
        }
      });
    return;
  }
  const bear = actor.combatKind === 'bear',
    ice = actor.combatKind === 'ice-giant',
    motion = actor.motion || 0,
    phase = actor.phase || 0;
  pose(m, actor.x, actor.base, actor.z, actor.angle + (bear ? -Math.PI / 2 : Math.PI / 2), () => {
    if (bear) {
      const fur = '#80604a',
        light = '#af8a63',
        walk = sampleBearWalk(phase, motion),
        bob = walk.bob,
        sway = walk.sway;
      const affection = actor.affection ? Math.sin(time * 0.006) * 0.035 : 0,
        head = walk.headBob + affection;
      m.sphere(sway, 0.79 + bob, 0, 0.47, 0.49, 0.67, fur, 16, 10, 'stucco');
      m.sphere(sway * 0.7, 1.03 + bob + head, 0.43, 0.38, 0.4, 0.38, fur, 16, 10, 'stucco');
      m.sphere(sway * 0.7, 0.96 + bob + head, 0.72, 0.23, 0.17, 0.18, light, 14, 8);
      m.sphere(sway * 0.7, 1.02 + bob + head, 0.86, 0.1, 0.07, 0.06, '#303634', 12, 7);
      for (const side of [-1, 1] satisfies [number, number]) {
        m.sphere(side * 0.25 + sway * 0.7, 1.37 + bob + head, 0.41, 0.13, 0.15, 0.1, fur, 12, 7);
        m.sphere(
          side * 0.25 + sway * 0.7,
          1.38 + bob + head,
          0.49,
          0.075,
          0.085,
          0.016,
          light,
          10,
          6,
        );
        m.sphere(
          side * 0.16 + sway * 0.7,
          1.15 + bob + head,
          0.73,
          0.035,
          0.036,
          0.022,
          '#282d29',
          10,
          6,
        );
        m.sphere(
          side * 0.17 + sway * 0.7,
          1.16 + bob + head,
          0.747,
          0.009,
          0.009,
          0.008,
          '#efe6d2',
          8,
          5,
        );
      }
      for (const paw of walk.paws) {
        const shoulder = [paw.side * 0.3 + sway, 0.67 + bob, paw.end * 0.39] satisfies [
            number,
            number,
            number,
          ],
          knee = [paw.x, 0.33 + (paw.y - 0.1) * 0.5, paw.z - 0.055] satisfies [
            number,
            number,
            number,
          ],
          ankle = [paw.x, paw.y + 0.04, paw.z] satisfies [number, number, number];
        m.sphere(...shoulder, 0.18, 0.24, 0.2, fur, 12, 7, 'stucco');
        m.rod(shoulder, knee, 0.14, fur, 10);
        m.sphere(...knee, 0.145, 0.17, 0.155, fur, 12, 7, 'stucco');
        m.rod(knee, ankle, 0.115, fur, 10);
        m.sphere(paw.x, paw.y, paw.z + 0.06, 0.17, 0.1, 0.22, '#614a3d', 12, 7);
      }
      m.sphere(sway, 0.85 + bob, -0.62, 0.13, 0.13, 0.13, fur, 10, 6);
    } else {
      const skin = ice ? '#9dcfdf' : '#d1ddd8',
        shade = ice ? '#5b94b9' : '#8fabb5',
        frost = '#e1f3ee';
      m.sphere(0, 1.85, 0, 0.7, 0.94, 0.43, skin, 16, 11, 'stucco');
      m.sphere(0, 2.83, 0.03, 0.39, 0.47, 0.32, skin, 14, 10);
      for (const side of [-1, 1] satisfies [number, number]) {
        const stride = Math.sin(phase + side * Math.PI) * motion * 0.25,
          hand = [side * 0.91, 1.1 + stride, 0.08] satisfies [number, number, number];
        m.rod(
          [side * 0.31, 1.21, 0] satisfies [number, number, number],
          [side * 0.35, 0.58, -stride] satisfies [number, number, number],
          0.23,
          shade,
          12,
        );
        m.rod(
          [side * 0.35, 0.58, -stride] satisfies [number, number, number],
          [side * 0.36, 0.16, stride] satisfies [number, number, number],
          0.2,
          skin,
          12,
        );
        m.sphere(side * 0.36, 0.15, stride + 0.12, 0.23, 0.16, 0.34, shade, 12, 7);
        m.sphere(side * 0.64, 2.36, 0, 0.35, 0.39, 0.31, frost, 12, 8);
        m.rod(
          [side * 0.66, 2.3, 0] satisfies [number, number, number],
          [side * 0.91, 1.75, -stride] satisfies [number, number, number],
          0.22,
          skin,
          12,
        );
        m.rod(
          [side * 0.91, 1.75, -stride] satisfies [number, number, number],
          hand,
          0.18,
          shade,
          12,
        );
        m.sphere(...hand, 0.23, 0.25, 0.21, skin, 12, 7);
        m.sphere(side * 0.13, 2.9, 0.315, 0.06, 0.035, 0.022, '#4b7488', 10, 5, { emissive: 0.22 });
        for (let i = 0; i < 3; i++) {
          const x = side * (0.5 + i * 0.13),
            y = 2.55 - i * 0.03;
          m.tri(
            [x - 0.1, y, -0.1] satisfies [number, number, number],
            [x + 0.1, y, -0.1] satisfies [number, number, number],
            [x + side * 0.12, y + 0.43 - i * 0.06, 0] satisfies [number, number, number],
            frost,
          );
          m.tri(
            [x + 0.1, y, 0.1] satisfies [number, number, number],
            [x - 0.1, y, 0.1] satisfies [number, number, number],
            [x + side * 0.12, y + 0.43 - i * 0.06, 0] satisfies [number, number, number],
            skin,
          );
        }
      }
      m.sphere(0, 2.72, 0.35, 0.09, 0.11, 0.1, shade, 12, 6);
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.07;
        m.tri(
          [x - 0.045, 2.68, 0.3] satisfies [number, number, number],
          [x + 0.045, 2.68, 0.3] satisfies [number, number, number],
          [x, 2.32 - Math.abs(i - 2) * 0.05, 0.25] satisfies [number, number, number],
          frost,
        );
      }
      if (ice) {
        m.rod(
          [1.04, 0.1, 0.15] satisfies [number, number, number],
          [1.04, 1.28, 0.15] satisfies [number, number, number],
          0.055,
          shade,
          10,
        );
        m.sphere(1.04, 1.45, 0.15, 0.17, 0.38, 0.17, '#a7e1ec', 6, 4, { emissive: 0.1 });
      } else m.sphere(-0.94, 1.08, 0.17, 0.32, 0.32, 0.3, '#d8e6df', 12, 8, 'stucco');
    }
  });
}

/** A horizontal shark mesh, facing +X like the authoritative movement vector.
 * Its pectoral fins shuffle on land while the forked tail swings behind it. */
function drawLandshark(m: Mesh, actor: MonsterPose) {
  const motion = actor.motion || 0,
    phase = actor.phase || 0,
    bob = Math.sin(phase * 2) * 0.035 * motion;
  const back = '#647f8c',
    side = '#90a6ad',
    belly = '#dce1d4',
    dark = '#293e49';
  pose(m, actor.x, actor.base, actor.z, actor.angle, () => {
    const profiles = [
      [-1.25, 0.1, 0.11] satisfies [number, number, number],
      [-0.95, 0.22, 0.24] satisfies [number, number, number],
      [-0.5, 0.37, 0.36] satisfies [number, number, number],
      [0, 0.42, 0.4] satisfies [number, number, number],
      [0.52, 0.35, 0.34] satisfies [number, number, number],
      [0.92, 0.25, 0.26] satisfies [number, number, number],
      [1.23, 0.13, 0.15] satisfies [number, number, number],
      [1.42, 0.045, 0.055] satisfies [number, number, number],
    ];
    const at = (p: readonly number[], i: number) => {
      const a = (i * Math.PI) / 12;
      return [p[0], 0.66 + Math.cos(a) * p[1] + bob, Math.sin(a) * p[2]];
    };
    for (let j = 1; j < profiles.length; j++)
      for (let i = 0; i < 24; i++) {
        const y = Math.cos(((i + 0.5) * Math.PI) / 12),
          color = y < -0.2 ? belly : y > 0.5 ? back : side;
        m.quad(
          at(profiles[j - 1], i),
          at(profiles[j - 1], i + 1),
          at(profiles[j], i + 1),
          at(profiles[j], i),
          color,
        );
      }
    for (const [p, reverse] of [
      [profiles[0], false],
      [profiles.at(-1)!, true],
    ] as const)
      for (let i = 0; i < 24; i++) {
        const a = at(p, i),
          b = at(p, i + 1);
        m.tri([p[0], 0.66 + bob, 0], reverse ? b : a, reverse ? a : b, side);
      }
    const fin = (a: number[], b: number[], c: number[], color = back) => {
      const thickness = 0.024,
        A = [a[0], a[1] + bob, a[2] - thickness] satisfies [number, number, number],
        B = [b[0], b[1] + bob, b[2] - thickness] satisfies [number, number, number],
        C = [c[0], c[1] + bob, c[2] - thickness] satisfies [number, number, number],
        D = [a[0], a[1] + bob, a[2] + thickness] satisfies [number, number, number],
        E = [b[0], b[1] + bob, b[2] + thickness] satisfies [number, number, number],
        F = [c[0], c[1] + bob, c[2] + thickness] satisfies [number, number, number];
      m.tri(A, B, C, color);
      m.tri(D, F, E, color);
      m.quad(A, D, E, B, color);
      m.quad(B, E, F, C, color);
      m.quad(C, F, D, A, color);
    };
    fin(
      [-0.55, 0.96, 0] satisfies [number, number, number],
      [0.38, 1.02, 0] satisfies [number, number, number],
      [-0.18, 1.64, 0] satisfies [number, number, number],
    );
    for (const s of [-1, 1] satisfies [number, number]) {
      const step = Math.sin(phase + (s * Math.PI) / 2) * motion;
      for (const end of [-1, 1] satisfies [number, number]) {
        const stride = step * end * 0.2,
          x = end * 0.49;
        const lift = Math.max(0, -step * end) * 0.09;
        const knee = [x + 0.1 + stride * 0.34, 0.25 + lift + bob, s * 0.36];
        const ankle = [x + stride, 0.08 + lift, s * 0.39];
        m.sphere(x, 0.405 + bob, s * 0.25, 0.13, 0.144, 0.115, side, 8, 5);
        m.rod([x, 0.41 + bob, s * 0.24], knee, 0.102, side, 10);
        m.sphere(knee[0], knee[1], knee[2], 0.098, 0.094, 0.093, back, 8, 5);
        m.rod(knee, ankle, 0.064, back, 10);
        m.sphere(ankle[0] + 0.038, 0.068 + lift, ankle[2], 0.146, 0.062, 0.093, dark, 9, 6);
        for (let toe = -1; toe <= 1; toe++)
          m.sphere(
            ankle[0] + 0.13,
            0.049 + lift,
            ankle[2] + toe * 0.05,
            0.083 - Math.abs(toe) * 0.015,
            0.034,
            0.027,
            side,
            6,
            4,
          );
      }
      fin(
        [0.25, 0.44, s * 0.29] satisfies [number, number, number],
        [-0.55, 0.4, s * 0.28] satisfies [number, number, number],
        [-0.35 + step * 0.16, 0.07 + Math.max(0, step) * 0.14, s * 0.83] satisfies [
          number,
          number,
          number,
        ],
        side,
      );
      fin(
        [-0.72, 0.46, s * 0.18] satisfies [number, number, number],
        [-1, 0.45, s * 0.16] satisfies [number, number, number],
        [-0.91, 0.26, s * 0.43] satisfies [number, number, number],
        back,
      );
      // Eyes, tiny highlights, and five recessed gill slits.
      m.sphere(0.86, 0.77 + bob, s * 0.235, 0.045, 0.043, 0.018, '#162a32', 12, 7);
      m.sphere(0.875, 0.783 + bob, s * 0.251, 0.011, 0.012, 0.005, '#f6f0d8', 8, 5);
      for (let i = 0; i < 5; i++)
        m.rod(
          [0.42 - i * 0.09, 0.77 + bob, s * (0.35 + i * 0.012)] satisfies [number, number, number],
          [0.38 - i * 0.09, 0.49 + bob, s * (0.32 + i * 0.009)] satisfies [number, number, number],
          0.012,
          dark,
          5,
        );
      // Crescent mouth, with small individual ivory teeth.
      m.tri(
        [0.7, 0.48 + bob, s * 0.26] satisfies [number, number, number],
        [1.29, 0.55 + bob, s * 0.11] satisfies [number, number, number],
        [1, 0.35 + bob, s * 0.18] satisfies [number, number, number],
        dark,
      );
      for (let i = 0; i < 5; i++) {
        const x = 0.8 + i * 0.075,
          z = s * (0.24 - i * 0.022),
          y = 0.49 + i * 0.007 + bob;
        m.tri(
          [x - 0.022, y, z] satisfies [number, number, number],
          [x + 0.022, y, z] satisfies [number, number, number],
          [x + 0.008, y - 0.07, z] satisfies [number, number, number],
          belly,
        );
      }
    }
    const tail = Math.sin(phase) * 0.18 * motion;
    fin(
      [-1.21, 0.73, 0] satisfies [number, number, number],
      [-1.95, 1.43, tail] satisfies [number, number, number],
      [-1.64, 0.68, tail] satisfies [number, number, number],
    );
    fin(
      [-1.21, 0.62, 0] satisfies [number, number, number],
      [-1.64, 0.68, tail] satisfies [number, number, number],
      [-1.86, 0.2, tail] satisfies [number, number, number],
    );
  });
}
