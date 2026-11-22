import { Mesh, pose } from './geometry.ts';
import type { Actor, RenderedSite, Site } from './types/world.ts';
import type { WorldPoint } from './types/geometry.ts';
import { BURNING_MAN } from './burning-man.ts';

const guests = [
  {
    name: 'Saffron',
    u: -9.8,
    v: 6.7,
    approachV: 7.55,
    shirt: '#f0398f',
    pants: '#45dcbb',
    hair: '#7333aa',
    hat: 'wizard',
    sunglasses: true,
    coat: true,
  },
  {
    name: 'Lumen',
    u: -7.15,
    v: 4.9,
    approachV: 4.05,
    shirt: '#e79425',
    pants: '#a946b8',
    hair: '#33aabb',
    hat: 'cavalier',
    seated: true,
  },
  {
    name: 'Patch',
    u: -6.2,
    v: 6.45,
    approachV: 7.3,
    shirt: '#68e542',
    pants: '#dd377c',
    hair: '#c13a83',
    hat: 'crown',
    sunglasses: true,
    seated: true,
  },
  {
    name: 'Juno',
    u: -9.35,
    v: 8.7,
    approachV: 9.55,
    shirt: '#7b43dc',
    pants: '#f5cc45',
    hair: '#23967e',
    hat: 'top-hat',
    coat: true,
  },
] as const;

function straw(m: Mesh, x: number, z: number) {
  m.box(x - 0.47, 0.021, z - 0.47, 0.94, 0.021, 0.94, '#b8994f', 'dirt');
  for (let i = 0; i < 41; i++) {
    const a = ((i * 67) % 109) * 0.0079 - 0.425;
    const b = ((i * 47) % 113) * 0.0075 - 0.42;
    const heading = i * 2.39996;
    m.rod(
      [x + a, 0.05, z + b],
      [x + a + 0.1 * Math.cos(heading), 0.063 + (i % 5) * 0.004, z + b + 0.1 * Math.sin(heading)],
      0.009,
      ['#dcb768', '#f3d68d', '#9e8040'][i % 3],
      4,
    );
  }
}

export function drawBurningManGrove(
  m: Mesh,
  campus: { point: (u: number, v: number) => WorldPoint; ground: () => number },
): { statue: RenderedSite; people: Actor[] } {
  const { u, v } = BURNING_MAN;
  const center = campus.point(u, v);
  const direction = campus.point(u + 1, v);
  const angle = Math.atan2(direction.z - center.z, direction.x - center.x);
  const base = campus.ground();
  const approach = (x: number, z: number) => {
    const p = campus.point(x, z);
    return { x: p.x - 0.5, y: p.z - 0.5 };
  };
  pose(m, center.x, base, center.z, angle, () => {
    for (const [x, z] of BURNING_MAN.straw) straw(m, x, z);
    for (const guest of guests) {
      if (!('seated' in guest)) continue;
      const x = guest.u - u,
        z = guest.v - v;
      m.box(x - 0.25, 0.025, z - 0.25, 0.5, 0.45, 0.5, '#794738', 'wood');
      m.box(x - 0.29, 0.475, z - 0.29, 0.58, 0.065, 0.58, guest.pants, 'canvasWeave');
    }
    for (const x of [-1.95, 2.1]) {
      m.rod([x, 0, -1.45], [x, 2.05, -1.45], 0.035, '#64482c', 7);
      m.box(x - 0.19, 0.02, -1.6, 0.38, 0.29, 0.3, '#4d3d67', 'wood');
    }
    const line = (x: number) => 1.75 + 0.073 * x * x;
    for (let i = 0; i < 14; i++) {
      const x = -1.95 + (i * 4.05) / 14;
      const next = x + 4.05 / 14;
      m.rod([x, line(x), -1.45], [next, line(next), -1.45], 0.009, '#64482c', 5);
      m.sphere(
        x,
        line(x) - 0.045,
        -1.45,
        0.033,
        0.043,
        0.033,
        ['#ef557c', '#5dccca', '#ffe079', '#ad79ff'][i % 4],
        7,
        5,
        { emissive: 0.7 },
      );
    }
  });
  const start = m.data.length;
  m.cylinder(center.x, base, center.z, 0.47, 0.14, '#86704f', 14);
  const entry = campus.point(u - 1, v);
  const statue: RenderedSite = {
    ...center,
    angle,
    base,
    start,
    count: m.data.length - start,
    id: BURNING_MAN.statue,
    kind: BURNING_MAN.statue,
    label: 'The Man',
    description: "don't burn him",
    entry: { x: entry.x - 0.5, y: entry.z - 0.5 },
    lo: [center.x - 0.47, base, center.z - 0.47],
    hi: [center.x + 0.47, base + 0.14, center.z + 0.47],
    navigationPolygons: [],
  };
  const people: Actor[] = guests.map(({ u: x, v: z, approachV, ...look }, i) => ({
    ...look,
    ...campus.point(x, z),
    id: 'burning-man-guest-' + i,
    kind: 'burning-man-guest',
    label: look.name,
    base,
    approach: approach(x, approachV),
    angle: angle + (i % 2 ? Math.PI : 0),
    regional: true,
    stationary: true,
    description: 'A Berkeley partygoer dressed for an occasion that could happen at any moment.',
  }));
  people.push({
    ...campus.point(-9.55, 5.65),
    id: BURNING_MAN.matilda,
    kind: BURNING_MAN.matilda,
    name: 'Matilda',
    label: 'Matilda',
    base,
    approach: approach(-9.55, 4.8),
    angle: angle - 0.4,
    regional: true,
    stationary: true,
    female: true,
    hairstyle: 'long',
    hair: '#aa3974',
    shirt: '#28ceba',
    pants: '#f59648',
    hat: 'laurel',
    coat: true,
    sunglasses: true,
    description: 'The host of the Berkeley party. Her dazzling boots have their own altitude.',
  });
  people.push({
    ...burningManDJ(campus.point(-6.2, 5.45), base, angle, true),
    approach: approach(-6.2, 4.6),
  });
  return { statue, people };
}

