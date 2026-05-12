# Multi-stage build for production
FROM node:20-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g pnpm@10.4.1
RUN pnpm run build

FROM base AS runner
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
