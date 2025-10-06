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
  stallName: string;
  vendor: string;
  amount: number;
  type: string;
  method: string;
  status: "completed" | "pending";
  collector: string;
};

interface PaymentHistoryProps {
  stalls: StallRecord[];
}

const getStatusBadge = (status: PaymentRecord["status"]) =>
  status === "completed" ? "default" : "secondary";

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

const formatDate = (date: Date): string => date.toISOString().split("T")[0];

const COLLECTOR_POOL = ["Juan Collector", "Maria Collector", "Alex Rivera"];

const buildPaymentRecords = (stalls: StallRecord[], displayNameById: Map<string, string>): PaymentRecord[] => {
  const today = new Date();
  const timeSlots = ["09:30 AM", "10:15 AM", "11:00 AM", "01:30 PM", "02:15 PM"];

  return stalls
    .filter((stall) => stall.occupied || stall.status !== "vacant")
    .map((stall, index) => {
      const paymentDate = new Date(today);
      paymentDate.setDate(today.getDate() - (index % 10));
      const status: "completed" | "pending" = stall.status === "overdue" || stall.status === "due" ? "pending" : "completed";
      const stallDisplayName = displayNameById.get(stall.id) ?? stall.name;

      return {
        id: `DPM-${(123400 + index).toString().padStart(6, "0")}`,
        date: formatDate(paymentDate),
        time: timeSlots[index % timeSlots.length],
        stallName: stallDisplayName,
        vendor: stall.vendor || "No vendor assigned",
        amount: stall.monthlyRent,
        type: stall.type || "General",
        method: status === "completed" ? "Cash" : "Pending",
        status,
        collector: COLLECTOR_POOL[index % COLLECTOR_POOL.length]
      };
    });
};

export const PaymentHistory = ({ stalls }: PaymentHistoryProps) => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const payments = useMemo(() => buildPaymentRecords(stalls, displayNameById), [stalls, displayNameById]);

  const typeOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.type))).sort((a, b) => a.localeCompare(b)),
    [payments]
  );

  useEffect(() => {
    if (filterType !== "all" && !typeOptions.includes(filterType)) {
      setFilterType("all");
    }
  }, [filterType, typeOptions]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch.length === 0 ||
        payment.stallName.toLowerCase().includes(normalizedSearch) ||
        payment.vendor.toLowerCase().includes(normalizedSearch) ||
        payment.id.toLowerCase().includes(normalizedSearch);

      const matchesType = filterType === "all" || payment.type === filterType;

      return matchesSearch && matchesType;
    });
  }, [payments, searchTerm, filterType]);

  const totalAmount = useMemo(() => filteredPayments.reduce((sum, p) => sum + p.amount, 0), [filteredPayments]);

  const handleViewDetails = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedPayment(null);
  };

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
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                  {typeOptions.map((type) => (
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
                  <Button variant="ghost" size="sm" onClick={() => handleViewDetails(payment)} aria-label="View payment details">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {filteredPayments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No payments found matching your criteria.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Stall Directory</CardTitle>
          <CardDescription>Everyone sees the latest stall information from Stall Management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stalls available.</p>
          ) : (
            stalls.map((stall) => (
              <div
                key={stall.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div>
                  <p className="font-medium">{displayNameById.get(stall.id) ?? stall.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stall.vendor || "No vendor assigned"} - PHP {stall.monthlyRent.toLocaleString()}
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : handleCloseDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment receipt</DialogTitle>
            {selectedPayment ? (
              <DialogDescription>Receipt #{selectedPayment.id}</DialogDescription>
            ) : (
              <DialogDescription>Review payment details.</DialogDescription>
            )}
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Vendor</p>
                  <p className="font-medium">{selectedPayment.vendor}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stall</p>
                  <p className="font-medium">{selectedPayment.stallName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collected on</p>
                  <p className="font-medium">
                    {selectedPayment.date} at {selectedPayment.time}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collector</p>
                  <p className="font-medium">{selectedPayment.collector}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="text-lg font-semibold text-success">PHP {selectedPayment.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment type</p>
                  <Badge variant="outline" className="w-fit capitalize">
                    {selectedPayment.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Method</p>
                  <p className="font-medium">{selectedPayment.method}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={getStatusBadge(selectedPayment.status)} className="capitalize w-fit">
                    {selectedPayment.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={handleCloseDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
