#!/bin/sh
set -e

# The image chowns /data at build time, but a bind mount replaces that directory
# wholesale with one from the host and keeps the host's ownership -- so the
# unprivileged user the server runs as usually cannot write there. Fix it here,
# while the container still has the privileges to, then drop them.
#
# If the deployer pinned a uid (compose `user:`), we are already unprivileged.
# Leave ownership alone and just run: they have taken responsibility for making
# the host directory match.

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = 0 ]; then
  mkdir -p "$DATA_DIR"
  # Cheap on an already-correct tree, and correctness matters more than the
  # microseconds: an upgrade can leave the top directory right while docs/,
  # thumbs/ and the SQLite WAL files underneath it are still owned by root.
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
