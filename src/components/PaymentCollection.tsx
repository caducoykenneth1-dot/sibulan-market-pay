import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  CheckCircle,
  DollarSign,
  PrinterIcon,
  Receipt,
  Search,
  User,
  Building2
} from "lucide-react";
import { type StallRecord } from "@/data/stalls";

type PaymentData = {
  amount: string;
  paymentType: string;
  notes: string;
};

interface PaymentCollectionProps {
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

const getStatusBadge = (status: StallRecord["status"]) =>
  status === "current" ? "default" : status === "due" ? "secondary" : "destructive";

export const PaymentCollection = ({ stalls }: PaymentCollectionProps) => {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStallId, setSelectedStallId] = useState<string>("");
  const [paymentData, setPaymentData] = useState<PaymentData>({
    amount: "",
    paymentType: "",
    notes: ""
  });
  const [showReceipt, setShowReceipt] = useState(false);

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);

  const stallTypeOptions = useMemo(
    () =>
      Array.from(new Set(stalls.map((stall) => stall.type))).sort((a, b) => a.localeCompare(b)),
    [stalls]
  );

  useEffect(() => {
    if (stallTypeOptions.length === 0) {
      setSelectedType("");
      return;
    }
    if (!selectedType) {
      setSelectedType(stallTypeOptions[0]);
      return;
    }
    if (!stallTypeOptions.includes(selectedType)) {
      setSelectedType(stallTypeOptions[0] ?? "");
    }
  }, [selectedType, stallTypeOptions]);

  const filteredStalls = useMemo(() => {
    if (!selectedType) {
      return stalls;
    }
    return stalls.filter((stall) => stall.type === selectedType);
  }, [stalls, selectedType]);

  useEffect(() => {
    if (filteredStalls.length === 0) {
      setSelectedStallId("");
      return;
    }
    if (!selectedStallId || !filteredStalls.some((stall) => stall.id === selectedStallId)) {
      setSelectedStallId(filteredStalls[0].id);
    }
  }, [filteredStalls, selectedStallId]);

  const selectedStall = useMemo(
    () => stalls.find((stall) => stall.id === selectedStallId) ?? null,
    [stalls, selectedStallId]
  );
  const selectedStallDisplayName = selectedStall ? displayNameById.get(selectedStall.id) ?? selectedStall.name : "";

  useEffect(() => {
    if (!selectedStall) {
      setPaymentData((prev) => ({ ...prev, amount: "" }));
      return;
    }
    setPaymentData((prev) => ({ ...prev, amount: String(selectedStall.monthlyRent) }));
  }, [selectedStall]);

  const handlePaymentSubmit = () => {
    if (!selectedStall || !paymentData.amount || !paymentData.paymentType) {
      toast({
        title: "Missing information",
        description: "Please select a stall and complete all required fields.",
        variant: "destructive"
      });
      return;
    }

    setShowReceipt(true);
    toast({
      title: "Payment recorded",
      description: `Payment of PHP ${paymentData.amount} captured for ${selectedStall.vendor || "No vendor assigned"}.`
    });
  };

  const handlePrintReceipt = () => {
    toast({ title: "Receipt generated", description: "Digital receipt ready for printing." });
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
              <CheckCircle className="h-6 w-6" /> Payment successful
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold">PHP {paymentData.amount}</div>
              <Badge variant="outline">Receipt #DPM-{Date.now().toString().slice(-6)}</Badge>
            </div>
            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span>Vendor</span>
                <span className="font-medium">{selectedStall.vendor || "No vendor assigned"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Stall</span>
                <span className="font-medium">{selectedStallDisplayName} ({selectedStall.id})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Collected amount</span>
                <span className="font-medium">PHP {paymentData.amount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Payment type</span>
                <span className="font-medium">{paymentData.paymentType}</span>
              </div>
            </div>
            <Button className="w-full" onClick={handlePrintReceipt}>
              <PrinterIcon className="mr-2 h-4 w-4" /> Print receipt
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Payment Collection</h1>
          <p className="text-muted-foreground">Capture stall payments and generate receipts instantly.</p>
        </div>
        <Button variant="outline" onClick={() => setShowReceipt(false)} disabled>
          <Receipt className="mr-2 h-4 w-4" /> Recent receipts
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Search className="h-5 w-5" /> Select stall
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stall-type">Stall type</Label>
              <Select value={selectedType || undefined} onValueChange={setSelectedType} disabled={stallTypeOptions.length === 0}>
                <SelectTrigger id="stall-type">
                  <SelectValue placeholder="Select stall type" />
                </SelectTrigger>
                <SelectContent>
                  {stallTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stall-select">Stall</Label>
              <Select
                value={selectedStallId || undefined}
                onValueChange={setSelectedStallId}
                disabled={filteredStalls.length === 0}
              >
                <SelectTrigger id="stall-select" disabled={filteredStalls.length === 0}>
                  <SelectValue
                    placeholder={
                      filteredStalls.length === 0
                        ? "No stalls available"
                        : "Choose stall"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredStalls.map((stall) => {
                    const displayName = displayNameById.get(stall.id) ?? stall.name;
                    return (
                      <SelectItem key={stall.id} value={stall.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{displayName}</span>
                          <span className="text-sm text-muted-foreground">
                            {stall.vendor || "No vendor"}
                          </span>
                          <Badge variant={getStatusBadge(stall.status)} className="ml-auto capitalize">
                            {stall.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedStall ? (
            <Card className="bg-muted/40">
              <CardContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedStallDisplayName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedStall.vendor || "No vendor assigned"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Monthly rent: PHP {selectedStall.monthlyRent}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Last payment: {selectedStall.lastPayment || "--"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Select a stall to see details.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Payment details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="amount">Amount (PHP)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                value={paymentData.amount}
                onChange={(event) => setPaymentData({ ...paymentData, amount: event.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="payment-type">Payment type</Label>
              <Select
                value={paymentData.paymentType || undefined}
                onValueChange={(value) => setPaymentData({ ...paymentData, paymentType: value })}
              >
                <SelectTrigger id="payment-type">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly-rent">Monthly rent</SelectItem>
                  <SelectItem value="daily-fee">Daily fee</SelectItem>
                  <SelectItem value="penalty">Penalty</SelectItem>
                  <SelectItem value="deposit">Security deposit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={paymentData.notes}
              onChange={(event) => setPaymentData({ ...paymentData, notes: event.target.value })}
              placeholder="Additional information about this payment"
            />
          </div>
          <Button
            className="w-full"
            onClick={handlePaymentSubmit}
            disabled={!selectedStall || !paymentData.amount || !paymentData.paymentType}
          >
            Record payment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
