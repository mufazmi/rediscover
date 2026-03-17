#!/bin/bash

# Network Connectivity Diagnosis Script
# Tests network connectivity between services and external endpoints

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
HTTPS_PORT=${NGINX_HTTPS_PORT:-443}
BACKEND_PORT=${PORT:-6377}

echo -e "${BLUE}🌐 Network Connectivity Diagnosis${NC}"
echo "=================================="
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

# Function to test HTTP endpoint
test_http_endpoint() {
    local url=$1
    local description=$2
    local expected_code=${3:-200}
    
    local response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$url" 2>/dev/null || echo "000:0")
    local status_code=$(echo "$response" | cut -d: -f1)
    local response_time=$(echo "$response" | cut -d: -f2)
    
    if [ "$status_code" = "$expected_code" ]; then
        print_status "OK" "$description ($status_code, ${response_time}s)"
        return 0
    else
        print_status "ERROR" "$description (got $status_code, expected $expected_code)"
        return 1
    fi
}

# Function to test TCP connectivity
test_tcp_connection() {
    local host=$1
    local port=$2
    local description=$3
    
    if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        print_status "OK" "$description (TCP $host:$port)"
        return 0
    else
        print_status "ERROR" "$description (TCP $host:$port unreachable)"
        return 1
    fi
}

# Check if services are running
echo -e "${BLUE}📋 Service Status Check${NC}"
if ! docker-compose -f "$COMPOSE_FILE" ps >/dev/null 2>&1; then
    print_status "ERROR" "Cannot access Docker Compose services"
    echo "Make sure services are running: docker-compose -f $COMPOSE_FILE up -d"
    exit 1
fi

# Get service status
nginx_running=$(docker-compose -f "$COMPOSE_FILE" ps nginx 2>/dev/null | grep -c "Up" || echo "0")
backend_running=$(docker-compose -f "$COMPOSE_FILE" ps backend 2>/dev/null | grep -c "Up" || echo "0")
frontend_running=$(docker-compose -f "$COMPOSE_FILE" ps frontend 2>/dev/null | grep -c "Up" || echo "0")

if [ "$nginx_running" -eq 1 ]; then
    print_status "OK" "Nginx service is running"
else
    print_status "ERROR" "Nginx service is not running"
fi

if [ "$backend_running" -eq 1 ]; then
    print_status "OK" "Backend service is running"
else
    print_status "ERROR" "Backend service is not running"
fi

if [ "$frontend_running" -eq 1 ]; then
    print_status "OK" "Frontend service is running"
else
    print_status "ERROR" "Frontend service is not running"
fi

# Test external connectivity
echo -e "\n${BLUE}🌍 External Connectivity Tests${NC}"

# Test internet connectivity
if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
    print_status "OK" "Internet connectivity (ping 8.8.8.8)"
else
    print_status "ERROR" "No internet connectivity"
fi

# Test DNS resolution
if nslookup google.com >/dev/null 2>&1; then
    print_status "OK" "DNS resolution working"
else
    print_status "ERROR" "DNS resolution failed"
fi

# Test local port bindings
echo -e "\n${BLUE}🔌 Port Binding Tests${NC}"

# Check if nginx ports are bound
if netstat -tlnp 2>/dev/null | grep -q ":$NGINX_PORT "; then
    print_status "OK" "Nginx HTTP port $NGINX_PORT is bound"
else
    print_status "ERROR" "Nginx HTTP port $NGINX_PORT is not bound"
fi

if netstat -tlnp 2>/dev/null | grep -q ":$HTTPS_PORT "; then
    print_status "OK" "Nginx HTTPS port $HTTPS_PORT is bound"
else
    print_status "WARN" "Nginx HTTPS port $HTTPS_PORT is not bound (SSL may not be configured)"
fi

# Check if backend port is exposed (should not be in production)
if netstat -tlnp 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    print_status "WARN" "Backend port $BACKEND_PORT is exposed (consider removing for security)"
else
    print_status "OK" "Backend port $BACKEND_PORT is not exposed (good for security)"
fi

# Test Docker network connectivity
echo -e "\n${BLUE}🐳 Docker Network Tests${NC}"

