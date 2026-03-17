import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { keys } from "@/lib/redis-api";
import { getTTLLabel, getTTLColor } from "@/store/mockData";
import { Clock, Edit } from "lucide-react";
import { toast } from "sonner";

interface TTLPanelProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentTTL: number;
  onTTLChange: (newTTL: number) => void;
}

interface EditTTLDialogState {
  open: boolean;
  ttlValue: string;
  removeTTL: boolean;
  loading: boolean;
}

export default function TTLPanel({
  connectionId,
  db,
  keyName,
  currentTTL,
  onTTLChange,
}: TTLPanelProps) {
  const [displayTTL, setDisplayTTL] = useState(currentTTL);
  const [editDialog, setEditDialog] = useState<EditTTLDialogState>({
    open: false,
    ttlValue: '',
    removeTTL: false,
    loading: false,
  });

  // Update display TTL when current TTL changes
  useEffect(() => {
    setDisplayTTL(currentTTL);
  }, [currentTTL]);

  // Countdown timer for TTL display
  useEffect(() => {
    if (displayTTL <= 0) return;

    const interval = setInterval(() => {
      setDisplayTTL(prev => {
        const newTTL = prev - 1;
        if (newTTL <= 0) {
          // TTL expired, update parent
          onTTLChange(-1);
          return -1;
        }
        return newTTL;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [displayTTL, onTTLChange]);

  // Format TTL for countdown display
  const getCountdownDisplay = useCallback(() => {
    if (displayTTL === -1) return "No TTL";
    if (displayTTL <= 0) return "Expired";
    
    if (displayTTL < 60) return `${displayTTL}s`;
    if (displayTTL < 3600) {
      const minutes = Math.floor(displayTTL / 60);
      const seconds = displayTTL % 60;
      return `${minutes}m ${seconds}s`;
    }
    if (displayTTL < 86400) {
      const hours = Math.floor(displayTTL / 3600);
      const minutes = Math.floor((displayTTL % 3600) / 60);
      const seconds = displayTTL % 60;
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    
    const days = Math.floor(displayTTL / 86400);
    const hours = Math.floor((displayTTL % 86400) / 3600);
    const minutes = Math.floor((displayTTL % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }, [displayTTL]);

  // Get TTL color for countdown
  const getCountdownColor = useCallback(() => {
    if (displayTTL === -1) return "text-muted-foreground";
    if (displayTTL <= 0) return "text-status-error";
    if (displayTTL < 60) return "text-status-error";
    if (displayTTL < 3600) return "text-status-warning";
    return "text-status-success";
  }, [displayTTL]);

  // Open edit TTL dialog
  const handleEditTTL = () => {
    setEditDialog({
      open: true,
      ttlValue: displayTTL > 0 ? String(displayTTL) : '',
      removeTTL: false,
      loading: false,
    });
  };

  // Handle TTL set/remove operation
  const handleConfirmTTL = async () => {
    try {
      setEditDialog(prev => ({ ...prev, loading: true }));

      if (editDialog.removeTTL) {
        // Remove TTL using PERSIST
        await keys.persistKey(connectionId, keyName, db);
        setDisplayTTL(-1);
        onTTLChange(-1);
        toast.success('TTL removed successfully');
      } else {
        // Set TTL using EXPIRE
        const ttlSeconds = parseInt(editDialog.ttlValue, 10);
        if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
          toast.error('Please enter a valid TTL in seconds');
          setEditDialog(prev => ({ ...prev, loading: false }));
          return;
        }

        await keys.expireKey(connectionId, keyName, ttlSeconds, db);
        setDisplayTTL(ttlSeconds);
        onTTLChange(ttlSeconds);
        toast.success(`TTL set to ${ttlSeconds} seconds`);
      }

      setEditDialog({
        open: false,
        ttlValue: '',
        removeTTL: false,
        loading: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update TTL';
      toast.error(errorMessage);
      setEditDialog(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            TTL Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current TTL Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current TTL:</span>
              <Badge 
                variant="secondary" 
                className={`font-mono text-xs ${getCountdownColor()}`}
              >
                {getCountdownDisplay()}
              </Badge>
            </div>
            
            {displayTTL > 0 && (
              <div className="text-xs text-muted-foreground">
                Live countdown • Updates every second
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex gap-2">
            <Button
              onClick={handleEditTTL}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit TTL
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit TTL Dialog */}
      <Dialog 
        open={editDialog.open} 
        onOpenChange={(open) => setEditDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit TTL</DialogTitle>
            <DialogDescription>
              Set or remove the time-to-live (TTL) for key: <code className="font-mono text-[#22d3ee]">{keyName}</code>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Remove TTL Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="removeTTL"
                checked={editDialog.removeTTL}
                onCheckedChange={(checked) => 
                  setEditDialog(prev => ({ ...prev, removeTTL: checked === true }))
                }
              />
              <label 
                htmlFor="removeTTL" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Remove TTL (make key persistent)
              </label>
            </div>

            {/* TTL Input */}
            {!editDialog.removeTTL && (
              <div className="space-y-2">
                <label className="text-sm font-medium">TTL (seconds):</label>
                <Input
                  type="number"
                  value={editDialog.ttlValue}
                  onChange={(e) => setEditDialog(prev => ({ ...prev, ttlValue: e.target.value }))}
                  placeholder="Enter TTL in seconds..."
                  className="font-mono"
                  min="1"
                />
                <div className="text-xs text-muted-foreground">
                  Examples: 60 (1 minute), 3600 (1 hour), 86400 (1 day)
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog(prev => ({ ...prev, open: false }))}
              disabled={editDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTTL}
              disabled={
                editDialog.loading || 
                (!editDialog.removeTTL && (!editDialog.ttlValue.trim() || isNaN(parseInt(editDialog.ttlValue))))
              }
            >
              {editDialog.loading 
                ? (editDialog.removeTTL ? 'Removing...' : 'Setting...') 
                : (editDialog.removeTTL ? 'Remove TTL' : 'Set TTL')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}