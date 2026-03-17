#!/usr/bin/env node

/**
 * Proxy Headers Integration Test
 * 
 * Tests that the backend properly receives and processes proxy headers
 * sent by nginx reverse proxy.
 */

const http = require('http');
const { URL } = require('url');

// Test configuration
const NGINX_URL = process.env.NGINX_URL || 'http://localhost:80';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:6377';
const TEST_TIMEOUT = 10000; // 10 seconds

/**
 * Make HTTP request with custom headers
 */
function makeRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'proxy-headers-test/1.0',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          };
          
          // Try to parse JSON response
          if (res.headers['content-type']?.includes('application/json')) {
            result.json = JSON.parse(data);
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(TEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

/**
 * Test direct backend access (without proxy)
 */
async function testDirectBackend() {
  console.log('\n🔍 Testing direct backend access...');
  
  try {
    const response = await makeRequest(`${BACKEND_URL}/api/health`);
    
    if (response.statusCode === 200) {
      console.log('✅ Direct backend access works');
      return true;
    } else {
      console.log(`❌ Direct backend returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Direct backend access failed: ${error.message}`);
    return false;
  }
}

/**
 * Test nginx proxy access
 */
async function testNginxProxy() {
  console.log('\n🔍 Testing nginx proxy access...');
  
  try {
    const response = await makeRequest(`${NGINX_URL}/api/health`);
    
    if (response.statusCode === 200) {
      console.log('✅ Nginx proxy access works');
      return true;
    } else {
      console.log(`❌ Nginx proxy returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Nginx proxy access failed: ${error.message}`);
    return false;
  }
}

/**
 * Test proxy headers forwarding
 */
async function testProxyHeaders() {
  console.log('\n🔍 Testing proxy headers forwarding...');
  
  const testHeaders = {
    'X-Real-IP': '203.0.113.195',
    'X-Forwarded-For': '203.0.113.195, 70.41.3.18',
    'X-Forwarded-Proto': 'https',
    'Host': 'example.com'
  };
  
  try {
    console.log('📤 Sending request with proxy headers through nginx...');
    const response = await makeRequest(`${NGINX_URL}/api/proxy-info`, testHeaders);
    
    if (response.statusCode === 200 && response.json) {
      console.log('✅ Request with proxy headers succeeded');
      
      const data = response.json.data;
      if (data.isProxied && data.clientIp === '203.0.113.195') {
        console.log('✅ Proxy headers correctly processed');
        console.log(`   Client IP: ${data.clientIp}`);
        console.log(`   Real IP: ${data.headers.realIp}`);
        console.log(`   Forwarded For: ${data.headers.forwardedFor}`);
        console.log(`   Protocol: ${data.headers.forwardedProto}`);
        return true;
      } else {
        console.log('❌ Proxy headers not processed correctly');
        console.log(`   Expected isProxied: true, got: ${data.isProxied}`);
        console.log(`   Expected clientIp: 203.0.113.195, got: ${data.clientIp}`);
        return false;
      }
    } else {
      console.log(`❌ Request with proxy headers failed: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Proxy headers test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test nginx health endpoint
 */
async function testNginxHealth() {
  console.log('\n🔍 Testing nginx health endpoint...');
  
  try {
    const response = await makeRequest(`${NGINX_URL}/nginx-health`);
    
    if (response.statusCode === 200 && response.body.includes('healthy')) {
      console.log('✅ Nginx health endpoint works');
      return true;
    } else {
      console.log(`❌ Nginx health endpoint failed: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Nginx health endpoint failed: ${error.message}`);
    return false;
  }
}

/**
 * Test static file serving
 */
async function testStaticFiles() {
  console.log('\n🔍 Testing static file serving...');
  
  try {
    const response = await makeRequest(`${NGINX_URL}/`);
    
    if (response.statusCode === 200) {
      console.log('✅ Static file serving works');
      return true;
    } else {
      console.log(`❌ Static file serving failed: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Static file serving failed: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Proxy Headers Integration Tests');
  console.log(`📍 Nginx URL: ${NGINX_URL}`);
  console.log(`📍 Backend URL: ${BACKEND_URL}`);
  
  const results = [];
  
  // Test 1: Direct backend access
  results.push(await testDirectBackend());
  
  // Test 2: Nginx health
  results.push(await testNginxHealth());
  
  // Test 3: Nginx proxy to backend
  results.push(await testNginxProxy());
  
  // Test 4: Static file serving
  results.push(await testStaticFiles());
  
  // Test 5: Proxy headers forwarding
  results.push(await testProxyHeaders());
  
  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Proxy headers are working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Check backend logs to verify proxy header processing');
    console.log('   2. Test with real client requests');
    console.log('   3. Verify client IP logging in production');
  } else {
    console.log('\n❌ Some tests failed. Please check the configuration.');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure nginx and backend services are running');
    console.log('   2. Check nginx configuration for proxy headers');
    console.log('   3. Verify backend proxy headers middleware is enabled');
    console.log('   4. Check Docker network connectivity');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  console.error('\n❌ Test runner failed:', error.message);
  process.exit(1);
});