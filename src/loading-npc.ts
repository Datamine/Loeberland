import type { NumericVector } from './types/geometry.ts';
import { Mesh } from './geometry.ts';
import { createPreviewViewport } from './rendering/preview-viewport.ts';
import type { CharacterPose } from './characters.ts';
import { createCharacterPose, sampleCharacterPose, drawCharacter } from './characters.ts';
import { getHatGeometry } from './hat-models.ts';

const loadingCycle = 18;
const loadingEase = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const loadingMix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** A presentation-only clip on the game's original skeleton. Sitting uses
 * the same rest animation as X in the world; the hat is the actual Panama. */
export function sampleLoadingNPC(seconds: number, out = createCharacterPose()) {
  const t = ((seconds % loadingCycle) + loadingCycle) % loadingCycle;
  const sit = loadingEase((t - 13.4) / 1.1) * (1 - loadingEase((t - 16.2) / 1.1));
  const watch = loadingEase((t - 4) / 0.55) * (1 - loadingEase((t - 6) / 0.55));
  const tap = t < 3.7 ? Math.max(0, Math.sin((t * Math.PI * 2) / 0.7)) ** 2 : 0;
  const side = [0.46, 0.75 - 0.4 * sit, 0.02 + 0.16 * sit] satisfies [number, number, number],
    overHead = [0, 1.83, -0.02] satisfies [number, number, number],
    onHead = [0, 1.715, -0.02] satisfies [number, number, number];
  let hat: number[] = side,
    grip = 0;
  if (t >= 7.1 && t < 8.65) {
    grip = loadingEase((t - 7.1) / 1.55);
    hat = loadingMix(side, overHead, grip);
    hat[0] += 0.25 * Math.sin(grip * Math.PI);
  } else if (t >= 8.65 && t < 9.1) {
    grip = 1;
    hat = loadingMix(overHead, onHead, loadingEase((t - 8.65) / 0.45));
  } else if (t >= 9.1 && t < 11.3) {
    grip = 1;
    hat = onHead;
  } else if (t >= 11.3 && t < 11.75) {
    grip = 1;
    hat = loadingMix(onHead, overHead, loadingEase((t - 11.3) / 0.45));
  } else if (t >= 11.75 && t < 13.1) {
    grip = 1 - loadingEase((t - 11.75) / 1.35);
    hat = loadingMix(side, overHead, grip);
    hat[0] += 0.25 * Math.sin(grip * Math.PI);
  }
  const handOnHat = [hat[0] - 0.16 + 0.32 * grip, hat[1] + 0.05, hat[2]] satisfies [
    number,
    number,
    number,
  ];
  const relaxed = [0.3, 0.8 - 0.36 * sit, 0.04 + 0.2 * sit] satisfies [number, number, number];
  const handAway = loadingEase((t - 9.2) / 0.45) * (1 - loadingEase((t - 10.8) / 0.45));
  const waiting = {
    tap,
    watch,
    rightWrist: loadingMix(handOnHat, relaxed, handAway),
    leftWrist: loadingMix(
      [-0.24, 0.8 - 0.36 * sit, 0.04 + 0.2 * sit] satisfies [number, number, number],
      [-0.08, 1.16, 0.3] satisfies [number, number, number],
      watch,
    ),
  };
  const pose = sampleCharacterPose('rest', 0, { sitBlend: sit, time: seconds, waiting }, out);
  const hatContact = loadingEase((t - 8.65) / 0.45) * (1 - loadingEase((t - 11.3) / 0.45));
  return { pose, hat, hatContact, sit, watch, tap, time: t };
}

/** Attach an accessory to the same bone matrices used for character skinning.
 * source vertices are in bind space; the character's world transform follows. */
function loadingAttachment(
  target: Mesh,
  source: NumericVector,
  pose: CharacterPose,
  bone: number,
  angle: number,
) {
  const matrix = pose.matrices,
    k = bone * 12,
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (let i = 0; i < source.length; i += 11) {
    const x = source[i],
      y = source[i + 1],
      z = source[i + 2],
      nx = source[i + 3],
      ny = source[i + 4],
      nz = source[i + 5];
    const px = matrix[k] * x + matrix[k + 1] * y + matrix[k + 2] * z + matrix[k + 3],
      py = matrix[k + 4] * x + matrix[k + 5] * y + matrix[k + 6] * z + matrix[k + 7],
      pz = matrix[k + 8] * x + matrix[k + 9] * y + matrix[k + 10] * z + matrix[k + 11];
    const ax = matrix[k] * nx + matrix[k + 1] * ny + matrix[k + 2] * nz,
      ay = matrix[k + 4] * nx + matrix[k + 5] * ny + matrix[k + 6] * nz,
      az = matrix[k + 8] * nx + matrix[k + 9] * ny + matrix[k + 10] * nz;
    target.data.push(
      px * s + pz * c,
      py,
      -px * c + pz * s,
      ax * s + az * c,
      ay,
      -ax * c + az * s,
      ...source.slice(i + 6, i + 11),
    );
  }
}

const clockX = 0.94;
const clockY = 1.22;
const clockZ = -0.22;

