# Troubleshooting Guide

This comprehensive guide helps diagnose and resolve common issues encountered when deploying the Rediscover application with the reverse proxy configuration. The guide covers nginx configuration problems, Docker Compose service issues, network connectivity problems, and production deployment challenges.

## Quick Diagnosis

### Service Status Check

Start troubleshooting by checking the overall system status:

```bash
# Check all services status
docker-compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                   COMMAND                  SERVICE    STATUS
# rediscover-nginx       "/docker-entrypoint.…"   nginx      Up (healthy)
# rediscover-frontend    "/entrypoint.sh"         frontend   Up (healthy)
# rediscover-backend     "docker-entrypoint.s…"   backend    Up (healthy)
```

### Quick Health Checks

```bash
# Test nginx health
curl -I http://localhost/nginx-health
# Expected: 200 OK with "healthy" response

# Test backend health through proxy
curl -I http://localhost/api/health
# Expected: 200 OK with JSON health data

# Test frontend serving
curl -I http://localhost/
# Expected: 200 OK with HTML content
```

### Log Analysis

```bash
# View all service logs
docker-compose -f docker-compose.prod.yml logs --tail=50

# View specific service logs
docker-compose -f docker-compose.prod.yml logs nginx
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend
```

## Nginx Issues

### Issue: Nginx Container Won't Start

**Symptoms:**
- `docker-compose ps` shows nginx as "Exited" or "Restarting"
- Error messages about configuration or file permissions

**Diagnosis:**
```bash
# Check nginx logs
docker-compose -f docker-compose.prod.yml logs nginx

# Test nginx configuration syntax
docker run --rm -v $(pwd)/nginx:/etc/nginx nginx:alpine nginx -t

# Check file permissions
ls -la nginx/
ls -la nginx/conf.d/
ls -la nginx/ssl/
```

**Common Causes & Solutions:**

#### 1. Configuration Syntax Errors

```bash
# Test configuration syntax
docker run --rm -v $(pwd)/nginx:/etc/nginx nginx:alpine nginx -t

# Common syntax errors:
# - Missing semicolons
# - Unmatched braces
# - Invalid directive names
# - Incorrect file paths
```

**Fix:** Review and correct nginx configuration files:
```bash
# Validate main config
cat nginx/nginx.conf

# Validate server config
cat nginx/conf.d/default.conf

# Check for common issues:
grep -n ";" nginx/conf.d/default.conf  # Missing semicolons
grep -n "{" nginx/conf.d/default.conf  # Unmatched braces
```

#### 2. File Permission Issues

```bash
# Check and fix permissions
sudo chown -R $USER:$USER nginx/
chmod 644 nginx/nginx.conf
chmod 644 nginx/conf.d/*.conf
chmod 644 nginx/ssl/*.pem 2>/dev/null || true
chmod 600 nginx/ssl/*.key 2>/dev/null || true
```

#### 3. SSL Certificate Problems

```bash
# Check SSL certificate files
ls -la nginx/ssl/

# Validate certificate
openssl x509 -in nginx/ssl/cert.pem -text -noout 2>/dev/null || echo "Certificate invalid or missing"

# Validate private key
openssl rsa -in nginx/ssl/key.pem -check 2>/dev/null || echo "Private key invalid or missing"

# Check certificate and key match
cert_hash=$(openssl x509 -noout -modulus -in nginx/ssl/cert.pem 2>/dev/null | openssl md5)
key_hash=$(openssl rsa -noout -modulus -in nginx/ssl/key.pem 2>/dev/null | openssl md5)
if [ "$cert_hash" = "$key_hash" ]; then
    echo "✅ Certificate and key match"
else
    echo "❌ Certificate and key do not match"
fi
```

### Issue: 502 Bad Gateway Errors

**Symptoms:**
- Nginx returns "502 Bad Gateway" for API requests
- Frontend loads but API calls fail

