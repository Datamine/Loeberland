import { combatDungeonAt } from './combat-dungeons.ts';
import { CHURCH_STAIRS_DOWN, CHURCH_STAIRS_UP, inChurchBasement } from './church-basement-layout.ts';
import { requiredValue } from './types/assert.ts';
import type { WorldModel } from './types/server.ts';
import type { Point } from './types/geometry.ts';

import { auditNavigationGrid } from './navigation.ts';
import { SOUTHERN_TRAILS } from './southern-layout.ts';
import { SF_ZOO } from './zoo.ts';
import { auditInteractionApproaches } from './interaction-audit.ts';
import { ONODA, ONODA_DOCK } from './onoda-island.ts';
import { GOBLIN_CATAPULT } from './config/goblin-catapult.ts';

/** Contracts describe intended access, rather than recording positions from a
 * browser session. They are evaluated against a freshly built production map. */
export function auditWorldNavigation(world: WorldModel) {
  const graph = auditNavigationGrid(world.navigation),
    interactions = auditInteractionApproaches(world),
    errors = [...graph.errors, ...interactions.errors],
    routes: { id: string; waypoints: number; length: number }[] = [];
  for (const [district, plan] of [
    ['city', world.cityLightPlan],
    ['south', world.southernNeighborhood?.lightPlan],
  ] as const)
    for (const gap of plan?.unlit || [])
      errors.push(
        district + ' street lighting: ' + gap.street + ' has an unlit block ' + gap.block,
      );
  for (const s of world.sights)
    if (
      s.navigationAccess &&
      !(['walk', 'observe-only', 'windsurf'] satisfies [string, string, string]).includes(s.navigationAccess)
    )
      errors.push(s.id + ': unknown navigation access ' + s.navigationAccess);
  const walkableSights = world.sights.filter(
    (s) => s.navigationAccess !== 'observe-only' && s.navigationAccess !== 'windsurf',
  );
  const destinations = [
    ...world.places.flatMap((p) => [
      { id: p.id + ':entrance', point: p.entry },
      { id: p.id + ':inside', point: p.inside },
    ]),
    ...walkableSights.flatMap((s) => [
      { id: s.id, point: s.entry },
      ...(s.inside ? [{ id: s.id + ':inside', point: s.inside }] : []),
    ]),
  ];
  destinations.push(
    ...world.airship.gates.map((p, i) => ({ id: 'airport-gate-' + i, point: p })),
    { id: 'bay-bridge-city-gate', point: world.regionalRoad.gate('city') },
    { id: 'bay-bridge-tahoe-gate', point: world.regionalRoad.gate('tahoe') },
  );
  destinations.push({
    id: 'airship-mooring',
    point: { x: world.airship.home.x - 0.5, y: world.airship.home.z - 0.5 },
  });
  for (const cow of world.expeditions.cows) {
    destinations.push({ id: cow.id + '-pasture', point: { x: cow.x - 0.5, y: cow.z - 0.5 } });
    for (const weapon of ['unarmed', 'railgun'] as const) {
      const point = world.approaches.combat(
        cow,
        weapon,
        requiredValue(
          world.sights.find((s) => s.id === 'south-cow-pen'),
          'Missing authored entity: south-cow-pen',
        ).entry,
      );
      if (point) destinations.push({ id: cow.id + '-' + weapon + '-approach', point });
      else errors.push(cow.id + ': no reachable ' + weapon + ' attack approach');
    }
  }
  destinations.push(
    ...(world.wilderness?.actors || [])
      .filter((n) => !combatDungeonAt(n.x, n.z) && n.id !== ONODA.id)
      .map((n) => ({
        id: n.id + '-encounter',
        point: { x: n.x - 0.5, y: n.z - 0.5 },
      })),
  );
  if (world.marinLand)
    destinations.push(
      ...[
        [15, -15] satisfies [number, number],
        [30, -20] satisfies [number, number],
        [40, -10] satisfies [number, number],
        [0, -25] satisfies [number, number],
        [55, -30] satisfies [number, number],
      ].map(([x, z], i) => ({ id: 'marin-hills-' + i, point: { x: x - 0.5, y: z - 0.5 } })),
    );
  if (world.countryside)
    destinations.push(
      ...[
        [180, -10] satisfies [number, number],
        [350, -150] satisfies [number, number],
        [720, -530] satisfies [number, number],
        [1000, -730] satisfies [number, number],
      ].map(([x, y], i) => ({ id: 'regional-grass-' + i, point: { x, y } })),
    );
  for (const [id, p] of Object.entries(world.tabletDestinations || {}))
    destinations.push({ id: id + '-tablet-arrival', point: { x: p.x - 0.5, y: p.z - 0.5 } });
  for (const [i, trail] of SOUTHERN_TRAILS.entries())
    for (const [j, [x, z]] of trail.points.entries())
      destinations.push({ id: 'southern-trail-' + i + '-' + j, point: { x: x - 0.5, y: z - 0.5 } });
  destinations.push(
    { id: 'tiger-exit', point: SF_ZOO.exit },
    ...SF_ZOO.wardens.map((point, i) => ({ id: 'animal-control-start-' + i, point })),
  );
  const approaches: { id: string; point: Point | null | undefined }[] = [
    { id: 'bunny-petting', point: world.approaches.bunny(world.spawn) },
    { id: 'sutro-ladder', point: world.approaches.sutro(world.spawn) },
    ...world.merchants.map((npc) => ({
      id: npc.id + '-conversation',
      point: world.approaches.merchant(npc),
    })),
  ];
  approaches.push(
    ...(world.parrots || []).map((npc) => ({ id: npc.id + '-conversation', point: npc.approach })),
  );
  for (const a of approaches)
    if (a.point) destinations.push({ id: a.id, point: a.point });
    else errors.push(a.id + ': no valid interaction approach');
  function check(id: string, from: Point, to: Point) {
    const route = world.pathTo(to.x, to.y, from);
    if (!route) {
      errors.push(
        id + ': no route; destination ' + JSON.stringify(world.navigation.describe(to.x, to.y)),
      );
      return;
    }
    let previous = from,
      length = 0;
    for (const p of route) {
      if (!world.clearAt(p.x, p.y) || !world.canTravel(previous.x, previous.y, p.x, p.y)) {
        errors.push(id + ': invalid segment ' + JSON.stringify({ from: previous, to: p }));
        break;
      }
      length += Math.hypot(p.x - previous.x, p.y - previous.y);
      previous = p;
    }
    if (Math.hypot(previous.x - to.x, previous.y - to.y) > 1e-7)
      errors.push(id + ': route ends before its destination');
    routes.push({ id, waypoints: route.length, length: +length.toFixed(2) });
  }
  const basementStairs = world.sights.find((s) => s.id === CHURCH_STAIRS_UP);
  if (basementStairs && !world.sights.some((s) => s.id === CHURCH_STAIRS_DOWN))
    errors.push('The church basement needs an entrance from the chapel.');
  for (const target of destinations) {
    const local = inChurchBasement(target.point.x + 0.5, target.point.y + 0.5);
    const from = local ? basementStairs?.entry : world.spawn;
    if (!from) {
      errors.push(target.id + ': missing church basement stairs');
      continue;
    }
    const origin = local ? 'church basement stairs' : 'spawn';
    check(origin + ' -> ' + target.id, from, target.point);
    check(target.id + ' -> ' + origin, target.point, from);
  }
  const island = world.sights.find((s) => s.id === ONODA_DOCK.id);
  if (island) {
    if (
      !island.launch ||
      !world.surf.path(world.surf.state.launch, island.launch) ||
      !world.surf.path(island.launch, world.surf.state.launch)
    )
      errors.push('Onoda Island needs a windsurf route in both directions');
    const encounter = { x: ONODA.x - 0.5, y: ONODA.z - 0.5 };
    check('Onoda Island landing -> encounter', island.entry, encounter);
    check('Onoda encounter -> island landing', encounter, island.entry);
  }
  const city = walkableSights.filter((s) => world.navigation.cellAt(s.entry.x, s.entry.y) >= 0);
  if (world.sights.some((site) => site.id === GOBLIN_CATAPULT.id) && world.esotericCampus) {
    const { u, v } = GOBLIN_CATAPULT.landing;
    const { x, z } = world.esotericCampus.point(u, v);
    check('Berkeley experiment landing -> spawn', { x: x - 0.5, y: z - 0.5 }, world.spawn);
  }
  const spawnRegion = world.navigation.regionAt(world.spawn.x, world.spawn.y);
  for (const s of city)
    if (world.navigation.regionAt(s.entry.x, s.entry.y) !== spawnRegion)
      errors.push(s.id + ': destination snapped into a disconnected component');
  // Corner-to-corner regional journeys exercise all real city/airport/highway/
  // Tahoe adapters in series, using no stubbed cityPath or movement simulation.
  const byId = (id: string) =>
    requiredValue(
      world.sights.find((s) => s.id === id),
      'Audit destination ' + id,
    ).entry;
  check('zoo -> Tahoe spaceport', byId('zoo'), byId('tahoe-spaceport'));
  check('Tahoe spaceport -> zoo', byId('tahoe-spaceport'), byId('zoo'));
  check('airport spaceport -> UCSF', byId('sf-spaceport'), byId('ucsf'));
  check('UCSF -> airport spaceport', byId('ucsf'), byId('sf-spaceport'));
  return {
    ok: graph.ok && !errors.length,
    errors,
    graph,
    interactions,
    destinations: destinations.length,
    routes,
    observations: world.sights
      .filter((s) => s.navigationAccess === 'observe-only')
      .map((s) => s.id),
  };
}
