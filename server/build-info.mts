import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { BuildInfo } from '../src/types/network.ts';
import gamePackage from '../package.json' with { type: 'json' };

export const gameVersion = gamePackage.version;

const root = new URL('../', import.meta.url);
const validCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

export function sourceCommit(): string | null {
  const supplied = process.env.SF_BUILD_COMMIT;
  if (validCommit(supplied)) return supplied;
  try {
    const packaged = readFileSync(new URL('./build-commit.txt', import.meta.url), 'utf8').trim();
    if (validCommit(packaged)) return packaged;
  } catch {
    // Source checkouts obtain the revision from Git.
  }
  const git = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const commit = git.stdout?.trim();
  return validCommit(commit) ? commit : null;
}

export function readServerBuild(): BuildInfo {
  try {
    const { commit, version, fingerprint } = JSON.parse(
      readFileSync(new URL('./build-info.json', import.meta.url), 'utf8'),
    );
    if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version))
      return {
        commit: validCommit(commit) ? commit : null,
        version,
        fingerprint:
          typeof fingerprint === 'string' && /^[a-f0-9]{12}$/.test(fingerprint)
            ? fingerprint
            : undefined,
      };
  } catch {
    // Direct source launches have no runtime build manifest.
  }
  return { commit: sourceCommit(), version: gameVersion };
}
