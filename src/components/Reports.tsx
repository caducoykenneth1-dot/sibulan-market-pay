import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  DollarSign,
  Building2,
  Users,
  BarChart3,
  PieChart
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { type StallRecord } from "@/data/stalls";
import { type Invoice } from "./UnpaidDues";

interface ReportsProps {
  stalls: StallRecord[];
  invoices: Invoice[];
}

export const Reports = ({ stalls, invoices }: ReportsProps) => {
  const reportData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const paidInvoices = invoices.filter(inv => inv.status === "paid" && inv.paid_at);

    // --- Key Metrics ---
    const currentMonthPaidInvoices = paidInvoices.filter(inv => {
      const paidDate = new Date(inv.paid_at!);
      return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    });

    const totalCollections = currentMonthPaidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalStalls = stalls.length;
    const occupiedCount = stalls.filter(s => s.status !== 'vacant').length;
    const occupancyRate = totalStalls > 0 ? (occupiedCount / totalStalls) * 100 : 0;
    const averagePayment = currentMonthPaidInvoices.length > 0 ? totalCollections / currentMonthPaidInvoices.length : 0;

    const allCurrentMonthInvoices = invoices.filter(inv => {
      const dueDate = new Date(inv.due_date);
      return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
    });
    const collectionRate = allCurrentMonthInvoices.length > 0 ? (currentMonthPaidInvoices.length / allCurrentMonthInvoices.length) * 100 : 0;

    // --- Monthly Trends ---
    const monthlyTrends: Record<string, { collections: number; stalls: number }> = {};
    paidInvoices.forEach(inv => {
      const paidDate = new Date(inv.paid_at!);
      const monthKey = `${paidDate.toLocaleString('default', { month: 'short' })} ${paidDate.getFullYear()}`;
      if (!monthlyTrends[monthKey]) {
        monthlyTrends[monthKey] = { collections: 0, stalls: 0 };
      }
      monthlyTrends[monthKey].collections += inv.amount;
      monthlyTrends[monthKey].stalls += 1; // Count of payments
    });

    const allMonthlyData = Object.entries(monthlyTrends)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());

    // Data for UI display (limited to 3)
    const monthlyData = allMonthlyData.slice(0, 3);

    // --- Payment Types Breakdown ---
    const paymentTypeBreakdown: Record<string, number> = {};
    currentMonthPaidInvoices.forEach(inv => {
      const type = inv.payment_type || 'monthly-rent';
      if (!paymentTypeBreakdown[type]) {
        paymentTypeBreakdown[type] = 0;
      }
      paymentTypeBreakdown[type] += inv.amount;
    });

    const totalBreakdownAmount = Object.values(paymentTypeBreakdown).reduce((sum, amount) => sum + amount, 0);

    const paymentTypes = Object.entries(paymentTypeBreakdown).map(([type, amount]) => ({
      type: type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      amount,
      percentage: totalBreakdownAmount > 0 ? (amount / totalBreakdownAmount) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);

    // --- Top Performing Collectors (for the current month) ---
    const collectorPerformance: Record<string, { collections: number; amount: number }> = {};
    currentMonthPaidInvoices.forEach(inv => {
      const collector = inv.collector_name || "Unknown";
      if (!collectorPerformance[collector]) {
        collectorPerformance[collector] = { collections: 0, amount: 0 };
      }
      collectorPerformance[collector].collections += 1;
      collectorPerformance[collector].amount += inv.amount;
    });

    const topPerformers = Object.entries(collectorPerformance)
      .map(([collector, data]) => ({ collector, ...data }))
      .sort((a, b) => b.amount - a.amount);

    // --- Payment Status Overview ---
    const statusCounts = stalls.reduce((acc, stall) => {
      acc[stall.status] = (acc[stall.status] || 0) + 1;
      return acc;
    }, {} as Record<StallRecord['status'], number>);

    const paymentStatusOverview = {
      current: {
        count: statusCounts.current || 0,
        percentage: totalStalls > 0 ? ((statusCounts.current || 0) / totalStalls) * 100 : 0,
      },
      due: {
        count: statusCounts.due || 0,
        percentage: totalStalls > 0 ? ((statusCounts.due || 0) / totalStalls) * 100 : 0,
      },
      overdue: {
        count: statusCounts.overdue || 0,
        percentage: totalStalls > 0 ? ((statusCounts.overdue || 0) / totalStalls) * 100 : 0,
      },
      vacant: {
        count: statusCounts.vacant || 0,
        percentage: totalStalls > 0 ? ((statusCounts.vacant || 0) / totalStalls) * 100 : 0,
      },
    };

    return {
      totalCollections,
      collectionRate,
      occupancyRate,
      averagePayment,
      allMonthlyData, // Pass all data for export
      monthlyData,
      paymentTypes,
      paymentStatusOverview,
      topPerformers,
    };
  }, [stalls, invoices]);

  const { totalCollections, collectionRate, occupancyRate, averagePayment, allMonthlyData, monthlyData, paymentTypes, paymentStatusOverview, topPerformers } = reportData;

  const handleExport = () => {
    const headers = ["Month", "Total Collections (PHP)", "Number of Payments"];
    const rows = allMonthlyData.map(row => [
      `"${row.month}"`,
      row.collections,
      row.stalls
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `monthly-collections-report-${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">View market performance and financial reports</p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue={new Date().toLocaleString('default', { month: 'long' })}>
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={new Date().toLocaleString('default', { month: 'long' })}>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">₱{totalCollections.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              For the current month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{collectionRate.toFixed(1)}%</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              Of invoices due this month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{occupancyRate.toFixed(1)}%</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              Of all stalls are occupied
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Payment</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{averagePayment.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Average per paid invoice
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Collection Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...allMonthlyData].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(value: string) => value.substring(0, 3)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(value: number) => `₱${value / 1000}k`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={40}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{
                        background: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                      }}
                    />
                    <Bar dataKey="collections" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">No collection data available for past months.</p>}
          </CardContent>
        </Card>

        {/* Payment Types Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Payment Types Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentTypes.length > 0 ? paymentTypes.map((type) => (
                <div key={type.type} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{type.type}</span>
                    <span className="font-medium">₱{type.amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full" 
                      style={{ width: `${type.percentage}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {type.percentage}%
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-4">No payment data for this month.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers and Overdue Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Collectors */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Collectors</CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-4">
                {topPerformers.slice(0, 3).map((performer, index) => (
                  <div key={performer.collector} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">#{index + 1}</span>
                      </div>
                      <div>
                        <div className="font-medium">{performer.collector}</div>
                        <div className="text-sm text-muted-foreground">
                          {performer.collections} collections
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-success">₱{performer.amount.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No collector data available for the current month.</p>}
          </CardContent>
        </Card>

        {/* Payment Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <div className="text-2xl font-bold text-success">{paymentStatusOverview.current.percentage.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Current Payments</div>
                <div className="text-xs text-success mt-1">{paymentStatusOverview.current.count} stalls</div>
              </div>
              <div className="text-center p-4 bg-warning/10 rounded-lg">
                <div className="text-2xl font-bold text-warning">{paymentStatusOverview.due.percentage.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Due Soon</div>
                <div className="text-xs text-warning mt-1">{paymentStatusOverview.due.count} stalls</div>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <div className="text-2xl font-bold text-destructive">{paymentStatusOverview.overdue.percentage.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Overdue</div>
                <div className="text-xs text-destructive mt-1">{paymentStatusOverview.overdue.count} stalls</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{paymentStatusOverview.vacant.percentage.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground">Vacant</div>
                <div className="text-xs text-muted-foreground mt-1">{paymentStatusOverview.vacant.count} stalls</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};