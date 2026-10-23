FROM public.ecr.aws/docker/library/node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY lib ./lib
COPY bin/constants.ts ./bin/
RUN node_modules/.bin/esbuild lib/crons/gs-reaper/gs-reaper.ts --bundle --platform=node --target=node22 --sourcemap --outfile=dist/gs-reaper.js

# Only the bundle ships, so the image carries no node_modules or source tree.
FROM public.ecr.aws/docker/library/node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app
COPY --from=build /app/dist/ ./
USER node

CMD ["node", "--enable-source-maps", "gs-reaper.js"]
