import {
  CHARACTER_BONES,
  createCharacterPose,
  drawCharacter,
  sampleBreakdancePose,
} from '../characters.ts';
import { Mesh, pose } from '../geometry.ts';
import { pitchAroundPoint, transformMeshRange } from '../rendering/mesh-transform.ts';
import { createPreviewViewport } from '../rendering/preview-viewport.ts';

function laptopMesh() {
  const mesh = new Mesh();
  mesh.box(-0.3, 0, -0.2, 0.6, 0.037, 0.4, '#b1bac7');
  mesh.box(-0.269, 0.037, -0.169, 0.538, 0.005, 0.231, '#323947');
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 10; column++) {
      const x = -0.254 + column * 0.052,
        z = -0.156 + row * 0.047;
      mesh.box(x, 0.042, z, 0.04, 0.006, 0.033, '#646e80');
    }
  mesh.box(-0.088, 0.037, 0.075, 0.176, 0.003, 0.092, '#8994a4');
  mesh.box(-0.24, 0.025, -0.196, 0.48, 0.039, 0.04, '#515b6c');

  const lid = mesh.data.length;
  mesh.box(-0.296, 0.043, -0.207, 0.592, 0.39, 0.027, '#a5b0be');
  mesh.box(-0.276, 0.059, -0.18, 0.552, 0.354, 0.006, '#202b3f');
  mesh.box(-0.253, 0.084, -0.174, 0.506, 0.304, 0.005, '#24496b');
  mesh.box(-0.253, 0.349, -0.169, 0.506, 0.039, 0.003, '#417ea9');
  mesh.box(-0.228, 0.102, -0.169, 0.306, 0.222, 0.003, '#182e47');
  for (const [row, width] of [0.143, 0.216, 0.114, 0.245, 0.166].entries())
    mesh.box(
      -0.204,
      0.283 - row * 0.036,
      -0.166,
      width,
      0.012,
      0.003,
      row % 2 ? '#68b9ed' : '#90e0ce',
    );
  mesh.box(0.111, 0.106, -0.167, 0.114, 0.213, 0.003, '#35749e');
  transformMeshRange(mesh, lid, pitchAroundPoint(0, 0.043, -0.195, Math.PI / 2, -0.31));
  return mesh;
}

export function createAdvisoryDancerMesh() {
  const rig = createCharacterPose();
  const laptop = laptopMesh();
  const mesh = new Mesh();

  return (seconds: number) => {
    mesh.data.length = 0;
    const phase = ((seconds + 1.84) / 4.8) * Math.PI * 2;
    sampleBreakdancePose(phase, rig);
    const left = CHARACTER_BONES.leftHand * 3,
      right = CHARACTER_BONES.rightHand * 3,
      pivotX = rig.joints[left],
      pivotZ = rig.joints[left + 2],
      turn = -0.12 + 0.33 * Math.sin(phase * 2),
      sine = Math.sin(turn),
      cosine = Math.cos(turn);
    pose(
      mesh,
      pivotX - pivotX * cosine + pivotZ * sine,
      0,
      pivotZ - pivotX * sine - pivotZ * cosine,
      turn,
      () => {
        drawCharacter(mesh, 0, 0, 0, Math.PI / 2, 0, false, '#a97049', '#e88b47', {
          pose: rig,
          pants: '#27476c',
          hair: '#332522',
          shoes: '#e1ddd6',
          hairstyle: 'short-curls',
        });
        pose(
          mesh,
          rig.joints[right] + 0.055,
          rig.joints[right + 1] + 0.018,
          rig.joints[right + 2] + 0.12,
          -0.13,
          () => {
            mesh.data.push(...laptop.data);
          },
        );
      },
    );
    return mesh;
  };
}

export function createAdvisoryDancer(canvas: HTMLCanvasElement) {
  return createPreviewViewport(canvas, {
    makeMesh: createAdvisoryDancerMesh(),
    width: 360,
    height: 274,
    eye: [2.2, 2.1, 5],
    target: [0.12, 0.85, 0],
    halfHeight: 1.02,
  });
}
