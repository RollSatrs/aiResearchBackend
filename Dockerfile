FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base as dependencies
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

FROM base as builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .
RUN apt-get update && apt-get install -y openssl
RUN pnpx prisma generate
RUN pnpm run build

FROM gcr.io/distroless/nodejs22-debian12:latest
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=dependencies /app/node_modules ./node_modules

COPY package.json ./

CMD ["dist/main.js"]
