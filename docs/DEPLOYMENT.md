# Production Deployment Guide

This guide provides step-by-step instructions for deploying the Rediscover application to production using the reverse proxy configuration. The deployment uses nginx as a reverse proxy to route requests to the appropriate services, enabling seamless deployment to custom domains.

## Overview

The production deployment consists of three main services:
- **Nginx**: Reverse proxy and static file server (port 80/443)
- **Frontend**: React application build service
- **Backend**: Node.js API server (internal port 6377)

All services communicate through an internal Docker network, with only nginx exposed to the public internet.

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Memory**: Minimum 2GB RAM (4GB+ recommended)
- **Storage**: Minimum 10GB available disk space
- **Network**: Public IP address or domain name

### Domain and DNS Setup

1. **Domain Registration**: Ensure you have a registered domain name
2. **DNS Configuration**: Point your domain to your server's IP address
   ```bash
   # Example DNS records (replace with your domain and IP)
   A     your-domain.com        192.168.1.100
   CNAME www.your-domain.com    your-domain.com
   ```
3. **DNS Propagation**: Wait for DNS changes to propagate (up to 48 hours)

### Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
```

## Quick Start Deployment

### 1. Clone and Prepare Repository

```bash
# Clone the repository
git clone <your-repository-url>
cd rediscover

# Verify all required files exist
ls -la nginx/ docker-compose.prod.yml Dockerfile.frontend
```

### 2. Configure Environment Variables

```bash
# Copy production environment template
cp .env.prod.example .env

# Generate secure APP_SECRET
openssl rand -base64 64

# Edit environment configuration
nano .env
```

**Required environment variables:**
```bash
# Security (CRITICAL - change these values)
APP_SECRET=your-secure-64-character-random-string-here
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# Domain configuration
FRONTEND_URL=https://your-domain.com
VITE_API_URL=

# Network configuration
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
NODE_ENV=production
```

### 3. Deploy Services

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
```

### 4. Verify Deployment

```bash
# Test HTTP access
curl -I http://your-domain.com

# Check service health
curl http://your-domain.com/nginx-health
curl http://your-domain.com/api/health

# View logs if needed
docker-compose -f docker-compose.prod.yml logs
```

## Detailed Configuration

### Environment Variables Configuration

#### Security Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APP_SECRET` | **Yes** | JWT signing secret (64+ chars) | `openssl rand -base64 64` |
| `JWT_EXPIRES_IN` | No | Token expiration time | `24h`, `12h`, `7d` |
| `BCRYPT_ROUNDS` | No | Password hashing rounds | `12` (production) |

#### Network Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NGINX_HTTP_PORT` | No | HTTP port for nginx | `80` |
| `NGINX_HTTPS_PORT` | No | HTTPS port for nginx | `443` |
| `FRONTEND_URL` | **Yes** | Frontend domain for CORS | `https://your-domain.com` |
| `VITE_API_URL` | No | API URL for frontend | `""` (relative URLs) |

#### Application Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | Node.js environment | `production` |
| `PORT` | No | Backend internal port | `6377` |
| `DATABASE_PATH` | No | SQLite database path | `/app/data/rediscover.db` |

### Domain Configuration Examples

#### Single Domain Setup (Recommended)

```bash
# .env configuration for single domain
FRONTEND_URL=https://rediscover.example.com
VITE_API_URL=
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
```

**DNS Configuration:**
```
A     rediscover.example.com    192.168.1.100
```

#### Subdomain Setup

```bash
# .env configuration for subdomain
FRONTEND_URL=https://app.example.com
VITE_API_URL=
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
```

**DNS Configuration:**
```
A     app.example.com          192.168.1.100
CNAME www.app.example.com      app.example.com
```

#### Custom Port Setup

```bash
# .env configuration for custom ports
FRONTEND_URL=https://example.com:8443
VITE_API_URL=
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
```

**Firewall Configuration:**
```bash
sudo ufw allow 8080
sudo ufw allow 8443
```

## SSL/HTTPS Configuration

📖 **For comprehensive SSL setup instructions, see [SSL Certificate Setup Guide](SSL_CERTIFICATE_SETUP.md)**

The following provides a quick overview. For detailed instructions, troubleshooting, and security best practices, refer to the dedicated SSL guide.

### Option 1: Let's Encrypt (Recommended)

#### Install Certbot

```bash
# Install certbot
sudo apt install certbot

# Stop services to free port 80
docker-compose -f docker-compose.prod.yml down
```

#### Generate Certificate

```bash
# Generate certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/key.pem

# Set proper permissions
sudo chown $USER:$USER ./nginx/ssl/*.pem
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem
```

#### Enable SSL Configuration

```bash
# Copy SSL configuration template
cp nginx/conf.d/ssl.conf.template nginx/conf.d/ssl.conf

# Update domain name in SSL config
sed -i 's/your-domain.com/your-actual-domain.com/g' nginx/conf.d/ssl.conf

# Restart services with SSL
docker-compose -f docker-compose.prod.yml up -d
```

