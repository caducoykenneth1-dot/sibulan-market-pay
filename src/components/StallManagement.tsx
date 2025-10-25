import { useMemo, useState, type Dispatch, type SetStateAction, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  BASE_TYPE_OPTIONS,
  STALL_TYPES,
  computeStatusFromDueDate,
  createStall,
  deleteStall,
  getNextTypeSequence,
  updateStall,
  type StallRecord,
  type StallStatus,
  type StallTypeInfo
} from "@/data/stalls";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Archive, Building2, Calendar, DollarSign, Filter, Pencil, Phone, Plus, RefreshCw, Search, User, ArrowUp, ArrowDown } from "lucide-react";

/* ----------------------------------------------------------
   🧾 AUTO BILLING FUNCTION
---------------------------------------------------------- */
async function generateMonthlyInvoices(toast: any) {
  const today = new Date();

  // 1️⃣ Fetch all vendors/stalls
  const { data: stalls, error } = await supabase
    .from("vendors")
    .select("id, vendor, type, monthly_rent, next_due, status, rental_type");

  if (error) {
    console.error("Error fetching stalls:", error);
    toast({
      title: "Error",
      description: "Failed to fetch stall data.",
      variant: "destructive",
    });
    return;
  }

  // ✅ Create a map of dbId to its calculated display name (e.g., 101 -> "Stall 1")
  const typeCounters = new Map<string, number>();
  const stallDisplayNameMap = new Map<number, string>();
  stalls.forEach(stall => {
    const { sequence: typeSequence } = getNextTypeSequence(typeCounters, stall.type);
    stallDisplayNameMap.set(stall.id, `Stall ${typeSequence}`);
  });

  let generatedCount = 0;

  // 2️⃣ Loop through and create invoices for due stalls
  for (const stall of stalls) {
    if (!stall.next_due) continue; // Skip stalls without a due date

    const nextDue = new Date(stall.next_due); // e.g., 2024-07-25T00:00:00
    nextDue.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC

    const stallDisplayName = stallDisplayNameMap.get(stall.id) || `Stall ${stall.id}`;
    
    // ✅ Generate invoices for stalls that are due today or are already past their due date.
    if (stall.vendor && nextDue <= today) {
      const { error: insertError } = await supabase.from("invoices").insert({
        vendor_id: stall.id, // link to vendor record
        stall_name: `${stall.type} - ${stallDisplayName}`,
        vendor_name: stall.vendor,
        amount: stall.monthly_rent,
        due_date: nextDue.toISOString().split("T")[0],
        stall_type: stall.type, // ✅ Add stall type to the invoice
        status: "unpaid",
      });

      if (!insertError) {
        generatedCount++;

        // 3️⃣ Move next_due forward by one month
        const newDueDate = new Date(nextDue);
        if (stall.rental_type === 'daily') {
          // ✅ Advance by one day for daily rentals
          newDueDate.setDate(newDueDate.getDate() + 1);
        } else {
          // ✅ Advance by one month for monthly rentals
          newDueDate.setMonth(newDueDate.getMonth() + 1);
        }

        await supabase
          .from("vendors")
          .update({ next_due: newDueDate.toISOString().split("T")[0] })
          .eq("id", stall.id);
      }
    }
  }

  // 4️⃣ Toast result
  toast({
    title: "Invoices Generated",
    description:
      generatedCount > 0
        ? `${generatedCount} invoices created successfully.`
        : "No stalls were due today.",
  });
}

/* ----------------------------------------------------------
   MAIN COMPONENT
---------------------------------------------------------- */
interface StallManagementProps {
  stalls: StallRecord[];
  onStallsChange: () => void;
  userRole: string;
}

type SortKey = 'stallNumber' | 'status' | 'vendor';
type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

type StallFormState = {
  vendor: string;
  contact: string;
  type: string;
  rentAmount: string;
  rentalType: 'monthly' | 'daily';
  status: StallStatus;
  lastPayment: string;
  nextDue: string;
};

const STATUS_OPTIONS: { value: StallStatus; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "due", label: "Due" },
  { value: "overdue", label: "Overdue" },
  { value: "vacant", label: "Vacant" },
  { value: "archived", label: "Archived" },
];

const RENTAL_TYPE_OPTIONS: { value: 'monthly' | 'daily'; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "daily", label: "Daily" },
];

