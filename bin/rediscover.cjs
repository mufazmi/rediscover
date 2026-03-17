#!/usr/bin/env node

/**
 * Rediscover CLI Tool
 * 
 * Command-line interface for managing Rediscover installations.
 * Provides commands for starting, stopping, and managing the server.
 * 
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const os = require('os');

const program = new Command();

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.rediscover');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PID_FILE = path.join(CONFIG_DIR, 'rediscover.pid');
const LOG_FILE = path.join(CONFIG_DIR, 'rediscover.log');
const DATA_DIR = path.join(CONFIG_DIR, 'data');

// Default configuration
const DEFAULT_CONFIG = {
  port: 6377,
  dataDir: DATA_DIR,
  autoStart: false,
  logLevel: 'info'
};

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file
 */
function loadConfig() {
  ensureConfigDir();
  
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULT_CONFIG, ...fileConfig };
    } catch (error) {
      console.error(`Error reading config file: ${error.message}`);
      console.error('Using default configuration');
      return DEFAULT_CONFIG;
    }
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  ensureConfigDir();
  
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error saving config file: ${error.message}`);
    throw error;
  }
}

/**
 * Validate configuration value
 */
function validateConfigValue(key, value) {
  switch (key) {
    case 'port':
      const port = parseInt(value);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Port must be a number between 1 and 65535');
      }
      return port;
    
    case 'autoStart':
      if (value !== 'true' && value !== 'false') {
        throw new Error('autoStart must be "true" or "false"');
      }
      return value === 'true';
    
    case 'logLevel':
      const validLevels = ['error', 'warn', 'info', 'debug'];
      if (!validLevels.includes(value)) {
        throw new Error(`logLevel must be one of: ${validLevels.join(', ')}`);
      }
      return value;
    
    case 'dataDir':
      // Validate that it's a valid path
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('dataDir must be a non-empty string');
      }
      return value;
    
    default:
      // Allow unknown keys for forward compatibility
      return value;
  }
}

/**
 * Check if server is running
 */
function isRunning() {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }
  
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    
    // Check if process exists
    try {
      process.kill(pid, 0);
      return pid;
    } catch (e) {
      // Process doesn't exist, clean up stale PID file
      fs.unlinkSync(PID_FILE);
      return false;
    }
  } catch (error) {
    console.error(`Error reading PID file: ${error.message}`);
    return false;
  }
}

/**
 * Display ASCII art banner
 */
function displayBanner() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║              🚀 Rediscover - Redis Management              ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
}

// Get package version
const packageJson = require('../package.json');

program
  .name('rediscover')
  .description('Rediscover - Self-hosted Redis management tool')
  .version(packageJson.version);

/**
 * Start command
 */
program
  .command('start')
  .description('Start Rediscover server')
  .option('-p, --port <port>', 'Port to run on')
  .option('-d, --data-dir <dir>', 'Data directory')
  .option('--no-browser', 'Do not open browser automatically')
  .action((options) => {
    const pid = isRunning();
    if (pid) {
      console.log(`Rediscover is already running (PID: ${pid})`);
      console.log(`Access it at http://localhost:${loadConfig().port}`);
      return;
    }

    const config = loadConfig();
    
    // Command-line flags take precedence over config file
    const port = options.port ? parseInt(options.port) : config.port;
    const dataDir = options.dataDir || config.dataDir;
    // Browser auto-open is enabled by default unless --no-browser is specified
    const shouldOpenBrowser = options.browser !== false;

    // Validate port
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('Error: Port must be a number between 1 and 65535');
      process.exit(1);
    }

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (error) {
        console.error(`Error creating data directory: ${error.message}`);
        process.exit(1);
      }
    }

    displayBanner();
    console.log(`Starting Rediscover on port ${port}...`);

    // Path to backend server
    const serverPath = path.join(__dirname, '../backend/dist/server.js');
    
    // Check if server file exists
    if (!fs.existsSync(serverPath)) {
      console.error(`Error: Backend server not found at ${serverPath}`);
      console.error('Please ensure Rediscover is properly installed');
      process.exit(1);
    }

    // Start server as daemon
    const child = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: port.toString(),
        DATABASE_PATH: path.join(dataDir, 'rediscover.db'),
        NODE_ENV: 'production'
      }
    });

    // Give the process a moment to start
    setTimeout(() => {
      // Check if process is still running
      try {
        process.kill(child.pid, 0);
        
        // Process is running, write PID file
        try {
          fs.writeFileSync(PID_FILE, child.pid.toString());
          
          console.log(`✓ Rediscover started successfully (PID: ${child.pid})`);
          console.log(`✓ Server running at http://localhost:${port}`);
          console.log(`✓ Logs: ${LOG_FILE}`);
          console.log('');
          console.log('Use "rediscover stop" to stop the server');
          console.log('Use "rediscover logs" to view logs');
          console.log('');

          // Open browser automatically unless --no-browser flag is provided
          if (shouldOpenBrowser) {
            setTimeout(() => {
              const url = `http://localhost:${port}`;
              const start = process.platform === 'darwin' ? 'open' :
                            process.platform === 'win32' ? 'start' : 'xdg-open';
              exec(`${start} ${url}`, (error) => {
                if (error) {
                  console.log(`Note: Could not open browser automatically. Please visit ${url}`);
                }
              });
            }, 2000);
          }
        } catch (error) {
          console.error(`Error writing PID file: ${error.message}`);
          child.kill();
          process.exit(1);
        }
      } catch (e) {
        console.error('Error: Server failed to start');
        console.error('Check the logs for more details');
        process.exit(1);
      }
    }, 1000);

    child.unref();
  });

