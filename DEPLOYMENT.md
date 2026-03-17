# Rediscover Deployment Guide

This guide covers deploying Rediscover using Docker in both production and development environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Production Deployment](#production-deployment)
- [Development Environment](#development-environment)
- [Environment Variables](#environment-variables)
- [Health Check Endpoint](#health-check-endpoint)
- [Backup and Restore](#backup-and-restore)
- [Graceful Shutdown](#graceful-shutdown)
- [Troubleshooting](#troubleshooting)

## Overview

Rediscover is a self-hosted Redis management tool that runs as a single Docker container. The application includes:

- **Backend**: Node.js + Express server (port 6377)
- **Frontend**: React + Vite application served as static files
- **Database**: SQLite database for user data and connections
- **Real-time**: Socket.io for Redis MONITOR and Pub/Sub streaming

## Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- At least 512MB RAM available
- Port 6377 available (or configure a different port)

## Production Deployment

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd rediscover
   ```

2. **Start the application**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   Open your browser and navigate to `http://localhost:6377`

4. **Complete setup**:
   On first run, you'll be prompted to create an admin account.

### Production Configuration

The production deployment uses `docker-compose.yml`:

```yaml
version: '3.8'

services:
  rediscover:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: rediscover
    ports:
      - "6377:6377"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=6377
      - DATABASE_PATH=/app/data/rediscover.db
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:6377/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
    restart: unless-stopped
```

### Custom Port

To run on a different port, modify the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "6378:6377"  # Access on port 6378
```

### Using Pre-built Image

If you have a pre-built image, update `docker-compose.yml`:

```yaml
services:
  rediscover:
    image: your-registry/rediscover:latest
    # Remove the 'build' section
```

### Updating the Application

1. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

2. **Rebuild and restart**:
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

3. **Verify health**:
   ```bash
   curl http://localhost:6377/api/health
   ```

## Development Environment

### Quick Start

1. **Install dependencies**:
   ```bash
   # Frontend dependencies
   npm install
   
   # Backend dependencies
   cd backend
   npm install
   cd ..
   ```

2. **Start development environment**:
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

3. **Access the application**:
   - Frontend: `http://localhost:6378` (with hot-reload)
   - Backend API: `http://localhost:6377/api`

### Development Configuration

The development environment uses `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  frontend:
    image: node:20-alpine
    container_name: rediscover-frontend-dev
    working_dir: /app
    volumes:
      - ./:/app
      - /app/node_modules
    ports:
      - "6378:6378"
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://localhost:6377
    command: npm run dev
    networks:
      - rediscover-dev
    depends_on:
      - backend

  backend:
    image: node:20-alpine
    container_name: rediscover-backend-dev
    working_dir: /app/backend
    volumes:
      - ./backend:/app/backend
      - /app/backend/node_modules
      - ./data:/app/data
    ports:
      - "6377:6377"
    environment:
      - NODE_ENV=development
      - PORT=6377
      - DATABASE_PATH=/app/data/rediscover.db
      - JWT_EXPIRATION=7d
      - BCRYPT_ROUNDS=10
      - FRONTEND_URL=http://localhost:6378
    command: npm run dev
    networks:
      - rediscover-dev

networks:
  rediscover-dev:
    driver: bridge
```

### Development Features

- **Hot Reload**: Frontend changes are reflected immediately
- **Auto-restart**: Backend restarts automatically on code changes
- **Volume Mounts**: Source code is mounted for live editing
- **Separate Services**: Frontend and backend run in separate containers

### Stopping Development Environment

```bash
docker-compose -f docker-compose.dev.yml down
```

## Environment Variables

### Required Variables

None! The application generates secure defaults automatically.

### Optional Variables

Configure these in `docker-compose.yml` or via a `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6377` | HTTP server port |
| `NODE_ENV` | `production` | Environment mode (`production` or `development`) |
| `DATABASE_PATH` | `/app/data/rediscover.db` | SQLite database file path |
| `APP_SECRET` | Auto-generated | Secret for JWT signing and encryption (64-char hex) |
| `JWT_EXPIRATION` | `7d` | JWT token expiration time |
| `BCRYPT_ROUNDS` | `10` | Bcrypt hashing rounds for passwords |
| `FRONTEND_URL` | `http://localhost:6378` | Frontend URL for CORS (dev only) |

### App Secret Management

The application automatically manages the `APP_SECRET`:

1. **First Priority**: Checks `APP_SECRET` environment variable
2. **Second Priority**: Reads from `/app/data/.secret` file
3. **Auto-generate**: Creates a random 64-character hex string if neither exists

The generated secret is saved to `/app/data/.secret` with restricted permissions (0600).

**Important**: Keep the `.secret` file secure and backed up. Losing it will invalidate all JWT tokens and prevent decryption of stored Redis connection URLs.

### Using Custom App Secret

**Via Environment Variable**:
```yaml
environment:
  - APP_SECRET=your-64-character-hex-string-here
```

**Via File** (recommended for production):
```bash
# Generate a secure secret
openssl rand -hex 32 > data/.secret

# Ensure proper permissions
chmod 600 data/.secret
```

## Health Check Endpoint

### Endpoint Details

- **URL**: `GET /api/health`
- **Authentication**: Not required
- **Response**: JSON with status information

### Response Format

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "timestamp": 1704067200000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` if server is running |
| `uptime` | number | Process uptime in seconds |
| `timestamp` | number | Current timestamp in milliseconds |

### Usage Examples

**Check health with curl**:
```bash
curl http://localhost:6377/api/health
```

**Docker healthcheck** (already configured):
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:6377/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
  interval: 30s
  timeout: 3s
  start_period: 5s
  retries: 3
```

**Monitoring script**:
```bash
#!/bin/bash
response=$(curl -s http://localhost:6377/api/health)
status=$(echo $response | jq -r '.status')

if [ "$status" = "ok" ]; then
  echo "✓ Rediscover is healthy"
  exit 0
else
  echo "✗ Rediscover is unhealthy"
  exit 1
fi
```

## Backup and Restore

### What to Backup

Rediscover stores all data in the `./data` directory:

- `rediscover.db` - SQLite database (users, connections, settings, audit logs)
- `.secret` - App secret for JWT and encryption

### Backup Procedures

#### Manual Backup

```bash
# Stop the container
docker-compose down

# Create backup directory
mkdir -p backups/$(date +%Y%m%d_%H%M%S)

# Copy data directory
cp -r data backups/$(date +%Y%m%d_%H%M%S)/

# Restart the container
docker-compose up -d
```

#### Automated Backup Script

Create `backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$DATE"

# Create backup directory
mkdir -p "$BACKUP_PATH"

# Backup database (SQLite supports hot backup)
sqlite3 data/rediscover.db ".backup '$BACKUP_PATH/rediscover.db'"

# Backup app secret
cp data/.secret "$BACKUP_PATH/.secret"

# Compress backup
tar -czf "$BACKUP_PATH.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$BACKUP_PATH"

echo "Backup created: $BACKUP_PATH.tar.gz"

# Keep only last 7 backups
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs -r rm
```

Make it executable and run:
```bash
chmod +x backup.sh
./backup.sh
```

#### Scheduled Backups with Cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/rediscover/backup.sh
```

### Restore Procedures

#### Restore from Backup

```bash
# Stop the container
docker-compose down

# Extract backup
tar -xzf backups/20240101_020000.tar.gz -C backups/

# Restore data directory
rm -rf data
cp -r backups/20240101_020000 data

# Ensure proper permissions
chmod 600 data/.secret

# Restart the container
docker-compose up -d
```

#### Restore Specific Files

**Restore database only**:
```bash
docker-compose down
cp backups/20240101_020000/rediscover.db data/
docker-compose up -d
```

**Restore app secret only**:
```bash
docker-compose down
cp backups/20240101_020000/.secret data/
chmod 600 data/.secret
docker-compose up -d
```

### Backup Best Practices

1. **Regular Schedule**: Backup daily or before major changes
2. **Multiple Locations**: Store backups on different physical devices
3. **Test Restores**: Periodically verify backups can be restored
4. **Secure Storage**: Encrypt backups containing the `.secret` file
5. **Retention Policy**: Keep at least 7 daily backups and 4 weekly backups

## Graceful Shutdown

Rediscover implements graceful shutdown to ensure data integrity and clean resource cleanup.

### Shutdown Behavior

When receiving `SIGTERM` or `SIGINT` signals (e.g., `docker-compose down` or `Ctrl+C`), the application:

1. **Stops accepting new connections** - HTTP server stops listening
2. **Closes Socket.io connections** - All WebSocket connections are closed gracefully
3. **Disconnects Redis clients** - All Redis connections are properly closed
4. **Closes database** - SQLite database is closed cleanly
5. **Exits process** - Process exits with code 0 (success)

### Shutdown Sequence

```
[Server] Received SIGTERM, starting graceful shutdown...
[Server] HTTP server closed
[Server] Socket.io server closed
[Redis] Disconnecting all clients...
[Redis] Disconnected client for connection 1
[Redis] Disconnected client for connection 2
[Server] All Redis connections closed
[Server] Database connection closed
[Server] Graceful shutdown complete
```

### Triggering Graceful Shutdown

**Docker Compose**:
```bash
docker-compose down
```

**Docker Container**:
```bash
docker stop rediscover
```

**Direct Process** (development):
```bash
# Press Ctrl+C in the terminal
```

### Shutdown Timeout

Docker waits 10 seconds by default before force-killing. To customize:

```yaml
services:
  rediscover:
    stop_grace_period: 30s  # Wait 30 seconds before SIGKILL
```

### Error Handling

If an error occurs during shutdown:
- Error is logged to console
- Process exits with code 1 (failure)
- Docker will restart the container if `restart: unless-stopped` is configured

## Troubleshooting

### Container Won't Start

**Check logs**:
```bash
docker-compose logs -f
```

**Common issues**:
- Port 6377 already in use: Change port mapping in `docker-compose.yml`
- Permission denied on data directory: `chmod 755 data`
- Out of memory: Increase Docker memory limit

### Database Errors

**Database locked**:
```bash
# Stop container
docker-compose down

# Remove lock file
rm data/rediscover.db-shm data/rediscover.db-wal

# Restart
docker-compose up -d
```

**Corrupted database**:
```bash
# Restore from backup
docker-compose down
cp backups/latest/rediscover.db data/
docker-compose up -d
```

### Connection Issues

**Can't connect to Redis servers**:
- Verify Redis server is accessible from Docker container
- Check firewall rules
- Use host.docker.internal for localhost Redis on Docker Desktop

**Frontend can't reach backend**:
- Verify backend is running: `curl http://localhost:6377/api/health`
- Check browser console for CORS errors
- Ensure `FRONTEND_URL` is set correctly in development

### Performance Issues

**High memory usage**:
- Check number of active Redis connections
- Review audit log size: `sqlite3 data/rediscover.db "SELECT COUNT(*) FROM audit_log;"`
- Consider pruning old audit logs

**Slow response times**:
- Check Redis server latency
- Review slow log in Rediscover UI
- Increase Docker CPU/memory allocation

### Reset Application

**Complete reset** (deletes all data):
```bash
docker-compose down
rm -rf data
docker-compose up -d
```

**Reset admin password**:
```bash
# Stop container
docker-compose down

# Delete users table
sqlite3 data/rediscover.db "DELETE FROM users;"

# Restart and go through setup again
docker-compose up -d
```

### Getting Help

**View application logs**:
```bash
docker-compose logs -f rediscover
```

**Check container status**:
```bash
docker-compose ps
```

**Inspect container**:
```bash
docker exec -it rediscover sh
```

**Database inspection**:
```bash
docker exec -it rediscover sqlite3 /app/data/rediscover.db
```

## Security Considerations

### Network Security

- **Firewall**: Only expose port 6377 to trusted networks
- **Reverse Proxy**: Use nginx/Caddy with HTTPS in production
- **VPN**: Consider VPN access for remote management

### Data Security

- **App Secret**: Keep `.secret` file secure and backed up
- **Backups**: Encrypt backups containing sensitive data
- **Permissions**: Ensure `data/` directory has restricted permissions

### Access Control

- **Strong Passwords**: Enforce strong passwords for admin accounts
- **Role-Based Access**: Use operator role for users who don't need dangerous commands
- **Audit Logs**: Regularly review audit logs for suspicious activity

### Docker Security

- **Non-root User**: Consider running container as non-root user
- **Read-only Filesystem**: Mount only `/app/data` as writable
- **Resource Limits**: Set memory and CPU limits in `docker-compose.yml`

Example hardened configuration:

```yaml
services:
  rediscover:
    # ... other config ...
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Production Checklist

Before deploying to production:

- [ ] Set custom `APP_SECRET` or backup auto-generated `.secret` file
- [ ] Configure HTTPS with reverse proxy (nginx/Caddy)
- [ ] Set up automated backups
- [ ] Configure firewall rules
- [ ] Test backup restore procedure
- [ ] Set up monitoring/alerting on health endpoint
- [ ] Review and adjust resource limits
- [ ] Document admin credentials securely
- [ ] Test graceful shutdown behavior
- [ ] Verify audit logging is working

## Additional Resources

- **GitHub Repository**: [Link to repository]
- **Issue Tracker**: [Link to issues]
- **Documentation**: [Link to docs]
- **Community**: [Link to community/support]

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-01
