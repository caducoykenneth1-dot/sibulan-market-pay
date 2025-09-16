import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Eye,
  Building2,
  User,
  Phone,
  Calendar,
  DollarSign
} from "lucide-react";

export const StallManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Mock stall data
  const stalls = [
    {
      id: "A-15",
      vendor: "Xtian Daron",
      contact: "09123456789",
      type: "Vegetables",
      monthlyRent: 500,
      lastPayment: "2024-01-15",
      nextDue: "2024-02-15",
      status: "current",
      occupied: true
    },
    {
      id: "B-08",
      vendor: "Cristian Dev",
      contact: "09987654321",
      type: "Meat",
      monthlyRent: 750,
      lastPayment: "2024-01-10",
      nextDue: "2024-02-10",
      status: "due",
      occupied: true
    },
    {
      id: "C-22",
      vendor: "Ana Reyes",
      contact: "09555666777",
      type: "Fish",
      monthlyRent: 600,
      lastPayment: "2023-12-20",
      nextDue: "2024-01-20",
      status: "overdue",
      occupied: true
    },
    // Dummy stall for Cristian Daron
    {
      id: "F-09",
      vendor: "Cristian Daron",
      contact: "09112223333",
      type: "Fruits",
      monthlyRent: 550,
      lastPayment: "2024-01-25",
      nextDue: "2024-02-25",
      status: "current",
      occupied: true
    },
    {
      id: "D-01",
      vendor: "",
      contact: "",
      type: "General",
      monthlyRent: 400,
      lastPayment: "",
      nextDue: "",
      status: "vacant",
      occupied: false
    },
    {
      id: "E-12",
      vendor: "Rosa Silva",
      contact: "09444333222",
      type: "Dry Goods",
      monthlyRent: 450,
      lastPayment: "2024-01-18",
      nextDue: "2024-02-18",
      status: "current",
      occupied: true
    }
  ];

  const filteredStalls = stalls.filter(stall => {
    const matchesSearch = 
      stall.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stall.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stall.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = 
      filterStatus === "all" || 
      stall.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current': return 'default';
      case 'due': return 'secondary';
      case 'overdue': return 'destructive';
      case 'vacant': return 'outline';
      default: return 'outline';
    }
  };

  const statusCounts = {
    total: stalls.length,
    occupied: stalls.filter(s => s.occupied).length,
    vacant: stalls.filter(s => !s.occupied).length,
    overdue: stalls.filter(s => s.status === 'overdue').length
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Stall Management</h1>
          <p className="text-muted-foreground">Manage market stalls, vendors, and rental information</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add New Stall
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{statusCounts.total}</div>
              <div className="text-sm text-muted-foreground">Total Stalls</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{statusCounts.occupied}</div>
              <div className="text-sm text-muted-foreground">Occupied</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{statusCounts.vacant}</div>
              <div className="text-sm text-muted-foreground">Vacant</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{statusCounts.overdue}</div>
              <div className="text-sm text-muted-foreground">Overdue</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by stall ID, vendor name, or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="current">Current</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="vacant">Vacant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stalls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStalls.map((stall) => (
          <Card key={stall.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Stall {stall.id}
                </CardTitle>
                <Badge variant={getStatusColor(stall.status)}>
                  {stall.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {stall.occupied ? (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{stall.vendor}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{stall.contact}</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">Vacant Stall</div>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Type:</span>
                <span className="text-sm font-medium">{stall.type}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">₱{stall.monthlyRent}/month</span>
              </div>
              
              {stall.occupied && (
                <>
                  {stall.lastPayment && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Last paid: {stall.lastPayment}</span>
                    </div>
                  )}
                  
                  {stall.nextDue && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Next due: {stall.nextDue}</span>
                    </div>
                  )}
                </>
              )}
              
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredStalls.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <div className="text-lg font-medium mb-2">No stalls found</div>
            <div className="text-muted-foreground">Try adjusting your search or filter criteria.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};