#!/bin/bash

# Quick Health Check Script
# Performs comprehensive health checks on all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
NGINX_PORT=${NGINX_HTTP_PORT:-80}
BACKEND_PORT=${PORT:-6377}

echo -e "${BLUE}🏥 Rediscover Health Check${NC}"
echo "=========================="
echo "Timestamp: $(date)"
echo ""

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}✅ $message${NC}"
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠️  $message${NC}"
    else
        echo -e "${RED}❌ $message${NC}"
    fi
}

# Check if Docker Compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    print_status "ERROR" "Docker Compose file not found: $COMPOSE_FILE"
    exit 1
fi

# Check Docker daemon
if ! docker info >/dev/null 2>&1; then
    print_status "ERROR" "Docker daemon is not running"
    exit 1
fi
print_status "OK" "Docker daemon is running"

# Check service status
echo -e "\n${BLUE}📋 Service Status:${NC}"
services_output=$(docker-compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "ERROR")

if [ "$services_output" = "ERROR" ]; then
    print_status "ERROR" "Failed to get service status"
else
    echo "$services_output"
    
    # Check individual service health
    nginx_status=$(docker-compose -f "$COMPOSE_FILE" ps nginx 2>/dev/null | grep -c "Up" || echo "0")
    backend_status=$(docker-compose -f "$COMPOSE_FILE" ps backend 2>/dev/null | grep -c "Up" || echo "0")
    frontend_status=$(docker-compose -f "$COMPOSE_FILE" ps frontend 2>/dev/null | grep -c "Up" || echo "0")
    
    if [ "$nginx_status" -eq 1 ]; then
        print_status "OK" "Nginx service is running"
    else
        print_status "ERROR" "Nginx service is not running"
    fi
    
    if [ "$backend_status" -eq 1 ]; then
        print_status "OK" "Backend service is running"
    else
        print_status "ERROR" "Backend service is not running"
    fi
    
    if [ "$frontend_status" -eq 1 ]; then
        print_status "OK" "Frontend service is running"
    else
        print_status "ERROR" "Frontend service is not running"
    fi
fi

# Test endpoints
echo -e "\n${BLUE}🌐 Endpoint Health Tests:${NC}"

# Test nginx health endpoint
nginx_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$NGINX_PORT/nginx-health" 2>/dev/null || echo "000")
if [ "$nginx_health" = "200" ]; then
    print_status "OK" "Nginx health endpoint responding (200)"
else
    print_status "ERROR" "Nginx health endpoint failed ($nginx_health)"
fi

# Test backend health through proxy
backend_proxy_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$NGINX_PORT/api/health" 2>/dev/null || echo "000")
if [ "$backend_proxy_health" = "200" ]; then
    print_status "OK" "Backend health endpoint through proxy (200)"
else
    print_status "ERROR" "Backend health endpoint through proxy failed ($backend_proxy_health)"
fi

# Test frontend serving
frontend_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$NGINX_PORT/" 2>/dev/null || echo "000")
if [ "$frontend_health" = "200" ]; then
    print_status "OK" "Frontend serving (200)"
else
    print_status "ERROR" "Frontend serving failed ($frontend_health)"
fi

# Test direct backend access (if port is exposed)
if netstat -tlnp 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    backend_direct_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null || echo "000")
    if [ "$backend_direct_health" = "200" ]; then
        print_status "OK" "Backend direct access (200)"
    else
        print_status "WARN" "Backend direct access failed ($backend_direct_health)"
    fi
else
    print_status "OK" "Backend port not exposed (good for production)"
fi

