import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export const Reports = () => {
  // Mock data for reports
  const monthlyData = [
    { month: "Jan 2024", collections: 45280, stalls: 156, occupancy: 98.7 },
    { month: "Dec 2023", collections: 42150, stalls: 154, occupancy: 97.4 },
    { month: "Nov 2023", collections: 44820, stalls: 155, occupancy: 98.1 },
  ];

  const paymentTypes = [
    { type: "Monthly Rent", amount: 35640, percentage: 78.8 },
    { type: "Daily Fees", amount: 6240, percentage: 13.8 },
    { type: "Penalties", amount: 2100, percentage: 4.6 },
    { type: "Deposits", amount: 1300, percentage: 2.8 },
  ];

  const topPerformers = [
    { collector: "Juan Collector", collections: 156, amount: 23450 },
    { collector: "Maria Collector", collections: 142, amount: 21890 },
    { collector: "Pedro Assistant", collections: 98, amount: 14240 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">View market performance and financial reports</p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="january">
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="january">January 2024</SelectItem>
              <SelectItem value="december">December 2023</SelectItem>
              <SelectItem value="november">November 2023</SelectItem>
            </SelectContent>
          </Select>
          <Button>
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
            <div className="text-2xl font-bold text-success">₱45,280</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              +7.4% from last month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">94.2%</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              +2.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">98.7%</div>
            <div className="flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" />
              +1.3% from last month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Payment</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱581</div>
            <div className="flex items-center gap-1 text-xs text-destructive">
              <TrendingDown className="h-3 w-3" />
              -3.2% from last month
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
            <div className="space-y-4">
              {monthlyData.map((data, index) => (
                <div key={data.month} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{data.month}</div>
                    <div className="text-sm text-muted-foreground">
                      {data.stalls} stalls • {data.occupancy}% occupancy
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-success">₱{data.collections.toLocaleString()}</div>
                    {index === 0 && (
                      <Badge variant="outline" className="text-xs">Current</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              {paymentTypes.map((type) => (
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
              ))}
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
            <div className="space-y-4">
              {topPerformers.map((performer, index) => (
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
                <div className="text-2xl font-bold text-success">89.7%</div>
                <div className="text-sm text-muted-foreground">Current Payments</div>
                <div className="text-xs text-success mt-1">140 stalls</div>
              </div>
              <div className="text-center p-4 bg-warning/10 rounded-lg">
                <div className="text-2xl font-bold text-warning">5.8%</div>
                <div className="text-sm text-muted-foreground">Due Soon</div>
                <div className="text-xs text-warning mt-1">9 stalls</div>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <div className="text-2xl font-bold text-destructive">3.2%</div>
                <div className="text-sm text-muted-foreground">Overdue</div>
                <div className="text-xs text-destructive mt-1">5 stalls</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">1.3%</div>
                <div className="text-sm text-muted-foreground">Vacant</div>
                <div className="text-xs text-muted-foreground mt-1">2 stalls</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};