#!/bin/sh
# ---------------------------------------------------------------------------
# O volume persistente (ex.: /data no Fly.io) e montado como root. Criamos os
# diretorios, passamos a posse para o usuario `node` e so entao largamos o
# root para rodar a aplicacao sem privilegio.
# ---------------------------------------------------------------------------
set -e

DATA_DIR="${DATA_DIR:-/data/db}"
UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"

mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" "$UPLOAD_DIR"
  exec su-exec node "$@"
fi

exec "$@"
