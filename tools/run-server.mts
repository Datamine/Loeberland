import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildRuntime, gameRoot, runtimeRoot } from './build-runtime.mts';

const [entry = 'index', ...args] = process.argv.slice(2);
if (!['index', 'dev', 'admin', 'backup', 'load-test'].includes(entry))
  throw new Error('Unknown server entry point: ' + entry);
const settingsFile = process.env.LOCAL_ENV_FILE || resolve(gameRoot, 'deploy/.env.local');
if (process.env.LOCAL_ENV_FILE || existsSync(settingsFile)) process.loadEnvFile(settingsFile);

if (entry === 'index') {
  const hasMap = await access(resolve(gameRoot, 'world-cache/manifest.json')).then(
    () => true,
    () => false,
  );
  if (!hasMap) await (await import('./build.mts')).build();
}
if (entry !== 'dev') await buildRuntime();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  STATE_FILE: process.env.STATE_FILE || resolve(gameRoot, 'server/data/world.sqlite'),
};
if (entry === 'admin' && env.ADMIN_ENV_FILE === undefined) {
  const credentials = resolve(gameRoot, 'deploy/.env.local-admin');
  if (existsSync(credentials)) env.ADMIN_ENV_FILE = credentials;
}
const launch =
  entry === 'dev'
    ? [
        '--import',
        resolve(gameRoot, 'node_modules/tsx/dist/loader.mjs'),
        '--watch',
        resolve(gameRoot, 'server/index.mts'),
      ]
    : ['--enable-source-maps', resolve(runtimeRoot, 'server', entry + '.mjs')];
const child = spawn(process.execPath, [...launch, ...args], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
