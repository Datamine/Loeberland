TypeScript setup and compiled runtime commands are documented in [../TYPESCRIPT.md](../docs/TYPESCRIPT.md).

# Server operations

Run, configure, deploy and recover the Explore SF backend. For the local
client workflow, builds, tests and source layout, start with [README.md](../docs/REFERENCE.md).
Gameplay is documented in [DOCUMENTATION.md](../docs/GAMEPLAY.md).
Performance tuning and measured workloads are in [CAPACITY.md](CAPACITY.md).

Commands run from the **repository root** unless a block explicitly changes
directory or runs inside an EC2 session.

- [Run locally](#run-locally)
- [Deployment](#deployment)
- [Persistence](#persistence)
- [SQLite backups](#sqlite-backups)
- [State editor](#simple-database-editor)
- [Configuration](#configuration)
- [Health and diagnostics](#health-and-diagnostics)

## Run locally

Use Node.js >=22.16 (the image uses Node 24):

```sh
npm ci
npm ci --prefix server
npm run build
npm --prefix server start
```

Open **http://127.0.0.1:8787/**. The server serves the static site,
`/multiplayer-config.json`, `/healthz`, and WebSockets at `/ws`. Without
`REDIS_URL`, saves go to `server/data/world.sqlite`.

For Docker Compose with Redis:

```sh
npm ci
npm run build
DEBUG_TELEPORT_ALL=true docker compose -f server/compose.yaml up --build -d game
docker compose -f server/compose.yaml logs -f game
```

Stop with Ctrl+C for Node, or `docker compose -f server/compose.yaml down`.
Both allow a graceful final checkpoint. Keep Docker volumes; `down -v` removes
persisted state. Run **one simulation process per world**; do not scale game
replicas or put independent world processes behind a load balancer.

## Deployment

### Production on EC2 with Cloudflare Tunnel

Run `./deploy/aws.sh` from the repository root after configuring the tunnel and
private bundle. The [deployment guide](../deploy/README.md) covers prerequisites,
SSH, the password-protected admin panel and release updates. EC2 runs the game,
admin, Redis, Caddy and the tunnel connector. It sends its five-minute checkpoint
exports to private S3.

If GitHub Pages or another static host serves `index.html`, create
`multiplayer-config.json` beside it with the production tunnel hostname:

```json
{ "endpoint": "wss://game.example.com/ws" }
```

Alternatively enter that address in Character → Multiplayer connection. A
local `file://` page can use `?server=ws://127.0.0.1:8787/ws`. Production HTTPS
pages require `wss://`. File origins are accepted only by the default loopback
server, unless explicitly enabled. Without a configured backend, the client
shows the connection form and waits for authentication.

For off-host recovery, get the bucket name with
`terraform -chdir=server/deploy output -raw backup_bucket` and choose a backup
from its `backups/` prefix. The bucket is protected against automatic deletion
while it contains objects. Preserve the Terraform state and the SSH PEM.

## Persistence

The active world, player profiles and username reservations live in ordinary
in-process objects/maps. Gameplay reads and mutations use RAM; commands share
an ordered queue in the world's owning Node process. Sockets, timers, queued
promises and simulation controllers stay outside the serializable state.

Set `REDIS_URL` to enable Redis checkpoints. Docker Compose configures Redis
automatically. Every `CHECKPOINT_INTERVAL_MS` (default **1000 ms**), changed games
capture a detached snapshot inside their action queue before asynchronous I/O.
Each document has a monotonically increasing version and an `active` or
`completed` status. Only one write per game can run at a time. Busy cycles are
coalesced; a successful write acknowledges only its captured version. A failed
write is logged and remains pending for the next cycle.

Redis atomically saves the document and its discovery registry at
`loeberland:v1:checkpoint:game:<id>` and `loeberland:v1:checkpoint:games`.
Startup restores all registered documents **before listening for gameplay**.
Reconnects receive fresh authoritative snapshots. Completed games remain
registered and cannot be reopened. Old world/player/name records in the same
backend are imported once, when no checkpoint registry exists; after that,
legacy records are ignored. The state editor transparently edits the checkpoint.

SIGTERM and SIGINT stop new actions and checkpoint scheduling, drain accepted
mutations, coordinate in-flight writes, and attempt the latest changed-game
checkpoints before closing Redis. Shutdown is idempotent and bounded by
`SHUTDOWN_TIMEOUT_MS` (default **10000 ms**, including storage close). Failure or
timeout is logged and shutdown finishes; no async `exit` handler is used.
Recovery restores the **latest successful checkpoint**. Changes since then can
be lost, including acknowledged purchases/rewards; outages can make that window
longer than one second. Personal travel resumes using the existing safe-position
rules rather than restoring sockets, animations or pending input commands.

Run **one owning Node process for the common world**, without cluster workers
or overlapping replicas. Redis's renewable ownership lease rejects a second
owner and fences checkpoint writes. Lease loss closes clients and suspends the
simulation. This handles application restarts and graceful deployments;
distributed simulation/failover is outside scope. Use the backups below for
host disaster recovery.

Without `REDIS_URL`, local development retains the SQLite fallback at
`server/data/world.sqlite`, using the same RAM/checkpoint lifecycle and a
worker for disk I/O. Switching from SQLite to Redis does not copy data between
backends: use the existing backend for an existing world until its data has
been migrated. Redis in Compose uses a named volume and AOF.

### SQLite backups

`backup.mts` exports every registered Redis game checkpoint into one standalone
SQLite database compatible with the existing SQLite store and state editor.
This includes world records, all saved player profiles/inventories, username
reservations, versions and completed games. Usernames are embedded in the game
checkpoint documents; the legacy `usernames` table is intentionally empty.
It excludes the transient simulation ownership lease and obsolete legacy keys.
The export reads the registry and all documents atomically with a read-only
Redis script. It does not acquire ownership or stop the running game.

Backups contain the latest **successful Redis checkpoint**, not unsaved RAM,
connections or pending actions. Reading the full snapshot briefly occupies
Redis. SQLite output is integrity-checked and published by atomic rename;
failed exports leave any previous output intact. Files have mode 0600 and
contain private player identity data.

On a Linux Docker Compose host, rebuild the image once, then run from the
repository root:

```sh
docker compose -f server/compose.yaml build game
bash server/backup.sh
```

The wrapper takes a nonblocking lock, writes UTC timestamped files under
`server/backups/` (override with Compose's `BACKUP_DIR`), and removes files
at least 24 hours old each time it runs, including when the next export fails.
It requires Bash, Docker Compose, Python 3 and `flock`. Set `COMPOSE_ENV_FILE`
if your Compose settings live outside `server/.env`. Set
`S3_BACKUP_URI=s3://your-bucket/backups` to upload each completed file and expire
older snapshot versions in that prefix using the AWS CLI.

For Node without Docker:

```sh
REDIS_URL=redis://127.0.0.1:6379 npm --prefix server run backup -- --output /safe/path/world.sqlite
```

The first EC2 release installs `deploy/loeberland-backup.cron` at
`/etc/cron.d/loeberland-backup`. It runs every five minutes, with a
four-minute timeout and rotated logs at `/var/log/loeberland-backup.log`.
Local snapshots live at `/var/lib/loeberland/backups`. Each run discards
snapshots aged 24 hours or more from local disk and private S3, including
noncurrent S3 versions. An S3 lifecycle rule backs up that cleanup.
To trigger it manually on EC2:

```sh
sudo bash -ec '. /etc/loeberland/backup.env; bash /opt/loeberland/current/sf/server/backup.sh'
```

To recover into Redis, stop the game and use `--restore` instead of `--output`.
Restore requires an **empty Redis database** and refuses to overwrite existing
data or a live ownership lease. For example, on EC2, use an unused Redis
database (here DB 1), preserving the previous DB 0:

```sh
sudo -i
cd /opt/loeberland/current
export LOEBERLAND_DEPLOYMENT_DIR="$PWD/private-deploy"
compose=(docker compose --env-file compose.env -f sf/server/compose.yaml
  -f private-deploy/production.compose.yaml --profile production)
"${compose[@]}" stop game
# Copy the chosen SQLite file to /var/lib/loeberland/backups/restore.sqlite first.
"${compose[@]}" run --rm --no-deps -T --user 0:0 --entrypoint node \
  --env REDIS_URL=redis://redis:6379/1 game backup.mjs --restore /backups/restore.sqlite
# Only after restore succeeds, persist the Redis DB selection for future releases.
printf 'REDIS_URL=redis://redis:6379/1\n' > /etc/loeberland/overrides.env
cat /etc/loeberland/overrides.env >> compose.env
"${compose[@]}" up -d --wait game admin
```

For SQLite recovery instead, stop the server and run it with `REDIS_URL` unset
and `STATE_FILE` pointing at the backup. Keep the original backup unchanged;
use a working copy when resuming gameplay or editing it.

### Simple database editor

The admin panel lists world records, per-player state and username reservations
from the latest saved Redis checkpoint (or the selected SQLite file). Search by
username or player ID, select a record and inspect its JSON. Refresh the list
or reload a record to read a newer checkpoint.

The page and every API endpoint require **HTTP Basic Auth**. The Node entry
point automatically loads `server/.env`; the Docker launcher reads that file
on the host and passes it to the temporary admin container. The file is
Git-ignored and excluded from Docker images and deployment archives.

For initial setup, copy `server/.env.example` to `server/.env` if a file
is not already present, and set:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD="your-long-random-password"
```

Run `chmod 600 server/.env`. Both values are required; the username cannot
contain a colon. Quote passwords containing `#` or spaces. Generate a password
with a password manager or `openssl rand -hex 32`. The panel refuses to start
with missing credentials and never prints the password.

From the repository root on a Docker Compose host:

```sh
docker compose -f server/compose.yaml build game
# Read-only inspection while the game keeps running:
bash server/edit-state.sh --view
```

Open **http://127.0.0.1:8788** and enter the `.env` credentials in the browser's
login prompt. `--view` disables writes in both the UI and API and does not
stop or restart the game. For an editing session, exit inspection and run:

```sh
bash server/edit-state.sh
```

The launcher starts the editor with live Redis saves while the game is running.
Change a record’s JSON and click **Save changes**. The server applies the edited
fields to its latest checkpoint and updates its in-memory state without
closing connections. If an edited field has changed in the meantime, reload
the record before trying again. To stop the game for manual maintenance instead,
launch the editor with `--offline`.

Username edits preserve the owner ID and enforce name validation/uniqueness.
This is a JSON editor, so keep existing record structure and value types intact.

For a Redis server reachable directly from Node:

```sh
REDIS_URL=redis://127.0.0.1:6379 ADMIN_READ_ONLY=1 npm --prefix server run admin
```

Set `ADMIN_QUEUE_EDITS=1` on both the game and editor to enable live Redis editing
with this command. For SQLite, stop the game and remove `ADMIN_READ_ONLY=1`. Then
leave `REDIS_URL` unset and set `STATE_FILE` to the existing database. The default
is `server/data/world.sqlite`; a missing file is an error. For example:

```sh
STATE_FILE=/path/to/world.sqlite npm --prefix server run admin
```

Use `ADMIN_PORT` to change port 8788. The Node panel binds to loopback by
default. The Docker launcher binds inside the container and publishes to host
loopback. On AWS with a custom domain, Caddy serves the panel at `/admin/`
over HTTPS. Saving an edit there briefly restarts the game. Use the SSH
editing session to make multiple changes during one maintenance window.

The panel shows one player record per owner, with `state` and `username`
fields. Saving checks and updates both fields together. A missing field is
shown as `null`. The global world record has its own entry.

For custom credential/settings files:

```sh
ADMIN_ENV_FILE=/secure/path/.env \
COMPOSE_ENV_FILE=/path/to/compose.env \
bash server/edit-state.sh --view
```

`ADMIN_ENV_FILE` also works with `npm --prefix server run admin`. Explicit
process environment variables take precedence over values loaded by Node.
The wrapper uses `COMPOSE_ENV_FILE` for the same project and Redis settings
as the game; credentials are passed as a file, without appearing in command
arguments. Rebuild the game image after changing admin code.

On Terraform-managed EC2, keep the password outside the unpacked release
so deployments preserve it. Create `/etc/loeberland/.env` with the two credential
lines above and mode 0600, then launch:

```sh
sudo env ADMIN_ENV_FILE=/etc/loeberland/.env \
  COMPOSE_ENV_FILE=/etc/loeberland/compose.env \
  bash /opt/loeberland/current/sf/server/edit-state.sh --view
```

Remove `--view` for an editing session. Use SSM port forwarding to local port 8788. On a host configured for SSH, `ssh -L 8788:127.0.0.1:8788 your-host`
provides the equivalent tunnel. Keep the tunnel open while using the panel.

## Configuration

These are the defaults when running Node directly. Compose sets `HOST=0.0.0.0`
inside the container, selects its Redis service and supplies the configured
allowed origins. It publishes game port 8787 on host loopback only.

| Variable                            | Default / purpose                                                          |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `HOST` / `PORT`                     | `127.0.0.1` / `8787`                                                       |
| `STATE_FILE`                        | `server/data/world.sqlite`; used when Redis is unset                       |
| `REDIS_URL`                         | Unset for Node; Compose defaults to `redis://redis:6379`                   |
| `CHECKPOINT_INTERVAL_MS`            | `1000`                                                                     |
| `SHUTDOWN_TIMEOUT_MS`               | `10000`                                                                    |
| `MAX_PLAYERS`                       | `2000`; admission limit, not a capacity guarantee                          |
| `ALLOWED_ORIGINS`                   | Comma-separated exact frontend origins; loopback is accepted locally       |
| `ALLOW_FILE_ORIGIN`                 | Off for non-loopback servers; explicitly allows `file://` clients          |
| `DEBUG_TELEPORT_ALL`                | Allow every character to use `:tp`. Default follows the launch mode.      |
| `ADMIN_HOST` / `ADMIN_PORT`         | Editor bind address/port: `127.0.0.1` / `8788`                             |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Required HTTP Basic Auth credentials; no default                           |
| `ADMIN_ENV_FILE`                    | Admin credentials/settings file; defaults to `server/.env`                 |
| `ADMIN_READ_ONLY`                   | `0`; set `1` for inspection with writes disabled (`--view` sets it)        |
| `GAME_DOMAIN`                       | Public Cloudflare Tunnel hostname in the production Compose environment      |
| `BACKUP_DIR`                        | Compose backup bind directory; default `server/backups/`                   |
| `COMPOSE_ENV_FILE`                  | Backup/admin launchers' Compose env file; default `server/.env`            |
| `S3_BACKUP_URI`                     | Optional backup-wrapper upload destination, such as `s3://bucket/backups`  |

For local Compose, keep `ALLOWED_ORIGINS` and other persistent settings in
`server/.env`. On EC2, use the active release's
`/opt/loeberland/current/compose.env` with the production Compose files shown
in the restore instructions.

`DEBUG_TELEPORT_ALL` accepts `true` or `false`. Non-production Node servers on
loopback and `./deploy/local.sh` enable it by default. Production and shared
Compose deployments default to individual character permissions. The direct Node
default for local development is set in [tuning.mts](tuning.mts).

## Health and diagnostics

```sh
curl -fsS http://127.0.0.1:8787/healthz
docker compose -f server/compose.yaml ps
docker compose -f server/compose.yaml logs --tail 100 game redis
```

Use `./deploy/aws.sh status` to see the production services. On EC2, use the
production Compose command shown in the restore instructions to read their logs.

`/healthz` reports player counts/capacity, the active storage backend,
checkpoint versions and interval, event-loop delay, tick/broadcast timings,
CPU/memory/bandwidth, action backlog and route-cache statistics. Failed
ownership or shutdown makes it return 503. Watch checkpoint versions advance
when the world changes; repeated checkpoint errors mean recovery will use an
older save. See [CAPACITY.md](CAPACITY.md) for metric definitions and load tests.

Gameplay commands operate on RAM inside one ordered mutation queue. Clients
send intents and cosmetic preferences; the server owns positions, health,
inventory, XP and quest progress. The browser interpolates server movement.
Simulation runs at 20 Hz, player replication at 10 Hz and world/private
replication at 5 Hz (`src/config/gameplay.ts`). World and private messages carry
their server sample time. The renderer uses a bounded snapshot buffer for NPC
movement and gait, including personal police and shared animal chases, rather
than running client-side paths or increasing the simulation/broadcast rates.
The current protocol version is defined in `src/multiplayer-protocol.ts`;
deploy matching static-client and server builds together when changing it.
Server-only code is excluded from the client build.

For anonymous accounts, the browser holds the credential and the server stores
its hash. Losing browser storage loses access to the identity. Backing up server
state does not recover a credential deleted from the browser.
