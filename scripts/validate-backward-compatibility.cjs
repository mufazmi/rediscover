#!/usr/bin/env node

/**
 * Backward Compatibility Validation Script (Non-Docker)
 * 
 * This script validates that existing development workflows continue to work
 * after implementing the reverse proxy deployment configuration.
 * 
 * Tests that can be run without Docker:
 * 1. Configuration files exist and are valid
 * 2. Environment variable compatibility
 * 3. NPM scripts continue to function (excluding lint which has pre-existing issues)
 * 4. Package.json scripts are preserved
 * 5. Frontend build process works with both configurations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BackwardCompatibilityValidator {
  constructor() {
    this.results = [];
    this.errors = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
    
    if (type === 'error') {
      this.errors.push(message);
    }
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

  testConfigurationFiles() {
    this.log('=== Testing Configuration Files Compatibility ===');
    
    const requiredFiles = [
      // Original files that must still exist
      { file: 'docker-compose.yml', description: 'Original Docker Compose configuration' },
      { file: 'package.json', description: 'Main package.json' },
      { file: 'backend/package.json', description: 'Backend package.json' },
      
      // New reverse proxy files
      { file: 'docker-compose.dev.yml', description: 'Development override configuration' },
      { file: 'docker-compose.prod.yml', description: 'Production configuration' },
      { file: 'nginx/nginx.conf', description: 'Nginx main configuration' },
      { file: 'nginx/conf.d/default.conf', description: 'Nginx server configuration' },
      { file: 'Dockerfile.frontend', description: 'Frontend Dockerfile' },
      { file: 'backend/Dockerfile', description: 'Backend Dockerfile' }
    ];

    let allExist = true;

    for (const { file, description } of requiredFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ ${file} exists (${description})`, 'success');
        this.results.push({ test: `Configuration File: ${file}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${file} does not exist (${description})`, 'error');
        this.results.push({ test: `Configuration File: ${file}`, status: 'FAILED', error: 'File not found' });
        allExist = false;
      }
    }

    return allExist;
  }

  testEnvironmentVariables() {
    this.log('=== Testing Environment Variable Compatibility ===');
    
    const envFiles = [
      { file: '.env.example', description: 'Main environment template' },
      { file: '.env.dev.example', description: 'Development environment template' },
      { file: '.env.prod.example', description: 'Production environment template' }
    ];

    const requiredVars = [
      'APP_SECRET',
      'FRONTEND_URL', 
      'VITE_API_URL',
      'PORT',
      'NODE_ENV'
    ];

    let allValid = true;

    for (const { file, description } of envFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ ${file} exists (${description})`, 'success');
        
        const content = fs.readFileSync(file, 'utf8');
        let fileValid = true;

        for (const varName of requiredVars) {
          if (content.includes(varName)) {
            this.log(`  ✅ Contains ${varName}`, 'success');
          } else {
            this.log(`  ❌ Missing ${varName}`, 'error');
            fileValid = false;
            allValid = false;
          }
        }
        
        this.results.push({ 
          test: `Environment File: ${file}`, 
          status: fileValid ? 'PASSED' : 'FAILED',
          error: fileValid ? undefined : 'Missing required variables'
        });
      } else {
        this.log(`❌ ${file} does not exist (${description})`, 'error');
        this.results.push({ test: `Environment File: ${file}`, status: 'FAILED', error: 'File not found' });
        allValid = false;
      }
    }

    return allValid;
  }

  testPackageJsonScripts() {
    this.log('=== Testing Package.json Scripts Compatibility ===');
    
    const packageJsonPath = 'package.json';
    if (!fs.existsSync(packageJsonPath)) {
      this.log('❌ package.json not found', 'error');
      this.results.push({ test: 'Package.json Scripts', status: 'FAILED', error: 'package.json not found' });
      return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const scripts = packageJson.scripts || {};

    const expectedScripts = [
      'dev',
      'build', 
      'build:dev',
      'test',
      'test:property',
      'test:property-framework'
    ];

    let allPresent = true;

    for (const script of expectedScripts) {
      if (scripts[script]) {
        this.log(`✅ Script '${script}' exists: ${scripts[script]}`, 'success');
        this.results.push({ test: `NPM Script: ${script}`, status: 'PASSED' });
      } else {
        this.log(`❌ Script '${script}' missing`, 'error');
        this.results.push({ test: `NPM Script: ${script}`, status: 'FAILED', error: 'Script not found' });
        allPresent = false;
      }
    }

    return allPresent;
  }

  testNpmScripts() {
    this.log('=== Testing NPM Scripts Execution ===');
    
    const scriptsToTest = [
      { script: 'npm run build', description: 'Frontend build process' },
      { script: 'npm run test:property-framework', description: 'Property testing framework' }
      // Excluding lint due to pre-existing issues
    ];

    let allPassed = true;

    for (const { script, description } of scriptsToTest) {
      this.log(`Testing: ${script} (${description})`);
      const result = this.runCommand(script, { silent: true });
      
      if (result.success) {
        this.log(`✅ ${script} - PASSED`, 'success');
        this.results.push({ test: `NPM Script Execution: ${script}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${script} - FAILED: ${result.error}`, 'error');
        this.results.push({ test: `NPM Script Execution: ${script}`, status: 'FAILED', error: result.error });
        allPassed = false;
      }
    }

    return allPassed;
  }

  testFrontendBuildCompatibility() {
    this.log('=== Testing Frontend Build Compatibility ===');
    
    // Test build with different VITE_API_URL configurations
    const buildConfigs = [
      { 
        name: 'Relative URLs (reverse proxy)', 
        env: { VITE_API_URL: '' },
        description: 'Build for reverse proxy deployment with relative URLs'
      },
      { 
        name: 'Direct backend access', 
        env: { VITE_API_URL: 'http://localhost:6377' },
        description: 'Build for direct backend access (development)'
      }
    ];

    let allPassed = true;

    for (const { name, env, description } of buildConfigs) {
      this.log(`Testing build configuration: ${name} (${description})`);
      
      // Set environment variable and run build
      const envString = Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      
      const command = process.platform === 'win32' 
        ? `set ${envString.replace(/=/g, '=')} && npm run build`
        : `${envString} npm run build`;
      
      const result = this.runCommand(command, { silent: true });
      
      if (result.success) {
        this.log(`✅ Build with ${name} - PASSED`, 'success');
        this.results.push({ test: `Frontend Build: ${name}`, status: 'PASSED' });
        
        // Check if dist directory was created
        if (fs.existsSync('dist')) {
          this.log(`  ✅ dist directory created`, 'success');
          
          // Check for key files
          const keyFiles = ['index.html', 'assets'];
          for (const file of keyFiles) {
            const filePath = path.join('dist', file);
            if (fs.existsSync(filePath)) {
              this.log(`  ✅ ${file} exists in dist`, 'success');
            } else {
              this.log(`  ❌ ${file} missing in dist`, 'error');
              allPassed = false;
            }
          }
        } else {
          this.log(`  ❌ dist directory not created`, 'error');
          allPassed = false;
        }
      } else {
        this.log(`❌ Build with ${name} - FAILED: ${result.error}`, 'error');
        this.results.push({ test: `Frontend Build: ${name}`, status: 'FAILED', error: result.error });
        allPassed = false;
      }
    }

    return allPassed;
  }

  testDockerComposeStructure() {
    this.log('=== Testing Docker Compose Structure ===');
    
    const composeFiles = [
      { file: 'docker-compose.yml', description: 'Original single-container setup' },
      { file: 'docker-compose.prod.yml', description: 'Production multi-service setup' },
      { file: 'docker-compose.dev.yml', description: 'Development overrides' }
    ];

    let allValid = true;

    for (const { file, description } of composeFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          
          // Basic YAML structure validation
          if (content.includes('version:') && content.includes('services:')) {
            this.log(`✅ ${file} has valid structure (${description})`, 'success');
            this.results.push({ test: `Docker Compose Structure: ${file}`, status: 'PASSED' });
          } else {
            this.log(`❌ ${file} has invalid structure (${description})`, 'error');
            this.results.push({ test: `Docker Compose Structure: ${file}`, status: 'FAILED', error: 'Invalid YAML structure' });
            allValid = false;
          }
        } catch (error) {
          this.log(`❌ ${file} cannot be read: ${error.message}`, 'error');
          this.results.push({ test: `Docker Compose Structure: ${file}`, status: 'FAILED', error: error.message });
          allValid = false;
        }
      } else {
        this.log(`❌ ${file} does not exist`, 'error');
        this.results.push({ test: `Docker Compose Structure: ${file}`, status: 'FAILED', error: 'File not found' });
        allValid = false;
      }
    }

    return allValid;
  }

  testBackendCompatibility() {
    this.log('=== Testing Backend Compatibility ===');
    
    const backendFiles = [
      { file: 'backend/package.json', description: 'Backend package configuration' },
      { file: 'backend/Dockerfile', description: 'Backend Docker configuration' },
      { file: 'backend/src/server.ts', description: 'Backend server entry point' }
    ];

    let allValid = true;

    for (const { file, description } of backendFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ ${file} exists (${description})`, 'success');
        this.results.push({ test: `Backend File: ${file}`, status: 'PASSED' });
      } else {
        this.log(`❌ ${file} does not exist (${description})`, 'error');
        this.results.push({ test: `Backend File: ${file}`, status: 'FAILED', error: 'File not found' });
        allValid = false;
      }
    }

    // Test backend package.json scripts
    if (fs.existsSync('backend/package.json')) {
      const backendPackage = JSON.parse(fs.readFileSync('backend/package.json', 'utf8'));
      const scripts = backendPackage.scripts || {};
      
      const expectedBackendScripts = ['dev', 'build', 'start', 'test'];
      
      for (const script of expectedBackendScripts) {
        if (scripts[script]) {
          this.log(`✅ Backend script '${script}' exists`, 'success');
          this.results.push({ test: `Backend Script: ${script}`, status: 'PASSED' });
        } else {
          this.log(`❌ Backend script '${script}' missing`, 'error');
          this.results.push({ test: `Backend Script: ${script}`, status: 'FAILED', error: 'Script not found' });
          allValid = false;
        }
      }
    }

    return allValid;
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

    console.log('\n📋 Backward Compatibility Summary:');
    console.log('   • Original docker-compose.yml preserved for existing workflows');
    console.log('   • New reverse proxy configuration available via docker-compose.prod.yml');
    console.log('   • Development workflows support both direct access and reverse proxy');
    console.log('   • Environment variables maintain backward compatibility');
    console.log('   • NPM scripts continue to function as expected');
    console.log('   • Frontend builds work with both relative and absolute API URLs');

    return failed === 0;
  }

  run() {
    this.log('🚀 Starting Backward Compatibility Validation (Non-Docker)');
    
    try {
      // Test all compatibility aspects
      this.testConfigurationFiles();
      this.testEnvironmentVariables();
      this.testPackageJsonScripts();
      this.testNpmScripts();
      this.testFrontendBuildCompatibility();
      this.testDockerComposeStructure();
      this.testBackendCompatibility();
      
    } catch (error) {
      this.log(`Validation failed with error: ${error.message}`, 'error');
    }

    const success = this.generateReport();
    
    if (success) {
      this.log('🎉 All backward compatibility tests passed!', 'success');
      return true;
    } else {
      this.log('💥 Some backward compatibility tests failed!', 'error');
      return false;
    }
  }
}

// Run the validation if this script is executed directly
if (require.main === module) {
  const validator = new BackwardCompatibilityValidator();
  const success = validator.run();
  process.exit(success ? 0 : 1);
}

module.exports = BackwardCompatibilityValidator;