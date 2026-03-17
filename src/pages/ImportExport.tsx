import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, Download, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";

export default function ImportExport() {
  const { activeConnectionId, activeDb } = useApp();
  const [exportPattern, setExportPattern] = useState("*");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!activeConnectionId) return;
    setExporting(true);
    try {
      const data = await redisApi.exportKeys(activeConnectionId, exportPattern, activeDb);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redis-export-db${activeDb}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${Array.isArray(data) ? data.length : 0} keys`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!activeConnectionId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Import file must be a JSON array');
      const result = await redisApi.importKeys(activeConnectionId, data, activeDb);
      toast.success(`Imported ${result.imported} keys successfully`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileDown className="w-5 h-5" />
        <h1 className="text-xl font-bold">Import / Export</h1>
      </div>

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export" className="text-xs gap-1"><Download className="w-3 h-3" /> Export</TabsTrigger>
          <TabsTrigger value="import" className="text-xs gap-1"><Upload className="w-3 h-3" /> Import</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-3">
          <Card>
            <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Export Keys</CardTitle></CardHeader>
            <Separator />
            <CardContent className="p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Key Pattern</label>
                  <Input value={exportPattern} onChange={(e) => setExportPattern(e.target.value)} className="h-8 text-xs font-mono" placeholder="user:*" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Database</label>
                  <Badge variant="outline" className="text-xs">DB {activeDb}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {exporting ? 'Exporting...' : 'Export'}
                </Button>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Large exports may take time and impact server performance
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="space-y-3">
          <Card>
            <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Import Keys</CardTitle></CardHeader>
            <Separator />
            <CardContent className="p-3 space-y-3">
              <input type="file" ref={fileInputRef} accept=".json" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? (
                  <Loader2 className="w-8 h-8 mx-auto text-primary mb-2 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                )}
                <p className="text-sm font-medium">{importing ? 'Importing...' : 'Drop file here or click to browse'}</p>
                <p className="text-xs text-muted-foreground mt-1">Supports JSON files exported from Rediscover</p>
                <div className="flex justify-center gap-2 mt-3">
                  <Badge variant="outline" className="text-[10px]">.json</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
