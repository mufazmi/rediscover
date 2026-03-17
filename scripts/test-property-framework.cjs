#!/usr/bin/env node

/**
 * Property-Based Testing Framework Validation Script
 * 
 * This script validates that the property-based testing framework is properly set up
 * and can run basic tests without requiring full Docker Compose environment.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Validating Property-Based Testing Framework Setup...\n');

// Check if fast-check is installed
console.log('1. Checking fast-check installation...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  if (packageJson.devDependencies && packageJson.devDependencies['fast-check']) {
    console.log('   ✓ fast-check is installed');
  } else {
    console.log('   ✗ fast-check not found in devDependencies');
    process.exit(1);
  }
} catch (error) {
  console.log('   ✗ Error reading package.json:', error.message);
  process.exit(1);
}

// Check if framework files exist
console.log('\n2. Checking framework files...');
const requiredFiles = [
  'src/test/property-based/index.ts',
  'src/test/property-based/setup.ts',
  'src/test/property-based/config.ts',
  'src/test/property-based/docker-utils.ts',
  'src/test/property-based/http-utils.ts',
  'src/test/property-based/generators.ts',
  'src/test/property-based/runner.ts',
  'src/test/property-based/example.test.ts',
  'src/test/property-based/README.md'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✓ ${file}`);
  } else {
    console.log(`   ✗ ${file} (missing)`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Some framework files are missing');
  process.exit(1);
}

// Check TypeScript compilation
console.log('\n3. Checking TypeScript compilation...');
try {
  execSync('npx tsc --noEmit --project tsconfig.json', { 
    stdio: 'pipe',
    encoding: 'utf-8'
  });
  console.log('   ✓ TypeScript compilation successful');
} catch (error) {
  console.log('   ✗ TypeScript compilation failed:');
  console.log(error.stdout || error.stderr);
  process.exit(1);
}

// Check if Docker is available (optional)
console.log('\n4. Checking Docker availability...');
try {
  execSync('docker --version', { stdio: 'pipe' });
  console.log('   ✓ Docker is available');
  
  try {
    execSync('docker-compose --version', { stdio: 'pipe' });
    console.log('   ✓ Docker Compose is available');
  } catch {
    console.log('   ⚠ Docker Compose not available (tests requiring Docker will be skipped)');
  }
} catch {
  console.log('   ⚠ Docker not available (tests requiring Docker will be skipped)');
}

// Check Docker Compose files
console.log('\n5. Checking Docker Compose configuration...');
const composeFiles = ['docker-compose.prod.yml', 'docker-compose.dev.yml'];
for (const file of composeFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✓ ${file} exists`);
    
    // Basic validation of compose file
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('nginx:') && content.includes('backend:')) {
        console.log(`   ✓ ${file} contains required services`);
      } else {
        console.log(`   ⚠ ${file} may be missing required services`);
      }
    } catch (error) {
      console.log(`   ⚠ Could not validate ${file}: ${error.message}`);
    }
  } else {
    console.log(`   ✗ ${file} (missing)`);
  }
}

// Test basic framework structure (without imports)
console.log('\n6. Testing framework structure...');
try {
  // Check that key exports exist in the index file
  const indexContent = fs.readFileSync('src/test/property-based/index.ts', 'utf-8');
  
  const requiredExports = [
    'PropertyTestRunner',
    'BuiltInPropertyTests',
    'DockerComposeTestManager',
    'HttpTestClient',
    'PathGenerators',
    'HeaderGenerators'
  ];
  
  let allExportsFound = true;
  for (const exportName of requiredExports) {
    if (indexContent.includes(exportName)) {
      console.log(`   ✓ ${exportName} export found`);
    } else {
      console.log(`   ✗ ${exportName} export missing`);
      allExportsFound = false;
    }
  }
  
  if (allExportsFound) {
    console.log('   ✓ Framework structure validation successful');
  } else {
    throw new Error('Missing required exports');
  }
} catch (error) {
  console.log('   ✗ Framework structure validation failed:', error.message);
  process.exit(1);
}

// Summary
console.log('\n✅ Property-Based Testing Framework Setup Complete!\n');
console.log('Framework Features:');
console.log('  • Fast-check integration for property-based testing');
console.log('  • Docker Compose environment management');
console.log('  • HTTP client with retry logic and assertions');
console.log('  • Comprehensive generators for test data');
console.log('  • Built-in property tests for reverse proxy validation');
console.log('  • Automatic cleanup and resource management');

console.log('\nNext Steps:');
console.log('  1. Run property tests: npm test src/test/property-based');
console.log('  2. Review framework documentation: src/test/property-based/README.md');
console.log('  3. Add custom property tests as needed');

console.log('\nNote: Full property tests require Docker and Docker Compose to be running.');