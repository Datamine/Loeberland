import { drawBisonHide } from './bison-model.ts';
import { characterEquipmentMesh } from './characters.ts';
import { clothingSelection } from './clothing.ts';
import { TOMMY } from './config/tommy.ts';
import { WEAPON_UPGRADE_KIT } from './config/weapon-upgrades.ts';
import { HIKING_BACKPACK_UPGRADE_KIT } from './config/hiking-backpack.ts';
import { baseEquipmentId } from './item-stats.ts';
import { subscribeContent } from './content-runtime.ts';
import { Mesh } from './geometry.ts';
import { FACTORY_CHAIRS, drawOwnedChair } from './goblin-town.ts';
import { drawPeptideVial } from './guild-models.ts';
import { drawHatModel } from './hat-models.ts';
import { drawVelociraptor } from './jurassic-models.ts';
import { drawDroppedMeleeWeapon, hasMeleeWeaponModel } from './melee-weapon-models.ts';
import { pitchAroundPoint, transformMeshRange } from './rendering/mesh-transform.ts';
import { drawScooter } from './scooter.ts';
import type { ExpeditionLoot } from './types/expeditions.ts';
import { wearableEquipmentMeshes } from './wearable-models.ts';

const groundEquipment = new Map<string, number[]>();
subscribeContent(() => groundEquipment.clear());

function drawInvisibilityCloak(m: Mesh) {
  // The worn cloak is invisible. Show the fabric and clasp while it is on the ground.
  const folds = [-0.32, -0.23, -0.14, -0.045, 0.06, 0.16, 0.26, 0.34];
  const point = (column: number, t: number, underside = false) => {
    const x = folds[column] * (0.53 + t * 0.47);
    return [
      x,
      0.045 + (1 - t) * 0.05 + (column % 2) * 0.035 - (underside ? 0.007 : 0),
      t * 0.61 + Math.abs(x) * 0.13,
    ];
  };
  for (let i = 1; i < folds.length; i++) {
    const [a, b, c, d] = [point(i - 1, 0), point(i - 1, 1), point(i, 1), point(i, 0)];
    m.quad(a, b, c, d, i % 2 ? '#507c85' : '#3b626b');
    m.quad(
      point(i, 0, true),
      point(i, 1, true),
      point(i - 1, 1, true),
      point(i - 1, 0, true),
      '#294b55',
    );
    m.rod(b, c, 0.006, '#a4c7be', 6);
  }
  m.rod(point(0, 0), point(0, 1), 0.006, '#a4c7be', 6);
  m.rod(point(folds.length - 1, 0), point(folds.length - 1, 1), 0.006, '#a4c7be', 6);
  m.sphere(0, 0.12, 0.022, 0.035, 0.019, 0.027, '#9fc9c5', 10, 6, { metal: 0.55 });
}

function drawSpoon(m: Mesh) {
  const steel = { metal: 0.68 };
  m.rod([0, 0.032, -0.19], [0, 0.042, 0.02], 0.012, '#a7b1b7', 10, steel);
  m.sphere(0, 0.031, -0.161, 0.022, 0.011, 0.048, '#bdc6ca', 10, 6, steel);
  const segments = 16;
  const point = (i: number, inside: boolean) => {
    const a = (i * Math.PI * 2) / segments;
    return [
      Math.cos(a) * (inside ? 0.045 : 0.061),
      inside ? 0.037 : 0.056,
      0.067 + Math.sin(a) * (inside ? 0.061 : 0.079),
    ];
  };
  for (let i = 0; i < segments; i++) {
    const rim = point(i, false);
    const next = point(i + 1, false);
    const inner = point(i, true);
    const innerNext = point(i + 1, true);
    m.quad(next, rim, inner, innerNext, '#ccd5da', steel);
    m.tri([0, 0.031, 0.067], innerNext, inner, '#b1bbc0', steel);
    m.tri([0, 0.021, 0.067], rim, next, '#909da6', steel);
  }
}

