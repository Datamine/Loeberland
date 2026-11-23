import assert from 'node:assert/strict';
import test from 'node:test';
import { actionTargetKind, orderPrimaryActions } from '../src/context-menu.ts';
import { ATV_RAMP_KIND } from '../src/atv.ts';
import { AIRSHIP_TRAVELER } from '../src/airship-rope.ts';
import { MARKET_STREETCAR } from '../src/market-streetcar.ts';
import { projectCatalog } from '../editor/project.mts';
import { entityDialogueVariant, menuFromContent } from '../src/content-game.ts';
import { CONTENT } from '../src/content-runtime.ts';
import { describeCharacter } from '../src/descriptions.ts';
import { npcContextActions, npcDisplayLabel, npcPrimaryVerb } from '../src/npc-interactions.ts';
import { createInteractions } from '../src/world/interactions.ts';
import { applyWorldEdits } from '../src/world-edits.ts';
import type { WorldContext } from '../src/world/scene.ts';
import type { Actor } from '../src/types/world.ts';

test('Bani uses the editor identity when selected as a character or a sight', () => {
  const bani: Pick<Actor, 'id' | 'label' | 'editorKey'> = {
    id: 'nia',
    label: 'Bani · Mazarine Coffee',
  };
  const sight = { id: 'nia', label: 'Bani · café regular', description: '', kind: 'guest' };
  applyWorldEdits({ sights: [sight], niaCitizen: bani });
  assert.equal(bani.editorKey, 'sight:nia');
  assert.equal(npcDisplayLabel(bani), sight.label);
  assert.equal(describeCharacter(bani), sight.description);
  assert.equal(npcPrimaryVerb(bani), 'talk');
  assert.deepEqual(npcContextActions(bani), ['talk', 'walk', 'examine']);
  let directHit = true;
  const { worldTarget, primaryWorldAction } = createInteractions({
    niaCitizen: bani,
    sights: [sight],
    pick: () => (directHit ? { sight } : null),
    hitCitizen: () => (directHit ? null : bani),
    flying: () => false,
    clearAt: () => true,
    tileAt: () => ({ x: 45, y: 29 }),
  } as unknown as WorldContext);
  for (const direct of [true, false]) {
    directHit = direct;
    const target = worldTarget(20, 20);
    assert.equal(target.sight, sight);
    assert.equal(target.npc, null);
    const primary = primaryWorldAction(target);
    const bindings = new Map([
      [primary.id, {}],
      ['walk', {}],
      ['examine', {}],
    ]);
    const menu = menuFromContent(target.sight, bindings, {});
    assert.deepEqual(
      menu?.map(({ label }) => label),
      ['Walk here', primary.label, 'Examine ' + sight.label],
    );
    assert.equal(primary.label, 'Talk to ' + sight.label);
  }

  const record = projectCatalog(CONTENT).records.find(({ key }) => key === bani.editorKey);
  assert.equal(record?.dialogues.length, 2);
  assert.equal(record?.dialogues[0].dialogue?.sharedPool, true);
  const inside = entityDialogueVariant(bani.editorKey, { activities: { insideTarget: true } });
  assert.equal(inside?.id, record?.dialogues[0].id);
  const outside = entityDialogueVariant(bani.editorKey, { activities: { insideTarget: false } });
  assert.equal(outside?.id, record?.dialogues[1].id);
  assert.match(outside?.speech ?? '', /Borrow the bicycle/);
});

test('the delivery cooler can be examined as an NPC during a delivery', () => {
  const cooler = { id: 'delivery-cooler', label: 'DoorDash Cooler', kind: 'delivery-cooler' };
  assert.equal(npcPrimaryVerb(cooler), 'examine');
  assert.deepEqual(npcContextActions(cooler), ['examine']);
  const menu = menuFromContent('actor:delivery-cooler', new Map([['npc.examine', {}]]), {});
  assert.equal(menu?.[0].label, 'Examine DoorDash Cooler');
  assert.match(describeCharacter(cooler) || '', /cooler on wheels/);
});

