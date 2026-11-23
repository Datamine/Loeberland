# Loeberland

A multiplayer San Francisco game with a WebGL client, a Node.js server, a game content editor, and a game state editor.

## Deploy or run locally

```sh
./deploy/aws.sh     # EC2, HTTPS, SSH and admin
./deploy/local.sh   # Game and admin on Docker Compose
```

See the [deployment guide](deploy/README.md) for prerequisites, SSH, credentials and updates.

## Run locally

### Game server

Use Node.js 22.16 or later. With Redis running locally on port 6379, run these commands from the repository root:

```sh
npm run setup
npm run build
REDIS_URL=redis://127.0.0.1:6379 npm --prefix server start
```

Open **http://127.0.0.1:8787/** to play. The server saves world and player checkpoints to Redis when `REDIS_URL` is set. With `REDIS_URL` unset, `npm --prefix server start` uses SQLite at `server/data/world.sqlite` by default. Existing saves stay in their original backend when you switch. Docker Compose configures Redis by default. [Docker Compose setup](server/README.md#run-locally)

Local loopback servers and `./deploy/local.sh` enable `:tp` for every character by default. Set `DEBUG_TELEPORT_ALL=false` to use individual character permissions. [Server settings](server/README.md#configuration)

### Game editor (authored content)

Run the development server from the repository root:

```sh
npm run dev
```

Open **http://127.0.0.1:8080/editor.html** to edit entities, dialogue, menus, world labels, and item stats. Saving writes directly to `content/`.

With the game server running, open **http://127.0.0.1:8080/?server=ws://127.0.0.1:8787/ws** to play using the source client. Use `/?built` to preview the generated client.

### Game state editor (saved world and players)

Copy `server/.env.example` to `server/.env` if it does not exist, then set `ADMIN_USERNAME` and `ADMIN_PASSWORD`. To inspect saved world records, player progress, and username reservations while the game is running, use the same Redis URL as the game server:

```sh
REDIS_URL=redis://127.0.0.1:6379 ADMIN_READ_ONLY=1 npm --prefix server run admin
```

Open **http://127.0.0.1:8788/** and sign in with the admin credentials. To edit records, stop the game server, relaunch the editor without `ADMIN_READ_ONLY=1`, then restart the game server after saving. If the game uses SQLite, leave `REDIS_URL` unset for the editor too and use the same `STATE_FILE` if you set one. [Docker Compose and state editor instructions](server/README.md#simple-database-editor)

## Project layout

| Directory                  | Contents                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| `src/`                     | Game modules, shared rules, configuration, types, rendering, and world code |
| `server/`                  | Multiplayer backend, persistence, admin tools, and deployment               |
| `editor/`                  | Content editor interface and filesystem writer                              |
| `content/`                 | Authored JSON, dialogue, player-state defaults, and schemas                 |
| `tools/`                   | Build scripts, development server, audits, and benchmarks                   |
| `tests/`                   | Client, shared-rule, build, and editor regression tests                     |
| `textures/`, `billboards/` | Artwork and asset catalogs                                                  |
| `docs/`                    | Gameplay documentation, TypeScript guide, reference, and audit reports      |
| `world-cache/`             | Generated map chunks, ignored by Git                                        |
| `.build/`                  | Generated JavaScript server runtime and its assets                          |

`game.template.html` and `game.css` define the game interface. `index.html`, `editor.html`, `explore.js.map`, and `bundle-meta.json` are generated outputs. `favicon.ico` is the game favicon.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
```

See [the TypeScript guide](docs/TYPESCRIPT.md), [gameplay documentation](docs/GAMEPLAY.md), [full reference](docs/REFERENCE.md), and [server operations guide](server/README.md).
