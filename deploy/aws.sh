#!/usr/bin/env bash
set -euo pipefail
umask 077

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tf_dir="$root/server/deploy"
local_dir="$root/.deploy"
key="$local_dir/aws.pem"
key_name_file="$local_dir/aws-key-name"
admin_env="$local_dir/aws-admin.env"
action=${1:-deploy}

usage() {
    cat <<'HELP'
Usage: ./deploy/aws.sh [deploy|ssh|admin|admin-configure|edit|credentials|status]

deploy       Build the current checkout and create or update the AWS server.
ssh         Log in to the host with the generated PEM.
admin       Forward the admin panel to http://127.0.0.1:8788/.
admin-configure  Apply the admin username and password from .deploy/aws-admin.env.
edit        Stop the game for an editing session, then restart it on exit.
credentials Display the active admin panel credentials.
status      Show the status of the four services.

Deploy requires AWS_ACCESS_KEY and AWS_SECRET_KEY. The defaults are Oregon,
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
    deploy|ssh|admin|admin-configure|edit|credentials|status) ;;
    *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }
require terraform ssh
tf=(terraform "-chdir=$tf_dir")

if [[ $action == deploy ]]; then
    if [[ -z ${AWS_ACCESS_KEY:-} || -z ${AWS_SECRET_KEY:-} ]]; then
        echo 'Set and export both AWS_ACCESS_KEY and AWS_SECRET_KEY before deploying.' >&2
        exit 1
    fi
    export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"
    require node npm git curl ssh-keygen
    mkdir -p -m 700 "$local_dir"
    key_name=''
    create_key=0
    if [[ -e $key_name_file ]]; then
        key_name=$(<"$key_name_file")
        [[ $key_name =~ ^loeberland-[a-f0-9]{32}$ ]] || {
            echo "Invalid EC2 key pair name in $key_name_file." >&2
            exit 1
        }
    fi
    if [[ -s $key ]]; then
        chmod 600 "$key"
        public_key=$(ssh-keygen -y -f "$key" </dev/null)
        if [[ -z $key_name ]]; then
            export TF_VAR_ssh_public_key="$public_key"
        fi
    else
        create_key=1
        # With empty state, Terraform can print a warning and exit successfully.
        instance_id=$("${tf[@]}" output -raw instance_id 2>/dev/null) || instance_id=''
        if [[ -e $key.pub || $instance_id =~ ^i-[0-9a-f]+$ ]]; then
            echo "Restore the existing SSH key at $key before updating this server." >&2
            exit 1
        fi
        if ! command -v aws >/dev/null; then
            echo 'Install AWS CLI v2 using deploy/README.md#install-aws-cli-v2, then retry.' >&2
            exit 1
        fi
        if [[ -z $key_name ]]; then
            key_name=$(node -p '"loeberland-" + require("node:crypto").randomBytes(16).toString("hex")')
        fi
    fi
    if [[ -z ${TF_VAR_ssh_cidr:-} ]]; then
        operator_ip=$(curl -4fsS --max-time 10 https://checkip.amazonaws.com)
        export TF_VAR_ssh_cidr="$operator_ip/32"
    fi
    export TF_VAR_aws_region="${TF_VAR_aws_region:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}}"

    "${tf[@]}" init -input=false
    bash "$tf_dir/package.sh"
    plan=$(mktemp "$local_dir/plan.XXXXXXXX")
    key_tmp=''
    trap 'rm -f -- "$plan" ${key_tmp:+"$key_tmp"}' EXIT
    "${tf[@]}" plan -input=false -out="$plan" -var="ssh_key_name=$key_name"
    # A code release should not destroy the EC2 instance and its local save.
    region=$("${tf[@]}" show -json "$plan" | node -e '
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
        if (process.argv[1] === "1" && plan.resource_changes?.some(r =>
            (r.address === "aws_instance.game" || r.address === "aws_key_pair.game" ||
             r.address === "aws_key_pair.game[0]") && r.change.before != null
        )) {
            console.error("Restore the existing SSH PEM before updating this server.");
            process.exit(1);
        }
        process.stdout.write(plan.variables.aws_region.value);
    ' "$create_key")
    if [[ ${DEPLOY_AUTO_APPROVE:-0} != 1 ]]; then
        printf 'Apply this AWS plan? Type yes to continue: '
        read -r answer
        [[ $answer == yes ]] || exit 1
    fi
    if [[ $create_key == 1 ]]; then
        if [[ ! -e $key_name_file ]]; then
            (set -o noclobber; printf '%s\n' "$key_name" > "$key_name_file")
        fi
        if [[ $(<"$key_name_file") != "$key_name" ]]; then
            echo "The saved EC2 key pair name changed during planning. Rerun the deployment." >&2
            exit 1
        fi
        if [[ ! -s $key ]]; then
            # EC2 returns the private key only on creation. Save it before applying the plan.
            key_tmp=$(mktemp "$local_dir/aws.pem.XXXXXXXX")
            chmod 600 "$key_tmp"
            if ! AWS_PAGER='' aws ec2 create-key-pair --region "$region" --key-name "$key_name" \
                --key-type rsa --key-format pem --query KeyMaterial --output text > "$key_tmp" ||
                ! ssh-keygen -y -f "$key_tmp" </dev/null >/dev/null; then
                echo "Could not save the private key for EC2 key pair $key_name in $region." >&2
                exit 1
            fi
            if ! mv -f -- "$key_tmp" "$key"; then
                echo "The private key is saved at $key_tmp. Move it to $key before retrying." >&2
                key_tmp=''
                exit 1
            fi
        fi
    fi
    [[ -s $key ]] || { echo "SSH PEM not found at $key." >&2; exit 1; }
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

save_admin_credentials() {
    local temp_file
    [[ ! -e $admin_env ]] || return 0
    temp_file=$(mktemp "$local_dir/aws-admin.env.XXXXXXXX")
    if ! "${ssh_client[@]}" "$host" 'sudo cat /etc/loeberland/admin.env' > "$temp_file" || [[ ! -s $temp_file ]]; then
        rm -f -- "$temp_file"
        return 1
    fi
    mv -n -- "$temp_file" "$admin_env"
    rm -f -- "$temp_file"
}

case "$action" in
    ssh) exec "${ssh_client[@]}" "$host" ;;
    admin)
        echo 'Open http://127.0.0.1:8788/ while this tunnel is running.'
        exec "${ssh_client[@]}" -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8788:127.0.0.1:8788 "$host"
        ;;
    admin-configure)
        save_admin_credentials
        chmod 600 "$admin_env"
        configure=$(cat <<'REMOTE'
set -euo pipefail
umask 077
exec 8>/var/lock/loeberland-deploy.lock
flock -n 8 || { echo 'A deployment or credentials update is already running.' >&2; exit 1; }
config=/etc/loeberland/admin.env
candidate=$(mktemp "$config.new.XXXXXXXX")
previous=''
trap 'rm -f -- "$candidate" ${previous:+"$previous"}' EXIT
cat > "$candidate"
if cmp -s "$candidate" "$config"; then
    echo 'Admin credentials are already up to date.'
    exit 0
fi
compose=(docker compose --env-file /opt/loeberland/current/compose.env
    -f /opt/loeberland/current/sf/server/compose.yaml --profile production)
ADMIN_ENV_FILE="$candidate" "${compose[@]}" run --rm --no-deps -T admin node admin.mjs --check-auth
previous=$(mktemp "$config.previous.XXXXXXXX")
cp -- "$config" "$previous"
mv -f -- "$candidate" "$config"
if ! "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 60 admin; then
    mv -f -- "$previous" "$config"
    "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 60 admin
    exit 1
fi
echo 'Admin credentials updated.'
REMOTE
        )
        printf -v quoted_configure '%q' "$configure"
        exec "${ssh_client[@]}" "$host" "sudo bash -c $quoted_configure" < "$admin_env"
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
# A repaired bootstrap can leave cloud-init's original failure recorded.
"${ssh_client[@]}" "$host" \
    'sudo timeout 15m cloud-init status --wait || sudo test -x /usr/local/sbin/loeberland-deploy'
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
save_admin_credentials
echo "Admin credentials: $admin_env"
