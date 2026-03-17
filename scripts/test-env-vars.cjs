#!/usr/bin/env node

/**
 * Test script to verify Docker Compose environment variable substitution
 * This script validates that all environment variables are properly configured
 * and have appropriate default values.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for output formatting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.bold}=== ${title} ===${colors.reset}`, 'blue');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

/**
 * Test Docker Compose configuration parsing
 */
function testDockerComposeConfig() {
  logSection('Testing Docker Compose Configuration');
  
  try {
    // Test production configuration
    log('Testing production configuration...');
    const prodConfig = execSync('docker-compose -f docker-compose.prod.yml config', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    if (prodConfig.includes('nginx') && prodConfig.includes('frontend') && prodConfig.includes('backend')) {
      logSuccess('Production Docker Compose configuration is valid');
    } else {
      logError('Production Docker Compose configuration is missing required services');
      return false;
    }
    
    // Test development configuration
    log('Testing development configuration...');
    const devConfig = execSync('docker-compose -f docker-compose.prod.yml -f docker-compose.dev.yml config', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    if (devConfig.includes('nginx') && devConfig.includes('frontend') && devConfig.includes('backend')) {
      logSuccess('Development Docker Compose configuration is valid');
    } else {
      logError('Development Docker Compose configuration is missing required services');
      return false;
    }
    
    return true;
  } catch (error) {
    logError(`Docker Compose configuration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test environment variable substitution
 */
function testEnvironmentVariables() {
  logSection('Testing Environment Variable Substitution');
  
  const testCases = [
    {
      name: 'Default values (no .env file)',
      envFile: null,
      expectedValues: {
        'NGINX_HTTP_PORT': '80',
        'NGINX_HTTPS_PORT': '443',
        'NODE_ENV': 'production',
        'PORT': '6377',
        'JWT_EXPIRES_IN': '24h',
        'BCRYPT_ROUNDS': '10'
      }
    },
    {
      name: 'Custom values from .env file',
      envFile: {
        'NGINX_HTTP_PORT': '8080',
        'NODE_ENV': 'development',
        'PORT': '3000',
        'JWT_EXPIRES_IN': '7d',
        'FRONTEND_URL': 'https://example.com'
      },
      expectedValues: {
        'NGINX_HTTP_PORT': '8080',
        'NODE_ENV': 'development',
        'PORT': '3000',
        'JWT_EXPIRES_IN': '7d',
        'FRONTEND_URL': 'https://example.com'
      }
    }
  ];
  
  let allTestsPassed = true;
  
  for (const testCase of testCases) {
    log(`\nTesting: ${testCase.name}`);
    
    // Create temporary .env file if needed
    const envFilePath = '.env.test';
    if (testCase.envFile) {
      const envContent = Object.entries(testCase.envFile)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      fs.writeFileSync(envFilePath, envContent);
    }
    
    try {
      // Get Docker Compose configuration with environment variables resolved
      const configCmd = testCase.envFile 
        ? `docker-compose --env-file ${envFilePath} -f docker-compose.prod.yml config`
        : 'docker-compose -f docker-compose.prod.yml config';
      
      const config = execSync(configCmd, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Check expected values in the resolved configuration
      let testPassed = true;
      for (const [envVar, expectedValue] of Object.entries(testCase.expectedValues)) {
        if (config.includes(expectedValue)) {
          logSuccess(`${envVar}: ${expectedValue}`);
        } else {
          logError(`${envVar}: Expected "${expectedValue}" but not found in config`);
          testPassed = false;
        }
      }
      
      if (testPassed) {
        logSuccess(`Test case "${testCase.name}" passed`);
      } else {
        logError(`Test case "${testCase.name}" failed`);
        allTestsPassed = false;
      }
      
    } catch (error) {
      logError(`Test case "${testCase.name}" failed: ${error.message}`);
      allTestsPassed = false;
    } finally {
      // Clean up temporary .env file
      if (testCase.envFile && fs.existsSync(envFilePath)) {
        fs.unlinkSync(envFilePath);
      }
    }
  }
  
  return allTestsPassed;
}

/**
 * Test required environment variables
 */
function testRequiredVariables() {
  logSection('Testing Required Environment Variables');
  
  const requiredVars = ['APP_SECRET'];
  const warningVars = ['FRONTEND_URL', 'DATABASE_PATH'];
  
  // Test with missing required variables
  log('Testing with missing APP_SECRET...');
  try {
    const config = execSync('docker-compose -f docker-compose.prod.yml config', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // APP_SECRET should be empty or cause a warning
    if (config.includes('APP_SECRET=') || config.includes('APP_SECRET:')) {
      logWarning('APP_SECRET is not set - this will cause authentication issues in production');
    }
    
    logSuccess('Docker Compose handles missing APP_SECRET gracefully');
  } catch (error) {
    logError(`Failed to handle missing APP_SECRET: ${error.message}`);
    return false;
  }
  
  return true;
}

/**
 * Test service-specific environment variables
 */
function testServiceEnvironmentVariables() {
  logSection('Testing Service-Specific Environment Variables');
  
  try {
    const config = execSync('docker-compose -f docker-compose.prod.yml config', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Check nginx service
    if (config.includes('rediscover-nginx')) {
      logSuccess('Nginx service configuration found');
    } else {
      logError('Nginx service configuration missing');
      return false;
    }
    
    // Check frontend service environment
    if (config.includes('NODE_ENV') && config.includes('VITE_API_URL')) {
      logSuccess('Frontend service environment variables configured');
    } else {
      logError('Frontend service environment variables missing');
      return false;
    }
    
    // Check backend service environment
    const backendEnvVars = ['NODE_ENV', 'PORT', 'DATABASE_PATH', 'FRONTEND_URL', 'JWT_EXPIRES_IN'];
    let backendConfigValid = true;
    
    for (const envVar of backendEnvVars) {
      if (config.includes(envVar)) {
        logSuccess(`Backend ${envVar} configured`);
      } else {
        logError(`Backend ${envVar} missing`);
        backendConfigValid = false;
      }
    }
    
    return backendConfigValid;
  } catch (error) {
    logError(`Service environment variable test failed: ${error.message}`);
    return false;
  }
}

/**
 * Main test execution
 */
function main() {
  log(`${colors.bold}Docker Compose Environment Variable Test${colors.reset}`, 'blue');
  log('This script tests Docker Compose environment variable handling and substitution.\n');
  
  const tests = [
    { name: 'Docker Compose Configuration', fn: testDockerComposeConfig },
    { name: 'Environment Variable Substitution', fn: testEnvironmentVariables },
    { name: 'Required Variables', fn: testRequiredVariables },
    { name: 'Service Environment Variables', fn: testServiceEnvironmentVariables }
  ];
  
  let allTestsPassed = true;
  const results = [];
  
  for (const test of tests) {
    try {
      const passed = test.fn();
      results.push({ name: test.name, passed });
      if (!passed) {
        allTestsPassed = false;
      }
    } catch (error) {
      logError(`Test "${test.name}" threw an error: ${error.message}`);
      results.push({ name: test.name, passed: false });
      allTestsPassed = false;
    }
  }
  
  // Print summary
  logSection('Test Results Summary');
  for (const result of results) {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logError(result.name);
    }
  }
  
  if (allTestsPassed) {
    log(`\n${colors.bold}${colors.green}All tests passed! Environment variable handling is working correctly.${colors.reset}`);
    process.exit(0);
  } else {
    log(`\n${colors.bold}${colors.red}Some tests failed. Please check the configuration and try again.${colors.reset}`);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  testDockerComposeConfig,
  testEnvironmentVariables,
  testRequiredVariables,
  testServiceEnvironmentVariables
};