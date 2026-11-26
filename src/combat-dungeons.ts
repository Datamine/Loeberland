import { LAB_FLOOR, LAB_INSTANCE, LAB_NAV } from './berkeley-lab.ts';
import { INCUBATOR_CAVE, INCUBATOR_FLOOR, INCUBATOR_NAV } from './goblin-incubator-cave.ts';
import { instanceContains } from './map-instances.ts';

const dungeons = [
  { instance: LAB_INSTANCE, floor: LAB_FLOOR + 0.025, nav: LAB_NAV },
  { instance: INCUBATOR_CAVE, floor: INCUBATOR_FLOOR + 0.025, nav: INCUBATOR_NAV },
];

export const combatDungeon = (kind?: string) =>
  dungeons.find(({ instance }) => instance.kind === kind);
export const combatDungeonAt = (x: number, z: number) =>
  dungeons.find(({ instance }) => instanceContains(instance, x, z));
