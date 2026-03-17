# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build backend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm rebuild better-sqlite3

# Copy built backend code
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite database and app secret
RUN mkdir -p /app/data

# Expose port 6377
EXPOSE 6377

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6377/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=6377
ENV DATABASE_PATH=/app/data/rediscover.db

# Start the backend server
CMD ["node", "dist/server.js"]