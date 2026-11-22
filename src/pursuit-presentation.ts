import type { NetworkPoliceOfficer } from './types/network.ts';
export interface PursuitActorView {
  index?: number;
  x?: number;
  y?: number;
  z?: number;
  angle?: number;
  phase?: string | number;
  travel?: number;
  moving?: boolean;
  hp?: number;
  max?: number;
}
export interface PoliceView {
  officers: PursuitActorView[];
  wanted?: boolean;
  jailed?: boolean;
  elapsed?: number;
}
export interface KeeperView {
  actor: PursuitActorView;
  phase?: string;
  elapsed?: number;
}
export interface ZooView {
  tiger: PursuitActorView;
  wardens: PursuitActorView[];
  phase?: string;
  elapsed?: number;
  gate?: number;
}
export interface PersonalPursuits {
  police?: Partial<PoliceView> | null;
  keeper?: Partial<KeeperView> | null;
}
interface WorldPursuits {
  police?: NetworkPoliceOfficer[];
  tiger?: ZooView | null;
  raptor?: object | null;
}
interface PursuitOptions {
  police?: { state: PoliceView };
  keeper?: { state: KeeperView };
  zoo?: { state: ZooView };
  raptor?: object;
  now?: () => number;
}
import { createActorMotionGroup } from './snapshot-motion.ts';

/** Read models for chases. Routes, captures and damage remain server-owned. */
export function createPursuitPresentation({
  police,
  keeper,
  zoo,
  raptor,
  now,
}: PursuitOptions = {}) {
  const motion = createActorMotionGroup({ now });
  const publicPolice = new Map<string, NetworkPoliceOfficer>();
  let lastPolice: PersonalPursuits['police'] = null,
    lastKeeper: PersonalPursuits['keeper'] = null,
    lastZoo: WorldPursuits['tiger'] = null,
    lastRaptor: WorldPursuits['raptor'] = null;
  function actors(
    prefix: string,
    previous: PursuitActorView[],
    incoming: PursuitActorView[],
    time: number,
  ) {
    const byId = new Map(previous.map((n) => [n.index, n])),
      active = new Set<string>();
    const result = incoming.map((source) => {
      const id = prefix + source.index,
        target = byId.get(source.index) || {};
      active.add(id);
      motion.accept(id, target, source, time);
      return target;
    });
    motion.retain(active, prefix);
    return result;
  }
  function syncPersonal(state: PersonalPursuits, time: number) {
    if (police && state.police && state.police !== lastPolice) {
      lastPolice = state.police;
      const { officers, ...flags } = state.police;
      Object.assign(police.state, flags);
      police.state.officers = actors('police/', police.state.officers, officers || [], time);
    }
    if (keeper && state.keeper && state.keeper !== lastKeeper) {
      lastKeeper = state.keeper;
      const { actor, ...flags } = state.keeper;
      Object.assign(keeper.state, flags);
      if (actor) motion.accept('keeper', keeper.state.actor, actor, time);
    }
  }
  function syncWorld(state: WorldPursuits, time: number) {
    const active = new Set<string>();
    for (const source of state.police || []) {
      const id = source.id;
      const target = publicPolice.get(id) || { ...source };
      active.add(id);
      motion.accept(id, target, source, time);
      publicPolice.set(id, target);
    }
    for (const id of publicPolice.keys()) if (!active.has(id)) publicPolice.delete(id);
    motion.retain(active, 'police-');
    if (zoo && state.tiger !== lastZoo) {
      lastZoo = state.tiger;
      if (state.tiger) {
        const { tiger, wardens, ...flags } = state.tiger;
        // Retain render objects; never mutate objects held in client.state.
        motion.accept('zoo', zoo.state, flags, time);
        motion.accept('tiger', zoo.state.tiger, tiger, time);
        zoo.state.wardens = actors('warden/', zoo.state.wardens, wardens || [], time);
      } else {
        zoo.state.wardens = [];
        motion.retain(new Set(), 'warden/');
        motion.retain(new Set(), 'tiger');
        motion.retain(new Set(), 'zoo');
      }
    }
    if (raptor && state.raptor && state.raptor !== lastRaptor) {
      lastRaptor = state.raptor;
      motion.accept('raptor', raptor, state.raptor, time);
    }
  }
  return {
    syncPersonal,
    syncWorld,
    publicPolice,
    update: (connected: boolean) => motion.update(connected),
    clear() {
      motion.clear();
      publicPolice.clear();
      if (zoo) zoo.state.wardens = [];
      lastPolice = lastKeeper = lastZoo = lastRaptor = null;
    },
  };
}
