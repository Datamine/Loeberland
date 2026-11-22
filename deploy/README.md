# Run Loeberland

## AWS

Install Terraform 1.6 or later, Node.js 22.16 or later with npm, Git, curl, and OpenSSH on your machine. Use an AWS profile or the standard AWS credential environment variables. The identity needs permission to manage EC2 networking, key pairs, instances, IAM instance roles and profiles, the SSM public AMI parameter, and S3.

From the repository root:

```sh
AWS_PROFILE=your-profile ./deploy/aws.sh
```

If you already exported AWS credentials, run `./deploy/aws.sh` by itself. The script builds the current checkout, presents the infrastructure plan, uploads a release to private S3, and waits for public HTTPS. Use the same command to publish updates. `DEPLOY_AUTO_APPROVE=1` skips the plan confirmation for unattended runs.

The default is one **c8i.large in Oregon**, a **100-player cap**, a 40 GiB encrypted disk, and an Elastic IP. Ports 80 and 443 serve the game. SSH is limited to your public IPv4 address unless you set `TF_VAR_ssh_cidr`. The script uses the Elastic IP for the public HTTPS URL, with a short-lived Let's Encrypt certificate that Caddy renews. It creates its own VPC and public subnet. EC2, storage, the public IP, and traffic incur AWS charges.

Optional configuration lives in `server/deploy/terraform.tfvars`. Start from `terraform.tfvars.example` or supply variables such as `TF_VAR_max_players=150`. For a custom hostname, set `TF_VAR_game_domain` and point its A record to the Elastic IP printed during deploy. Remove stale AAAA records. The script can finish the host setup before DNS is ready. It reports a failed HTTPS check until the hostname resolves and the certificate is issued.

To reuse an Elastic IP, set `existing_elastic_ip` and its `aws_region` in
`server/deploy/terraform.tfvars`. Terraform looks up the allocation in your
account and associates it with the instance. The address stays allocated in
your account if you tear down the instance. Detach it from any other resource
before deploying. With `game_domain` unset, the Elastic IP is also the HTTPS
hostname.

Gameplay state lives in RAM and checkpoints to Redis once per second by
default. Cron exports Redis to SQLite every five minutes. Each run removes
snapshots aged 24 hours or more from local disk and private S3.

### SSH and admin

The private key is **`.deploy/aws.pem`** with mode 600. Keep a secure copy of it and the local Terraform state in `server/deploy/`. Terraform registers the public key. If your public IP changes, rerun the deployment to refresh the SSH rule.

```sh
./deploy/aws.sh ssh
./deploy/aws.sh status
./deploy/aws.sh credentials
./deploy/aws.sh admin
```

Open **http://127.0.0.1:8788/** with the tunnel running and sign in using the credentials printed by the credentials command. The admin panel reads live checkpoints and listens on the host loopback interface. The game and Redis keep running during inspection.

Close the admin tunnel before running `./deploy/aws.sh edit`. That command opens a tunnel, stops the game to release its write lease, and starts an editing session. Press Ctrl+C after saving. The game and read-only admin panel restart automatically.

Updates build the new release before replacing containers. Player connections reconnect after the restart. A failed startup attempts to restore the previous release. The Redis volume survives normal updates. The deploy script refuses plans that would destroy or replace the instance. Follow the [backup and restore instructions](../server/README.md#sqlite-backups) before moving an existing world or changing to this VPC from the old Terraform setup.

## Local

Install Docker with Compose v2 and OpenSSL, then run:

```sh
./deploy/local.sh
./deploy/local.sh credentials
```

Open **http://127.0.0.1:8787/** for the game and **http://127.0.0.1:8788/** for admin. Credentials live in `.deploy/local-admin.env`. Set `ADMIN_ENV_FILE` to reuse an existing credentials file. Use `./deploy/local.sh logs`, `status`, `edit`, or `down` to operate the local stack. Stopping the stack keeps its Redis volume.

## Generated files

The map cache is built from source for local play and packaged with the AWS release. It is ignored by Git. A clean checkout can run `npm run setup` and `npm run build:client` to generate a static site for other hosting.

Other candidates for removal from Git are `index.html`, `editor.html`, `explore.js.map`, `bundle-meta.json`, `editor/build-meta.json`, `server/admin.html`, the two browser audit bundles under `tools/`, and `content/runtime.json` and `content/manifest.json`. These are generated. Move static hosting and editor workflows onto their build outputs before dropping them. The source JSON, assets, dependency lockfiles, and Terraform provider lockfile belong in the repository.
