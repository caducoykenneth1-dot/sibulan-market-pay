import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Receipt,
  DollarSign,
  Building2,
  Users,
  AlertCircle,
  Plus,
  Home,
  History,
  PieChart
} from "lucide-react";
import { type StallRecord } from "@/data/stalls";
import { type Invoice } from "./UnpaidDues";

interface DashboardProps {
  onPageChange: (page: string) => void;
  stalls: StallRecord[];
  unpaidInvoices: Invoice[];
  userRole: string; // ✅ Added userRole prop
}

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

export const Dashboard = ({ onPageChange, stalls, userRole, unpaidInvoices }: DashboardProps) => {
  const summary = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    // ✅ Correctly filter for paid invoices from today from the full list of invoices.
    const todaysPaidInvoices = unpaidInvoices.filter(inv => inv.status === 'paid' && inv.paid_at?.startsWith(today)); 
    const totalCollectedToday = todaysPaidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    let occupiedCount = 0;
    let vacantCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    // This calculation is for the main balance card, representing potential monthly income.
    // The "Today's Collections" card will use the more accurate `totalCollectedToday`.
    const totalPotentialRent = stalls.reduce((sum, s) => s.occupied ? sum + s.monthlyRent : sum, 0);

    // Get a set of vendor IDs with unpaid invoices for the "Pending Payments" count.
    const unpaidOnlyInvoices = unpaidInvoices.filter(inv => inv.status === 'unpaid');
    const unpaidVendorIds = new Set(unpaidOnlyInvoices.map(inv => inv.vendor_id));

    stalls.forEach((stall) => {
      const rent = Number.isFinite(stall.monthlyRent) ? stall.monthlyRent : 0;

      if (stall.occupied) {
        occupiedCount += 1;
      } else {
        vacantCount += 1;
      }

      // A stall has a pending payment if its status is 'due' or 'overdue',
      // OR if it has an associated unpaid invoice.
      if (stall.status === "overdue") {
        overdueCount += 1;
      }

      if (stall.status === "due" || stall.status === "overdue" || unpaidVendorIds.has(stall.dbId)) {
        pendingCount++;
      }
    });
    return { totalCollectedToday, totalPotentialRent, occupiedCount, vacantCount, pendingCount, overdueCount };}, [stalls, unpaidInvoices]); 

  const { totalCollectedToday, totalPotentialRent, occupiedCount, vacantCount, pendingCount, overdueCount } = summary;
  const totalStalls = stalls.length;

  const formattedTotalPotentialRent = useMemo(() => `PHP ${totalPotentialRent.toLocaleString()}`, [totalPotentialRent]);
  const occupancyRate = totalStalls === 0 ? 0 : Math.round((occupiedCount / totalStalls) * 100);

  const stats: Array<{ title: string; value: string; change: string; icon: any; className?: string }> = [
    {
      title: "Today's Collections",
      value: `PHP ${totalCollectedToday.toLocaleString()}`,
      change: "From paid invoices today",
      icon: DollarSign
    },
    {
      title: "Total Stalls",
      value: String(totalStalls),
      change: `${vacantCount} vacant`,
      icon: Building2
    },
    {
      title: "Active Vendors",
      value: String(occupiedCount),
      change: "Active assignments",
      icon: Users
    },
    {
      title: "Pending Payments",
      value: String(pendingCount),
      change: "Needs follow-up",
      icon: AlertCircle,
      className: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800 text-red-600 dark:text-red-400"
    }
  ];

  stats.splice(2, 0, {
    title: "Vacant Stalls",
    value: String(vacantCount),
    change: `${Math.round((vacantCount / totalStalls) * 100) || 0}% of total`,
    icon: Home,
    className: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
  });

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const recentPayments = useMemo(() => {
    // ✅ Use the full list of invoices to find the most recent PAID transactions.
    return unpaidInvoices
      .filter(inv => inv.status === 'paid' && inv.paid_at)
      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
      .slice(0, 4)
      .map((inv) => ({
        id: `TX-${inv.id}`,
        vendor: inv.vendor_name,
        stallName: inv.stall_name,
        amount: `PHP ${inv.amount.toLocaleString()}`,
        time: new Date(inv.paid_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
  }, [unpaidInvoices]);

  const marketStatus = [
    {
      label: "Occupancy",
      value: `${occupancyRate}%`,
      description: "Stalls currently filled",
      icon: Building2
    },
    {
      label: "Monthly Collections",
      value: formattedTotalPotentialRent,
      description: "Collected from active stalls",
      icon: DollarSign
    },
    {
      label: "Overdue Payments",
      value: `${overdueCount} stalls`,
      description: "Stalls needing attention",
      icon: AlertCircle
    },
    {
      label: "Active Vendors",
      value: String(occupiedCount),
      description: "Registered vendors",
      icon: Users
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>SM</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-xl font-semibold">Sibulan Market Team</h1>
          </div>
        </div>
        <Button variant="outline" onClick={() => onPageChange("collect")}>
          <Receipt className="mr-2 h-4 w-4" /> Collect
        </Button>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-400 to-purple-500 p-5 text-white shadow-lg">
        <div className="text-sm/5 opacity-90">Potential Monthly Rent</div>
        <div className="mt-1 text-4xl font-bold">{formattedTotalPotentialRent}</div>
        <div className="mt-1 text-xs opacity-90">Active stalls: {occupiedCount}</div>
      </div>

      {/* Shortcuts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {/* Collect - collector only */}
            {userRole?.toLowerCase() === "collector" && (
              <button
                onClick={() => onPageChange("collect")}
                className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs">Collect</span>
              </button>
            )}

            <button
              onClick={() => onPageChange("history")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <History className="h-5 w-5" />
              <span className="text-xs">History</span>
            </button>

            {/* Insights - admin only */}
            {userRole?.toLowerCase() === "admin" && (
              <button
                onClick={() => onPageChange("reports")}
                className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
              >
                <PieChart className="h-5 w-5" />
                <span className="text-xs">Insights</span>
              </button>
            )}

            {/* Add New Stall - admin only */}
            {userRole?.toLowerCase() === "admin" && (
              <button
                onClick={() => onPageChange("stalls")}
                className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
              >
                <Building2 className="h-5 w-5" />
                <span className="text-xs">Add New Stall</span>
              </button>
            )}

            {/* Always visible */}
            <button
              onClick={() => onPageChange("unpaid")}
              className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 p-3 text-destructive transition hover:bg-destructive/20"
            >
              <AlertCircle className="h-5 w-5" />
              <span className="text-xs">Unpaid</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className={`rounded-2xl ${stat.className || ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle> 
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transactions + Market Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Transactions
              <Button variant="ghost" size="sm" onClick={() => onPageChange("history")}>
                See All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent transactions available.</p>
              ) : (
                recentPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-xl border bg-card p-4 transition hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Receipt className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{payment.vendor}</p>
                        <p className="text-sm text-muted-foreground">{payment.stallName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-success">{payment.amount}</p>
                      <p className="text-xs text-muted-foreground">{payment.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Market Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border/60">
              {marketStatus.map((status) => {
                const Icon = status.icon;
                return (
                  <div key={status.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {status.label}
                      </p>
                      <p className="text-sm font-semibold text-foreground">{status.value}</p>
                      <p className="text-xs text-muted-foreground">{status.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
