import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DataTable } from "./data-table";
import { RowSelectionState } from "@tanstack/react-table";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Users,
  DollarSign,
  Search,
  Filter,
  CalendarDays,
  ArrowLeft,
  Eye,
  X,
  ChevronDown,
} from "lucide-react";
import { STALL_TYPES } from "@/data/stalls";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { columns as createDesktopColumns, createMobileColumns } from "./unpaid-dues-columns";

export interface Invoice {
  id: number;
  vendor_id: number | string;
  vendor_name: string;
  stall_name: string;
  amount: number;
  due_date: string;
  status: "unpaid" | "paid" | "overdue";
  paid_at?: string | null;
  stall_type?: string | null;
  payment_type?: string | null;
  collector_name?: string | null;
  notes?: string | null;
  receipt_number?: string | null;
}

export interface UnpaidStall extends Invoice {
  sectionTag: string;
  typeTag: string;
}

const sectionMap = new Map(STALL_TYPES.map((type) => [type.name, type.section]));

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

type ViewMode = "dashboard" | "table" | "invoice";

interface UnpaidDuesProps {
  invoices?: Invoice[];
}

// Mobile Invoice Card Component
const MobileInvoiceCard = ({ 
  invoice, 
  onSelect, 
  isSelected, 
  onView,
  isOverdue 
}: { 
  invoice: UnpaidStall;
  onSelect: () => void;
  isSelected: boolean;
  onView: () => void;
  isOverdue: (date: string) => boolean;
}) => (
  <div 
    className={`border rounded-lg p-4 transition-all active:scale-98 ${
      isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'
    }`}
  >
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${invoice.vendor_name}`}
        className="mt-1 h-6 w-6 accent-primary flex-shrink-0 cursor-pointer"
      />
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm truncate">{invoice.vendor_name}</h3>
          <Badge 
            variant={isOverdue(invoice.due_date) ? "destructive" : "secondary"} 
            className="flex-shrink-0 text-xs"
          >
            {isOverdue(invoice.due_date) ? "Overdue" : "Due"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-2 truncate">{invoice.stall_name}</p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            Due: {format(new Date(invoice.due_date), 'MMM dd, yyyy')}
          </span>
          <span className="text-lg font-bold text-destructive">
            ₱{invoice.amount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  </div>
);

// Breadcrumb Navigation Component
const Breadcrumbs = ({ 
  viewMode, 
  typeFilter, 
  selectedMonthLabel,
  onNavigate 
}: { 
  viewMode: ViewMode;
  typeFilter: string;
  selectedMonthLabel: string | null;
  onNavigate: (view: ViewMode) => void;
}) => (
  <nav className="flex items-center gap-2 text-sm mb-3" aria-label="Breadcrumb">
    <button 
      onClick={() => onNavigate("dashboard")}
      className={`${
        viewMode === "dashboard" 
          ? "text-foreground font-medium" 
          : "text-muted-foreground hover:text-foreground"
      } transition-colors`}
    >
      Dashboard
    </button>
    {viewMode === "table" && (
      <>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">
          {typeFilter !== "all" ? typeFilter : selectedMonthLabel || "All"} Dues
        </span>
      </>
    )}
    {viewMode === "invoice" && (
      <>
        <span className="text-muted-foreground">/</span>
        <button
          onClick={() => onNavigate("table")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Dues List
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">Invoice Details</span>
      </>
    )}
  </nav>
);

export const UnpaidDues = ({ invoices: externalInvoices }: UnpaidDuesProps) => {
  const { toast } = useToast();
  const [localInvoices, setLocalInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<UnpaidStall | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [collectorName, setCollectorName] = useState("Unknown Collector");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isMobile, setIsMobile] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const invoices = useMemo(() => {
    if (externalInvoices) {
      return externalInvoices.filter((inv) => ["unpaid", "overdue"].includes(inv.status));
    }
    return localInvoices;
  }, [externalInvoices, localInvoices]);

  const fetchUnpaid = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, vendor_id, vendor_name, stall_name, amount, due_date, status, stall_type")
      .in("status", ["unpaid", "overdue"])
      .order("due_date", { ascending: true });

    if (error) {
      toast({
        title: "Error loading dues",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLocalInvoices(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!externalInvoices) {
      fetchUnpaid();
    } else {
      setLoading(false);
    }
  }, [externalInvoices]);

  useEffect(() => {
    const fetchCollector = async () => {
      const { data } = await supabase.auth.getUser();
      const meta = data.user?.user_metadata;
      const resolved =
        meta?.full_name ||
        meta?.name ||
        data.user?.email?.split("@")[0] ||
        "Unknown Collector";
      setCollectorName(resolved);
    };

    fetchCollector();
  }, []);

  const markAsPaid = async (id: number) => {
    if (!selectedInvoice) return;
    setMarking(selectedInvoice.id);

    const { data: vendorData } = await supabase
      .from("vendors")
      .select("contact, rental_type")
      .eq("id", selectedInvoice.vendor_id)
      .single();

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        collector_name: collectorName,
      })
      .eq("id", id);
  
    if (error) {
      toast({
        title: "Error updating invoice",
        description: error.message,
        variant: "destructive",
      });
    } else {
      if (vendorData && selectedInvoice.due_date) {
        const dueDate = new Date(selectedInvoice.due_date);
        const nextDue = new Date(dueDate);
        
        if (vendorData.rental_type === 'daily') {
          nextDue.setDate(nextDue.getDate() + 1);
        } else {
          nextDue.setMonth(nextDue.getMonth() + 1);
        }

        await supabase.from('vendors').update({
          last_payment: new Date().toISOString().split('T')[0],
          next_due: nextDue.toISOString().split('T')[0],
          status: 'current'
        }).eq('id', selectedInvoice.vendor_id);
      }

      toast({
        title: "Payment Recorded",
        description: "The invoice has been marked as paid.",
      });

      if (!externalInvoices) {
        setLocalInvoices((prevInvoices) => prevInvoices.filter((invoice) => invoice.id !== id));
      }
      setSelectedInvoice(null);
      setViewMode("table");
    }
    setMarking(null);
  };  

  const handleBulkPay = async () => {
    const selectedIndices = Object.keys(rowSelection).map(Number);
    const selectedInvoices = selectedIndices.map(idx => visibleInvoices[idx]).filter(Boolean);

    if (selectedInvoices.length === 0) return;

    const confirm = window.confirm(`Are you sure you want to mark ${selectedInvoices.length} invoice${selectedInvoices.length > 1 ? 's' : ''} as PAID?`);
    if (!confirm) return;

    setMarking(-1);

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        collector_name: collectorName,
      })
      .in("id", selectedInvoices.map(inv => inv.id));

    if (error) {
      toast({ title: "Bulk Update Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "Bulk Payment Recorded", 
        description: `${selectedInvoices.length} invoice${selectedInvoices.length > 1 ? 's' : ''} marked as paid.` 
      });
      
      if (!externalInvoices) {
        setLocalInvoices(prev => prev.filter(inv => !selectedInvoices.find(s => s.id === inv.id)));
      }
      setRowSelection({});
    }
    setMarking(null);
  };

  useEffect(() => {
    setRowSelection({});
  }, [searchTerm, sectionFilter, typeFilter, selectedMonthKey]);

  const summary = useMemo(() => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return {
      count: invoices.length,
      totalAmount: totalAmount,
    };
  }, [invoices]);

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && !new Date(dueDate).toDateString().includes(new Date().toDateString());
  }

  const resolveStallMeta = (invoice: Invoice) => {
    const rawType = invoice.stall_type?.trim() ?? "";
    const inferredType =
      rawType ||
      invoice.stall_name?.split(" - ")[0]?.trim() ||
      invoice.stall_name?.split("-")[0]?.trim() ||
      "";

    const normalizedType = inferredType || "Unspecified";
    const mappedSection = sectionMap.get(normalizedType);

    const fallbackSection = (() => {
      const lower = normalizedType.toLowerCase();
      if (
        lower.includes("wet") ||
        lower.includes("fish") ||
        lower.includes("meat") ||
        lower.includes("veg")
      ) {
        return "Wet Section";
      }
      if (
        lower.includes("dry") ||
        lower.includes("groc") ||
        lower.includes("upper")
      ) {
        return "Dry Section";
      }
      return "Uncategorized";
    })();

    return {
      sectionTag: mappedSection ?? fallbackSection,
      typeTag: normalizedType,
    };
  };

  const invoicesWithMeta = useMemo<UnpaidStall[]>(
    () =>
      invoices.map((inv) => {
        const meta = resolveStallMeta(inv);
        return {
          ...inv,
          ...meta,
        };
      }),
    [invoices]
  );

  const availableStallTypes = useMemo(() => {
    let types: string[];
    if (sectionFilter === "all") {
      types = STALL_TYPES.map((t) => t.name);
    } else {
      types = STALL_TYPES.filter((t) => t.section === sectionFilter).map(
        (t) => t.name
      );
    }
    return [...new Set(types)].sort();
  }, [sectionFilter]);

  useEffect(() => {
    setTypeFilter("all");
    if (viewMode === "table") {
      setViewMode("dashboard");
    }
  }, [sectionFilter]);

  const baseFilteredInvoices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return invoicesWithMeta.filter((inv) => {
      const matchesSection =
        sectionFilter === "all" || inv.sectionTag === sectionFilter;
      const matchesType = typeFilter === "all" || inv.typeTag === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          inv.vendor_name,
          inv.stall_name,
          inv.sectionTag,
          inv.typeTag,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch));

      return matchesSection && matchesType && matchesSearch;
    });
  }, [invoicesWithMeta, searchTerm, sectionFilter, typeFilter]);

  const monthSummaries = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        key: string;
        label: string;
        count: number;
        total: number;
        monthStart: number;
      }
    >();

    baseFilteredInvoices.forEach((inv) => {
      const dueDate = new Date(inv.due_date);
      if (Number.isNaN(dueDate.getTime())) return;

      const monthStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
      const key = getMonthKey(monthStart);

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          label: format(monthStart, "MMMM yyyy"),
          count: 0,
          total: 0,
          monthStart: monthStart.getTime(),
        });
      }

      const entry = monthMap.get(key)!;
      entry.count += 1;
      entry.total += inv.amount;
    });

    return Array.from(monthMap.values()).sort(
      (a, b) => b.monthStart - a.monthStart
    );
  }, [baseFilteredInvoices]);

  useEffect(() => {
    if (
      selectedMonthKey &&
      !monthSummaries.some((summary) => summary.key === selectedMonthKey)
    ) {
      setSelectedMonthKey(null);
    }
  }, [selectedMonthKey, monthSummaries]);

  const visibleInvoices = useMemo(() => {
    if (!selectedMonthKey) return baseFilteredInvoices;

    return baseFilteredInvoices.filter((inv) => {
      const dueDate = new Date(inv.due_date);
      if (Number.isNaN(dueDate.getTime())) return false;
      return getMonthKey(dueDate) === selectedMonthKey;
    });
  }, [baseFilteredInvoices, selectedMonthKey]);

  useEffect(() => {
    if (
      selectedInvoice &&
      !visibleInvoices.some((inv) => inv.id === selectedInvoice.id)
    ) {
      setSelectedInvoice(null);
    }
  }, [selectedInvoice, visibleInvoices]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonthKey) return null;
    const match = monthSummaries.find(
      (summary) => summary.key === selectedMonthKey
    );
    return match?.label ?? null;
  }, [selectedMonthKey, monthSummaries]);

  const handleSectionSelect = (value: "all" | "Dry Section" | "Wet Section") => {
    setSectionFilter(value);
    setSearchTerm("");
    setTypeFilter("all");
  };

  const handleMonthClick = (key: string) => {
    setSelectedMonthKey(key);
    setViewMode("table");
  };

  const handleTypeClick = (type: string) => {
    setTypeFilter((prev) => {
      const newType = prev === type ? "all" : type;
      if (!selectedMonthKey) {
        setViewMode(newType === "all" ? "dashboard" : "table");
      }
      return newType;
    });
  };

  const handleViewInvoice = (invoice: UnpaidStall) => {
    setSelectedInvoice(invoice);
    setViewMode("invoice");
  };

  const handleNavigate = (view: ViewMode) => {
    if (view === "dashboard") {
      setSearchTerm("");
      setSelectedMonthKey(null);
      setSelectedInvoice(null);
    }
    setViewMode(view);
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setSectionFilter("all");
    setSelectedMonthKey(null);
  };

  const desktopColumns = createDesktopColumns(handleViewInvoice);
  const mobileColumns = createMobileColumns(handleViewInvoice, isOverdue);

  if (loading && !externalInvoices) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="ml-2 text-muted-foreground">Loading unpaid dues...</p>
      </div>
    );
  }

  // Invoice Detail View
  if (viewMode === "invoice" && selectedInvoice) {
    return (
      <div className="space-y-3 md:space-y-6">
        <Breadcrumbs 
          viewMode={viewMode}
          typeFilter={typeFilter}
          selectedMonthLabel={selectedMonthLabel}
          onNavigate={handleNavigate}
        />
        <div className="flex items-start gap-2 md:gap-4">
          <Button
            variant="outline"
            size="icon"
            className="mt-1 flex-shrink-0 min-h-[44px] min-w-[44px]"
            onClick={() => {
              setSelectedInvoice(null);
              setViewMode("table");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold">Invoice Details</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Review and confirm payment for {selectedInvoice.vendor_name}.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
              Unpaid Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><strong>Vendor:</strong> {selectedInvoice.vendor_name}</p>
            <p><strong>Stall:</strong> {selectedInvoice.stall_name}</p>
            <p><strong>Amount Due:</strong> <span className="font-bold text-destructive">₱{selectedInvoice.amount.toLocaleString()}</span></p>
            <p className={isOverdue(selectedInvoice.due_date) ? 'text-destructive font-semibold' : ''}><strong>Due Date:</strong> {format(new Date(selectedInvoice.due_date), 'MMMM dd, yyyy')}</p>
            {selectedInvoice.collector_name && (
              <p>
                <strong>Last collected by:</strong> {selectedInvoice.collector_name}
              </p>
            )}
          </CardContent>
          <DialogFooter className="px-4 md:px-6 pb-4 md:pb-6">
            <Button
              className="w-full min-h-[44px] text-sm md:text-base"
              disabled={marking === selectedInvoice?.id}
              onClick={() => selectedInvoice && markAsPaid(selectedInvoice.id)}
            >
              {marking === selectedInvoice?.id ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
              ) : (
                <><CheckCircle className="mr-2 h-4 w-4" />Mark as Paid</>
              )}
            </Button>
          </DialogFooter>
        </Card>
      </div>
    );
  }

  // Table View
  if (viewMode === "table") {
    return (
      <div className="space-y-4 md:space-y-6">
        <Breadcrumbs 
          viewMode={viewMode}
          typeFilter={typeFilter}
          selectedMonthLabel={selectedMonthLabel}
          onNavigate={handleNavigate}
        />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => {
                setViewMode("dashboard");
                setSearchTerm("");
                setSelectedMonthKey(null);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold truncate">
                {typeFilter !== "all" ? typeFilter : selectedMonthLabel || "All"} Dues
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground truncate">
                {selectedMonthLabel
                  ? `Showing dues for ${selectedMonthLabel}`
                  : typeFilter !== "all" 
                  ? "Showing all unpaid dues for this stall type."
                  : "Showing all unpaid dues."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor or stall..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm min-h-[44px]"
              />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2 min-h-[44px] px-3">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {typeFilter !== "all" && (
                    <Badge variant="secondary" className="ml-1 px-1 h-5">
                      {typeFilter}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filter by Stall Type</SheetTitle>
                  <SheetDescription>
                    Select a stall type to filter unpaid dues.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => {
                      setTypeFilter("all");
                      if (!selectedMonthKey) setViewMode("dashboard");
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all min-h-[50px] flex items-center justify-between ${
                      typeFilter === "all" 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-muted border border-border"
                    }`}
                  >
                    <span className="font-medium">All Types</span>
                    <Badge variant={typeFilter === "all" ? "secondary" : "outline"} className="ml-2">
                      {baseFilteredInvoices.length}
                    </Badge>
                  </button>
                  
                  <div className="pt-2 border-t">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 px-1">
                      STALL TYPES
                    </p>
                    {availableStallTypes.map((type) => {
                      const count = baseFilteredInvoices.filter(inv => inv.typeTag === type).length;
                      const isActive = typeFilter === type;
                      
                      return (
                        <button
                          key={type}
                          onClick={() => handleTypeClick(type)}
                          disabled={count === 0}
                          className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all min-h-[50px] flex items-center justify-between mb-1 ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm" 
                              : count === 0
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-muted border border-border"
                          }`}
                        >
                          <span className={isActive ? "font-medium" : ""}>{type}</span>
                          <Badge 
                            variant={isActive ? "secondary" : "outline"} 
                            className={`ml-2 ${count === 0 ? 'opacity-50' : ''}`}
                          >
                            {count}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {Object.keys(rowSelection).length > 0 && (
          <div className="bg-primary/10 border border-primary/20 p-3 md:p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-primary">
              {Object.keys(rowSelection).length} invoice{Object.keys(rowSelection).length > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setRowSelection({})}
                className="flex-1 sm:flex-none min-h-[44px]"
              >
                Unselect All
              </Button>
              <Button 
                size="sm" 
                onClick={handleBulkPay} 
                disabled={marking === -1}
                className="flex-1 sm:flex-none min-h-[44px]"
              >
                {marking === -1 ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Pay Selected
              </Button>
            </div>
          </div>
        )}

        {isMobile ? (
          <div className="space-y-3">
            {visibleInvoices.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Unpaid Dues Found</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {searchTerm || typeFilter !== "all" || selectedMonthKey
                      ? "Try adjusting your filters to see more results."
                      : "Great! All dues have been paid."}
                  </p>
                  {(searchTerm || typeFilter !== "all" || selectedMonthKey) && (
                    <Button 
                      variant="outline" 
                      className="mt-4 min-h-[44px]"
                      onClick={clearAllFilters}
                    >
                      Clear All Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              visibleInvoices.map((invoice, index) => (
                <MobileInvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  isSelected={rowSelection[index] || false}
                  onSelect={() => {
                    setRowSelection(prev => ({
                      ...prev,
                      [index]: !prev[index]
                    }));
                  }}
                  onView={() => handleViewInvoice(invoice)}
                  isOverdue={isOverdue}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {visibleInvoices.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Unpaid Dues Found</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {searchTerm || typeFilter !== "all" || selectedMonthKey
                      ? "Try adjusting your filters to see more results."
                      : "Great! All dues have been paid."}
                  </p>
                  {(searchTerm || typeFilter !== "all" || selectedMonthKey) && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={clearAllFilters}
                    >
                      Clear All Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <DataTable 
                columns={desktopColumns} 
                data={visibleInvoices} 
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                onRowClick={(row) => handleViewInvoice(row)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  // Dashboard View
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-3 md:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">Unpaid Dues</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Review and manage outstanding payments.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={fetchUnpaid} 
              disabled={loading || !!externalInvoices}
              className="whitespace-nowrap text-xs md:text-sm min-h-[44px]"
            >
              <RefreshCw className={`mr-2 h-3 w-3 md:h-4 md:w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 md:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Total Unpaid Dues</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{summary.count}</div>
              <p className="text-xs text-muted-foreground">invoice{summary.count !== 1 ? 's' : ''} require attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Total Amount Due</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold text-destructive">₱{summary.totalAmount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">outstanding balance</p>
            </CardContent>
          </Card>
        </div>

        {monthSummaries.length > 0 && (
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base md:text-lg">Overdue Months</CardTitle>
                <CardDescription className="text-xs md:text-sm mt-1">
                  Select a month to focus on stalls with unpaid dues during that period.
                </CardDescription>
              </div>
              {selectedMonthKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs md:text-sm w-full sm:w-auto min-h-[44px]"
                  onClick={() => setSelectedMonthKey(null)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear month filter
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-2 xs:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {monthSummaries.map((summary) => {
                const isActive = summary.key === selectedMonthKey;

                return (
                  <button
                    key={summary.key}
                    type="button"
                    onClick={() => handleMonthClick(summary.key)}
                    className={`flex items-center justify-between rounded-lg border p-3 md:p-4 text-left transition-all min-h-[70px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-sm active:scale-98 ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "hover:bg-muted/40"
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${
                          isActive ? "bg-primary" : "bg-primary/10"
                        }`}
                      >
                        <CalendarDays
                          className={`h-5 w-5 ${
                            isActive
                              ? "text-primary-foreground"
                              : "text-primary"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs md:text-sm truncate">{summary.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {summary.count}{" "}
                          {summary.count === 1 ? "stall" : "stalls"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs md:text-sm font-semibold text-destructive flex-shrink-0 ml-2">
                      ₱{summary.total.toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base font-semibold">Choose Section</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {[
                { label: "All", value: "all" },
                { label: "Dry", value: "Dry Section" },
                { label: "Wet", value: "Wet Section" },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  className="h-10 md:h-9 px-4 md:px-4 text-xs md:text-sm rounded-full whitespace-nowrap min-w-[80px]"
                  variant={sectionFilter === opt.value ? "default" : "outline"}
                  onClick={() => handleSectionSelect(opt.value as "all" | "Dry Section" | "Wet Section")}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {invoices.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">All Caught Up!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                There are no unpaid dues at the moment. Great work!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};