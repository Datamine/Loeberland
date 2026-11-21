# Loeberland

A multiplayer San Francisco game with a WebGL client, a Node.js server, and a JSON content editor.

## Run locally

Use Node.js 22.16 or later. From this directory:

```sh
npm run setup
npm run build
npm --prefix server start
```

The game server runs at **http://127.0.0.1:8787/**. Local player saves stay in `server/data/world.sqlite`.

For development, keep the backend running and start the source preview in another terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:8080/?server=ws://127.0.0.1:8787/ws** for the game, or **http://127.0.0.1:8080/editor.html** for the editor. Editor saves write directly to `content/`. Use `/?built` to preview the generated client.

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
| `world-cache/`             | Generated map chunks                                                        |
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