test('clicking the cable car while aboard uses the shared exit action and the standard object color', () => {
  const calls: unknown[][] = [];
  const { primaryWorldAction, streetcarExit } = createInteractions({
    multiplayerWorld: {
      selfMode: 'streetcar',
      command: (...args: unknown[]) => calls.push(args),
    },
  } as unknown as WorldContext);
  const action = primaryWorldAction({
    sx: 0,
    sy: 0,
    npc: null,
    sight: MARKET_STREETCAR,
    place: null,
    tile: { x: 0, y: 0 },
    researchRoom: false,
  });
  assert.equal(action, streetcarExit);
  assert.deepEqual(action.target, { label: 'cable car', kind: 'object' });
  action.run();
  assert.deepEqual(calls, [['travel', { kind: 'streetcarExit' }]]);
});

test('the airship traveler can be clicked to talk from the basket and has only peaceful actions', () => {
  for (const label of ['Man', 'Woman']) {
    const npc = { id: AIRSHIP_TRAVELER, kind: AIRSHIP_TRAVELER, label, x: 0, z: 0 };
    const context = {
      pick: () => ({ npc }),
      flying: () => true,
      npcPrimary: npcPrimaryVerb,
      npcLabel: npcDisplayLabel,
      tileAt: () => assert.fail('a traveler click must not become a flight destination'),
    };
    const { worldTarget, primaryWorldAction } = createInteractions(
      context as unknown as WorldContext,
    );
    assert.equal(primaryWorldAction(worldTarget(20, 20)).label, 'Talk-To ' + label);
    assert.deepEqual(npcContextActions(npc), ['talk', 'examine']);
    assert.equal(npcDisplayLabel(npc), label);
  }
});

test('Cotogna and Rich Table diners offer conversation without a level or hostile actions', () => {
  for (const [id, label] of [
    ['cotogna-diner-2', 'Cotogna Diner'],
    ['cotogna-diner-3', 'Cotogna Diner'],
    ['rich-table-diner-0', 'Rich Table Diner'],
    ['rich-table-diner-1', 'Rich Table Diner'],
  ]) {
    const diner = { id, label };
    const actions = npcContextActions(diner);
    assert.equal(npcDisplayLabel(diner), diner.label);
    assert.equal(npcPrimaryVerb(diner), 'talk');
    assert.deepEqual(actions, ['talk', 'walk', 'examine']);
    const bindings = new Map(actions.map((action) => ['npc.' + action, {}]));
    const menu = menuFromContent('actor:' + id, bindings, {});
    assert.equal(menu?.find(({ action }) => action === 'npc.talk')?.label, 'Talk-To ' + label);
    assert.ok(menu?.every(({ label }) => !label.includes('Level')));
  }
});

