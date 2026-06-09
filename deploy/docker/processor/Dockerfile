# GCP staging CI entrypoint. Canonical copy: deploy/docker/processor/Dockerfile
# Processor spawns scripts/xchat-recover-secret.mjs at runtime for XChat PIN unlock.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build:processor && test -f dist/apps/processor/main.js

ENV NODE_ENV=production

ARG VALUE_HASH
ENV GIT_COMMIT_HASH=$VALUE_HASH

EXPOSE 3002

CMD ["node", "dist/apps/processor/main.js"]
