/**
 * Version Service
 * 
 * Manages version information, update checking, and installation method detection.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface VersionInfo {
  version: string;
  buildDate?: string;
  gitCommit?: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

interface LatestVersionInfo {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  hasUpdate: boolean;
  cached: boolean;
  cacheExpiresAt: string;
}

interface UpdateInstructions {
  installMethod: string;
  instructions: string;
}

class VersionService {
  private packageJson: any;
  private latestVersionCache: {
    data: LatestVersionInfo | null;
    expiresAt: number;
  } = {
    data: null,
    expiresAt: 0
  };

  constructor() {
    // Read package.json at startup
    const packagePath = join(__dirname, '../../../package.json');
    try {
      this.packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    } catch (error) {
      console.error('[VersionService] Failed to read package.json:', error);
      this.packageJson = { version: '0.0.0' };
    }
  }

  /**
   * Get current version information
   */
  getCurrentVersion(): VersionInfo {
    return {
      version: this.packageJson.version,
      buildDate: process.env.BUILD_DATE,
      gitCommit: process.env.GIT_COMMIT,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Get latest version from GitHub with 1-hour caching
   */
  async getLatestVersion(): Promise<LatestVersionInfo> {
    const now = Date.now();

    // Return cached version if still valid
    if (this.latestVersionCache.data && now < this.latestVersionCache.expiresAt) {
      return {
        ...this.latestVersionCache.data,
        cached: true
      };
    }

    try {
      // Use dynamic import for node-fetch in ESM context
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(
        'https://api.github.com/repos/mufazmi/rediscover/releases/latest',
        {
          timeout: 5000,
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Rediscover'
          }
        } as any
      );

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const data: any = await response.json();
      const latestVersion = data.tag_name.replace(/^v/, '');
      const currentVersion = this.packageJson.version;
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

      const result: LatestVersionInfo = {
        version: latestVersion,
        releaseUrl: data.html_url,
        publishedAt: data.published_at,
        hasUpdate,
        cached: false,
        cacheExpiresAt: new Date(now + 3600000).toISOString() // 1 hour
      };

      // Cache the result
      this.latestVersionCache = {
        data: result,
        expiresAt: now + 3600000 // 1 hour in milliseconds
      };

      return result;
    } catch (error) {
      console.error('[VersionService] Failed to fetch latest version:', error);
      
      // If we have cached data, return it even if expired
      if (this.latestVersionCache.data) {
        return {
          ...this.latestVersionCache.data,
          cached: true
        };
      }

      // Otherwise, return current version as latest
      return {
        version: this.packageJson.version,
        releaseUrl: '',
        publishedAt: '',
        hasUpdate: false,
        cached: false,
        cacheExpiresAt: new Date(now + 300000).toISOString() // 5 minutes
      };
    }
  }

  /**
   * Compare two semantic version strings
   * 
   * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  /**
   * Detect installation method from environment markers
   */
  detectInstallationMethod(): string {
    // Check environment variables and file markers
    if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST) {
      return 'docker';
    }

    if (process.env.SNAP) {
      return 'snap';
    }

    // Check if running from npm global installation
    if (process.argv[0].includes('node_modules')) {
      return 'npm';
    }

    // Check if running from Homebrew
    if (process.argv[0].includes('/usr/local/Cellar') || process.argv[0].includes('/opt/homebrew')) {
      return 'homebrew';
    }

    // Default to binary
    return 'binary';
  }

  /**
   * Get installation-method-specific update instructions
   */
  getUpdateInstructions(installMethod?: string): UpdateInstructions {
    const method = installMethod || this.detectInstallationMethod();
    
    const instructions: Record<string, string> = {
      docker: `To update Rediscover running in Docker:

1. Pull the latest image:
   docker pull mufazmi/rediscover:latest

2. Restart your container:
   docker-compose down && docker-compose up -d

Your data in /app/data will be preserved.`,

      npm: `To update Rediscover installed via npm:

npm update -g rediscover

Then restart the server:
rediscover stop
rediscover start`,

      homebrew: `To update Rediscover installed via Homebrew:

brew update
brew upgrade rediscover

Then restart the service:
brew services restart rediscover`,

      snap: `To update Rediscover installed via Snap:

snap refresh rediscover

The service will restart automatically.`,

      binary: `To update Rediscover standalone binary:

1. Download the latest version for your platform from:
   https://github.com/mufazmi/rediscover/releases/latest

2. Replace the existing binary with the new one

3. Restart Rediscover`
    };

    return {
      installMethod: method,
      instructions: instructions[method] || instructions.binary
    };
  }
}

export default new VersionService();
