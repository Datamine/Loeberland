#!/usr/bin/env bash
set -euo pipefail
umask 077
export COPYFILE_DISABLE=1
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/../.." && pwd)
cd "$root"

# Build from this working tree, including local source edits.
if [[ ! -d node_modules/tsx ]]; then npm ci --ignore-scripts; fi
if [[ ! -d server/node_modules/redis || ! -d server/node_modules/ws ]]; then
    npm ci --prefix server --ignore-scripts
fi
SF_BUILD_COMMIT=$(git rev-parse --verify HEAD)
export SF_BUILD_COMMIT
npm run build:client
version=$(node -p "require('./world-cache/manifest.json').version")
[[ $version =~ ^[a-f0-9]{20}$ ]]

stage=$(mktemp -d "$script_dir/.package.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/sf/world-cache"

# Use only the project's source and asset paths. Skip secrets and operator files
# even if they have been accidentally tracked.
git ls-files -z --cached --others --exclude-standard -- \
    package.json package-lock.json tsconfig.json tsconfig.runtime.json .dockerignore \
    game.css game.template.html index.html editor.html favicon.ico \
    src content server tools editor textures billboards |
    while IFS= read -r -d '' path; do
        case "$path" in
            server/data/*|server/backups/*|server/tests/*|server/benchmarks/*|server/deploy/.package.*/*|\
            */.env|*/.env.*|*/.aws/*|*/.codex/*|*/.agents/*|*/.terraform/*|\
            *.pem|*.key|*.p12|*.sqlite*|*.tfstate*|*.tfvars|*.tfvars.json|*.log|*.tar.gz|\
            tools/animation-audit.js|tools/character-gpu-audit.js) continue ;;
        esac
        if [[ -f $path && ! -L $path ]]; then printf '%s\0' "$path"; fi
    done > "$stage/files"
tar -cf - --null -T "$stage/files" | tar -xf - -C "$stage/sf"
cp index.html editor.html "$stage/sf/"
printf '%s\n' "$SF_BUILD_COMMIT" > "$stage/sf/server/build-commit.txt"
cp content/{validate.js,runtime.json,manifest.json} "$stage/sf/content/"
cp world-cache/manifest.{js,json} "$stage/sf/world-cache/"
cp -R "world-cache/$version" "$stage/sf/world-cache/"
# Keep archive identities stable across identical builds on the same machine.
TZ=UTC find "$stage/sf" -exec touch -t 200001010000 {} +
tar -czf "$stage/game.tar.gz" -C "$stage" sf
mv -f "$stage/game.tar.gz" "$script_dir/game.tar.gz"
echo "Packaged $script_dir/game.tar.gz"
