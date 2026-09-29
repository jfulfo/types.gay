#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
DATA_DIR="$SCRIPT_DIR/data"

mkdir -p "$DATA_DIR"
chmod 770 "$DATA_DIR"  # Writable by script and web server only

PAGE=$(echo "$QUERY_STRING" | sed -n 's/^.*page=\([^&]*\).*$/\1/p')
PAGE=${PAGE:-"index"} # default to index if no page specified

PAGE=$(echo "$PAGE" | sed 's/[^a-zA-Z0-9_-]//g')

# only count known pages, otherwise anyone can create files here
# ("/" arrives url-encoded as %2F, which sanitizes to 2F)
case "$PAGE" in
    2F) ;;
    *)
        echo "Status: 404 Not Found"
        echo "Content-type: application/json"
        echo
        echo '{"error": "unknown page"}'
        exit 0
        ;;
esac

echo "Content-type: application/json"
echo

COUNTER_FILE="$DATA_DIR/$PAGE.txt"

if [ ! -f "$COUNTER_FILE" ]; then
    echo "0" > "$COUNTER_FILE"
    chmod 660 "$COUNTER_FILE"  # Readable/writable by script and web server only
fi

(
    flock -x 200
    COUNT=$(($(cat "$COUNTER_FILE") + 1))
    echo "$COUNT" > "$COUNTER_FILE"
    echo "{\"count\": $COUNT}"
) 200>"$COUNTER_FILE.lock"