import { useEffect, useMemo, useState, type TouchEvent } from "react";
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoveHorizontal,
} from "lucide-react";
import { STALL_TYPES } from "@/data/stalls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

interface GroupedStallData {
  stallId: string | number;
  stallName: string;
  vendorName: string;
  totalAmount: number;
  invoices: Invoice[];
  stallType: string;
  section: string;
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
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isMobile, setIsMobile] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const [activeTypeIndex, setActiveTypeIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [selectedStallForCalendar, setSelectedStallForCalendar] = useState<GroupedStallData | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());

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
    let invoiceToPay = selectedInvoice;

    if (!invoiceToPay || invoiceToPay.id !== id) {
       const sourceList = externalInvoices || localInvoices;
       invoiceToPay = sourceList.find(inv => inv.id === id) as UnpaidStall;
    }

    if (!invoiceToPay && selectedStallForCalendar) {
        invoiceToPay = selectedStallForCalendar.invoices.find(i => i.id === id) as UnpaidStall;
    }

    if (!invoiceToPay) return;
    setMarking(id);

    const { data: vendorData } = await supabase
      .from("vendors")
      .select("contact, rental_type")
      .eq("id", invoiceToPay.vendor_id)
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
      if (vendorData && invoiceToPay.due_date) {
        const dueDate = new Date(invoiceToPay.due_date);
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
        }).eq('id', invoiceToPay.vendor_id);
      }

      toast({
        title: "Payment Recorded",
        description: "The invoice has been marked as paid.",
      });

      if (!externalInvoices) {
        setLocalInvoices((prevInvoices) => prevInvoices.filter((invoice) => invoice.id !== id));
      }
      
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
        setViewMode("table");
      }

      if (selectedStallForCalendar) {
          setSelectedStallForCalendar(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  invoices: prev.invoices.filter(inv => inv.id !== id),
                  totalAmount: prev.totalAmount - invoiceToPay!.amount
              };
          });
      }
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
  }, [searchTerm, sectionFilter, typeFilter]);

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

  const handleSectionSelect = (value: "all" | "Dry Section" | "Wet Section") => {
    setSectionFilter(value);
    setSearchTerm("");
    setTypeFilter("all");
  };

  const handleMonthClick = (key: string) => {
    setViewMode("table");
  };

  const handleViewInvoice = (invoice: UnpaidStall) => {
    setSelectedInvoice(invoice);
    setViewMode("invoice");
  };

  const handleNavigate = (view: ViewMode) => {
    if (view === "dashboard") {
      setSearchTerm("");
      setSelectedInvoice(null);
    }
    setViewMode(view);
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setSectionFilter("all");
  };

  // Grouping Logic for Stalls
  const groupedStalls = useMemo(() => {
    const groups: Record<string, GroupedStallData> = {};
    
    baseFilteredInvoices.forEach(inv => {
      const key = `${inv.vendor_id}`;
      if (!groups[key]) {
        groups[key] = {
          stallId: inv.vendor_id,
          stallName: inv.stall_name,
          vendorName: inv.vendor_name,
          totalAmount: 0,
          invoices: [],
          stallType: inv.typeTag || "Uncategorized",
          section: inv.sectionTag || "Unknown"
        };
      }
      groups[key].totalAmount += inv.amount;
      groups[key].invoices.push(inv);
    });

    // Group by Stall Type
    const byType: Record<string, GroupedStallData[]> = {};
    Object.values(groups).forEach(stall => {
      const type = stall.stallType;
      if (!byType[type]) byType[type] = [];
      byType[type].push(stall);
    });

    // Sort stalls within each type by name
    Object.keys(byType).forEach(type => {
      byType[type].sort((a, b) => a.stallName.localeCompare(b.stallName, undefined, { numeric: true }));
    });

    return byType;
  }, [baseFilteredInvoices]);

  const sortedTypes = useMemo(() => Object.keys(groupedStalls).sort(), [groupedStalls]);

  useEffect(() => {
    setActiveTypeIndex(0);
  }, [sortedTypes.length, sectionFilter]);

  const handleTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      if (activeTypeIndex < sortedTypes.length - 1) {
        setActiveTypeIndex((prev) => prev + 1);
      }
    } else if (isRightSwipe) {
      if (activeTypeIndex > 0) {
        setActiveTypeIndex((prev) => prev - 1);
      }
    }
  };

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
          selectedMonthLabel={null}
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

  // Main View
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

        {/* STALL GROUPS VIEW */}
        {sortedTypes.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={activeTypeIndex === 0}
                onClick={() => setActiveTypeIndex((prev) => Math.max(0, prev - 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <div className="text-center">
                <h3 className="font-semibold text-lg text-primary/80 flex items-center justify-center gap-2">
                  {sortedTypes[activeTypeIndex]}
                  <Badge variant="secondary" className="text-xs font-normal">
                    {groupedStalls[sortedTypes[activeTypeIndex]]?.length || 0}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeTypeIndex + 1} of {sortedTypes.length} types
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                disabled={activeTypeIndex === sortedTypes.length - 1}
                onClick={() => setActiveTypeIndex((prev) => Math.min(sortedTypes.length - 1, prev + 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div 
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-right-4 duration-300 touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              key={sortedTypes[activeTypeIndex]}
            >
              {groupedStalls[sortedTypes[activeTypeIndex]]?.map((stall) => (
                <Card 
                  key={stall.stallId}
                  className="cursor-pointer hover:shadow-md transition-all active:scale-98 border-l-4 border-l-destructive"
                  onClick={() => setSelectedStallForCalendar(stall)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-base">{stall.stallName}</h3>
                        <p className="text-sm text-muted-foreground">{stall.vendorName}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {stall.invoices.length} Unpaid
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <div className="text-xs text-muted-foreground">
                        Total Due
                      </div>
                      <div className="text-xl font-bold text-destructive">
                        ₱{stall.totalAmount.toLocaleString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/70 mt-4 md:hidden">
              <MoveHorizontal className="h-3 w-3" /> Swipe to change stall type
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">All Caught Up!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {searchTerm || sectionFilter !== "all" 
                  ? "No unpaid dues match your filters." 
                  : "There are no unpaid dues at the moment. Great work!"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* CALENDAR DIALOG */}
      <Dialog open={!!selectedStallForCalendar} onOpenChange={(open) => !open && setSelectedStallForCalendar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedStallForCalendar?.stallName} - Unpaid Dates</DialogTitle>
            <DialogDescription>
              Vendor: {selectedStallForCalendar?.vendorName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() - 1)))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="font-semibold">
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() + 1)))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-medium text-muted-foreground">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasUnpaid = selectedStallForCalendar?.invoices.some(inv => inv.due_date === dateStr);
                
                return (
                  <div key={day} className={`aspect-square flex items-center justify-center rounded-md text-xs ${hasUnpaid ? 'bg-destructive text-destructive-foreground font-bold' : 'hover:bg-muted'}`}>
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {selectedStallForCalendar?.invoices.map(inv => (
              <div key={inv.id} className="flex justify-between items-center p-2 border rounded text-sm">
                <span>{format(new Date(inv.due_date), 'MMM dd, yyyy')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-destructive">₱{inv.amount.toLocaleString()}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => markAsPaid(inv.id)}>Pay</Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};