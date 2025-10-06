import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Receipt,
  DollarSign,
  Building2,
  Users,
  Calendar,
  AlertCircle,
  Plus,
  Send,
  CalendarDays,
  PieChart
} from "lucide-react";
import { type StallRecord } from "@/data/stalls";

interface DashboardProps {
  onPageChange: (page: string) => void;
  stalls: StallRecord[];
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

export const Dashboard = ({ onPageChange, stalls }: DashboardProps) => {
  const summary = useMemo(() => {
    let totalCollected = 0;
    let occupiedCount = 0;
    let vacantCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    stalls.forEach((stall) => {
      const rent = Number.isFinite(stall.monthlyRent) ? stall.monthlyRent : 0;

      if (stall.occupied) {
        occupiedCount += 1;
        totalCollected += rent;
      } else {
        vacantCount += 1;
      }

      if (stall.status === "overdue") {
        overdueCount += 1;
        pendingCount += 1;
      } else if (stall.status === "due") {
        pendingCount += 1;
      }
    });

    return { totalCollected, occupiedCount, vacantCount, pendingCount, overdueCount };
  }, [stalls]);

  const { totalCollected, occupiedCount, vacantCount, pendingCount, overdueCount } = summary;
  const totalStalls = stalls.length;

  const formattedTotalCollected = useMemo(() => `PHP ${totalCollected.toLocaleString()}`, [totalCollected]);
  const occupancyRate = totalStalls === 0 ? 0 : Math.round((occupiedCount / totalStalls) * 100);

  const stats = [
    {
      title: "Today's Collections",
      value: formattedTotalCollected,
      change: `${occupiedCount} active stalls`,
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
      icon: AlertCircle
    }
  ];

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const recentPayments = useMemo(() => {
    if (stalls.length === 0) {
      return [] as Array<{ id: string; vendor: string; stallName: string; amount: string; time: string }>;
    }

    const referenceTimes = ["9:30 AM", "9:20 AM", "9:15 AM", "9:00 AM"];

    return stalls
      .filter((stall) => stall.occupied)
      .slice(0, 4)
      .map((stall, index) => ({
        id: `TX-${index + 1}`,
        vendor: stall.vendor || "No vendor assigned",
        stallName: displayNameById.get(stall.id) ?? stall.name,
        amount: `PHP ${stall.monthlyRent.toLocaleString()}`,
        time: referenceTimes[index % referenceTimes.length]
      }));
  }, [stalls, displayNameById]);

  const marketStatus = [
    {
      label: "Occupancy",
      value: `${occupancyRate}%`,
      description: "Stalls currently filled",
      icon: Building2
    },
    {
      label: "Monthly Collections",
      value: formattedTotalCollected,
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
        <div className="text-sm/5 opacity-90">Total Collections</div>
        <div className="mt-1 text-4xl font-bold">{formattedTotalCollected}</div>
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
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => onPageChange("collect")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">Collect</span>
            </button>
            <button
              onClick={() => onPageChange("history")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <Send className="h-5 w-5" />
              <span className="text-xs">History</span>
            </button>
            <button
              onClick={() => onPageChange("scheduled")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs">Scheduled</span>
            </button>
            <button
              onClick={() => onPageChange("reports")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <PieChart className="h-5 w-5" />
              <span className="text-xs">Insights</span>
            </button>
            <button
              onClick={() => onPageChange("stalls")}
              className="flex flex-col items-center gap-2 rounded-xl bg-secondary p-3 transition hover:bg-muted"
            >
              <Building2 className="h-5 w-5" />
              <span className="text-xs">Add Stall</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="rounded-2xl">
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
