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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { zsetCrudOps } from "@/lib/redis-api";
import { BarChart3, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface ZSetOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: Array<{ member: string; score: number }>;
  onValueChange: (newValue: Array<{ member: string; score: number }>) => void;
}

interface AddMemberDialogState {
  open: boolean;
  member: string;
  score: string;
  loading: boolean;
}

interface EditingState {
  member: string;
  score: string;
}

interface DeleteDialogState {
  open: boolean;
  member: string;
  score: number;
}

export default function ZSetOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: ZSetOperationsProps) {
  const [members, setMembers] = useState<Array<{ member: string; score: number }>>(currentValue);
  const [addDialog, setAddDialog] = useState<AddMemberDialogState>({
    open: false,
    member: '',
    score: '',
    loading: false,
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    member: '',
    score: 0,
  });
  const [loading, setLoading] = useState(false);

  // Update members when current value changes
  useEffect(() => {
    setMembers(currentValue);
  }, [currentValue]);

  // Handle add member
  const handleAddMember = async () => {
    if (!addDialog.member.trim()) {
      toast.error('Member value cannot be empty');
      return;
    }

    const scoreValue = parseFloat(addDialog.score);
    if (isNaN(scoreValue)) {
      toast.error('Score must be a valid number');
      return;
    }

    if (members.some(m => m.member === addDialog.member)) {
      toast.error('Member already exists in the sorted set');
      return;
    }

    try {
      setAddDialog(prev => ({ ...prev, loading: true }));
      
      await zsetCrudOps.addZSetMember(connectionId, keyName, addDialog.member, scoreValue, db);
      
      const newMembers = [...members, { member: addDialog.member, score: scoreValue }]
        .sort((a, b) => a.score - b.score);
      setMembers(newMembers);
      onValueChange(newMembers);
      setAddDialog({ open: false, member: '', score: '', loading: false });
      toast.success('Member added successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add member';
      toast.error(errorMessage);
      setAddDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle save score
  const handleSaveScore = async (member: string, newScore: string) => {
    const scoreValue = parseFloat(newScore);
    if (isNaN(scoreValue)) {
      toast.error('Score must be a valid number');
      return;
    }

    try {
      setLoading(true);
      
      // ZADD will update the score if member exists
      await zsetCrudOps.addZSetMember(connectionId, keyName, member, scoreValue, db);
      
      const newMembers = members.map(m => 
        m.member === member ? { ...m, score: scoreValue } : m
      ).sort((a, b) => a.score - b.score);
      
      setMembers(newMembers);
      onValueChange(newMembers);
      setEditing(null);
      toast.success('Score updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update score';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete member
  const handleDeleteMember = async () => {
    try {
      setLoading(true);
      
      await zsetCrudOps.removeZSetMember(connectionId, keyName, deleteDialog.member, db);
      
      const newMembers = members.filter(m => m.member !== deleteDialog.member);
      setMembers(newMembers);
      onValueChange(newMembers);
      setDeleteDialog({ open: false, member: '', score: 0 });
      toast.success('Member deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete member';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Start editing a score
  const startEditing = (member: string, score: number) => {
    setEditing({ member, score: score.toString() });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditing(null);
  };

  // Open delete confirmation
  const openDeleteDialog = (member: string, score: number) => {
    setDeleteDialog({ open: true, member, score });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            SORTED SET Operations
            <Badge variant="secondary" className="text-xs">
              {members.length} members
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Member Button */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialog({ open: true, member: '', score: '', loading: false })}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </div>

          {/* Sorted Set Members Table */}
          {members.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Rank</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead className="w-32">Score</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((item, index) => (
                    <TableRow key={item.member}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-[#22d3ee]">
                          {item.member}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editing?.member === item.member ? (
                          <Input
                            value={editing.score}
                            onChange={(e) => setEditing({ member: item.member, score: e.target.value })}
                            className="font-mono text-sm text-[#22d3ee] w-24"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveScore(item.member, editing.score);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-mono text-sm text-[#22d3ee] cursor-pointer hover:bg-muted/50 px-2 py-1 rounded block"
                            onClick={() => startEditing(item.member, item.score)}
                          >
                            {item.score}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editing?.member === item.member ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleSaveScore(item.member, editing.score)}
                                disabled={loading}
                              >
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDeleteDialog(item.member, item.score)}
                              disabled={loading}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This sorted set is empty</p>
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
              Enter the member value and score to add to the sorted set.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Member</label>
              <Input
                value={addDialog.member}
                onChange={(e) => setAddDialog(prev => ({ ...prev, member: e.target.value }))}
                placeholder="Enter member value..."
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Score</label>
              <Input
                type="number"
                step="any"
                value={addDialog.score}
                onChange={(e) => setAddDialog(prev => ({ ...prev, score: e.target.value }))}
                placeholder="Enter score..."
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddMember();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, member: '', score: '', loading: false })}
              disabled={addDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={addDialog.loading || !addDialog.member.trim() || !addDialog.score.trim()}
            >
              {addDialog.loading ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sorted Set Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this member from the sorted set?
              <br />
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {deleteDialog.member} (score: {deleteDialog.score})
              </span>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}