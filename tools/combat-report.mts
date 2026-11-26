import { requiredValue } from '../src/types/assert.ts';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { ITEM_STATS, isProjectileWeapon, weaponAttackInterval } from '../src/item-stats.ts';
import { weaponDamageRange, rollWeaponDamage } from '../src/combat.ts';

export function combatRandomStream(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
export function weaponExpectation(
  level: number | undefined,
  weapon: string | undefined,
  { inebriation = 0, defense = 0, distance = 0 } = {},
) {
  const { min, max, accuracy } = weaponDamageRange(level, weapon, inebriation, distance),
    count = max - min + 1;
  let sum = 0,
    squares = 0;
  for (let hit = min; hit <= max; hit++) {
    const damage = Math.max(0, hit - defense);
    sum += damage;
    squares += damage * damage;
  }
  const average = (accuracy * sum) / count,
    variance = (accuracy * squares) / count - average ** 2;
  return {
    min,
    max,
    accuracy,
    average,
    variance,
    dps: average / weaponAttackInterval(weapon ?? 'unarmed', { ownedEquipment: [] }),
  };
}
export function combatReport({
  levels = Array.from({ length: 10 }, (_, i) => i + 1),
  samples = 100000,
  inebriation = 0,
  defense = 0,
  atMaxRange = false,
} = {}) {
  return levels.flatMap((level) =>
    Object.entries(ITEM_STATS)
      .filter(([, item]) => item.slot === 'weapon')
      .map(([weapon, item], i) => {
        const distance = atMaxRange ? (item.range ?? 0) : 0;
        const expected = weaponExpectation(level, weapon, { inebriation, defense, distance }),
          random = combatRandomStream(87654321 + level * 103 + i * 7919);
        let total = 0,
          hits = 0;
        for (let n = 0; n < samples; n++) {
          const hit = rollWeaponDamage(level, weapon, random, inebriation, distance);
          if (hit) hits++;
          total += Math.max(0, hit - defense);
        }
        return {
          weapon: item.name,
          weaponId: weapon,
          strengthLevel: level,
          samples,
          min: expected.min,
          max: expected.max,
          attackSeconds: item.interval,
          distance,
          expectedAccuracy: expected.accuracy,
          observedAccuracy: hits / samples,
          expectedAverageDamage: expected.average,
          averageDamage: total / samples,
          expectedDPS: expected.dps,
          observedDPS: total / samples / requiredValue(item.interval, 'weapon attack interval'),
          standardError: Math.sqrt(expected.variance / samples),
          inebriation,
          defense,
        };
      }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const levels = [1, 5, 10, 25, 50];
  const atMaxRange = process.argv.includes('--max-range');
  const rows = combatReport({ levels, atMaxRange });
  console.table(
    rows
      .map((r) => ({
        weapon: r.weapon,
        strength: r.strengthLevel,
        damage: r.min + '–' + r.max,
        distance: r.distance,
        accuracy: (r.expectedAccuracy * 100).toFixed(1) + '%',
        average: r.averageDamage.toFixed(3),
        DPS: r.observedDPS.toFixed(3),
        expectedDPS: r.expectedDPS.toFixed(3),
      })),
  );
  const at = process.argv.indexOf('--output');
  if (at !== -1) {
    const report = atMaxRange
      ? rows
      : [
          ...rows,
          ...combatReport({ levels, atMaxRange: true }).filter((row) =>
            isProjectileWeapon(row.weaponId),
          ),
        ].sort((a, b) => a.strengthLevel - b.strengthLevel || a.distance - b.distance);
    const columns = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
    await writeFile(
      process.argv[at + 1],
      columns.join(',') +
        '\n' +
        report.map((row) => columns.map((key) => row[key]).join(',')).join('\n') +
        '\n',
    );
  }
  console.log(
    '100,000 rolls per weapon/level; average includes misses. DPS assumes continuous attacks, no movement, armor, or target resistances. Spectres require a bayonet; the kraken requires a railgun.',
  );
}
