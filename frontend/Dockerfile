# Stage 1 – build
# Build context is the repo root (set in docker-compose.yml) so that the
# root package-lock.json is available for `npm ci`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=frontend

COPY frontend/ ./frontend/

# VITE_API_URL is baked into the JS bundle at build time.
# Pass it via docker-compose build args or --build-arg.
ARG VITE_API_URL=http://localhost:4000/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=frontend

# Stage 2 – static file server
FROM nginx:alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
