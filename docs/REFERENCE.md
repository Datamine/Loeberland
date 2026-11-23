See [TYPESCRIPT.md](TYPESCRIPT.md) for source extensions, setup, type checking, and compiled server commands.

# Explore SF

A static WebGL client backed by one authoritative Node.js game server. The
backend serves the site and WebSocket endpoint; SQLite is the local default,
and Docker Compose uses Redis. Gameplay requires a connected backend.

This is the standalone Loeberland project. Run the commands below from this
directory. The game, editor, server, artwork, and favicon are included.

- [Run locally](#run-locally)
- [Develop and rebuild](#develop-and-rebuild)
- [Checks](#checks)
- [Deploy](#deploy)
- [Admin panel](#admin-panel)
- [Source layout](#source-layout)
- [World editor](#world-editor)
- [Troubleshooting](#troubleshooting)

Gameplay, quests, vehicles and world details are in [DOCUMENTATION.md](GAMEPLAY.md).
Server configuration, backups, recovery and deployment procedures are in the
[server operations guide](../server/README.md).

## Run locally

Use Node.js **22.16 or later** and npm; the Docker image uses Node 24.

```sh
npm ci
npm ci --prefix server
npm run build
npm --prefix server start
```

Open **http://127.0.0.1:8787/**. The backend provides its own
`multiplayer-config.json`. Stop with Ctrl+C so it can save the final checkpoint.
Local state is saved to `server/data/world.sqlite` unless `STATE_FILE` or
`REDIS_URL` selects another store.

For a local Redis-backed stack instead:

```sh
npm ci
npm run build
docker compose -f server/compose.yaml up --build -d game
```

Use `docker compose -f server/compose.yaml logs -f game` for logs and
`docker compose -f server/compose.yaml down` to stop. Keep the named volumes;
`down -v` deletes the saved world.

Use another browser profile or an incognito window to test a second player.
Two tabs sharing one anonymous credential control one character; the newest
connection replaces the previous one. Clearing browser storage loses that
credential; there is no account recovery.

## Develop and rebuild

Keep the backend running on port 8787. In a second terminal, start the source
module preview:

```sh
npm run dev
```

Open **http://127.0.0.1:8080/?server=ws://127.0.0.1:8787/ws**.
Refresh to load edited client modules. Restart the backend after changing
server code or shared gameplay/configuration modules.

Rebuild after changing map layouts, models or configuration, including when
using the source preview, and before publishing:

```sh
npm run build
```

The build validates navigation, compiles versioned map chunks, assembles the
material atlas/reference, and writes `index.html`. Deploy the generated HTML
and `world-cache/` together. Preview the generated page at
**http://127.0.0.1:8080/?built&server=ws://127.0.0.1:8787/ws**.

| Change                           | Edit                                                            | Follow-up                                            |
| -------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Game template or styles          | `game.template.html`, `game.css`                                | Rebuild `index.html`                                 |
| Map layout or models             | `*layout.ts`, geometry/model modules                            | Rebuild and restart the backend                      |
| Balance, items or NPC appearance | [config/](../src/config/README.md)                              | Keep saved IDs stable; rebuild and restart           |
| Material artwork                 | `textures/materials/*.svg`                                      | Rebuild; restart the preview if the catalog changes  |
| Billboard artwork                | [billboards/](../billboards/README.md), `billboards/catalog.ts` | Rebuild production assets                            |
| Server behavior                  | `server/*.mts`                                                  | Restart; rebuild the client when shared code changes |

Do not hand-edit generated `index.html`, `textures/sf-materials.svg`,
`textures/materials/preview.html` or compiled world-cache files. The preview
assembles material SVGs on request; production embeds the generated atlas.

Deploy compatible client and server builds together when changing the protocol;
its version is defined in `src/multiplayer-protocol.ts`.

## Checks

Build before running the client suite: it checks that generated assets match
the source. Run the relevant focused tests while editing, then the suites
needed by the change:

```sh
npm run lint
npm run format:check
npm test
npm --prefix server test
```

For the optional Redis integration tests, install `redis-server` locally:

```sh
RUN_REDIS_TESTS=1 npm --prefix server test
```

Those tests create disposable Redis instances on free loopback ports. To audit
the production navigation graph without a browser or server:

```sh
node --import ./node_modules/tsx/dist/loader.mjs tools/audit-navigation.mts
```

The build also validates interaction approaches. The focused server check is
`node --import ./node_modules/tsx/dist/loader.mjs --test server/tests/interaction-access.test.mts`. Use a browser to
check rendering, picking, UI and camera changes; graph tests cannot verify them.
For load tests, metrics and tuning, see [server/CAPACITY.md](../server/CAPACITY.md).
Use a disposable world for load tests because they create real player profiles.

## Deploy

Use [the deployment guide](../deploy/README.md) for a single EC2 host or a local
Docker Compose stack. `./deploy/aws.sh` builds and deploys the game and the
private admin panel on AWS. `./deploy/local.sh` runs the same services locally.
Review [backup and restore](../server/README.md#sqlite-backups) before
moving an existing world.

## Admin panel

The admin panel shows the latest saved Redis checkpoint, including per-player
state, world state and usernames. Search for a username or player ID, select a
record, and inspect its JSON. **Only edit while the game is stopped**: the live
server owns its state in RAM, and Redis rejects admin saves while its ownership
lease is active. Restart the game after saving to load the edited state.

The page and all API routes require HTTP Basic Auth. Credentials live in the
gitignored **`server/.env`**:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD="your-long-random-password"
```

Use the existing file if present. For a new checkout, copy
`server/.env.example` to `server/.env`, set a password, and run
`chmod 600 server/.env`. An empty password prevents the panel from starting.
Keep this file out of deployment archives and container images.

For the Docker Compose Redis stack, rebuild the image after updating admin
code, then choose inspection or editing:

```sh
docker compose -f server/compose.yaml build game
# Inspect without stopping the game; writes are disabled.
bash server/edit-state.sh --view
# Or open an editing session; stops the game and restarts it when you exit.
bash server/edit-state.sh
```

Open **http://127.0.0.1:8788** and sign in with the `.env` credentials. Refresh
the list or reload a record to see a newer saved checkpoint. In an editing
session, change the JSON and click **Save changes**, then press Ctrl+C in the
launcher to close the panel and restart the game. A game that was already off
stays off; start it yourself after editing.

For a Redis server reachable directly from Node:

```sh
REDIS_URL=redis://127.0.0.1:6379 ADMIN_READ_ONLY=1 npm --prefix server run admin
```

Stop the game and omit `ADMIN_READ_ONLY=1` to enable edits. The Node launcher
loads `server/.env` automatically. Use `STATE_FILE` instead of `REDIS_URL`
to inspect a local SQLite save. Keep the panel on loopback and use an SSH/SSM
tunnel for remote access; see the [admin operations guide](../server/README.md#simple-database-editor)
for EC2 credentials and custom env-file paths.

## Source layout

`src/config/reader-content.json` holds the game’s existing website excerpts for building interiors. They are independent of the homepage markup.

| Path                                                                   | Responsibility                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `game.template.html`, `game.css`                                       | Game HTML template and styling                                                                                       |
| `src/world.ts`, `src/world/`                                           | Browser entry, composition, map construction, navigation, rendering, HUD, minimap, interactions and runtime services |
| `src/client/controllers.ts`, `src/ui/`                                 | Explicit server-command views and scheduled DOM updates                                                              |
| `src/rendering/`                                                       | Cached GPU character geometry, skinning shader, picking reference and dynamic buffers                                |
| `tools/build.mts`, `tools/build-bundle.mts`, `tools/dev.mts`           | Scoped esbuild production bundle, asset inlining, source maps and native-module preview                              |
| `tools/build-world-inputs.mts`                                         | Semantic geometry inputs for independently versioned map compilation                                                 |
| `src/config/`                                                          | Shared editable definitions; [editing guide](../src/config/README.md)                                                |
| `src/dialogues/`                                                       | [NPC conversations](../src/dialogues/README.md), Goose Corp lore and original source posts                           |
| `src/world-stream.ts`, `src/world-codec.ts`, `src/world-tile-codec.ts` | Static map loading and encoding                                                                                      |
| `src/navigation.ts`, `src/regional-navigation.ts`                      | Shared navigation and reachability                                                                                   |
| `multiplayer-*.ts`, `src/server-connection.ts`                         | Client protocol, synchronization and connection gate                                                                 |
| `server/index.mts`, `server/game.mts`                                  | HTTP/WebSocket server and simulation lifecycle                                                                       |
| `server/store.mts`, `server/checkpoints.mts`                           | Persistence adapters and RAM checkpoint lifecycle                                                                    |
| `server/deploy/`                                                       | Packaging, Terraform and EC2 bootstrap                                                                               |
| `tests/`, `server/tests/`                                              | Client/shared-rule and backend tests                                                                                 |

Detailed module descriptions and rendering/navigation design are in
[DOCUMENTATION.md](GAMEPLAY.md#implementation-reference).

Bolinas lives in `src/bolinas.ts` and shares Marin’s navigation graph. Combat
supplies are server-owned: akimbo ammo packs contain 20 rounds for 5 coins;
20-coin batteries charge a railgun for 25 shots. The EMF accelerator increases
railgun fire rate by 10%. Death drops contain only coins, iPhone and sandwiches;
equipment stays owned. Hospital respawn waits for the three-second collapse.

## World editor

Open [`editor.html`](../editor.html) directly or through the development
server. It lists the game’s teal object targets and yellow NPC targets, excluding
generic Man, Woman and Child NPCs. Search by name, ID, examine text or dialogue;
inspect action order and quest/ownership variants, expand dialogue branches,
or use Play through to preview a conversation. The editor never performs game
actions. Shared casual conversations are available from eligible NPCs.
Placements with the same definition and examine text share one catalog entry.
Enable **Show duplicates** to list each placement separately.
Definition details provides a world-placement selector for inspecting any
location-specific text or menus; searches include every placement's ID and text.
Use **Only duplicate NPC names** to filter by repeated names. Use **NPCs with
the same name and different examine text** to further narrow the results by
examine text. Both filters work with search and type selection.

Enable **Draft edits** to rename entries, switch their category between NPC and
Object, or edit their examine text and menus. Examine edits apply to the selected
placement. Names and categories update the
editor's labels, colors, filters and action previews immediately. Name and category
edits apply to all placements using the selected definition. Categories control
NPC/object classification and menu colors while preserving each target's existing
capabilities.

Run `npm run dev` and open **http://localhost:8080/editor.html**.
**Save to game** validates and writes canonical JSON in [`content/`](../content/README.md), then publishes a fresh runtime document and editor. It does not rebuild the map. Stale edits are rejected; failed publication restores previous source files and retains drafts. HTTP clients load new content automatically. The write API exists only on the development server and accepts known catalog fields, not file paths or executable callbacks.

Dialogue variants and individual options support JSON conditions based on player/quest state. Enable Draft edits and expand **Condition (JSON)**. **Player state for preview (JSON)** simulates progress without changing a real save. See [the content format](../content/README.md) for conditions, text bindings, stable IDs and save migration.

Until saved, edits remain in the browser. **Export changes** downloads
`world-editor-changes.json` with original values, proposed values and field paths.
Discard has an Undo option. Opening the page directly or on static hosting still
supports inspection, local drafts and export; filesystem saving uses the local server.

`npm run build:editor` refreshes the catalog independently. The normal
game build refreshes it too. The generated page embeds
its data, styles and JavaScript, so inspection needs no game server or network.

## Troubleshooting

- **Character rendering:** body shapes are uploaded once as indexed bind
  meshes. Bone poses, placement and cached color palettes drive the GPU shader
  each frame. Rocket and clock wearables share this cache; changing flame/clock
  revisions reuse their buffers. The 64 MiB character cache budget is configured
  in `src/config/rendering.ts`, separately from scenery. Dynamic props use three
  reusable buffers to avoid reallocating storage each frame. Exact posed body
  triangles are generated only for a candidate mouse ray; conservative bone
  bounds cover selection in between. Rolls and capture collapse retain the
  existing CPU path. Small previews also use the CPU reference.
  `SFMapDiagnostics.characters` and `.dynamicGeometry` expose cache hits,
  uploads, memory and per-frame work. `?characterRenderer=cpu` provides a
  comparison/fallback. Context restoration creates fresh GPU buffers from
  cached source meshes. Whole-mesh transforms must use
  `src/rendering/mesh-transform.ts` so CPU triangles, deferred GPU characters and
  picking stay aligned. [The visual audit](../tools/character-gpu-audit.html)
  compares the CPU and GPU paths and benchmarks 32-character construction.
- **Human NPC animation:** `src/human-npc.ts` supplies the shared renderer for
  pedestrians, service staff, researchers, guards, pursuers, diners and humanoid
  enemies. A display-only gait follows interpolated distance, retains its phase
  through stops, and blends movement and turns. The same wrapper preserves
  seated, cycling and scripted actions. Per-actor state lives in a WeakMap and
  never changes server positions, patrols or combat clocks.
- **Chase animation:** `src/snapshot-motion.ts` buffers movement samples on the
  server clock; `src/pursuit-presentation.ts` applies this to police, the zookeeper,
  tiger, animal control and raptor. `src/npc-network.ts` uses the same sampler for
  ordinary NPCs and combat creatures. Positions, facing and gait interpolate
  every rendered frame, 250 ms behind server samples (one 5 Hz update plus
  50 ms of jitter allowance). HP and chase/capture state apply immediately.
  Movement holds at the latest known sample if packets stall, freezes on
  disconnection, and resets on teleports, instance changes and reconnects.
- **Connection screen or frozen world:** check `http://127.0.0.1:8787/healthz`,
  the backend logs and the configured WebSocket endpoint. The game waits for
  authentication; `?offline=1` does not bypass the connection gate.
- **Separate preview cannot connect:** use the `?server=ws://127.0.0.1:8787/ws`
  URL above. Endpoint selection uses the URL override, then the saved browser
  setting, then `multiplayer-config.json`.
- **Old or failed map load:** rebuild and deploy both the HTML and compiled map
  chunks. If the loading error screen appears, use **Reload map data** to clear
  the `sf-static-world` IndexedDB cache. Character identity and server progress
  are unaffected.
- **Map or performance diagnosis:** inspect `SFMapDiagnostics.streaming`,
  `SFMapDiagnostics.navigation` and `SFMapDiagnostics.report` in the browser
  console. `:debug` shows coordinates and rendering FPS in the game.
- **Server refuses to start:** check its logs, storage connection and whether
  another process owns the Redis world. Run one simulation process per world.

## Build and runtime boundaries

Run `npm ci` for the pinned build tools. `npm run format`
formats source; `lint` rejects undefined bindings, unused imports/variables,
unreachable code and duplicate imports. Keep native ES module imports: esbuild
follows the graph, preserves module scope and removes unused bundled code.
The static build still embeds artwork and works with `file://`. Deploy
`explore.js.map` for browser source debugging; `bundle-meta.json` records
per-module bundle contributions. Neither is required for gameplay.

`src/world/scene.ts` composes explicit services through live dependency bindings.
`src/world/model.ts` exposes the DOM-free authoritative map constructor. World
construction, navigation, rendering, minimap, HUD, interactions, synchronization
and runtime animation have separate modules. Add server intents in
`src/client/controllers.ts`; do not patch domain methods after construction. Client
views share snapshot state and selectors with domain controllers but omit local
simulation and persistence clocks. Node/headless construction uses the original
controllers. Browser movement and authoritative simulation fallbacks are removed.

Rigid airship hulls, Ferrari bodies/tires, streetcars and parked rockets use
`src/rendering/cached-mesh.ts` and the GPU mesh cache. Rotors/spokes remain animated;
transparent runs retain the sorted glass path. Small CPU previews still work.
HUD, settings/countdowns and minimap redraws run at most 10 Hz during ordinary
frames; action-triggered HUD/minimap refreshes apply immediately. Camera rotation refreshes the minimap on the same frame to preserve alignment. Cached DOM
handles skip identical property writes. Character/camera rendering stays at the
display cadence.

Map invalidation hashes semantic ASTs of geometry/layout inputs, independently
of browser HUD, interaction, dialogue, networking, HTML and artwork edits.
Formatting does not change the map version. An unchanged map reuses its saved
navigation audit and skips model construction and mesh baking entirely. Geometry
changes still rebuild and validate the map. Compiled chunks remain content-addressed.

Server replication uses versioned immutable private component snapshots in
`server/player-components.mts`. Ordinary walking/idle samples reuse component
records; active pursuits and travel compare their explicit fields. Only changed
component revisions are sent. Global rounded snapshots are prepared once per
broadcast, rather than parsed for each recipient. The simulation owner, ordered
action queue, interest bounds, protocol and checkpoint semantics are unchanged.
See [capacity documentation](../server/CAPACITY.md) for measurements and limits.
