import { drawCharacter, sampleCharacterPose, type CharacterAppearance } from './characters.ts';
import { pose, type Mesh } from './geometry.ts';

export function drawConstructionWorker(
  mesh: Mesh,
  worker: { x: number; y: number; z: number; angle: number },
  time: number,
  appearance: CharacterAppearance,
  reduced = false,
) {
  const { x, y, z, angle } = worker;
  const seconds = reduced ? 0 : time * 0.001;
  const animation = { action: 'hammer', actionT: 0.5, time: seconds };
  const rig = sampleCharacterPose('idle', 0, animation);
  drawCharacter(mesh, x, z, y, angle, 0, false, appearance.skin, appearance.shirt, {
    ...appearance,
    ...animation,
    pose: rig,
    railgun: false,
    akibo: false,
    battleaxe: false,
    rollingPin: false,
    bayonet: false,
    phone: false,
  });

  const lift = (1 - Math.cos(seconds * 8)) / 2;
  const hand = rig.joints.subarray(27, 30);
  const grip = [hand[0], hand[1] * (appearance.height || 1), hand[2]];
  pose(mesh, x, y, z, angle - Math.PI / 2, () => {
    const head: [number, number, number] = [
      grip[0],
      grip[1] + lift * 0.23,
      grip[2] + (1 - lift * 0.7) * 0.22,
    ];
    mesh.rod([grip[0], grip[1] - 0.025, grip[2]], head, 0.021, '#ad7846', 8, 'wood');
    mesh.box(
      head[0] - 0.065,
      head[1] - 0.048,
      head[2] - 0.047,
      0.13,
      0.076,
      0.093,
      '#505960',
      'metal',
    );
  });
}
