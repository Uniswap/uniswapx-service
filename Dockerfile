# syntax=docker/dockerfile:experimental
# NOTE build must be run with NPM_TOKEN build-arg
# docker build --build-arg NPM_TOKEN=${NPM_TOKEN} .
FROM node:16-alpine AS build
WORKDIR /usr/src/app
RUN apk add git

COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY . .

CMD ["npx", "ts-node", "./lib/compute/status.ts"]