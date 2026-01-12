import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, Download, Eye, CalendarDays } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  format,
} from "date-fns";
import { type Invoice } from "./UnpaidDues";
import { type StallRecord, STALL_TYPES } from "@/data/stalls";
import { DataTable } from "./data-table";
import { type ColumnDef } from "@tanstack/react-table";

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;

// 🟩 Props
interface PaymentHistoryProps {
  stalls: StallRecord[];
  invoices: Invoice[];
}

// 🟦 Helpers
const getStatusBadge = (status: Invoice["status"]) => {
  switch (status) {
    case "paid":
      return "default" as const;
    case "unpaid":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
};

// 🟦 Generate display names for stalls
const buildDisplayNameMap = (stalls: StallRecord[]): Map<string, string> => {
  const counters = new Map<string, number>();
  const names = new Map<string, string>();

  stalls.forEach((stall) => {
    const typeKey = stall.type?.trim().toLowerCase() || "uncategorised";
    const nextNumber = (counters.get(typeKey) ?? 0) + 1;
    counters.set(typeKey, nextNumber);
    names.set(stall.id, `Stall ${nextNumber}`);
  });

  return names;
};


export const PaymentHistory = ({ stalls, invoices }: PaymentHistoryProps) => {
  const [selectedPayment, setSelectedPayment] = useState<Invoice | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">("paid");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  // 🧾 Paid invoices only, sorted
  const payments = useMemo(
    () =>
      {
        const filtered = invoices.filter((inv) => {
          if (statusFilter === "paid") return inv.status === "paid" && inv.paid_at;
          if (statusFilter === "unpaid") return inv.status === "unpaid" || inv.status === "overdue";
          return true;
        });

        if (statusFilter === 'unpaid') {
          // For unpaid, sort by due_date ascending (oldest first)
          return filtered.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        }
  
        // Default sort for 'paid' and 'all' (most recent paid first)
        return filtered.sort((a, b) => {
          return (b.paid_at ? new Date(b.paid_at).getTime() : 0) - (a.paid_at ? new Date(a.paid_at).getTime() : 0);
        });
      },
    [invoices, statusFilter]
  );

  const sectionOptions = useMemo(() => {
    const sections = new Set<string>();    
    STALL_TYPES.forEach((t) => {
      if (t.section) sections.add(t.section);
    });
    return Array.from(sections).sort();
  }, []);

  useEffect(() => {
    if (filterType !== "all" && !sectionOptions.includes(filterType)) {
      setFilterType("all");
    }
  }, [filterType, sectionOptions]);

  const filteredBySearchAndType = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        payment.stall_name.toLowerCase().includes(normalizedSearch) ||
        payment.vendor_name.toLowerCase().includes(normalizedSearch) ||
        String(payment.id).toLowerCase().includes(normalizedSearch);

      const paymentSection = STALL_TYPES.find((t) => t.name === payment.stall_type)?.section;
      const matchesType =
        filterType === "all" || paymentSection === filterType;

      return matchesSearch && matchesType;
    });
  }, [payments, searchTerm, filterType]);

  const filteredPayments = useMemo(() => {
    if (!selectedMonthKey) return filteredBySearchAndType;

    return filteredBySearchAndType.filter(
      (payment) =>
        getMonthKey(new Date(payment.paid_at!)) === selectedMonthKey
    );
  }, [filteredBySearchAndType, selectedMonthKey]);

  const totalAmount = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + p.amount, 0),
    [filteredPayments]
  );

  const monthlySummaries = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        key: string;
        label: string;
        total: number;
        count: number;
        monthStart: number;
      }
    >();

    filteredBySearchAndType.forEach((payment) => {
      if (!payment.paid_at) return;

      const paidDate = new Date(payment.paid_at);
      if (Number.isNaN(paidDate.getTime())) return;

      const monthStartDate = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1);
      const key = getMonthKey(monthStartDate);

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          label: format(monthStartDate, "MMMM yyyy"),
          total: 0,
          count: 0,
          monthStart: monthStartDate.getTime(),
        });
      }

      const entry = monthMap.get(key)!;
      entry.total += payment.amount;
      entry.count += 1;
    });

    return Array.from(monthMap.values()).sort(
      (a, b) => b.monthStart - a.monthStart
    );
  }, [filteredBySearchAndType]);

  const tableDescription = useMemo(() => {
    if (selectedMonthKey) {
      const monthLabel = monthlySummaries.find(s => s.key === selectedMonthKey)?.label;
      return `Showing records for ${monthLabel || 'the selected month'}`;
    }
    switch (statusFilter) {
      case 'paid': return 'All paid payment records';
      case 'unpaid': return 'All unpaid records';
      default: return 'All payment records';
    }
  }, [selectedMonthKey, statusFilter, monthlySummaries]);

  useEffect(() => {
    if (
      selectedMonthKey &&
      !monthlySummaries.some((summary) => summary.key === selectedMonthKey)
    ) {
      setSelectedMonthKey(null);
    }
  }, [selectedMonthKey, monthlySummaries]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonthKey) return null;
    const match = monthlySummaries.find(
      (summary) => summary.key === selectedMonthKey
    );
    return match?.label ?? null;
  }, [selectedMonthKey, monthlySummaries]);

  const handleViewDetails = (payment: Invoice) => {
    setSelectedPayment(payment);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedPayment(null);
  };

  // 🧾 Define Columns for DataTable
  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Receipt",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            DPM-{String(row.original.id).padStart(6, "0")}
          </span>
        ),
      },
      {
        accessorKey: "paid_at",
        header: "Date",
        cell: ({ row }) => {
          if (!row.original.paid_at) return "-";
          return (
            <div className="flex flex-col">
              <span className="font-medium">
                {format(new Date(row.original.paid_at), "MMM d, yyyy")}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(row.original.paid_at), "h:mm a")}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "vendor_name",
        header: "Vendor",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.vendor_name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.stall_name}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <div className="font-medium text-success">
            PHP {row.original.amount.toLocaleString()}
          </div>
        ),
      },
      {
        accessorKey: "payment_type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize text-[10px] px-1 py-0 h-5">
            {row.original.payment_type?.replace(/-/g, " ") || "Monthly"}
          </Badge>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleViewDetails(row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    []
  );

  const unpaidCount = useMemo(() => {
    return invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'overdue').length;
  }, [invoices]);

  // 🧾 Export PDF
  const handleExport = async () => {
    if (filteredPayments.length === 0) return;

    const doc = new jsPDF();
    const isUnpaid = statusFilter === "unpaid";
    const title = isUnpaid ? "Unpaid Dues Report" : "Payment History Report";
    const monthText = selectedMonthLabel ? `Period: ${selectedMonthLabel}` : "Period: All Time";
    
    // Header
    doc.setFontSize(18);
    doc.text(title, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), "PPP p")}`, 14, 28);
    doc.text(monthText, 14, 33);
    if (filterType !== "all") {
      doc.text(`Section: ${filterType}`, 14, 38);
    }

    // Define Columns based on status
    const tableHead = isUnpaid 
      ? [["Invoice ID", "Vendor", "Stall", "Type", "Due Date", "Amount"]]
      : [["Receipt ID", "Vendor", "Stall", "Type", "Paid Date", "Collector", "Amount"]];

    // Map Data
    const tableBody = filteredPayments.map((p) => {
      const amount = `PHP ${p.amount.toLocaleString()}`;
      const type = p.payment_type || p.stall_type || "N/A";
      
      if (isUnpaid) {
        return [
          String(p.id),
          p.vendor_name,
          p.stall_name,
          type,
          p.due_date,
          amount
        ];
      } else {
        return [
          `DPM-${String(p.id).padStart(6, "0")}`,
          p.vendor_name,
          p.stall_name,
          type,
          p.paid_at ? format(new Date(p.paid_at), "MMM d, yyyy") : "-",
          p.collector_name || "N/A",
          amount
        ];
      }
    });

    // Generate Table
    autoTable(doc, {
      startY: 45,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: isUnpaid ? [220, 38, 38] : [22, 163, 74] }, // Red for unpaid, Green for paid
      styles: { fontSize: 8 },
    });

    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Payment History</h1>
        <p className="text-muted-foreground">
          View and manage all payment records powered by the latest stall data.
        </p>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Status Filter Buttons - Mobile Friendly */}
          <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
            <div className="flex gap-2 w-max md:w-auto">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
                className="whitespace-nowrap"
              >
                All ({invoices.length})
              </Button>
              <Button
                variant={statusFilter === "paid" ? "default" : "outline"}
                onClick={() => setStatusFilter("paid")}
                className="whitespace-nowrap bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
              >
                ✓ Paid ({invoices.filter(inv => inv.status === "paid").length})
              </Button>
              <Button
                variant={statusFilter === "unpaid" ? "default" : "outline"}
                onClick={() => setStatusFilter("unpaid")}
                className="whitespace-nowrap bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
              >
                ✗ Unpaid ({unpaidCount})
              </Button>
            </div>
          </div>

          {/* Search + Type Filter */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by stall, vendor, or receipt number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sectionOptions.map(
                    (section) =>
                      section && (
                        <SelectItem key={section} value={section}>
                          {section}
                        </SelectItem>
                      )
                  )}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-success">
              PHP {totalAmount.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Amount</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-primary">
              {filteredPayments.length}
            </div>
            <div className="text-sm text-muted-foreground">Total Payments</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-accent">
              PHP {Math.round(totalAmount / filteredPayments.length || 0)}
            </div>
            <div className="text-sm text-muted-foreground">
              Average Amount
            </div>
          </CardContent>
        </Card>
      </div>

      {monthlySummaries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Monthly Collections</CardTitle>
              <CardDescription>
                History of total payments grouped by month based on current
                filters.
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
          <CardContent className="space-y-3">
            {monthlySummaries.map((summary) => {
              const isActive = summary.key === selectedMonthKey;

              return (
                <button
                  key={summary.key}
                  type="button"
                  onClick={() =>
                    setSelectedMonthKey(isActive ? null : summary.key)
                  }
                  className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
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
                        {summary.count === 1 ? "payment" : "payments"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-semibold text-success">
                    PHP {summary.total.toLocaleString()}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Payment Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>
            {tableDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={filteredPayments} />
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) =>
          open ? setIsMenuOpen(true) : handleCloseDialog()
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            {selectedPayment ? (
              <DialogDescription>
                Receipt #DPM-{String(selectedPayment.id).padStart(6, "0")}
              </DialogDescription>
            ) : (
              <DialogDescription>Review payment details</DialogDescription>
            )}
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Vendor</p>
                  <p className="font-medium">{selectedPayment.vendor_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stall</p>
                  <p className="font-medium">{selectedPayment.stall_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collected on</p>
                  <p className="font-medium">
                    {new Date(selectedPayment.paid_at!).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collector</p>
                  <p className="font-medium">
                    {selectedPayment.collector_name || "N/A"}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="text-lg font-semibold text-success">
                    PHP {selectedPayment.amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment type</p>
                  <Badge variant="outline" className="w-fit capitalize">
                    {selectedPayment.payment_type?.replace(/-/g, " ") ||
                      "Monthly Rent"}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">
                    {selectedPayment.notes || "None"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge
                    variant={getStatusBadge(selectedPayment.status)}
                    className="capitalize w-fit"
                  >
                    {selectedPayment.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleCloseDialog}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
