import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Download, Receipt, Eye } from "lucide-react";
import { type StallRecord } from "@/data/stalls";

type PaymentRecord = {
  id: string;
  date: string;
  time: string;
  stallId: string;
  stallName: string;
  vendor: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  collector: string;
};

interface PaymentHistoryProps {
  stalls: StallRecord[];
}

const PAYMENT_TIMES = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "01:00 PM",
  "02:30 PM"
];

const COLLECTOR_POOL = ["Juan Collector", "Maria Collector", "Alex Rivera"];

const buildDisplayNameMap = (stalls: StallRecord[]): Map<string, string> => {
  const counters = new Map<string, number>();
  const names = new Map<string, string>();

  stalls.forEach((stall) => {
    const typeKey = stall.type.trim().toLowerCase() || "uncategorised";
    const nextNumber = (counters.get(typeKey) ?? 0) + 1;
    counters.set(typeKey, nextNumber);
    names.set(stall.id, `Stall ${nextNumber}`);
  });

  return names;
};

const formatDate = (date: Date): string => date.toISOString().split("T")[0];

const buildPaymentRecords = (stalls: StallRecord[], displayNameById: Map<string, string>): PaymentRecord[] => {
  const activeStalls = stalls.filter((stall) => stall.occupied || stall.status !== "vacant");

  if (activeStalls.length === 0) {
    return [];
  }

  return activeStalls.map((stall, index) => {
    const paymentStatus = stall.status === "overdue" || stall.status === "due" ? "pending" : "completed";
    const paymentDate = new Date();
    paymentDate.setDate(paymentDate.getDate() - index);
    const stallDisplayName = displayNameById.get(stall.id) ?? stall.name;

    return {
      id: `DPM-${(123400 + index).toString().padStart(6, "0")}`,
      date: formatDate(paymentDate),
      time: PAYMENT_TIMES[index % PAYMENT_TIMES.length],
      stallId: stall.id,
      stallName: stallDisplayName,
      vendor: stall.vendor || "No vendor assigned",
      amount: stall.monthlyRent,
      type: stall.type || "General",
      method: paymentStatus === "completed" ? "Cash" : "Pending",
      status: paymentStatus,
      collector: COLLECTOR_POOL[index % COLLECTOR_POOL.length]
    };
  });
};

export const PaymentHistory = ({ stalls }: PaymentHistoryProps) => {
  const [viewedPayment, setViewedPayment] = useState<PaymentRecord | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const payments = useMemo(() => buildPaymentRecords(stalls, displayNameById), [stalls, displayNameById]);

  const paymentTypes = useMemo(
    () => Array.from(new Set(payments.map((payment) => payment.type))).sort((a, b) => a.localeCompare(b)),
    [payments]
  );

  useEffect(() => {
    if (filterType !== "all" && !paymentTypes.includes(filterType)) {
      setFilterType("all");
    }
  }, [filterType, paymentTypes]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch.length === 0 ||
        payment.stallName.toLowerCase().includes(normalizedSearch) ||
        payment.stallId.toLowerCase().includes(normalizedSearch) ||
        payment.vendor.toLowerCase().includes(normalizedSearch) ||
        payment.id.toLowerCase().includes(normalizedSearch);

      const matchesFilter = filterType === "all" || payment.type === filterType;

      return matchesSearch && matchesFilter;
    });
  }, [payments, searchTerm, filterType]);

  const totalAmount = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const openPaymentDetails = (payment: PaymentRecord) => {
    setViewedPayment(payment);
    setIsViewOpen(true);
  };

  const closePaymentDetails = () => {
    setIsViewOpen(false);
    setViewedPayment(null);
  };

  const stallDirectory = useMemo(
    () =>
      stalls.map((stall) => {
        const displayName = displayNameById.get(stall.id) ?? stall.name;
        return {
          id: stall.id,
          name: displayName,
          vendor: stall.vendor || "No vendor assigned",
          status: stall.status,
          type: stall.type,
          monthlyRent: stall.monthlyRent
        };
      }),
    [stalls, displayNameById]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment History</h1>
        <p className="text-muted-foreground">View and manage all payment records powered by the latest stall data.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by stall, vendor, or receipt number..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {paymentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">PHP {totalAmount.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{filteredPayments.length}</div>
              <div className="text-sm text-muted-foreground">Total Payments</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">
                PHP {Math.round(totalAmount / filteredPayments.length || 0)}
              </div>
              <div className="text-sm text-muted-foreground">Average Amount</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>Automatically generated from current stall assignments.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{payment.vendor}</div>
                    <div className="text-sm text-muted-foreground">
                      {payment.stallName} - {payment.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {payment.date} at {payment.time}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-medium text-success">PHP {payment.amount.toLocaleString()}</div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {payment.type}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openPaymentDetails(payment)}
                    aria-label="View payment details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {filteredPayments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No payments found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Stall Directory</CardTitle>
          <CardDescription>Everyone sees the latest stall information from Stall Management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stallDirectory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stalls available.</p>
          ) : (
            stallDirectory.map((stall) => (
              <div
                key={stall.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div>
                  <p className="font-medium">{stall.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stall.vendor} - PHP {stall.monthlyRent.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={stall.status === "vacant" ? "outline" : "default"} className="capitalize">
                    {stall.status}
                  </Badge>
                  {stall.type ? (
                    <Badge variant="secondary" className="capitalize">
                      {stall.type}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewOpen} onOpenChange={(open) => (open ? setIsViewOpen(true) : closePaymentDetails())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment receipt</DialogTitle>
            {viewedPayment ? (
              <DialogDescription>Receipt #{viewedPayment.id}</DialogDescription>
            ) : (
              <DialogDescription>Review payment details.</DialogDescription>
            )}
          </DialogHeader>

          {viewedPayment && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Vendor</p>
                  <p className="font-medium">{viewedPayment.vendor}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stall</p>
                  <p className="font-medium">{viewedPayment.stallName} ({viewedPayment.stallId})</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collected on</p>
                  <p className="font-medium">{viewedPayment.date} at {viewedPayment.time}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collector</p>
                  <p className="font-medium">{viewedPayment.collector}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="text-lg font-semibold text-success">PHP {viewedPayment.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment type</p>
                  <Badge variant="outline" className="w-fit capitalize">{viewedPayment.type}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Method</p>
                  <p className="font-medium">{viewedPayment.method}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={viewedPayment.status === "completed" ? "default" : "secondary"} className="capitalize w-fit">
                    {viewedPayment.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={closePaymentDetails}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
