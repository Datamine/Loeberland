#!/usr/bin/env bash
set -euo pipefail
umask 077

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
action=${1:-up}
if [[ $action == --help || $action == -h ]]; then
    echo 'Usage: ./deploy/local.sh [up|down|logs|status|credentials|edit]'
    exit
fi
case "$action" in
    up|down|logs|status|credentials|edit) ;;
    *) echo 'Usage: ./deploy/local.sh [up|down|logs|status|credentials|edit]' >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then exit 2; fi
export ADMIN_ENV_FILE="${ADMIN_ENV_FILE:-$root/.deploy/local-admin.env}"
export LOCAL_DEBUG_TELEPORT_ALL=true
if [[ $ADMIN_ENV_FILE != /* ]]; then export ADMIN_ENV_FILE="$PWD/$ADMIN_ENV_FILE"; fi

if [[ $action == credentials ]]; then
    exec cat "$ADMIN_ENV_FILE"
fi
if ! docker compose version >/dev/null; then
    echo 'Install Docker with the Compose v2 plugin, then retry.' >&2
    exit 1
fi
compose=(docker compose -f "$root/server/compose.yaml" --profile admin)
if [[ -n ${COMPOSE_ENV_FILE:-} ]]; then compose+=(--env-file "$COMPOSE_ENV_FILE"); fi

case "$action" in
    up)
        SF_BUILD_COMMIT=$(git -C "$root" rev-parse --verify HEAD 2>/dev/null || true)
        export SF_BUILD_COMMIT
        if [[ ! -s $ADMIN_ENV_FILE ]]; then
            mkdir -p -m 700 "$(dirname -- "$ADMIN_ENV_FILE")"
            password=$(openssl rand -hex 24)
            printf 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=%s\n' "$password" > "$ADMIN_ENV_FILE"
        fi
        "${compose[@]}" build game
        "${compose[@]}" up -d --wait --wait-timeout 300
        echo 'Game: http://127.0.0.1:8787/'
        echo 'Admin: http://127.0.0.1:8788/ (use ./deploy/local.sh credentials)'
        ;;
    down) exec "${compose[@]}" down ;;
    logs) exec "${compose[@]}" logs -f ;;
    status) exec "${compose[@]}" ps ;;
    edit) exec bash "$root/server/edit-state.sh" ;;
esac