function equipmentModel(id: string): number[] {
  const m = new Mesh();
  const accessories = wearableEquipmentMeshes(id);
  const clothes = clothingSelection({ torso: id, legs: id });
  let pitch = 0;
  if (accessories) {
    m.data = accessories.flat();
    if (id !== 'railgun' && id !== 'missile-launcher') pitch = -1.35;
  } else if (clothes.torso === id) {
    m.data = characterEquipmentMesh('top', clothes);
    if (clothes.tinfoil) {
      for (const value of characterEquipmentMesh('legs', clothes)) m.data.push(value);
    }
    pitch = -1.35;
  } else if (clothes.legs === id) {
    m.data = characterEquipmentMesh('legs', clothes);
    pitch = -1.45;
  } else {
    switch (id) {
      case 'combat-boots':
      case 'party-boots':
        m.data = characterEquipmentMesh('boots', { boots: id === 'combat-boots' ? true : id });
        pitch = -0.33;
        break;
      case 'black-tie':
        m.data = characterEquipmentMesh('tie', { neck: id });
        pitch = -Math.PI / 2;
        break;
      case 'backpack':
        m.data = characterEquipmentMesh('backpack', { backpack: true });
        pitch = 1.15;
        break;
      case 'akibo':
        m.data = characterEquipmentMesh('akimbo', { akibo: true });
        break;
      case 'iphone':
        m.data = characterEquipmentMesh('phone', { phone: true });
        pitch = -Math.PI / 2;
        break;
      case 'invisibility-cloak':
        drawInvisibilityCloak(m);
        break;
      case WEAPON_UPGRADE_KIT:
        m.box(-0.17, 0, -0.12, 0.34, 0.09, 0.24, '#29333d', { metal: 0.42 });
        m.box(-0.15, 0.09, -0.1, 0.3, 0.021, 0.2, '#496c76', { metal: 0.36 });
        for (const x of [-0.095, 0, 0.095]) {
          m.rod([x, 0.122, -0.065], [x, 0.122, 0.065], 0.021, '#91bbc2', 10, { metal: 0.55 });
          m.box(x - 0.012, 0.141, -0.024, 0.024, 0.01, 0.048, '#72f2ff', { emissive: 0.48 });
        }
        break;
      case HIKING_BACKPACK_UPGRADE_KIT:
        m.box(-0.16, 0, -0.12, 0.32, 0.11, 0.24, '#59604a', 'canvasWeave');
        for (const x of [-0.09, 0.06]) {
          m.box(x, 0.085, -0.127, 0.03, 0.035, 0.254, '#84694d');
          m.box(x - 0.004, 0.116, -0.043, 0.038, 0.008, 0.036, '#b3a177', { metal: 0.4 });
        }
        break;
      case 'goblin-phone':
        m.box(-0.095, 0, -0.155, 0.19, 0.065, 0.31, '#a9654d');
        m.box(-0.083, 0.065, -0.14, 0.166, 0.009, 0.28, '#ba775b');
        for (let row = 0; row < 3; row++)
          m.box(-0.055, 0.074, -0.067 + 0.051 * row, 0.11, 0.003, 0.006, '#774939');
        break;
      case 'fighter-yard-pass':
        m.box(-0.13, 0, -0.17, 0.26, 0.013, 0.34, '#e5d6b2');
        for (let row = 0; row < 4; row++)
          m.box(-0.09, 0.013, -0.1 + 0.035 * row, 0.16, 0.002, 0.007, '#71614f');
        m.cylinder(0.05, 0.013, 0.095, 0.038, 0.009, '#a84838', 12);
        break;
      case TOMMY.spoon:
        drawSpoon(m);
        break;
      case 'scooter':
        drawScooter(m, 0, 0, 0, 0);
        break;
      default: {
        const chair = FACTORY_CHAIRS.find((entry) => entry.id === id);
        if (chair) drawOwnedChair(m, chair, 0, 0, 0, Math.PI / 2);
      }
    }
  }
  if (!m.data.length) return m.data;

  // Tip the item over, center it on the drop, and keep small items selectable.
  transformMeshRange(m, 0, pitchAroundPoint(0, 0, 0, Math.PI / 2, pitch));
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.data.length; i += 11)
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], m.data[i + axis]);
      hi[axis] = Math.max(hi[axis], m.data[i + axis]);
    }
  const width = Math.max(...hi.map((value, axis) => value - lo[axis]));
  const scale = Math.max(0.32, Math.min(width, 0.92)) / width;
  const centerX = (lo[0] + hi[0]) / 2;
  const centerZ = (lo[2] + hi[2]) / 2;
  for (let i = 0; i < m.data.length; i += 11) {
    m.data[i] = (m.data[i] - centerX) * scale;
    m.data[i + 1] = (m.data[i + 1] - lo[1]) * scale + 0.025;
    m.data[i + 2] = (m.data[i + 2] - centerZ) * scale;
  }
  return m.data;
}

