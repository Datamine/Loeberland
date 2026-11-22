import { characterAppearance, normalizeCharacter } from './character-config.ts';
import { drawCharacter } from './characters.ts';
import { Mesh } from './geometry.ts';
import { drawHumanNPCHead } from './human-npc.ts';
import { drawSpectreHead } from './jurassic-models.ts';
import { drawParrotHead } from './parrots.ts';
import { drawGoblinHead, goblinModelVariant } from './wilderness-models.ts';
import type { Actor, ContentEntity } from './types/world.ts';

const facingCamera = Math.PI / 2 + 0.15;
const tilt = 0.12;

export function drawNPCChatHead(canvas: HTMLCanvasElement, npc: Partial<Actor>, revealed: boolean) {
  const mesh = new Mesh();
  const modelVariant = goblinModelVariant(npc);
  const pose = { x: 0, z: 0, base: 0, angle: facingCamera };
  if (modelVariant || npc.combatKind === 'goblin-maker')
    drawGoblinHead(mesh, {
      ...pose,
      combatKind: modelVariant ? 'goblin' : 'goblin-maker',
      modelVariant,
    });
  else if (revealed) drawSpectreHead(mesh, pose);
  else if (npc.parrot) drawParrotHead(mesh, { ...pose, angle: Math.PI / 2 + 0.55 });
  else drawHumanNPCHead(mesh, npc, facingCamera);
  paintHead(canvas, mesh);
}

export function drawPlayerChatHead(canvas: HTMLCanvasElement, player: ContentEntity) {
  const mesh = new Mesh();
  const settings = normalizeCharacter(player);
  drawCharacter(mesh, 0, 0, 0, facingCamera, 0, false, settings.skin, settings.shirt, {
    ...characterAppearance(settings),
    mode: 'idle',
    headOnly: true,
  });
  paintHead(canvas, mesh);
}

/** Fit a front view to the submitted head geometry, including hair, hats and ears. */
function paintHead(canvas: HTMLCanvasElement, { data }: Mesh) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx || !data.length) return;
  const triangles = [];
  let left = Infinity,
    right = -Infinity,
    bottom = Infinity,
    top = -Infinity;
  for (let i = 0; i < data.length; i += 33) {
    const points = [i, i + 11, i + 22].map((v) => {
      const x = data[v];
      const y = data[v + 1] - tilt * data[v + 2];
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
      return { x, y, z: data[v + 2] + tilt * data[v + 1] };
    });
    const light =
      0.72 + 0.28 * Math.max(0, -0.35 * data[i + 3] + 0.6 * data[i + 4] + 0.6 * data[i + 5]);
    triangles.push({
      points,
      color: data
        .slice(i + 6, i + 9)
        .map((channel) => Math.round(Math.min(1, channel * light) * 255)),
    });
  }
  const scale = Math.min(
    (canvas.width * 0.86) / (right - left),
    (canvas.height * 0.86) / (top - bottom),
  );
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const image = ctx.createImageData(canvas.width, canvas.height);
  const depth = new Float64Array(canvas.width * canvas.height).fill(-Infinity);
  for (const { points, color } of triangles) {
    const rgba = [...color, 255];
    const [a, b, c] = points.map((p) => ({
      x: canvas.width / 2 + (p.x - centerX) * scale,
      y: canvas.height / 2 - (p.y - centerY) * scale,
      z: p.z,
    }));
    const bx = b.x - a.x,
      by = b.y - a.y,
      cx = c.x - a.x,
      cy = c.y - a.y;
    const area = bx * cy - by * cx;
    if (Math.abs(area) < 1e-8) continue;
    // Per-pixel depth preserves overlapping details such as hat bands and glasses.
    for (let y = Math.floor(Math.min(a.y, b.y, c.y)); y < Math.ceil(Math.max(a.y, b.y, c.y)); y++)
      for (
        let x = Math.floor(Math.min(a.x, b.x, c.x));
        x < Math.ceil(Math.max(a.x, b.x, c.x));
        x++
      ) {
        const dx = x + 0.5 - a.x;
        const dy = y + 0.5 - a.y;
        const u = (dx * cy - dy * cx) / area;
        const v = (bx * dy - by * dx) / area;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const z = a.z + u * (b.z - a.z) + v * (c.z - a.z);
        const pixel = y * canvas.width + x;
        if (z <= depth[pixel]) continue;
        depth[pixel] = z;
        image.data.set(rgba, pixel * 4);
      }
  }
  ctx.putImageData(image, 0, 0);
}
