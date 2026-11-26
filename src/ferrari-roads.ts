import type { WorldPoint } from './types/geometry.ts';
import type { StreetNetwork, TrafficEdge } from './types/roads.ts';

type ConnectedNetwork = StreetNetwork & { component: Int32Array };
const streetNetworks = new WeakMap<StreetNetwork, ConnectedNetwork>();

function connectedStreets(source: StreetNetwork | null | undefined) {
  if (!source?.nodes.length || !source.edges.length) return null;
  const cached = streetNetworks.get(source);
  if (cached) return cached;
  const component = new Int32Array(source.nodes.length).fill(-1);
  for (let start = 0; start < component.length; start++) {
    if (component[start] !== -1) continue;
    const pending = [start];
    component[start] = start;
    for (let i = 0; i < pending.length; i++) {
      for (const next of source.nodes[pending[i]].neighbors) {
        if (component[next] !== -1) continue;
        component[next] = start;
        pending.push(next);
      }
    }
  }
  const result = { ...source, component };
  streetNetworks.set(source, result);
  return result;
}

function nearestStreet(network: ConnectedNetwork, x: number, z: number, component?: number) {
  let score = Infinity;
  let street: TrafficEdge | undefined;
  for (const edge of network.edges) {
    if (component !== undefined && network.component[edge.from] !== component) continue;
    const a = network.nodes[edge.from],
      b = network.nodes[edge.to],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const candidate = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (candidate < score) {
      score = candidate;
      street = edge;
    }
  }
  return { score, street };
}

/** Identify clicks on the street network attached to the west end of the bridge. */
export function createCityStreetDistance({
  gate,
  traffic,
}: {
  gate: WorldPoint;
  traffic: () => StreetNetwork | null | undefined;
}) {
  let current: ConnectedNetwork | null = null;
  let component: number | undefined;
  return (x: number, z: number) => {
    const next = connectedStreets(traffic());
    if (next !== current) {
      current = next;
      const near = next && nearestStreet(next, gate.x, gate.z);
      component =
        near?.street && near.score <= 0.4 ** 2 ? next!.component[near.street.from] : undefined;
    }
    return current && component !== undefined
      ? nearestStreet(current, x, z, component).score
      : Infinity;
  };
}