# Check if Docker network exists
if docker network ls | grep -q "rediscover"; then
    print_status "OK" "Docker network exists"
    
    # Get network details
    network_name=$(docker network ls | grep "rediscover" | awk '{print $2}' | head -1)
    echo "  Network: $network_name"
    
    # Test inter-service connectivity
    if [ "$nginx_running" -eq 1 ] && [ "$backend_running" -eq 1 ]; then
        echo -e "\n${BLUE}🔗 Inter-Service Connectivity${NC}"
        
        # Test nginx -> backend connectivity
        if docker exec rediscover-nginx ping -c 1 backend >/dev/null 2>&1; then
            print_status "OK" "Nginx can ping backend"
        else
            print_status "ERROR" "Nginx cannot ping backend"
        fi
        
        # Test nginx -> backend HTTP connectivity
        if docker exec rediscover-nginx wget -q --spider http://backend:6377/api/health 2>/dev/null; then
            print_status "OK" "Nginx can reach backend HTTP endpoint"
        else
            print_status "ERROR" "Nginx cannot reach backend HTTP endpoint"
        fi
        
        # Test backend -> nginx connectivity (reverse test)
        if docker exec rediscover-backend ping -c 1 nginx >/dev/null 2>&1; then
            print_status "OK" "Backend can ping nginx"
        else
            print_status "ERROR" "Backend cannot ping nginx"
        fi
    fi
    
    if [ "$nginx_running" -eq 1 ] && [ "$frontend_running" -eq 1 ]; then
        # Test nginx -> frontend connectivity
        if docker exec rediscover-nginx ping -c 1 frontend >/dev/null 2>&1; then
            print_status "OK" "Nginx can ping frontend"
        else
            print_status "ERROR" "Nginx cannot ping frontend"
        fi
    fi
    
else
    print_status "ERROR" "Docker network not found"
fi

# Test HTTP endpoints
echo -e "\n${BLUE}🌐 HTTP Endpoint Tests${NC}"

# Test nginx health endpoint
test_http_endpoint "http://localhost:$NGINX_PORT/nginx-health" "Nginx health endpoint"

# Test backend health through proxy
test_http_endpoint "http://localhost:$NGINX_PORT/api/health" "Backend health through proxy"

# Test frontend serving
test_http_endpoint "http://localhost:$NGINX_PORT/" "Frontend serving"

# Test API endpoint through proxy
test_http_endpoint "http://localhost:$NGINX_PORT/api/health" "API endpoint through proxy"

# Test static asset serving
test_http_endpoint "http://localhost:$NGINX_PORT/favicon.ico" "Static asset serving" "200"

# Test 404 handling
test_http_endpoint "http://localhost:$NGINX_PORT/nonexistent-page" "404 handling" "404"

# Test HTTPS if configured
if [ -f "nginx/ssl/cert.pem" ] && [ -f "nginx/ssl/key.pem" ]; then
    echo -e "\n${BLUE}🔒 HTTPS Connectivity Tests${NC}"
    
    # Test HTTPS endpoint
    if netstat -tlnp 2>/dev/null | grep -q ":$HTTPS_PORT "; then
        test_http_endpoint "https://localhost:$HTTPS_PORT/nginx-health" "HTTPS nginx health endpoint"
        
        # Test HTTP to HTTPS redirect
        redirect_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$NGINX_PORT/" 2>/dev/null || echo "000")
        if [ "$redirect_response" = "301" ] || [ "$redirect_response" = "302" ]; then
            print_status "OK" "HTTP to HTTPS redirect working ($redirect_response)"
        else
            print_status "WARN" "HTTP to HTTPS redirect not configured (got $redirect_response)"
        fi
    else
        print_status "WARN" "HTTPS port not bound - SSL may not be configured"
    fi
fi

# Test WebSocket connectivity
echo -e "\n${BLUE}🔌 WebSocket Connectivity Tests${NC}"

# Test WebSocket endpoint availability
websocket_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$NGINX_PORT/socket.io/" 2>/dev/null || echo "000")
if [ "$websocket_response" = "200" ] || [ "$websocket_response" = "400" ]; then
    print_status "OK" "WebSocket endpoint accessible ($websocket_response)"
else
    print_status "ERROR" "WebSocket endpoint not accessible ($websocket_response)"
fi

