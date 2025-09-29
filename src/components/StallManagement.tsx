import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASE_TYPE_OPTIONS, createInitialStalls, getNextStallNumbers, StallRecord } from "@/data/stalls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Search,
  Filter,
  Plus,
  Edit,
  Eye,
  Building2,
  User,
  Phone,
  Calendar,
  DollarSign,
  Trash2
} from "lucide-react";

type NewStallForm = {
  vendor: string;
  contact: string;
  type: string;
  monthlyRent: string;
  status: StallRecord["status"];
  lastPayment: string;
  nextDue: string;
};

const createEmptyForm = (): NewStallForm => ({
  vendor: "",
  contact: "",
  type: "",
  monthlyRent: "",
  status: "vacant",
  lastPayment: "",
  nextDue: ""
});

export const StallManagement = () => {
  const [stalls, setStalls] = useState<StallRecord[]>(createInitialStalls());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<StallRecord["status"] | "all">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedStallId, setSelectedStallId] = useState<string | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStall, setNewStall] = useState<NewStallForm>(createEmptyForm());
  const [typeSelection, setTypeSelection] = useState<string>("");
  const [customType, setCustomType] = useState("");

  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingStall, setViewingStall] = useState<StallRecord | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingStallId, setEditingStallId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewStallForm>(createEmptyForm());
  const [editTypeSelection, setEditTypeSelection] = useState<string>("");
  const [editCustomType, setEditCustomType] = useState("");

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [stallPendingDelete, setStallPendingDelete] = useState<StallRecord | null>(null);

  const typeOptions = Array.from(new Set([...BASE_TYPE_OPTIONS, ...stalls.map((stall) => stall.type)])).sort();
  const uniqueTypes = Array.from(new Set(stalls.map((stall) => stall.type))).sort();

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStalls = stalls.filter((stall) => {
    const matchesType = typeFilter ? stall.type === typeFilter : false;

    if (!matchesType) {
      return false;
    }

    const matchesSearch =
      stall.name.toLowerCase().includes(normalizedSearch) ||
      stall.id.toLowerCase().includes(normalizedSearch) ||
      stall.vendor.toLowerCase().includes(normalizedSearch) ||
      stall.type.toLowerCase().includes(normalizedSearch);

    const matchesFilter = filterStatus === "all" || stall.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const selectedStall =
    filteredStalls.find((stall) => stall.id === selectedStallId) ?? null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "current":
        return "default";
      case "due":
        return "secondary";
      case "overdue":
        return "destructive";
      case "vacant":
        return "outline";
      default:
        return "outline";
    }
  };

  const statusCounts = {
    total: stalls.length,
    occupied: stalls.filter((s) => s.occupied).length,
    vacant: stalls.filter((s) => !s.occupied).length,
    overdue: stalls.filter((s) => s.status === "overdue").length
  };

  const resetNewStallForm = () => {
    setNewStall(createEmptyForm());
    setTypeSelection("");
    setCustomType("");
  };

  const resetEditForm = () => {
    setEditingStallId(null);
    setEditForm(createEmptyForm());
    setEditTypeSelection("");
    setEditCustomType("");
  };

  const handleDialogChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      resetNewStallForm();
    }
  };

  const handleViewDialogChange = (open: boolean) => {
    setIsViewDialogOpen(open);
    if (!open) {
      setViewingStall(null);
    }
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      resetEditForm();
    }
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setStallPendingDelete(null);
    }
  };

  const handleTypeSelect = (type: string) => {
    setSelectedStallId(null);
    setTypeFilter((current) => (current === type ? "" : type));
  };

  const handleStallSelect = (stallId: string) => {
    setSelectedStallId((current) => (current === stallId ? null : stallId));
  };

  const handleStatusChange = (value: StallRecord["status"]) => {
    setNewStall((prev) => ({
      ...prev,
      status: value,
      ...(value === "vacant"
        ? { lastPayment: "", nextDue: "" }
        : {})
    }));
  };

  const handleTypeSelectionChange = (value: string) => {
    if (value === "__custom") {
      setTypeSelection(value);
      setCustomType("");
      setNewStall((prev) => ({ ...prev, type: "" }));
      return;
    }

    setTypeSelection(value);
    setCustomType("");
    setNewStall((prev) => ({ ...prev, type: value }));
  };

  const handleCustomTypeChange = (value: string) => {
    setCustomType(value);
    setNewStall((prev) => ({ ...prev, type: value }));
  };
  const handleAddStall = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedType = newStall.type.trim();
    const rentValue = Number(newStall.monthlyRent);

    if (!trimmedType || Number.isNaN(rentValue)) {
      return;
    }

    const { nextIdNumber, nextNameNumber } = getNextStallNumbers(stalls);

    const record: StallRecord = {
      id: `stall-${nextIdNumber}`,
      name: `Stall ${nextNameNumber}`,
      vendor: newStall.vendor.trim(),
      contact: newStall.contact.trim(),
      type: trimmedType,
      monthlyRent: rentValue,
      lastPayment: newStall.status === "vacant" ? "" : newStall.lastPayment,
      nextDue: newStall.status === "vacant" ? "" : newStall.nextDue,
      status: newStall.status,
      occupied: newStall.status !== "vacant"
    };

    setStalls((prev) => [...prev, record]);
    setFilterStatus("all");
    setSearchTerm("");
    setTypeFilter(record.type);
    setSelectedStallId(record.id);
    handleDialogChange(false);
  };

  const openViewDialog = (stall: StallRecord) => {
    setViewingStall(stall);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (stall: StallRecord) => {
    setEditingStallId(stall.id);
    setEditForm({
      vendor: stall.vendor,
      contact: stall.contact,
      type: stall.type,
      monthlyRent: String(stall.monthlyRent),
      status: stall.status,
      lastPayment: stall.lastPayment,
      nextDue: stall.nextDue
    });
    setEditTypeSelection(stall.type);
    setEditCustomType("");
    setIsEditDialogOpen(true);
  };

  const handleEditStatusChange = (value: StallRecord["status"]) => {
    setEditForm((prev) => ({
      ...prev,
      status: value,
      ...(value === "vacant"
        ? { lastPayment: "", nextDue: "" }
        : {})
    }));
  };

  const handleEditTypeSelectionChange = (value: string) => {
    if (value === "__custom") {
      setEditTypeSelection(value);
      setEditCustomType("");
      setEditForm((prev) => ({ ...prev, type: "" }));
      return;
    }

    setEditTypeSelection(value);
    setEditCustomType("");
    setEditForm((prev) => ({ ...prev, type: value }));
  };

  const handleEditCustomTypeChange = (value: string) => {
    setEditCustomType(value);
    setEditForm((prev) => ({ ...prev, type: value }));
  };

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStallId) {
      return;
    }

    const trimmedType = editForm.type.trim();
    const rentValue = Number(editForm.monthlyRent);

    if (!trimmedType || Number.isNaN(rentValue)) {
      return;
    }

    const updatedStatus = editForm.status;

    setStalls((prev) =>
      prev.map((stall) => {
        if (stall.id !== editingStallId) {
          return stall;
        }

        return {
          ...stall,
          vendor: editForm.vendor.trim(),
          contact: editForm.contact.trim(),
          type: trimmedType,
          monthlyRent: rentValue,
          lastPayment: updatedStatus === "vacant" ? "" : editForm.lastPayment,
          nextDue: updatedStatus === "vacant" ? "" : editForm.nextDue,
          status: updatedStatus,
          occupied: updatedStatus !== "vacant"
        };
      })
    );

    setTypeFilter(trimmedType);
    setSelectedStallId(editingStallId);
    handleEditDialogChange(false);
  };

  const requestDeleteStall = (stall: StallRecord) => {
    setStallPendingDelete(stall);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!stallPendingDelete) {
      return;
    }

    const targetId = stallPendingDelete.id;

    setStalls((prev) => {
      const updated = prev.filter((stall) => stall.id !== targetId);
      if (typeFilter && !updated.some((stall) => stall.type === typeFilter)) {
        setTypeFilter("");
      }
      return updated;
    });

    if (selectedStallId === targetId) {
      setSelectedStallId(null);
    }

    setStallPendingDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const isCreateDisabled =
    !newStall.type.trim() ||
    !newStall.monthlyRent.trim() ||
    Number.isNaN(Number(newStall.monthlyRent));

  const isEditDisabled =
    !editForm.type.trim() ||
    !editForm.monthlyRent.trim() ||
    Number.isNaN(Number(editForm.monthlyRent));
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Stall Management</h1>
          <p className="text-muted-foreground">Track stalls, vendors, and rental status in one place.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add New Stall
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl w-[95%] max-h-[90vh] overflow-y-auto sm:rounded-xl">
            <form onSubmit={handleAddStall} className="space-y-6">
              <DialogHeader>
                <DialogTitle>Add a new stall</DialogTitle>
                <DialogDescription>
                  Provide the stall details below. All stalls are labelled "Stall 1" by design.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="stall-type">Stall type</Label>
                  <Select
                    value={(typeSelection === "__custom" ? "__custom" : newStall.type) || undefined}
                    onValueChange={handleTypeSelectionChange}
                  >
                    <SelectTrigger id="stall-type">
                      <SelectValue placeholder="Select a stall type" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom">Other (specify)</SelectItem>
                    </SelectContent>
                  </Select>
                  {typeSelection === "__custom" && (
                    <Input
                      autoFocus
                      placeholder="Enter stall type"
                      value={customType}
                      onChange={(event) => handleCustomTypeChange(event.target.value)}
                      required
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-status">Status</Label>
                  <Select value={newStall.status} onValueChange={(value) => handleStatusChange(value as StallRecord["status"]) }>
                    <SelectTrigger id="stall-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="due">Due</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="vacant">Vacant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-vendor">Vendor name</Label>
                  <Input
                    id="stall-vendor"
                    placeholder="Vendor name"
                    value={newStall.vendor}
                    onChange={(event) => setNewStall((prev) => ({ ...prev, vendor: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-contact">Contact number</Label>
                  <Input
                    id="stall-contact"
                    placeholder="09XXXXXXXXX"
                    value={newStall.contact}
                    onChange={(event) => setNewStall((prev) => ({ ...prev, contact: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-rent">Monthly rent (PHP)</Label>
                  <Input
                    id="stall-rent"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={newStall.monthlyRent}
                    onChange={(event) => setNewStall((prev) => ({ ...prev, monthlyRent: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-last-payment">Last payment date</Label>
                  <Input
                    id="stall-last-payment"
                    type="date"
                    value={newStall.lastPayment}
                    onChange={(event) => setNewStall((prev) => ({ ...prev, lastPayment: event.target.value }))}
                    disabled={newStall.status === "vacant"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stall-next-due">Next due date</Label>
                  <Input
                    id="stall-next-due"
                    type="date"
                    value={newStall.nextDue}
                    onChange={(event) => setNewStall((prev) => ({ ...prev, nextDue: event.target.value }))}
                    disabled={newStall.status === "vacant"}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreateDisabled}>
                  Save Stall
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={handleViewDialogChange}>
        <DialogContent className="max-w-xl w-[95%] sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>Stall details</DialogTitle>
            <DialogDescription>Overview of the selected stall.</DialogDescription>
          </DialogHeader>
          {viewingStall && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{viewingStall.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{viewingStall.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={getStatusColor(viewingStall.status)}>{viewingStall.status}</Badge>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Vendor:</span>{" "}
                  <span className="font-medium">{viewingStall.vendor || "No vendor assigned"}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Contact:</span>{" "}
                  <span>{viewingStall.contact || "N/A"}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Monthly rent:</span>{" "}
                  <span className="font-medium">PHP {viewingStall.monthlyRent}</span>
                </div>
                {viewingStall.lastPayment && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Last paid:</span>{" "}
                    <span>{viewingStall.lastPayment}</span>
                  </div>
                )}
                {viewingStall.nextDue && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Next due:</span>{" "}
                    <span>{viewingStall.nextDue}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent className="max-w-3xl w-[95%] max-h-[90vh] overflow-y-auto sm:rounded-xl">
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Edit stall</DialogTitle>
              <DialogDescription>Update the stall information below.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-stall-type">Stall type</Label>
                <Select
                  value={(editTypeSelection === "__custom" ? "__custom" : editForm.type) || undefined}
                  onValueChange={handleEditTypeSelectionChange}
                >
                  <SelectTrigger id="edit-stall-type">
                    <SelectValue placeholder="Select a stall type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {editTypeSelection === "__custom" && (
                  <Input
                    autoFocus
                    placeholder="Enter stall type"
                    value={editCustomType}
                    onChange={(event) => handleEditCustomTypeChange(event.target.value)}
                    required
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-status">Status</Label>
                <Select value={editForm.status} onValueChange={(value) => handleEditStatusChange(value as StallRecord["status"]) }>
                  <SelectTrigger id="edit-stall-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-vendor">Vendor name</Label>
                <Input
                  id="edit-stall-vendor"
                  placeholder="Vendor name"
                  value={editForm.vendor}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, vendor: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-contact">Contact number</Label>
                <Input
                  id="edit-stall-contact"
                  placeholder="09XXXXXXXXX"
                  value={editForm.contact}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, contact: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-rent">Monthly rent (PHP)</Label>
                <Input
                  id="edit-stall-rent"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={editForm.monthlyRent}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, monthlyRent: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-last-payment">Last payment date</Label>
                <Input
                  id="edit-stall-last-payment"
                  type="date"
                  value={editForm.lastPayment}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, lastPayment: event.target.value }))}
                  disabled={editForm.status === "vacant"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stall-next-due">Next due date</Label>
                <Input
                  id="edit-stall-next-due"
                  type="date"
                  value={editForm.nextDue}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, nextDue: event.target.value }))}
                  disabled={editForm.status === "vacant"}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleEditDialogChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isEditDisabled}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stall</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The stall will be removed from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Stall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Stalls</div>
                <div className="text-2xl font-bold">{statusCounts.total}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <User className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Occupied</div>
                <div className="text-2xl font-bold">{statusCounts.occupied}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Vacant</div>
                <div className="text-2xl font-bold">{statusCounts.vacant}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Overdue</div>
                <div className="text-2xl font-bold text-destructive">{statusCounts.overdue}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by stall name, ID, vendor, or type..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as StallRecord["status"] | "all")}>
              <SelectTrigger className="w-40">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="current">Current</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="vacant">Vacant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            {uniqueTypes.map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeSelect(type)}
              >
                {type} Type Stall
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {typeFilter === "" ? (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <div className="text-lg font-medium mb-2">Select a stall type</div>
            <div className="text-muted-foreground">Choose a stall type above to view the available stalls.</div>
          </CardContent>
        </Card>
      ) : filteredStalls.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <div className="text-lg font-medium mb-2">No stalls found</div>
            <div className="text-muted-foreground">Adjust your search or status filters to find a matching stall.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {filteredStalls.map((stall) => (
              <Button
                key={stall.id}
                variant={selectedStallId === stall.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleStallSelect(stall.id)}
              >
                {stall.name}
              </Button>
            ))}
          </div>

          {selectedStall ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {`${selectedStall.name}:`}
                  </CardTitle>
                  <Badge variant={getStatusColor(selectedStall.status)}>{selectedStall.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedStall.occupied ? (
                  <>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedStall.vendor || "No vendor assigned"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{selectedStall.contact || "N/A"}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <div className="text-sm">Vacant Stall</div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <span className="text-sm font-medium">{selectedStall.type}</span>
                </div>

                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">PHP {selectedStall.monthlyRent}/month</span>
                </div>

                {selectedStall.occupied && (
                  <>
                    {selectedStall.lastPayment && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Last paid: {selectedStall.lastPayment}</span>
                      </div>
                    )}

                    {selectedStall.nextDue && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Next due: {selectedStall.nextDue}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[7rem]"
                    onClick={() => openViewDialog(selectedStall)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[7rem]"
                    onClick={() => openEditDialog(selectedStall)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 min-w-[7rem]"
                    onClick={() => requestDeleteStall(selectedStall)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <div className="text-lg font-medium mb-2">Select a stall</div>
                <div className="text-muted-foreground">Click a stall button above to view its details.</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};









