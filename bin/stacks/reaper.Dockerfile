FROM public.ecr.aws/docker/library/node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

WORKDIR /app
COPY gs-reaper.js gs-reaper.js.map ./
USER node

CMD ["node", "--enable-source-maps", "gs-reaper.js"]
