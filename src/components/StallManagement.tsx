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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

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
    if (nextDue >= today) continue;

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

    // ✅ Update stall status to 'due' so it doesn't show as 'current' (Paid)
    // ✅ Update stall status to 'overdue' since we only generate for overdue items now
    // We do NOT advance next_due here; that happens only upon payment.
    if (stall.status !== "overdue") {
      await supabase
        .from("vendors")
        .update({ status: "due" })
        .update({ status: "overdue" })
        .eq("id", stall.id);
    }
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
const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  
  // Transaction History State
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDayInvoices, setSelectedDayInvoices] = useState<any[]>([]);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);

  useEffect(() => {
    if (showTransactions && selectedStall) {
      const fetchTransactions = async () => {
        setIsLoadingTransactions(true);
        const { data } = await supabase
          .from("invoices")
          .select("*")
          .eq("vendor_id", selectedStall.dbId)
          .order("paid_at", { ascending: false });
        setTransactions(data || []);
        setIsLoadingTransactions(false);
      };
      fetchTransactions();
    }
  }, [showTransactions, selectedStall]);

  const handlePayInvoice = async (invoice: any) => {
    if (!selectedStall) return;

    // 1. Mark invoice as paid
    const { error: invError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        collector_name: "Manual Update",
      })
      .eq("id", invoice.id);

    if (invError) {
      toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" });
      return;
    }

    // 2. Advance vendor next_due
    const currentDue = new Date(invoice.due_date);
    const newDue = new Date(currentDue);
    if (selectedStall.rentalType === 'daily') {
        newDue.setDate(newDue.getDate() + 1);
    } else {
        newDue.setMonth(newDue.getMonth() + 1);
    }
    const newDueStr = newDue.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    await supabase
        .from("vendors")
        .update({
            next_due: newDueStr,
            last_payment: todayStr,
            status: 'current' 
        })
        .eq("id", selectedStall.dbId);

    toast({ title: "Payment Recorded", description: "Invoice marked as paid." });
    onStallsChange();
    setIsDayDialogOpen(false);
    setShowTransactions(false); // Close to force refresh next time
  };

