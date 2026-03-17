#!/bin/bash

# Log Analysis Script
# Analyzes logs from all services to identify issues and patterns

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
LOG_LINES=${1:-500}  # Number of log lines to analyze (default: 500)

echo -e "${BLUE}📊 Rediscover Log Analysis${NC}"
echo "=========================="
echo "Analyzing last $LOG_LINES log lines"
echo "Timestamp: $(date)"
echo ""

# Function to print section header
print_header() {
    echo -e "\n${BLUE}$1${NC}"
    echo "$(echo "$1" | sed 's/./=/g')"
}

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

# Check if services are running
if ! docker-compose -f "$COMPOSE_FILE" ps >/dev/null 2>&1; then
    print_status "ERROR" "Cannot access Docker Compose services"
    echo "Make sure services are running: docker-compose -f $COMPOSE_FILE up -d"
    exit 1
fi

# Analyze recent errors across all services
print_header "🚨 Recent Errors and Exceptions"
error_logs=$(docker-compose -f "$COMPOSE_FILE" logs --tail="$LOG_LINES" 2>/dev/null | grep -i "error\|exception\|fail\|fatal" | tail -20)

if [ -n "$error_logs" ]; then
    echo "$error_logs"
    error_count=$(echo "$error_logs" | wc -l)
    print_status "WARN" "Found $error_count recent error entries"
else
    print_status "OK" "No recent errors found"
fi

# Analyze nginx access logs
print_header "📈 Nginx Access Log Analysis"
if docker exec rediscover-nginx test -f /var/log/nginx/access.log 2>/dev/null; then
    echo "Status Code Distribution (last 1000 requests):"
    docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $9}' | sort | uniq -c | sort -nr | head -10 | \
        while read count code; do
            if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
                echo -e "  ${GREEN}$code: $count requests${NC}"
            elif [[ "$code" =~ ^3[0-9][0-9]$ ]]; then
                echo -e "  ${YELLOW}$code: $count requests${NC}"
            elif [[ "$code" =~ ^[45][0-9][0-9]$ ]]; then
                echo -e "  ${RED}$code: $count requests${NC}"
            else
                echo "  $code: $count requests"
            fi
        done
    
    echo ""
    echo "Top Client IPs (last 1000 requests):"
    docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $1}' | sort | uniq -c | sort -nr | head -5 | \
        while read count ip; do
            echo "  $ip: $count requests"
        done
    
    echo ""
    echo "Most Requested Paths (last 1000 requests):"
    docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $7}' | sort | uniq -c | sort -nr | head -10 | \
        while read count path; do
            echo "  $path: $count requests"
        done
    
    # Check for suspicious activity
    echo ""
    echo "Potential Issues:"
    
    # High error rates
    error_4xx=$(docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | awk '$9 ~ /^4[0-9][0-9]$/ {count++} END {print count+0}')
    error_5xx=$(docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | awk '$9 ~ /^5[0-9][0-9]$/ {count++} END {print count+0}')
    
    if [ "$error_4xx" -gt 50 ]; then
        print_status "WARN" "High 4xx error rate: $error_4xx/1000 requests"
    fi
    
    if [ "$error_5xx" -gt 10 ]; then
        print_status "ERROR" "High 5xx error rate: $error_5xx/1000 requests"
    fi
    
    if [ "$error_4xx" -le 50 ] && [ "$error_5xx" -le 10 ]; then
        print_status "OK" "Error rates are within normal range"
    fi
    
else
    print_status "WARN" "Nginx access log not accessible"
fi

