import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, RefreshCw, Users, DollarSign, Search, ArrowUp, ArrowDown } from "lucide-react";
import { useMemo } from "react";

export interface Invoice {
  id: number;
  vendor_id: number | string;
  vendor_name: string;
  stall_name: string;
  amount: number;
  due_date: string;
  status: "unpaid" | "paid";
  paid_at?: string | null;
  payment_type?: string | null;
  collector_name?: string | null;
  notes?: string | null;
}

type SortKey = 'due_date' | 'amount' | 'vendor_name';
type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const UnpaidDues = () => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'due_date', direction: 'asc' });

  const handleSortChange = (key: SortKey) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  // 🧾 Fetch all unpaid invoices
  const fetchUnpaid = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, vendor_id, vendor_name, stall_name, amount, due_date, status")
      .eq("status", "unpaid")
      .order("due_date", { ascending: true });

    if (error) {
      toast({
        title: "Error loading dues",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnpaid();
  }, []);

  // ✅ Mark as Paid
  const markAsPaid = async (id: number) => {
    setMarking(id);
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error updating invoice",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Payment Recorded",
        description: "The invoice has been marked as paid.",
      });
      // Optimistically update the UI for a faster experience
      setInvoices((prevInvoices) => prevInvoices.filter((invoice) => invoice.id !== id));
    }
    setMarking(null);
  };

  const summary = useMemo(() => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return {
      count: invoices.length,
      totalAmount: totalAmount,
    };
  }, [invoices]);

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && !new Date(dueDate).toDateString().includes(new Date().toDateString());
  }

  const processedInvoices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    let filtered = invoices;
    if (normalizedSearch) {
      filtered = invoices.filter((invoice) =>
        invoice.vendor_name.toLowerCase().includes(normalizedSearch)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      const { key, direction } = sortConfig;
      const valA = a[key];
      const valB = b[key];

      let comparison = 0;
      if (valA > valB) {
        comparison = 1;
      } else if (valA < valB) {
        comparison = -1;
      }

      return direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [invoices, searchTerm, sortConfig]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="ml-2 text-muted-foreground">Loading unpaid dues...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Unpaid Dues</h1>
          <p className="text-muted-foreground">Review and manage outstanding payments.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUnpaid} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Unpaid Dues</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.count}</div>
            <p className="text-xs text-muted-foreground">invoices require attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount Due</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">₱{summary.totalAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">outstanding balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Sort Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Filter & Sort</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by vendor name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
            {(['due_date', 'amount', 'vendor_name'] as SortKey[]).map(key => {
              const isActive = sortConfig.key === key;
              const Icon = sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
              return (
                <Button key={key} variant={isActive ? 'secondary' : 'ghost'} size="sm" onClick={() => handleSortChange(key)}>
                  {key.replace('_', ' ')}
                  {isActive && <Icon className="ml-2 h-4 w-4" />}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {processedInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            {searchTerm ? "No vendors match your search." : "All dues are paid. 🎉"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {processedInvoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  {invoice.vendor_name}
                </CardTitle>
                <Badge variant="destructive">Unpaid</Badge>
              </CardHeader>

              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                  <p><strong>Stall:</strong> {invoice.stall_name}</p>
                  <p><strong>Amount:</strong> ₱{invoice.amount.toLocaleString()}</p>
                  <p className={isOverdue(invoice.due_date) ? 'text-destructive font-semibold' : ''}><strong>Due Date:</strong> {invoice.due_date}</p>
                </div>

                <Button
                  size="sm"
                  disabled={marking === invoice.id}
                  onClick={() => markAsPaid(invoice.id)}
                  className="w-full sm:w-auto mt-2"
                >
                  {marking === invoice.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Paid
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </div>
  );
};
