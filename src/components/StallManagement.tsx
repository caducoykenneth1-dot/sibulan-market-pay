import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type StallTypeInfo,
} from "@/data/stalls";

import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import {
  Archive,
  Building2,
  Calendar,
  DollarSign,
  Filter,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  User,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ArrowLeft } from "lucide-react";

/* ======================================================================
   1. AUTO BILLING FUNCTION
====================================================================== */
async function generateMonthlyInvoices() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result = {
    generatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const { data: stalls, error: stallsError } = await supabase
    .from("vendors")
    .select("id, vendor, type, monthly_rent, next_due, status, rental_type");

  if (stallsError || !stalls) {
    result.failedCount++;
    result.errors.push("Failed to fetch stalls.");
    return result;
  }

  const { data: existingInvoices } = await supabase
    .from("invoices")
    .select("vendor_id, due_date, status");

  const invoiceLookup = new Set();
  existingInvoices?.forEach((inv) => {
    if (inv.vendor_id && inv.due_date) {
      invoiceLookup.add(`${inv.vendor_id}-${inv.due_date}`);
    }
  });

  const typeCounters = new Map();
  const stallDisplayNameMap = new Map();

  stalls.forEach((stall) => {
    const { sequence } = getNextTypeSequence(typeCounters, stall.type);
    stallDisplayNameMap.set(stall.id, `Stall ${sequence}`);
  });

  for (const stall of stalls) {
    if (!stall.next_due || !stall.vendor) continue;

    const dueDateString = stall.next_due;
    const lookupKey = `${stall.id}-${dueDateString}`;

    if (invoiceLookup.has(lookupKey)) {
      result.skippedCount++;
      continue;
    }

    const nextDue = new Date(`${stall.next_due}T00:00:00Z`);
    nextDue.setUTCHours(0, 0, 0, 0);

    if (nextDue > today) continue;

    const stallDisplayName =
      stallDisplayNameMap.get(stall.id) || `Stall ${stall.id}`;

    const { error: insertError } = await supabase.from("invoices").insert({
      vendor_id: stall.id,
      stall_name: `${stall.type} - ${stallDisplayName}`,
      vendor_name: stall.vendor,
      amount: stall.monthly_rent,
      due_date: dueDateString,
      stall_type: stall.type,
      status: "unpaid",
    });

    if (insertError) {
      result.failedCount++;
      result.errors.push(
        `Could not create invoice for ${stall.vendor || `stall ${stall.id}`}.`
      );
      continue;
    }

    invoiceLookup.add(lookupKey);
    result.generatedCount++;

    const newDueDate = new Date(nextDue);

    if (stall.rental_type === "daily") {
      newDueDate.setUTCDate(newDueDate.getUTCDate() + 1);
    } else {
      newDueDate.setUTCMonth(newDueDate.getUTCMonth() + 1);
    }

    const newDueDateString = newDueDate.toISOString().split("T")[0];

    await supabase
      .from("vendors")
      .update({ next_due: newDueDateString })
      .eq("id", stall.id);
  }

  return result;
}

/* ======================================================================
   2. TYPES
====================================================================== */
type SortKey = "stallNumber" | "status" | "vendor";
type SortDirection = "asc" | "desc";

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

type SectionFilter = "all" | "Dry Section" | "Wet Section";

