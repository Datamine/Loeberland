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
compose_value() {
    awk -v key="$1" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }' \
        "$release/compose.env"
}

private_sha=$(compose_value LOEBERLAND_DEPLOY_SHA256)
if [[ -n $private_sha ]]; then
    [[ $private_sha =~ ^[a-f0-9]{64}$ ]]
    bucket=$(compose_value LOEBERLAND_DEPLOY_BUCKET)
    region=$(compose_value LOEBERLAND_DEPLOY_REGION)
    secret_arn=$(compose_value LOEBERLAND_DEPLOY_SECRET_ARN)
    private_dir="$release/private-deploy"
    mkdir -m 0700 "$private_dir"
    aws s3 cp "s3://$bucket/private-deploy/$private_sha.tar.gz" "$private_dir/bundle.tar.gz" \
        --region "$region" --only-show-errors
    printf '%s  %s\n' "$private_sha" "$private_dir/bundle.tar.gz" | sha256sum -c --status
    tar -xzf "$private_dir/bundle.tar.gz" -C "$private_dir" --no-same-owner --no-same-permissions
    rm -- "$private_dir/bundle.tar.gz"
    bash "$private_dir/prepare.sh" "$region" "$secret_arn"
    cp "$private_dir/production.compose.yaml" "$release/production.compose.yaml"
elif [[ -f /etc/loeberland/production.compose.yaml ]]; then
    cp /etc/loeberland/production.compose.yaml "$release/production.compose.yaml"
fi
if [[ -f $release/production.compose.yaml ]]; then
    printf 'PRODUCTION_COMPOSE_SHA=%s\n' "$(sha256sum < "$release/production.compose.yaml" | cut -d ' ' -f 1)" >> "$release/compose.env"
fi

compose() {
    local directory=$1
    shift
    local files=(-f "$directory/sf/server/compose.yaml")
    if [[ -f "$directory/production.compose.yaml" ]]; then
        files+=(-f "$directory/production.compose.yaml")
    fi
    LOEBERLAND_DEPLOYMENT_DIR="$directory/private-deploy" \
        docker compose --env-file "$directory/compose.env" "${files[@]}" --profile production "$@"
}

verify_release() {
    if [[ -n $private_sha ]]; then
        bash "$private_dir/verify.sh" "$(compose_value GAME_DOMAIN)"
    fi
}

if [[ -n $old ]] && cmp -s "$release/compose.env" "$old/compose.env" &&
    { [[ -z $private_sha ]] || diff -qr "$private_dir" "$old/private-deploy" >/dev/null 2>&1; }; then
    compose "$old" up -d --wait --wait-timeout 300
    verify_release
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
if ! compose "$release" up -d --wait --wait-timeout 300 || ! verify_release; then
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
