import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Receipt,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
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
      value: "₱12,450",
      change: "+5.2%",
      icon: DollarSign,
      color: "success",
    },
    {
      title: "Total Stalls",
      value: "156",
      change: "2 vacant",
      icon: Building2,
      color: "primary",
    },
    {
      title: "Active Vendors",
      value: "154",
      change: "98.7%",
      icon: Users,
      color: "accent",
    },
    {
      title: "Pending Payments",
      value: "8",
      change: "Due today",
      icon: AlertCircle,
      color: "warning",
    },
  ];

  const recentPayments = [
    { id: "001", vendor: "Maria Santos", stall: "A-15", amount: "₱500", time: "9:30 AM" },
    { id: "001A", vendor: "Cristian Daron", stall: "F-09", amount: "₱550", time: "9:20 AM" },
    { id: "002", vendor: "Juan Dela Cruz", stall: "B-08", amount: "₱750", time: "9:15 AM" },
  ];

  return (
    <div className="space-y-6">
      {/* App-like Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>CD</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Good morning</p>
            <h1 className="text-xl font-semibold">Kenneth Caducoy 👋</h1>
          </div>
        </div>
        <Button variant="outline" onClick={() => onPageChange("collect")}> 
          <Receipt className="mr-2 h-4 w-4" /> Collect
        </Button>
      </div>

      {/* Gradient Balance Card */}
      <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-indigo-500 via-indigo-400 to-purple-500 shadow-lg">
        <div className="text-sm/5 opacity-90">Total Collections</div>
        <div className="text-4xl font-bold mt-1">₱12,450</div>
        <div className="text-xs opacity-90 mt-1">Period: Sep 2025</div>
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
            <button onClick={() => onPageChange("collect")} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-muted transition">
              <Plus className="h-5 w-5" />
              <span className="text-xs">Collect</span>
            </button>
            <button onClick={() => onPageChange("history")} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-muted transition">
              <Send className="h-5 w-5" />
              <span className="text-xs">History</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-muted transition">
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs">Scheduled</span>
            </button>
            <button onClick={() => onPageChange("reports")} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-muted transition">
              <PieChart className="h-5 w-5" />
              <span className="text-xs">Insights</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transactions + Market Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Transactions
              <Button variant="ghost" size="sm" onClick={() => onPageChange("history")}>See All</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-muted/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
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
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-xl">
                <div className="text-xl font-bold text-success">98.7%</div>
                <div className="text-xs text-muted-foreground">Occupancy</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-xl">
                <div className="text-xl font-bold text-primary">₱45,280</div>
                <div className="text-xs text-muted-foreground">Monthly</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-xl">
                <div className="text-xl font-bold text-warning">5</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};