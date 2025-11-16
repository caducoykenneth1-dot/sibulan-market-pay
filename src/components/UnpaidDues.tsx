import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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

interface UnpaidStall extends Invoice {
  sectionTag: string;
  typeTag: string;
}

const sectionMap = new Map(STALL_TYPES.map((type) => [type.name, type.section]));

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

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

  const stallTypeOptions = useMemo(() => {
    const scoped = invoicesWithMeta.filter(
      (inv) => sectionFilter === "all" || inv.sectionTag === sectionFilter
    );

    return Array.from(
      new Set(
        scoped
          .map((inv) => inv.typeTag)
          .filter((type) => type && type !== "Unspecified")
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [invoicesWithMeta, sectionFilter]);

  const hasUnspecifiedType = useMemo(
    () => invoicesWithMeta.some((inv) => inv.typeTag === "Unspecified"),
    [invoicesWithMeta]
  );

  // Reset type filter when section changes
  useEffect(() => {
    setTypeFilter("all");
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

  const filteredAndGroupedInvoices = useMemo(() => {
    return visibleInvoices.reduce((acc, stall) => {
      const section = stall.sectionTag;
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(stall);
      return acc;
    }, {} as Record<string, UnpaidStall[]>);
  }, [visibleInvoices]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="ml-2 text-muted-foreground">Loading unpaid dues...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Unpaid Dues</h1>
          <p className="text-muted-foreground">Review and manage outstanding payments.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUnpaid} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Unpaid Dues</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.count}</div>
            <p className="text-xs text-muted-foreground">invoices require attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount Due</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">₱{summary.totalAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">outstanding balance</p>
          </CardContent>
        </Card>
      </div>

      {monthSummaries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Overdue Months</CardTitle>
              <CardDescription>
                Select a month to focus on stalls with unpaid dues during that period.
              </CardDescription>
            </div>
            {selectedMonthKey && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMonthKey(null)}
              >
                Clear month filter
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {monthSummaries.map((summary) => {
              const isActive = summary.key === selectedMonthKey;

              return (
                <button
                  key={summary.key}
                  type="button"
                  onClick={() =>
                    setSelectedMonthKey(isActive ? null : summary.key)
                  }
                  className={`flex items-center justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/40"
                  }`}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
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
                    <div>
                      <p className="font-medium">{summary.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.count}{" "}
                        {summary.count === 1 ? "stall" : "stalls"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-destructive">
                    PHP {summary.total.toLocaleString()}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Search and Sort Controls */}
      <Card>
        <CardContent className="grid gap-4 md:grid-cols-3 pt-6">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by vendor or stall name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger>
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                <SelectItem value="Dry Section">Dry Section</SelectItem>
                <SelectItem value="Wet Section">Wet Section</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={setTypeFilter}
              disabled={stallTypeOptions.length === 0 && !hasUnspecifiedType}
            >
              <SelectTrigger>
                <LayoutGrid className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {hasUnspecifiedType && (
                  <SelectItem value="Unspecified">Unspecified</SelectItem>
                )}
                {stallTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unpaid Stalls</CardTitle>
          <CardDescription>
            {selectedMonthLabel
              ? `Showing stalls with dues in ${selectedMonthLabel}. Select a stall to view details and mark as paid.`
              : "Select a stall to view details and mark as paid."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(filteredAndGroupedInvoices).length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
              {searchTerm ? "No stalls match your search." : "All dues are paid. 🎉"}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(filteredAndGroupedInvoices).map(([section, stalls]) => (
                <div key={section}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">{section}</h3>
                  <div className="flex flex-wrap gap-2">
                    {stalls.map((stall) => (
                      <Button
                        key={stall.id}
                        variant={selectedInvoice?.id === stall.id ? "default" : "outline"}
                        onClick={() => setSelectedInvoice(stall)}
                        className="h-12 w-12 p-0 border-destructive/40 hover:bg-destructive/10"
                      >
                        <span className="font-bold text-xs leading-tight text-center">{stall.stall_name.split(' - ')[1] || stall.stall_name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Unpaid Invoice Details
            </DialogTitle>
            <DialogDescription>
              Review the outstanding payment for {selectedInvoice?.vendor_name}.
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 text-sm">
              <p><strong>Vendor:</strong> {selectedInvoice.vendor_name}</p>
              <p><strong>Stall:</strong> {selectedInvoice.stall_name}</p>
              <p><strong>Amount Due:</strong> <span className="font-bold text-destructive">₱{selectedInvoice.amount.toLocaleString()}</span></p>
              <p className={isOverdue(selectedInvoice.due_date) ? 'text-destructive font-semibold' : ''}><strong>Due Date:</strong> {selectedInvoice.due_date}</p>
              {selectedInvoice.collector_name && (
                <p>
                  <strong>Last collected by:</strong> {selectedInvoice.collector_name}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>Cancel</Button>
            <Button
              disabled={marking === selectedInvoice?.id}
              onClick={() => selectedInvoice && markAsPaid(selectedInvoice.id)}
            >
              {marking === selectedInvoice?.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Paid
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
};