**Diagnosis:**
```bash
# Check backend service status
docker-compose -f docker-compose.prod.yml ps backend

# Test backend direct access
curl http://localhost:6377/api/health

# Check nginx upstream configuration
docker exec rediscover-nginx cat /etc/nginx/conf.d/default.conf | grep -A5 "upstream backend"

# Check Docker network connectivity
docker exec rediscover-nginx nslookup backend
docker exec rediscover-nginx ping -c 3 backend
```

**Solutions:**

#### 1. Backend Service Not Running

```bash
# Restart backend service
docker-compose -f docker-compose.prod.yml restart backend

# Check backend logs for startup errors
docker-compose -f docker-compose.prod.yml logs backend

# Verify backend health
docker exec rediscover-backend curl -f http://localhost:6377/api/health
```

#### 2. Network Connectivity Issues

```bash
# Check Docker network
docker network ls | grep rediscover
docker network inspect rediscover-network

# Verify service names resolve
docker exec rediscover-nginx nslookup backend
docker exec rediscover-nginx nslookup frontend

# Test network connectivity
docker exec rediscover-nginx telnet backend 6377
```

#### 3. Upstream Configuration Problems

```bash
# Check upstream configuration
docker exec rediscover-nginx nginx -T | grep -A10 "upstream backend"

# Verify backend port
docker exec rediscover-backend netstat -tlnp | grep 6377

# Test upstream manually
docker exec rediscover-nginx curl -f http://backend:6377/api/health
```

### Issue: Static Files Not Loading

**Symptoms:**
- Frontend shows blank page or missing assets
- 404 errors for CSS, JS, or image files

**Diagnosis:**
```bash
# Check frontend build volume
docker volume inspect rediscover_frontend-dist

# Check if files exist in nginx
docker exec rediscover-nginx ls -la /usr/share/nginx/html/

# Test static file serving
curl -I http://localhost/index.html
curl -I http://localhost/assets/

# Check nginx static file configuration
docker exec rediscover-nginx cat /etc/nginx/conf.d/default.conf | grep -A10 "location /"
```

**Solutions:**

#### 1. Frontend Build Issues

```bash
# Check frontend service logs
docker-compose -f docker-compose.prod.yml logs frontend

# Rebuild frontend service
docker-compose -f docker-compose.prod.yml build --no-cache frontend
docker-compose -f docker-compose.prod.yml up -d frontend

# Verify build output
docker exec rediscover-frontend ls -la /app/dist/
docker exec rediscover-frontend ls -la /app/dist-volume/
```

#### 2. Volume Mount Problems

```bash
# Check volume mounts
docker inspect rediscover-nginx | grep -A10 "Mounts"
docker inspect rediscover-frontend | grep -A10 "Mounts"

# Recreate volumes
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

#### 3. Nginx Static File Configuration

```bash
# Check nginx root directory
docker exec rediscover-nginx nginx -T | grep "root"

# Verify try_files directive
docker exec rediscover-nginx nginx -T | grep "try_files"

# Test file serving manually
docker exec rediscover-nginx ls -la /usr/share/nginx/html/
docker exec rediscover-nginx cat /usr/share/nginx/html/index.html
```

## Docker Compose Issues

### Issue: Services Fail to Start

**Symptoms:**
- `docker-compose up` exits with errors
- Services show "Exited" status immediately after starting

**Diagnosis:**
```bash
# Check Docker Compose configuration syntax
docker-compose -f docker-compose.prod.yml config

# View detailed service logs
docker-compose -f docker-compose.prod.yml logs --no-color

# Check Docker daemon status
systemctl status docker
docker info
```

**Solutions:**

#### 1. Configuration Validation

```bash
# Validate Docker Compose syntax
docker-compose -f docker-compose.prod.yml config

# Check for common issues:
# - Invalid YAML syntax
# - Missing environment variables
# - Incorrect volume paths
# - Invalid port mappings
```

#### 2. Environment Variable Issues

```bash
# Check environment file
cat .env