const hasDueStalls = useMemo(() => {
  return stalls.some(
    (s) => s.status === "due" || s.status === "overdue"
  );
}, [stalls]);


  const handleSectionSelect = (value) => {
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
        String(stall.dbId).includes(normalizedSearch) ||
        stall.name.toLowerCase().includes(normalizedSearch);

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

               if (result.generatedCount === 0) {
                    setOverlayMessage("There are no stalls overdue.");
                  } else {
                    setOverlayMessage("Dues generated successfully.");
                  }

                  setTimeout(() => {
                    setOverlayMessage(null);
                  }, 3000);
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
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
          9. STALL GRID
      ====================================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-xl font-semibold">
            {typeFilter === "all" ? (sectionFilter === "all" ? "All Stalls" : sectionFilter) : typeFilter}
          </h2>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {availableStallTypes.length > 0 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-2 shrink-0">
                    <Filter className="h-4 w-4" />
                    <span className="hidden sm:inline">Filter Types</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Filter by Stall Type</SheetTitle>
                    <SheetDescription>
                      Select a stall type to filter the list.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="grid gap-2 py-4">
                    <Button
                      variant={typeFilter === "all" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setTypeFilter("all")}
                    >
                      All Types
                    </Button>
                    {availableStallTypes.map((type) => (
                      <Button
                        key={type}
                        variant={typeFilter === type ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setTypeFilter(type)}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
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
        </div>

        <Card>
          <CardContent className="pt-6">
            {filteredStalls.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                No stalls match your filters.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {filteredStalls.map((stall, index) => (
                  <Card
                    key={stall.id}
                    onClick={() =>
                      setSelectedStall(
                        selectedStall?.id === stall.id ? null : stall
                      )
                    }
                    className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden border-2 ${
                      selectedStall?.id === stall.id
                        ? "ring-2 ring-primary border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    style={{
                      animationDelay: `${index * 30}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[110px] gap-3">
                      {/* Status Indicator (Top Right) */}
                      <div
                        className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${
                          stall.status === "current"
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                            : stall.status === "due"
                            ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                            : stall.status === "overdue"
                            ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                            : "bg-slate-300"
                        }`}
                      />

                      <div
                        className={`p-3 rounded-full transition-colors duration-300 ${
                          selectedStall?.id === stall.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        }`}
                      >
                        <Building2 className="h-6 w-6" />
                      </div>

                      <div className="text-center w-full">
                        <span className="font-bold text-sm leading-tight block truncate">
                          {stall.name}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-semibold tracking-wider ${
                            stall.status === "current"
                              ? "text-emerald-600"
                              : stall.status === "due"
                              ? "text-amber-600"
                              : stall.status === "overdue"
                              ? "text-rose-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {stall.status === "current" ? "Paid" : stall.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                      onClick={() => setShowTransactions(true)}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      Transactions
                    </Button>

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
                      disabled={userRole !== "collector" && userRole !== "admin"}
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

      {/* Custom Overlay Message for No Dues */}
     {/* CENTER OVERLAY MESSAGE */}
<div
  className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-500 ${
    overlayMessage ? "opacity-100 scale-100" : "opacity-0 scale-95"
  }`}
>
  <div className="bg-black/80 text-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 backdrop-blur-sm">
    <CheckCircle className="h-12 w-12 text-green-400" />
    <span className="text-xl font-bold text-center">
      {overlayMessage}
        </span>
       </div>
      </div>

      {/* ======================================================================
          13. TRANSACTION HISTORY DIALOG
      ====================================================================== */}
      <Dialog open={showTransactions} onOpenChange={setShowTransactions}>
        <DialogContent className="sm:max-w-lg w-[95vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              Payment records for {selectedStall?.name}
            </DialogDescription>
          </DialogHeader>

          {/* Calendar View */}
          <div className="mb-4 border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setFullYear(d.getFullYear() - 1);
                  setCalendarDate(d);
                }}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarDate(d);
                }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <div className="font-semibold text-sm">
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarDate(d);
                }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setFullYear(d.getFullYear() + 1);
                  setCalendarDate(d);
                }}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const dayInvoices = transactions.filter(t => {
                  const isDue = t.due_date === dateStr;
                  let isPaidOnDay = false;
                  if (t.paid_at) {
                    const p = new Date(t.paid_at);
                    const pStr = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
                    isPaidOnDay = pStr === dateStr;
                  }
                  return isDue || isPaidOnDay;
                });
                
                let statusClass = "hover:bg-muted";
                if (dayInvoices.length > 0) {
                  const hasUnpaidDue = dayInvoices.some(t => t.due_date === dateStr && (t.status === 'unpaid' || t.status === 'overdue'));
                  const hasPaid = dayInvoices.some(t => t.status === 'paid');

                  if (hasUnpaidDue) statusClass = "bg-rose-100 text-rose-700 font-bold";
                  else if (hasPaid) statusClass = "bg-emerald-100 text-emerald-700 font-bold";
                }

                return (
                  <div key={day} onClick={() => { setSelectedDayInvoices(dayInvoices); setIsDayDialogOpen(true); }} className={`aspect-square flex items-center justify-center rounded-md text-xs cursor-pointer ${statusClass}`}>
                    {day}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-[10px] justify-center text-muted-foreground">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-100 rounded-full"></div> Paid / Payment Date</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-100 rounded-full"></div> Unpaid / Due</div>
            </div>
          </div>
          
          <div className="max-h-[40vh] md:max-h-[30vh] overflow-y-auto space-y-3 pr-1 border-t pt-4">
            {isLoadingTransactions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No transactions found for this stall.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">
                      {tx.payment_type || "Payment"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString() : "Pending"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-emerald-600">
                      ₱{tx.amount?.toLocaleString()}
                    </div>
                    <Badge variant={tx.status === 'paid' ? 'outline' : 'secondary'} className="text-[10px] h-5">
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Details Dialog */}
      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent className="sm:max-w-sm w-[90vw] rounded-xl">
            <DialogHeader>
                <DialogTitle>
                  {calendarDate.toLocaleString('default', { month: 'long' })} Details
                </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
                {selectedDayInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No records for this date.</p>
                ) : (
                 selectedDayInvoices.map(inv => (
                    <div key={inv.id} className="flex justify-between items-center border p-3 rounded-lg bg-card">
                        <div>
                            <p className="font-medium text-sm">{inv.payment_type || "Rent"}</p>
                            <p className="text-xs text-muted-foreground">Amount: ₱{inv.amount?.toLocaleString()}</p>
                        </div>
                        {inv.status === 'paid' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                        ) : (
                            <Button size="sm" onClick={() => handlePayInvoice(inv)}>Mark Paid</Button>
                        )}
                    </div>
                 ))
                )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
```
                      }
                      className="h-16 w-16 md:h-24 md:w-24 p-1 transition-all hover:shadow-md flex flex-col gap-1"
                    >
                      <Building2 className="h-4 w-4 md:h-6 md:w-6 opacity-40" />
                      <span className="font-bold text-xs md:text-sm text-center leading-tight whitespace-normal">
                        {stall.name}
                      </span>
                    </Button>

                    {/* STATUS BADGE */}
                    <div
                      className={`absolute -top-2 -right-2 md:-top-3 md:-right-3 transform scale-90 md:scale-100 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-semibold shadow-sm z-10 ${
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
                      }
                      onClick={() =>
                        setSelectedStall(
                          selectedStall?.id === stall.id ? null : stall
                        )
                      }
                      className="h-16 w-16 md:h-24 md:w-24 p-1 transition-all hover:shadow-md flex flex-col gap-1"
                    >
                      <Building2 className="h-4 w-4 md:h-6 md:w-6 opacity-40" />
                      <span className="font-bold text-xs md:text-sm text-center leading-tight whitespace-normal">
                        {stall.name}
                      </span>
                    </Button>

                    {/* STATUS BADGE */}
                    <div
                      className={`absolute -top-2 -right-2 md:-top-3 md:-right-3 transform scale-90 md:scale-100 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-semibold shadow-sm z-10 ${
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
      </div>

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
                      onClick={() => setShowTransactions(true)}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      Transactions
                    </Button>

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
                      disabled={userRole !== "collector" && userRole !== "admin"}
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

      {/* Custom Overlay Message for No Dues */}
     {/* CENTER OVERLAY MESSAGE */}
<div
  className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-500 ${
    overlayMessage ? "opacity-100 scale-100" : "opacity-0 scale-95"
  }`}
>
  <div className="bg-black/80 text-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 backdrop-blur-sm">
    <CheckCircle className="h-12 w-12 text-green-400" />
    <span className="text-xl font-bold text-center">
      {overlayMessage}
        </span>
       </div>
      </div>

      {/* ======================================================================
          13. TRANSACTION HISTORY DIALOG
      ====================================================================== */}
      <Dialog open={showTransactions} onOpenChange={setShowTransactions}>
        <DialogContent className="sm:max-w-lg w-[95vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              Payment records for {selectedStall?.name}
            </DialogDescription>
          </DialogHeader>

          {/* Calendar View */}
          <div className="mb-4 border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setFullYear(d.getFullYear() - 1);
                  setCalendarDate(d);
                }}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarDate(d);
                }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <div className="font-semibold text-sm">
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarDate(d);
                }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                  const d = new Date(calendarDate);
                  d.setFullYear(d.getFullYear() + 1);
                  setCalendarDate(d);
                }}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const dayInvoices = transactions.filter(t => {
                  const isDue = t.due_date === dateStr;
                  let isPaidOnDay = false;
                  if (t.paid_at) {
                    const p = new Date(t.paid_at);
                    const pStr = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
                    isPaidOnDay = pStr === dateStr;
                  }
                  return isDue || isPaidOnDay;
                });
                
                let statusClass = "hover:bg-muted";
                if (dayInvoices.length > 0) {
                  const hasUnpaidDue = dayInvoices.some(t => t.due_date === dateStr && (t.status === 'unpaid' || t.status === 'overdue'));
                  const hasPaid = dayInvoices.some(t => t.status === 'paid');

                  if (hasUnpaidDue) statusClass = "bg-rose-100 text-rose-700 font-bold";
                  else if (hasPaid) statusClass = "bg-emerald-100 text-emerald-700 font-bold";
                }

                return (
                  <div key={day} onClick={() => { setSelectedDayInvoices(dayInvoices); setIsDayDialogOpen(true); }} className={`aspect-square flex items-center justify-center rounded-md text-xs cursor-pointer ${statusClass}`}>
                    {day}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-[10px] justify-center text-muted-foreground">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-100 rounded-full"></div> Paid / Payment Date</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-100 rounded-full"></div> Unpaid / Due</div>
            </div>
          </div>
          
          <div className="max-h-[40vh] md:max-h-[30vh] overflow-y-auto space-y-3 pr-1 border-t pt-4">
            {isLoadingTransactions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No transactions found for this stall.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">
                      {tx.payment_type || "Payment"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString() : "Pending"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-emerald-600">
                      ₱{tx.amount?.toLocaleString()}
                    </div>
                    <Badge variant={tx.status === 'paid' ? 'outline' : 'secondary'} className="text-[10px] h-5">
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Details Dialog */}
      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent className="sm:max-w-sm w-[90vw] rounded-xl">
            <DialogHeader>
                <DialogTitle>
                  {calendarDate.toLocaleString('default', { month: 'long' })} Details
                </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
                {selectedDayInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No records for this date.</p>
                ) : (
                 selectedDayInvoices.map(inv => (
                    <div key={inv.id} className="flex justify-between items-center border p-3 rounded-lg bg-card">
                        <div>
                            <p className="font-medium text-sm">{inv.payment_type || "Rent"}</p>
                            <p className="text-xs text-muted-foreground">Amount: ₱{inv.amount?.toLocaleString()}</p>
                        </div>
                        {inv.status === 'paid' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                        ) : (
                            <Button size="sm" onClick={() => handlePayInvoice(inv)}>Mark Paid</Button>
                        )}
                    </div>
                 ))
                )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
