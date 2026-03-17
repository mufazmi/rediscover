# Deployment Testing Guide

This guide explains how to use the comprehensive deployment test suite to validate your reverse proxy deployment configuration.

## Overview

The deployment test suite validates the entire reverse proxy setup in both production and development configurations. It tests all services, validates end-to-end functionality, and ensures proper communication between components.

## Test Suite Components

### 1. Configuration Validation
- Validates all required configuration files exist
- Checks Docker Compose file syntax
- Verifies nginx configuration structure

### 2. Environment Testing
Tests both production and development environments:
- **Production Environment**: Uses `docker-compose.prod.yml`
- **Development Environment**: Uses `docker-compose.dev.yml`

### 3. Functional Testing
- Service health checks
- API request proxying
- Static file serving
- Security headers
- Error handling
- Performance testing
- Concurrent request handling

### 4. Integration Testing
- Environment isolation
- Cross-service communication
- Resource cleanup

## Running the Tests

### Quick Start

```bash
# Linux/macOS
./scripts/test-deployment.sh

# Windows PowerShell
.\scripts\test-deployment.ps1

# Direct Node.js execution
node scripts/test-deployment.cjs
```

### Prerequisites

Before running the tests, ensure you have:

1. **Docker and Docker Compose** installed and running
2. **Node.js** (version 18 or higher)
3. All required configuration files present:
   - `docker-compose.prod.yml`
   - `docker-compose.dev.yml`
   - `nginx/nginx.conf`
   - `nginx/conf.d/default.conf`
   - `Dockerfile.frontend`

### Test Execution Flow

1. **Prerequisites Check**: Validates Docker, Node.js, and required files
2. **Configuration Validation**: Checks all config files are valid
3. **Production Environment Test**: Full test suite on production config
4. **Development Environment Test**: Full test suite on development config
5. **Integration Tests**: Cross-environment and isolation tests
6. **Cleanup Tests**: Validates proper resource cleanup
7. **Results Summary**: Comprehensive report with recommendations

## Test Categories

### Health Check Tests
- Nginx health endpoint (`/nginx-health`)
- Backend health through proxy (`/api/health`)
- Frontend serving (`/`)

### API Proxying Tests
- API endpoint accessibility (`/api/*`)
- Request path preservation
- Proxy header forwarding
- Error response handling

### Static File Tests
- Root path serving (`/`)
- Asset file serving
- Content type validation
- Cache header verification

### Security Tests
- Security header presence
- Port exposure validation (production)
- Direct service access (development)

### Performance Tests
- Response time validation
- Concurrent request handling
- Resource usage monitoring

### Error Handling Tests
- 404 error responses
- Invalid path handling
- Service unavailability scenarios

## Test Configuration

The test suite uses isolated Docker environments to avoid conflicts:

```javascript
const TEST_CONFIG = {
  environments: {
    production: {
      nginxPort: 8080,  // Different from production port 80
      timeout: 120000
    },
    development: {
      nginxPort: 8081,  // Different from dev port 8080
      frontendPort: 6378,
      backendPort: 6377,
      timeout: 180000
    }
  }
};
```

## Understanding Test Results

### Success Indicators
- ✅ **Green checkmarks**: Tests passed successfully
- ⚠️ **Yellow warnings**: Non-critical issues that should be addressed
- ❌ **Red errors**: Critical failures that must be fixed

### Result Categories

**Passed Tests**: Core functionality works correctly
**Warnings**: Issues that don't prevent deployment but should be addressed
**Failed Tests**: Critical issues that must be resolved before deployment

### Sample Output

```
🚀 Reverse Proxy Deployment Test Suite
=====================================

📋 Configuration Validation
===========================
✅ docker-compose.prod.yml exists
✅ docker-compose.dev.yml exists
✅ nginx/nginx.conf exists
✅ docker-compose.prod.yml is valid

🧪 Testing PRODUCTION Environment
=================================
ℹ️  Starting production environment...
✅ All services are running
✅ Services are healthy and responding
✅ Nginx health endpoint (200, 45ms)
✅ Backend health through proxy (200, 123ms)
✅ Frontend serving (200, 89ms)

📊 Test Results Summary
======================
Test duration: 45.2 seconds

Overall Results:
✅ Passed: 28
⚠️  Warnings: 3
❌ Failed: 0

Environment Results:
Production: 14 passed, 1 warnings, 0 failed
Development: 12 passed, 2 warnings, 0 failed

💡 Recommendations
==================
🎉 All critical tests passed! The deployment is ready.
```