export function burningManDJ(
  point: WorldPoint,
  base: number,
  angle: number,
  atParty = false,
): Actor {
  return {
    ...point,
    id: atParty ? BURNING_MAN.partyDJ : BURNING_MAN.dj,
    kind: atParty ? 'burning-man-guest' : BURNING_MAN.dj,
    name: 'DJ',
    label: 'DJ',
    base,
    angle,
    hair: '#6b31a2',
    shirt: '#db439c',
    pants: '#52aec3',
    hat: 'beanie',
    sunglasses: true,
    stationary: true,
    regional: atParty,
    description: 'A DJ with scuffed sleeves and a record bag full of unlikely combinations.',
  };
}

const wicker: readonly [number, number, number, number, number, number, number][] = [
  [-0.33, 0.15, 0, -0.28, 1.65, 0, 0.2],
  [0.33, 0.15, 0, 0.28, 1.65, 0, 0.2],
  [0, 1.5, 0, 0, 2.75, 0, 0.46],
  [-0.39, 2.58, 0, -1.43, 3.2, 0, 0.15],
  [0.39, 2.58, 0, 1.43, 3.2, 0, 0.15],
  [0, 2.78, 0, 0, 3.38, 0, 0.29],
];

const statueMeshes = new WeakMap<Site, Map<string, number[]>>();

function statueGeometry(site: Site, finish: 'wicker' | 'singed' | 'charcoal') {
  const cached = statueMeshes.get(site) || new Map<string, number[]>();
  const existing = cached.get(finish);
  if (existing) return existing;
  const m = new Mesh();
  const ash = finish === 'charcoal';
  const dark = finish !== 'wicker';
  pose(m, site.x!, site.base!, site.z!, site.angle!, () => {
    for (const [i, [x, y, z, xx, yy, zz, width]] of wicker.entries()) {
      for (let j = 0; j < 10; j++) {
        const theta = (j * Math.PI) / 5;
        const a = Math.sin(theta) * width,
          b = Math.cos(theta) * width * 0.76;
        m.rod(
          [x + a, y, z + b],
          [xx + a * 0.76, yy, zz + b * 0.76],
          ash ? 0.038 : 0.026,
          dark ? ['#232229', '#433730'][j % 2] : ['#a96630', '#d5a367', '#e4b778'][j % 3],
          6,
        );
      }
      for (let k = 0; k < 9; k++) {
        if (ash && (i + k) % 3 === 0) continue;
        const f = k / 8;
        const px = x + (xx - x) * f,
          py = y + (yy - y) * f,
          pz = z + (zz - z) * f;
        const r = width * (1 - f * 0.24);
        for (let j = 0; j < 10; j++) {
          const a = (j * Math.PI) / 5,
            b = ((j + 1) * Math.PI) / 5;
          m.rod(
            [px + Math.sin(a) * r, py, pz + Math.cos(a) * r * 0.76],
            [px + Math.sin(b) * r, py + 0.019, pz + Math.cos(b) * r * 0.76],
            0.019,
            dark ? '#352e2c' : '#bc8b4e',
            5,
          );
        }
      }
    }
    if (ash) {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996,
          r = 0.24 + (i % 4) * 0.11;
        m.sphere(r * Math.sin(a), 0.15, r * Math.cos(a), 0.12, 0.062, 0.095, '#302c31', 8, 5);
      }
    }
  });
  cached.set(finish, m.data);
  statueMeshes.set(site, cached);
  return m.data;
}

export function drawTheMan(m: Mesh, site: Site, elapsedMs: number, reduced: boolean) {
  const ash = elapsedMs >= BURNING_MAN.burnMs;
  const burning = elapsedMs >= 0 && !ash;
  for (const value of statueGeometry(
    site,
    ash ? 'charcoal' : burning && elapsedMs > 2200 ? 'singed' : 'wicker',
  ))
    m.data.push(value);
  if (!burning) return;
  const time = elapsedMs / 1000;
  pose(m, site.x!, site.base!, site.z!, site.angle!, () => {
    const peak = Math.sin(Math.PI * (elapsedMs / BURNING_MAN.burnMs) ** 0.7);
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996;
      const ripple = reduced ? 0 : Math.sin(time * 13 + i * 1.7);
      const x = Math.sin(a) * 0.68,
        z = Math.cos(a) * 0.7;
      const y = ((i % 5) * 0.38 * time) / (time + 1);
      const h = (0.65 + (i % 6) * 0.31 + 0.2 * ripple) * peak + 0.13;
      m.cylinder(
        x,
        y + 0.1,
        z,
        0.105 + (i % 3) * 0.034,
        h,
        ['#ff4b20', '#ff822d', '#ffe37d'][i % 3],
        6,
        0.004,
        { emissive: 0.95 },
      );
      if (i % 3 === 0) m.sphere(x * 0.7, 1.35 + h + y, z * 0.7, 0.24, 0.3, 0.24, '#685952', 9, 6);
    }
  });
}
