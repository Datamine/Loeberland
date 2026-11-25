import type { CheckpointStore, GameplayStore, RamGameStore } from '../src/types/storage.ts';
import type { ServerGeometry, ServerPlayer, PlayerTransport } from '../src/types/server.ts';
import type { Socket } from 'node:net';
import { createServer as createControlSocket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { requiredValue } from '../src/types/assert.ts';
import { errorMessage, isRecord } from '../src/types/json.ts';
interface ServerOptions {
  port?: number;
  host?: string;
  store?: CheckpointStore | null;
  geometry?: ServerGeometry | null;
  maxPlayers?: number;
  allowedOrigins?: string[];
  checkpointIntervalMs?: number;
  shutdownTimeoutMs?: number;
  logger?: Pick<Console, 'error'>;
}
interface LiveSession {
  player: ServerPlayer | null;
  transport: PlayerTransport;
}
class CharacterCreationDelayed extends Error {}
class CharacterConnectionLimit extends Error {}
class CharacterVerificationRequired extends Error {}
import { watchContent } from '../content/server.mts';
import { applyWorldEdits } from '../src/world-edits.ts';
import { createServer, type IncomingMessage } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { createWorldModel } from '../src/world.ts';
import { createGame } from './game.mts';
import { CharacterBanned, loadGamePolicy, type ChatLog, type ChatModeration } from './game-policy.mts';
import { loadUsernamePolicy } from './usernames.mts';
import { createStore } from './store.mts';
import { createCheckpointManager } from './checkpoints.mts';
import { readServerBuild } from './build-info.mts';
import { readChatPolicy } from './chat-policy.mts';
import { readDebugTeleportSetting } from './tuning.mts';
import { createGoogleChatRoutes, readGoogleChatConfig } from './google-chat.mts';
import {
  MP_PROTOCOL,
  MP_TICK_HZ,
  MP_BROADCAST_HZ,
  MP_CHARACTER_CREATION_DELAYED,
  MP_CHARACTER_CONNECTION_LIMIT,
  MP_CHARACTER_VERIFICATION_FAILED,
  MP_CHARACTER_VERIFICATION_PATH,
  MP_CHARACTER_BANNED,
  CHARACTER_BANNED_MESSAGE,
} from '../src/multiplayer-protocol.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
export async function startServer({
  port = Number(process.env.PORT) || 8787,
  host = process.env.HOST || '127.0.0.1',
  store: providedStore = null,
  geometry: providedGeometry = null,
  maxPlayers = Number(process.env.MAX_PLAYERS) || 2000,
  allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  checkpointIntervalMs = Number(process.env.CHECKPOINT_INTERVAL_MS ?? 1000),
  shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000),
  logger = console,
}: ServerOptions = {}) {
  const [gamePolicy, allowUsername] = await Promise.all([loadGamePolicy(), loadUsernamePolicy()]);
  const serverBuild = readServerBuild();
  const googleChat = readGoogleChatConfig();
  const chatPolicy = readChatPolicy();
  const debugTeleportAll = readDebugTeleportSetting(host);
  const geometry: ServerGeometry = providedGeometry || createWorldModel();
  if (!providedGeometry) {
    console.log('Preparing the authoritative map and its tile adjacency…');
    geometry.hospital = requiredValue(
      geometry.sights?.find((s) => s.id === 'ucsf'),
      'The hospital is missing.',
    ).entry;
    geometry.nearestGround = (x: number, z: number) => {
      if (geometry.landClearAt(x - 0.5, z - 0.5)) return { x, z };
      for (let r = 0.25; r <= 2; r += 0.25)
        for (let a = 0; a < 16; a++) {
          const xx = x + Math.cos((a * Math.PI) / 8) * r,
            zz = z + Math.sin((a * Math.PI) / 8) * r;
          if (geometry.landClearAt(xx - 0.5, zz - 0.5)) return { x: xx, z: zz };
        }
      return null;
    };
  }
  // Build the static map before acquiring Redis's renewable ownership lease;
  // map compilation is synchronous and must not starve its renewal timer.
  const store = providedStore || (await createStore());
  const sessions = new Set<LiveSession>();
  let checkpoints: Awaited<ReturnType<typeof createCheckpointManager>>,
    game: Awaited<ReturnType<typeof createGame>>;
  const createSimulation = (ram: GameplayStore) =>
    createGame({
      geometry,
      store: ram,
      maxPlayers,
      serverBuild,
      googleChatAvailable: !!googleChat,
      debugTeleportAll,
      gamePolicy,
      chatModeration,
      chatLog,
      closeBannedSession(owner, warning) {
        for (const session of sessions) {
          if (session.player?.owner === owner && session.transport.open) {
            session.transport.send(
              JSON.stringify({ type: 'notice', id: 'chat-moderation-blocked', message: warning }),
            );
            session.transport.close(MP_CHARACTER_BANNED, CHARACTER_BANNED_MESSAGE);
          }
        }
      },
      allowUsername,
      ...chatPolicy,
    });
  let chatModeration: ChatModeration | undefined;
  let chatLog: ChatLog | undefined;
  try {
    chatModeration = gamePolicy?.openChatModeration?.(store);
    chatLog = await gamePolicy?.openChatLog?.();
    checkpoints = await createCheckpointManager({
      store,
      intervalMs: checkpointIntervalMs,
      shutdownTimeoutMs,
      logger,
    });
    game = await createSimulation(checkpoints.openGame('world'));
    checkpoints.attach('world', { prepare: game.prepareCheckpoint, drain: game.close });
  } catch (error) {
    await store.close();
    throw error;
  }
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let resources = {},
    previousUsage = process.cpuUsage(),
    previousResourceTime = performance.now(),
    previousBytes = 0,
    previousFrames = 0;
  function sampleResources() {
    const current = performance.now(),
      elapsed = (current - previousResourceTime) / 1000,
      usage = process.cpuUsage(),
      memory = process.memoryUsage();
    resources = {
      rssMiB: +(memory.rss / 1048576).toFixed(2),
      heapUsedMiB: +(memory.heapUsed / 1048576).toFixed(2),
      externalMiB: +(memory.external / 1048576).toFixed(2),
      cpuPercent: +(
        (usage.user + usage.system - previousUsage.user - previousUsage.system) /
        (elapsed * 10000)
      ).toFixed(2),
      outboundMBps: +((game.metrics.bytes - previousBytes) / elapsed / 1e6).toFixed(3),
      movementFramesPerSecond: +((game.metrics.frames - previousFrames) / elapsed).toFixed(2),
    };
    previousUsage = usage;
    previousResourceTime = current;
    previousBytes = game.metrics.bytes;
    previousFrames = game.metrics.frames;
  }
  const resourceTimer = setInterval(sampleResources, 1000);
  resourceTimer.unref();
  let draining = false,
    healthy = true;
  const acceptsPlayers = () => !draining && healthy && store.leaseHealthy !== false;
  let reloading: Promise<void> | null = null;
  function permitted(origin: string | undefined) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (origin === 'null') return host === '127.0.0.1' || process.env.ALLOW_FILE_ORIGIN === '1';
    try {
      const u = new URL(origin);
      return (['127.0.0.1', 'localhost', '[::1]'] satisfies [string, string, string]).includes(
        u.hostname,
      );
    } catch {
      return false;
    }
  }
  const googleChatRoutes = createGoogleChatRoutes(googleChat, {
    async canStartChatUnlock(...args) {
      if (reloading) await reloading;
      return game.canStartChatUnlock(...args);
    },
    async grantChatUnlock(...args) {
      if (reloading) await reloading;
      return game.grantChatUnlock(...args);
    },
  });
  const http = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === MP_CHARACTER_VERIFICATION_PATH) {
      const parent = url.searchParams.get('parent');
      const challenge = url.searchParams.get('challenge');
      const origin = parent && URL.parse(parent);
      if (
        !gamePolicy?.characterVerification ||
        req.method !== 'GET' ||
        !origin ||
        origin.origin !== parent ||
        (origin.protocol !== 'https:' && origin.protocol !== 'http:') ||
        !permitted(parent) ||
        !challenge ||
        !/^[a-f0-9]{32}$/.test(challenge)
      ) {
        res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      const page = gamePolicy.characterVerification.page(parent, challenge);
      res
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': page.csp,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'strict-origin',
          'X-Content-Type-Options': 'nosniff',
        })
        .end(page.body);
      return;
    }
    if (url.pathname.startsWith('/auth/google/chat/') && (await googleChatRoutes(req, res, url)))
      return;
    if (url.pathname === '/healthz') {
      const ok = healthy && !draining && store.leaseHealthy !== false;
      res.writeHead(ok ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          ok,
          build: serverBuild,
          players: game.players.size,
          capacity: maxPlayers,
          store: store.kind,
          checkpoint: {
            ...checkpoints.list().find((g) => g.id === 'world'),
            intervalMs: checkpointIntervalMs,
          },
          uptimeSeconds: Math.floor(process.uptime()),
          eventLoopP99Ms: Math.round(delay.percentile(99) / 1e6),
          tickMs: +game.metrics.tickMs.toFixed(2),
          broadcastMs: +game.metrics.broadcastMs.toFixed(2),
          timings: game.metrics.snapshot(),
          resources,
          actions: { ...game.actionQueue.stats, coalescedMoves: game.metrics.coalescedMoves },
          routes: game.routes.stats,
          network: {
            bytes: game.metrics.bytes,
            movementFrames: game.metrics.frames,
            slowClientSkips: game.metrics.slowClients,
          },
        }),
      );
      return;
    }
    if (url.pathname === '/multiplayer-config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ endpoint: '/ws', protocol: MP_PROTOCOL }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const path = decodeURIComponent(url.pathname),
        file = resolve(
          root,
          '.' + (path === '/' || path === '/explore.html' ? '/index.html' : path),
        ),
        local = relative(root, file),
        type = contentTypes[extname(file)];
      if (
        local.startsWith('..') ||
        local.startsWith('server/') ||
        local.split(/[\\/]/).some((p) => p.startsWith('.')) ||
        !type
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control':
          path.endsWith('.html') || path.endsWith('/manifest.js')
            ? 'no-cache'
            : /^\/world-cache\/[a-f0-9]{20}\//.test(path)
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=300',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 98304,
    perMessageDeflate: false,
    clientTracking: true,
  });
  http.on('upgrade', (req, socket, head) => {
    let path;
    try {
      path = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (
      !acceptsPlayers() ||
      path !== '/ws' ||
      !permitted(req.headers.origin) ||
      sockets.clients.size > maxPlayers + 128
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
  });
  const aliveClients = new WeakSet<WebSocket>();
  const verifyingClients = new Set<WebSocket>();
  sockets.on('connection', (ws, req: IncomingMessage) => {
    let authenticating = false;
    let challenge: { id: string; token: string; attempts: number } | undefined;
    let verified = false;
    let releaseCharacter: (() => void) | undefined;
    const admit =
      gamePolicy &&
      ((owner: string, creating: boolean) => {
        if (!transport.open) throw Error('Connection closed');
        if (!releaseCharacter) {
          const release = gamePolicy.reserveCharacter?.(req, owner, verified);
          if (release === 'verify') throw new CharacterVerificationRequired();
          if (release === false) throw new CharacterConnectionLimit();
          releaseCharacter = release;
        }
        if (creating) {
          const result = gamePolicy.allowNewCharacter(req, verified);
          if (result === 'verify') throw new CharacterVerificationRequired();
          if (!result) throw new CharacterCreationDelayed();
        }
      });
    aliveClients.add(ws);
    const authDeadline = (ms: number) =>
      setTimeout(() => {
        if (!session.player)
          ws.close(challenge ? MP_CHARACTER_VERIFICATION_FAILED : 4003, 'Authentication timeout');
      }, ms).unref();
    let deadline = authDeadline(10_000);
    const socket = (ws as WebSocket & { _socket?: Socket })._socket;
    const transport: PlayerTransport = {
      get open() {
        return ws.readyState === WebSocket.OPEN;
      },
      get bufferedAmount() {
        return ws.bufferedAmount;
      },
      cork: () => socket?.cork(),
      uncork: () => socket?.uncork(),
      send(data) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 1048576) {
          ws.close(4009, 'Connection too slow; reconnect to resynchronize');
          return;
        }
        ws.send(data);
      },
      close: (code: number | undefined, reason: string | Buffer<ArrayBufferLike> | undefined) =>
        ws.close(code, reason),
    };
    const session: LiveSession = { player: null, transport };
    sessions.add(session);
    ws.on('error', () => {});
    ws.on('pong', () => aliveClients.add(ws));
    ws.on('message', async (data, binary) => {
      if (reloading) await reloading;
      if (!transport.open || !acceptsPlayers()) return;
      if (binary) {
        ws.close(4002, 'Client messages must be JSON');
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        ws.close(4002, 'Invalid JSON');
        return;
      }
      if (!session.player) {
        if (authenticating) return;
        if (!isRecord(message) || message.type !== 'hello') {
          ws.close(4003, 'Authenticate first');
          return;
        }
        authenticating = true;
        try {
          if (challenge) {
            if (message.protocol !== MP_PROTOCOL || message.token !== challenge.token) {
              ws.close(MP_CHARACTER_VERIFICATION_FAILED, 'Character verification interrupted');
              return;
            }
            const response = message.verification;
            if (
              typeof response !== 'string' ||
              !response ||
              response.length > 2048 ||
              !(await gamePolicy?.characterVerification?.verify(req, challenge.id, response))
            ) {
              if (transport.open && ++challenge.attempts < 3) {
                challenge.id = randomBytes(16).toString('hex');
                ws.send(JSON.stringify({ type: 'verifyCharacter', challenge: challenge.id }));
                authenticating = false;
              } else ws.close(MP_CHARACTER_VERIFICATION_FAILED, 'Character verification failed');
              return;
            }
            if (reloading) await reloading;
            if (!transport.open || !acceptsPlayers()) return;
            verified = true;
          }
          session.player = await game.connect(message, transport, admit);
          clearTimeout(deadline);
          verifyingClients.delete(ws);
          if (!transport.open && !reloading) game.disconnect(session.player);
        } catch (error) {
          releaseCharacter?.();
          releaseCharacter = undefined;
          if (
            error instanceof CharacterVerificationRequired &&
            gamePolicy?.characterVerification &&
            !verified &&
            verifyingClients.size < 32 &&
            transport.open &&
            typeof message.token === 'string'
          ) {
            challenge = { id: randomBytes(16).toString('hex'), token: message.token, attempts: 0 };
            verifyingClients.add(ws);
            clearTimeout(deadline);
            deadline = authDeadline(120_000);
            ws.send(JSON.stringify({ type: 'verifyCharacter', challenge: challenge.id }));
            authenticating = false;
          } else if (error instanceof CharacterBanned)
            ws.close(MP_CHARACTER_BANNED, CHARACTER_BANNED_MESSAGE);
          else if (
            error instanceof CharacterCreationDelayed ||
            error instanceof CharacterVerificationRequired
          )
            ws.close(
              MP_CHARACTER_CREATION_DELAYED,
              'Character verification is temporarily unavailable',
            );
          else if (error instanceof CharacterConnectionLimit)
            ws.close(
              MP_CHARACTER_CONNECTION_LIMIT,
              'Character sign-in is temporarily unavailable',
            );
          else ws.close(4003, errorMessage(error).slice(0, 120));
        }
        return;
      }
      game.receive(session.player, message);
    });
    ws.on('close', async () => {
      clearTimeout(deadline);
      verifyingClients.delete(ws);
      releaseCharacter?.();
      releaseCharacter = undefined;
      if (reloading) await reloading;
      sessions.delete(session);
      if (session.player) game.disconnect(session.player);
    });
  });
  const tickSeconds = 1 / MP_TICK_HZ,
    broadcastMilliseconds = 1000 / MP_BROADCAST_HZ;
  let previous = performance.now(),
    accumulator = 0,
    lastBroadcast = 0;
  const loop = setInterval(() => {
    if (store.leaseHealthy === false) {
      for (const ws of sockets.clients) ws.close(1012, 'World ownership changed');
      return;
    }
    const current = performance.now();
    if (reloading) {
      previous = current;
      return;
    }
    game.metrics.observe('loopGapMs', current - previous);
    accumulator += Math.min(0.25, (current - previous) / 1000);
    previous = current;
    try {
      let steps = 0;
      while (accumulator >= tickSeconds && steps++ < 5) {
        game.tick(tickSeconds);
        accumulator -= tickSeconds;
      }
      if (current - lastBroadcast >= broadcastMilliseconds - 1) {
        lastBroadcast = current;
        game.broadcast();
      }
    } catch (error) {
      healthy = false;
      console.error('Simulation failed:', error);
    }
  }, 10);
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!aliveClients.has(ws)) {
        ws.terminate();
        continue;
      }
      aliveClients.delete(ws);
      ws.ping();
    }
  }, 15000);
  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, host, resolve);
    });
  } catch (error) {
    clearInterval(loop);
    clearInterval(heartbeat);
    clearInterval(resourceTimer);
    delay.disable();
    sockets.close();
    await checkpoints.shutdown();
    throw error;
  }
  const address = http.address();
  if (!address || typeof address === 'string')
    throw new Error('The server did not bind a TCP port.');
  console.log(
    `Loeberland: http://${host}:${address.port}/ · WebSocket /ws · ${store.kind} · capacity ${maxPlayers}`,
  );
  checkpoints.start();
  async function stageSimulation(ram: RamGameStore) {
    const actors = new Set([
      ...(geometry.merchants || []),
      ...(geometry.lives || []).flatMap((life) => life?.people || []),
    ]);
    const actorSnapshots = [...actors].map((actor) => ({
      actor,
      previous: { ...actor },
      roam: actor.roam && { ...actor.roam },
    }));
    const airship = geometry.airship?.state;
    const previousAirship = airship && structuredClone(airship);
    function abort() {
      for (const { actor, previous, roam } of actorSnapshots) {
        for (const key of Object.keys(actor))
          if (!Object.hasOwn(previous, key)) Reflect.deleteProperty(actor, key);
        Object.assign(actor, previous);
        if (roam && actor.roam) Object.assign(actor.roam, roam);
      }
      if (airship && previousAirship) Object.assign(airship, previousAirship);
    }
    try {
      const next = await createSimulation(ram);
      const transfers: {
        session: LiveSession;
        player: ServerPlayer;
        output: (string | ArrayBuffer)[];
      }[] = [];
      // Stage welcomes until Redis commits the edit. The same sockets
      // then receive fresh authoritative state and keep their player IDs.
      for (const session of sessions) {
        const previous = session.player;
        if (!previous || !session.transport.open || game.players.get(previous.id) !== previous)
          continue;
        const output: (string | ArrayBuffer)[] = [];
        const player = await next.restoreConnection(previous, {
          get open() {
            return session.transport.open;
          },
          get bufferedAmount() {
            return session.transport.bufferedAmount;
          },
          send: (data) => { output.push(data); },
          close: () => {},
        });
        transfers.push({ session, player, output });
      }
      return {
        prepare: next.prepareCheckpoint,
        drain: next.close,
        abort,
        install() {
          game = next;
          previousBytes = next.metrics.bytes;
          previousFrames = next.metrics.frames;
          for (const { session, player, output } of transfers) {
            session.player = player;
            player.transport = session.transport;
            for (const message of output) session.transport.send(message);
          }
        },
      };
    } catch (error) {
      abort();
      throw error;
    }
  }
  let checkingAdmin = false;
  const adminTimer = store.hasAdminEdit && store.applyAdminEdit
    ? setInterval(async () => {
        if (checkingAdmin || draining) return;
        checkingAdmin = true;
        try {
          if (!(await store.hasAdminEdit?.()) || draining) return;
          reloading = checkpoints.reloadAdminEdit('world', stageSimulation)
            .catch((error) => logger.error('Unable to reload an admin edit:', error));
          await reloading;
        } catch (error) {
          logger.error('Unable to check for an admin edit:', error);
        } finally {
          reloading = null;
          checkingAdmin = false;
        }
      }, 1000)
    : null;
  adminTimer?.unref();
  const stopContent = await watchContent({
    root,
    onChange: () => applyWorldEdits(geometry),
    onError: (error) => logger.error('Content reload:', error),
  });
  let closing: ReturnType<typeof checkpoints.shutdown> | null = null;
  let updateUntil = 0;
  function announceUpdate() {
    updateUntil = Date.now() + 30_000;
    const notice = JSON.stringify({
      type: 'notice',
      id: 'server-update',
      message: 'Server update incoming',
    });
    for (const player of game.players.values()) player.transport.send(notice);
  }
  function close() {
    if (closing) return closing;
    draining = true;
    stopContent();
    clearInterval(loop);
    clearInterval(heartbeat);
    clearInterval(resourceTimer);
    if (adminTimer) clearInterval(adminTimer);
    delay.disable();
    closing = (async () => {
      if (reloading) await reloading;
      const saving = checkpoints.shutdown();
      const httpClosed = new Promise((resolve) => http.close(resolve));
      http.closeIdleConnections();
      const updating = Date.now() < updateUntil;
      for (const ws of sockets.clients)
        ws.close(updating ? 1012 : 1001, updating ? 'Server Updating...' : 'Server restarting');
      const force = setTimeout(() => {
        for (const ws of sockets.clients) ws.terminate();
      }, 250);
      try {
        return await saving;
      } finally {
        await chatLog?.drain();
        clearTimeout(force);
        for (const ws of sockets.clients) ws.terminate();
        await new Promise((resolve) => sockets.close(resolve));
        http.closeAllConnections();
        await httpClosed;
      }
    })();
    return closing;
  }
  return {
    http,
    sockets,
    get game() { return game; },
    checkpoints,
    port: address.port,
    close,
    announceUpdate,
  };
}

