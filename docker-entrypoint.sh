#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy
exec node_modules/.bin/next start
