#!/usr/bin/env node

/**
 * Validation script for Docker Compose environment variable configuration
 * This script validates the configuration files without requiring Docker Compose to be installed
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

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
 * Parse Docker Compose YAML file
 */
function parseDockerComposeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error.message}`);
  }
}

/**
 * Check if a string contains environment variable substitution
 */
function hasEnvVarSubstitution(value) {
  if (typeof value !== 'string') return false;
  return /\$\{[^}]+\}/.test(value);
}

/**
 * Extract environment variable name from substitution syntax
 */
function extractEnvVarName(substitution) {
  const match = substitution.match(/\$\{([^:}]+)(?::-[^}]*)?\}/);
  return match ? match[1] : null;
}

/**
 * Extract default value from substitution syntax
 */
function extractDefaultValue(substitution) {
  const match = substitution.match(/\$\{[^:}]+:-([^}]*)\}/);
  return match ? match[1] : null;
}

/**
 * Recursively find all environment variable substitutions in an object
 */
function findEnvVarSubstitutions(obj, path = '') {
  const substitutions = [];
  
  if (typeof obj === 'string' && hasEnvVarSubstitution(obj)) {
    const matches = obj.match(/\$\{[^}]+\}/g) || [];
    for (const match of matches) {
      const envVar = extractEnvVarName(match);
      const defaultValue = extractDefaultValue(match);
      if (envVar) {
        substitutions.push({
          path,
          envVar,
          substitution: match,
          defaultValue,
          fullValue: obj
        });
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      substitutions.push(...findEnvVarSubstitutions(item, `${path}[${index}]`));
    });
  } else if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      const newPath = path ? `${path}.${key}` : key;
      substitutions.push(...findEnvVarSubstitutions(value, newPath));
    });
  }
  
  return substitutions;
}

/**
 * Test Docker Compose file structure
 */
function testDockerComposeStructure() {
  logSection('Testing Docker Compose File Structure');
  
  const files = [
    'docker-compose.prod.yml',
    'docker-compose.dev.yml'
  ];
  
  let allValid = true;
  
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) {
        logError(`${file} does not exist`);
        allValid = false;
        continue;
      }
      
      const config = parseDockerComposeFile(file);
      
      // Check required sections
      if (!config.services) {
        logError(`${file}: Missing 'services' section`);
        allValid = false;
        continue;
      }
      
      // Check required services
      const requiredServices = ['nginx', 'frontend', 'backend'];
      for (const service of requiredServices) {
        if (!config.services[service]) {
          logError(`${file}: Missing '${service}' service`);
          allValid = false;
        } else {
          logSuccess(`${file}: ${service} service found`);
        }
      }
      
      // Check networks and volumes
      if (config.networks) {
        logSuccess(`${file}: Networks configuration found`);
      }
      
      if (config.volumes) {
        logSuccess(`${file}: Volumes configuration found`);
      }
      
    } catch (error) {
      logError(`${file}: ${error.message}`);
      allValid = false;
    }
  }
  
  return allValid;
}

/**
 * Test environment variable substitutions
 */
function testEnvironmentVariableSubstitutions() {
  logSection('Testing Environment Variable Substitutions');
  
  const files = [
    { name: 'docker-compose.prod.yml', type: 'production' },
    { name: 'docker-compose.dev.yml', type: 'development' }
  ];
  
  let allValid = true;
  const allEnvVars = new Set();
  
  for (const file of files) {
    try {
      log(`\nAnalyzing ${file.name}...`);
      const config = parseDockerComposeFile(file.name);
      const substitutions = findEnvVarSubstitutions(config);
      
      if (substitutions.length === 0) {
        logWarning(`${file.name}: No environment variable substitutions found`);
        continue;
      }
      
      log(`Found ${substitutions.length} environment variable substitutions:`);
      
      for (const sub of substitutions) {
        allEnvVars.add(sub.envVar);
        const defaultInfo = sub.defaultValue !== null ? ` (default: "${sub.defaultValue}")` : ' (no default)';
        logSuccess(`  ${sub.envVar}${defaultInfo} at ${sub.path}`);
      }
      
    } catch (error) {
      logError(`${file.name}: ${error.message}`);
      allValid = false;
    }
  }
  
  // Summary of all environment variables
  log(`\nSummary: Found ${allEnvVars.size} unique environment variables:`);
  Array.from(allEnvVars).sort().forEach(envVar => {
    log(`  - ${envVar}`);
  });
  
  return allValid;
}

/**
 * Test environment file examples
 */
function testEnvironmentFiles() {
  logSection('Testing Environment File Examples');
  
  const envFiles = [
    '.env.example',
    '.env.dev.example',
    '.env.prod.example'
  ];
  
  let allValid = true;
  
  for (const file of envFiles) {
    try {
      if (!fs.existsSync(file)) {
        logError(`${file} does not exist`);
        allValid = false;
        continue;
      }
      
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const envVars = new Set();
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key] = trimmed.split('=', 2);
          envVars.add(key);
        }
      }
      
      logSuccess(`${file}: Found ${envVars.size} environment variables`);
      
      // Check for required variables
      const requiredVars = ['APP_SECRET', 'NODE_ENV', 'PORT'];
      for (const reqVar of requiredVars) {
        if (envVars.has(reqVar)) {
          logSuccess(`  ${reqVar} defined`);
        } else {
          logWarning(`  ${reqVar} not defined`);
        }
      }
      
    } catch (error) {
      logError(`${file}: ${error.message}`);
      allValid = false;
    }
  }
  
  return allValid;
}

/**
 * Test service-specific configurations
 */
function testServiceConfigurations() {
  logSection('Testing Service-Specific Configurations');
  
  try {
    const prodConfig = parseDockerComposeFile('docker-compose.prod.yml');
    let allValid = true;
    
    // Test nginx service
    const nginx = prodConfig.services.nginx;
    if (nginx) {
      if (nginx.ports && nginx.ports.some(port => hasEnvVarSubstitution(port))) {
        logSuccess('Nginx: Port configuration uses environment variables');
      } else {
        logWarning('Nginx: Port configuration does not use environment variables');
      }
    }
    
    // Test frontend service
    const frontend = prodConfig.services.frontend;
    if (frontend) {
      if (frontend.build && frontend.build.args && hasEnvVarSubstitution(frontend.build.args.VITE_API_URL)) {
        logSuccess('Frontend: Build args use environment variables');
      } else {
        logWarning('Frontend: Build args may not use environment variables');
      }
      
      if (frontend.environment && frontend.environment.some(env => hasEnvVarSubstitution(env))) {
        logSuccess('Frontend: Environment variables use substitution');
      } else {
        logWarning('Frontend: Environment variables may not use substitution');
      }
    }
    
    // Test backend service
    const backend = prodConfig.services.backend;
    if (backend) {
      if (backend.environment && backend.environment.some(env => hasEnvVarSubstitution(env))) {
        logSuccess('Backend: Environment variables use substitution');
      } else {
        logError('Backend: Environment variables do not use substitution');
        allValid = false;
      }
      
      // Check health check
      if (backend.healthcheck && backend.healthcheck.test) {
        const healthTest = Array.isArray(backend.healthcheck.test) 
          ? backend.healthcheck.test.join(' ')
          : backend.healthcheck.test;
        
        if (hasEnvVarSubstitution(healthTest)) {
          logSuccess('Backend: Health check uses environment variables');
        } else {
          logWarning('Backend: Health check may not use environment variables');
        }
      }
    }
    
    return allValid;
  } catch (error) {
    logError(`Service configuration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Main validation function
 */
