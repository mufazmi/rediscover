import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Save, RefreshCw, Download, ExternalLink, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { AboutCard } from "@/components/settings/about-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Settings() {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [lastChecked, setLastChecked] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [releaseUrl, setReleaseUrl] = useState<string>('');
  const [installMethod, setInstallMethod] = useState<string>('');
  const [updateInstructions, setUpdateInstructions] = useState<string>('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCurrentVersion();
    loadCachedUpdateInfo();
  }, []);

  const loadCurrentVersion = async () => {
    try {
      // Try to get version from environment variable first
      const envVersion = import.meta.env.VITE_APP_VERSION;
      if (envVersion) {
        setCurrentVersion(envVersion);
      } else {
        // Fallback to API
        const response = await fetch('/api/version/current');
        if (response.ok) {
          const data = await response.json();
          setCurrentVersion(data.version);
        }
      }
    } catch (error) {
      console.error('Failed to load current version:', error);
    }
  };

  const loadCachedUpdateInfo = () => {
    const cachedData = localStorage.getItem('updateCheckCache');
    const cacheTimestamp = localStorage.getItem('updateCheckCacheTimestamp');
    
    if (cachedData && cacheTimestamp) {
      const data = JSON.parse(cachedData);
      setLatestVersion(data.version);
      setHasUpdate(data.hasUpdate);
      setReleaseUrl(data.releaseUrl);
      setLastChecked(new Date(parseInt(cacheTimestamp)).toLocaleString());
    }
  };

  const checkForUpdates = async (bypassCache = false) => {
    setChecking(true);
    try {
      // Clear cache if bypassing
      if (bypassCache) {
        localStorage.removeItem('updateCheckCache');
        localStorage.removeItem('updateCheckCacheTimestamp');
      }

      const response = await fetch('/api/version/latest');
      if (!response.ok) {
        throw new Error('Failed to check for updates');
      }

      const data = await response.json();
      
      // Update state
      setLatestVersion(data.version);
      setHasUpdate(data.hasUpdate);
      setReleaseUrl(data.releaseUrl);
      const now = Date.now();
      setLastChecked(new Date(now).toLocaleString());

      // Update cache
      localStorage.setItem('updateCheckCache', JSON.stringify(data));
      localStorage.setItem('updateCheckCacheTimestamp', now.toString());

      toast({
        title: data.hasUpdate ? 'Update Available' : 'Up to Date',
        description: data.hasUpdate 
          ? `Version ${data.version} is available!`
          : 'You are running the latest version.',
      });
    } catch (error) {
      console.error('Failed to check for updates:', error);
      toast({
        title: 'Error',
        description: 'Failed to check for updates. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  const showUpdateInstructions = async () => {
    try {
      const response = await fetch('/api/version/update-instructions');
      if (!response.ok) {
        throw new Error('Failed to fetch update instructions');
      }

      const data = await response.json();
      setInstallMethod(data.installMethod);
      setUpdateInstructions(data.instructions);
      setShowInstructions(true);
    } catch (error) {
      console.error('Failed to fetch update instructions:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch update instructions. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(updateInstructions);
    toast({
      title: 'Copied!',
      description: 'Update instructions copied to clipboard.',
    });
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Key namespace separator</p>
              <p className="text-[10px] text-muted-foreground">Character used to split key namespaces in tree view</p>
            </div>
            <Input defaultValue=":" className="h-7 w-16 text-center text-xs font-mono" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Auto-refresh interval</p>
              <p className="text-[10px] text-muted-foreground">Dashboard stats refresh rate</p>
            </div>
            <Select defaultValue="5">
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 seconds</SelectItem>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">SCAN count per iteration</p>
              <p className="text-[10px] text-muted-foreground">Number of keys loaded per SCAN call</p>
            </div>
            <Input defaultValue="100" className="h-7 w-20 text-center text-xs font-mono" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Enable user registration</p>
              <p className="text-[10px] text-muted-foreground">Allow new users to create accounts</p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Dangerous command confirmation</p>
              <p className="text-[10px] text-muted-foreground">Require typing confirmation for FLUSH, DEL, etc.</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Security</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">JWT Token Expiry</p>
              <p className="text-[10px] text-muted-foreground">Session token lifetime</p>
            </div>
            <Select defaultValue="24h">
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="8h">8 hours</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Rate limit login</p>
              <p className="text-[10px] text-muted-foreground">Max login attempts per 15 minutes</p>
            </div>
            <Input defaultValue="10" className="h-7 w-16 text-center text-xs font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Version & Updates</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Current Version</p>
              <p className="text-[10px] text-muted-foreground">Installed version of Rediscover</p>
            </div>
            <span className="text-xs font-mono">{currentVersion || 'Loading...'}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Latest Version</p>
              <p className="text-[10px] text-muted-foreground">Most recent release available</p>
            </div>
            <span className="text-xs font-mono">{latestVersion || 'Not checked'}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Last Checked</p>
              <p className="text-[10px] text-muted-foreground">When updates were last checked</p>
            </div>
            <span className="text-xs text-muted-foreground">{lastChecked || 'Never'}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Installation Method</p>
              <p className="text-[10px] text-muted-foreground">How Rediscover was installed</p>
            </div>
            <span className="text-xs capitalize">{installMethod || 'Unknown'}</span>
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="gap-1 w-full"
              onClick={() => checkForUpdates(true)}
              disabled={checking}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Check for Updates'}
            </Button>
            {hasUpdate && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                      Update Available: v{latestVersion}
                    </p>
                    <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
                      A new version is ready to install
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="default"
                    className="gap-1 flex-1"
                    onClick={showUpdateInstructions}
                  >
                    <Download className="w-3 h-3" />
                    Update Now
                  </Button>
                  {releaseUrl && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="gap-1"
                      onClick={() => window.open(releaseUrl, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Release Notes
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AboutCard />

      <Button size="sm" className="gap-1">
        <Save className="w-3.5 h-3.5" /> Save Settings
      </Button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update Rediscover</DialogTitle>
            <DialogDescription>
              Follow these instructions to update to v{latestVersion}
              {installMethod && (
                <span className="block mt-1 text-xs">
                  Installation method detected: <strong>{installMethod}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {updateInstructions && (
            <>
              <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 p-4 rounded text-sm overflow-auto max-h-96">
                {updateInstructions}
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
    </div>
  );
}
