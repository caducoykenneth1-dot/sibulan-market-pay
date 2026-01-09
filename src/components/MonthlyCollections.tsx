import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { type Invoice } from "./UnpaidDues";
import { type StallRecord } from "@/data/stalls";

interface MonthlyCollectionsProps {
  stalls: StallRecord[];
  invoices: Invoice[];
}

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;

export const MonthlyCollections = ({ stalls, invoices }: MonthlyCollectionsProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Get paid invoices only
  const payments = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === "paid" && inv.paid_at)
        .sort(
          (a, b) =>
            new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime()
        ),
    [invoices]
  );

  const stallTypeOptions = useMemo(() => {
    const types = new Set(payments.map((p) => p.stall_type).filter(Boolean));
    return Array.from(types).sort((a, b) => a!.localeCompare(b!));
  }, [payments]);

  // Filter by search and type
  const filteredPayments = useMemo(() => {
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

  // Group by month
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

    filteredPayments.forEach((payment) => {
      if (!payment.paid_at) return;

      const paidDate = new Date(payment.paid_at);
      if (Number.isNaN(paidDate.getTime())) return;

      const monthStartDate = new Date(
        paidDate.getFullYear(),
        paidDate.getMonth(),
        1
      );
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
  }, [filteredPayments]);

  const totalAllMonths = useMemo(
    () => monthlySummaries.reduce((sum, m) => sum + m.total, 0),
    [monthlySummaries]
  );

  // Export PDF
  const handleExport = async () => {
    if (monthlySummaries.length === 0) return;

    const reportElement = document.createElement("div");
    reportElement.style.position = "absolute";
    reportElement.style.left = "-9999px";
    reportElement.style.width = "210mm";
    reportElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #000;">
        <h1 style="font-size: 24px; text-align: center; margin-bottom: 10px;">Monthly Collections Report</h1>
        <p style="font-size: 12px; margin-bottom: 20px;">Generated on: ${new Date().toLocaleString()}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Month</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Transactions</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${monthlySummaries
              .map(
                (m) => `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 10px;">${m.label}</td>
                  <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${m.count}</td>
                  <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">₱${m.total.toLocaleString()}</td>
                </tr>
              `
              )
              .join("")}
            <tr style="background-color: #f9f9f9; font-weight: bold;">
              <td style="border: 1px solid #ddd; padding: 10px;">TOTAL</td>
              <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${monthlySummaries.reduce((sum, m) => sum + m.count, 0)}</td>
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">₱${totalAllMonths.toLocaleString()}</td>
            </tr>
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
    pdf.save(`monthly-collections-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Monthly Collections</h2>
        <p className="text-muted-foreground">
          History of total payments grouped by month based on current filters
        </p>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="pt-6">
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

      {/* Monthly Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Monthly Summary</span>
            <span className="text-sm font-normal text-muted-foreground">
              {monthlySummaries.length} months
            </span>
          </CardTitle>
          <CardDescription>
            Total collected: <span className="font-semibold text-foreground">₱{totalAllMonths.toLocaleString()}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlySummaries.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlySummaries.map((month) => (
                    <TableRow key={month.key} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{month.label}</TableCell>
                      <TableCell className="text-right">{month.count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ₱{month.total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ₱{(month.total / month.count).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">
                      {monthlySummaries.reduce((sum, m) => sum + m.count, 0)}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      ₱{totalAllMonths.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ₱{(
                        totalAllMonths /
                        monthlySummaries.reduce((sum, m) => sum + m.count, 0)
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No collections found with current filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