# Verify required variables are set
echo "APP_SECRET: ${APP_SECRET}"
echo "FRONTEND_URL: ${FRONTEND_URL}"
echo "NODE_ENV: ${NODE_ENV}"

# Generate missing APP_SECRET
openssl rand -base64 64
```

#### 3. Port Conflicts

```bash
# Check for port conflicts
netstat -tlnp | grep :80
netstat -tlnp | grep :443
netstat -tlnp | grep :6377

# Kill conflicting processes
sudo lsof -ti:80 | xargs sudo kill -9
sudo lsof -ti:443 | xargs sudo kill -9
```

### Issue: Health Checks Failing

**Symptoms:**
- Services show "unhealthy" status
- Containers restart frequently

**Diagnosis:**
```bash
# Check health check status
docker-compose -f docker-compose.prod.yml ps

# View health check logs
docker inspect rediscover-nginx | grep -A20 "Health"
docker inspect rediscover-backend | grep -A20 "Health"
docker inspect rediscover-frontend | grep -A20 "Health"

# Test health checks manually
docker exec rediscover-nginx wget --spider http://localhost/nginx-health
docker exec rediscover-backend wget --spider http://localhost:6377/api/health
docker exec rediscover-frontend test -f /app/dist-volume/index.html
```

**Solutions:**

#### 1. Nginx Health Check Issues

```bash
# Test nginx health endpoint
docker exec rediscover-nginx curl -f http://localhost/nginx-health

# Check nginx configuration for health endpoint
docker exec rediscover-nginx nginx -T | grep -A5 "location /nginx-health"

# Fix health check configuration if needed
# Ensure this block exists in nginx/conf.d/default.conf:
# location /nginx-health {
#     access_log off;
#     return 200 "healthy\n";
#     add_header Content-Type text/plain;
# }
```

#### 2. Backend Health Check Issues

```bash
# Test backend health endpoint
docker exec rediscover-backend curl -f http://localhost:6377/api/health

# Check backend service startup
docker-compose -f docker-compose.prod.yml logs backend | grep -i "server"

# Verify backend port binding
docker exec rediscover-backend netstat -tlnp | grep 6377
```

#### 3. Frontend Health Check Issues

```bash
# Check frontend build completion
docker exec rediscover-frontend ls -la /app/dist-volume/

# Verify frontend service logs
docker-compose -f docker-compose.prod.yml logs frontend

# Check volume mounting
docker exec rediscover-nginx ls -la /usr/share/nginx/html/
```

## Service Connectivity Issues

### Issue: API Requests Failing

**Symptoms:**
- Frontend loads but API calls return errors
- CORS errors in browser console
- Network timeouts for API requests

**Diagnosis:**
```bash
# Test API connectivity through nginx
curl -v http://localhost/api/health

# Test direct backend connectivity
curl -v http://localhost:6377/api/health

# Check nginx proxy configuration
docker exec rediscover-nginx nginx -T | grep -A10 "location /api/"

# Check CORS configuration
curl -H "Origin: http://localhost" -v http://localhost/api/health
```

**Solutions:**

#### 1. Nginx Proxy Configuration

```bash
# Verify API proxy configuration in nginx/conf.d/default.conf
grep -A15 "location /api/" nginx/conf.d/default.conf

# Required configuration:
# location /api/ {
#     proxy_pass http://backend;
#     proxy_http_version 1.1;
#     proxy_set_header Host $host;
#     proxy_set_header X-Real-IP $remote_addr;
#     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#     proxy_set_header X-Forwarded-Proto $scheme;
# }
```

#### 2. CORS Configuration

```bash
# Check backend CORS settings
docker exec rediscover-backend grep -r "cors" /app/src/

# Verify FRONTEND_URL environment variable
docker exec rediscover-backend printenv | grep FRONTEND_URL

# Update CORS configuration if needed
# In backend, ensure CORS origin matches FRONTEND_URL
```

#### 3. Network Isolation Issues

```bash
# Check Docker network configuration
docker network inspect rediscover_rediscover-network

