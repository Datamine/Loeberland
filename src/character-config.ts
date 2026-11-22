import { isFiniteNumber, isRecord, isOneOf } from './types/json.ts';

import { clothingSelection } from './clothing.ts';
import { hatById } from './hat-catalog.ts';
import { Mesh } from './geometry.ts';
import { drawCharacter } from './characters.ts';
import { drawKrakenCape } from './jurassic-models.ts';
import { HAIRSTYLES } from './config/hairstyles.ts';
import { normalizeBoots, PLAYER_WEAPONS } from './item-stats.ts';

export const CHARACTER_DEFAULTS = Object.freeze({
  gender: 'man',
  skin: '#bd9369',
  shirt: '#707b4b',
  pants: '#626955',
  hair: '#453a30',
  shoes: '#3c3d36',
  hairstyle: 'short',
  sunglasses: false,
  cape: false,
  back: 'none',
  neck: 'none',
  rocketBurnUntil: 0,
  hat: 'none',
  weapon: 'unarmed',
  boots: false,
  iceTop: false,
  icePants: false,
  torso: 'shirt',
  legs: 'trousers',
  cloakTop: false,
  cloakBottom: false,
  tinfoil: false,
});
export type CharacterSettings = {
  -readonly [K in keyof typeof CHARACTER_DEFAULTS]: K extends 'boots'
    ? boolean | 'party-boots'
    : (typeof CHARACTER_DEFAULTS)[K] extends string
      ? string
      : (typeof CHARACTER_DEFAULTS)[K] extends boolean
        ? boolean
        : number;
} & { gender: 'man' | 'woman' };
export function normalizeCharacter(input: unknown = {}): CharacterSettings {
  const value = isRecord(input) ? input : {};
  const result: CharacterSettings = { ...CHARACTER_DEFAULTS };
  for (const key of ['skin', 'shirt', 'pants', 'hair', 'shoes'] as const)
    if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]))
      result[key] = value[key];
  if (isOneOf(['man', 'woman'] as const, value.gender)) result.gender = value.gender;
  result.hairstyle =
    typeof value.hairstyle === 'string' &&
    HAIRSTYLES[result.gender].some((s) => s.id === value.hairstyle)
      ? value.hairstyle
      : HAIRSTYLES[result.gender][0].id;
  result.sunglasses = value?.sunglasses === true;
  result.back = isOneOf(
    ['none', 'backpack', 'new-year-rocket', 'cape'] satisfies [string, string, string, string],
    value.back,
  )
    ? value.back
    : value?.cape === true
      ? 'cape'
      : 'none';
  result.neck =
    value?.neck === 'clock-amulet' || value?.neck === 'recoil-amulet' ? value.neck : 'none';
  result.cape = result.back === 'cape';
  result.rocketBurnUntil = isFiniteNumber(value?.rocketBurnUntil)
    ? Math.max(0, value.rocketBurnUntil)
    : 0;
  result.hat = hatById(typeof value.hat === 'string' ? value.hat : undefined)?.id || 'none';
  result.weapon = isOneOf(PLAYER_WEAPONS, value.weapon) ? value.weapon : 'unarmed';
  result.boots = normalizeBoots(value.boots);
  result.iceTop = value?.iceTop === true;
  result.icePants = value?.icePants === true;
  return Object.assign(result, clothingSelection(value));
}
export function characterAppearance(settings: CharacterSettings & { phone?: boolean }) {
  const female = settings.gender === 'woman';
  return {
    ...settings,
    railgun: settings.weapon === 'railgun',
    bayonet: settings.weapon === 'bayonet',
    battleaxe: settings.weapon === 'battleaxe',
    rollingPin: settings.weapon === 'rolling-pin',
    akibo: settings.weapon === 'akibo',
    female,
    longHair: female && settings.hairstyle === 'long',
    backpack: settings.back === 'backpack',
  };
}

export function drawCharacterPreview(
  canvas: HTMLCanvasElement,
  settings: CharacterSettings & { phone?: boolean },
) {
  const ctx = canvas.getContext('2d'),
    m = new Mesh();
  if (!ctx) return;
  drawCharacter(
    m,
    0,
    0,
    0,
    Math.PI / 2 - 0.3,
    0,
    false,
    settings.skin,
    settings.shirt,
    characterAppearance(settings),
  );
  if (settings.cape) drawKrakenCape(m, 0, 0, 0, Math.PI / 2 - 0.3, 0, new Map());
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#383c36';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222820';
  ctx.beginPath();
  ctx.ellipse(120, 216, 48, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  let top = 1;
  for (let i = 1; i < m.data.length; i += 11) top = Math.max(top, m.data[i]);
  const scale = Math.min(100, 195 / top),
    triangles = [];
  for (let i = 0; i < m.data.length; i += 33) {
    const points = ([0, 11, 22] satisfies [number, number, number]).map((k) => ({
      x: 120 + m.data[i + k] * scale,
      y: 215 - m.data[i + k + 1] * scale - m.data[i + k + 2] * scale * 0.2,
    }));
    triangles.push({
      points,
      depth: (m.data[i + 2] + m.data[i + 13] + m.data[i + 24]) / 3,
      color: m.data.slice(i + 6, i + 9),
      light:
        0.65 + Math.max(0, m.data[i + 3] * -0.4 + m.data[i + 4] * 0.7 + m.data[i + 5] * 0.5) * 0.35,
    });
  }
  triangles.sort((a, b) => a.depth - b.depth);
  for (const t of triangles) {
    ctx.fillStyle =
      'rgb(' + t.color.map((v) => Math.round(Math.min(1, v * t.light) * 255)).join(',') + ')';
    ctx.beginPath();
    t.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }
}
