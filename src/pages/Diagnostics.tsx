import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/store/appContext";
import { diagnostics } from "@/lib/redis-api";
import {
  Activity, AlertCircle, RefreshCw, Copy, CheckCircle, AlertTriangle, XCircle
} from "lucide-react";
import { toast } from "sonner";

interface HealthCheck {
  category: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  recommendation?: string;
  command?: string;
}

interface HealthCheckCardProps {
  category: string;
  checks: HealthCheck[];
  onCopyCommand: (command: string) => void;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  memory: Activity,
  persistence: CheckCircle,
  performance: Activity,
  connections: Activity,
  replication: Activity,
  security: AlertTriangle,
  keyspace: Activity,
};

const statusColors = {
  healthy: "bg-green-500/20 text-green-400 border-green-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const statusIcons = {
  healthy: CheckCircle,
  warning: AlertTriangle,
  critical: XCircle,
};

function HealthCheckCard({ category, checks, onCopyCommand }: HealthCheckCardProps) {
  const Icon = categoryIcons[category] || Activity;
  const categoryChecks = checks.filter(check => check.category === category);
  
  // Determine overall status for the category
  const hasCritical = categoryChecks.some(check => check.status === 'critical');
  const hasWarning = categoryChecks.some(check => check.status === 'warning');
  const overallStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';
  
  const StatusIcon = statusIcons[overallStatus];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm capitalize">{category}</CardTitle>
          </div>
          <Badge variant="outline" className={`text-xs ${statusColors[overallStatus]}`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {overallStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {categoryChecks.length === 0 ? (
          <div className="text-sm text-muted-foreground">No issues detected</div>
        ) : (
          <div className="space-y-3">
            {categoryChecks.map((check, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    check.status === 'healthy' ? 'bg-green-500' :
                    check.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{check.message}</p>
                    {check.recommendation && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {check.recommendation}
                      </p>
                    )}
                    {check.command && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-[#22d3ee] flex-1">
                          {check.command}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => onCopyCommand(check.command!)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Diagnostics() {
  const { activeConnectionId, activeDb } = useApp();
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  const categories = ['memory', 'persistence', 'performance', 'connections', 'replication', 'security', 'keyspace'];

  const runDiagnostics = useCallback(async () => {
    if (!activeConnectionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await diagnostics.runDiagnostics(Number(activeConnectionId), activeDb);
      // Extract checks array from nested response structure
      const checksArray = (result as any).checks || result;
      // Type assertion to ensure the status is properly typed
      const typedChecks: HealthCheck[] = checksArray.map((check: any) => ({
        ...check,
        status: check.status as 'healthy' | 'warning' | 'critical'
      }));
      setChecks(typedChecks);
      setLastAnalyzed(new Date());
      toast.success('Diagnostics completed successfully');
    } catch (e: unknown) {
      const errorMessage = (e as Error).message;
      setError(errorMessage);
      toast.error(`Failed to run diagnostics: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [activeConnectionId, activeDb]);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const handleReanalyze = () => {
    runDiagnostics();
  };

  // Auto-run diagnostics on page load
  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  if (loading && !checks.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !checks.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Diagnostics Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Automated health checks and recommendations
            </p>
          </div>
        </div>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
          <Button onClick={handleReanalyze} className="mt-4" variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Diagnostics Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Automated health checks and recommendations
            {lastAnalyzed && (
              <span className="ml-2">
                • Last analyzed: {lastAnalyzed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button 
          onClick={handleReanalyze} 
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Re-analyze
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(category => (
          <HealthCheckCard
            key={category}
            category={category}
            checks={checks}
            onCopyCommand={handleCopyCommand}
          />
        ))}
      </div>
    </div>
  );
}