test('the primary action is shared by NPCs, vehicles, objects, and walkable surfaces', () => {
  const player = { x: 40, y: 40 };
  const context = {
    player,
    ferrari: { state: { riding: false } },
    motorcycle: { state: { rented: false } },
    zoo: { state: { phase: 'caged' } },
    sunglasses: { state: { owned: false } },
    surf: { state: { riding: false } },
    gymSelection: 'bench',
    activeInstituteRoom: () => null,
    flying: () => false,
    clearAt: () => true,
    regionalRoad: { targetAt: () => ({ x: 40, y: 40 }) },
    npcPrimary: () => 'talk',
    npcLabel: () => 'Goblin furniture maker',
  };
  const { primaryWorldAction } = createInteractions(context as unknown as WorldContext);
  const target = {
    sx: 0,
    sy: 0,
    npc: null,
    sight: null,
    place: null,
    tile: { x: 40, y: 40 },
    researchRoom: false,
  };
  const site = (kind: string, id = kind) => ({ id, kind, label: kind });
  const action = (kind: string, id?: string) =>
    primaryWorldAction({ ...target, sight: site(kind, id) }).id;

  assert.equal(action('ferrari'), 'interaction.28');
  assert.equal(actionTargetKind({ id: 'ferrari-car', kind: 'ferrari' }), 'object');
  assert.equal(actionTargetKind({ id: 'called-waymo', kind: 'called-waymo' }), 'object');
  assert.equal(actionTargetKind(MARKET_STREETCAR), 'object');
  assert.equal(actionTargetKind({ kind: 'fishing', editorCategory: 'object' }), 'object');
  assert.equal(actionTargetKind({ kind: 'sand', editorCategory: 'object' }), 'item');
  assert.equal(actionTargetKind({ kind: 'sunglasses' }), 'item');
  assert.equal(actionTargetKind({ id: 'nia', kind: 'guest', editorCategory: 'object' }), 'npc');
  assert.equal(actionTargetKind({ kind: 'wild-tiger' }), 'npc');
  assert.equal(actionTargetKind({ id: 'personal-b2', kind: 'stealth-bomber' }), 'object');
  assert.equal(actionTargetKind({ kind: 'stealth-bomber' }), 'object');
  assert.equal(action('robotaxi'), 'taxi.kick');
  assert.equal(action('waymo'), 'taxi.kick');
  assert.equal(action('bike'), 'interaction.31');
  assert.equal(action('motorcycle'), 'examine');
  context.motorcycle.state.rented = true;
  assert.equal(action('motorcycle'), 'interaction.20');
  assert.equal(action('fishing'), 'interaction.18');
  assert.deepEqual(primaryWorldAction({ ...target, sight: site('fishing') }).target, {
    label: 'live fish',
    kind: 'item',
  });
  assert.equal(action('loot'), 'interaction.10');
  assert.equal(action('house-storage'), 'interaction.8');
  assert.equal(action('nightlife'), 'nightlife.enter');
  assert.equal(action('restaurant', 'cotogna'), 'examine');
  assert.equal(action('bridge'), 'walk');
  assert.equal(action('park'), 'walk');
  assert.equal(action('gym'), 'gym.bench');
  assert.equal(action('zoo'), 'interaction.23');
  context.zoo.state.phase = 'loose';
  assert.equal(action('zoo'), 'examine');
  const npc = { id: 'tam-furniture-maker', label: 'Goblin furniture maker', x: 40, z: 40 };
  assert.equal(primaryWorldAction({ ...target, npc }).id, 'npc.talk');

  context.ferrari.state.riding = true;
  assert.equal(action('ferrari'), 'interaction.28', 'the occupied Ferrari can be clicked to park');
  assert.equal(primaryWorldAction(target).id, 'ferrari.drive-here');
});

test('Ferrari keeps Drive / park, Walk here, and Examine above optional actions', () => {
  const buttons: HTMLButtonElement[] = [];
  const makeButton = (id: string) =>
    ({
      dataset: { actionId: id },
      get nextElementSibling() {
        return buttons[buttons.indexOf(this as unknown as HTMLButtonElement) + 1] || null;
      },
    }) as unknown as HTMLButtonElement;
  const menu = {
    querySelectorAll: () => [...buttons],
    insertBefore(button: HTMLButtonElement, next: HTMLButtonElement | null) {
      const old = buttons.indexOf(button);
      if (old !== -1) buttons.splice(old, 1);
      buttons.splice(next ? buttons.indexOf(next) : buttons.length, 0, button);
    },
  } as unknown as HTMLElement;
  buttons.push(makeButton('examine'), makeButton('interaction.29'), makeButton('walk'));
  orderPrimaryActions(menu, makeButton('interaction.28'), ['walk', 'examine']);
  assert.deepEqual(
    buttons.map((button) => button.dataset.actionId),
    ['interaction.28', 'walk', 'examine', 'interaction.29'],
  );
});

test('clicking a picked ramp while mounted sends that ramp’s ID', () => {
  const ramp = { id: 'goblin-ramp-east', kind: ATV_RAMP_KIND, label: 'ATV Ramp' };
  const commands: [string, object][] = [];
  const context = {
    pick: () => ({ sight: ramp }),
    tileAt: () => assert.fail('a ramp click should not become a ground destination'),
    multiplayerWorld: {
      selfMode: 'atv',
      command: (action: string, args: object) => commands.push([action, args]),
    },
  };
  const { worldTarget, primaryWorldAction } = createInteractions(
    context as unknown as WorldContext,
  );
  const action = primaryWorldAction(worldTarget(40, 60));
  assert.equal(action.label, 'Jump ATV Ramp');
  action.run();
  assert.deepEqual(commands, [['travel', { kind: 'atvJump', id: ramp.id }]]);
});