# Check SSL if configured
if [ -f "nginx/ssl/cert.pem" ] && [ -f "nginx/ssl/key.pem" ]; then
    echo -e "\n${BLUE}🔒 SSL Configuration:${NC}"
    
    # Check certificate validity
    if openssl x509 -in nginx/ssl/cert.pem -noout -checkend 86400 >/dev/null 2>&1; then
        print_status "OK" "SSL certificate is valid"
        
        # Check certificate expiration
        expiry_date=$(openssl x509 -in nginx/ssl/cert.pem -noout -enddate | cut -d= -f2)
        expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
        current_epoch=$(date +%s)
        days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [ "$days_until_expiry" -gt 30 ]; then
            print_status "OK" "SSL certificate expires in $days_until_expiry days"
        elif [ "$days_until_expiry" -gt 7 ]; then
            print_status "WARN" "SSL certificate expires in $days_until_expiry days (consider renewal)"
        else
            print_status "ERROR" "SSL certificate expires in $days_until_expiry days (renewal required)"
        fi
    else
        print_status "ERROR" "SSL certificate is invalid or expired"
    fi
    
    # Test HTTPS if port 443 is exposed
    if netstat -tlnp 2>/dev/null | grep -q ":443 "; then
        https_health=$(curl -s -k -o /dev/null -w "%{http_code}" "https://localhost/nginx-health" 2>/dev/null || echo "000")
        if [ "$https_health" = "200" ]; then
            print_status "OK" "HTTPS endpoint responding (200)"
        else
            print_status "ERROR" "HTTPS endpoint failed ($https_health)"
        fi
    fi
fi

# Check resource usage
echo -e "\n${BLUE}💾 Resource Usage:${NC}"
if command -v docker >/dev/null 2>&1; then
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null | grep -E "(NAME|rediscover-)" || print_status "WARN" "No running containers found"
fi

# Check disk usage
echo -e "\n${BLUE}💿 Disk Usage:${NC}"
df -h . | tail -1 | awk '{
    usage = substr($5, 1, length($5)-1)
    if (usage > 90) 
        printf "\033[0;31m❌ Disk usage: %s (critical)\033[0m\n", $5
    else if (usage > 80) 
        printf "\033[1;33m⚠️  Disk usage: %s (warning)\033[0m\n", $5
    else 
        printf "\033[0;32m✅ Disk usage: %s (ok)\033[0m\n", $5
}'

# Check Docker volumes
echo -e "\n${BLUE}📦 Docker Volumes:${NC}"
if docker volume ls | grep -q "rediscover"; then
    print_status "OK" "Docker volumes exist"
    docker volume ls | grep "rediscover" | while read -r line; do
        volume_name=$(echo "$line" | awk '{print $2}')
        volume_size=$(docker run --rm -v "$volume_name":/data alpine du -sh /data 2>/dev/null | cut -f1 || echo "unknown")
        echo "  📁 $volume_name: $volume_size"
    done
else
    print_status "WARN" "No Rediscover Docker volumes found"
fi

# Network connectivity test
echo -e "\n${BLUE}🌐 Network Connectivity:${NC}"
if docker network ls | grep -q "rediscover"; then
    print_status "OK" "Docker network exists"
    
    # Test inter-service connectivity if services are running
    if [ "$nginx_status" -eq 1 ] && [ "$backend_status" -eq 1 ]; then
        if docker exec rediscover-nginx ping -c 1 backend >/dev/null 2>&1; then
            print_status "OK" "Nginx can reach backend"
        else
            print_status "ERROR" "Nginx cannot reach backend"
        fi
    fi
else
    print_status "ERROR" "Docker network not found"
fi

# Summary
echo -e "\n${BLUE}📊 Health Check Summary:${NC}"
echo "========================"

# Count issues from the output above
total_checks=$(grep -E "✅|❌|⚠️" /tmp/health_output 2>/dev/null | wc -l || echo "0")
failed_checks=$(grep -c "❌" /tmp/health_output 2>/dev/null || echo "0")
warning_checks=$(grep -c "⚠️" /tmp/health_output 2>/dev/null || echo "0")

# Redirect output to temp file for counting (this is a simplified approach)
# In practice, you'd want to track these during execution

if [ "$nginx_health" = "200" ] && [ "$backend_proxy_health" = "200" ] && [ "$frontend_health" = "200" ]; then
    echo -e "${GREEN}🎉 System is healthy and operational${NC}"
    echo ""
    echo "Next steps:"
    echo "• Monitor logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "• View metrics: docker stats"
    echo "• Test application functionality"
else
    echo -e "${RED}🚨 System has issues that need attention${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "• Check service logs: docker-compose -f $COMPOSE_FILE logs"
    echo "• Restart services: docker-compose -f $COMPOSE_FILE restart"
    echo "• Review configuration files"
    echo "• Consult troubleshooting guide: docs/TROUBLESHOOTING.md"
fi

echo ""
echo "For detailed troubleshooting, see: docs/TROUBLESHOOTING.md"
echo "Health check completed at $(date)"