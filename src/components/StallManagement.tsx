import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { BASE_TYPE_OPTIONS, getNextStallNumbers, type StallRecord, type StallStatus } from "@/data/stalls";
import { Building2, DollarSign, Filter, Pencil, Phone, Plus, Search, Trash2, User } from "lucide-react";

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

export const StallManagement = ({ stalls, onStallsChange }: StallManagementProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StallStatus>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [stallBeingEdited, setStallBeingEdited] = useState<StallRecord | null>(null);
  const [formState, setFormState] = useState<StallFormState>(createEmptyForm());
  const [stallToDelete, setStallToDelete] = useState<StallRecord | null>(null);

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

  const displayNameById = useMemo(() => {
    const counters = new Map<string, number>();
    const names = new Map<string, string>();
    stalls.forEach((stall) => {
      const normalizedType = stall.type.trim().toLowerCase();
      const typeKey = normalizedType || "uncategorised";
      const nextNumber = (counters.get(typeKey) ?? 0) + 1;
      counters.set(typeKey, nextNumber);
      names.set(stall.id, `Stall ${nextNumber}`);
    });
    return names;
  }, [stalls]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStalls = useMemo(() => {
    return stalls.filter((stall) => {
      const matchesStatus = statusFilter === "all" || stall.status === statusFilter;
      const matchesType = typeFilter === "all" || stall.type === typeFilter;
      const displayName = displayNameById.get(stall.id) ?? stall.name;
      const matchesSearch =
        !normalizedSearch ||
        displayName.toLowerCase().includes(normalizedSearch) ||
        stall.name.toLowerCase().includes(normalizedSearch) ||
        stall.id.toLowerCase().includes(normalizedSearch) ||
        stall.vendor.toLowerCase().includes(normalizedSearch) ||
        stall.type.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesType && matchesSearch;
    });
  }, [stalls, statusFilter, typeFilter, normalizedSearch, displayNameById]);

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

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedType = formState.type.trim();
    const rent = Number(formState.monthlyRent);

    if (!trimmedType || Number.isNaN(rent)) {
      return;
    }

    const isVacant = formState.status === "vacant";

    if (isEditMode && stallBeingEdited) {
      onStallsChange((prev) =>
        prev.map((stall) => {
          if (stall.id !== stallBeingEdited.id) {
            return stall;
          }

          return {
            ...stall,
            vendor: isVacant ? "" : formState.vendor.trim(),
            contact: isVacant ? "" : formState.contact.trim(),
            type: trimmedType,
            monthlyRent: rent,
            lastPayment: isVacant ? "" : formState.lastPayment,
            nextDue: isVacant ? "" : formState.nextDue,
            status: formState.status,
            occupied: !isVacant
          };
        })
      );
      closeFormDialog();
      return;
    }

    const { nextIdNumber, nextNameNumber } = getNextStallNumbers(stalls, trimmedType);

    const newStall: StallRecord = {
      id: `stall-${nextIdNumber}`,
      name: `Stall ${nextNameNumber}`,
      vendor: isVacant ? "" : formState.vendor.trim(),
      contact: isVacant ? "" : formState.contact.trim(),
      type: trimmedType,
      monthlyRent: rent,
      lastPayment: isVacant ? "" : formState.lastPayment,
      nextDue: isVacant ? "" : formState.nextDue,
      status: formState.status,
      occupied: !isVacant
    };

    onStallsChange((prev) => [...prev, newStall]);
    closeFormDialog();
  };

  const handleDelete = () => {
    if (!stallToDelete) {
      return;
    }

    const targetId = stallToDelete.id;
    const targetType = stallToDelete.type;

    onStallsChange((prev) => prev.filter((stall) => stall.id !== targetId));

    if (typeFilter !== "all" && targetType === typeFilter) {
      const stillHasType = stalls.some((stall) => stall.id !== targetId && stall.type === targetType);
      if (!stillHasType) {
        setTypeFilter("all");
      }
    }

    setStallToDelete(null);
  };

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
              placeholder="Search stall, vendor, or ID"
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

      {filteredStalls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No stalls match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredStalls.map((stall) => (
            <Card key={stall.id}>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  {displayNameById.get(stall.id) ?? stall.name}
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
                    <span>Monthly rent: PHP {stall.monthlyRent.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="capitalize" variant="outline">
                      {stall.type || "Uncategorised"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(stall)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit stall
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setStallToDelete(stall)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete stall
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : closeFormDialog())}>
        <DialogContent>
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{isEditMode ? "Edit stall" : "Add a new stall"}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "Update stall information. Leave vendor fields blank for vacant stalls."
                  : "Fill in stall information. Leave vendor fields blank for vacant stalls."
                }
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-type">Stall type</Label>
                <Select value={formState.type} onValueChange={(value) => handleFormChange("type", value)}>
                  <SelectTrigger id="new-type">
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
                <Label htmlFor="new-status">Status</Label>
                <Select value={formState.status} onValueChange={(value) => handleFormChange("status", value)}>
                  <SelectTrigger id="new-status">
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
                <Label htmlFor="new-rent">Monthly rent (PHP)</Label>
                <Input
                  id="new-rent"
                  type="number"
                  min={0}
                  value={formState.monthlyRent}
                  onChange={(event) => handleFormChange("monthlyRent", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-vendor">Vendor name</Label>
                <Input
                  id="new-vendor"
                  value={formState.vendor}
                  onChange={(event) => handleFormChange("vendor", event.target.value)}
                  placeholder="Leave blank if vacant"
                  disabled={formState.status === "vacant"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-contact">Contact number</Label>
                <Input
                  id="new-contact"
                  value={formState.contact}
                  onChange={(event) => handleFormChange("contact", event.target.value)}
                  placeholder="09xxxxxxxxx"
                  disabled={formState.status === "vacant"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-last">Last payment date</Label>
                <Input
                  id="new-last"
                  type="date"
                  value={formState.lastPayment}
                  onChange={(event) => handleFormChange("lastPayment", event.target.value)}
                  disabled={formState.status === "vacant"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-next">Next due date</Label>
                <Input
                  id="new-next"
                  type="date"
                  value={formState.nextDue}
                  onChange={(event) => handleFormChange("nextDue", event.target.value)}
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

      <AlertDialog open={Boolean(stallToDelete)} onOpenChange={(open) => (!open ? setStallToDelete(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stall</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The stall will be removed from payment collection and reports.
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



















