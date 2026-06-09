# GCP staging CI entrypoint. Canonical copy: deploy/docker/hub/Dockerfile

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build:hub && test -f dist/apps/hub/main.js

ENV NODE_ENV=production

ARG VALUE_HASH
ENV GIT_COMMIT_HASH=$VALUE_HASH

EXPOSE 3000

CMD ["node", "dist/apps/hub/main.js"]