#### Setup Auto-Renewal

```bash
# Create renewal script
cat > /home/$USER/renew-ssl.sh << 'EOF'
#!/bin/bash
sudo certbot renew --quiet
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/nginx/ssl/key.pem
sudo chown $USER:$USER /path/to/nginx/ssl/*.pem
docker-compose -f /path/to/docker-compose.prod.yml restart nginx
EOF

chmod +x /home/$USER/renew-ssl.sh

# Add to crontab (runs twice daily)
echo "0 12 * * * /home/$USER/renew-ssl.sh" | sudo crontab -
```

### Option 2: Custom SSL Certificate

```bash
# Copy your certificate files
cp /path/to/your/certificate.crt ./nginx/ssl/cert.pem
cp /path/to/your/private.key ./nginx/ssl/key.pem

# Set permissions
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem

# Enable SSL configuration
cp nginx/conf.d/ssl.conf.template nginx/conf.d/ssl.conf
# Edit nginx/conf.d/ssl.conf to match your domain

# Restart services
docker-compose -f docker-compose.prod.yml restart nginx
```

### Option 3: Self-Signed Certificate (Development Only)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ./nginx/ssl/key.pem \
  -out ./nginx/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=your-domain.com"

# Set permissions
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem
```

## Deployment Verification

### Health Check Endpoints

```bash
# Nginx health check
curl http://your-domain.com/nginx-health
# Expected: "healthy"

# Backend API health check
curl http://your-domain.com/api/health
# Expected: {"status":"ok","timestamp":"..."}

# Frontend accessibility
curl -I http://your-domain.com/
# Expected: 200 OK with HTML content
```

### Service Status Verification

```bash
# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                   COMMAND                  SERVICE    STATUS
# rediscover-nginx       "/docker-entrypoint.…"   nginx      Up (healthy)
# rediscover-frontend    "/entrypoint.sh"         frontend   Up (healthy)
# rediscover-backend     "docker-entrypoint.s…"   backend    Up (healthy)
```

### Network Connectivity Tests

```bash
# Test API routing
curl http://your-domain.com/api/health

# Test static file serving
curl -I http://your-domain.com/assets/index.css

# Test WebSocket connectivity (if applicable)
curl -I http://your-domain.com/socket.io/

# Test HTTPS redirect (if SSL enabled)
curl -I http://your-domain.com
# Should return 301 redirect to https://
```

### Performance Verification

```bash
# Test response times
time curl -s http://your-domain.com > /dev/null

# Test concurrent connections
ab -n 100 -c 10 http://your-domain.com/

# Monitor resource usage
docker stats
```

## Monitoring and Maintenance

### Log Management

```bash
# View all service logs
docker-compose -f docker-compose.prod.yml logs

# View specific service logs
docker-compose -f docker-compose.prod.yml logs nginx
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend

# Follow logs in real-time
docker-compose -f docker-compose.prod.yml logs -f

# View nginx access logs
docker exec rediscover-nginx tail -f /var/log/nginx/access.log

# View nginx error logs
docker exec rediscover-nginx tail -f /var/log/nginx/error.log
```

### Backup Procedures

#### Database Backup

```bash
# Create backup directory
mkdir -p backups/$(date +%Y-%m-%d)

# Backup application data
docker run --rm -v rediscover-data:/data -v $(pwd)/backups/$(date +%Y-%m-%d):/backup alpine tar czf /backup/rediscover-data.tar.gz -C /data .

# Verify backup
ls -la backups/$(date +%Y-%m-%d)/
```

#### Configuration Backup

```bash
# Backup configuration files
tar czf backups/$(date +%Y-%m-%d)/config-backup.tar.gz \
  nginx/ \
  docker-compose.prod.yml \
  .env \
  Dockerfile.frontend
```

#### Automated Backup Script

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="backups/$(date +%Y-%m-%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup data volumes
docker run --rm -v rediscover-data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/data.tar.gz -C /data .

# Backup configuration
tar czf "$BACKUP_DIR/config.tar.gz" nginx/ docker-compose.prod.yml .env Dockerfile.frontend

# Cleanup old backups (keep last 7 days)
find backups/ -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh

# Schedule daily backups
echo "0 2 * * * /path/to/backup.sh" | crontab -
```

### Updates and Maintenance

#### Application Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart services
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Verify update
docker-compose -f docker-compose.prod.yml ps
```

#### System Maintenance

```bash
# Clean up unused Docker resources
docker system prune -f

# Update Docker images
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Monitor disk usage
df -h
docker system df
```

### Performance Monitoring

#### Resource Monitoring

```bash
# Monitor container resource usage
docker stats --no-stream

