#!/bin/bash

rsync -avz --delete \
    --no-owner --no-group --no-times --no-perms \
    --exclude '.git' \
    --exclude 'deploy.sh' \
    --exclude '.github' \
    ./ jamie@192.168.0.5:/var/www/types.gay/

echo "Deployed successfully!"