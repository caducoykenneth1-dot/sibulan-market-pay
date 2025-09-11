import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Receipt, 
  DollarSign, 
  Building2, 
  Users, 
  TrendingUp,
  Calendar,
  AlertCircle
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
      color: "success"
    },
    {
      title: "Total Stalls",
      value: "156",
      change: "2 vacant",
      icon: Building2,
      color: "primary"
    },
    {
      title: "Active Vendors",
      value: "154",
      change: "98.7%",
      icon: Users,
      color: "accent"
    },
    {
      title: "Pending Payments",
      value: "8",
      change: "Due today",
      icon: AlertCircle,
      color: "warning"
    }
  ];

  const recentPayments = [
    { id: "001", vendor: "Maria Santos", stall: "A-15", amount: "₱500", time: "9:30 AM" },
    { id: "002", vendor: "Juan Dela Cruz", stall: "B-08", amount: "₱750", time: "9:15 AM" },
    { id: "003", vendor: "Ana Reyes", stall: "C-22", amount: "₱600", time: "8:45 AM" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your market overview.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onPageChange('collect')}>
            <Receipt className="mr-2 h-4 w-4" />
            Collect Payment
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Payments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Payments
              <Button variant="ghost" size="sm" onClick={() => onPageChange('history')}>
                View All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
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
                    <p className="text-sm text-muted-foreground">{payment.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              className="w-full justify-start" 
              variant="outline"
              onClick={() => onPageChange('collect')}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Collect Payment
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline"
              onClick={() => onPageChange('stalls')}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Manage Stalls
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline"
              onClick={() => onPageChange('reports')}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              View Reports
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline"
            >
              <Calendar className="mr-2 h-4 w-4" />
              Schedule Reminder
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Market Status */}
      <Card>
        <CardHeader>
          <CardTitle>Market Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">98.7%</div>
              <div className="text-sm text-muted-foreground">Occupancy Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">₱45,280</div>
              <div className="text-sm text-muted-foreground">Monthly Collections</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">5</div>
              <div className="text-sm text-muted-foreground">Overdue Payments</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};