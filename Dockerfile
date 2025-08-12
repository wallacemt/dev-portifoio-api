FROM oven/bun:1.2 AS builder
WORKDIR /app

COPY bun.lock ./
COPY package.json ./
COPY tsconfig.json ./
RUN bun install --frozen-lockfile

COPY ./src ./src
COPY ./prisma ./prisma

RUN bun run build


FROM oven/bun:1.2-alpine
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/docs ./src/docs
COPY .env ./

RUN bun install --frozen-lockfile --production
RUN bunx prisma generate

ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081
CMD ["bun", "run", "dist/app.js"]