/**
 * Stop command
 */
program
  .command('stop')
  .description('Stop Rediscover server')
  .action(() => {
    const pid = isRunning();
    if (!pid) {
      console.log('Rediscover is not running');
      return;
    }

    try {
      console.log(`Stopping Rediscover (PID: ${pid})...`);
      process.kill(pid, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      setTimeout(() => {
        try {
          // Check if process is still running
          process.kill(pid, 0);
          // If we get here, process is still running, force kill
          console.log('Forcing shutdown...');
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // Process has stopped
        }
        
        // Clean up PID file
        if (fs.existsSync(PID_FILE)) {
          fs.unlinkSync(PID_FILE);
        }
        
        console.log('✓ Rediscover stopped successfully');
      }, 2000);
    } catch (error) {
      console.error(`Error stopping Rediscover: ${error.message}`);
      
      // Clean up PID file anyway
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
      
      process.exit(1);
    }
  });

/**
 * Status command
 */
program
  .command('status')
  .description('Show Rediscover status')
  .action(() => {
    const pid = isRunning();
    const config = loadConfig();
    const version = packageJson.version;

    console.log('');
    console.log('Rediscover Status');
    console.log('═════════════════');
    console.log(`Version:        v${version}`);
    console.log(`Status:         ${pid ? `Running (PID: ${pid})` : 'Stopped'}`);
    console.log(`Port:           ${config.port}`);
    console.log(`Data directory: ${config.dataDir}`);
    console.log(`Log file:       ${LOG_FILE}`);
    
    if (pid) {
      console.log(`URL:            http://localhost:${config.port}`);
    }
    
    console.log('');
  });

/**
 * Logs command
 */
program
  .command('logs')
  .description('Show recent logs')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action((options) => {
    if (!fs.existsSync(LOG_FILE)) {
      console.log('No logs found');
      console.log(`Log file: ${LOG_FILE}`);
      return;
    }

    if (options.follow) {
      console.log('Following logs (Ctrl+C to stop)...');
      console.log('');
      
      const tail = spawn('tail', ['-f', '-n', options.lines, LOG_FILE], {
        stdio: 'inherit'
      });
      
      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      const tail = spawn('tail', ['-n', options.lines, LOG_FILE]);
      tail.stdout.pipe(process.stdout);
      tail.stderr.pipe(process.stderr);
    }
  });

/**
 * Export command
 */
program
  .command('export')
  .description('Export database backup')
  .option('-o, --output <file>', 'Output file path')
  .action((options) => {
    const config = loadConfig();
    const dbPath = path.join(config.dataDir, 'rediscover.db');
    
    if (!fs.existsSync(dbPath)) {
      console.error('Error: Database not found');
      console.error(`Expected location: ${dbPath}`);
      process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const output = options.output || `rediscover-backup-${timestamp}.db`;
    
    try {
      fs.copyFileSync(dbPath, output);
      console.log(`✓ Database exported successfully`);
      console.log(`  Output: ${path.resolve(output)}`);
    } catch (error) {
      console.error(`Error exporting database: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Reset command
 */
program
  .command('reset')
  .description('Reset database (requires confirmation)')
  .action(() => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('');
    console.log('⚠️  WARNING: This will delete all your data!');
    console.log('');
    console.log('This action will:');
    console.log('  • Delete all Redis connections');
    console.log('  • Delete all saved queries');
    console.log('  • Delete all settings');
    console.log('');

    readline.question('Type "yes" to confirm: ', (answer) => {
      if (answer.toLowerCase() === 'yes') {
        const config = loadConfig();
        const dbPath = path.join(config.dataDir, 'rediscover.db');
        
        if (fs.existsSync(dbPath)) {
          try {
            fs.unlinkSync(dbPath);
            console.log('✓ Database reset successfully');
            console.log('');
            console.log('Start Rediscover to create a fresh database:');
            console.log('  rediscover start');
          } catch (error) {
            console.error(`Error resetting database: ${error.message}`);
            process.exit(1);
          }
        } else {
          console.log('No database found to reset');
        }
      } else {
        console.log('Reset cancelled');
      }
      
      readline.close();
    });
  });

/**
 * Config commands
 */
const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const config = loadConfig();
    
    console.log('');
    console.log('Rediscover Configuration');
    console.log('════════════════════════');
    console.log(JSON.stringify(config, null, 2));
    console.log('');
    console.log(`Config file: ${CONFIG_FILE}`);
    console.log('');
  });

configCmd
  .command('get <key>')
  .description('Get configuration value')
  .action((key) => {
    const config = loadConfig();
    
    if (key in config) {
      console.log(config[key]);
    } else {
      console.log('Not set');
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set configuration value')
  .action((key, value) => {
    const config = loadConfig();
    
    try {
      // Validate and parse value
      const validatedValue = validateConfigValue(key, value);
      config[key] = validatedValue;
      
      saveConfig(config);
      console.log(`✓ Configuration updated: ${key} = ${JSON.stringify(config[key])}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Update command
 */
program
  .command('update')
  .description('Check for updates and show update instructions')
  .action(() => {
    console.log('Checking for updates...');
    console.log('');
    console.log('To update Rediscover installed via npm:');
    console.log('  npm update -g rediscover');
    console.log('');
    console.log('For other installation methods, visit:');
    console.log('  https://github.com/mufazmi/rediscover/releases/latest');
  });

// Parse command-line arguments
program.parse();
