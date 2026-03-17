#!/usr/bin/env node

/**
 * Validation script for reverse proxy deployment setup
 * Checks that all configuration files are properly configured
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

console.log('🔍 Validating reverse proxy deployment setup...\n');

let errors = 0;
let warnings = 0;

function error(message) {
  console.log(`❌ ERROR: ${message}`);
  errors++;
}

function warning(message) {
  console.log(`⚠️  WARNING: ${message}`);
  warnings++;
}

function success(message) {
  console.log(`✅ ${message}`);
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

// Check required files
const requiredFiles = [
  'nginx/nginx.conf',
  'nginx/conf.d/default.conf',
  'docker-compose.prod.yml',
  'docker-compose.dev.yml',
  'Dockerfile.frontend',
  '.env.example',
  '.env.prod.example'
];

console.log('📁 Checking required files...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    success(`${file} exists`);
  } else {
    error(`${file} is missing`);
  }
});

// Validate nginx configuration
console.log('\n🌐 Validating nginx configuration...');
try {
  const nginxConf = fs.readFileSync('nginx/nginx.conf', 'utf-8');
  const defaultConf = fs.readFileSync('nginx/conf.d/default.conf', 'utf-8');
  
  if (nginxConf.includes('include /etc/nginx/conf.d/*.conf')) {
    success('nginx.conf includes server configurations');
  } else {
    error('nginx.conf missing server configuration include');
  }
  
  if (defaultConf.includes('upstream backend') && defaultConf.includes('server backend:6377')) {
    success('Backend upstream configured correctly');
  } else {
    error('Backend upstream configuration missing or incorrect');
  }
  
  if (defaultConf.includes('location /api/') && defaultConf.includes('proxy_pass http://backend')) {
    success('API proxying configured');
  } else {
    error('API proxying configuration missing');
  }
  
  if (defaultConf.includes('location /socket.io/')) {
    success('WebSocket proxying configured');
  } else {
    error('WebSocket proxying configuration missing');
  }
  
  if (defaultConf.includes('location /nginx-health')) {
    success('Health check endpoint configured');
  } else {
    error('Health check endpoint missing');
  }
  
} catch (err) {
  error(`Failed to read nginx configuration: ${err.message}`);
}

// Validate Docker Compose configurations
console.log('\n🐳 Validating Docker Compose configurations...');
try {
  const prodConfig = yaml.parse(fs.readFileSync('docker-compose.prod.yml', 'utf-8'));
  const devConfig = yaml.parse(fs.readFileSync('docker-compose.dev.yml', 'utf-8'));
  
  // Check services
  const requiredServices = ['nginx', 'frontend', 'backend'];
  requiredServices.forEach(service => {
    if (prodConfig.services[service] && devConfig.services[service]) {
      success(`${service} service defined in both configurations`);
    } else {
      error(`${service} service missing in one or both configurations`);
    }
  });
  
  // Check production configuration
  const nginxPorts = prodConfig.services.nginx.ports;
  if (nginxPorts.some(port => port.includes('80:80') || port.includes('${NGINX_HTTP_PORT:-80}:80'))) {
    success('Production nginx exposes port 80');
  } else {
    error('Production nginx not exposing port 80');
  }
  
  if (!prodConfig.services.frontend.ports && !prodConfig.services.backend.ports) {
    success('Production frontend and backend do not expose ports (good for security)');
  } else {
    warning('Production frontend or backend exposing ports (consider removing for security)');
  }
  
  // Check development configuration
  const devNginxPorts = devConfig.services.nginx.ports;
  if (devNginxPorts.some(port => port.includes('8080:80') || port.includes('${NGINX_DEV_PORT:-8080}:80'))) {
    success('Development nginx uses different port (8080)');
  } else {
    error('Development nginx should use port 8080 to avoid conflicts');
  }
  
  if (devConfig.services.frontend.ports && devConfig.services.backend.ports) {
    success('Development services expose ports for direct access');
  } else {
    warning('Development services should expose ports for debugging');
  }
  
  // Check volumes
  if (prodConfig.volumes && prodConfig.volumes['rediscover-data'] !== undefined && prodConfig.volumes['frontend-dist'] !== undefined) {
    success('Required volumes defined');
  } else {
    error('Required volumes missing');
  }
  
  // Check networks
  if (prodConfig.networks['rediscover-network'] && devConfig.networks['rediscover-network']) {
    success('Network isolation configured');
  } else {
    error('Network configuration missing');
  }
  
} catch (err) {
  error(`Failed to parse Docker Compose configurations: ${err.message}`);
}

// Validate Dockerfile.frontend
console.log('\n📦 Validating frontend Dockerfile...');
try {
  const dockerfile = fs.readFileSync('Dockerfile.frontend', 'utf-8');
  
  if (dockerfile.includes('FROM node:20-alpine AS builder')) {
    success('Multi-stage build configured');
  } else {
    error('Multi-stage build not configured properly');
  }
  
  if (dockerfile.includes('ARG VITE_API_URL=""')) {
    success('VITE_API_URL build argument configured');
  } else {
    error('VITE_API_URL build argument missing');
  }
  
  if (dockerfile.includes('npm run build')) {
    success('Build step configured');
  } else {
    error('Build step missing');
  }
  
  if (dockerfile.includes('cp -r /app/dist/* /app/dist-volume/')) {
    success('Volume copying configured for nginx integration');
  } else {
    error('Volume copying for nginx integration missing');
  }
  
} catch (err) {
  error(`Failed to read Dockerfile.frontend: ${err.message}`);
}

// Check SSL preparation
console.log('\n🔒 Checking SSL preparation...');
if (fs.existsSync('nginx/ssl')) {
  success('SSL directory exists');
  if (fs.existsSync('nginx/ssl/README.md')) {
    success('SSL documentation present');
  } else {
    warning('SSL documentation missing');
  }
} else {
  error('SSL directory missing');
}

// Check environment files
console.log('\n🔧 Checking environment configuration...');
if (fs.existsSync('.env.example') && fs.existsSync('.env.prod.example')) {
  success('Environment example files present');
} else {
  error('Environment example files missing');
}

// Summary
console.log('\n📊 Validation Summary:');
console.log(`✅ Successful checks: ${requiredFiles.length + 15 - errors - warnings}`);
if (warnings > 0) {
  console.log(`⚠️  Warnings: ${warnings}`);
}
if (errors > 0) {
  console.log(`❌ Errors: ${errors}`);
  console.log('\n🚨 Setup validation failed! Please fix the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 Setup validation passed! The reverse proxy deployment configuration is ready.');
  
  console.log('\n📋 Next steps:');
  console.log('1. For production deployment: docker-compose -f docker-compose.prod.yml up -d');
  console.log('2. For development: docker-compose -f docker-compose.dev.yml up -d');
  console.log('3. Configure SSL certificates in nginx/ssl/ directory for HTTPS');
  console.log('4. Update environment variables in .env files as needed');
}