# Monitor system resources
htop
iostat -x 1
```

#### Application Monitoring

```bash
# Monitor nginx access patterns
tail -f /var/log/nginx/access.log | grep -E "(GET|POST|PUT|DELETE)"

# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s http://your-domain.com/api/health

# Create curl timing format file
cat > curl-format.txt << 'EOF'
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF
```

## Troubleshooting

### Common Issues

#### Services Won't Start

**Problem**: Services fail to start or exit immediately

**Diagnosis**:
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View service logs
docker-compose -f docker-compose.prod.yml logs
```

**Solutions**:
- Check environment variables in `.env` file
- Verify Docker and Docker Compose versions
- Ensure ports are not already in use: `netstat -tlnp | grep :80`
- Check file permissions on configuration files

#### Cannot Access Application

**Problem**: Application not accessible from browser

**Diagnosis**:
```bash
# Test local connectivity
curl -I http://localhost

# Check nginx status
docker-compose -f docker-compose.prod.yml logs nginx

# Verify port binding
docker port rediscover-nginx
```

**Solutions**:
- Check firewall settings: `sudo ufw status`
- Verify DNS configuration: `nslookup your-domain.com`
- Ensure nginx is listening on correct ports
- Check domain configuration in environment variables

#### SSL Certificate Issues

**Problem**: HTTPS not working or certificate errors

**Diagnosis**:
```bash
# Check certificate files
ls -la nginx/ssl/
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Test SSL configuration
openssl s_client -connect your-domain.com:443
```

**Solutions**:
- Verify certificate files exist and have correct permissions
- Check certificate expiration date
- Ensure domain name matches certificate
- Verify SSL configuration is enabled in nginx

#### Database Connection Errors

**Problem**: Backend cannot connect to database

**Diagnosis**:
```bash
# Check backend logs
docker-compose -f docker-compose.prod.yml logs backend

# Verify data volume
docker volume inspect rediscover-data

# Check database file
docker exec rediscover-backend ls -la /app/data/
```

**Solutions**:
- Verify data volume is properly mounted
- Check database file permissions
- Ensure DATABASE_PATH environment variable is correct
- Restart backend service: `docker-compose -f docker-compose.prod.yml restart backend`

#### High Memory Usage

**Problem**: Services consuming too much memory

**Diagnosis**:
```bash
# Monitor resource usage
docker stats
free -h
```

**Solutions**:
- Increase server memory if possible
- Optimize Docker resource limits
- Check for memory leaks in application logs
- Restart services periodically if needed

### Debug Commands

```bash
# Enter nginx container for debugging
docker exec -it rediscover-nginx sh

# Enter backend container for debugging
docker exec -it rediscover-backend sh

# View nginx configuration
docker exec rediscover-nginx nginx -T

# Test nginx configuration
docker exec rediscover-nginx nginx -t

# Reload nginx configuration without restart
docker exec rediscover-nginx nginx -s reload

# View resolved Docker Compose configuration
docker-compose -f docker-compose.prod.yml config
```

### Log Analysis

```bash
# Analyze nginx access patterns
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -10

# Monitor error rates
grep "ERROR" /var/log/nginx/error.log | tail -20

# Check for failed requests
awk '$9 >= 400 {print $0}' /var/log/nginx/access.log | tail -10
```

## Security Considerations

### Production Security Checklist

- [ ] **Strong APP_SECRET**: Generated with `openssl rand -base64 64`
- [ ] **HTTPS Enabled**: SSL certificate properly configured
- [ ] **Firewall Configured**: Only necessary ports open (80, 443, 22)
- [ ] **Regular Updates**: System and Docker images kept up to date
- [ ] **Backup Strategy**: Automated backups configured and tested
- [ ] **Log Monitoring**: Centralized logging and alerting set up
- [ ] **Access Control**: SSH key-based authentication, no root login
- [ ] **Network Security**: Services isolated in Docker network
- [ ] **File Permissions**: Configuration files have appropriate permissions
- [ ] **Environment Variables**: Sensitive data not hardcoded

### Security Best Practices

```bash
# Secure SSH configuration
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no, PasswordAuthentication no

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Set up fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban

# Regular security updates
sudo apt update && sudo apt upgrade -y
```

## Performance Optimization

### Nginx Optimization

```bash
# Add to nginx/nginx.conf for better performance
worker_processes auto;
worker_connections 2048;
keepalive_timeout 30;
client_max_body_size 50M;
```

### Docker Optimization

```bash
# Limit container resources in docker-compose.prod.yml
services:
  nginx:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

### Database Optimization

```bash
# Regular database maintenance
docker exec rediscover-backend sqlite3 /app/data/rediscover.db "VACUUM;"
docker exec rediscover-backend sqlite3 /app/data/rediscover.db "ANALYZE;"
```

This deployment guide provides comprehensive instructions for deploying the Rediscover application to production with proper security, monitoring, and maintenance procedures. Follow the steps carefully and customize the configuration for your specific environment and requirements.