import test from 'node:test';
import assert from 'node:assert/strict';
import { HAIRSTYLES } from '../src/config/hairstyles.ts';
import { normalizeCharacter, characterAppearance } from '../src/character-config.ts';
import { getCharacterMesh, drawCharacter } from '../src/characters.ts';
import { Mesh, rayTriangleAt } from '../src/geometry.ts';
import type { Ray } from '../src/types/geometry.ts';
import { npcOffersAttack, npcDisplayLabel, promoteWalkAction } from '../src/npc-interactions.ts';
import { equipmentOptions } from '../src/equipment-options.ts';

test('a cashmere turtleneck changes the knit collar geometry and is offered to owners', () => {
  const look = characterAppearance(normalizeCharacter({ torso: 'cashmere-turtleneck' }));
  assert.equal(look.torso, 'cashmere-turtleneck');
  assert.notEqual(getCharacterMesh(look), getCharacterMesh());
  const sweater = new Mesh();
  drawCharacter(sweater, 0, 0, 0, 0, 0, false, undefined, '#ff0000', look);
  assert.ok(sweater.data.length > 0 && sweater.data.every(Number.isFinite));
  assert.ok(
    equipmentOptions({ ownedEquipment: ['cashmere-turtleneck'] }).torso.some(
      (choice) => choice.value === 'cashmere-turtleneck',
    ),
  );
  assert.ok(equipmentOptions().torso.every((choice) => choice.value !== 'cashmere-turtleneck'));
});

test('hairstyle menus offer a broccoli cut and ponytail with distinct animated meshes', () => {
  assert.ok(HAIRSTYLES.man.some((style) => style.id === 'broccoli'));
  assert.ok(HAIRSTYLES.woman.some((style) => style.id === 'ponytail'));
  for (const [gender, styles] of Object.entries(HAIRSTYLES)) {
    const meshes: import('../src/characters.ts').CharacterMesh[] = [];
    for (const style of styles) {
      const look = normalizeCharacter({ gender, hairstyle: style.id });
      assert.equal(look.hairstyle, style.id);
      const appearance = characterAppearance(look),
        mesh = getCharacterMesh(appearance);
      assert.equal(getCharacterMesh(appearance), mesh);
      meshes.push(mesh);
      const m = new Mesh();
      drawCharacter(m, 0, 0, 0, 0.7, 0.4, false, look.skin, look.shirt, {
        ...appearance,
        action: 'dance',
        time: 0.3,
      });
      assert.ok(m.data.every(Number.isFinite));
    }
    for (let i = 0; i < meshes.length; i++)
      for (let j = i + 1; j < meshes.length; j++)
        assert.notDeepEqual(meshes[i].vertices, meshes[j].vertices);
    assert.equal(normalizeCharacter({ gender, hairstyle: '<script>' }).hairstyle, styles[0].id);
    const other = HAIRSTYLES[gender === 'man' ? 'woman' : 'man'][2].id;
    assert.equal(normalizeCharacter({ gender, hairstyle: other }).hairstyle, styles[0].id);
  }
});

test('pulled-back hairstyles cover the sides and nape while leaving the ears and face visible', () => {
  for (const hairstyle of ['ponytail', 'braid']) {
    const appearance = characterAppearance(normalizeCharacter({ gender: 'woman', hairstyle }));
    const { indices, vertices, slots } = getCharacterMesh(appearance);
    const visibleSlot = (ray: Ray) => {
      let nearest = Infinity;
      let slot: number | undefined;
      for (let i = 0; i < indices.length; i += 3) {
        const distance = rayTriangleAt(ray, vertices, i * 6, 6, indices);
        if (distance !== null && distance < nearest) {
          nearest = distance;
          slot = slots[indices[i]];
        }
      }
      return slot;
    };
    const hair = visibleSlot({ origin: [0, 2, -0.018], dir: [0, -1, 0] });
    const face = visibleSlot({ origin: [0, 1.55, 1], dir: [0, 0, -1] });
    assert.notEqual(hair, undefined, hairstyle);
    assert.notEqual(face, undefined, hairstyle);
    assert.notEqual(face, hair, hairstyle);
    assert.equal(visibleSlot({ origin: [-1, 1.515, -0.065], dir: [1, 0, 0] }), hair, hairstyle);
    assert.equal(visibleSlot({ origin: [1, 1.515, -0.065], dir: [-1, 0, 0] }), hair, hairstyle);
    assert.equal(visibleSlot({ origin: [-0.066, 1.467, -1], dir: [0, 0, 1] }), hair, hairstyle);
    assert.equal(visibleSlot({ origin: [1, 1.56, 0.01], dir: [-1, 0, 0] }), face, hairstyle);
  }
});

