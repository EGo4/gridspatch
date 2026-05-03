#!/bin/sh
set -e
if find prisma/migrations -name "*.sql" 2>/dev/null | grep -q .; then
  node_modules/.bin/prisma migrate deploy
else
  node_modules/.bin/prisma db push
fi
exec node_modules/.bin/next start