const createEmptyForm = (): StallFormState => ({
  vendor: "",
  contact: "",
  type: "",
  rentAmount: "",
  rentalType: "monthly",
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

const statusStyles: Record<StallStatus, { badge: string; border: string }> = {
  current: {
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-500/30",
  },
  due: {
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-500/40",
  },
  overdue: { badge: "bg-rose-100 text-rose-700", border: "border-rose-500/40" },
  vacant: { badge: "bg-gray-100 text-gray-600", border: "border-gray-300/70" },
  archived: { badge: "bg-slate-100 text-slate-600", border: "border-slate-400/50" },
};

/* ----------------------------------------------------------
   COMPONENT
---------------------------------------------------------- */
export const StallManagement = ({ stalls, onStallsChange, userRole }: StallManagementProps) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StallStatus>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'stallNumber', direction: 'asc' });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [stallBeingEdited, setStallBeingEdited] = useState<StallRecord | null>(null);
  const [formState, setFormState] = useState<StallFormState>(createEmptyForm());
  const [stallToDelete, setStallToDelete] = useState<StallRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [selectedStall, setSelectedStall] = useState<StallRecord | null>(null);

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

  const groupedStallTypes = useMemo(() => {
    return STALL_TYPES.reduce((acc, type) => {
      if (!acc[type.section]) {
        acc[type.section] = [];
      }
      acc[type.section].push(type);
      return acc;
    }, {} as Record<string, StallTypeInfo[]>);
  }, []);

  const stats = useMemo(() => {
    const counts: Record<StallStatus, number> = {
      current: 0,
      due: 0,
      overdue: 0,
      vacant: 0,
      archived: 0
    };
    stalls.forEach((stall) => {
      counts[stall.status] += 1;
    });
    return [
      { 
        label: "Total Stalls", 
        value: stalls.length, 
        description: `${counts.current + counts.due + counts.overdue} occupied, ${counts.vacant} vacant` 
      },
      { label: "Current", value: counts.current, description: "Up to date" },
      { label: "Due Soon", value: counts.due, description: "Needs follow-up" },
      { label: "Overdue", value: counts.overdue, description: "Attention needed" }
    ];
  }, [stalls]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStalls = useMemo(() => {
    let filtered = stalls.filter((stall) => {
      const matchesStatus = statusFilter === "all" || stall.status === statusFilter;
      const matchesType = typeFilter === "all" || stall.type === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        stall.vendor.toLowerCase().includes(normalizedSearch) ||
        stall.type.toLowerCase().includes(normalizedSearch) ||
        String(stall.dbId).includes(normalizedSearch);
      return matchesStatus && matchesType && matchesSearch;
    });

    // Sorting logic
    return filtered.sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: string | number;
      let valB: string | number;

      if (key === 'stallNumber') {
        valA = a.dbId;
        valB = b.dbId;
      } else {
        valA = a[key].toLowerCase();
        valB = b[key].toLowerCase();
      }

      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;

      return direction === 'asc' ? comparison : -comparison;
    });
  }, [stalls, statusFilter, typeFilter, normalizedSearch, sortConfig]);

  const groupedStalls = useMemo(() => {
    return filteredStalls.reduce((acc, stall) => {
      const section = stall.section || 'Uncategorized';
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(stall);
      return acc;
    }, {} as Record<string, StallRecord[]>);
  }, [filteredStalls]);

  // When filters change, reset the selected stall if it's no longer in the list
  useEffect(() => {
    if (selectedStall && !filteredStalls.find(s => s.id === selectedStall.id)) {
      setSelectedStall(null);
    }
  }, [filteredStalls, selectedStall]);

  /* ----------------------------------------------------------
     CRUD + GENERATE DUES BUTTON
  ---------------------------------------------------------- */

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
      rentAmount: String(stall.rentAmount),
      rentalType: stall.rentalType,
      status: stall.status,
      lastPayment: stall.lastPayment,
      nextDue: stall.nextDue,
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

  const handleFormChange = (field: keyof StallFormState, rawValue: string) => {
    setFormState((previous) => {
      let value = rawValue;

      if (field === "contact" && userRole?.toLowerCase() === "admin") {
        const digitsOnly = rawValue.replace(/[^0-9]/g, "");
        const isValidStart = digitsOnly === "" || digitsOnly.startsWith("0");
        if (!isValidStart || digitsOnly.length > 11) {
          return previous;
        }
        value = digitsOnly;
      }

      const updated: StallFormState = { ...previous, [field]: value };

      if (field === "status" && (value === "vacant" || value === "archived")) {
        return {
          ...updated,
          vendor: "",
          contact: "",
          lastPayment: "",
          nextDue: "",
        };
      }

      if (field === "nextDue" && updated.status !== "vacant" && updated.status !== "archived") {
        updated.status = computeStatusFromDueDate(updated.nextDue, "current");
      }

      return updated;
    });
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedType = formState.type.trim();
    const rent = Number(formState.rentAmount);
    const shouldClearOccupant = formState.status === "vacant" || formState.status === "archived";
    const computedStatus = computeStatusFromDueDate(formState.nextDue, "current");
    const finalStatus = shouldClearOccupant ? formState.status : computedStatus;

    if (!trimmedType || Number.isNaN(rent)) return;

    try {
      if (isEditMode && stallBeingEdited) {
       await updateStall(stallBeingEdited.dbId, {
  vendor: shouldClearOccupant ? "" : formState.vendor.trim(),
  contact: shouldClearOccupant ? "" : formState.contact.trim(),
  type: trimmedType,
  rentAmount: rent,
  rentalType: formState.rentalType,
  status: finalStatus,
  // ✅ Fix: Convert empty dates to null
  lastPayment: formState.lastPayment ? formState.lastPayment : null,
  nextDue: formState.nextDue ? formState.nextDue : null
});

        toast({ title: "Stall updated", description: "Changes saved successfully." });
      } else {
        await createStall({
  vendor: shouldClearOccupant ? "" : formState.vendor.trim(),
  contact: shouldClearOccupant ? "" : formState.contact.trim(),
  type: trimmedType,
  rentAmount: rent,
  rentalType: formState.rentalType,
  status: finalStatus,
  lastPayment: formState.lastPayment ? formState.lastPayment : null, // ✅ Fix
  nextDue: formState.nextDue ? formState.nextDue : null // ✅ Fix
});

        toast({ title: "Stall created", description: "New stall added successfully." });
      }

      onStallsChange();
      closeFormDialog();
    } catch (error: any) {
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Could not save stall. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Operation failed",
          description: error.message || "Could not save stall",
          variant: "destructive"
        });
      }
    }
  };

  const handleArchive = async () => {
    if (!stallToDelete) return;
    if (!archiveReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for archiving.", variant: "destructive" });
      return;
    }
    try {
      await updateStall(stallToDelete.dbId, {
        status: 'archived',
        occupied: false,
        archive_reason: archiveReason.trim(),
      });
      toast({ title: "Stall Archived", description: "The stall has been moved to the archives." });
      onStallsChange();
      setStallToDelete(null);
      setArchiveReason(""); // Reset reason
    } catch (error: any) {
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Could not archive stall. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Archive Failed",
          description: error.message || "Could not archive the stall.",
          variant: "destructive"
        });
      }
    }
  };

  const handleGenerateClick = async () => {
    setIsGenerating(true);
    await generateMonthlyInvoices(toast);
    onStallsChange();
    setIsGenerating(false);
  };

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    window.location.reload();
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefreshClick} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={openCreateDialog} className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Stall
          </Button>
          {(userRole?.toLowerCase() === "admin" || userRole?.toLowerCase() === "collector") && (
            <Button
              variant="secondary"
              disabled={isGenerating}
              onClick={handleGenerateClick}
              className="w-full md:w-auto"
            >
              {isGenerating ? "Generating..." : (<><Calendar className="mr-2 h-4 w-4" /> Generate Dues</>)}
            </Button>
          )}
        </div>
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
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <div className="flex gap-2">
            <Select value={sortConfig.key} onValueChange={(value) => setSortConfig({ ...sortConfig, key: value as SortKey })}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stallNumber">Stall Number</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="vendor">Vendor Name</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
            >
              {sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stall List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Stall Selection</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStalls.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No stalls match the current filters.</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedStalls).map(([section, sectionStalls]) => (
                <div key={section}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">{section}</h3>
                  <div className="flex flex-wrap gap-2">
                    {sectionStalls.map((stall) => (
                      <div key={stall.id} className="relative">
                        <Button
                          variant={selectedStall?.id === stall.id ? "default" : "outline"}
                          onClick={() => setSelectedStall(prev => prev?.id === stall.id ? null : stall)}
                          className={`h-12 w-12 p-0 transition-all hover:shadow-md ${statusStyles[stall.status]?.border ?? ""}`}
                        >
                          <span className="font-bold text-xs leading-tight text-center">{stall.name}</span>
                        </Button>
                        <div 
                          className={`absolute -top-2 -right-3 transform-gpu scale-90 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shadow-sm ${statusStyles[stall.status]?.badge ?? "bg-gray-200"}`}
                        >
                          {stall.status.charAt(0).toUpperCase() + stall.status.slice(1)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Stall Modal */}
      <Dialog open={Boolean(selectedStall)} onOpenChange={(open) => (!open ? setSelectedStall(null) : null)}>
        <DialogContent className="sm:max-w-lg md:max-w-xl border-none p-0 overflow-hidden px-4">
          {selectedStall && (
            <Card key={selectedStall.id} className="border-none shadow-none">
              <CardHeader className="px-6 pt-6 pb-0">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    {selectedStall.name}
                  </CardTitle>
                  <Badge variant={getStatusBadge(selectedStall.status)} className="capitalize">
                    {selectedStall.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm px-6 pb-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>{selectedStall.vendor || "No vendor assigned"}</span></div>
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{selectedStall.contact || "N/A"}</span></div>
                  <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><span>Rent: ₱{selectedStall.rentAmount.toLocaleString()} / {selectedStall.rentalType}</span></div>
                  <div className="flex items-center gap-2"><Badge className="capitalize" variant="outline">{selectedStall.type || "Uncategorised"}</Badge></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Last Payment: {selectedStall.lastPayment || "N/A"}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Next Due: {selectedStall.nextDue || "N/A"}</span></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(selectedStall)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setStallToDelete(selectedStall)}
                    disabled={userRole?.toLowerCase() !== "collector" && userRole?.toLowerCase() !== "admin"}
                  >
                    <Archive className="mr-2 h-4 w-4" /> Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : closeFormDialog())}>
        <DialogContent className="w-[90vw] max-w-lg rounded-md flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Stall" : "Add New Stall"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update stall information. Leave vendor fields blank for vacant stalls."
                : "Fill in stall information. Leave vendor fields blank for vacant stalls."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto pr-6 pl-1 -mr-6 -ml-1 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 ">
                <div className="space-y-2">
                  <Label htmlFor="type">Stall type</Label>
                  <Select value={formState.type} onValueChange={(value) => handleFormChange("type", value)}>
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select stall type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedStallTypes).map(([section, types]) => (
                        <SelectGroup key={section}>
                          <SelectLabel>{section}</SelectLabel>
                          {types.map((type) => (
                            <SelectItem key={type.name} value={type.name}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formState.status}
                    onValueChange={(value) => handleFormChange("status", value as StallStatus)}>
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
                  <Label htmlFor="rentalType">Rental Type</Label>
                  <Select value={formState.rentalType} onValueChange={(value) => handleFormChange("rentalType", value as 'monthly' | 'daily')}>
                    <SelectTrigger id="rentalType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RENTAL_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rent">Rent Amount (PHP)</Label>
                  <Input
                    id="rent"
                    type="number"
                    min={0}
                    value={formState.rentAmount}
                    onChange={(e) => handleFormChange("rentAmount", e.target.value)}
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

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="last">Last payment date</Label>
                  <Input
                    id="last"
                    type="date"
                    value={formState.lastPayment}
                    onChange={(e) => handleFormChange("lastPayment", e.target.value)}
                    disabled={formState.status === "vacant"}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
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
              <Button type="submit" disabled={!formState.type.trim() || !formState.rentAmount.trim()}>
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
            <AlertDialogTitle>Confirm Stall Archival</AlertDialogTitle>
            <AlertDialogDescription>
              To archive this stall, please provide a reason. This helps maintain clear records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reason for Archiving</Label>
            <Textarea
              id="archive-reason"
              placeholder="e.g., Stall holder retired, contract ended, etc."
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStallToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={!archiveReason.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              Yes, Archive Stall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
