import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { streamOps } from "@/lib/redis-api";
import { Waves, Plus, Trash2, Scissors, X } from "lucide-react";
import { toast } from "sonner";

interface StreamOperationsProps {
  connectionId: number;
  db: number;
  keyName: string;
  currentValue: Array<{ id: string; fields: Record<string, string> }>;
  onValueChange: (newValue: Array<{ id: string; fields: Record<string, string> }>) => void;
}

interface AddEntryDialogState {
  open: boolean;
  fields: Array<{ key: string; value: string }>;
  loading: boolean;
}

interface TrimDialogState {
  open: boolean;
  strategy: 'MAXLEN' | 'MINID';
  value: string;
  loading: boolean;
}

interface DeleteDialogState {
  open: boolean;
  entryId: string;
  fields: Record<string, string>;
}

export default function StreamOperations({
  connectionId,
  db,
  keyName,
  currentValue,
  onValueChange,
}: StreamOperationsProps) {
  const [entries, setEntries] = useState<Array<{ id: string; fields: Record<string, string> }>>(currentValue);
  const [addDialog, setAddDialog] = useState<AddEntryDialogState>({
    open: false,
    fields: [{ key: '', value: '' }],
    loading: false,
  });
  const [trimDialog, setTrimDialog] = useState<TrimDialogState>({
    open: false,
    strategy: 'MAXLEN',
    value: '',
    loading: false,
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    entryId: '',
    fields: {},
  });
  const [loading, setLoading] = useState(false);

  // Update entries when current value changes
  useEffect(() => {
    setEntries(currentValue);
  }, [currentValue]);

  // Handle add entry
  const handleAddEntry = async () => {
    // Validate fields
    const validFields = addDialog.fields.filter(f => f.key.trim() && f.value.trim());
    if (validFields.length === 0) {
      toast.error('At least one field-value pair is required');
      return;
    }

    // Check for duplicate field names
    const fieldNames = validFields.map(f => f.key.trim());
    const uniqueFieldNames = new Set(fieldNames);
    if (fieldNames.length !== uniqueFieldNames.size) {
      toast.error('Field names must be unique');
      return;
    }

    try {
      setAddDialog(prev => ({ ...prev, loading: true }));
      
      // Convert to fields object
      const fieldsObject: Record<string, string> = {};
      validFields.forEach(f => {
        fieldsObject[f.key.trim()] = f.value.trim();
      });

      const result = await streamOps.addStreamEntry(connectionId, keyName, fieldsObject, db);
      
      // Add new entry to the beginning (most recent)
      const newEntry = { id: result.entryId, fields: fieldsObject };
      const newEntries = [newEntry, ...entries];
      setEntries(newEntries);
      onValueChange(newEntries);
      setAddDialog({ open: false, fields: [{ key: '', value: '' }], loading: false });
      toast.success('Entry added successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add entry';
      toast.error(errorMessage);
      setAddDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle trim stream
  const handleTrimStream = async () => {
    if (!trimDialog.value.trim()) {
      toast.error('Trim value cannot be empty');
      return;
    }

    try {
      setTrimDialog(prev => ({ ...prev, loading: true }));
      
      const result = await streamOps.trimStream(connectionId, keyName, trimDialog.strategy, trimDialog.value, db);
      
      // Refresh entries after trim - in a real app you might want to refetch
      // For now, we'll just show success and let the parent component refresh
      setTrimDialog({ open: false, strategy: 'MAXLEN', value: '', loading: false });
      toast.success(`Stream trimmed successfully. ${result.deletedCount} entries removed.`);
      
      // Trigger a refresh by calling onValueChange with current entries
      // The parent component should refetch the data
      onValueChange(entries);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to trim stream';
      toast.error(errorMessage);
      setTrimDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle delete entry
  const handleDeleteEntry = async () => {
    try {
      setLoading(true);
      
      await streamOps.deleteStreamEntry(connectionId, keyName, deleteDialog.entryId, db);
      
      const newEntries = entries.filter(e => e.id !== deleteDialog.entryId);
      setEntries(newEntries);
      onValueChange(newEntries);
      setDeleteDialog({ open: false, entryId: '', fields: {} });
      toast.success('Entry deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete entry';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Add field to add dialog
  const addField = () => {
    setAddDialog(prev => ({
      ...prev,
      fields: [...prev.fields, { key: '', value: '' }]
    }));
  };

  // Remove field from add dialog
  const removeField = (index: number) => {
    setAddDialog(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  // Update field in add dialog
  const updateField = (index: number, key: string, value: string) => {
    setAddDialog(prev => ({
      ...prev,
      fields: prev.fields.map((field, i) => 
        i === index ? { key, value } : field
      )
    }));
  };

  // Open delete confirmation
  const openDeleteDialog = (entryId: string, fields: Record<string, string>) => {
    setDeleteDialog({ open: true, entryId, fields });
  };

  // Format timestamp from entry ID
  const formatTimestamp = (entryId: string) => {
    try {
      const timestamp = parseInt(entryId.split('-')[0]);
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Invalid timestamp';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Waves className="w-4 h-4" />
            STREAM Operations
            <Badge variant="secondary" className="text-xs">
              {entries.length} entries
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialog({ open: true, fields: [{ key: '', value: '' }], loading: false })}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
            
            <Button
              onClick={() => setTrimDialog({ open: true, strategy: 'MAXLEN', value: '', loading: false })}
              size="sm"
              variant="outline"
            >
              <Scissors className="w-4 h-4 mr-2" />
              Trim Stream
            </Button>
          </div>

          {/* Stream Entries Table */}
          {entries.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Entry ID</TableHead>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead>Field-Value Pairs</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-[#22d3ee]">
                          {entry.id}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatTimestamp(entry.id)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {Object.entries(entry.fields).map(([field, value]) => (
                            <div key={field} className="flex items-center gap-2 text-sm">
                              <span className="font-mono text-[#22d3ee] font-medium">
                                {field}:
                              </span>
                              <span className="font-mono text-[#22d3ee]">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteDialog(entry.id, entry.fields)}
                          disabled={loading}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Waves className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This stream is empty</p>
              <p className="text-sm">Add entries using the button above</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Entry Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Stream Entry</DialogTitle>
            <DialogDescription>
              Enter field-value pairs for the new stream entry. At least one pair is required.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {addDialog.fields.map((field, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(index, e.target.value, field.value)}
                    placeholder="Field name..."
                    className="font-mono"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    value={field.value}
                    onChange={(e) => updateField(index, field.key, e.target.value)}
                    placeholder="Field value..."
                    className="font-mono"
                  />
                </div>
                {addDialog.fields.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeField(index)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addField}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, fields: [{ key: '', value: '' }], loading: false })}
              disabled={addDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddEntry}
              disabled={addDialog.loading || addDialog.fields.every(f => !f.key.trim() || !f.value.trim())}
            >
              {addDialog.loading ? 'Adding...' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trim Stream Dialog */}
      <Dialog open={trimDialog.open} onOpenChange={(open) => setTrimDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trim Stream</DialogTitle>
            <DialogDescription>
              Choose a trim strategy and value to remove old entries from the stream.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Strategy</label>
              <Select
                value={trimDialog.strategy}
                onValueChange={(value: 'MAXLEN' | 'MINID') => 
                  setTrimDialog(prev => ({ ...prev, strategy: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAXLEN">MAXLEN - Keep maximum number of entries</SelectItem>
                  <SelectItem value="MINID">MINID - Remove entries older than ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {trimDialog.strategy === 'MAXLEN' ? 'Maximum Entries' : 'Minimum Entry ID'}
              </label>
              <Input
                value={trimDialog.value}
                onChange={(e) => setTrimDialog(prev => ({ ...prev, value: e.target.value }))}
                placeholder={
                  trimDialog.strategy === 'MAXLEN' 
                    ? 'e.g., 1000' 
                    : 'e.g., 1609459200000-0'
                }
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTrimStream();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {trimDialog.strategy === 'MAXLEN' 
                  ? 'Keep only the most recent N entries'
                  : 'Remove all entries with ID less than the specified value'
                }
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrimDialog({ open: false, strategy: 'MAXLEN', value: '', loading: false })}
              disabled={trimDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTrimStream}
              disabled={trimDialog.loading || !trimDialog.value.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {trimDialog.loading ? 'Trimming...' : 'Trim Stream'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stream Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry from the stream?
              <br />
              <div className="font-mono text-sm bg-muted px-2 py-1 rounded mt-2">
                <div className="text-[#22d3ee] mb-1">ID: {deleteDialog.entryId}</div>
                {Object.entries(deleteDialog.fields).map(([field, value]) => (
                  <div key={field} className="text-[#22d3ee]">
                    {field}: {value}
                  </div>
                ))}
              </div>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
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