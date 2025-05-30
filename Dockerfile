FROM node:18-alpine

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