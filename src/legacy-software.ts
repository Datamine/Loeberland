import type { Mesh } from './geometry.ts';
import type { RenderedSite, SignAtlas } from './types/world.ts';
import type { InteriorSection } from './types/interiors.ts';
import { pose } from './geometry.ts';
import {
  detachInstituteMesh,
  drawInstituteWall,
  instituteWallRects,
  recordInstitutePart,
} from './institute-interiors.ts';
import { drawPlaque } from './southern-district.ts';

import { LEGACY_SOFTWARE } from './legacy-software-layout.ts';

export function drawLegacySoftware(m: Mesh, signs: SignAtlas) {
  const site = LEGACY_SOFTWARE,
    start = m.data.length;
  const { w, d, x, z, base } = site,
    height = 2.55;
  const parts: InteriorSection[] = [];
  m.box(
    x - w / 2 - 0.08,
    base - 0.16,
    z - d / 2 - 0.1,
    w + 0.16,
    0.16,
    d + 0.2,
    '#b9b5a1',
    'concrete',
  );
  pose(m, x, base, z, 0, () => {
    m.box(-w / 2, 1.53, -d / 2 - 0.09, w, 0.54, 0.095, '#526166', 'concrete');
    pose(m, 0, 0, -d / 2 - 0.1, Math.PI, () =>
      drawPlaque(m, signs, site.sign, 0, 1.66, 0.02, 4.8, 0.29),
    );
  });
  const interiorStart = m.data.length;
  const local = { ...site, x: 0, z: 0, base: 0 };
  pose(m, x, base, z, 0, () => {
    recordInstitutePart(m, parts, 'floor', null, () => {
      for (let i = 0; i < 11; i++)
        for (let j = 0; j < 7; j++)
          m.box(
            -w / 2 + (i * w) / 11,
            0.025,
            -d / 2 + (j * d) / 7,
            w / 11,
            0.036,
            d / 7,
            (i + j) % 2 ? '#8d8c7d' : '#9b998a',
            'glazedTile',
          );
    });
    for (const side of [0, 1, 2, 3])
      recordInstitutePart(m, parts, 'wall', side, () => {
        drawInstituteWall(m, local, side, height, '#a3a59a', '#d3cbbb');
      });
    recordInstitutePart(m, parts, 'furniture', null, () => {
      for (const dx of [-1.94, -0.65, 0.65, 1.94]) {
        m.box(dx - 0.49, 0.02, d / 2 - 0.51, 0.98, 0.55, 0.45, '#8e8169', 'wood');
        m.box(dx - 0.22, 0.57, d / 2 - 0.43, 0.44, 0.36, 0.28, '#b4ad90', 'concrete');
        m.box(dx - 0.17, 0.63, d / 2 - 0.442, 0.34, 0.22, 0.02, '#91b983', { emissive: 0.44 });
      }
    });
    recordInstitutePart(m, parts, 'roof', null, () => {
      m.box(-w / 2 - 0.14, height, -d / 2 - 0.14, w + 0.28, 0.16, d + 0.28, '#59584d', 'roof');
      for (const dx of [-1.4, 1.4]) {
        m.box(dx - 0.62, height + 0.16, -0.55, 1.24, 0.26, 1.1, '#788183', { metal: 0.45 });
        for (let j = 0; j < 7; j++)
          m.box(dx - 0.51 + j * 0.16, height + 0.42, -0.48, 0.08, 0.055, 0.96, '#434d4f');
      }
    });
  });
  const interior = detachInstituteMesh(m, {
    start: interiorStart,
    end: m.data.length,
    parts,
    spec: site,
  });
  const navigationPolygons = [0, 1, 2, 3]
    .flatMap((side) => instituteWallRects(site, side))
    .map((r) => [
      [x + r.x, z + r.z],
      [x + r.x + r.w, z + r.z],
      [x + r.x + r.w, z + r.z + r.d],
      [x + r.x, z + r.z + r.d],
    ]);
  const rendered: RenderedSite = {
    ...site,
    kind: 'legacy-software-company',
    description: 'A faded software office. Something large is scratching at the server cabinets.',
    enterableInstitute: true,
    interior,
    navigationPolygons,
    start,
    count: m.data.length - start,
    lo: [x - w / 2 - 0.15, base - 0.18, z - d / 2 - 0.16],
    hi: [x + w / 2 + 0.15, base + 3.12, z + d / 2 + 0.16],
  };
  return rendered;
}
