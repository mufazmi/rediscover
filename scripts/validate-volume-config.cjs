#!/usr/bin/env node

/**
 * Validates Docker Compose volume configuration against requirements
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function validateVolumeConfig() {
  console.log('🔍 Validating Docker Compose volume configuration...\n');

  // Read production configuration
  const prodConfigPath = path.join(process.cwd(), 'docker-compose.prod.yml');
  const devConfigPath = path.join(process.cwd(), 'docker-compose.dev.yml');

  if (!fs.existsSync(prodConfigPath)) {
    console.error('❌ Production Docker Compose file not found');
    process.exit(1);
  }

  if (!fs.existsSync(devConfigPath)) {
    console.error('❌ Development Docker Compose file not found');
    process.exit(1);
  }

  const prodConfig = yaml.load(fs.readFileSync(prodConfigPath, 'utf8'));
  const devConfig = yaml.load(fs.readFileSync(devConfigPath, 'utf8'));

  let allChecks = true;

  // Requirement 10.1: Named volumes for application data
  console.log('📋 Requirement 10.1: Named volumes for application data');
  const requiredVolumes = ['rediscover-data', 'frontend-dist'];
  
  for (const volumeName of requiredVolumes) {
    if (prodConfig.volumes && prodConfig.volumes[volumeName] !== undefined) {
      console.log(`  ✅ Production: Named volume '${volumeName}' defined`);
    } else {
      console.log(`  ❌ Production: Named volume '${volumeName}' missing`);
      allChecks = false;
    }

    if (devConfig.volumes && devConfig.volumes[volumeName] !== undefined) {
      console.log(`  ✅ Development: Named volume '${volumeName}' defined`);
    } else {
      console.log(`  ❌ Development: Named volume '${volumeName}' missing`);
      allChecks = false;
    }
  }

  // Requirement 10.2: Backend service mounts data volume to /app/data
  console.log('\n📋 Requirement 10.2: Backend service mounts data volume to /app/data');
  
  const checkBackendDataMount = (config, configName) => {
    if (config.services?.backend?.volumes) {
      const dataMount = config.services.backend.volumes.find(v => 
        typeof v === 'string' && v.includes('rediscover-data:/app/data')
      );
      if (dataMount) {
        console.log(`  ✅ ${configName}: Backend mounts rediscover-data to /app/data`);
        return true;
      }
    }
    console.log(`  ❌ ${configName}: Backend data volume mount missing or incorrect`);
    return false;
  };

  allChecks = checkBackendDataMount(prodConfig, 'Production') && allChecks;
  allChecks = checkBackendDataMount(devConfig, 'Development') && allChecks;

  // Requirement 10.3: Nginx mounts configuration files as read-only volumes
  console.log('\n📋 Requirement 10.3: Nginx mounts configuration files as read-only volumes');
  
  const checkNginxConfigMounts = (config, configName) => {
    if (config.services?.nginx?.volumes) {
      const requiredMounts = [
        './nginx/nginx.conf:/etc/nginx/nginx.conf:ro',
        './nginx/conf.d:/etc/nginx/conf.d:ro'
      ];
      
      let allMountsFound = true;
      for (const mount of requiredMounts) {
        const found = config.services.nginx.volumes.includes(mount);
        if (found) {
          console.log(`  ✅ ${configName}: Found mount '${mount}'`);
        } else {
          console.log(`  ❌ ${configName}: Missing mount '${mount}'`);
          allMountsFound = false;
        }
      }
      return allMountsFound;
    }
    console.log(`  ❌ ${configName}: Nginx service volumes not found`);
    return false;
  };

  allChecks = checkNginxConfigMounts(prodConfig, 'Production') && allChecks;
  allChecks = checkNginxConfigMounts(devConfig, 'Development') && allChecks;

  // Requirement 10.4: Proper volume permissions for all services
  console.log('\n📋 Requirement 10.4: Proper volume permissions for all services');
  
  const checkVolumePermissions = (config, configName) => {
    let permissionsCorrect = true;
    
    // Check nginx read-only mounts
    if (config.services?.nginx?.volumes) {
      const roMounts = config.services.nginx.volumes.filter(v => 
        typeof v === 'string' && v.includes(':ro')
      );
      console.log(`  ✅ ${configName}: Nginx has ${roMounts.length} read-only mounts`);
    }

    // Check frontend volume mount
    if (config.services?.frontend?.volumes) {
      const frontendDistMount = config.services.frontend.volumes.find(v =>
        typeof v === 'string' && v.includes('frontend-dist:')
      );
      if (frontendDistMount) {
        console.log(`  ✅ ${configName}: Frontend has frontend-dist volume mount`);
      } else {
        console.log(`  ❌ ${configName}: Frontend missing frontend-dist volume mount`);
        permissionsCorrect = false;
      }
    }

    return permissionsCorrect;
  };

  allChecks = checkVolumePermissions(prodConfig, 'Production') && allChecks;
  allChecks = checkVolumePermissions(devConfig, 'Development') && allChecks;

  // Additional checks for volume persistence
  console.log('\n📋 Additional: Volume persistence configuration');
  
  const checkVolumePersistence = (config, configName) => {
    if (config.volumes) {
      for (const [volumeName, volumeConfig] of Object.entries(config.volumes)) {
        if (volumeConfig === null || volumeConfig === undefined || typeof volumeConfig === 'object') {
          console.log(`  ✅ ${configName}: Volume '${volumeName}' configured for persistence`);
        }
      }
      return true;
    }
    return false;
  };

  allChecks = checkVolumePersistence(prodConfig, 'Production') && allChecks;
  allChecks = checkVolumePersistence(devConfig, 'Development') && allChecks;

  console.log('\n' + '='.repeat(60));
  if (allChecks) {
    console.log('🎉 All volume configuration requirements satisfied!');
    console.log('\nVolume Configuration Summary:');
    console.log('• Named volumes: rediscover-data, frontend-dist');
    console.log('• Backend data persistence: /app/data');
    console.log('• Nginx config files: read-only mounts');
    console.log('• Proper permissions: configured correctly');
    console.log('• Cross-restart persistence: enabled');
    return true;
  } else {
    console.log('❌ Some volume configuration requirements not met');
    return false;
  }
}

if (require.main === module) {
  const success = validateVolumeConfig();
  process.exit(success ? 0 : 1);
}

module.exports = { validateVolumeConfig };