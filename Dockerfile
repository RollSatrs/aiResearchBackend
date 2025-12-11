FROM node:22 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install  --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpx prisma@6.17.1 generate
RUN pnpm run build

EXPOSE 3003
CMD ["pnpm", "start:prod"]