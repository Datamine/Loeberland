#!/usr/bin/env bash
set -euo pipefail
umask 077

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tf_dir="$root/server/deploy"
local_dir="$root/.deploy"
key="$local_dir/aws.pem"
action=${1:-deploy}

usage() {
    cat <<'HELP'
Usage: ./deploy/aws.sh [deploy|ssh|admin|edit|credentials|status]

deploy       Build the current checkout and create or update the AWS server.
ssh         Log in to the host with the generated PEM.
admin       Forward the read-only admin panel to http://127.0.0.1:8788/.
edit        Stop the game for an editing session, then restart it on exit.
credentials Display the credentials for the private admin panel.
status      Show the status of the four services.

Set AWS_PROFILE or standard AWS credential variables. The defaults are Oregon,
c8i.large, 100 players and HTTPS on the Elastic IP. See deploy/README.md.
HELP
}

require() {
    for command in "$@"; do
        command -v "$command" >/dev/null || { echo "Install $command and retry." >&2; exit 1; }
    done
}

case "$action" in
    -h|--help|help) usage; exit ;;
    deploy|ssh|admin|edit|credentials|status) ;;
    *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }
require terraform ssh
tf=(terraform "-chdir=$tf_dir")

if [[ $action == deploy ]]; then
    require node npm git curl ssh-keygen
    mkdir -p -m 700 "$local_dir"
    if [[ ! -s $key ]]; then
        if [[ -e $key.pub ]] || "${tf[@]}" output -raw instance_id >/dev/null 2>&1; then
            echo "Restore the existing SSH key at $key before updating this server." >&2
            exit 1
        fi
        ssh-keygen -q -t rsa -b 3072 -m PEM -N '' -C loeberland -f "$key"
    fi
    chmod 600 "$key"
    export TF_VAR_ssh_public_key
    TF_VAR_ssh_public_key=$(ssh-keygen -y -f "$key")
    if [[ -z ${TF_VAR_ssh_cidr:-} ]]; then
        operator_ip=$(curl -4fsS --max-time 10 https://checkip.amazonaws.com)
        export TF_VAR_ssh_cidr="$operator_ip/32"
    fi
    export TF_VAR_aws_region="${TF_VAR_aws_region:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}}"

    "${tf[@]}" init -input=false
    bash "$tf_dir/package.sh"
    plan=$(mktemp "$local_dir/plan.XXXXXXXX")
    trap 'rm -f -- "$plan"' EXIT
    "${tf[@]}" plan -input=false -out="$plan"
    # A code release should not destroy the EC2 instance and its local save.
    "${tf[@]}" show -json "$plan" | node -e '
        const plan = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
        const destructive = plan.resource_changes?.find(r =>
            r.mode === "managed" &&
            (r.address === "aws_instance.game" || r.type === "aws_eip") &&
            r.change.actions.includes("delete")
        );
        if (destructive) {
            console.error("This plan would delete " + destructive.address + ". Migrate the existing deployment before continuing.");
            process.exit(1);
        }
    '
    if [[ ${DEPLOY_AUTO_APPROVE:-0} != 1 ]]; then
        printf 'Apply this AWS plan? Type yes to continue: '
        read -r answer
        [[ $answer == yes ]] || exit 1
    fi
    "${tf[@]}" apply -input=false "$plan"
    rm -f -- "$plan"
    trap - EXIT
fi

[[ -s $key ]] || { echo "SSH PEM not found at $key." >&2; exit 1; }
ip=$("${tf[@]}" output -raw elastic_ip)
ssh_client=(ssh -i "$key" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8
    -o ServerAliveInterval=20 -o StrictHostKeyChecking=accept-new
    -o "UserKnownHostsFile=$local_dir/known_hosts")
host="ubuntu@$ip"
compose='sudo docker compose --env-file /opt/loeberland/current/compose.env -f /opt/loeberland/current/sf/server/compose.yaml --profile production'

case "$action" in
    ssh) exec "${ssh_client[@]}" "$host" ;;
    admin)
        echo 'Open http://127.0.0.1:8788/ while this tunnel is running.'
        exec "${ssh_client[@]}" -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8788:127.0.0.1:8788 "$host"
        ;;
    edit)
        exec "${ssh_client[@]}" -o ExitOnForwardFailure=yes -t -L 127.0.0.1:8788:127.0.0.1:8788 "$host" \
            'sudo env COMPOSE_ENV_FILE=/opt/loeberland/current/compose.env ADMIN_ENV_FILE=/etc/loeberland/admin.env bash /opt/loeberland/current/sf/server/edit-state.sh'
        ;;
    credentials) exec "${ssh_client[@]}" "$host" 'sudo cat /etc/loeberland/admin.env' ;;
    status) exec "${ssh_client[@]}" "$host" "$compose ps" ;;
esac

url=$("${tf[@]}" output -raw game_url)
echo "Game URL: $url (Elastic IP: $ip)"
echo "SSH PEM: $key"
echo 'Waiting for SSH and first-boot setup…'
deadline=$((SECONDS + 300))
until "${ssh_client[@]}" "$host" true 2>/dev/null; do
    if (( SECONDS >= deadline )); then
        echo "SSH did not become reachable. Check the SSH CIDR and the instance status." >&2
        exit 1
    fi
    sleep 5
done
"${ssh_client[@]}" "$host" 'sudo timeout 15m cloud-init status --wait'
digest=$("${tf[@]}" output -raw release_sha256)
[[ $digest =~ ^[a-f0-9]{64}$ ]]
"${tf[@]}" output -raw compose_environment |
    "${ssh_client[@]}" "$host" "sudo /usr/local/sbin/loeberland-deploy $digest"

echo 'Waiting for public HTTPS…'
deadline=$((SECONDS + 240))
until curl -fsS --max-time 8 "${url}healthz" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
        echo "The stack started, but $url is not healthy over HTTPS yet." >&2
        echo "For a custom domain, check that its A record points to $ip. Check proxy logs over SSH." >&2
        exit 1
    fi
    sleep 5
done
echo "Game ready at $url"
echo 'Use ./deploy/aws.sh credentials, then ./deploy/aws.sh admin for the private panel.'
