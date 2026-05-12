#!/bin/sh
set -e
node ./node_modules/drizzle-kit/bin.cjs migrate
exec node server.js
