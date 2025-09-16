import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  Download, 
  Calendar,
  Receipt,
  Eye
} from "lucide-react";

export const PaymentHistory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Mock payment history data
  const payments = [
    {
      id: "DPM-001234",
      date: "2024-01-20",
      time: "9:30 AM",
      stallId: "A-15",
      vendor: "Maria Santos",
      amount: 500,
      type: "Monthly Rent",
      method: "Cash",
      status: "completed",
      collector: "Juan Collector"
    },
    // New dummy payment for Cristian Daron
    {
      id: "DPM-001233A",
      date: "2024-01-20",
      time: "9:20 AM",
      stallId: "F-09",
      vendor: "Cristian Daron",
      amount: 550,
      type: "Monthly Rent",
      method: "Cash",
      status: "completed",
      collector: "Juan Collector"
    },
    {
      id: "DPM-001233",
      date: "2024-01-20",
      time: "9:15 AM",
      stallId: "B-08",
      vendor: "Juan Dela Cruz",
      amount: 750,
      type: "Monthly Rent",
      method: "Cash",
      status: "completed",
      collector: "Juan Collector"
    },
    {
      id: "DPM-001232",
      date: "2024-01-19",
      time: "3:45 PM",
      stallId: "C-22",
      vendor: "Ana Reyes",
      amount: 600,
      type: "Monthly Rent",
      method: "Cash",
      status: "completed",
      collector: "Maria Collector"
    },
    {
      id: "DPM-001231",
      date: "2024-01-19",
      time: "2:30 PM",
      stallId: "D-05",
      vendor: "Pedro Garcia",
      amount: 100,
      type: "Penalty",
      method: "Cash",
      status: "completed",
      collector: "Maria Collector"
    },
    {
      id: "DPM-001230",
      date: "2024-01-18",
      time: "11:20 AM",
      stallId: "E-12",
      vendor: "Rosa Silva",
      amount: 450,
      type: "Daily Fee",
      method: "Cash",
      status: "completed",
      collector: "Juan Collector"
    }
  ];

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.stallId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = 
      filterType === "all" || 
      payment.type.toLowerCase().includes(filterType.toLowerCase());

    return matchesSearch && matchesFilter;
  });

  const totalAmount = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment History</h1>
        <p className="text-muted-foreground">View and manage all payment records</p>
      </div>

      {/* Filters and Search */}
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
                <SelectTrigger className="w-40">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="monthly">Monthly Rent</SelectItem>
                  <SelectItem value="daily">Daily Fee</SelectItem>
                  <SelectItem value="penalty">Penalty</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">₱{totalAmount.toLocaleString()}</div>
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
                ₱{Math.round(totalAmount / filteredPayments.length || 0)}
              </div>
              <div className="text-sm text-muted-foreground">Average Amount</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment List */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{payment.vendor}</div>
                    <div className="text-sm text-muted-foreground">
                      Stall {payment.stallId} • {payment.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {payment.date} at {payment.time}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-medium text-success">₱{payment.amount.toLocaleString()}</div>
                    <Badge variant="outline" className="text-xs">
                      {payment.type}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {filteredPayments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No payments found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};