# Test WebSocket upgrade headers
websocket_upgrade=$(curl -s -I -H "Connection: Upgrade" -H "Upgrade: websocket" "http://localhost:$NGINX_PORT/socket.io/" 2>/dev/null | grep -i "upgrade" || echo "")
if [ -n "$websocket_upgrade" ]; then
    print_status "OK" "WebSocket upgrade headers supported"
else
    print_status "WARN" "WebSocket upgrade headers may not be properly configured"
fi

# Performance tests
echo -e "\n${BLUE}⚡ Performance Tests${NC}"

# Test response times
echo "Response time tests:"
for endpoint in "/nginx-health" "/api/health" "/"; do
    response_time=$(curl -s -o /dev/null -w "%{time_total}" "http://localhost:$NGINX_PORT$endpoint" 2>/dev/null || echo "0")
    response_time_ms=$(echo "$response_time * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
    
    if [ "$response_time_ms" -lt 100 ]; then
        print_status "OK" "$endpoint: ${response_time_ms}ms (excellent)"
    elif [ "$response_time_ms" -lt 500 ]; then
        print_status "OK" "$endpoint: ${response_time_ms}ms (good)"
    elif [ "$response_time_ms" -lt 2000 ]; then
        print_status "WARN" "$endpoint: ${response_time_ms}ms (slow)"
    else
        print_status "ERROR" "$endpoint: ${response_time_ms}ms (very slow)"
    fi
done

# Test concurrent connections
echo -e "\n${BLUE}🔄 Concurrent Connection Tests${NC}"

# Simple concurrent request test
concurrent_test() {
    local url="http://localhost:$NGINX_PORT/nginx-health"
    local concurrent_requests=5
    
    echo "Testing $concurrent_requests concurrent requests..."
    
    # Run concurrent requests
    for i in $(seq 1 $concurrent_requests); do
        curl -s -o /dev/null "$url" &
    done
    
    # Wait for all requests to complete
    wait
    
    # Test if service is still responsive
    if test_http_endpoint "$url" "Service after concurrent requests" >/dev/null 2>&1; then
        print_status "OK" "Service handles concurrent requests well"
    else
        print_status "ERROR" "Service may have issues with concurrent requests"
    fi
}

concurrent_test

# Firewall and security tests
echo -e "\n${BLUE}🛡️  Security and Firewall Tests${NC}"

# Check if firewall is active
if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -q "Status: active"; then
        print_status "OK" "UFW firewall is active"
        
        # Check if required ports are allowed
        if ufw status | grep -q "$NGINX_PORT"; then
            print_status "OK" "HTTP port $NGINX_PORT is allowed in firewall"
        else
            print_status "WARN" "HTTP port $NGINX_PORT may not be allowed in firewall"
        fi
        
        if ufw status | grep -q "$HTTPS_PORT"; then
            print_status "OK" "HTTPS port $HTTPS_PORT is allowed in firewall"
        else
            print_status "WARN" "HTTPS port $HTTPS_PORT may not be allowed in firewall"
        fi
    else
        print_status "WARN" "UFW firewall is not active"
    fi
elif command -v iptables >/dev/null 2>&1; then
    if iptables -L | grep -q "ACCEPT.*dpt:http"; then
        print_status "OK" "HTTP traffic allowed in iptables"
    else
        print_status "WARN" "HTTP traffic may not be allowed in iptables"
    fi
else
    print_status "WARN" "Cannot determine firewall status"
fi

# Summary and recommendations
echo -e "\n${BLUE}📋 Connectivity Diagnosis Summary${NC}"
echo "=================================="

echo "Diagnosis completed at $(date)"
echo ""

# Count successful tests (this is a simplified approach)
if [ "$nginx_running" -eq 1 ] && [ "$backend_running" -eq 1 ] && [ "$frontend_running" -eq 1 ]; then
    echo -e "${GREEN}🎉 All core services are running${NC}"
else
    echo -e "${RED}🚨 Some core services are not running${NC}"
fi

echo ""
echo "Recommendations:"
echo "• Monitor network connectivity regularly"
echo "• Set up proper firewall rules for production"
echo "• Consider implementing rate limiting for security"
echo "• Monitor response times and set up alerts for performance degradation"
echo "• Test connectivity after any network or configuration changes"

echo ""
echo "For detailed troubleshooting, see: docs/TROUBLESHOOTING.md"
echo "For performance optimization, see: docs/DEPLOYMENT.md"