test('human mouths sit below the nose and curve upward at the corners', () => {
  for (const female of [false, true]) {
    const { indices, vertices, shades } = getCharacterMesh({ female });
    const shadeAt = (x: number, y: number) => {
      const ray: Ray = { origin: [x, y, 1], dir: [0, 0, -1] };
      let nearest = Infinity;
      let shade;
      for (let i = 0; i < indices.length; i += 3) {
        const distance = rayTriangleAt(ray, vertices, i * 6, 6, indices);
        if (distance !== null && distance < nearest) {
          nearest = distance;
          shade = shades[indices[i]];
        }
      }
      return shade;
    };
    const mouth = shadeAt(0, 1.49);
    assert.ok(mouth !== undefined && mouth < 0.8);
    assert.equal(shadeAt(-0.035, 1.498), mouth);
    assert.equal(shadeAt(0.035, 1.498), mouth);
    assert.equal(shadeAt(0, 1.498), 1);
    assert.equal(shadeAt(0, 1.52), 1);
  }
});

test('only NPCs with an Attack action display combat levels, and Examine never includes one', () => {
  for (const npc of [
    { police: true },
    { kind: 'founder' },
    { kind: 'burger-clerk' },
    { questRole: 'clerk' },
    { child: true },
    { researcher: true },
    { kind: 'banker' },
    { parrot: true },
  ]) {
    Object.assign(npc, { label: 'Friendly local' });
    assert.equal(npcOffersAttack(npc), false);
    assert.equal(npcDisplayLabel(npc, { level: 10 }), 'Friendly local');
  }
  for (const npc of [
    { label: 'Man' },
    { label: 'Cow', combatKind: 'cow' },
    { label: 'Friendly bear', wilderness: true },
  ]) {
    assert.equal(npcOffersAttack(npc), true);
    assert.match(npcDisplayLabel(npc, { level: 10 }), /Level 10/);
    assert.equal(npcDisplayLabel(npc, { combat: false, level: 10 }), npc.label);
  }
  assert.equal(
    npcDisplayLabel({ label: 'Woman' }, { revealed: true, combat: false, level: 10 }),
    'Alien',
  );
});

test('walking comes first in ordinary menus while ground items retain Take as their default', () => {
  const menu = (labels: string[]) => ({
    buttons: labels.map((textContent) => ({ textContent })),
    querySelectorAll() {
      return this.buttons;
    },
    insertBefore(item: { textContent: string }, before: { textContent: string }) {
      this.buttons.splice(this.buttons.indexOf(item), 1);
      this.buttons.splice(this.buttons.indexOf(before), 0, item);
    },
  });
  const citizen = menu(['Talk-To Ray', 'Examine Ray', 'Walk here'] satisfies [
    string,
    string,
    string,
  ]);
  promoteWalkAction(citizen as unknown as HTMLDivElement);
  assert.equal(citizen.buttons[0].textContent, 'Walk here');
  const loot = menu(['Take Peptide', 'Examine Peptide', 'Walk here'] satisfies [
    string,
    string,
    string,
  ]);
  promoteWalkAction(loot as unknown as HTMLDivElement);
  assert.equal(loot.buttons[0].textContent, 'Take Peptide');
});
