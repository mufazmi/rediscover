#!/usr/bin/env node

/**
 * Demo script to show environment variable substitution in Docker Compose
 * This script creates test .env files and shows how they affect the configuration
 */

const fs = require('fs');
const yaml = require('yaml');

// ANSI color codes for output formatting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.bold}=== ${title} ===${colors.reset}`, 'blue');
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
 * Simulate environment variable substitution
 */
function substituteEnvVars(value, envVars = {}) {
  if (typeof value !== 'string') return value;
  
  return value.replace(/\$\{([^:}]+)(?::-([^}]*))?\}/g, (match, envVar, defaultValue) => {
    if (envVars.hasOwnProperty(envVar)) {
      return envVars[envVar];
    }
    return defaultValue || '';
  });
}

/**
 * Recursively substitute environment variables in an object
 */
function substituteEnvVarsInObject(obj, envVars = {}) {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj, envVars);
  } else if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvVarsInObject(item, envVars));
  } else if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value, envVars);
    }
    return result;
  }
  return obj;
}

/**
 * Parse .env file content
 */
function parseEnvFile(content) {
  const envVars = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
      envVars[key] = value;
    }
  }
  
  return envVars;
}

/**
 * Demo environment variable substitution
 */
function demoEnvironmentSubstitution() {
  logSection('Environment Variable Substitution Demo');
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Default Values (No .env file)',
      envVars: {},
      description: 'Shows default values when no environment variables are set'
    },
    {
      name: 'Development Configuration',
      envVars: {
        NODE_ENV: 'development',
        NGINX_DEV_PORT: '9080',
        FRONTEND_DEV_PORT: '3000',
        BACKEND_DEV_PORT: '4000',
        VITE_API_URL: 'http://localhost:4000',
        FRONTEND_URL: 'http://localhost:3000',
        APP_SECRET: 'dev-secret-123'
      },
      description: 'Development setup with custom ports'
    },
    {
      name: 'Production Configuration',
      envVars: {
        NODE_ENV: 'production',
        NGINX_HTTP_PORT: '80',
        NGINX_HTTPS_PORT: '443',
        VITE_API_URL: '',
        FRONTEND_URL: 'https://rediscover.example.com',
        APP_SECRET: 'super-secure-production-secret-key-64-chars-long-random-string',
        JWT_EXPIRES_IN: '12h',
        BCRYPT_ROUNDS: '12'
      },
      description: 'Production setup with security-focused configuration'
    }
  ];
  
  for (const scenario of scenarios) {
    log(`\n${colors.cyan}${colors.bold}Scenario: ${scenario.name}${colors.reset}`);
    log(`${scenario.description}`, 'cyan');
    
    try {
      // Load and process production configuration
      const prodConfig = parseDockerComposeFile('docker-compose.prod.yml');
      const resolvedConfig = substituteEnvVarsInObject(prodConfig, scenario.envVars);
      
      // Show key configuration values
      log('\nKey Configuration Values:', 'yellow');
      
      // Nginx ports
      if (resolvedConfig.services.nginx.ports) {
        log(`  Nginx HTTP Port: ${resolvedConfig.services.nginx.ports[0]}`, 'green');
        log(`  Nginx HTTPS Port: ${resolvedConfig.services.nginx.ports[1]}`, 'green');
      }
      
      // Frontend configuration
      if (resolvedConfig.services.frontend) {
        const frontend = resolvedConfig.services.frontend;
        log(`  Frontend NODE_ENV: ${frontend.environment[0].split('=')[1]}`, 'green');
        if (frontend.build && frontend.build.args) {
          log(`  Frontend VITE_API_URL: "${frontend.build.args.VITE_API_URL}"`, 'green');
        }
      }
      
      // Backend configuration
      if (resolvedConfig.services.backend) {
        const backend = resolvedConfig.services.backend;
        const envVars = {};
        backend.environment.forEach(env => {
          const [key, value] = env.split('=');
          envVars[key] = value;
        });
        
        log(`  Backend NODE_ENV: ${envVars.NODE_ENV}`, 'green');
        log(`  Backend PORT: ${envVars.PORT}`, 'green');
        log(`  Backend FRONTEND_URL: ${envVars.FRONTEND_URL}`, 'green');
        log(`  Backend JWT_EXPIRES_IN: ${envVars.JWT_EXPIRES_IN}`, 'green');
        log(`  Backend BCRYPT_ROUNDS: ${envVars.BCRYPT_ROUNDS}`, 'green');
        
        // Show APP_SECRET length for security
        const appSecret = envVars.APP_SECRET;
        if (appSecret) {
          log(`  Backend APP_SECRET: [${appSecret.length} characters] ${appSecret.length >= 32 ? '✓' : '⚠ Too short!'}`, 'green');
        } else {
          log(`  Backend APP_SECRET: [NOT SET] ⚠ Required for production!`, 'red');
        }
      }
      
    } catch (error) {
      log(`Error processing scenario: ${error.message}`, 'red');
    }
  }
}

