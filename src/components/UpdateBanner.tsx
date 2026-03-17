import { useState, useEffect } from 'react';
import { X, Download, Copy, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface VersionInfo {
  version: string;
  releaseUrl: string;
  hasUpdate: boolean;
}

interface UpdateInstructions {
  installMethod: string;
  instructions: string;
}

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState<UpdateInstructions | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    // Check if dismissed in last 24 hours
    const dismissedUntil = localStorage.getItem('updateBannerDismissedUntil');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
      return;
    }

    // Check cache with 1-hour TTL
    const cachedData = localStorage.getItem('updateCheckCache');
    const cacheTimestamp = localStorage.getItem('updateCheckCacheTimestamp');
    
    if (cachedData && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp);
      if (cacheAge < 3600000) { // 1 hour in milliseconds
        const data = JSON.parse(cachedData);
        if (data.hasUpdate) {
          setUpdateInfo(data);
        }
        return;
      }
    }

    try {
      const response = await fetch('/api/version/latest');
      if (!response.ok) {
        console.error('Failed to check for updates:', response.statusText);
        return;
      }

      const data = await response.json();

      // Cache the result
      localStorage.setItem('updateCheckCache', JSON.stringify(data));
      localStorage.setItem('updateCheckCacheTimestamp', Date.now().toString());

      if (data.hasUpdate) {
        setUpdateInfo(data);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Dismiss for 24 hours
    const dismissUntil = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem('updateBannerDismissedUntil', dismissUntil.toString());
  };

  const handleShowInstructions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/version/update-instructions');
      if (!response.ok) {
        throw new Error('Failed to fetch update instructions');
      }

      const data = await response.json();
      setInstructions(data);
      setShowInstructions(true);
    } catch (error) {
      console.error('Failed to fetch update instructions:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch update instructions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (instructions) {
      navigator.clipboard.writeText(instructions.instructions);
      toast({
        title: 'Copied!',
        description: 'Update instructions copied to clipboard.',
      });
    }
  };

  if (!updateInfo || dismissed || !updateInfo.hasUpdate) {
    return null;
  }

  return (
    <>
      <Alert className="mb-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
        <Download className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-sm">
            A new version of Rediscover is available: <strong>v{updateInfo.version}</strong>
            {' '}
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              View release notes
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleShowInstructions}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Update Now'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update Rediscover</DialogTitle>
            <DialogDescription>
              Follow these instructions to update to v{updateInfo.version}
              {instructions && (
                <span className="block mt-1 text-xs">
                  Installation method detected: <strong>{instructions.installMethod}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {instructions && (
            <>
              <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 p-4 rounded text-sm overflow-auto max-h-96">
                {instructions.instructions}
              </pre>
              <div className="flex gap-2">
                <Button
                  onClick={handleCopyToClipboard}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowInstructions(false)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