/* ======================================================================
   3. FRONTEND COMPONENT
====================================================================== */
export const StallManagement = ({ stalls, onStallsChange, userRole }) => {
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  const [sortConfig, setSortConfig] = useState({
    key: "stallNumber",
    direction: "asc",
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [stallBeingEdited, setStallBeingEdited] = useState(null);

  const [formState, setFormState] = useState({
    vendor: "",
    contact: "",
    type: "",
    rentAmount: "",
    rentalType: "monthly",
    status: "vacant",
    lastPayment: "",
    nextDue: "",
  });

  const [stallToDelete, setStallToDelete] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");

  const [selectedStall, setSelectedStall] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);

  const handleSectionSelect = (value) => {
    // Toggle visibility when clicking the same section; otherwise force visible.
    setFiltersVisible((prev) => !(prev && sectionFilter === value));
    setSectionFilter(value);
    setSearchTerm("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSortConfig({ key: "stallNumber", direction: "asc" });
  };

  /* ======================================================================
     INTERNAL FUNCTIONS
  ====================================================================== */

  const closeForm = () => {
    setIsCreateOpen(false);
    setIsEditMode(false);
    setStallBeingEdited(null);
    setFormState({
      vendor: "",
      contact: "",
      type: "",
      rentAmount: "",
      rentalType: "monthly",
      status: "vacant",
      lastPayment: "",
      nextDue: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedType = formState.type.trim();
    const rent = Number(formState.rentAmount);

    if (!trimmedType || Number.isNaN(rent)) return;

    const shouldClear =
      formState.status === "vacant" || formState.status === "archived";

    const computed = computeStatusFromDueDate(
      formState.nextDue,
      formState.status,
      undefined,
      formState.rentalType
    );

    const finalStatus = shouldClear ? formState.status : computed;

    try {
      if (isEditMode && stallBeingEdited) {
        await updateStall(stallBeingEdited.dbId, {
          vendor: shouldClear ? "" : formState.vendor.trim(),
          contact: shouldClear ? "" : formState.contact.trim(),
          type: trimmedType,
          rentAmount: rent,
          rentalType: formState.rentalType,
          status: finalStatus,
          lastPayment: formState.lastPayment || null,
          nextDue: formState.nextDue || null,
        });

        toast({
          title: "Stall updated",
          description: "Changes saved successfully.",
        });
      } else {
        await createStall({
          vendor: shouldClear ? "" : formState.vendor.trim(),
          contact: shouldClear ? "" : formState.contact.trim(),
          type: trimmedType,
          rentAmount: rent,
          rentalType: formState.rentalType,
          status: finalStatus,
          lastPayment: formState.lastPayment || null,
          nextDue: formState.nextDue || null,
        });

        toast({
          title: "Stall created",
          description: "New stall added successfully.",
        });
      }

      onStallsChange();
      closeForm();
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to save.",
        variant: "destructive",
      });
    }
  };

  const handleArchive = async () => {
    if (!stallToDelete) return;

    try {
      await updateStall(stallToDelete.dbId, {
        status: "archived",
        archive_reason: archiveReason.trim(),
        occupied: false,
      });

      toast({
        title: "Stall archived",
        description: "Stall successfully archived.",
      });

      onStallsChange();
      setStallToDelete(null);
      setArchiveReason("");
    } catch (err) {
      toast({
        title: "Archive failed",
        description: err.message || "Could not archive stall.",
        variant: "destructive",
      });
    }
  };

  // When the section filter changes, also reset the type filter.
  useEffect(() => {
    setTypeFilter("all");
  }, [sectionFilter]);

  /* ======================================================================
     4. SECTION MAPPING FROM STALL_TYPES
  ====================================================================== */
  const stallsWithSection = useMemo(() => {
    return stalls.map((stall) => {
      const matched = STALL_TYPES.find((t) => t.name === stall.type);
      return {
        ...stall,
        section: matched?.section || "N/A",
      };
    });
  }, [stalls]);

  // Get a unique, sorted list of stall types available for the selected section.
  const availableStallTypes = useMemo(() => {
    let types: string[];
    if (sectionFilter === "all") {
      // If "All" is selected, get all unique types from the master STALL_TYPES list.
      types = STALL_TYPES.map((t) => t.name);
    } else {
      // Otherwise, get types only from the selected section from the master list.
      types = STALL_TYPES.filter((t) => t.section === sectionFilter).map(
        (t) => t.name
      );
    }
    return [...new Set(types)].sort();
  }, [sectionFilter]);
  /* ======================================================================
     5. FILTER RESULTS
  ====================================================================== */
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStalls = useMemo(() => {
    let filtered = stallsWithSection.filter((stall) => {
      const matchesStatus =
        statusFilter === "all" || stall.status === statusFilter;

      const matchesType = typeFilter === "all" || stall.type === typeFilter;

      const matchesSection =
        sectionFilter === "all" || stall.section === sectionFilter;

      const matchesSearch =
        !normalizedSearch ||
        stall.vendor.toLowerCase().includes(normalizedSearch) ||
        stall.type.toLowerCase().includes(normalizedSearch) ||
        String(stall.dbId).includes(normalizedSearch);

      return (
        matchesStatus && matchesType && matchesSection && matchesSearch
      );
    });

    return filtered.sort((a, b) => {
      const { key, direction } = sortConfig;

      let valA = key === "stallNumber" ? a.dbId : a[key].toLowerCase();
      let valB = key === "stallNumber" ? b.dbId : b[key].toLowerCase();

      let comparison = 0;
      if (valA > valB) comparison = 1;
      if (valA < valB) comparison = -1;

      return direction === "asc" ? comparison : -comparison;
    });
  }, [
    stallsWithSection,
    statusFilter,
    typeFilter,
    sectionFilter,
    normalizedSearch,
    sortConfig,
  ]);

  /* ======================================================================
     6. PAGE HEADER
  ====================================================================== */
  return (
    <div className="space-y-6">
      {typeFilter === "all" ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Stall Management</h1>
          <p className="text-muted-foreground">
            Track occupied stalls, vacant slots, and upcoming dues.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setIsRefreshing(true);
              window.location.reload();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Stall
          </Button>

          {(userRole === "admin" || userRole === "collector") && (
            <Button
              variant="secondary"
              disabled={isGenerating}
              onClick={async () => {
                setIsGenerating(true);
                const result = await generateMonthlyInvoices();
                setIsGenerating(false);
                onStallsChange();
              }}
            >
              {isGenerating ? (
                "Generating..."
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" /> Generate Dues
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ======================================================================
          7. STATS
      ====================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Stalls",
            value: stallsWithSection.length,
            description: "",
          },
          {
            label: "Current",
            value: stallsWithSection.filter((s) => s.status === "current")
              .length,
            description: "Up to date",
          },
          {
            label: "Due Soon",
            value: stallsWithSection.filter((s) => s.status === "due").length,
            description: "Needs follow-up",
          },
          {
            label: "Overdue",
            value: stallsWithSection.filter((s) => s.status === "overdue").length,
            description: "Attention needed",
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{item.value}</div>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ======================================================================
          8. SECTION FIRST, THEN SEARCH & FILTERS
      ====================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Choose Section</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { label: "All", value: "all" },
              { label: "Dry", value: "Dry Section" },
              { label: "Wet", value: "Wet Section" },
            ].map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                className="h-9 px-4 min-w-[80px] rounded-full whitespace-nowrap"
                variant={sectionFilter === opt.value ? "default" : "outline"}
                onClick={() => handleSectionSelect(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Pick a section to reveal search and filters.
          </p>
        </CardContent>
      </Card>

          {/* ======================================================================
          Stall Type Buttons (conditionally rendered)
      ====================================================================== */}
          {filtersVisible && availableStallTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Filter by Stall Type
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {availableStallTypes.map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                onClick={() =>
                  setTypeFilter((prev) => (prev === type ? "all" : type))
                }
              >
                {type}
              </Button>
            ))}
          </CardContent>
        </Card>
          )}
        </>
      ) : (
        <>
          {/* ======================================================================
              9. STALL GRID (shown only when a type is selected)
          ====================================================================== */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setTypeFilter("all");
                  setSearchTerm(""); // Clear search on exit
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold">
                  {typeFilter} Stalls
                </h1>
                <p className="text-muted-foreground">
                  Select a stall to view its details or search below.
                </p>
              </div>
            </div>
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by vendor or ID..."
                className="pl-9"
              />
            </div>
          </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Stall Selection</CardTitle>
          </CardHeader>

          <CardContent>
            {filteredStalls.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                No stalls match your filters.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredStalls.map((stall) => (
                  <div key={stall.id} className="relative">
                    <Button
                      variant={
                        selectedStall?.id === stall.id ? "default" : "outline"
                      }
                      onClick={() =>
                        setSelectedStall(
                          selectedStall?.id === stall.id ? null : stall
                        )
                      }
                      className="h-12 w-12 p-0 transition-all hover:shadow-md"
                    >
                      <span className="font-bold text-xs text-center leading-tight">
                        {stall.name}
                      </span>
                    </Button>

                    {/* STATUS BADGE */}
                    <div
                      className={`absolute -top-2 -right-3 transform scale-90 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shadow-sm ${
                        stall.status === "current"
                          ? "bg-emerald-100 text-emerald-700"
                          : stall.status === "due"
                          ? "bg-amber-100 text-amber-700"
                          : stall.status === "overdue"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {stall.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* ======================================================================
          10. STALL VIEW MODAL
      ====================================================================== */}
      <Dialog
        open={Boolean(selectedStall)}
        onOpenChange={(open) => (!open ? setSelectedStall(null) : null)}
      >
        <DialogContent className="sm:max-w-lg md:max-w-xl border-none p-0 overflow-hidden px-4">
          {selectedStall && (
            <Card key={selectedStall.id} className="border-none shadow-none">

              <CardHeader className="px-6 pt-6 pb-0">
                <div className="flex items-start justify-between gap-3">

                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    {selectedStall.name}
                  </CardTitle>

                  <Badge variant="outline" className="capitalize">
                    {selectedStall.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm px-6 pb-6">
                <div className="grid gap-3 sm:grid-cols-2">

                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {selectedStall.vendor || "No vendor assigned"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedStall.contact || "N/A"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Rent: ₱
                      {selectedStall.rentAmount.toLocaleString()} /{" "}
                      {selectedStall.rentalType}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {selectedStall.type}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Last Payment: {selectedStall.lastPayment || "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Next Due: {selectedStall.nextDue || "N/A"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selectedStall.section}</Badge>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditMode(true);
                      setStallBeingEdited(selectedStall);
                      setFormState({
                        vendor: selectedStall.vendor,
                        contact: selectedStall.contact,
                        type: selectedStall.type,
                        rentAmount: selectedStall.rentAmount.toString(),
                        rentalType: selectedStall.rentalType,
                        status: selectedStall.status,
                        lastPayment: selectedStall.lastPayment,
                        nextDue: selectedStall.nextDue,
                      });
                      setIsCreateOpen(true);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={
                      userRole !== "collector" && userRole !== "admin"
                    }
                    onClick={() => setStallToDelete(selectedStall)}
                  >
                    <Archive className="mr-2 h-4 w-4" /> Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* END OF PART 2 */}


      {/* ======================================================================
          11. CREATE / EDIT STALL FORM
      ====================================================================== */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) =>
          open ? setIsCreateOpen(true) : closeForm()
        }
      >
        <DialogContent className="w-[90vw] max-w-lg rounded-md flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Stall" : "Add New Stall"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update stall information. Leave vendor fields blank for vacant stalls."
                : "Fill in stall information. Leave vendor fields blank for vacant stalls."}
            </DialogDescription>
          </DialogHeader>

          {/* FORM */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto pr-6 pl-1 -mr-6 -ml-1 space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">

              {/* TYPE */}
              <div className="space-y-2">
                <Label htmlFor="type">Stall Type</Label>
                <Select
                  value={formState.type}
                  onValueChange={(v) =>
                    setFormState({ ...formState, type: v })
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select stall type" />
                  </SelectTrigger>

                  <SelectContent>
                    {Object.entries(
                      STALL_TYPES.reduce((acc, item) => {
                        if (!acc[item.section]) acc[item.section] = [];
                        acc[item.section].push(item);
                        return acc;
                      }, {})
                    ).map(([section, types]) => (
                      <SelectGroup key={section}>
                        <SelectLabel>{section}</SelectLabel>
                        {types.map((t) => (
                          <SelectItem key={t.name} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* STATUS */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(v) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: v,
                      vendor:
                        v === "vacant" || v === "archived"
                          ? ""
                          : prev.vendor,
                      contact:
                        v === "vacant" || v === "archived"
                          ? ""
                          : prev.contact,
                    }))
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RENTAL TYPE */}
              <div className="space-y-2">
                <Label htmlFor="rentalType">Rental Type</Label>
                <Select
                  value={formState.rentalType}
                  onValueChange={(v) =>
                    setFormState({ ...formState, rentalType: v })
                  }
                >
                  <SelectTrigger id="rentalType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RENT */}
              <div className="space-y-2">
                <Label htmlFor="rent">Rent Amount (PHP)</Label>
                <Input
                  id="rent"
                  type="number"
                  min={0}
                  value={formState.rentAmount}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      rentAmount: e.target.value,
                    })
                  }
                  required
                />
              </div>

              {/* VENDOR NAME */}
              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor Name</Label>
                <Input
                  id="vendor"
                  value={formState.vendor}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      vendor: e.target.value,
                    })
                  }
                  placeholder="Leave blank if vacant"
                  disabled={formState.status === "vacant"}
                />
              </div>

              {/* CONTACT */}
              <div className="space-y-2">
                <Label htmlFor="contact">Contact Number</Label>
                <Input
                  id="contact"
                  value={formState.contact}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      contact: e.target.value,
                    })
                  }
                  placeholder="09xxxxxxxxx"
                  disabled={formState.status === "vacant"}
                />
              </div>

              {/* LAST PAYMENT */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lastPayment">Last Payment Date</Label>
                <Input
                  id="lastPayment"
                  type="date"
                  value={formState.lastPayment}
                  disabled={formState.status === "vacant"}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      lastPayment: e.target.value,
                    })
                  }
                />
              </div>

              {/* NEXT DUE */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nextDue">Next Due Date</Label>
                <Input
                  id="nextDue"
                  type="date"
                  value={formState.nextDue}
                  disabled={formState.status === "vacant"}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      nextDue: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => closeForm()}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  !formState.type.trim() || !formState.rentAmount.trim()
                }
              >
                {isEditMode ? "Save changes" : "Save stall"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================================
          12. ARCHIVE STALL CONFIRMATION
      ====================================================================== */}
      <AlertDialog
        open={Boolean(stallToDelete)}
        onOpenChange={(open) =>
          !open ? setStallToDelete(null) : null
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Stall Archival</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for archiving this stall.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reason</Label>
            <Textarea
              id="archive-reason"
              placeholder="e.g., Vendor left permanently..."
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setStallToDelete(null);
                setArchiveReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={!archiveReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleArchive}
            >
              Yes, Archive Stall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
