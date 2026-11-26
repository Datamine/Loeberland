import { itemLoot } from './item-stats.ts';
import { MONSTER_STATS, MONSTER_DROPS } from './config/monster-drops.ts';
import { LIGHT_CRYSTAL } from './config/lightsaber.ts';
export { MONSTER_STATS, MONSTER_DROPS };

const dropRandom = (random: () => number) =>
  Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0));
export function rollMonsterDrops(
  kind: string,
  random = Math.random,
  level = MONSTER_STATS[kind]?.level ?? 0,
) {
  const drops = [];
  for (const rule of MONSTER_DROPS[kind] || []) {
    if (rule.oneIn > 1 && dropRandom(random) >= 1 / rule.oneIn) continue;
    const id =
      rule.item !== undefined
        ? rule.item
        : rule.choose[Math.floor(dropRandom(random) * rule.choose.length)];
    drops.push(itemLoot(id, rule.amount || 1));
  }
  if (level > 0 && dropRandom(random) < level / 3000) drops.push(itemLoot(LIGHT_CRYSTAL));
  return drops;
}
