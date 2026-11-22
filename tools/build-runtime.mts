import { buildAuxiliary } from './build-auxiliary.mts';
import ts from 'typescript';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gameVersion, sourceCommit } from '../server/build-info.mts';

export const gameRoot = fileURLToPath(new URL('../', import.meta.url));
export const runtimeRoot = resolve(gameRoot, '.build');
const diagnosticsHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (file) => file,
  getCurrentDirectory: () => gameRoot,
  getNewLine: () => '\n',
};
/** Emit an independent game runtime; no website sources or assets are required. */
export async function buildRuntime(): Promise<void> {
  const config = ts.getParsedCommandLineOfConfigFile(
    resolve(gameRoot, 'tsconfig.runtime.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (error) => {
        throw new Error(ts.formatDiagnosticsWithColorAndContext([error], diagnosticsHost));
      },
    },
  );
  if (!config) throw new Error('Unable to read the runtime TypeScript configuration.');
  const program = ts.createProgram(config.fileNames, config.options),
    diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticsHost));
  await buildAuxiliary();
  await rm(runtimeRoot, { recursive: true, force: true });
  const modules = new Map<string, string>();
  const emitted = program.emit(undefined, (path, data, bom) => {
    ts.sys.writeFile(path, data, bom);
    if (/\.(?:m?js)$/.test(path)) modules.set(relative(runtimeRoot, path), data);
  });
  if (emitted.emitSkipped || emitted.diagnostics.length)
    throw new Error(ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, diagnosticsHost));
  const fingerprint = createHash('sha256');
  for (const [path, data] of [...modules].sort(([a], [b]) => a.localeCompare(b)))
    fingerprint.update(path).update('\0').update(data).update('\0');
  for (const path of ['server/package-lock.json', 'content/runtime.json'])
    fingerprint.update(await readFile(resolve(gameRoot, path))).update('\0');
  await writeFile(
    resolve(runtimeRoot, 'server/build-info.json'),
    JSON.stringify({
      commit: sourceCommit(),
      version: gameVersion,
      fingerprint: fingerprint.digest('hex').slice(0, 12),
    }) + '\n',
  );
  for (const path of [
    'package.json',
    'index.html',
    'editor.html',
    'game.css',
    'favicon.ico',
    'billboards',
    'textures',
    'content/validate.js',
    'content/runtime.json',
    'content/manifest.json',
    'server/package.json',
    'server/admin.html',
  ]) {
    const target = resolve(runtimeRoot, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await cp(resolve(gameRoot, path), target, { recursive: true });
  }
  try {
    await cp(resolve(gameRoot, 'world-cache'), resolve(runtimeRoot, 'world-cache'), {
      recursive: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await cp(resolve(gameRoot, 'server/node_modules'), resolve(runtimeRoot, 'server/node_modules'), {
    recursive: true,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildRuntime();
  console.log('Built .build/: type-checked game server JavaScript, source maps, and assets.');
}