# Analyze nginx error logs
print_header "🔍 Nginx Error Log Analysis"
if docker exec rediscover-nginx test -f /var/log/nginx/error.log 2>/dev/null; then
    recent_errors=$(docker exec rediscover-nginx tail -100 /var/log/nginx/error.log 2>/dev/null | tail -10)
    
    if [ -n "$recent_errors" ]; then
        echo "Recent nginx errors:"
        echo "$recent_errors"
        
        # Categorize common errors
        upstream_errors=$(echo "$recent_errors" | grep -c "upstream" || echo "0")
        ssl_errors=$(echo "$recent_errors" | grep -c "SSL" || echo "0")
        timeout_errors=$(echo "$recent_errors" | grep -c "timeout" || echo "0")
        
        if [ "$upstream_errors" -gt 0 ]; then
            print_status "WARN" "Found $upstream_errors upstream connection errors"
        fi
        
        if [ "$ssl_errors" -gt 0 ]; then
            print_status "WARN" "Found $ssl_errors SSL-related errors"
        fi
        
        if [ "$timeout_errors" -gt 0 ]; then
            print_status "WARN" "Found $timeout_errors timeout errors"
        fi
    else
        print_status "OK" "No recent nginx errors"
    fi
else
    print_status "WARN" "Nginx error log not accessible"
fi

# Analyze backend logs
print_header "🖥️  Backend Service Analysis"
backend_logs=$(docker-compose -f "$COMPOSE_FILE" logs backend --tail="$LOG_LINES" 2>/dev/null)

if [ -n "$backend_logs" ]; then
    # Check for startup messages
    if echo "$backend_logs" | grep -q "Server running\|listening\|started"; then
        print_status "OK" "Backend service started successfully"
    else
        print_status "WARN" "No clear backend startup confirmation found"
    fi
    
    # Check for database connections
    if echo "$backend_logs" | grep -q -i "database\|sqlite\|connected"; then
        print_status "OK" "Database connection logs found"
    else
        print_status "WARN" "No database connection logs found"
    fi
    
    # Check for authentication events
    auth_events=$(echo "$backend_logs" | grep -c -i "auth\|login\|token" || echo "0")
    if [ "$auth_events" -gt 0 ]; then
        echo "  Authentication events: $auth_events"
    fi
    
    # Check for API request patterns
    api_requests=$(echo "$backend_logs" | grep -c -i "GET\|POST\|PUT\|DELETE" || echo "0")
    if [ "$api_requests" -gt 0 ]; then
        echo "  API requests logged: $api_requests"
    fi
    
    # Look for performance issues
    slow_queries=$(echo "$backend_logs" | grep -c -i "slow\|timeout\|performance" || echo "0")
    if [ "$slow_queries" -gt 0 ]; then
        print_status "WARN" "Found $slow_queries potential performance issues"
    fi
    
else
    print_status "ERROR" "Cannot access backend logs"
fi

# Analyze frontend logs
print_header "🎨 Frontend Service Analysis"
frontend_logs=$(docker-compose -f "$COMPOSE_FILE" logs frontend --tail="$LOG_LINES" 2>/dev/null)

if [ -n "$frontend_logs" ]; then
    # Check build completion
    if echo "$frontend_logs" | grep -q -i "build\|compiled\|generated"; then
        print_status "OK" "Frontend build process completed"
    else
        print_status "WARN" "No frontend build completion logs found"
    fi
    
    # Check for build errors
    build_errors=$(echo "$frontend_logs" | grep -c -i "error\|failed\|exception" || echo "0")
    if [ "$build_errors" -gt 0 ]; then
        print_status "WARN" "Found $build_errors build-related issues"
        echo "Recent frontend errors:"
        echo "$frontend_logs" | grep -i "error\|failed\|exception" | tail -5
    else
        print_status "OK" "No frontend build errors"
    fi
    
else
    print_status "WARN" "Cannot access frontend logs"
fi

# Check Docker container health
print_header "🐳 Container Health Analysis"
container_stats=$(docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | grep "rediscover-")