# Verify all services are on the same network
docker inspect rediscover-nginx | grep NetworkMode
docker inspect rediscover-backend | grep NetworkMode
docker inspect rediscover-frontend | grep NetworkMode

# Test inter-service connectivity
docker exec rediscover-nginx ping -c 3 backend
docker exec rediscover-backend ping -c 3 nginx
```

### Issue: WebSocket Connections Failing

**Symptoms:**
- Real-time features not working
- WebSocket connection errors in browser console
- Socket.io connection timeouts

**Diagnosis:**
```bash
# Test WebSocket endpoint
curl -I http://localhost/socket.io/

# Check nginx WebSocket configuration
docker exec rediscover-nginx nginx -T | grep -A10 "location /socket.io/"

# Check backend WebSocket server
docker-compose -f docker-compose.prod.yml logs backend | grep -i socket

# Test WebSocket upgrade headers
curl -H "Connection: Upgrade" -H "Upgrade: websocket" -v http://localhost/socket.io/
```

**Solutions:**

#### 1. Nginx WebSocket Configuration

```bash
# Verify WebSocket proxy configuration in nginx/conf.d/default.conf
grep -A15 "location /socket.io/" nginx/conf.d/default.conf

# Required configuration:
# location /socket.io/ {
#     proxy_pass http://backend;
#     proxy_http_version 1.1;
#     proxy_set_header Upgrade $http_upgrade;
#     proxy_set_header Connection "upgrade";
#     proxy_set_header Host $host;
#     proxy_read_timeout 86400;
# }
```

#### 2. Backend WebSocket Server

```bash
# Check if backend has WebSocket server enabled
docker exec rediscover-backend grep -r "socket.io" /app/src/

# Verify WebSocket server is listening
docker exec rediscover-backend netstat -tlnp | grep 6377

# Check WebSocket server logs
docker-compose -f docker-compose.prod.yml logs backend | grep -i "socket\|websocket"
```

## SSL/HTTPS Issues

### Issue: SSL Certificate Errors

**Symptoms:**
- Browser shows "Not secure" or certificate warnings
- HTTPS connections fail
- Mixed content warnings

**Diagnosis:**
```bash
# Test HTTPS connection
curl -I https://your-domain.com

# Check certificate validity
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Verify certificate files
ls -la nginx/ssl/
openssl x509 -in nginx/ssl/cert.pem -text -noout
openssl rsa -in nginx/ssl/key.pem -check
```

**Solutions:**

#### 1. Certificate Installation Issues

```bash
# Check certificate files exist and have correct permissions
ls -la nginx/ssl/
chmod 644 nginx/ssl/cert.pem
chmod 600 nginx/ssl/key.pem

# Verify certificate chain
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt nginx/ssl/cert.pem

# For Let's Encrypt, ensure you're using fullchain.pem
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

#### 2. SSL Configuration Issues

```bash
# Check if SSL configuration is enabled
ls -la nginx/conf.d/ssl.conf

# Enable SSL configuration if missing
cp nginx/conf.d/ssl.conf.template nginx/conf.d/ssl.conf
sed -i 's/your-domain.com/actual-domain.com/g' nginx/conf.d/ssl.conf

# Test SSL configuration
docker exec rediscover-nginx nginx -t
```

#### 3. Mixed Content Issues

```bash
# Check for hardcoded HTTP URLs in frontend
grep -r "http://" frontend/src/ || echo "No hardcoded HTTP URLs found"

# Verify FRONTEND_URL uses HTTPS
echo "FRONTEND_URL: ${FRONTEND_URL}"

# Update environment variables
# Set FRONTEND_URL=https://your-domain.com in .env
```

### Issue: HTTP to HTTPS Redirect Not Working

**Symptoms:**
- HTTP requests don't redirect to HTTPS
- Both HTTP and HTTPS work simultaneously