function main() {
  log(`${colors.bold}Docker Compose Environment Variable Configuration Validation${colors.reset}`, 'blue');
  log('This script validates Docker Compose environment variable handling without requiring Docker to be installed.\n');
  
  const tests = [
    { name: 'Docker Compose File Structure', fn: testDockerComposeStructure },
    { name: 'Environment Variable Substitutions', fn: testEnvironmentVariableSubstitutions },
    { name: 'Environment File Examples', fn: testEnvironmentFiles },
    { name: 'Service Configurations', fn: testServiceConfigurations }
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
  logSection('Validation Results Summary');
  for (const result of results) {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logError(result.name);
    }
  }
  
  if (allTestsPassed) {
    log(`\n${colors.bold}${colors.green}All validations passed! Environment variable configuration is correct.${colors.reset}`);
    process.exit(0);
  } else {
    log(`\n${colors.bold}${colors.red}Some validations failed. Please check the configuration and try again.${colors.reset}`);
    process.exit(1);
  }
}

// Check if yaml is available
try {
  require('yaml');
} catch (error) {
  console.error('Error: yaml package is required but not installed.');
  console.error('Please install it with: npm install yaml');
  process.exit(1);
}

// Run validation if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  parseDockerComposeFile,
  findEnvVarSubstitutions,
  testDockerComposeStructure,
  testEnvironmentVariableSubstitutions,
  testEnvironmentFiles,
  testServiceConfigurations
};