test('a directly picked vehicle wins over nearby actors and stays selected through release', () => {
  const ferrari = { id: 'ferrari-car', kind: 'ferrari', label: 'Ferrari' };
  const pedestrian = { id: 'pedestrian', label: 'Man', x: 10, z: 10 };
  let moving = false;
  const context = {
    pick: () => (moving ? { npc: pedestrian } : { sight: ferrari }),
    hitCitizen: () => pedestrian,
  };
  const { worldTarget } = createInteractions(context as unknown as WorldContext);
  const pressed = worldTarget(20, 20);
  assert.equal(pressed.sight, ferrari);
  assert.equal(pressed.npc, null);
  moving = true;
  assert.equal(worldTarget(20, 20, pressed).sight, ferrari);
  assert.equal(worldTarget(20, 20, pressed).npc, null);
});

test('clicking the rope from the airship opens rope options and sends the climb-down command', (t) => {
  const rope = {
    id: 'shared-airship-rope',
    kind: 'airship-rope',
    label: 'Airship rope',
    entry: { x: 20, y: 20 },
  };
  const commands: [string, object?][] = [];
  type MenuElement = {
    textContent: string;
    dataset: Record<string, string>;
    children: MenuElement[];
    replaceChildren(): void;
    append(child: MenuElement): void;
    click?: () => void;
    focus(): void;
    setAttribute(): void;
    addEventListener(event: string, fn: () => void): void;
  };
  const buttons: MenuElement[] = [];
  const menu = {
    hidden: true,
    style: {},
    offsetWidth: 100,
    offsetHeight: 100,
    replaceChildren: () => (buttons.length = 0),
    append: (button: (typeof buttons)[number]) => buttons.push(button),
    querySelector: () => buttons[1],
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        textContent: '',
        dataset: {},
        children: [],
        replaceChildren(this: MenuElement) {
          this.children.length = 0;
          this.textContent = '';
        },
        append(this: MenuElement, child: MenuElement) {
          this.children.push(child);
          this.textContent += child.textContent;
        },
        focus() {},
        setAttribute() {},
        addEventListener(this: (typeof buttons)[number], _event: string, fn: () => void) {
          this.click = fn;
        },
      }),
    },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const context = {
    width: 800,
    height: 600,
    $: () => menu,
    canvas: { focus() {} },
    player: { x: 20, y: 20 },
    airship: { state: { active: true } },
    rope: { state: { deployed: true } },
    rocket: { state: { active: false } },
    surf: { state: { jump: false } },
    tahoe: { state: { mode: 'ground' } },
    multiplayer: { state: { id: 2 } },
    multiplayerWorld: {
      sharedAirship: { captain: 1 },
      command: (action: string, args?: object) => commands.push([action, args]),
    },
    pick: () => ({ sight: { id: 'airship', label: 'Airship' } }),
    hitSight: () => rope,
    flying: (): boolean => context.airship.state.active,
    clearAt: () => true,
    tileAt: () =>
      context.airship.state.active
        ? assert.fail('An airship rope click must not become a flight destination')
        : { x: 20, y: 20 },
  };
  const { worldTarget, primaryWorldAction, showMenu } = createInteractions(
    context as unknown as WorldContext,
  );
  const action = primaryWorldAction(worldTarget(400, 300));
  assert.equal(action.label, 'Rope options');
  action.run();
  assert.equal(buttons[0].children[0].dataset.kind, 'object');
  assert.deepEqual(
    buttons.slice(1).map((button) => button.textContent),
    ['Climb down'],
  );
  buttons[1].click?.();
  assert.deepEqual(commands.pop(), ['airshipClimbDown', undefined]);

  context.multiplayer.state.id = 1;
  showMenu(400, 300);
  assert.deepEqual(
    buttons.slice(1).map((button) => button.textContent),
    ['Climb down', 'Offer a ride · 5 coins', 'Retract rope'],
  );
  assert.equal(buttons[3].children[1].dataset.kind, 'object');
  buttons[3].click?.();
  assert.deepEqual(commands.pop(), ['airshipRope', { retract: true }]);

  context.airship.state.active = false;
  const groundAction = primaryWorldAction(worldTarget(400, 300));
  assert.equal(groundAction.label, 'Climb up airship rope');
  groundAction.run();
  assert.deepEqual(commands.pop(), ['airshipClimbUp', undefined]);
});
