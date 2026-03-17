/**
 * Version Routes
 * 
 * Provides version information and update checking endpoints.
 * No authentication required for version checking.
 */

import { Router, Request, Response } from 'express';
import versionService from '../services/version.service';

const router = Router();

/**
 * GET /api/version/current
 * 
 * Returns current version and build information.
 */
router.get('/current', (_req: Request, res: Response) => {
  try {
    const versionInfo = versionService.getCurrentVersion();
    res.json(versionInfo);
  } catch (error) {
    console.error('[Version API] Error getting current version:', error);
    res.status(500).json({ error: 'Failed to get current version' });
  }
});

/**
 * GET /api/version/latest
 * 
 * Returns latest version from GitHub releases with update availability.
 */
router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const latestInfo = await versionService.getLatestVersion();
    res.json(latestInfo);
  } catch (error) {
    console.error('[Version API] Error getting latest version:', error);
    res.status(500).json({ error: 'Failed to fetch latest version' });
  }
});

/**
 * GET /api/version/update-instructions
 * 
 * Returns installation-method-specific update instructions.
 */
router.get('/update-instructions', (_req: Request, res: Response) => {
  try {
    const instructions = versionService.getUpdateInstructions();
    res.json(instructions);
  } catch (error) {
    console.error('[Version API] Error getting update instructions:', error);
    res.status(500).json({ error: 'Failed to get update instructions' });
  }
});

export default router;
