import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/store/appContext";
import { config } from "@/lib/redis-api";
import { Settings, AlertCircle, Save, RefreshCw, Lock } from "lucide-react";
import { toast } from "sonner";

interface ConfigParameter {
  name: string;
  value: string;
  category: 'memory' | 'network' | 'security' | 'persistence' | 'logging' | 'replication' | 'lua' | 'other';
  mutable: boolean;
  dangerous: boolean;
  enumValues?: string[];
  description?: string;
}

interface ConfigState {
  parameters: ConfigParameter[];
  loading: boolean;
  error: string | null;
  modifiedParams: Map<string, string>;
  activeCategory: string;
}

interface DangerousParamDialog {
  open: boolean;
  parameter: ConfigParameter | null;
  newValue: string;
}

const categoryLabels = {
  memory: 'Memory',
  network: 'Network', 
  security: 'Security',
  persistence: 'Persistence',
  logging: 'Logging',
  replication: 'Replication',
  lua: 'Lua',
  other: 'Other'
};

export default function ConfigEditor() {
  const { activeConnectionId } = useApp();
  const [state, setState] = useState<ConfigState>({
    parameters: [],
    loading: true,
    error: null,
    modifiedParams: new Map(),
    activeCategory: 'memory',
  });
  const [dangerousDialog, setDangerousDialog] = useState<DangerousParamDialog>({
    open: false,
    parameter: null,
    newValue: '',
  });

  const fetchConfig = useCallback(async () => {
    if (!activeConnectionId) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const data = await config.getConfig(Number(activeConnectionId));
      setState(prev => ({
        ...prev,
        parameters: data.parameters,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch configuration";
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      toast.error(errorMessage);
    }
  }, [activeConnectionId]);

  // Fetch config on page load and connection change
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Reset state when connection changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      parameters: [],
      loading: true,
      error: null,
      modifiedParams: new Map(),
    }));
  }, [activeConnectionId]);

  const handleParameterChange = (paramName: string, newValue: string) => {
    setState(prev => {
      const newModified = new Map(prev.modifiedParams);
      const param = prev.parameters.find(p => p.name === paramName);
      
      if (param && newValue !== param.value) {
        newModified.set(paramName, newValue);
      } else {
        newModified.delete(paramName);
      }
      
      return {
        ...prev,
        modifiedParams: newModified,
      };
    });
  };

  const handleSaveParameter = async (param: ConfigParameter) => {
    const newValue = state.modifiedParams.get(param.name);
    if (!newValue || !activeConnectionId) return;

    // Check if parameter is dangerous and show warning dialog
    if (param.dangerous) {
      setDangerousDialog({
        open: true,
        parameter: param,
        newValue,
      });
      return;
    }

    await saveParameter(param, newValue);
  };

  const saveParameter = async (param: ConfigParameter, newValue: string) => {
    if (!activeConnectionId) return;

    try {
      await config.setConfig(Number(activeConnectionId), param.name, newValue);
      
      // Update parameter value in state
      setState(prev => {
        const newModified = new Map(prev.modifiedParams);
        newModified.delete(param.name);
        
        const updatedParams = prev.parameters.map(p => 
          p.name === param.name ? { ...p, value: newValue } : p
        );
        
        return {
          ...prev,
          parameters: updatedParams,
          modifiedParams: newModified,
        };
      });
      
      toast.success(`Parameter ${param.name} updated successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update parameter";
      toast.error(errorMessage);
    }
  };

  const handleDangerousConfirm = async () => {
    if (!dangerousDialog.parameter || !dangerousDialog.newValue) return;
    
    await saveParameter(dangerousDialog.parameter, dangerousDialog.newValue);
    setDangerousDialog({ open: false, parameter: null, newValue: '' });
  };

  const getParametersByCategory = (category: string) => {
    return state.parameters.filter(param => param.category === category);
  };

  const renderParameterValue = (param: ConfigParameter) => {
    const currentValue = state.modifiedParams.get(param.name) ?? param.value;
    const isModified = state.modifiedParams.has(param.name);

    if (!param.mutable) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={currentValue}
            readOnly
            className="font-mono text-xs text-[#22d3ee] bg-muted/50"
          />
          <Badge variant="secondary" className="text-xs">
            <Lock className="w-3 h-3 mr-1" />
            Read-only
          </Badge>
        </div>
      );
    }

    if (param.enumValues) {
      return (
        <div className="flex items-center gap-2">
          <Select
            value={currentValue}
            onValueChange={(value) => handleParameterChange(param.name, value)}
          >
            <SelectTrigger className="font-mono text-xs text-[#22d3ee]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {param.enumValues.map((enumValue) => (
                <SelectItem key={enumValue} value={enumValue} className="font-mono text-xs text-[#22d3ee]">
                  {enumValue}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isModified && (
            <Button
              size="sm"
              onClick={() => handleSaveParameter(param)}
              className="h-8"
            >
              <Save className="w-3 h-3 mr-1" />
              Save
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Input
          value={currentValue}
          onChange={(e) => handleParameterChange(param.name, e.target.value)}
          className="font-mono text-xs text-[#22d3ee]"
        />
        {isModified && (
          <Button
            size="sm"
            onClick={() => handleSaveParameter(param)}
            className="h-8"
          >
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        )}
      </div>
    );
  };

  if (state.loading && state.parameters.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state.error && state.parameters.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration Editor
            </h1>
            <p className="text-sm text-muted-foreground">
              View and edit Redis configuration parameters
            </p>
          </div>
        </div>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p>{state.error}</p>
          </div>
          <Button onClick={fetchConfig} className="mt-4" variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const categories = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h1 className="text-xl font-bold">Configuration Editor</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            View and edit Redis configuration parameters
          </p>
        </div>
        <Button onClick={fetchConfig} variant="outline" size="sm" disabled={state.loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${state.loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Configuration Tabs */}
      <Tabs value={state.activeCategory} onValueChange={(value) => setState(prev => ({ ...prev, activeCategory: value }))}>
        <TabsList className="grid w-full grid-cols-8">
          {categories.map((category) => (
            <TabsTrigger key={category} value={category} className="text-xs">
              {categoryLabels[category]}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((category) => (
          <TabsContent key={category} value={category}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{categoryLabels[category]} Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {getParametersByCategory(category).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No {categoryLabels[category].toLowerCase()} parameters found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {getParametersByCategory(category).map((param) => (
                      <div key={param.name} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-[#22d3ee]">{param.name}</span>
                            {param.dangerous && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Dangerous
                              </Badge>
                            )}
                          </div>
                          {param.description && (
                            <p className="text-xs text-muted-foreground">{param.description}</p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          {renderParameterValue(param)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Dangerous Parameter Warning Dialog */}
      <AlertDialog open={dangerousDialog.open} onOpenChange={(open) => setDangerousDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Dangerous Configuration Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to modify <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs text-[#22d3ee]">
                {dangerousDialog.parameter?.name}
              </code>, which is a security-sensitive parameter.
              <br /><br />
              This change could affect Redis security or connectivity. Make sure you understand the implications before proceeding.
              <br /><br />
              New value: <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs text-[#22d3ee]">
                {dangerousDialog.newValue}
              </code>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDangerousConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apply Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}