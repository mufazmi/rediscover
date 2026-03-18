#!/usr/bin/env node

/**
 * Health Endpoint Verification Script
 * 
 * This script verifies that the backend health endpoint:
 * - Is properly configured and accessible
 * - Returns appropriate status information
 * - Works through nginx proxy (when available)
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const BACKEND_PORT = 6377;
const NGINX_PORT = 80;
const HEALTH_ENDPOINT = '/api/health';
const NGINX_HEALTH_ENDPOINT = '/nginx-health';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(hostname, port, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testDirectBackendHealth() {
  log('\n📋 Testing Direct Backend Health Endpoint...', colors.blue);
  
  try {
    const response = await makeRequest('localhost', BACKEND_PORT, HEALTH_ENDPOINT);
    
    if (response.statusCode === 200) {
      log('✅ Backend health endpoint is accessible', colors.green);
      
      try {
        const data = JSON.parse(response.body);
        
        // Validate response structure
        const requiredFields = ['status', 'uptime', 'timestamp', 'version', 'nodeVersion', 'platform'];
        const missingFields = requiredFields.filter(field => !(field in data));
        
        if (missingFields.length === 0) {
          log('✅ Health response includes all required fields', colors.green);
          
          // Validate field values
          if (data.status === 'ok') {
            log('✅ Health status is "ok"', colors.green);
          } else {
            log(`❌ Health status is "${data.status}", expected "ok"`, colors.red);
          }
          
          if (typeof data.uptime === 'number' && data.uptime > 0) {
            log(`✅ Uptime is valid: ${data.uptime.toFixed(2)} seconds`, colors.green);
          } else {
            log('❌ Uptime is invalid', colors.red);
          }
          
          if (typeof data.timestamp === 'number') {
            const now = Date.now();
            const timeDiff = Math.abs(now - data.timestamp);
            if (timeDiff < 60000) { // Within 1 minute
              log('✅ Timestamp is current', colors.green);
            } else {
              log(`⚠️  Timestamp seems old (${timeDiff}ms difference)`, colors.yellow);
            }
          } else {
            log('❌ Timestamp is invalid', colors.red);
          }
          
          if (data.author && typeof data.author === 'object') {
            log('✅ Author information is included', colors.green);
          } else {
            log('⚠️  Author information is missing (fallback mode)', colors.yellow);
          }
          
        } else {
          log(`❌ Missing required fields: ${missingFields.join(', ')}`, colors.red);
        }
        
        // Display full response for verification
        log('\n📄 Full Health Response:', colors.blue);
        console.log(JSON.stringify(data, null, 2));
        
      } catch (parseError) {
        log('❌ Health response is not valid JSON', colors.red);
        log(`Response body: ${response.body}`, colors.yellow);
      }
      
    } else {
      log(`❌ Backend health endpoint returned status ${response.statusCode}`, colors.red);
      log(`Response: ${response.body}`, colors.yellow);
    }
    
  } catch (error) {
    log(`❌ Failed to connect to backend health endpoint: ${error.message}`, colors.red);
    log('💡 Make sure the backend server is running on port 6377', colors.yellow);
  }
}

async function testNginxProxyHealth() {
  log('\n🔄 Testing Health Endpoint Through Nginx Proxy...', colors.blue);
  
  try {
    // First test nginx health endpoint
    const nginxResponse = await makeRequest('localhost', NGINX_PORT, NGINX_HEALTH_ENDPOINT);
    
    if (nginxResponse.statusCode === 200) {
      log('✅ Nginx health endpoint is accessible', colors.green);
    } else {
      log(`❌ Nginx health endpoint returned status ${nginxResponse.statusCode}`, colors.red);
    }
    
    // Then test backend health through nginx proxy
    const proxyResponse = await makeRequest('localhost', NGINX_PORT, HEALTH_ENDPOINT);
    
    if (proxyResponse.statusCode === 200) {
      log('✅ Backend health endpoint is accessible through nginx proxy', colors.green);
      
      try {
        const data = JSON.parse(proxyResponse.body);
        
        if (data.status === 'ok') {
          log('✅ Proxied health response is valid', colors.green);
        } else {
          log(`❌ Proxied health status is "${data.status}", expected "ok"`, colors.red);
        }
        
        // Check for proxy headers (these would be visible in backend logs)
        log('✅ Health endpoint accessible through nginx proxy', colors.green);
        
      } catch (parseError) {
        log('❌ Proxied health response is not valid JSON', colors.red);
      }
      
    } else {
      log(`❌ Backend health endpoint through nginx returned status ${proxyResponse.statusCode}`, colors.red);
    }
    
  } catch (error) {
    log(`❌ Failed to connect through nginx proxy: ${error.message}`, colors.red);
    log('💡 Make sure nginx is running and configured correctly', colors.yellow);
  }
}

async function validateConfiguration() {
  log('\n🔍 Validating Configuration Files...', colors.blue);
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Check backend health route registration
    const appPath = path.join(process.cwd(), 'backend', 'src', 'app.ts');
    const appContent = fs.readFileSync(appPath, 'utf-8');
    
    if (appContent.includes("app.use('/api/health', healthRoutes)")) {
      log('✅ Backend health route is registered in app.ts', colors.green);
    } else {
      log('❌ Backend health route is not registered in app.ts', colors.red);
    }
    
    // Check health endpoint implementation
    const healthPath = path.join(process.cwd(), 'backend', 'src', 'routes', 'health.ts');
    const healthContent = fs.readFileSync(healthPath, 'utf-8');
    
    if (healthContent.includes("status: 'ok'")) {
      log('✅ Health endpoint returns status: "ok"', colors.green);
    } else {
      log('❌ Health endpoint does not return status: "ok"', colors.red);
    }
    
    // Check nginx configuration
    const nginxConfigPath = path.join(process.cwd(), 'nginx', 'conf.d', 'default.conf');
    const nginxConfig = fs.readFileSync(nginxConfigPath, 'utf-8');
    
    if (nginxConfig.includes('location /api/') && nginxConfig.includes('proxy_pass http://backend')) {
      log('✅ Nginx is configured to proxy /api/ requests to backend', colors.green);
    } else {
      log('❌ Nginx is not configured to proxy /api/ requests', colors.red);
    }
    
    // Check Docker Compose health checks
    const dockerComposePath = path.join(process.cwd(), 'docker-compose.prod.yml');
    const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf-8');
    
    if (dockerComposeContent.includes('/api/health')) {
      log('✅ Docker Compose includes backend health check', colors.green);
    } else {
      log('❌ Docker Compose does not include backend health check', colors.red);
    }
    
    if (dockerComposeContent.includes('/nginx-health')) {
      log('✅ Docker Compose includes nginx health check', colors.green);
    } else {
      log('❌ Docker Compose does not include nginx health check', colors.red);
    }
    
  } catch (error) {
    log(`❌ Configuration validation failed: ${error.message}`, colors.red);
  }
}

async function main() {
  log(`${colors.bold}🏥 Health Endpoint Verification${colors.reset}`, colors.blue);
  log('='.repeat(50), colors.blue);
  
  // Validate configuration first
  await validateConfiguration();
  
  // Test direct backend access
  await testDirectBackendHealth();
  
  // Test nginx proxy access
  await testNginxProxyHealth();
  
  log('\n📋 Verification Summary:', colors.blue);
  log('='.repeat(30), colors.blue);
  log('✅ = Test passed', colors.green);
  log('❌ = Test failed', colors.red);
  log('⚠️  = Warning/partial success', colors.yellow);
  log('💡 = Suggestion', colors.blue);
  
  log('\n🔧 To start services for testing:', colors.blue);
  log('Backend: cd backend && npm run dev', colors.yellow);
  log('Nginx: docker-compose -f docker-compose.prod.yml up nginx', colors.yellow);
  log('Full stack: docker-compose -f docker-compose.prod.yml up', colors.yellow);
}

// Run the verification
main().catch(error => {
  log(`\n💥 Verification failed: ${error.message}`, colors.red);
  process.exit(1);
});