function drawGroundEquipment(m: Mesh, id: string, x: number, base: number, z: number) {
  if (hasMeleeWeaponModel(id)) {
    drawDroppedMeleeWeapon(m, id, x, base, z);
    return;
  }
  let data = groundEquipment.get(id);
  if (!data) {
    data = equipmentModel(id);
    if (data.length) groundEquipment.set(id, data);
  }
  for (let i = 0; i < data.length; i += 11)
    m.data.push(
      x + data[i],
      base + data[i + 1],
      z + data[i + 2],
      data[i + 3],
      data[i + 4],
      data[i + 5],
      data[i + 6],
      data[i + 7],
      data[i + 8],
      data[i + 9],
      data[i + 10],
    );
}

function drawGooseMembershipCard(m: Mesh, x: number, base: number, z: number) {
  m.box(x - 0.22, base + 0.025, z - 0.14, 0.44, 0.012, 0.28, '#d4bd7c');
  m.box(x - 0.21, base + 0.038, z - 0.13, 0.42, 0.004, 0.26, '#ede5ca');
  m.box(x - 0.21, base + 0.043, z - 0.13, 0.42, 0.004, 0.055, '#31554f');
  // A tiny embossed goose, with no inventory representation to survive pickup.
  m.sphere(x - 0.04, base + 0.05, z + 0.015, 0.085, 0.009, 0.042, '#faf6df', 10, 5);
  m.rod(
    [x + 0.02, base + 0.052, z + 0.01] satisfies [number, number, number],
    [x + 0.065, base + 0.052, z - 0.055] satisfies [number, number, number],
    0.012,
    '#faf6df',
    6,
  );
  m.sphere(x + 0.065, base + 0.053, z - 0.055, 0.023, 0.008, 0.019, '#faf6df', 8, 4);
  m.tri(
    [x + 0.077, base + 0.06, z - 0.067] satisfies [number, number, number],
    [x + 0.115, base + 0.06, z - 0.05] satisfies [number, number, number],
    [x + 0.076, base + 0.06, z - 0.042] satisfies [number, number, number],
    '#d99040',
  );
  for (let i = 0; i < 3; i++)
    m.box(x - 0.15 + i * 0.1, base + 0.045, z + 0.085, 0.07, 0.003, 0.009, '#8f9a7e');
}
export function drawGroundItem(
  m: Mesh,
  item: Pick<ExpeditionLoot, 'x' | 'z' | 'lootKind' | 'hatId' | 'itemId'>,
  base: number,
  time: number | undefined,
) {
  const x = item.x,
    z = item.z;
  if (
    item.lootKind === 'equipment' ||
    item.lootKind === 'invisibility-cloak' ||
    item.lootKind === WEAPON_UPGRADE_KIT ||
    item.lootKind === HIKING_BACKPACK_UPGRADE_KIT
  ) {
    drawGroundEquipment(m, baseEquipmentId(item.itemId ?? item.lootKind), x, base, z);
  } else if (item.lootKind === 'bind-tablet') {
    m.box(x - 0.12, base + 0.03, z - 0.15, 0.24, 0.07, 0.3, '#babdc4', 'stone');
    m.rod(
      [x - 0.068, base + 0.105, z - 0.09],
      [x + 0.068, base + 0.105, z + 0.09],
      0.014,
      '#e5f3ff',
      6,
      { emissive: 0.6 },
    );
  } else if (item.lootKind === 'armor-trimming-kit') {
    m.box(x - 0.13, base + 0.02, z - 0.11, 0.26, 0.12, 0.22, '#4d4037', 'wood');
    m.box(x - 0.078, base + 0.14, z - 0.056, 0.156, 0.014, 0.112, '#bf9448', { metal: 0.46 });
  } else if (item.lootKind === 'goblin-helmet-upgrade-kit') {
    m.box(x - 0.16, base + 0.02, z - 0.1, 0.32, 0.095, 0.2, '#53634c', 'wood');
    for (const side of [-1, 1]) {
      const dx = side * 0.09;
      m.rod(
        [x + dx, base + 0.125, z - 0.09],
        [x + dx, base + 0.125, z + 0.09],
        0.014,
        '#777f87',
        8,
        { metal: 0.55 },
      );
    }
    m.box(x - 0.028, base + 0.076, z + 0.095, 0.056, 0.05, 0.014, '#bd9853', { metal: 0.5 });
  } else if (item.lootKind === 'uni') {
    m.box(x - 0.18, base + 0.015, z - 0.13, 0.36, 0.045, 0.26, '#63524c', 'wood');
    for (let i = 0; i < 4; i++)
      m.sphere(
        x - 0.12 + i * 0.08,
        base + 0.075,
        z,
        0.032,
        0.043,
        0.086,
        i % 2 ? '#eaa84a' : '#d68d35',
        8,
        5,
      );
  } else if (item.lootKind === 'sand-bucket') {
    m.cylinder(x, base, z, 0.086, 0.17, '#879a9b', 10, 0.12, { metal: 0.44 });
    m.sphere(x, base + 0.165, z, 0.106, 0.026, 0.106, '#d3b27d', 8, 4);
  } else if (item.lootKind === 'light-crystal') {
    const rim = (i: number, y: number, r: number) => {
      const angle = (i * Math.PI) / 3;
      return [x + Math.cos(angle) * r, base + y, z + Math.sin(angle) * r];
    };
    for (let i = 0; i < 6; i++) {
      const a = rim(i, 0.1, 0.115);
      const b = rim(i + 1, 0.1, 0.115);
      const c = rim(i + 1, 0.26, 0.08);
      const d = rim(i, 0.26, 0.08);
      const tint = ['#60b3e8', '#c6f7ff', '#91d7ff'][i % 3];
      const light = { emissive: 0.48 };
      m.quad(b, a, d, c, tint, light);
      m.tri(c, d, [x + 0.025, base + 0.38, z], '#e5fcff', light);
      m.tri(a, b, [x - 0.025, base + 0.016, z], '#539ecc', light);
    }
  } else if (item.lootKind === 'bison-hide') {
    drawBisonHide(m, x, base, z);
  } else if (item.lootKind === 'bear-pelt') {
    drawBisonHide(m, x, base, z, { fur: '#585049', center: '#372f2a' });
  } else if (item.lootKind === 'fox-pelt') {
    drawBisonHide(m, x, base, z, { fur: '#b3623a', center: '#e4b783', size: 0.72 });
  } else if (item.lootKind === 'goose-membership-card') {
    drawGooseMembershipCard(m, x, base, z);
  } else if (item.lootKind === 'peptides') {
    drawPeptideVial(m, x, base, z, time);
  } else if (item.lootKind === 'hat') {
    drawHatModel(m, item.hatId ?? '', x, base + 0.035, z, 0.3, 1.1);
  } else if (item.lootKind === 'iphone') {
    drawGroundEquipment(m, item.lootKind, x, base, z);
  } else if (item.lootKind === 'sandwich') {
    m.box(x - 0.18, base + 0.03, z - 0.12, 0.36, 0.07, 0.24, '#d8b56c');
    m.box(x - 0.17, base + 0.1, z - 0.12, 0.34, 0.04, 0.24, '#719852');
    m.box(x - 0.18, base + 0.14, z - 0.12, 0.36, 0.07, 0.24, '#e3c48a');
  } else if (item.lootKind === 'raptor') {
    drawVelociraptor(m, { x, z, base, angle: 0, phase: 'dead' }, time || 0);
  } else if (item.lootKind === 'kraken') {
    m.box(x - 0.27, base + 0.025, z - 0.2, 0.54, 0.24, 0.4, '#8b6b45', 'wood');
    m.box(x - 0.29, base + 0.265, z - 0.22, 0.58, 0.065, 0.44, '#b09865', 'wood');
    for (const dx of [-0.18, 0.18] satisfies [number, number]) {
      m.box(x + dx - 0.025, base + 0.03, z - 0.207, 0.05, 0.23, 0.414, '#bba363', { metal: 0.35 });
      m.box(x + dx - 0.025, base + 0.331, z - 0.22, 0.05, 0.012, 0.44, '#c7ad6a', { metal: 0.35 });
    }
    m.box(x - 0.045, base + 0.14, z + 0.205, 0.09, 0.09, 0.025, '#d2b96d', { metal: 0.5 });
    m.box(x - 0.14, base + 0.343, z - 0.1, 0.28, 0.025, 0.2, '#54647d');
  } else if (item.lootKind === 'coins') {
    for (let i = 0; i < 7; i++)
      m.cylinder(
        x + Math.cos(i * 2.4) * 0.15,
        base + 0.04 + Math.floor(i / 3) * 0.035,
        z + Math.sin(i * 2.4) * 0.12,
        0.075,
        0.025,
        '#e7bd5b',
        12,
        0.075,
        { metal: 0.7 },
      );
  }
}
