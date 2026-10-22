FROM public.ecr.aws/docker/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY lib ./lib
COPY bin/constants.ts ./bin/
RUN node_modules/.bin/esbuild lib/crons/gs-reaper/gs-reaper.ts --bundle --platform=node --target=node20 --sourcemap --outfile=dist/gs-reaper.js

# Only the bundle ships, so the image carries no node_modules or source tree.
FROM public.ecr.aws/docker/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

WORKDIR /app
COPY --from=build /app/dist/ ./
USER node

CMD ["node", "--enable-source-maps", "gs-reaper.js"]
