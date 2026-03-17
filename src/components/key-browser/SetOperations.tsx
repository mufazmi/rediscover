import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { setOps } from "@/lib/redis-api";
import { Hash, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface SetOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: string[];
  onValueChange: (newValue: string[]) => void;
}

interface AddMemberDialogState {
  open: boolean;
  value: string;
  loading: boolean;
}

interface DeleteMemberDialogState {
  open: boolean;
  member: string;
}

export default function SetOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: SetOperationsProps) {
  const [members, setMembers] = useState<string[]>(currentValue);
  const [addDialog, setAddDialog] = useState<AddMemberDialogState>({
    open: false,
    value: '',
    loading: false,
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteMemberDialogState>({
    open: false,
    member: '',
  });
  const [loading, setLoading] = useState(false);

  // Update members when current value changes
  useEffect(() => {
    setMembers(currentValue);
  }, [currentValue]);

  // Handle add member
  const handleAddMember = async () => {
    if (!addDialog.value.trim()) {
      toast.error('Member value cannot be empty');
      return;
    }

    if (members.includes(addDialog.value)) {
      toast.error('Member already exists in the set');
      return;
    }

    try {
      setAddDialog(prev => ({ ...prev, loading: true }));
      
      await setOps.addSetMember(connectionId, keyName, addDialog.value, db);
      
      const newMembers = [...members, addDialog.value];
      setMembers(newMembers);
      onValueChange(newMembers);
      setAddDialog({ open: false, value: '', loading: false });
      toast.success('Member added successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add member';
      toast.error(errorMessage);
      setAddDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle remove member
  const handleRemoveMember = (member: string) => {
    setDeleteDialog({ open: true, member });
  };

  // Confirm remove member
  const confirmRemoveMember = async () => {
    try {
      setLoading(true);
      
      await setOps.removeSetMemberCrud(connectionId, keyName, deleteDialog.member, db);
      
      const newMembers = members.filter(m => m !== deleteDialog.member);
      setMembers(newMembers);
      onValueChange(newMembers);
      setDeleteDialog({ open: false, member: '' });
      toast.success('Member removed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove member';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Hash className="w-4 h-4" />
            SET Operations
            <Badge variant="secondary" className="text-xs">
              {members.length} members
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Member Button */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialog({ open: true, value: '', loading: false })}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </div>

          {/* Set Members Display */}
          {members.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Members:</div>
              <div className="flex flex-wrap gap-2">
                {members.map((member, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="font-mono text-sm text-[#22d3ee] bg-background border-border hover:bg-muted/50 pr-1 pl-3 py-1 flex items-center gap-2"
                  >
                    <span>{member}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleRemoveMember(member)}
                      disabled={loading}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This set is empty</p>
              <p className="text-sm">Add members using the button above</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Enter the value to add as a member to the set.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <Input
              value={addDialog.value}
              onChange={(e) => setAddDialog(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Enter member value..."
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddMember();
                }
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, value: '', loading: false })}
              disabled={addDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={addDialog.loading || !addDialog.value.trim()}
            >
              {addDialog.loading ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Set Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the set?
              <br />
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {deleteDialog.member}
              </span>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}