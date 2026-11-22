#!/usr/bin/env bash
set -euo pipefail

release=${1:?Supply the unpacked release directory.}
root=/opt/loeberland
old=$(readlink -f "$root/current" || true)
tag=$2
rm -f -- "$release/game.tar.gz"
if [[ -f /etc/loeberland/overrides.env ]]; then
    cat /etc/loeberland/overrides.env >> "$release/compose.env"
fi
printf '\nRELEASE_TAG=%s\n' "${tag:0:24}" >> "$release/compose.env"

compose() {
    local directory=$1
    shift
    docker compose --env-file "$directory/compose.env" \
        -f "$directory/sf/server/compose.yaml" --profile production "$@"
}

if [[ -n $old ]] && cmp -s "$release/compose.env" "$old/compose.env"; then
    compose "$old" up -d --wait --wait-timeout 300
    rm -rf -- "$release"
    echo 'The active release is already up to date.'
    exit 0
fi

# Build and validate before Compose replaces any running services.
compose "$release" config --quiet
compose "$release" build game
compose "$release" run --rm --no-deps -T proxy \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
if [[ -n $old && -f $old/compose.env ]] &&
    compose "$old" exec -T game node -e '
        const { createConnection } = require("node:net");
        if (!process.env.DEPLOY_NOTICE_SOCKET) process.exit(1);
        const socket = createConnection(process.env.DEPLOY_NOTICE_SOCKET);
        socket.setTimeout(2000, () => socket.destroy(new Error("Notice timed out")));
        socket.on("error", () => process.exit(1));
        socket.on("data", (data) => { if (data.toString() === "ok") process.exit(0); });
        socket.on("end", () => process.exit(1));
    ' >/dev/null 2>&1; then
    echo 'Update notice sent. Waiting five seconds before restarting…'
    sleep 5
fi
if ! compose "$release" up -d --wait --wait-timeout 300; then
    compose "$release" logs --tail=40 >&2 || true
    if [[ -n $old && -f $old/compose.env ]]; then
        echo 'Restoring the previous release…' >&2
        compose "$old" up -d --wait --wait-timeout 300
    fi
    exit 1
fi

ln -sfn "$release" "$root/current"
install -m 644 "$release/sf/server/deploy/loeberland-backup.cron" /etc/cron.d/loeberland-backup
cat > /etc/logrotate.d/loeberland-backup <<'ROTATE'
/var/log/loeberland-backup.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
ROTATE
# Keep the active release and one prior release for recovery.
find "$root/releases" -mindepth 1 -maxdepth 1 -type d -name 'release-*' \
    ! -path "$release" ! -path "$old" -exec rm -rf -- {} +
echo 'Game, admin and reverse proxy started.'
