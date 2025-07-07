FROM node:22-alpine3.21 AS builder
WORKDIR /app
COPY package*.json .
RUN npm install

COPY . .
COPY ./src ./src
COPY ./src/docs ./src/docs

RUN npm run build

FROM node:22-alpine3.21

WORKDIR /app

COPY --from=builder /app/package*.json .

RUN npm install --omit=dev --prefer-offline

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/docs ./src/docs

COPY .env .
RUN npx prisma generate
ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081
CMD ["node", "dist/app.js"]