# syntax=docker/dockerfile:1

FROM node:24-alpine
RUN npm install -g @nubjs/nub@0.9.2 && \
    mkdir /app /data && \
    chown node:node /app /data
USER node
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node lib ./lib
RUN nub install --prod --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node fixtures ./fixtures
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=1m --timeout=5s --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/v1/health >/dev/null || exit 1
CMD ["nub", "src/index.ts"]
