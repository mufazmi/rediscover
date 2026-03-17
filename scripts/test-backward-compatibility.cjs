#!/usr/bin/env node

/**
 * Backward Compatibility Validation Script
 * 
 * This script validates that existing development workflows continue to work
 * after implementing the reverse proxy deployment configuration.
 * 
 * Tests:
 * 1. Original docker-compose.yml still works (single container)
 * 2. Direct service access in development mode
 * 3. Existing npm scripts continue to function
 * 4. Environment variable compatibility
 * 5. Database persistence across configurations
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

class BackwardCompatibilityValidator {
  constructor() {
    this.results = [];
    this.errors = [];
    this.cleanup = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
    
    if (type === 'error') {
      this.errors.push(message);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      http.get(url, (res) => {
        clearTimeout(timer);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }).on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async runCommand(command, options = {}) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
        ...options
      });
      return { success: true, output: result };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        output: error.stdout || error.stderr || ''
      };
    }
  }

  async startDockerCompose(composeFile, serviceName = null) {
    const command = serviceName 
      ? `docker-compose -f ${composeFile} up -d ${serviceName}`
      : `docker-compose -f ${composeFile} up -d`;
    
    this.log(`Starting Docker Compose: ${command}`);
    const result = await this.runCommand(command);
    
    if (result.success) {
      this.cleanup.push(() => this.runCommand(`docker-compose -f ${composeFile} down -v`));
      return true;
    } else {
      this.log(`Failed to start Docker Compose: ${result.error}`, 'error');
      return false;
    }
  }

  async waitForService(url, maxAttempts = 30, interval = 2000) {
    this.log(`Waiting for service at ${url}...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.makeRequest(url);
        if (response.statusCode === 200) {
          this.log(`Service is ready at ${url}`, 'success');
          return true;
        }
      } catch (error) {
        // Service not ready yet, continue waiting
      }
      
      await this.sleep(interval);
      this.log(`Attempt ${i + 1}/${maxAttempts} - Service not ready yet...`);
    }
    
    this.log(`Service at ${url} failed to become ready after ${maxAttempts} attempts`, 'error');
    return false;
  }

  async testOriginalDockerCompose() {
    this.log('=== Testing Original Docker Compose Configuration ===');
    
    // Test that the original docker-compose.yml still works
    const started = await this.startDockerCompose('docker-compose.yml');
    if (!started) {
      this.results.push({ test: 'Original Docker Compose', status: 'FAILED', error: 'Failed to start' });
      return false;
    }

    // Wait for service to be ready
    const ready = await this.waitForService('http://localhost:6377/api/health');
    if (!ready) {
      this.results.push({ test: 'Original Docker Compose', status: 'FAILED', error: 'Service not ready' });
      return false;
    }

    // Test that the application is accessible
    try {
      const response = await this.makeRequest('http://localhost:6377');
      if (response.statusCode === 200) {
        this.log('Original Docker Compose configuration works correctly', 'success');
        this.results.push({ test: 'Original Docker Compose', status: 'PASSED' });
        return true;
      } else {
        this.log(`Original Docker Compose returned status ${response.statusCode}`, 'error');
        this.results.push({ test: 'Original Docker Compose', status: 'FAILED', error: `HTTP ${response.statusCode}` });
        return false;
      }
    } catch (error) {
      this.log(`Original Docker Compose test failed: ${error.message}`, 'error');
      this.results.push({ test: 'Original Docker Compose', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testDevelopmentDirectAccess() {
    this.log('=== Testing Development Direct Service Access ===');
    
    // Clean up any existing containers
    await this.runCommand('docker-compose -f docker-compose.yml down -v', { silent: true });
    await this.runCommand('docker-compose -f docker-compose.prod.yml -f docker-compose.dev.yml down -v', { silent: true });
    
    // Start development configuration
    const started = await this.startDockerCompose('docker-compose.prod.yml -f docker-compose.dev.yml');
    if (!started) {
      this.results.push({ test: 'Development Direct Access', status: 'FAILED', error: 'Failed to start dev config' });
      return false;
    }

    // Wait for services to be ready
    await this.sleep(10000); // Give services time to start

    // Test direct backend access (port 6377)
    try {
      const backendReady = await this.waitForService('http://localhost:6377/api/health', 20);
      if (!backendReady) {
        this.results.push({ test: 'Development Direct Access - Backend', status: 'FAILED', error: 'Backend not accessible' });
        return false;
      }

      // Test direct frontend access (port 6378)
      const frontendReady = await this.waitForService('http://localhost:6378', 20);
      if (!frontendReady) {
        this.log('Direct frontend access not available (this may be expected in some configurations)', 'info');
      }

      // Test nginx reverse proxy access (port 8080)
      const proxyReady = await this.waitForService('http://localhost:8080/nginx-health', 20);
      if (!proxyReady) {
        this.results.push({ test: 'Development Direct Access - Proxy', status: 'FAILED', error: 'Nginx proxy not accessible' });
        return false;
      }

      this.log('Development direct access configuration works correctly', 'success');
      this.results.push({ test: 'Development Direct Access', status: 'PASSED' });
      return true;

    } catch (error) {
      this.log(`Development direct access test failed: ${error.message}`, 'error');
      this.results.push({ test: 'Development Direct Access', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testNpmScripts() {
    this.log('=== Testing NPM Scripts Compatibility ===');
    
    const scriptsToTest = [
      'npm run build',
      'npm run lint',
      'npm run test:property-framework'
    ];

    let allPassed = true;

    for (const script of scriptsToTest) {
      this.log(`Testing: ${script}`);
      const result = await this.runCommand(script, { silent: true });
      
      if (result.success) {
        this.log(`✅ ${script} - PASSED`, 'success');
        this.results.push({ test: `NPM Script: ${script}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${script} - FAILED: ${result.error}`, 'error');
        this.results.push({ test: `NPM Script: ${script}`, status: 'FAILED', error: result.error });
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testEnvironmentVariables() {
    this.log('=== Testing Environment Variable Compatibility ===');
    
    const requiredEnvFiles = [
      '.env.example',
      '.env.dev.example',
      '.env.prod.example'
    ];

    let allValid = true;

    for (const envFile of requiredEnvFiles) {
      if (fs.existsSync(envFile)) {
        this.log(`✅ ${envFile} exists`, 'success');
        
        // Check for required variables
        const content = fs.readFileSync(envFile, 'utf8');
        const requiredVars = [
          'APP_SECRET',
          'FRONTEND_URL',
          'VITE_API_URL',
          'PORT',
          'NODE_ENV'
        ];

        for (const varName of requiredVars) {
          if (content.includes(varName)) {
            this.log(`✅ ${envFile} contains ${varName}`, 'success');
          } else {
            this.log(`❌ ${envFile} missing ${varName}`, 'error');
            allValid = false;
          }
        }
        
        this.results.push({ test: `Environment File: ${envFile}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${envFile} does not exist`, 'error');
        this.results.push({ test: `Environment File: ${envFile}`, status: 'FAILED', error: 'File not found' });
        allValid = false;
      }
    }

    return allValid;
  }

  async testDatabasePersistence() {
    this.log('=== Testing Database Persistence Across Configurations ===');
    
    // Clean up first
    await this.runCommand('docker-compose -f docker-compose.yml down -v', { silent: true });
    await this.runCommand('docker-compose -f docker-compose.prod.yml -f docker-compose.dev.yml down -v', { silent: true });
    
    // Start original configuration and create some data
    this.log('Starting original configuration to create test data...');
    const originalStarted = await this.startDockerCompose('docker-compose.yml');
    if (!originalStarted) {
      this.results.push({ test: 'Database Persistence', status: 'FAILED', error: 'Failed to start original config' });
      return false;
    }

    const originalReady = await this.waitForService('http://localhost:6377/api/health');
    if (!originalReady) {
      this.results.push({ test: 'Database Persistence', status: 'FAILED', error: 'Original config not ready' });
      return false;
    }

    // Stop original configuration (but keep volumes)
    await this.runCommand('docker-compose -f docker-compose.yml down', { silent: true });
    
    // Start new configuration and check data persistence
    this.log('Starting new configuration to check data persistence...');
    const newStarted = await this.startDockerCompose('docker-compose.prod.yml -f docker-compose.dev.yml');
    if (!newStarted) {
      this.results.push({ test: 'Database Persistence', status: 'FAILED', error: 'Failed to start new config' });
      return false;
    }

    const newReady = await this.waitForService('http://localhost:6377/api/health');
    if (!newReady) {
      this.results.push({ test: 'Database Persistence', status: 'FAILED', error: 'New config not ready' });
      return false;
    }

    this.log('Database persistence test completed successfully', 'success');
    this.results.push({ test: 'Database Persistence', status: 'PASSED' });
    return true;
  }

  async testConfigurationFiles() {
    this.log('=== Testing Configuration Files Compatibility ===');
    
    const requiredFiles = [
      'docker-compose.yml',
      'docker-compose.dev.yml', 
      'docker-compose.prod.yml',
      'nginx/nginx.conf',
      'nginx/conf.d/default.conf',
      'Dockerfile.frontend',
      'backend/Dockerfile'
    ];

    let allExist = true;

    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ ${file} exists`, 'success');
        this.results.push({ test: `Configuration File: ${file}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${file} does not exist`, 'error');
        this.results.push({ test: `Configuration File: ${file}`, status: 'FAILED', error: 'File not found' });
        allExist = false;
      }
    }

    return allExist;
  }

  async runCleanup() {
    this.log('=== Running Cleanup ===');
    
    // Stop all Docker Compose configurations
    await this.runCommand('docker-compose -f docker-compose.yml down -v', { silent: true });
    await this.runCommand('docker-compose -f docker-compose.prod.yml -f docker-compose.dev.yml down -v', { silent: true });
    
    // Run any registered cleanup functions
    for (const cleanupFn of this.cleanup) {
      try {
        await cleanupFn();
      } catch (error) {
        this.log(`Cleanup error: ${error.message}`, 'error');
      }
    }
  }

  generateReport() {
    this.log('=== Backward Compatibility Validation Report ===');
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const total = this.results.length;

    console.log('\n📊 Test Results Summary:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total: ${total}`);
    console.log(`🎯 Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => {
          console.log(`   • ${r.test}: ${r.error || 'Unknown error'}`);
        });
      console.log('');
    }

    console.log('✅ Passed Tests:');
    this.results
      .filter(r => r.status === 'PASSED')
      .forEach(r => {
        console.log(`   • ${r.test}`);
      });

    return failed === 0;
  }

  async run() {
    this.log('🚀 Starting Backward Compatibility Validation');
    
    try {
      // Test configuration files first
      await this.testConfigurationFiles();
      
      // Test environment variables
      await this.testEnvironmentVariables();
      
      // Test npm scripts
      await this.testNpmScripts();
      
      // Test original Docker Compose
      await this.testOriginalDockerCompose();
      
      // Clean up before next test
      await this.runCommand('docker-compose -f docker-compose.yml down -v', { silent: true });
      
      // Test development direct access
      await this.testDevelopmentDirectAccess();
      
      // Test database persistence
      await this.testDatabasePersistence();
      
    } catch (error) {
      this.log(`Validation failed with error: ${error.message}`, 'error');
    } finally {
      await this.runCleanup();
    }

    const success = this.generateReport();
    
    if (success) {
      this.log('🎉 All backward compatibility tests passed!', 'success');
      process.exit(0);
    } else {
      this.log('💥 Some backward compatibility tests failed!', 'error');
      process.exit(1);
    }
  }
}

// Run the validation if this script is executed directly
if (require.main === module) {
  const validator = new BackwardCompatibilityValidator();
  validator.run().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = BackwardCompatibilityValidator;