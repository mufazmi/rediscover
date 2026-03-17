#!/usr/bin/env node

/**
 * Version Sync Script
 * 
 * Synchronizes version from root package.json to:
 * - backend/package.json
 * - .env.production (VITE_APP_VERSION)
 * - README.md version badge (if exists)
 * - CHANGELOG.md (adds new section if doesn't exist)
 * 
 * This script is run automatically via npm version hook.
 */

const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function syncVersion() {
  try {
    // Read version from root package.json
    const rootPackagePath = path.join(__dirname, '..', 'package.json');
    const rootPackage = readJSON(rootPackagePath);
    const version = rootPackage.version;

    console.log(`[sync-version] Syncing version: ${version}`);

    // 1. Update backend/package.json
    const backendPackagePath = path.join(__dirname, '..', 'backend', 'package.json');
    if (fs.existsSync(backendPackagePath)) {
      const backendPackage = readJSON(backendPackagePath);
      backendPackage.version = version;
      writeJSON(backendPackagePath, backendPackage);
      console.log(`[sync-version] ✓ Updated backend/package.json to ${version}`);
    }

    // 2. Update .env.production
    const envProductionPath = path.join(__dirname, '..', '.env.production');
    let envContent = '';
    
    if (fs.existsSync(envProductionPath)) {
      envContent = fs.readFileSync(envProductionPath, 'utf8');
      // Update existing VITE_APP_VERSION or add it
      if (envContent.includes('VITE_APP_VERSION=')) {
        envContent = envContent.replace(/VITE_APP_VERSION=.*/g, `VITE_APP_VERSION=${version}`);
      } else {
        envContent += `\nVITE_APP_VERSION=${version}\n`;
      }
    } else {
      envContent = `VITE_APP_VERSION=${version}\n`;
    }
    
    fs.writeFileSync(envProductionPath, envContent);
    console.log(`[sync-version] ✓ Updated .env.production with VITE_APP_VERSION=${version}`);

    // 3. Update README.md version badge (if exists)
    const readmePath = path.join(__dirname, '..', 'README.md');
    if (fs.existsSync(readmePath)) {
      let readmeContent = fs.readFileSync(readmePath, 'utf8');
      
      // Look for version badge patterns and update them
      const badgePatterns = [
        /!\[Version\]\([^\)]*badge\/version-[^\)]*\)/g,
        /!\[Version\]\([^\)]*badge\/v-[^\)]*\)/g,
        /version-\d+\.\d+\.\d+/g,
        /v-\d+\.\d+\.\d+/g
      ];
      
      let updated = false;
      for (const pattern of badgePatterns) {
        if (pattern.test(readmeContent)) {
          readmeContent = readmeContent.replace(pattern, (match) => {
            if (match.includes('version-')) {
              return match.replace(/version-\d+\.\d+\.\d+/, `version-${version}`);
            } else if (match.includes('v-')) {
              return match.replace(/v-\d+\.\d+\.\d+/, `v-${version}`);
            }
            return match;
          });
          updated = true;
        }
      }
      
      if (updated) {
        fs.writeFileSync(readmePath, readmeContent);
        console.log(`[sync-version] ✓ Updated README.md version badge to ${version}`);
      } else {
        console.log(`[sync-version] ℹ No version badge found in README.md`);
      }
    }

    // 4. Update CHANGELOG.md (add new section if doesn't exist)
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      let changelogContent = fs.readFileSync(changelogPath, 'utf8');
      
      // Check if version section already exists
      const versionHeader = `## [${version}]`;
      if (!changelogContent.includes(versionHeader)) {
        // Find the position after the "Unreleased" section or at the beginning
        const unreleasedMatch = changelogContent.match(/## \[Unreleased\][\s\S]*?\n(?=## \[|$)/);
        
        const today = new Date().toISOString().split('T')[0];
        const newSection = `\n${versionHeader} - ${today}\n\n### Added\n\n### Changed\n\n### Fixed\n\n`;
        
        if (unreleasedMatch) {
          // Insert after Unreleased section
          const insertPos = unreleasedMatch.index + unreleasedMatch[0].length;
          changelogContent = changelogContent.slice(0, insertPos) + newSection + changelogContent.slice(insertPos);
        } else {
          // Insert after the main header
          const headerMatch = changelogContent.match(/^# .+\n/);
          if (headerMatch) {
            const insertPos = headerMatch.index + headerMatch[0].length;
            changelogContent = changelogContent.slice(0, insertPos) + newSection + changelogContent.slice(insertPos);
          } else {
            // Prepend to file
            changelogContent = newSection + changelogContent;
          }
        }
        
        fs.writeFileSync(changelogPath, changelogContent);
        console.log(`[sync-version] ✓ Added new section to CHANGELOG.md for ${version}`);
      } else {
        console.log(`[sync-version] ℹ CHANGELOG.md already has section for ${version}`);
      }
    } else {
      console.log(`[sync-version] ℹ CHANGELOG.md not found, skipping`);
    }

    console.log(`[sync-version] ✅ Version sync complete!`);
  } catch (error) {
    console.error(`[sync-version] ❌ Error syncing version:`, error.message);
    process.exit(1);
  }
}

// Run the sync
syncVersion();
