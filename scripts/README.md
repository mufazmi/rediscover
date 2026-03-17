# Deployment Scripts

This directory contains scripts for testing, validating, and managing the reverse proxy deployment.

## Quick Reference

### Deployment Testing
```bash
# Full deployment test (Linux/macOS)
./scripts/test-deployment.sh

# Full deployment test (Windows)
.\scripts\test-deployment.ps1

# Direct Node.js execution
node scripts/test-deployment.cjs

# Dry run mode (no Docker required)
DRY_RUN=true node scripts/test-deployment.cjs
```

### Health Monitoring
```bash
# Quick health check
./scripts/health-check.sh

# Detailed connectivity diagnosis
./scripts/diagnose-connectivity.sh

# Log analysis
./scripts/analyze-logs.sh
```

### Configuration Validation
```bash
# Validate setup configuration
node scripts/validate-setup.cjs

# Test environment variables
node scripts/test-env-vars.cjs

# Validate volume configuration
node scripts/validate-volume-config.cjs
```

## Script Descriptions

### Core Testing Scripts

- **`test-deployment.cjs`** - Comprehensive deployment test suite
  - Tests both production and development configurations
  - Validates all services and end-to-end functionality
  - Provides detailed reporting and recommendations

- **`test-deployment.sh`** - Bash wrapper for deployment tests
- **`test-deployment.ps1`** - PowerShell wrapper for deployment tests

### Health and Monitoring

- **`health-check.sh`** - Quick health check for all services
- **`diagnose-connectivity.sh`** - Network connectivity diagnosis
- **`analyze-logs.sh`** - Log analysis and issue detection

### Configuration Validation

- **`validate-setup.cjs`** - Validates reverse proxy configuration
- **`test-env-vars.cjs`** - Tests environment variable handling
- **`validate-volume-config.cjs`** - Validates Docker volume configuration

### Specialized Testing

- **`test-proxy-headers.cjs`** - Tests proxy header forwarding
- **`test-api-path-preservation.cjs`** - Tests API path preservation
- **`test-volume-persistence.cjs`** - Tests data persistence
- **`verify-health-endpoint.cjs`** - Verifies health endpoints

## Usage Examples

### Complete Deployment Validation
```bash
# Run all validation steps
node scripts/validate-setup.cjs
./scripts/test-deployment.sh
./scripts/health-check.sh
```

### Development Workflow
```bash
# Quick validation during development
DRY_RUN=true node scripts/test-deployment.cjs
node scripts/validate-setup.cjs
```

### Production Deployment
```bash
# Pre-deployment validation
./scripts/test-deployment.sh
node scripts/validate-setup.cjs

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Post-deployment verification
./scripts/health-check.sh
./scripts/diagnose-connectivity.sh
```

### Troubleshooting
```bash
# Diagnose issues
./scripts/analyze-logs.sh
./scripts/diagnose-connectivity.sh

# Check specific components
node scripts/verify-health-endpoint.cjs
node scripts/test-proxy-headers.cjs
```

## Environment Variables

### Test Configuration
- `DRY_RUN=true` - Run tests without Docker (simulation mode)
- `TEST_TIMEOUT=180000` - Test timeout in milliseconds
- `NGINX_TEST_PORT=8080` - Custom nginx port for testing

### Service Ports
- `NGINX_HTTP_PORT` - Nginx HTTP port (default: 80)
- `NGINX_HTTPS_PORT` - Nginx HTTPS port (default: 443)
- `FRONTEND_DEV_PORT` - Frontend development port (default: 6378)
- `BACKEND_DEV_PORT` - Backend development port (default: 6377)

## Exit Codes

- `0` - Success, all tests passed
- `1` - Failure, critical tests failed
- `2` - Configuration error
- `3` - Docker/environment error

## Integration with CI/CD

### GitHub Actions
```yaml
- name: Run deployment tests
  run: |
    chmod +x scripts/test-deployment.sh
    ./scripts/test-deployment.sh
```

### Jenkins
```groovy
stage('Deployment Test') {
    steps {
        sh './scripts/test-deployment.sh'
    }
}
```

### Docker-based CI
```bash
# Run in container
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd):/workspace -w /workspace \
  node:20-alpine ./scripts/test-deployment.sh
```

## Troubleshooting

### Common Issues

1. **Docker not available**
   - Use dry run mode: `DRY_RUN=true node scripts/test-deployment.cjs`
   - Install Docker and Docker Compose

2. **Port conflicts**
   - Modify test ports in environment variables
   - Stop conflicting services

3. **Permission errors**
   - Make scripts executable: `chmod +x scripts/*.sh`
   - Run with appropriate permissions

4. **Configuration errors**
   - Run validation: `node scripts/validate-setup.cjs`
   - Check Docker Compose syntax: `docker-compose config`

For detailed troubleshooting, see `docs/TROUBLESHOOTING.md` and `docs/DEPLOYMENT_TESTING.md`.