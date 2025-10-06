import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  DialogTitle
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
  BASE_TYPE_OPTIONS,
  createStall,
  deleteStall,
  updateStall,
  type StallRecord,
  type StallStatus
} from "@/data/stalls";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Building2, DollarSign, Filter, Pencil, Phone, Plus, Search, Trash2, User } from "lucide-react";

/* ----------------------------------------------------------
   MAIN COMPONENT
---------------------------------------------------------- */
interface StallManagementProps {
  stalls: StallRecord[];
  onStallsChange: Dispatch<SetStateAction<StallRecord[]>>;
}

type StallFormState = {
  vendor: string;
  contact: string;
  type: string;
  monthlyRent: string;
  status: StallStatus;
  lastPayment: string;
  nextDue: string;
};

const STATUS_OPTIONS: { value: StallStatus; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "due", label: "Due" },
  { value: "overdue", label: "Overdue" },
  { value: "vacant", label: "Vacant" }
];

const createEmptyForm = (): StallFormState => ({
  vendor: "",
  contact: "",
  type: "",
  monthlyRent: "",
  status: "vacant",
  lastPayment: "",
  nextDue: ""
});

const getStatusBadge = (status: StallStatus) => {
  switch (status) {
    case "current":
      return "default" as const;
    case "due":
      return "secondary" as const;
    case "overdue":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
};

/* ----------------------------------------------------------
   COMPONENT
---------------------------------------------------------- */
export const StallManagement = ({ stalls, onStallsChange }: StallManagementProps) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StallStatus>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [stallBeingEdited, setStallBeingEdited] = useState<StallRecord | null>(null);
  const [formState, setFormState] = useState<StallFormState>(createEmptyForm());
  const [stallToDelete, setStallToDelete] = useState<StallRecord | null>(null);

  /* ----------------------------------------------------------
     HELPERS
  ---------------------------------------------------------- */
  const typeOptions = useMemo(
    () =>
      Array.from(new Set([...BASE_TYPE_OPTIONS, ...stalls.map((stall) => stall.type).filter(Boolean)])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [stalls]
  );

  const stats = useMemo(() => {
    const counts: Record<StallStatus, number> = {
      current: 0,
      due: 0,
      overdue: 0,
      vacant: 0
    };
    stalls.forEach((stall) => {
      counts[stall.status] += 1;
    });
    return [
      { label: "Total Stalls", value: stalls.length, description: `${counts.current + counts.due + counts.overdue} occupied` },
      { label: "Current", value: counts.current, description: "Up to date" },
      { label: "Due Soon", value: counts.due, description: "Needs follow-up" },
      { label: "Overdue", value: counts.overdue, description: "Attention needed" }
    ];
  }, [stalls]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStalls = useMemo(() => {
    return stalls.filter((stall) => {
      const matchesStatus = statusFilter === "all" || stall.status === statusFilter;
      const matchesType = typeFilter === "all" || stall.type === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        stall.vendor.toLowerCase().includes(normalizedSearch) ||
        stall.type.toLowerCase().includes(normalizedSearch) ||
        String(stall.dbId).includes(normalizedSearch);
      return matchesStatus && matchesType && matchesSearch;
    });
  }, [stalls, statusFilter, typeFilter, normalizedSearch]);

  /* ----------------------------------------------------------
     CRUD: CREATE + EDIT + DELETE
  ---------------------------------------------------------- */

  const reloadStalls = async () => {
    const { data, error } = await supabase
      .from("vendors")
      .select("id,vendor,contact,type,monthly_rent,last_payment,next_due,status")
      .order("id", { ascending: true });

    if (error) {
      console.error("Reload error:", error);
      toast({ title: "Reload failed", description: error.message, variant: "destructive" });
      return;
    }

    const mapped: StallRecord[] = (data ?? []).map((row) => ({
      id: `stall-${row.id}`,
      dbId: row.id,
      name: `Stall ${row.id}`,
      vendor: row.vendor ?? "",
      contact: row.contact ?? "",
      type: row.type ?? "",
      monthlyRent: row.monthly_rent ?? 0,
      lastPayment: row.last_payment ?? "",
      nextDue: row.next_due ?? "",
      status: row.status ?? "vacant",
      occupied: row.status !== "vacant"
    }));

    onStallsChange(mapped);
  };

  const openCreateDialog = () => {
    setFormState(createEmptyForm());
    setStallBeingEdited(null);
    setIsEditMode(false);
    setIsCreateOpen(true);
  };

  const openEditDialog = (stall: StallRecord) => {
    setFormState({
      vendor: stall.vendor,
      contact: stall.contact,
      type: stall.type,
      monthlyRent: String(stall.monthlyRent),
      status: stall.status,
      lastPayment: stall.lastPayment,
      nextDue: stall.nextDue
    });
    setStallBeingEdited(stall);
    setIsEditMode(true);
    setIsCreateOpen(true);
  };

  const closeFormDialog = () => {
    setIsCreateOpen(false);
    setIsEditMode(false);
    setStallBeingEdited(null);
    setFormState(createEmptyForm());
  };

  const handleFormChange = (field: keyof StallFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedType = formState.type.trim();
    const rent = Number(formState.monthlyRent);
    const isVacant = formState.status === "vacant";

    if (!trimmedType || Number.isNaN(rent)) return;

    try {
      if (isEditMode && stallBeingEdited) {
        await updateStall(stallBeingEdited.dbId, {
          vendor: isVacant ? "" : formState.vendor.trim(),
          contact: isVacant ? "" : formState.contact.trim(),
          type: trimmedType,
          monthlyRent: rent,
          lastPayment: isVacant ? "" : formState.lastPayment,
          nextDue: isVacant ? "" : formState.nextDue,
          status: formState.status,
          occupied: !isVacant
        });
        toast({ title: "Stall updated", description: "Changes saved successfully." });
      } else {
        await createStall({
          vendor: isVacant ? "" : formState.vendor.trim(),
          contact: isVacant ? "" : formState.contact.trim(),
          type: trimmedType,
          monthlyRent: rent,
          lastPayment: isVacant ? "" : formState.lastPayment,
          nextDue: isVacant ? "" : formState.nextDue,
          status: formState.status,
          occupied: !isVacant
        });
        toast({ title: "Stall created", description: "New stall added successfully." });
      }

      await reloadStalls();
      closeFormDialog();
    } catch (error: any) {
      toast({
        title: "Operation failed",
        description: error.message || "Could not save stall",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    if (!stallToDelete) return;
    try {
      await deleteStall(stallToDelete.dbId);
      toast({ title: "Stall deleted", description: "The stall was removed successfully." });
      await reloadStalls();
      setStallToDelete(null);
    } catch (error: any) {
      toast({
        title: "Deletion failed",
        description: error.message || "Could not delete stall",
        variant: "destructive"
      });
    }
  };

  /* ----------------------------------------------------------
     RENDER
  ---------------------------------------------------------- */
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Stall Management</h1>
          <p className="text-muted-foreground">Track occupied stalls, vacant slots, and upcoming dues.</p>
        </div>
        <Button onClick={openCreateDialog} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Add Stall
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{item.value}</div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search / Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search vendor, type, or ID"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | StallStatus)}>
            <SelectTrigger>
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stall list */}
      {filteredStalls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No stalls match the current filters.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredStalls.map((stall) => (
            <Card key={stall.id}>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  {stall.name}
                </CardTitle>
                <Badge variant={getStatusBadge(stall.status)} className="capitalize">
                  {stall.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{stall.vendor || "No vendor assigned"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{stall.contact || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Monthly rent: ₱{stall.monthlyRent.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="capitalize" variant="outline">
                      {stall.type || "Uncategorised"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(stall)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setStallToDelete(stall)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : closeFormDialog())}>
        <DialogContent>
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{isEditMode ? "Edit Stall" : "Add New Stall"}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "Update stall information. Leave vendor fields blank for vacant stalls."
                  : "Fill in stall information. Leave vendor fields blank for vacant stalls."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Stall type</Label>
                <Select value={formState.type} onValueChange={(value) => handleFormChange("type", value)}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select stall type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formState.status} onValueChange={(value) => handleFormChange("status", value)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rent">Monthly rent (PHP)</Label>
                <Input
                  id="rent"
                  type="number"
                  min={0}
                  value={formState.monthlyRent}
                  onChange={(e) => handleFormChange("monthlyRent", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor name</Label>
                <Input
                  id="vendor"
                  value={formState.vendor}
                  onChange={(e) => handleFormChange("vendor", e.target.value)}
                  placeholder="Leave blank if vacant"
                  disabled={formState.status === "vacant"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">Contact number</Label>
                <Input
                  id="contact"
                  value={formState.contact}
                  onChange={(e) => handleFormChange("contact", e.target.value)}
                  placeholder="09xxxxxxxxx"
                  disabled={formState.status === "vacant"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last">Last payment date</Label>
                <Input
                  id="last"
                  type="date"
                  value={formState.lastPayment}
                  onChange={(e) => handleFormChange("lastPayment", e.target.value)}
                  disabled={formState.status === "vacant"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="next">Next due date</Label>
                <Input
                  id="next"
                  type="date"
                  value={formState.nextDue}
                  onChange={(e) => handleFormChange("nextDue", e.target.value)}
                  disabled={formState.status === "vacant"}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFormDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formState.type.trim() || !formState.monthlyRent.trim()}>
                {isEditMode ? "Save changes" : "Save stall"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(stallToDelete)} onOpenChange={(open) => (!open ? setStallToDelete(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stall</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The stall will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStallToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