**Diagnosis:**
```bash
# Test HTTP redirect
curl -I http://your-domain.com

# Check nginx SSL configuration
docker exec rediscover-nginx nginx -T | grep -A5 "return 301"

# Verify SSL configuration is loaded
docker exec rediscover-nginx nginx -T | grep "listen 443"
```

**Solutions:**

```bash
# Ensure SSL configuration includes redirect
# In nginx/conf.d/ssl.conf, add:
# server {
#     listen 80;
#     server_name your-domain.com;
#     return 301 https://$server_name$request_uri;
# }

# Reload nginx configuration
docker-compose -f docker-compose.prod.yml restart nginx
```

## Performance Issues

### Issue: Slow Response Times

**Symptoms:**
- High page load times
- API requests taking too long
- Timeouts under load

**Diagnosis:**
```bash
# Monitor resource usage
docker stats

# Test response times
time curl -s http://localhost/api/health > /dev/null

# Check nginx access logs for slow requests
docker exec rediscover-nginx tail -f /var/log/nginx/access.log

# Monitor backend performance
docker-compose -f docker-compose.prod.yml logs backend | grep -i "slow\|timeout\|error"
```

**Solutions:**

#### 1. Nginx Performance Optimization

```bash
# Add to nginx/nginx.conf for better performance:
# worker_processes auto;
# worker_connections 2048;
# keepalive_timeout 30;
# client_max_body_size 50M;

# Enable gzip compression (already configured)
docker exec rediscover-nginx nginx -T | grep -A5 "gzip"

# Restart nginx with new configuration
docker-compose -f docker-compose.prod.yml restart nginx
```

#### 2. Resource Limits

```bash
# Add resource limits to docker-compose.prod.yml:
# services:
#   nginx:
#     deploy:
#       resources:
#         limits:
#           memory: 512M
#         reservations:
#           memory: 256M

# Monitor memory usage
docker stats --no-stream
```

#### 3. Database Optimization

```bash
# Optimize SQLite database
docker exec rediscover-backend sqlite3 /app/data/rediscover.db "VACUUM;"
docker exec rediscover-backend sqlite3 /app/data/rediscover.db "ANALYZE;"

# Check database size
docker exec rediscover-backend ls -lh /app/data/
```

## Log Analysis and Debugging

### Nginx Logs

```bash
# Access logs - successful requests
docker exec rediscover-nginx tail -f /var/log/nginx/access.log

# Error logs - configuration and runtime errors
docker exec rediscover-nginx tail -f /var/log/nginx/error.log

# Filter for specific status codes
docker exec rediscover-nginx grep " 404 " /var/log/nginx/access.log
docker exec rediscover-nginx grep " 502 " /var/log/nginx/access.log
docker exec rediscover-nginx grep " 500 " /var/log/nginx/access.log

# Analyze request patterns
docker exec rediscover-nginx awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -10
```

### Backend Logs

```bash
# Application logs
docker-compose -f docker-compose.prod.yml logs backend

# Filter for errors
docker-compose -f docker-compose.prod.yml logs backend | grep -i "error\|exception\|fail"

# Monitor real-time logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Check startup sequence
docker-compose -f docker-compose.prod.yml logs backend | grep -i "server\|listen\|start"
```

### System Logs

```bash
# Docker daemon logs
journalctl -u docker.service --since "1 hour ago"

# System resource usage
free -h
df -h
iostat -x 1 5

# Network connectivity
netstat -tlnp | grep -E ":80|:443|:6377"
ss -tlnp | grep -E ":80|:443|:6377"
```

## Automated Troubleshooting Scripts

### Quick Health Check Script

```bash
#!/bin/bash
# Save as: scripts/health-check.sh

echo "🏥 Quick Health Check"
echo "===================="

# Check services
echo "📋 Service Status:"
docker-compose -f docker-compose.prod.yml ps

# Test endpoints
echo -e "\n🌐 Endpoint Tests:"
curl -s -o /dev/null -w "Nginx Health: %{http_code}\n" http://localhost/nginx-health
curl -s -o /dev/null -w "Backend Health: %{http_code}\n" http://localhost/api/health
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost/

# Check resources
echo -e "\n💾 Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo -e "\n✅ Health check complete"
```

