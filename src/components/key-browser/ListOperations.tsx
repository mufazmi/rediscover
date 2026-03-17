import { useState, useCallback, useEffect } from "react";
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
import { listOps } from "@/lib/redis-api";
import { List, Save, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface ListOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: string[];
  onValueChange: (newValue: string[]) => void;
}

interface AddDialogState {
  open: boolean;
  value: string;
  direction: 'left' | 'right';
  loading: boolean;
}

interface EditingState {
  index: number;
  value: string;
}

interface DeleteDialogState {
  open: boolean;
  index: number;
  value: string;
}

const ITEMS_PER_PAGE = 100;

export default function ListOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: ListOperationsProps) {
  const [items, setItems] = useState<string[]>(currentValue);
  const [addDialog, setAddDialog] = useState<AddDialogState>({
    open: false,
    value: '',
    direction: 'right',
    loading: false,
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    index: -1,
    value: '',
  });
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Update items when current value changes
  useEffect(() => {
    setItems(currentValue);
    setHasMore(currentValue.length >= ITEMS_PER_PAGE);
  }, [currentValue]);

  // Load more items for pagination
  const loadMore = useCallback(async () => {
    try {
      setLoading(true);
      const start = items.length;
      const stop = start + ITEMS_PER_PAGE - 1;
      
      const moreItems = await listOps.getListRange(connectionId, keyName, start, stop, db);
      
      if (moreItems.length > 0) {
        const newItems = [...items, ...moreItems];
        setItems(newItems);
        onValueChange(newItems);
        setHasMore(moreItems.length >= ITEMS_PER_PAGE);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load more items';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [connectionId, keyName, db, items, onValueChange]);

  // Handle add to head/tail
  const handleAdd = async () => {
    if (!addDialog.value.trim()) {
      toast.error('Value cannot be empty');
      return;
    }

    try {
      setAddDialog(prev => ({ ...prev, loading: true }));
      
      await listOps.pushToList(connectionId, keyName, addDialog.value, addDialog.direction, db);
      
      // Update local state based on direction
      let newItems: string[];
      if (addDialog.direction === 'left') {
        newItems = [addDialog.value, ...items];
      } else {
        newItems = [...items, addDialog.value];
      }
      
      setItems(newItems);
      onValueChange(newItems);
      setAddDialog({ open: false, value: '', direction: 'right', loading: false });
      toast.success(`Item added to ${addDialog.direction === 'left' ? 'head' : 'tail'} successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add item';
      toast.error(errorMessage);
      setAddDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle save edited item
  const handleSave = async (index: number, newValue: string) => {
    if (!newValue.trim()) {
      toast.error('Value cannot be empty');
      return;
    }

    try {
      setLoading(true);
      
      await listOps.setListElement(connectionId, keyName, index, newValue, db);
      
      const newItems = [...items];
      newItems[index] = newValue;
      setItems(newItems);
      onValueChange(newItems);
      setEditing(null);
      toast.success('Item saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save item';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete item
  const handleDelete = async () => {
    try {
      setLoading(true);
      
      await listOps.deleteListItem(connectionId, keyName, deleteDialog.index, db);
      
      const newItems = items.filter((_, i) => i !== deleteDialog.index);
      setItems(newItems);
      onValueChange(newItems);
      setDeleteDialog({ open: false, index: -1, value: '' });
      toast.success('Item deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete item';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Start editing an item
  const startEditing = (index: number, value: string) => {
    setEditing({ index, value });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditing(null);
  };

  // Open delete confirmation
  const openDeleteDialog = (index: number, value: string) => {
    setDeleteDialog({ open: true, index, value });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <List className="w-4 h-4" />
            LIST Operations
            <Badge variant="secondary" className="text-xs">
              {items.length} items
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialog({ open: true, value: '', direction: 'left', loading: false })}
              size="sm"
              variant="outline"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Add to Head
            </Button>
            
            <Button
              onClick={() => setAddDialog({ open: true, value: '', direction: 'right', loading: false })}
              size="sm"
              variant="outline"
            >
              <ChevronRight className="w-4 h-4 mr-2" />
              Add to Tail
            </Button>
          </div>

          {/* List Items Table */}
          {items.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Index</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {index}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editing?.index === index ? (
                          <Input
                            value={editing.value}
                            onChange={(e) => setEditing({ index, value: e.target.value })}
                            className="font-mono text-sm text-[#22d3ee]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSave(index, editing.value);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-mono text-sm text-[#22d3ee] cursor-pointer hover:bg-muted/50 px-2 py-1 rounded block"
                            onClick={() => startEditing(index, item)}
                          >
                            {item}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editing?.index === index ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleSave(index, editing.value)}
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
                              onClick={() => openDeleteDialog(index, item)}
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
              <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This list is empty</p>
              <p className="text-sm">Add items using the buttons above</p>
            </div>
          )}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center">
              <Button
                onClick={loadMore}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Item Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add to {addDialog.direction === 'left' ? 'Head' : 'Tail'}
            </DialogTitle>
            <DialogDescription>
              Enter the value to add to the {addDialog.direction === 'left' ? 'beginning' : 'end'} of the list.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <Input
              value={addDialog.value}
              onChange={(e) => setAddDialog(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Enter value..."
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdd();
                }
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, value: '', direction: 'right', loading: false })}
              disabled={addDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={addDialog.loading || !addDialog.value.trim()}
            >
              {addDialog.loading ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item from the list?
              <br />
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {deleteDialog.value}
              </span>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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