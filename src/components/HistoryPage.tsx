import { useMemo, useState } from "react";
import { columns, type Collection } from "./columns";
import { DataTable } from "./data-table";
import { type Invoice } from "./UnpaidDues";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ArrowLeft, DollarSign } from "lucide-react";
import { format } from "date-fns";

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${S tring(date.getMonth() + 1).padStart(2, "0")}`;

interface HistoryPageProps {
  invoices: Invoice[];
}

export const HistoryPage = ({ invoices }: HistoryPageProps) => {
  const [viewMode, setViewMode] = useState<"dashboard" | "table">("dashboard");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const collectionsData = useMemo(() => {
    const paidInvoices = invoices.filter(
      (inv) => inv.status === "paid" && inv.paid_at
    );
    const sortedInvoices = paidInvoices.sort(
      (a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime()
    );
    return sortedInvoices.map(
      (inv): Collection => {
        const paidDate = new Date(inv.paid_at!);
        return {
          id: `TX-${inv.id}`,
          vendor: inv.vendor_name,
          stallName: inv.stall_name,
          amount: inv.amount, // Keep as number for calculations
          date: paidDate.toLocaleDateString(),
          time: paidDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          paid_at: inv.paid_at, // Add the paid_at field here
        };
      }
    );
  }, [invoices]);

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

    collectionsData.forEach((inv) => {
      const paidDate = new Date(inv.paid_at!);
      if (Number.isNaN(paidDate.getTime())) return;

      const monthStart = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1);
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
      entry.total += Number(inv.amount) || 0;
    });

    return Array.from(monthMap.values()).sort(
      (a, b) => b.monthStart - a.monthStart
    );
  }, [collectionsData]);

  const visibleCollections = useMemo(() => {
    if (!selectedMonthKey) return collectionsData;

    return collectionsData.filter((inv) => {
      const paidDate = new Date(inv.paid_at!);
      if (Number.isNaN(paidDate.getTime())) return false;
      return getMonthKey(paidDate) === selectedMonthKey;
    });
  }, [collectionsData, selectedMonthKey]);

  const handleMonthClick = (key: string) => {
    setSelectedMonthKey(key);
    setViewMode("table");
  };

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonthKey) return "All Collections";
    return monthSummaries.find((s) => s.key === selectedMonthKey)?.label ?? "Collections";
  }, [selectedMonthKey, monthSummaries]);

  if (viewMode === "table") {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setViewMode("dashboard");
              setSelectedMonthKey(null);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{selectedMonthLabel}</h1>
            <p className="text-muted-foreground">
              A detailed record of all payments for this period.
            </p>
          </div>
        </div>
        <DataTable columns={columns} data={visibleCollections} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Collections History</h1>
        <p className="text-muted-foreground">
          Review past payments grouped by month.
        </p>
      </div>

      {monthSummaries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Collection Periods</CardTitle>
            <CardDescription>
              Select a month to view its detailed transaction history.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {monthSummaries.map((summary) => (
              <button
                key={summary.key}
                type="button"
                onClick={() => handleMonthClick(summary.key)}
                className="flex items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <CalendarDays className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{summary.label}</p>
                    <p className="text-xs text-muted-foreground">{summary.count} transactions</p>
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-success">
                  PHP {summary.total.toLocaleString()}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No collection history found.</CardContent></Card>
      )}
    </div>
  );
};