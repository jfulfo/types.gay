#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# cat-theory/ (the loose-pages book) and cgi-bin/lean (its Lean checker) are
# kept in the repo but not deployed; they were taken offline on 2026-09-29.

rsync -avz --delete \
    --no-owner --no-group --no-times --no-perms \
    --exclude '.git' \
    --exclude 'deploy.sh' \
    --exclude '.github' \
    --exclude 'cgi-bin' \
    --exclude 'cat-theory' \
    www/ jamie@192.168.1.36:/var/www/types.gay/

rsync -avz \
    --no-owner --no-group --no-times \
    --perms --chmod=755 \
    --exclude 'data' \
    --exclude 'lean' \
    cgi-bin/ jamie@192.168.1.36:/var/www/types.gay/cgi-bin/

echo "Deployed successfully"