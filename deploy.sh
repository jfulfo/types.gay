#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# The loose-pages app builds into www/cat-theory, so it must be built before
# the --delete sync below (otherwise that would wipe it from the server).
(
    cd cat-theory
    [ -d node_modules ] || npm ci
    npm test
    npm run build
)

rsync -avz --delete \
    --no-owner --no-group --no-times --no-perms \
    --exclude '.git' \
    --exclude 'deploy.sh' \
    --exclude '.github' \
    --exclude 'cgi-bin' \
    www/ jamie@192.168.1.36:/var/www/types.gay/

rsync -avz \
    --no-owner --no-group --no-times \
    --perms --chmod=755 \
    --exclude 'data' \
    cgi-bin/ jamie@192.168.1.36:/var/www/types.gay/cgi-bin/

echo "Deployed successfully"