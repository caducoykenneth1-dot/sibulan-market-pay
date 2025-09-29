import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInitialStalls, StallRecord } from "@/data/stalls";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Calendar,
  DollarSign,
  Receipt,
  User,
  Building2,
  CheckCircle,
  PrinterIcon
} from "lucide-react";

type PaymentData = {
  amount: string;
  paymentType: string;
  notes: string;
};

const getStatusBadge = (status: StallRecord["status"]) =>
  status === "current" ? "default" : status === "due" ? "secondary" : "destructive";

export const PaymentCollection = () => {
  const { toast } = useToast();
  const [selectedStall, setSelectedStall] = useState<StallRecord | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData>({
    amount: "",
    paymentType: "",
    notes: ""
  });
  const [showReceipt, setShowReceipt] = useState(false);

  const stalls = useMemo<StallRecord[]>(() => createInitialStalls(), []);

  const handleStallSelect = (stallId: string) => {
    const stall = stalls.find((s) => s.id === stallId) ?? null;
    setSelectedStall(stall);
    setPaymentData((prev) => ({
      ...prev,
      amount: stall ? String(stall.monthlyRent) : ""
    }));
  };

  const handlePaymentSubmit = () => {
    if (!selectedStall || !paymentData.amount || !paymentData.paymentType) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setShowReceipt(true);
    toast({
      title: "Payment Recorded",
      description: `Payment of PHP ${paymentData.amount} recorded for ${selectedStall.vendor || "No vendor assigned"}`,
      variant: "default"
    });
  };

  const handlePrintReceipt = () => {
    toast({
      title: "Receipt Printed",
      description: "Digital receipt has been generated",
      variant: "default"
    });
  };

  if (showReceipt && selectedStall) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowReceipt(false)}>
            <span>&lt; Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Payment Receipt</h1>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-green-600 flex items-center justify-center gap-2">
              <CheckCircle className="h-6 w-6" />
              Payment Successful
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold">PHP {paymentData.amount}</div>
              <Badge variant="outline">Receipt #DPM-{Date.now().toString().slice(-6)}</Badge>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stall</span>
                <span className="font-medium text-right">
                  {selectedStall.name}
                  <span className="block text-xs text-muted-foreground">{selectedStall.id}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-medium">{selectedStall.vendor || "No vendor assigned"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Type</span>
                <span className="font-medium">{paymentData.paymentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed On</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              {paymentData.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <span className="ml-1">{paymentData.notes}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handlePrintReceipt}>
                <PrinterIcon className="mr-2 h-4 w-4" />
                Print Receipt
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSelectedStall(null);
                  setPaymentData({ amount: "", paymentType: "", notes: "" });
                  setShowReceipt(false);
                }}
              >
                Record Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Collect Payment</h1>
        <p className="text-muted-foreground">Record rental and fee payments for market stalls</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stall Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Select Stall
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Search by stall name, vendor, or ID</Label>
              <Select onValueChange={handleStallSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a stall..." />
                </SelectTrigger>
                <SelectContent>
                  {stalls.map((stall) => (
                    <SelectItem key={stall.id} value={stall.id}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{stall.name}</span>
                          <span className="text-sm text-muted-foreground">{stall.vendor || "No vendor assigned"}</span>
                          <Badge variant={getStatusBadge(stall.status)} className="ml-auto">
                            {stall.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{stall.id}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStall && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="font-medium">{selectedStall.name}</span>
                        <span className="text-xs text-muted-foreground">{selectedStall.id}</span>
                      </div>
                      <Badge variant={getStatusBadge(selectedStall.status)} className="ml-auto">
                        {selectedStall.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedStall.vendor || "No vendor assigned"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>Monthly Rent: PHP {selectedStall.monthlyRent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Last Payment: {selectedStall.lastPayment}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Payment Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount (PHP)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              />
            </div>

            <div>
              <Label>Payment Type</Label>
              <Select onValueChange={(value) => setPaymentData({ ...paymentData, paymentType: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly-rent">Monthly Rent</SelectItem>
                  <SelectItem value="daily-fee">Daily Fee</SelectItem>
                  <SelectItem value="penalty">Penalty</SelectItem>
                  <SelectItem value="deposit">Security Deposit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this payment..."
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              />
            </div>

            <Button
              onClick={handlePaymentSubmit}
              className="w-full"
              disabled={!selectedStall || !paymentData.amount || !paymentData.paymentType}
            >
              Record Payment
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
