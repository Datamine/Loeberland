/** Server scheduling and bounded caches; gameplay balance stays in sf/config. */
export const SERVER_TUNING = Object.freeze({
  actionSliceMs: 4,
  actionsPerTurn: 64,
  maxPendingActionsPerPlayer: 32,
  routeCacheEntries: 4096,
  routeCachePoints: 65536,
  routeCacheTtlMs: 2000,
  routeCoreTtlMs: 30000,
  followReplansPerTick: 256,
  followReplanMs: 4,
});

/** The default for direct, non-production development servers. */
export const LOCAL_DEBUG_TELEPORT_ALL = true;

export function readDebugTeleportSetting(host: string, env: NodeJS.ProcessEnv = process.env) {
  const value = env.DEBUG_TELEPORT_ALL?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value) throw new Error('DEBUG_TELEPORT_ALL must be true or false.');
  return (
    LOCAL_DEBUG_TELEPORT_ALL &&
    env.NODE_ENV !== 'production' &&
    ['127.0.0.1', '::1', 'localhost'].includes(host)
  );
}