if [ -n "$container_stats" ]; then
    echo "$container_stats"
    
    # Check for high resource usage
    high_cpu=$(echo "$container_stats" | awk '{gsub(/%/, "", $2); if ($2 > 80) print $1 ": " $2 "%"}')
    high_mem=$(echo "$container_stats" | awk '{gsub(/%/, "", $4); if ($4 > 80) print $1 ": " $4 "%"}')
    
    if [ -n "$high_cpu" ]; then
        print_status "WARN" "High CPU usage detected:"
        echo "$high_cpu"
    fi
    
    if [ -n "$high_mem" ]; then
        print_status "WARN" "High memory usage detected:"
        echo "$high_mem"
    fi
    
    if [ -z "$high_cpu" ] && [ -z "$high_mem" ]; then
        print_status "OK" "Resource usage is within normal limits"
    fi
else
    print_status "WARN" "Cannot access container statistics"
fi

# Check for restart patterns
print_header "🔄 Container Restart Analysis"
restart_info=$(docker-compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null)

if [ -n "$restart_info" ]; then
    echo "$restart_info"
    
    # Look for recent restarts
    if echo "$restart_info" | grep -q "Restarting\|seconds\|minutes"; then
        print_status "WARN" "Recent container restarts detected"
    else
        print_status "OK" "No recent container restarts"
    fi
fi

# Security analysis
print_header "🔒 Security Event Analysis"
security_events=0

# Check for failed authentication attempts
failed_auth=$(echo "$backend_logs" | grep -c -i "unauthorized\|forbidden\|invalid.*token\|authentication.*failed" || echo "0")
if [ "$failed_auth" -gt 0 ]; then
    print_status "WARN" "Found $failed_auth failed authentication attempts"
    security_events=$((security_events + failed_auth))
fi

# Check for suspicious request patterns
if docker exec rediscover-nginx test -f /var/log/nginx/access.log 2>/dev/null; then
    suspicious_requests=$(docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | \
        grep -c -E "\.\./|<script|SELECT.*FROM|UNION.*SELECT" || echo "0")
    
    if [ "$suspicious_requests" -gt 0 ]; then
        print_status "WARN" "Found $suspicious_requests potentially suspicious requests"
        security_events=$((security_events + suspicious_requests))
    fi
fi

if [ "$security_events" -eq 0 ]; then
    print_status "OK" "No obvious security issues detected"
fi

# Performance analysis
print_header "⚡ Performance Analysis"

# Check response times from nginx logs
if docker exec rediscover-nginx test -f /var/log/nginx/access.log 2>/dev/null; then
    # This is a simplified analysis - in production you'd want more detailed metrics
    large_responses=$(docker exec rediscover-nginx tail -1000 /var/log/nginx/access.log 2>/dev/null | \
        awk '$10 > 1000000 {count++} END {print count+0}')  # Responses > 1MB
    
    if [ "$large_responses" -gt 10 ]; then
        print_status "WARN" "Found $large_responses large responses (>1MB) in recent requests"
    else
        print_status "OK" "Response sizes appear normal"
    fi
fi

# Summary and recommendations
print_header "📋 Analysis Summary and Recommendations"

echo "Log analysis completed for the last $LOG_LINES log entries."
echo ""

# Generate recommendations based on findings
echo "Recommendations:"

if [ "$error_5xx" -gt 10 ]; then
    echo "• Investigate 5xx errors - check backend service health and database connectivity"
fi

if [ "$error_4xx" -gt 50 ]; then
    echo "• Review 4xx errors - may indicate client-side issues or missing resources"
fi

if [ "$security_events" -gt 0 ]; then
    echo "• Review security events - consider implementing rate limiting or additional monitoring"
fi

if [ "$failed_auth" -gt 5 ]; then
    echo "• High authentication failures - consider implementing account lockout policies"
fi

echo "• Monitor logs continuously: docker-compose -f $COMPOSE_FILE logs -f"
echo "• Set up log rotation to prevent disk space issues"
echo "• Consider implementing centralized logging for production environments"
echo "• Review and tune resource limits based on usage patterns"

echo ""
echo "For detailed troubleshooting steps, see: docs/TROUBLESHOOTING.md"
echo "Analysis completed at $(date)"