function createLoadingClock() {
  const clock = new Mesh();
  clock.cylinder(0, -0.105, 0, 0.32, 0.105, '#5c5347', 32);
  clock.cylinder(0, 0, 0, 0.283, 0.009, '#f8f4e5', 32);
  // Clock cylinders face forward instead of up.
  for (let i = 0; i < clock.data.length; i += 11) {
    const [x, y, z, nx, ny, nz] = clock.data.slice(i, i + 6);
    clock.data[i] = clockX + x;
    clock.data[i + 1] = clockY - z;
    clock.data[i + 2] = clockZ + y;
    clock.data[i + 3] = nx;
    clock.data[i + 4] = -nz;
    clock.data[i + 5] = ny;
  }
  clock.cylinder(clockX, -0.07, clockZ - 0.06, 0.17, 0.06, '#e7e1d4', 24);
  clock.cylinder(clockX, -0.01, clockZ - 0.06, 0.036, 1.04, '#766858', 12);
  for (let tick = 0; tick < 12; tick++) {
    const angle = (tick * Math.PI) / 6;
    const inner = tick % 3 === 0 ? 0.203 : 0.228;
    const x = Math.sin(angle),
      y = Math.cos(angle);
    clock.rod(
      [clockX + x * inner, clockY + y * inner, clockZ + 0.012],
      [clockX + x * 0.255, clockY + y * 0.255, clockZ + 0.012],
      tick % 3 === 0 ? 0.012 : 0.007,
      '#534e43',
    );
  }
  return clock;
}

function drawClockHand(
  m: Mesh,
  turn: number,
  length: number,
  z: number,
  width: number,
  color: string,
) {
  const angle = turn * Math.PI * 2;
  m.rod(
    [clockX, clockY, clockZ + z],
    [clockX + Math.sin(angle) * length, clockY + Math.cos(angle) * length, clockZ + z],
    width,
    color,
  );
}

export function createLoadingNPCMesh() {
  const pose = createCharacterPose(),
    watch = new Mesh(),
    clock = createLoadingClock(),
    angle = 1.5,
    hat = getHatGeometry('panama')!.mesh.data;
  watch.box(-0.283, 0.775, 0.015, 0.076, 0.04, 0.065, '#514536');
  watch.sphere(-0.245, 0.795, 0.054, 0.025, 0.025, 0.009, '#e0c88f', 12, 6);
  watch.rod(
    [-0.245, 0.795, 0.065] satisfies [number, number, number],
    [-0.245, 0.812, 0.065] satisfies [number, number, number],
    0.0028,
    '#4b5146',
    4,
  );
  watch.rod(
    [-0.245, 0.795, 0.065] satisfies [number, number, number],
    [-0.233, 0.788, 0.065] satisfies [number, number, number],
    0.0028,
    '#4b5146',
    4,
  );
  return (seconds: number, time = new Date()) => {
    const sample = sampleLoadingNPC(seconds, pose),
      m = new Mesh();
    // Identical mesh, palette, hairstyle, skinning and normals to in-world NPCs.
    drawCharacter(m, 0, 0, 0, angle, 0, false, '#bd9369', '#707b4b', {
      pants: '#626955',
      hair: '#453a30',
      shoes: '#3c3d36',
      hairstyle: 'short',
      backpack: false,
      mode: 'rest',
      pose: sample.pose,
    });
    loadingAttachment(m, watch.data, sample.pose, 5, angle);
    const c = Math.cos(angle),
      s = Math.sin(angle),
      h = sample.hat,
      head = sample.pose.matrices,
      k = 3 * 12,
      contact = sample.hatContact;
    for (let i = 0; i < hat.length; i += 11) {
      let x = hat[i] + h[0],
        y = hat[i + 1] + h[1],
        z = hat[i + 2] + h[2],
        nx = hat[i + 3],
        ny = hat[i + 4],
        nz = hat[i + 5];
      if (contact) {
        // Once worn, the hat follows head bone 3 exactly as it does
        // on an equipped character, including the subtle idle motion.
        const bx = hat[i],
          by = hat[i + 1] + 1.715,
          bz = hat[i + 2] - 0.02;
        x += (head[k] * bx + head[k + 1] * by + head[k + 2] * bz + head[k + 3] - x) * contact;
        y += (head[k + 4] * bx + head[k + 5] * by + head[k + 6] * bz + head[k + 7] - y) * contact;
        z += (head[k + 8] * bx + head[k + 9] * by + head[k + 10] * bz + head[k + 11] - z) * contact;
        nx +=
          (head[k] * hat[i + 3] + head[k + 1] * hat[i + 4] + head[k + 2] * hat[i + 5] - nx) *
          contact;
        ny +=
          (head[k + 4] * hat[i + 3] + head[k + 5] * hat[i + 4] + head[k + 6] * hat[i + 5] - ny) *
          contact;
        nz +=
          (head[k + 8] * hat[i + 3] + head[k + 9] * hat[i + 4] + head[k + 10] * hat[i + 5] - nz) *
          contact;
      }
      m.data.push(
        x * s + z * c,
        y,
        -x * c + z * s,
        nx * s + nz * c,
        ny,
        -nx * c + nz * s,
        ...hat.slice(i + 6, i + 11),
      );
    }
    m.cylinder(0, -0.07, 0, 0.46, 0.066, '#ffffff', 32, 0.44);
    m.data.push(...clock.data);
    const minute = time.getMinutes() + time.getSeconds() / 60;
    drawClockHand(m, (time.getHours() + minute / 60) / 12, 0.137, 0.024, 0.018, '#37332c');
    drawClockHand(m, minute / 60, 0.195, 0.046, 0.012, '#37332c');
    drawClockHand(m, time.getSeconds() / 60, 0.224, 0.064, 0.006, '#ab4737');
    m.sphere(clockX, clockY, clockZ + 0.052, 0.023, 0.023, 0.024, '#ab4737', 10, 6);
    return m;
  };
}

export function createLoadingNPC(canvas: HTMLCanvasElement | null) {
  return createPreviewViewport(canvas, {
    makeMesh: createLoadingNPCMesh(),
    width: 192,
    height: 208,
    eye: [3.25, 2.4, 4],
    target: [0.25, 1.02, 0],
    halfHeight: 1.22,
  });
}