## Troubleshooting

### Common Issues

#### Docker Issues
```
❌ Docker daemon is not running
```
**Solution**: Start Docker Desktop or Docker daemon

#### Port Conflicts
```
❌ Port 8080 is already in use
```
**Solution**: Stop conflicting services or modify test ports in the script

#### Configuration Errors
```
❌ docker-compose.prod.yml validation failed
```
**Solution**: Check Docker Compose file syntax with `docker-compose config`

#### Service Startup Failures
```
❌ Services did not become healthy within 60000ms
```
**Solutions**:
- Check Docker logs: `docker-compose logs`
- Verify system resources (CPU, memory)
- Check for port conflicts
- Validate configuration files

### Debug Mode

For detailed debugging, check the logs:

```bash
# View test execution with verbose output
node scripts/test-deployment.cjs 2>&1 | tee deployment-test.log

# Check Docker Compose logs during test
docker-compose -f docker-compose.prod.yml logs -f
```

### Manual Cleanup

If tests fail to cleanup properly:

```bash
# Stop all test containers
docker ps -a --filter "name=deployment-test" -q | xargs docker rm -f

# Remove test networks
docker network prune -f

# Remove test volumes
docker volume prune -f
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Deployment Tests

on: [push, pull_request]

jobs:
  deployment-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Run deployment tests
        run: |
          chmod +x scripts/test-deployment.sh
          ./scripts/test-deployment.sh
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any
    stages {
        stage('Deployment Test') {
            steps {
                sh 'chmod +x scripts/test-deployment.sh'
                sh './scripts/test-deployment.sh'
            }
        }
    }
    post {
        always {
            sh 'docker system prune -f'
        }
    }
}
```

## Test Customization

### Adding Custom Tests

To add custom tests, modify `scripts/test-deployment.cjs`:

```javascript
// Add to runEnvironmentTests method
async runCustomTests(env, baseUrl) {
  this.info('Running custom tests...');
  
  // Your custom test logic here
  const response = await this.makeHttpRequest(`${baseUrl}/custom-endpoint`);
  
  if (response.status === 200) {
    this.success('Custom test passed');
    return { passed: 1, failed: 0, warnings: 0 };
  } else {
    this.error('Custom test failed');
    return { passed: 0, failed: 1, warnings: 0 };
  }
}
```

### Environment Variables

Customize test behavior with environment variables:

```bash
# Custom test ports
export NGINX_TEST_PORT=9080
export BACKEND_TEST_PORT=9377

# Test timeouts
export TEST_TIMEOUT=180000
export HEALTH_CHECK_TIMEOUT=90000

# Run tests
./scripts/test-deployment.sh
```

## Best Practices

### Before Deployment
1. Run the full test suite: `./scripts/test-deployment.sh`
2. Address all failed tests and warnings
3. Verify SSL configuration if using HTTPS
4. Test with production-like data volumes

### During Development
1. Run tests after configuration changes
2. Use development environment tests for rapid iteration
3. Monitor test performance for regression detection

### In Production
1. Run health checks regularly: `scripts/health-check.sh`
2. Monitor logs: `scripts/analyze-logs.sh`
3. Use deployment tests before updates

## Integration with Other Tools

### Property-Based Testing
The deployment tests complement the property-based testing framework:

```bash
# Run property-based tests
npm test src/test/property-based

# Run deployment tests
./scripts/test-deployment.sh

# Run both
npm test && ./scripts/test-deployment.sh
```

### Monitoring Integration
Integrate with monitoring tools:

```bash
# Export test results for monitoring
node scripts/test-deployment.cjs --json > deployment-test-results.json

# Send to monitoring system
curl -X POST monitoring-endpoint -d @deployment-test-results.json
```

## Support

For issues with the deployment test suite:

1. Check this documentation
2. Review `docs/TROUBLESHOOTING.md`
3. Check Docker and service logs
4. Verify configuration files
5. Ensure all prerequisites are met

The deployment test suite is designed to catch issues early and ensure reliable deployments. Regular testing helps maintain system reliability and catch regressions before they reach production.