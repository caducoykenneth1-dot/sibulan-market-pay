import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Download, Receipt, Eye } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { type Invoice } from "./UnpaidDues";
import { type StallRecord } from "@/data/stalls";

interface PaymentHistoryProps {
  stalls: StallRecord[];
  invoices: Invoice[];
}

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

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const payments = useMemo(() => 
    invoices.filter(inv => inv.status === 'paid' && inv.paid_at)
            .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime()), 
  [invoices]);

  const typeOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.payment_type || 'Monthly Rent'))).sort((a, b) => a.localeCompare(b)),
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
        payment.stall_name.toLowerCase().includes(normalizedSearch) ||
        payment.vendor_name.toLowerCase().includes(normalizedSearch) ||
        String(payment.id).toLowerCase().includes(normalizedSearch);

      const matchesType = filterType === "all" || (payment.payment_type || 'Monthly Rent') === filterType;

      return matchesSearch && matchesType;
    });
  }, [payments, searchTerm, filterType]);

  const totalAmount = useMemo(() => filteredPayments.reduce((sum, p) => sum + p.amount, 0), [filteredPayments]);

  const handleViewDetails = (payment: Invoice) => {
    setSelectedPayment(payment);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedPayment(null);
  };

  const handleExport = async () => {
    if (filteredPayments.length === 0) {
      return;
    }

    const reportElement = document.createElement("div");
    reportElement.style.position = "absolute";
    reportElement.style.left = "-9999px";
    reportElement.style.width = "210mm"; // A4 width
    reportElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #000;">
        <h1 style="font-size: 24px; text-align: center; margin-bottom: 20px;">Payment History Report</h1>
        <p style="font-size: 12px; margin-bottom: 20px;">Generated on: ${new Date().toLocaleString()}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Receipt ID</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Paid At</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Vendor</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Stall</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Amount</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Collector</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayments
              .map(
                (p) => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">DPM-${String(p.id).padStart(6, "0")}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${new Date(p.paid_at!).toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${p.vendor_name}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${p.stall_name}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${p.amount.toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${p.collector_name || "N/A"}</td>
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
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const ratio = canvasWidth / canvasHeight;
    const imgWidth = pdfWidth - 20; // with margin
    const imgHeight = imgWidth / ratio;

    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`payment-history-${new Date().toISOString().split("T")[0]}.pdf`);
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
              <Button variant="outline" onClick={handleExport}>
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
                    <div className="font-medium">{payment.vendor_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {payment.stall_name} - DPM-{String(payment.id).padStart(6, "0")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(payment.paid_at!).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-medium text-success">PHP {payment.amount.toLocaleString()}</div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {payment.payment_type?.replace(/-/g, ' ') || 'Monthly Rent'}
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : handleCloseDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment receipt</DialogTitle>
            {selectedPayment ? ( 
              <DialogDescription>Receipt #DPM-{String(selectedPayment.id).padStart(6, "0")}</DialogDescription>
            ) : (
              <DialogDescription>Review payment details.</DialogDescription>
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
                  <p className="font-medium">{selectedPayment.collector_name || "N/A"}</p>
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
                    {selectedPayment.payment_type?.replace(/-/g, ' ') || 'Monthly Rent'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{selectedPayment.notes || "None"}</p>
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
