# Run Loeberland

## AWS

Install Terraform 1.6 or later, AWS CLI v2, Node.js 22.16 or later with npm, Git, curl, and OpenSSH on your machine. The AWS identity needs permission to manage EC2 networking, key pairs, instances, IAM instance roles and profiles, the SSM public AMI parameter, and S3.

### Install AWS CLI v2

On Kubuntu or Ubuntu, run the AWS installer for your user account in the terminal you use to deploy. It supports 64-bit Intel, AMD, and Arm systems and needs no `sudo`. [AWS CLI installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

```bash
curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash
export PATH="${XDG_BIN_HOME:-$HOME/.local/bin}:$PATH"
aws --version
```

Check that the version starts with `aws-cli/2.`. If a new Bash terminal cannot find `aws`, add the `export PATH` line to `~/.bashrc`.

### Deploy the site

Configure the Cloudflare tunnel and build the private deployment bundle using the private deployment checkout. Set `game_domain`, `private_deploy_archive`, and `private_deploy_secret_arn` in `server/deploy/terraform.tfvars` or through their `TF_VAR_*` environment variables. Start from `server/deploy/terraform.tfvars.example`.

Export your access key ID as `AWS_ACCESS_KEY` and your secret access key as `AWS_SECRET_KEY`. Then run this command from the repository root.

```sh
./deploy/aws.sh
```

The script builds the current checkout, presents the infrastructure plan, uploads a release to private S3, and waits for public HTTPS. Use the same command to publish updates. `DEPLOY_AUTO_APPROVE=1` skips the plan confirmation for unattended runs.

The default is one **c8i.large in Oregon**, a **100-player cap**, a 40 GiB encrypted disk, and an Elastic IP. Cloudflare Tunnel serves the public hostname over HTTPS. The only inbound EC2 rule is SSH, limited to your public IPv4 address unless you set `TF_VAR_ssh_cidr`. EC2, storage, the public IP, and traffic incur AWS charges.

To reuse an Elastic IP, set `existing_elastic_ip` and its `aws_region` in
`server/deploy/terraform.tfvars`. Terraform looks up the allocation in your
account and associates it with the instance. The address stays allocated in
your account if you tear down the instance. Detach it from any other resource
before deploying.

Gameplay state lives in RAM and checkpoints to Redis once per second by
default. Cron exports Redis to SQLite every five minutes. Each run removes
snapshots aged 24 hours or more from local disk and private S3.

### SSH and admin

After you approve the first plan, the script asks EC2 to create a key pair and saves the private key to **`.deploy/aws.pem`** with mode 600 before Terraform launches the instance. EC2 returns the private key only once. Keep secure copies of the PEM, `.deploy/aws-key-name`, and the local Terraform state in `server/deploy/`. Updates reuse that key and the instance recorded in Terraform state. Deployments originally set up with a locally generated PEM continue to use it. If your public IP changes, rerun the deployment to refresh the SSH rule.

```sh
./deploy/aws.sh ssh
./deploy/aws.sh status
./deploy/aws.sh credentials
./deploy/aws.sh admin
```

Open `/admin/` on the public game hostname and sign in with the credentials in **`.deploy/aws-admin.env`**. An AWS deploy saves the current credentials there on first use. You can also use the SSH tunnel to open **http://127.0.0.1:8788/**. Saving queues the edited fields in Redis. The running game applies them to a fresh checkpoint and reloads its state while keeping player connections open. Edits to fields that changed since you opened the record are rejected.

To grant debug teleport, select the character, check **Allow debug teleport**, and save. Clear the checkbox and save to revoke it.

To change the login, edit `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.deploy/aws-admin.env` and run `./deploy/aws.sh admin-configure`. If the file is missing, that command first downloads the current credentials. The file is ignored by Git and stored with mode 600. Applying a change restarts the admin panel.

Use single quotes around a password containing `$` so Compose reads it literally. [Compose environment file syntax](https://docs.docker.com/reference/compose-file/services/#env_file)

For several edits during one maintenance window, close the admin tunnel and run `./deploy/aws.sh edit`. That command opens a tunnel, stops the game to release its write lease, and starts an editing session. Press Ctrl+C after saving to restart the game and admin panel.

Updates build the new release before replacing containers. Player connections reconnect after the restart. A failed startup attempts to restore the previous release. The Redis volume survives normal updates. The deploy script refuses plans that would destroy or replace the instance. Follow the [backup and restore instructions](../server/README.md#sqlite-backups) before moving an existing world or changing to this VPC from the old Terraform setup.

## Chat settings

Both settings default to `True` and accept `True` or `False` regardless of case.

- `OAUTH_REQUIRED` controls whether players need Google sign-in for typed chat. With `False`, anyone can type. When sign-in is required, players can use Yo, OK, and No before unlocking typed chat.
- `UPGRADE_REQUIRED_FOR_SERVER_CHAT` controls whether players who can type need an upgrade to send server-wide messages. With `False`, they can type `/Hello!` to send “Hello!” to everyone online. With `True`, only players with `upgrade: true` can send server chat. Players default to `upgrade: false`.

For AWS, edit [`deploy/chat.env`](chat.env) in your checkout, then run `./deploy/aws.sh`. To open both types of chat, set:

```dotenv
OAUTH_REQUIRED=False
UPGRADE_REQUIRED_FOR_SERVER_CHAT=False
```

Environment variables passed to `./deploy/aws.sh` override this file for that run. Values in the host’s `/etc/loeberland/overrides.env` take precedence over both.

For local Node or Compose, put these variables in `deploy/.env.local` or export them in your shell.

## Google chat sign-in

In Google Cloud, set up the OAuth consent screen and create a **Web application** OAuth client. Add `https://interactive.johnloeber.com/auth/google/chat/callback` as an authorized redirect URI. While the consent screen is in Testing, add the Google accounts that should be able to sign in as test users. The game requests the `openid` and `email` scopes. [Google OAuth web server setup](https://developers.google.com/identity/protocols/oauth2/web-server)

On the game server, add these settings to `/etc/loeberland/overrides.env` with file permissions `0600`, then run `./deploy/aws.sh deploy` from your checkout. Keep the client secret out of Git and Terraform.

```dotenv
GOOGLE_CHAT_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CHAT_CLIENT_SECRET=your-client-secret
GOOGLE_CHAT_REDIRECT_URI=https://interactive.johnloeber.com/auth/google/chat/callback
```

For local Node or Compose, put the same keys in the ignored `deploy/.env.local`
and run `chmod 600 deploy/.env.local`. Register the local URL
`http://127.0.0.1:8787/auth/google/chat/callback` with Google and use it as the
redirect URI in that file. Open the game from the matching origin.

Google sign-in unlocks typed chat for the existing game character when `OAUTH_REQUIRED=True`. Each character can link one Google account, and each Google account can link to one character. The server keeps the verified Google account ID (`sub`) and a masked email label in a private record. Only the authenticated character's client receives the label for the Character menu.

## Local

Install Docker with Compose v2 and OpenSSL, then run:

```sh
./deploy/local.sh
./deploy/local.sh credentials
```

Open **http://127.0.0.1:8787/** for the game and **http://127.0.0.1:8788/** for admin. Use `./deploy/local.sh logs`, `status`, `edit`, or `down` to operate the local stack. Stopping the stack keeps its Redis volume.

| File                                     | Purpose                                                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/.env.local`                      | Optional runtime settings for local Node and Compose. Start from [the example](.env.local.example).                                                                                                                                          |
| `deploy/.env.local-admin`                | Admin credentials shared by the local Node and Docker launchers. Compose creates this file on first start. For Node-only setup, copy [the example](.env.local-admin.example), set the password, and run `chmod 600 deploy/.env.local-admin`. |
| `deploy/multiplayer-config.example.json` | Public WebSocket endpoint example for standalone static hosting. Place the configured `multiplayer-config.json` beside the hosted client. The game server serves this endpoint automatically.                                                |

`npm --prefix server start`, `npm --prefix server run dev`, and the local
Node admin and backup commands load `deploy/.env.local` when it exists.
`./deploy/local.sh` and the Compose editor and backup scripts use the same
default file. Shell exports take precedence. For alternate files, set
`LOCAL_ENV_FILE` for Node, `COMPOSE_ENV_FILE` for Compose, or
`ADMIN_ENV_FILE` for admin credentials. The game and source client can run
without a local credentials file.

When upgrading a checkout that used `server/.env` or
`.deploy/local-admin.env`, move the credential file you use to
`deploy/.env.local-admin` and set mode 600. Move any game or Compose
settings into `deploy/.env.local`. Keep deployment secrets outside Git.
A running admin container keeps the credentials it loaded at startup. The
next `./deploy/local.sh up` uses the centralized file.

AWS uses `deploy/chat.env` for checked-in chat policy,
`server/deploy/terraform.tfvars` for Terraform inputs, and
`/etc/loeberland/overrides.env` and `/etc/loeberland/admin.env` for host
settings and credentials. Provider locks stay with their Terraform modules.
Use your shell or credential manager to supply AWS and Cloudflare credentials.
The private deployment supplies the production tunnel and abuse policy.

## Generated files

The map cache is built from source for local play and packaged with the AWS release. It is ignored by Git. A clean checkout can run `npm run setup` and `npm run build:client` to generate a static site for other hosting.

Other candidates for removal from Git are `index.html`, `editor.html`, `explore.js.map`, `bundle-meta.json`, `editor/build-meta.json`, `server/admin.html`, the two browser audit bundles under `tools/`, and `content/runtime.json` and `content/manifest.json`. These are generated. Move static hosting and editor workflows onto their build outputs before dropping them. The source JSON, assets, dependency lockfiles, and Terraform provider lockfile belong in the repository.
