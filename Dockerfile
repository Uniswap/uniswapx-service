# syntax=docker/dockerfile:experimental
FROM node:18-alpine AS build
WORKDIR /usr/src/app
RUN apk add git

COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY . .

CMD ["npx", "ts-node", "./lib/compute/status.ts"]