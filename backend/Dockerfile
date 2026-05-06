# Stage 1 – production dependencies (native modules compiled here)
# Build context is the repo root (set in docker-compose.yml) so that the
# root package-lock.json is available for `npm ci`.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend --omit=dev

# Stage 2 – TypeScript compilation
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# Stage 3 – lean runtime image
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
RUN mkdir -p data uploads
EXPOSE 4000
CMD ["node", "dist/server.js"]
