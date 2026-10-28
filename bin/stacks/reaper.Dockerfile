FROM public.ecr.aws/docker/library/node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app
COPY gs-reaper.js gs-reaper.js.map ./
USER node

CMD ["node", "--enable-source-maps", "gs-reaper.js"]
