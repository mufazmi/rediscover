#!/usr/bin/env node

/**
 * Build Binary Script
 * 
 * This script builds standalone native binaries for multiple platforms using pkg.
 * It creates self-contained executables that include Node.js runtime, application code,
 * and native dependencies (better-sqlite3).
 * 
 * Usage:
 *   node scripts/build-binary.js [platform] [arch]
 * 
 * Examples:
 *   node scripts/build-binary.js linux x64
 *   node scripts/build-binary.js darwin arm64
 *   node scripts/build-binary.js win32 x64
 *   node scripts/build-binary.js (builds all platforms)
 */

const { exec } = require('pkg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Platform configurations
const PLATFORMS = [
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'macos', arch: 'x64' },
  { platform: 'macos', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' }
];

/**
 * Build a binary for a specific platform and architecture
 * @param {string} platform - Platform name (linux, macos, win32)
 * @param {string} arch - Architecture (x64, arm64)
 * @returns {Promise<string>} Path to the built binary
 */
async function buildBinary(platform, arch) {
  // Map platform names to pkg target format
  const platformMap = {
    'linux': 'linux',
    'macos': 'macos',
    'darwin': 'macos',
    'win32': 'win'
  };

  const pkgPlatform = platformMap[platform] || platform;
  const target = `node18-${pkgPlatform}-${arch}`;
  const outputName = platform === 'win32' ? 'rediscover.exe' : 'rediscover';
  const outputDir = path.join('binaries', `${platform}-${arch}`);
  const outputPath = path.join(outputDir, outputName);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Building binary for ${platform}-${arch}...`);
  console.log(`Target: ${target}`);
  console.log(`Output: ${outputPath}`);
  console.log(`${'='.repeat(60)}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Build the binary using pkg
    await exec([
      'bin/rediscover.cjs',
      '--target', target,
      '--output', outputPath,
      '--compress', 'GZip'
    ]);

    console.log(`✓ Binary built successfully: ${outputPath}`);

    // Verify the binary was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Binary not found at ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  Size: ${sizeMB} MB`);

    return outputPath;
  } catch (error) {
    console.error(`✗ Failed to build binary for ${platform}-${arch}:`);
    console.error(error.message);
    throw error;
  }
}

/**
 * Create an archive (tar.gz or zip) for the binary
 * @param {string} platform - Platform name
 * @param {string} arch - Architecture
 * @param {string} binaryPath - Path to the binary
 * @returns {string} Path to the created archive
 */
function createArchive(platform, arch, binaryPath) {
  const archiveName = platform === 'win32' 
    ? `rediscover-${platform}-${arch}.zip`
    : `rediscover-${platform}-${arch}.tar.gz`;
  
  const archivePath = path.join('binaries', archiveName);
  const binaryDir = path.dirname(binaryPath);
  const binaryName = path.basename(binaryPath);

  console.log(`\nCreating archive: ${archiveName}`);

  try {
    if (platform === 'win32') {
      // Create zip archive for Windows
      // Note: This requires zip to be available on the system
      // On Windows CI, 7z or PowerShell Compress-Archive can be used
      if (process.platform === 'win32') {
        execSync(`powershell Compress-Archive -Path "${binaryPath}" -DestinationPath "${archivePath}" -Force`, {
          stdio: 'inherit'
        });
      } else {
        execSync(`cd "${binaryDir}" && zip -q "${path.resolve(archivePath)}" "${binaryName}"`, {
          stdio: 'inherit'
        });
      }
    } else {
      // Create tar.gz archive for Linux/macOS
      execSync(`cd "${binaryDir}" && tar -czf "${path.resolve(archivePath)}" "${binaryName}"`, {
        stdio: 'inherit'
      });
    }

    console.log(`✓ Archive created: ${archivePath}`);
    
    const stats = fs.statSync(archivePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  Size: ${sizeMB} MB`);

    return archivePath;
  } catch (error) {
    console.error(`✗ Failed to create archive:`);
    console.error(error.message);
    throw error;
  }
}

/**
 * Main build function
 */
async function main() {
  const args = process.argv.slice(2);
  let platformsToBuild = PLATFORMS;

  // If platform and arch are specified, build only that combination
  if (args.length >= 2) {
    const [platform, arch] = args;
    platformsToBuild = [{ platform, arch }];
  } else if (args.length === 1) {
    console.error('Error: Both platform and architecture must be specified');
    console.error('Usage: node scripts/build-binary.js [platform] [arch]');
    console.error('Example: node scripts/build-binary.js linux x64');
    process.exit(1);
  }

  console.log('Rediscover Binary Builder');
  console.log('=========================\n');

  // Verify prerequisites
  console.log('Checking prerequisites...');
  
  // Check if dist directories exist
  if (!fs.existsSync('dist')) {
    console.error('✗ Frontend dist/ directory not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  if (!fs.existsSync('backend/dist')) {
    console.error('✗ Backend dist/ directory not found. Build the backend first.');
    process.exit(1);
  }

  console.log('✓ Frontend and backend builds found');

  // Check if pkg is available
  try {
    require.resolve('pkg');
    console.log('✓ pkg is available\n');
  } catch (error) {
    console.error('✗ pkg is not installed. Install it with: npm install -g pkg');
    process.exit(1);
  }

  // Build binaries
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const { platform, arch } of platformsToBuild) {
    try {
      const binaryPath = await buildBinary(platform, arch);
      const archivePath = createArchive(platform, arch, binaryPath);
      
      results.push({
        platform,
        arch,
        success: true,
        binaryPath,
        archivePath
      });
      
      successCount++;
    } catch (error) {
      results.push({
        platform,
        arch,
        success: false,
        error: error.message
      });
      
      failureCount++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Build Summary');
  console.log('='.repeat(60));
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failureCount}\n`);

  if (successCount > 0) {
    console.log('Successfully built binaries:');
    results
      .filter(r => r.success)
      .forEach(r => {
        console.log(`  ✓ ${r.platform}-${r.arch}: ${r.archivePath}`);
      });
  }

  if (failureCount > 0) {
    console.log('\nFailed builds:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  ✗ ${r.platform}-${r.arch}: ${r.error}`);
      });
  }

  console.log('\n' + '='.repeat(60));

  // Exit with error if any builds failed
  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run the build
if (require.main === module) {
  main().catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });
}

module.exports = { buildBinary, createArchive };
