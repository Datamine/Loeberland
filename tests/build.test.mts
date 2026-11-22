import { requiredFixture } from './helpers/required.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { renderExplore, renderDevelopment } from '../tools/build.mts';
import { readCompiledManifest, worldInputVersion } from '../tools/build-world.mts';
import gamePackage from '../package.json' with { type: 'json' };

const pageURL = new URL('../game.template.html', import.meta.url);
test('the standalone game is a classic static client with embedded texture atlases', async () => {
  const source = await readFile(pageURL, 'utf8'),
    html = await renderExplore(source);
  assert.ok(html.includes('data-sf-entry="explore"'));
  assert.doesNotMatch(html, /<script[^>]*type="module"/);
  assert.doesNotMatch(html, /import\.meta/);
  assert.ok(html.includes('data:image/svg+xml;charset=utf-8,'));
  const runtime = requiredFixture(html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1]);
  assert.doesNotThrow(() => new Script(runtime));
  assert.doesNotThrow(() =>
    new Script(runtime).runInNewContext(
      { URL, TextEncoder, TextDecoder, document: { baseURI: 'https://example.test/sf/' } },
      { timeout: 5000 },
    ),
  );
  assert.match(html, /sourceMappingURL=explore\.js\.map/);
  const commit = requiredFixture(
    html.match(/id="sf-debug-commit" title="([a-f0-9]*)"\s*>([^<]+)<\/output\s*>/),
  );
  assert.match(commit[1], /^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/);
  assert.equal(commit[2], commit[1].slice(0, 12) || '—');
  const version = requiredFixture(
    html.match(/id="sf-debug-version" title="([a-f0-9]{12})"\s*>([^<]+)<\/output\s*>/),
  );
  assert.equal(version[2], gamePackage.version);
  assert.match(html, /id="sf-debug-server-commit">—<\/output>/);
  assert.match(html, /id="sf-debug-server-version">—<\/output>/);
  assert.doesNotMatch(html, /sf-atlas|openCityMap|navigateFromMap|Press C to open/);
  assert.ok(html.includes('id="sf-icon-legend"'));
  assert.ok(html.includes('id="sf-place-markers"'));
  assert.match(html, /href="\.\/game\.css"/);
  assert.doesNotMatch(html, /src="main\.js"|href="new\.css"|class="bio-content"/);
});
test('the development game loads its own source modules', async () => {
  const source = await readFile(pageURL, 'utf8'),
    html = renderDevelopment(source);
  assert.ok(html.includes('data-sf-entry="explore"'));
  assert.ok(html.includes('<script type="module" src="./src/world.ts"></script>'));
  const version = requiredFixture(
    html.match(/id="sf-debug-version" title="Development"\s*>([^<]+)<\/output\s*>/),
  );
  assert.equal(version[1], gamePackage.version);
  assert.ok(!source.includes('data-sf-entry="explore"'));
});
test('the checked-in game has been rebuilt from the current sources', async () => {
  const source = await readFile(pageURL, 'utf8'),
    built = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  // Committing the generated page advances HEAD beyond the commit used to build it.
  const ignoreCommit = (html: string) =>
    html.replace(/<output id="sf-debug-commit"[^>]*>[^<]*<\/output\s*>/, '');
  assert.equal(
    ignoreCommit(built),
    ignoreCommit(await renderExplore(source)),
    'Run npm run build after editing game sources.',
  );
});
test('compiled map data matches the source version and uses one immutable generation', async () => {
  const manifest = await readCompiledManifest();
  assert.equal(manifest.version, await worldInputVersion());
  assert.equal(manifest.tileSize, 12);
  assert.ok(manifest.chunks.length > 20);
  assert.ok(requiredFixture(manifest.metadata.bytes) > 0);
  for (const chunk of [manifest.metadata, ...manifest.chunks])
    assert.ok(chunk.file.startsWith(manifest.version + '/'));
  assert.equal(new Set(manifest.chunks.map((c) => c.id)).size, manifest.chunks.length);
});
