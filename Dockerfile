# Build arguments for metadata
ARG VERSION=dev
ARG BUILD_DATE
ARG GIT_COMMIT

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./

# Install frontend dependencies WITHOUT running postinstall
# The postinstall tries to cd into backend which doesn't exist yet
RUN npm ci --ignore-scripts

# Copy frontend source code (excluding backend)
COPY src ./src
COPY public ./public
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY tsconfig.app.json ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
COPY components.json ./
COPY eslint.config.js ./

# Build frontend
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm ci

# Copy backend source code
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build backend
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine

# Metadata labels (OCI image spec)
LABEL org.opencontainers.image.title="Rediscover"
LABEL org.opencontainers.image.description="Self-hosted Redis management tool"
LABEL org.opencontainers.image.source="https://github.com/mufazmi/rediscover"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.authors="Umair Farooqui <info.umairfarooqui@gmail.com>"
LABEL org.opencontainers.image.url="https://umairfarooqui.com"
LABEL org.opencontainers.image.documentation="https://github.com/mufazmi/rediscover#readme"

WORKDIR /app

# Copy root package.json for VersionService
COPY package.json ./

# Copy backend package files and install production dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production && \
    npm rebuild better-sqlite3

# Go back to app root
WORKDIR /app

# Copy backend compiled code to backend/dist
COPY --from=backend-builder /app/dist ./backend/dist

# Copy frontend build to dist directory
COPY --from=frontend-builder /app/dist ./dist

# Create data directory for SQLite database and app secret
RUN mkdir -p /app/data

# Expose port 6378
EXPOSE 6378

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6378/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=6378
ENV DATABASE_PATH=/app/data/rediscover.db

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Start the backend server from the backend directory
WORKDIR /app/backend
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
