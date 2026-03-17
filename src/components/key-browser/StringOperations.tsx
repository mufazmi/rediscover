import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { stringOps } from "@/lib/redis-api";
import { Save, Plus, TrendingUp, TrendingDown, Type } from "lucide-react";
import { toast } from "sonner";

interface StringOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: string;
  onValueChange: (newValue: string) => void;
}

type FormatType = 'raw' | 'json' | 'base64' | 'hex';

interface AppendDialogState {
  open: boolean;
  value: string;
  loading: boolean;
}

export default function StringOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: StringOperationsProps) {
  const [format, setFormat] = useState<FormatType>('raw');
  const [editedValue, setEditedValue] = useState(currentValue);
  const [appendDialog, setAppendDialog] = useState<AppendDialogState>({
    open: false,
    value: '',
    loading: false,
  });
  const [loading, setLoading] = useState(false);

  // Update edited value when current value changes
  useEffect(() => {
    setEditedValue(currentValue);
  }, [currentValue]);

  // Check if value is numeric for INCR/DECR buttons
  const isNumeric = useCallback(() => {
    const trimmed = currentValue.trim();
    return /^-?\d+$/.test(trimmed);
  }, [currentValue]);

  // Format value based on selected format
  const getFormattedValue = useCallback(() => {
    try {
      switch (format) {
        case 'json':
          return JSON.stringify(JSON.parse(editedValue), null, 2);
        case 'base64':
          return btoa(editedValue);
        case 'hex':
          return Array.from(new TextEncoder().encode(editedValue))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join(' ');
        case 'raw':
        default:
          return editedValue;
      }
    } catch {
      // If formatting fails, return raw value
      return editedValue;
    }
  }, [editedValue, format]);

  // Parse formatted value back to raw
  const parseFormattedValue = useCallback((formattedValue: string) => {
    try {
      switch (format) {
        case 'json':
          return JSON.stringify(JSON.parse(formattedValue));
        case 'base64':
          return atob(formattedValue);
        case 'hex':
          const bytes = formattedValue.split(' ').map(hex => parseInt(hex, 16));
          return new TextDecoder().decode(new Uint8Array(bytes));
        case 'raw':
        default:
          return formattedValue;
      }
    } catch {
      // If parsing fails, return as-is
      return formattedValue;
    }
  }, [format]);

  // Handle save operation
  const handleSave = async () => {
    try {
      setLoading(true);
      await stringOps.putString(connectionId, keyName, editedValue, db);
      onValueChange(editedValue);
      toast.success('String value saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save string value';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle append operation
  const handleAppend = async () => {
    if (!appendDialog.value.trim()) {
      toast.error('Append value cannot be empty');
      return;
    }

    try {
      setAppendDialog(prev => ({ ...prev, loading: true }));
      await stringOps.appendString(connectionId, keyName, appendDialog.value, db);
      
      const newValue = currentValue + appendDialog.value;
      setEditedValue(newValue);
      onValueChange(newValue);
      setAppendDialog({ open: false, value: '', loading: false });
      toast.success('Value appended successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to append value';
      toast.error(errorMessage);
      setAppendDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle increment operation
  const handleIncrement = async () => {
    try {
      setLoading(true);
      const result = await stringOps.incrString(connectionId, keyName, db);
      
      const newValue = String(result.value);
      setEditedValue(newValue);
      onValueChange(newValue);
      toast.success(`Value incremented to ${result.value}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to increment value';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle decrement operation
  const handleDecrement = async () => {
    try {
      setLoading(true);
      const result = await stringOps.decrString(connectionId, keyName, db);
      
      const newValue = String(result.value);
      setEditedValue(newValue);
      onValueChange(newValue);
      toast.success(`Value decremented to ${result.value}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to decrement value';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = editedValue !== currentValue;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Type className="w-4 h-4" />
            STRING Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Format:</span>
            <ToggleGroup
              type="single"
              value={format}
              onValueChange={(value) => value && setFormat(value as FormatType)}
              className="justify-start"
            >
              <ToggleGroupItem value="raw" className="text-xs">
                Raw
              </ToggleGroupItem>
              <ToggleGroupItem value="json" className="text-xs">
                JSON
              </ToggleGroupItem>
              <ToggleGroupItem value="base64" className="text-xs">
                Base64
              </ToggleGroupItem>
              <ToggleGroupItem value="hex" className="text-xs">
                Hex
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Value Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Value:</span>
              {hasChanges && (
                <Badge variant="secondary" className="text-xs">
                  Modified
                </Badge>
              )}
            </div>
            <Textarea
              value={getFormattedValue()}
              onChange={(e) => setEditedValue(parseFormattedValue(e.target.value))}
              className="font-mono text-sm min-h-[120px] bg-background text-[#22d3ee]"
              placeholder="Enter string value..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || loading}
              size="sm"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            
            <Button
              onClick={() => setAppendDialog({ open: true, value: '', loading: false })}
              variant="outline"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Append
            </Button>

            {isNumeric() && (
              <>
                <Button
                  onClick={handleIncrement}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  INCR
                </Button>
                
                <Button
                  onClick={handleDecrement}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  DECR
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Append Dialog */}
      <Dialog open={appendDialog.open} onOpenChange={(open) => setAppendDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Append to String</DialogTitle>
            <DialogDescription>
              Enter the value to append to the end of the string.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <Input
              value={appendDialog.value}
              onChange={(e) => setAppendDialog(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Value to append..."
              className="font-mono"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAppendDialog({ open: false, value: '', loading: false })}
              disabled={appendDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAppend}
              disabled={appendDialog.loading || !appendDialog.value.trim()}
            >
              {appendDialog.loading ? 'Appending...' : 'Append'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}