### Log Analysis Script

```bash
#!/bin/bash
# Save as: scripts/analyze-logs.sh

echo "📊 Log Analysis"
echo "==============="

# Recent errors
echo "🚨 Recent Errors (last 100 lines):"
docker-compose -f docker-compose.prod.yml logs --tail=100 | grep -i "error\|exception\|fail" | tail -10

# Nginx status codes
echo -e "\n📈 Nginx Status Codes (last 1000 requests):"
docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log | awk '{print $9}' | sort | uniq -c | sort -nr

# Top client IPs
echo -e "\n🌍 Top Client IPs:"
docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -nr | head -5

echo -e "\n✅ Log analysis complete"
```

## Emergency Recovery Procedures

### Complete Service Reset

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Remove containers (keeps volumes)
docker-compose -f docker-compose.prod.yml down --remove-orphans

# Rebuild all services
docker-compose -f docker-compose.prod.yml build --no-cache

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Verify health
sleep 30
docker-compose -f docker-compose.prod.yml ps
```

### Data Recovery

```bash
# Backup current data before recovery
mkdir -p emergency-backup/$(date +%Y%m%d-%H%M%S)
docker run --rm -v rediscover_rediscover-data:/data -v $(pwd)/emergency-backup/$(date +%Y%m%d-%H%M%S):/backup alpine tar czf /backup/data.tar.gz -C /data .

# Restore from backup (if needed)
# docker run --rm -v rediscover_rediscover-data:/data -v $(pwd)/backups/BACKUP_DATE:/backup alpine tar xzf /backup/data.tar.gz -C /data
```

### Configuration Reset

```bash
# Reset to default configuration
git checkout HEAD -- nginx/ docker-compose.prod.yml Dockerfile.frontend

# Regenerate environment variables
cp .env.prod.example .env
openssl rand -base64 64  # Use this as APP_SECRET

# Update domain-specific settings
sed -i 's/your-domain.com/actual-domain.com/g' .env
```

## Getting Help

### Diagnostic Information Collection

When seeking help, collect this diagnostic information:

```bash
# System information
echo "=== System Info ===" > diagnostic.txt
uname -a >> diagnostic.txt
docker --version >> diagnostic.txt
docker-compose --version >> diagnostic.txt

# Service status
echo -e "\n=== Service Status ===" >> diagnostic.txt
docker-compose -f docker-compose.prod.yml ps >> diagnostic.txt

# Configuration
echo -e "\n=== Configuration ===" >> diagnostic.txt
docker-compose -f docker-compose.prod.yml config >> diagnostic.txt

# Recent logs
echo -e "\n=== Recent Logs ===" >> diagnostic.txt
docker-compose -f docker-compose.prod.yml logs --tail=50 >> diagnostic.txt

# Network info
echo -e "\n=== Network Info ===" >> diagnostic.txt
docker network ls >> diagnostic.txt
netstat -tlnp | grep -E ":80|:443|:6377" >> diagnostic.txt

echo "Diagnostic information saved to diagnostic.txt"
```

### Common Support Scenarios

1. **"Services won't start"** - Include output of `docker-compose ps` and `docker-compose logs`
2. **"502 Bad Gateway"** - Include nginx logs and backend connectivity tests
3. **"SSL not working"** - Include certificate validation output and nginx SSL configuration
4. **"Slow performance"** - Include `docker stats` output and response time measurements
5. **"CORS errors"** - Include browser console errors and backend CORS configuration

This troubleshooting guide covers the most common issues encountered in production deployments. For additional help, refer to the [Deployment Guide](DEPLOYMENT.md) and [SSL Certificate Setup Guide](SSL_CERTIFICATE_SETUP.md).