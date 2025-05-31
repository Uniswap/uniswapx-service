FROM node:18-alpine@sha256:ef0861618e36d8e5339583a63e2b1082b7ad9cb59a53529bf7d742afa3e2f06b

WORKDIR /app

# Install dependencies
COPY package*.json yarn.lock ./
RUN yarn install

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Run the service
CMD ["node", "dist/lib/crons/gs-reaper/gs-reaper.js"] 