/**
 * Show environment variable usage summary
 */
function showEnvironmentVariableSummary() {
  logSection('Environment Variable Usage Summary');
  
  try {
    const prodConfig = parseDockerComposeFile('docker-compose.prod.yml');
    const devConfig = parseDockerComposeFile('docker-compose.dev.yml');
    
    // Extract all environment variables used
    const allEnvVars = new Set();
    
    function extractEnvVars(obj) {
      if (typeof obj === 'string') {
        const matches = obj.match(/\$\{([^:}]+)(?::-[^}]*)?\}/g) || [];
        matches.forEach(match => {
          const envVar = match.match(/\$\{([^:}]+)/)[1];
          allEnvVars.add(envVar);
        });
      } else if (Array.isArray(obj)) {
        obj.forEach(extractEnvVars);
      } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(extractEnvVars);
      }
    }
    
    extractEnvVars(prodConfig);
    extractEnvVars(devConfig);
    
    log(`Total environment variables used: ${allEnvVars.size}`, 'cyan');
    log('\nEnvironment Variables by Category:', 'yellow');
    
    const categories = {
      'Application Security': ['APP_SECRET', 'JWT_EXPIRES_IN', 'BCRYPT_ROUNDS'],
      'Network Configuration': ['NGINX_HTTP_PORT', 'NGINX_HTTPS_PORT', 'NGINX_DEV_PORT', 'FRONTEND_DEV_PORT', 'BACKEND_DEV_PORT'],
      'Application Configuration': ['NODE_ENV', 'PORT', 'FRONTEND_URL', 'VITE_API_URL'],
      'Database Configuration': ['DATABASE_PATH']
    };
    
    for (const [category, vars] of Object.entries(categories)) {
      log(`\n  ${category}:`, 'cyan');
      vars.forEach(envVar => {
        if (allEnvVars.has(envVar)) {
          log(`    ✓ ${envVar}`, 'green');
        } else {
          log(`    - ${envVar} (not used)`, 'yellow');
        }
      });
    }
    
  } catch (error) {
    log(`Error generating summary: ${error.message}`, 'red');
  }
}

/**
 * Main demo function
 */
function main() {
  log(`${colors.bold}Docker Compose Environment Variable Substitution Demo${colors.reset}`, 'blue');
  log('This demo shows how environment variables are substituted in Docker Compose configurations.\n');
  
  demoEnvironmentSubstitution();
  showEnvironmentVariableSummary();
  
  logSection('Usage Instructions');
  log('To use environment variables with Docker Compose:', 'cyan');
  log('1. Copy .env.example to .env and customize values', 'green');
  log('2. Run: docker-compose -f docker-compose.prod.yml up -d', 'green');
  log('3. For development: docker-compose -f docker-compose.prod.yml -f docker-compose.dev.yml up -d', 'green');
  log('\nEnvironment files available:', 'cyan');
  log('- .env.example (general template)', 'green');
  log('- .env.dev.example (development template)', 'green');
  log('- .env.prod.example (production template)', 'green');
}

// Run demo if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  substituteEnvVars,
  substituteEnvVarsInObject,
  parseEnvFile,
  demoEnvironmentSubstitution,
  showEnvironmentVariableSummary
};