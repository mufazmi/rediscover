import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { keys } from "@/lib/redis-api";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteKeyPanelProps {
  connectionId: number;
  db: number;
  keyName: string;
  keyType: string;
  onKeyDeleted: () => void;
}

interface DeleteDialogState {
  open: boolean;
  loading: boolean;
}

export default function DeleteKeyPanel({
  connectionId,
  db,
  keyName,
  keyType,
  onKeyDeleted,
}: DeleteKeyPanelProps) {
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    loading: false,
  });

  // Open delete confirmation dialog
  const handleDeleteKey = () => {
    setDeleteDialog({
      open: true,
      loading: false,
    });
  };

  // Handle key deletion
  const handleConfirmDelete = async () => {
    try {
      setDeleteDialog(prev => ({ ...prev, loading: true }));

      await keys.deleteKey(connectionId, keyName, db);
      
      toast.success(`Key "${keyName}" deleted successfully`);
      
      setDeleteDialog({
        open: false,
        loading: false,
      });

      // Navigate back to key list
      onKeyDeleted();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete key';
      toast.error(errorMessage);
      setDeleteDialog(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Delete Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Information */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Key Name:</span>
              <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {keyName}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Key Type:</span>
              <Badge variant="secondary" className="text-xs">
                {keyType.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Warning Message */}
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="text-sm text-destructive font-medium mb-1">
              ⚠️ Warning
            </div>
            <div className="text-xs text-destructive/80">
              This action cannot be undone. The key and all its data will be permanently removed from Redis.
            </div>
          </div>

          {/* Delete Button */}
          <Button
            onClick={handleDeleteKey}
            variant="destructive"
            size="sm"
            className="w-full"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Key
          </Button>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={deleteDialog.open} 
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this key? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Key Name:</span>
              <code className="font-mono text-xs text-[#22d3ee]">{keyName}</code>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Key Type:</span>
              <Badge variant="secondary" className="text-xs">
                {keyType.toUpperCase()}
              </Badge>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog.loading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteDialog.loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDialog.loading ? 'Deleting...' : 'Delete Key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}