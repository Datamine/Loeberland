#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == --help ]]; then
    cat <<'HELP'
Usage: bash server/edit-state.sh [--view|--offline]

Opens the database editor using the existing Docker Compose game image and
Redis settings. Changes apply to the running game. Save in the browser, then
press Ctrl+C in this terminal. Use --view for read-only inspection or --offline
to stop the game for an offline editing session.

ADMIN_USERNAME and ADMIN_PASSWORD are loaded from deploy/.env.local-admin. ADMIN_ENV_FILE
selects another credentials file; COMPOSE_ENV_FILE selects the Compose settings.

ADMIN_PORT defaults to 8788. Run on the deployment host; for remote access:
  ssh -L 8788:127.0.0.1:8788 your-host

Rebuild the game image after updating the editor code before using this script.
HELP
    exit 0
fi
read_only=0
offline=0
if [[ $# == 1 && $1 == --view ]]; then
    read_only=1
elif [[ $# == 1 && $1 == --offline ]]; then
    offline=1
elif [[ $# != 0 ]]; then
    echo 'Usage: bash server/edit-state.sh [--help|--view|--offline]' >&2
    exit 2
fi

port=${ADMIN_PORT:-8788}
if [[ ! $port =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
    echo 'ADMIN_PORT must be an integer between 1 and 65535.' >&2
    exit 2
fi
port=$((10#$port))
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
auth_file=${ADMIN_ENV_FILE:-$script_dir/../deploy/.env.local-admin}
if [[ ! -f $auth_file ]]; then
    echo "Admin credentials file not found: $auth_file. Set ADMIN_USERNAME and ADMIN_PASSWORD there first." >&2
    exit 2
fi
auth_file="$(cd -- "$(dirname -- "$auth_file")" && pwd)/$(basename -- "$auth_file")"
env_file=${COMPOSE_ENV_FILE:-$script_dir/../deploy/.env.local}
if [[ -n ${COMPOSE_ENV_FILE:-} && ! -f $env_file ]]; then
    echo "Compose environment file not found: $env_file" >&2
    exit 2
fi
if [[ ! -f $env_file ]]; then env_file=/dev/null; fi
compose=(docker compose --env-file "$env_file" -f "$script_dir/compose.yaml" --profile admin)
admin_compose=("${compose[@]}" -f "$script_dir/admin.compose.yaml")
"${compose[@]}" config --quiet
if [[ -z $("${compose[@]}" images --quiet game) ]]; then
    echo 'Deploy the game image first: docker compose -f server/compose.yaml up --build -d game' >&2
    exit 1
fi
editor_help=$("${compose[@]}" run --rm --no-deps game node admin.mjs --help)
if [[ $editor_help != *ADMIN_USERNAME* ]]; then
    echo 'Rebuild the game image first: docker compose -f server/compose.yaml build game' >&2
    exit 1
fi
# Pass the credentials file directly to the editor container.
ADMIN_ENV_FILE="$auth_file" "${admin_compose[@]}" run --rm --no-deps game node admin.mjs --check-auth
"${compose[@]}" up -d --wait redis
running=$("${compose[@]}" ps --status running --quiet game)
running_admin=$("${compose[@]}" ps --status running --quiet admin)
restart_game=0
restart_admin=0
live_edits=0

cleanup() {
    local status=$?
    trap - EXIT INT TERM
    if (( restart_game )); then
        echo 'Restarting the game to load saved changes…'
        "${compose[@]}" start game || status=1
    fi
    if (( restart_admin )); then
        "${compose[@]}" start admin || status=1
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if (( port == 8788 )) && [[ -n $running_admin ]]; then
    restart_admin=1
    "${compose[@]}" stop admin
fi
if [[ -n $running ]] && (( offline )); then
    restart_game=1
    echo 'Stopping the game and flushing its latest checkpoint…'
    "${compose[@]}" stop game
fi
if [[ -n $running ]] && (( !read_only && !offline )); then
    live_edits=1
fi
if (( read_only )); then
    echo "Read-only inspection: open http://127.0.0.1:$port. The game can keep running."
else
    echo "Open http://127.0.0.1:$port, save your changes, then press Ctrl+C here."
fi
echo 'Sign in using ADMIN_USERNAME and ADMIN_PASSWORD from the credentials file.'
ADMIN_ENV_FILE="$auth_file" "${admin_compose[@]}" run --rm --no-deps \
    --publish "127.0.0.1:$port:$port" \
    --env ADMIN_HOST=0.0.0.0 --env "ADMIN_PORT=$port" \
    --env "ADMIN_READ_ONLY=$((read_only || live_edits))" --env "ADMIN_QUEUE_EDITS=$live_edits" \
    game node admin.mjs
