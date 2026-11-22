import assert from 'node:assert/strict';
import test from 'node:test';
import { actionTargetKind, orderPrimaryActions } from '../src/context-menu.ts';
import { menuFromContent } from '../src/content-game.ts';
import { npcContextActions, npcDisplayLabel, npcPrimaryVerb } from '../src/npc-interactions.ts';
import { createInteractions } from '../src/world/interactions.ts';
import type { WorldContext } from '../src/world/scene.ts';

test('Bani has no combat level or hostile menu actions', () => {
  const bani = { id: 'nia', label: 'Bani' };
  assert.equal(npcDisplayLabel(bani), 'Bani');
  assert.equal(npcPrimaryVerb(bani), 'talk');
  assert.deepEqual(npcContextActions(bani), ['talk', 'walk', 'examine']);
});

test('Cotogna and Rich Table diners offer conversation without a level or hostile actions', () => {
  for (const [id, label] of [
    ['cotogna-diner-2', 'Cotogna diner'],
    ['cotogna-diner-3', 'Cotogna diner'],
    ['rich-table-diner-0', 'Rich Table diner'],
    ['rich-table-diner-1', 'Rich Table diner'],
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
  assert.equal(actionTargetKind({ id: 'ferrari-car', kind: 'ferrari' }), 'personal-item');
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
