# GCP staging CI entrypoint. Canonical copy: deploy/docker/webhook/Dockerfile

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build:webhook && test -f dist/apps/webhook/main.js

ENV NODE_ENV=production

ARG VALUE_HASH
ENV GIT_COMMIT_HASH=$VALUE_HASH

EXPOSE 3001

CMD ["node", "dist/apps/webhook/main.js"]