export function installShutdownHooks(
  server: { close: () => Promise<unknown> },
  {
    signals = process,
    exit = (code: number) => process.exit(code),
    logger = console,
  }: {
    signals?: {
      on: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
      off: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
    };
    exit?: (code: number) => unknown;
    logger?: Pick<Console, 'error'>;
  } = {},
) {
  let stopping: Promise<void> | null = null;
  const shutdown = () => {
    if (!stopping)
      stopping = Promise.resolve()
        .then(() => server.close())
        .then(
          () => {
            exit(0);
          },
          (error) => {
            logger.error('Server shutdown failed:', error);
            exit(1);
          },
        );
    return stopping;
  };
  signals.on('SIGTERM', shutdown);
  signals.on('SIGINT', shutdown);
  return () => {
    signals.off('SIGTERM', shutdown);
    signals.off('SIGINT', shutdown);
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  installShutdownHooks(server);
  const noticePath = process.env.DEPLOY_NOTICE_SOCKET;
  if (noticePath) {
    // The deployment script reaches this socket from inside the game container.
    await rm(noticePath, { force: true });
    const control = createControlSocket((connection) => {
      connection.on('error', () => {});
      server.announceUpdate();
      connection.end('ok');
    });
    control.on('error', (error) => console.error('Deployment notice socket:', error));
    control.listen(noticePath);
    server.http.once('close', () => control.close());
  }
}
