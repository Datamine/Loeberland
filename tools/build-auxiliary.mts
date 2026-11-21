import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ContentBundle } from '../src/types/content.ts';

/** Authored browser code is TypeScript; these JavaScript files/HTML are outputs. */
export async function buildAuxiliary(): Promise<void> {
  const root = new URL('../', import.meta.url);
  const { texts } = JSON.parse(
    await readFile(new URL('content/texts.json', root), 'utf8'),
  ) as ContentBundle['texts'];
  const equipmentText = Object.fromEntries(
    Object.entries(texts)
      .filter(([id]) => /^config\.(item-stats|hats)\./.test(id))
      .map(([id, { template }]) => [id, template]),
  );
  const admin = await build({
    entryPoints: [fileURLToPath(new URL('server/admin-ui.ts', root))],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    minify: false,
    plugins: [
      {
        name: 'admin-equipment-text',
        setup(build) {
          // The selector only needs the static text used by the two equipment catalogs.
          build.onLoad({ filter: /\/content-runtime\.ts$/ }, () => ({
            contents: `const texts = ${JSON.stringify(equipmentText)};
              export function contentText(id) {
                if (!Object.hasOwn(texts, id)) throw new Error('Missing equipment text: ' + id);
                return texts[id];
              }`,
          }));
        },
      },
    ],
  });
  const template = await readFile(new URL('server/admin.template.html', root), 'utf8');
  await writeFile(
    new URL('server/admin.html', root),
    template.replace('/* ADMIN:UI */', () =>
      admin.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'),
    ),
  );
  for (const name of ['animation-audit', 'character-gpu-audit'] satisfies [string, string])
    await build({
      entryPoints: [fileURLToPath(new URL('tools/' + name + '.ts', root))],
      outfile: fileURLToPath(new URL('tools/' + name + '.js', root)),
      bundle: true,
      format: 'esm',
      target: 'es2022',
      sourcemap: 'inline',
      minify: true,
    });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildAuxiliary();
