#!/bin/bash

rsync -avz --delete \
    --no-owner --no-group --no-times --no-perms \
    --exclude '.git' \
    --exclude 'deploy.sh' \
    --exclude '.github' \
    --exclude 'cgi-bin' \
    www/ jamie@192.168.0.5:/var/www/types.gay/

rsync -avz \
    --no-owner --no-group --no-times \
    --perms --chmod=755 \
    cgi-bin/ jamie@192.168.0.5:/var/www/types.gay/cgi-bin/

echo "Deployed successfully"