FROM oven/bun:canary-alpine AS builder
WORKDIR /app

COPY bun.lock package.json tsconfig.json ./
RUN bun install --frozen-lockfile

COPY ./src ./src
COPY ./prisma ./prisma

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN bun run build


FROM oven/bun:canary-alpine
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/docs ./src/docs

RUN bun install --frozen-lockfile --production
RUN bunx prisma generate

ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081

CMD ["bun", "dist/src/app.js"]