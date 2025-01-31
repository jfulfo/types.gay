#!/bin/bash

rsync -avz --delete \
    --exclude '.git' \
    --exclude 'deploy.sh' \
    --exclude '.github' \
    ./ jamie@192.168.0.5:/var/www/types.gay/

echo "Deployed successfully!"