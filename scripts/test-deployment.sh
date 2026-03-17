#!/bin/bash

# Deployment Test Script Wrapper
# Simple wrapper for the comprehensive deployment test script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Reverse Proxy Deployment Test${NC}"
echo "=================================="
echo ""

# Check prerequisites
echo -e "${BLUE}📋 Checking Prerequisites${NC}"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js is available${NC}"

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is available${NC}"

# Check if Docker Compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose is available${NC}"

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker daemon is running${NC}"

# Check required files
echo -e "\n${BLUE}📁 Checking Required Files${NC}"

required_files=(
    "docker-compose.prod.yml"
    "docker-compose.dev.yml"
    "nginx/nginx.conf"
    "nginx/conf.d/default.conf"
    "Dockerfile.frontend"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file is missing${NC}"
        exit 1
    fi
done

echo ""
echo -e "${BLUE}🧪 Running Comprehensive Deployment Tests${NC}"
echo ""

# Run the main test script
node scripts/test-deployment.cjs "$@"