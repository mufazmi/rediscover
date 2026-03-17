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
import { hashOps } from "@/lib/redis-api";
import { Hash, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface HashOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: Record<string, string>;
  onValueChange: (newValue: Record<string, string>) => void;
}

interface AddFieldDialogState {
  open: boolean;
  fieldName: string;
  fieldValue: string;
  loading: boolean;
}

interface EditingState {
  field: string;
  type: 'name' | 'value';
  value: string;
}

interface DeleteDialogState {
  open: boolean;
  field: string;
  value: string;
}

export default function HashOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: HashOperationsProps) {
  const [fields, setFields] = useState<Record<string, string>>(currentValue);
  const [addDialog, setAddDialog] = useState<AddFieldDialogState>({
    open: false,
    fieldName: '',
    fieldValue: '',
    loading: false,
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    field: '',
    value: '',
  });
  const [loading, setLoading] = useState(false);

  // Update fields when current value changes
  useEffect(() => {
    setFields(currentValue);
  }, [currentValue]);

  // Handle add field
  const handleAddField = async () => {
    if (!addDialog.fieldName.trim()) {
      toast.error('Field name cannot be empty');
      return;
    }

    if (fields.hasOwnProperty(addDialog.fieldName)) {
      toast.error('Field already exists');
      return;
    }

    try {
      setAddDialog(prev => ({ ...prev, loading: true }));
      
      await hashOps.setHashField(connectionId, keyName, addDialog.fieldName, addDialog.fieldValue, db);
      
      const newFields = { ...fields, [addDialog.fieldName]: addDialog.fieldValue };
      setFields(newFields);
      onValueChange(newFields);
      setAddDialog({ open: false, fieldName: '', fieldValue: '', loading: false });
      toast.success('Field added successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add field';
      toast.error(errorMessage);
      setAddDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle save field value
  const handleSaveValue = async (field: string, newValue: string) => {
    try {
      setLoading(true);
      
      await hashOps.setHashField(connectionId, keyName, field, newValue, db);
      
      const newFields = { ...fields, [field]: newValue };
      setFields(newFields);
      onValueChange(newFields);
      setEditing(null);
      toast.success('Field value saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save field value';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle rename field
  const handleRenameField = async (oldField: string, newField: string) => {
    if (!newField.trim()) {
      toast.error('Field name cannot be empty');
      return;
    }

    if (oldField === newField) {
      setEditing(null);
      return;
    }

    if (fields.hasOwnProperty(newField)) {
      toast.error('Field name already exists');
      return;
    }

    try {
      setLoading(true);
      
      await hashOps.renameHashField(connectionId, keyName, oldField, newField, db);
      
      const newFields = { ...fields };
      const value = newFields[oldField];
      delete newFields[oldField];
      newFields[newField] = value;
      
      setFields(newFields);
      onValueChange(newFields);
      setEditing(null);
      toast.success('Field renamed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to rename field';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete field
  const handleDeleteField = async () => {
    try {
      setLoading(true);
      
      await hashOps.deleteHashField(connectionId, keyName, deleteDialog.field, db);
      
      const newFields = { ...fields };
      delete newFields[deleteDialog.field];
      setFields(newFields);
      onValueChange(newFields);
      setDeleteDialog({ open: false, field: '', value: '' });
      toast.success('Field deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete field';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Start editing a field
  const startEditing = (field: string, type: 'name' | 'value', value: string) => {
    setEditing({ field, type, value });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditing(null);
  };

  // Open delete confirmation
  const openDeleteDialog = (field: string, value: string) => {
    setDeleteDialog({ open: true, field, value });
  };

  const fieldEntries = Object.entries(fields);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Hash className="w-4 h-4" />
            HASH Operations
            <Badge variant="secondary" className="text-xs">
              {fieldEntries.length} fields
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Field Button */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialog({ open: true, fieldName: '', fieldValue: '', loading: false })}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>

          {/* Hash Fields Table */}
          {fieldEntries.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldEntries.map(([field, value]) => (
                    <TableRow key={field}>
                      <TableCell>
                        {editing?.field === field && editing?.type === 'name' ? (
                          <Input
                            value={editing.value}
                            onChange={(e) => setEditing({ field, type: 'name', value: e.target.value })}
                            className="font-mono text-sm text-[#22d3ee]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameField(field, editing.value);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-mono text-sm text-[#22d3ee] cursor-pointer hover:bg-muted/50 px-2 py-1 rounded block"
                            onClick={() => startEditing(field, 'name', field)}
                          >
                            {field}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editing?.field === field && editing?.type === 'value' ? (
                          <Input
                            value={editing.value}
                            onChange={(e) => setEditing({ field, type: 'value', value: e.target.value })}
                            className="font-mono text-sm text-[#22d3ee]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveValue(field, editing.value);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-mono text-sm text-[#22d3ee] cursor-pointer hover:bg-muted/50 px-2 py-1 rounded block"
                            onClick={() => startEditing(field, 'value', value)}
                          >
                            {value}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editing?.field === field ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (editing.type === 'name') {
                                    handleRenameField(field, editing.value);
                                  } else {
                                    handleSaveValue(field, editing.value);
                                  }
                                }}
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
                              onClick={() => openDeleteDialog(field, value)}
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
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This hash is empty</p>
              <p className="text-sm">Add fields using the button above</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Field Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
            <DialogDescription>
              Enter the field name and value to add to the hash.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Field Name</label>
              <Input
                value={addDialog.fieldName}
                onChange={(e) => setAddDialog(prev => ({ ...prev, fieldName: e.target.value }))}
                placeholder="Enter field name..."
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Field Value</label>
              <Input
                value={addDialog.fieldValue}
                onChange={(e) => setAddDialog(prev => ({ ...prev, fieldValue: e.target.value }))}
                placeholder="Enter field value..."
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddField();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, fieldName: '', fieldValue: '', loading: false })}
              disabled={addDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddField}
              disabled={addDialog.loading || !addDialog.fieldName.trim()}
            >
              {addDialog.loading ? 'Adding...' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hash Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this field from the hash?
              <br />
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {deleteDialog.field}: {deleteDialog.value}
              </span>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteField}
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