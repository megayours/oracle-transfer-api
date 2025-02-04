#!/bin/sh

# Adjust permissions for the mapped SQLite file
if [ -f /tmp/db.sqlite ]; then
    echo "Adjusting permissions for /tmp/db.sqlite"
    chown bun:bun /tmp/db.sqlite
    chmod 666 /tmp/db.sqlite
fi

# Switch to the bun user and execute the command
exec gosu bun "$@"