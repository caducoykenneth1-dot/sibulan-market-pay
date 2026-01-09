import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DataTable } from "./data-table"; // Import the generic DataTable
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
  LayoutGrid,
  CalendarDays,
  ArrowLeft,
  MessageSquare,
  Eye,
} from "lucide-react";
import { STALL_TYPES } from "@/data/stalls";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { columns as createUnpaidDuesColumns } from "./unpaid-dues-columns"; // Import the new columns

export interface Invoice {
  id: number;
  vendor_id: number | string;
  vendor_name: string;
  stall_name: string;
  amount: number;
  due_date: string;
  status: "unpaid" | "paid";
  paid_at?: string | null;
  stall_type?: string | null;
  payment_type?: string | null;
  collector_name?: string | null;
  notes?: string | null;
}

export interface UnpaidStall extends Invoice {
  sectionTag: string;
  typeTag: string;
}

const sectionMap = new Map(STALL_TYPES.map((type) => [type.name, type.section]));

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

type ViewMode = "dashboard" | "table" | "invoice";

export const UnpaidDues = () => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<UnpaidStall | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [collectorName, setCollectorName] = useState("Unknown Collector");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");

  // 🧾 Fetch all unpaid invoices
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
      setInvoices(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnpaid();
  }, []);

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

  // ✅ Mark as Paid
  const markAsPaid = async (id: number) => {
    if (!selectedInvoice) return;
    setMarking(selectedInvoice.id);

    // --- Future SMS Feature: Fetch vendor contact number ---
    // We fetch this now so we can use it in the success message.
    const { data: vendorData } = await supabase
      .from("vendors")
      .select("contact")
      .eq("id", selectedInvoice.vendor_id)
      .single();

    const contactNumber = vendorData?.contact;
    // --- End of future feature data fetching ---


    // Update the invoice status to 'paid'
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
      toast({
        title: "Payment Recorded",
        description: "The invoice has been marked as paid.",
      });

      // Optimistically update the UI for a faster experience
      setInvoices((prevInvoices) => prevInvoices.filter((invoice) => invoice.id !== id));
      setSelectedInvoice(null);
      setViewMode("table"); // Go back to the table view after payment
    }
    setMarking(null);
  };  

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

  // Reset type filter when section changes
  useEffect(() => {
    setTypeFilter("all");
    // When section changes, if we are in the table view, go back to dashboard
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
    setFiltersVisible((prev) => !(prev && sectionFilter === value));
    setSectionFilter(value);
    // Reset other filters for a clean slate
    setSearchTerm("");
    setTypeFilter("all");
  };

  const handleMonthClick = (key: string) => {
    // Set the month filter and switch to the table view
    setSelectedMonthKey(key);
    setViewMode("table");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="ml-2 text-muted-foreground">Loading unpaid dues...</p>
      </div>
    );
  }

  // When a stall type is clicked, switch to table view
  const handleTypeClick = (type: string) => {
    setTypeFilter((prev) => {
      const newType = prev === type ? "all" : type;
      setViewMode(newType === "all" ? "dashboard" : "table");
      return newType;
    });
  };

  const handleViewInvoice = (invoice: UnpaidStall) => {
    setSelectedInvoice(invoice);
    setViewMode("invoice");
  };

  const unpaidDuesColumns = createUnpaidDuesColumns(handleViewInvoice);

  if (viewMode === "invoice" && selectedInvoice) {
    return (
      <div className="space-y-3 md:space-y-6">
        <div className="flex items-start gap-2 md:gap-4">
          <Button
            variant="outline"
            size="icon"
            className="mt-1 flex-shrink-0"
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
            <p className={isOverdue(selectedInvoice.due_date) ? 'text-destructive font-semibold' : ''}><strong>Due Date:</strong> {selectedInvoice.due_date}</p>
            {selectedInvoice.collector_name && (
              <p>
                <strong>Last collected by:</strong> {selectedInvoice.collector_name}
              </p>
            )}
          </CardContent>
          <DialogFooter className="px-4 md:px-6 pb-4 md:pb-6">
            <Button
              className="w-full text-sm md:text-base"
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

  if (viewMode === "table") {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setViewMode("dashboard");
                setSearchTerm(""); // Clear search on exit
                setSelectedMonthKey(null); // Clear month filter on exit
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold truncate">{typeFilter} Dues</h1>
              <p className="text-xs md:text-sm text-muted-foreground truncate">
                {selectedMonthLabel
                  ? `Showing dues for ${selectedMonthLabel}`
                  : "Showing all unpaid dues for this stall type."}
              </p>
            </div>
          </div>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by vendor or stall..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </div>
        <DataTable columns={unpaidDuesColumns} data={visibleInvoices} />
      </div>
    );
  }

  // Default to dashboard view
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-3 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Unpaid Dues</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Review and manage outstanding payments.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={fetchUnpaid} disabled={loading} className="whitespace-nowrap text-xs md:text-sm">
            <RefreshCw className={`mr-2 h-3 w-3 md:h-4 md:w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Total Unpaid Dues</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{summary.count}</div>
            <p className="text-xs text-muted-foreground">invoices require attention</p>
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
                className="text-xs md:text-sm w-full sm:w-auto"
                onClick={() => setSelectedMonthKey(null)}
              >
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
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-sm ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/40"
                  }`}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                        isActive ? "bg-primary" : "bg-primary/10"
                      }`}
                    >
                      <CalendarDays
                        className={`h-4 w-4 ${
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

      {/* Section Selection */}
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
                className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm rounded-full whitespace-nowrap"
                variant={sectionFilter === opt.value ? "default" : "outline"}
                onClick={() => handleSectionSelect(opt.value as "all" | "Dry Section" | "Wet Section")}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stall Type Buttons (conditionally rendered) */}
      {filtersVisible && availableStallTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base font-semibold">
              Filter by Stall Type
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto -mx-6 px-6">
            <div className="flex flex-wrap gap-2 md:gap-3 pb-2">
              {availableStallTypes.map((type) => (
                <Button
                  key={type}
                  size="sm"
                  className="text-xs md:text-sm h-8 md:h-9 px-2 md:px-3 whitespace-nowrap flex-shrink-0"
                  variant={typeFilter === type ? "default" : "outline"}
                  onClick={() => handleTypeClick(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Type Filters */}
      <Card>
        <CardContent className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 pt-4 md:pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by vendor or stall name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
};
