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

interface DashboardProps {
  onPageChange: (page: string) => void;
}

export const Dashboard = ({ onPageChange }: DashboardProps) => {
  const stats = [
    {
      title: "Today's Collections",
      value: "PHP 12,450",
      change: "+5.2%",
      icon: DollarSign
    },
    {
      title: "Total Stalls",
      value: "156",
      change: "2 vacant",
      icon: Building2
    },
    {
      title: "Active Vendors",
      value: "154",
      change: "98.7%",
      icon: Users
    },
    {
      title: "Pending Payments",
      value: "8",
      change: "Due today",
      icon: AlertCircle
    }
  ];

  const recentPayments = [
    { id: "001", vendor: "Cristian Daron", stall: "A-15", amount: "PHP 500", time: "9:30 AM" },
    { id: "001A", vendor: "Xtian Dev", stall: "F-09", amount: "PHP 550", time: "9:20 AM" },
    { id: "002", vendor: "Juan Dela Cruz", stall: "B-08", amount: "PHP 750", time: "9:15 AM" }
  ];

  const marketStatus = [
    {
      label: "Occupancy",
      value: "98.7%",
      description: "Stalls currently filled",
      icon: Building2
    },
    {
      label: "Monthly Collections",
      value: "PHP 45,280",
      description: "Collected this month",
      icon: DollarSign
    },
    {
      label: "Overdue Payments",
      value: "5 stalls",
      description: "Stalls needing attention",
      icon: AlertCircle
    },
    {
      label: "Active Vendors",
      value: "154",
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
            <AvatarFallback>CD</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Good morning</p>
            <h1 className="text-xl font-semibold">Kenneth Caducoy</h1>
          </div>
        </div>
        <Button variant="outline" onClick={() => onPageChange("collect")}>
          <Receipt className="mr-2 h-4 w-4" /> Collect
        </Button>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-400 to-purple-500 p-5 text-white shadow-lg">
        <div className="text-sm/5 opacity-90">Total Collections</div>
        <div className="mt-1 text-4xl font-bold">PHP 12,450</div>
        <div className="mt-1 text-xs opacity-90">Period: Sep 2025</div>
      </div>

      {/* Shortcuts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            Shortcuts
            <Button variant="ghost" size="sm">Edit</Button>
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
              {recentPayments.map((payment) => (
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
                      <p className="text-sm text-muted-foreground">Stall {payment.stall}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-success">{payment.amount}</p>
                    <p className="text-xs text-muted-foreground">{payment.time}</p>
                  </div>
                </div>
              ))}
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

