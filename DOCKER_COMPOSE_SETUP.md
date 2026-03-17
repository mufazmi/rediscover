# Production Docker Compose Setup

This document describes the production Docker Compose configuration created for the reverse proxy deployment.

## Files Created

### Core Configuration
- `docker-compose.prod.yml` - Production Docker Compose configuration
- `Dockerfile.frontend` - Frontend service Dockerfile for static file generation
- `backend/Dockerfile` - Backend service Dockerfile

### SSL/TLS Support
- `nginx/ssl/README.md` - SSL certificate setup instructions
- `nginx/conf.d/ssl.conf.template` - SSL configuration template

### Environment Configuration
- `.env.example` - General environment variables template
- `.env.prod.example` - Production-specific environment variables

## Architecture

The production setup consists of three services:

1. **nginx** - Reverse proxy and static file server
   - Listens on ports 80 and 443
   - Routes `/api/*` requests to backend service
   - Serves frontend static files directly
   - Handles WebSocket connections for Socket.io

2. **frontend** - Static file builder
   - Builds React application with production optimizations
   - Copies static files to shared volume for nginx
   - Uses relative URLs for API calls (same-domain)

3. **backend** - API server
   - Runs Node.js/TypeScript backend on port 6377
   - Handles API requests and WebSocket connections
   - Manages SQLite database and Redis connections

## Key Features

### Network Isolation
- Internal `rediscover-network` for service communication
- Only nginx service exposes ports to host
- Backend and frontend services are not directly accessible

### Volume Management
- `rediscover-data` - Persistent data storage for backend
- `frontend-dist` - Shared volume for frontend static files

### Health Checks
- All services include health check configurations
- Automatic service restart on health check failures
- Proper startup dependencies and timing

### SSL/TLS Ready
- SSL certificate volume mounts configured
- SSL configuration template provided
- HTTP to HTTPS redirect support

## Usage

### Development
Use the development override configuration for local development:

```bash
# Start development services with reverse proxy
docker compose -f docker-compose.prod.yml -f docker-compose.dev.yml up -d

# Or use the original development setup (direct services)
docker compose -f docker-compose.dev.yml up -d
```

The development override (`docker-compose.dev.yml`) provides:
- **Nginx on port 8080** - Test reverse proxy setup locally
- **Direct service access** - Frontend on 6378, Backend on 6377
- **Hot-reloading support** - Frontend changes reflected immediately
- **Development environment variables** - Configured for local testing

This allows developers to:
1. Test the reverse proxy configuration locally via `http://localhost:8080`
2. Access services directly for debugging (frontend: 6378, backend: 6377)
3. Maintain existing development workflows with hot-reloading

### Production
```bash
# Copy and configure environment variables
cp .env.prod.example .env

# Edit .env with your production values
# Set APP_SECRET, FRONTEND_URL, etc.

# Start production services
docker compose -f docker-compose.prod.yml up -d
```

### SSL Setup
1. Place SSL certificates in `nginx/ssl/` directory
2. Copy `nginx/conf.d/ssl.conf.template` to `nginx/conf.d/ssl.conf`
3. Update domain name in SSL configuration
4. Uncomment SSL server blocks
5. Restart nginx service

## Environment Variables

### Required for Production
- `APP_SECRET` - 32-character hex secret for JWT signing
- `FRONTEND_URL` - Your production domain URL

### Optional
- `JWT_EXPIRES_IN` - JWT token expiration (default: 24h)
- `VITE_API_URL` - Leave empty for relative URLs (recommended)

## Security Features

- Security headers configured in nginx
- CORS properly configured for production domain
- SSL/TLS ready with modern cipher suites
- Health check endpoints for monitoring
- Proper file permissions and volume mounts

This setup provides a production-ready deployment architecture that eliminates localhost dependencies and enables deployment to custom domains.