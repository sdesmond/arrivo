#!/bin/sh
set -e
# Pre-release bootstrap uses schema push until tracked migrations are reintroduced.
node ./node_modules/drizzle-kit/bin.cjs push
exec node server.js
