# Stage 1: install all dependencies (including devDeps for prisma generate)
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# Stage 2: build the Next.js app
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

# Stage 3: production runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# The base image bundles a global npm/npx/corepack that this container never
# uses — the entrypoint only runs local node_modules/.bin/{prisma,next}. That
# bundle is also where every CVE flagged in this image lives (npm's own
# dependency tree, not ours or Alpine's); removing it fixes the scan and
# trims ~16 MB, without waiting on an upstream base-image patch.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# node_modules from deps includes prisma CLI + generated client (postinstall ran prisma generate)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Uploaded avatars live outside public/ (served through an authenticated route,
# not statically) and outside .next, so this directory is what a volume mount
# in docker-compose.yml needs to target for uploads to survive a redeploy.
RUN mkdir -p /app/data/uploads/employees /app/data/uploads/users && \
    chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
