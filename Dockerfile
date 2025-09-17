FROM node:20-slim AS base
COPY . /app
WORKDIR /app

FROM base as dependencies
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --legacy-peer-deps

FROM base as builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .
RUN apt-get update && apt-get install -y openssl
RUN npx prisma generate
RUN npm run build

FROM gcr.io/distroless/nodejs22-debian12:latest
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=dependencies /app/node_modules ./node_modules

COPY package.json ./

CMD ["dist/main.js"]
