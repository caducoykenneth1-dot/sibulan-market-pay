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
import { Search, Filter, Download, Receipt, Eye, DollarSign, CalendarDays } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  format,
  parseISO,
  isToday,
  isYesterday,
  isThisWeek,
} from "date-fns";
import { type Invoice } from "./UnpaidDues";
import { type StallRecord } from "@/data/stalls";

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

// 🟦 Group by date
const groupPaymentsByDate = (payments: Invoice[]) => {
  const groups: Record<string, Invoice[]> = {};
  payments.forEach((p) => {
    const date = new Date(p.paid_at!);
    const key = format(date, "yyyy-MM-dd");
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  return groups;
};

// 🟦 Format date headers
const getDateLabel = (dateString: string) => {
  const date = parseISO(dateString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "MMMM d, yyyy — EEEE");
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
      invoices
        .filter((inv) => {
          if (statusFilter === "paid") return inv.status === "paid" && inv.paid_at;
          if (statusFilter === "unpaid") return inv.status === "unpaid";
          return true;
        })
        .sort(
          (a, b) => {
            const aTime = a.paid_at ? new Date(a.paid_at).getTime() : 0;
            const bTime = b.paid_at ? new Date(b.paid_at).getTime() : 0;
            return bTime - aTime;
          }
        ),
    [invoices, statusFilter]
  );

  const stallTypeOptions = useMemo(() => {
    const types = new Set(payments.map((p) => p.stall_type).filter(Boolean));
    return Array.from(types).sort((a, b) => a!.localeCompare(b!));
  }, [payments]);

  useEffect(() => {
    if (filterType !== "all" && !stallTypeOptions.includes(filterType)) {
      setFilterType("all");
    }
  }, [filterType, stallTypeOptions]);

  const filteredBySearchAndType = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        payment.stall_name.toLowerCase().includes(normalizedSearch) ||
        payment.vendor_name.toLowerCase().includes(normalizedSearch) ||
        String(payment.id).toLowerCase().includes(normalizedSearch);

      const matchesType =
        filterType === "all" || payment.stall_type === filterType;

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

  const groupedPayments = useMemo(
    () => groupPaymentsByDate(filteredPayments),
    [filteredPayments]
  );

  const sortedDates = Object.keys(groupedPayments).sort((a, b) =>
    a < b ? 1 : -1
  );

  const handleViewDetails = (payment: Invoice) => {
    setSelectedPayment(payment);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedPayment(null);
  };

  // 🧾 Export PDF
  const handleExport = async () => {
    if (filteredPayments.length === 0) return;

    const reportElement = document.createElement("div");
    reportElement.style.position = "absolute";
    reportElement.style.left = "-9999px";
    reportElement.style.width = "210mm";
    reportElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #000;">
        <h1 style="font-size: 24px; text-align: center; margin-bottom: 20px;">Payment History Report</h1>
        <p style="font-size: 12px; margin-bottom: 20px;">Generated on: ${new Date().toLocaleString()}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Receipt ID</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Paid At</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Vendor</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Stall</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Amount</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Collector</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayments
              .map(
                (p) => `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">DPM-${String(
                    p.id
                  ).padStart(6, "0")}</td>
                  <td style="border: 1px solid #ddd; padding: 8px;">${new Date(
                    p.paid_at!
                  ).toLocaleString()}</td>
                  <td style="border: 1px solid #ddd; padding: 8px;">${
                    p.vendor_name
                  }</td>
                  <td style="border: 1px solid #ddd; padding: 8px;">${
                    p.stall_name
                  }</td>
                  <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${p.amount.toLocaleString()}</td>
                  <td style="border: 1px solid #ddd; padding: 8px;">${
                    p.collector_name || "N/A"
                  }</td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    document.body.appendChild(reportElement);

    const canvas = await html2canvas(reportElement, { scale: 2 });
    document.body.removeChild(reportElement);

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const ratio = canvas.width / canvas.height;
    const imgWidth = pdfWidth - 20;
    const imgHeight = imgWidth / ratio;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`payment-history-${new Date().toISOString().split("T")[0]}.pdf`);
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
          {/* Status Filter Buttons */}
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              className="flex-1 sm:flex-none"
            >
              All ({invoices.length})
            </Button>
            <Button
              variant={statusFilter === "paid" ? "default" : "outline"}
              onClick={() => setStatusFilter("paid")}
              className="flex-1 sm:flex-none bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
            >
              ✓ Paid ({invoices.filter(inv => inv.status === "paid").length})
            </Button>
            <Button
              variant={statusFilter === "unpaid" ? "default" : "outline"}
              onClick={() => setStatusFilter("unpaid")}
              className="flex-1 sm:flex-none bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
            >
              ✗ Unpaid ({invoices.filter(inv => inv.status === "unpaid").length})
            </Button>
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
                  {stallTypeOptions.map(
                    (type) =>
                      type && (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
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

      {/* Grouped Records */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>
            {selectedMonthLabel
              ? `Showing payments for ${selectedMonthLabel}`
              : "Grouped by date of payment"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedDates.map((dateKey) => {
            const dayTotal = groupedPayments[dateKey].reduce(
              (sum, p) => sum + p.amount,
              0
            );
            return (
              <div key={dateKey} className="mb-8">
                <div className="flex items-center justify-between mb-3 border-b pb-1">
                  <h3 className="text-lg font-semibold text-muted-foreground">
                    {getDateLabel(dateKey)}
                  </h3>
                  <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                    <DollarSign className="h-4 w-4" />
                    <span>Total: PHP {dayTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {groupedPayments[dateKey].map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <Receipt className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {payment.vendor_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {payment.stall_name} - DPM-
                            {String(payment.id).padStart(6, "0")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(payment.paid_at!), "PPpp")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-medium text-success">
                            PHP {payment.amount.toLocaleString()}
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {payment.payment_type?.replace(/-/g, " ") ||
                              "Monthly Rent"}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(payment)}
                          aria-label="View payment details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredPayments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No payments found matching your criteria.
            </div>
          )}
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
