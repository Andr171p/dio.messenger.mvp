# syntax=docker/dockerfile:1
FROM node:22.23.5-alpine AS build
WORKDIR /web
RUN corepack enable
COPY messenger.web/package.json messenger.web/pnpm-lock.yaml messenger.web/pnpm-workspace.yaml ./
COPY messenger.web/apps/messenger/package.json ./apps/messenger/
COPY messenger.web/packages/messenger-core/package.json ./packages/messenger-core/
COPY messenger.web/packages/messenger-ui/package.json ./packages/messenger-ui/
RUN pnpm install --frozen-lockfile
COPY messenger.web/tsconfig.base.json ./
COPY messenger.web/docs/contracts/ ./docs/contracts/
COPY messenger.web/apps/messenger/index.html messenger.web/apps/messenger/tsconfig.json messenger.web/apps/messenger/vite.config.ts ./apps/messenger/
COPY messenger.web/apps/messenger/public/ ./apps/messenger/public/
COPY messenger.web/apps/messenger/src/ ./apps/messenger/src/
COPY messenger.web/packages/messenger-core/tsconfig*.json ./packages/messenger-core/
COPY messenger.web/packages/messenger-core/src/ ./packages/messenger-core/src/
COPY messenger.web/packages/messenger-ui/tsconfig*.json ./packages/messenger-ui/
COPY messenger.web/packages/messenger-ui/src/ ./packages/messenger-ui/src/
ARG MESSENGER_RELEASE=local
ENV VITE_RUNTIME_CONFIG=1 VITE_RELEASE=${MESSENGER_RELEASE}
RUN pnpm build \
    && node -e 'require("node:fs").writeFileSync("apps/messenger/dist/release.json", JSON.stringify({sha:process.env.VITE_RELEASE}))'

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY --from=build /web/apps/messenger/dist/ /usr/share/nginx/html/
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/frontend/pilot-proxy.conf /etc/nginx/pilot-proxy.conf
