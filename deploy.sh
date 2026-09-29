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

# A cold Lean check of the untouched book takes about a minute on the Pi; do it
# now so the first reader doesn't wait. (Results are cached by content.)
(cd cat-theory && npx tsx scripts/monolith-body.ts) |
    curl -s -m 180 -X POST --data-binary @- https://types.gay/cat-theory/api/check > /dev/null &

echo "Deployed successfully"