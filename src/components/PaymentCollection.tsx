import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { type StallRecord } from "@/data/stalls";

// 🧩 PDF generation imports
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

  // ✅ Fixed thermal PDF (proper width & upright orientation)
  const handlePrintReceipt = async () => {
  const receipt = document.getElementById("receipt-content");
  if (!receipt) return;

  try {
    // Capture the receipt at high quality
    const canvas = await html2canvas(receipt, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: receipt.scrollWidth,
    });

    const imgData = canvas.toDataURL("image/png");

    // Real-world scaling logic (1mm ≈ 3.779528 px)
    const pxPerMm = 3.779528;
    const pdfWidth = 80; // 80mm thermal width
    const pdfHeight = canvas.height / pxPerMm; // convert actual pixel height to mm

    // Create portrait PDF with proper aspect ratio
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pdfWidth, pdfHeight],
    });

    // Calculate image height to preserve proportions
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    pdf.save(`receipt-${Date.now()}.pdf`);

    toast({
      title: "Receipt generated",
      description: "Properly scaled PDF created.",
    });
  } catch (error) {
    console.error("PDF generation failed:", error);
    toast({
      title: "Error",
      description: "Something went wrong while generating the receipt.",
      variant: "destructive",
    });
  }
};


  if (showReceipt && selectedStall) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowReceipt(false)}>
            &lt; Back
          </Button>
          <h1 className="text-2xl font-bold">Payment Receipt</h1>
        </div>

        <div id="receipt-content">
          <Card className="mx-auto w-[300px] text-sm p-2">
            <CardHeader className="text-center">
              <CardTitle className="text-lg font-semibold">
                PAYMENT RECEIPT
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold">PHP {paymentData.amount}</div>
                <div>Receipt No: DPM-{Date.now().toString().slice(-6)}</div>
              </div>
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Vendor:</span>
                  <span className="font-medium">{selectedStall.vendor || "No vendor"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stall:</span>
                  <span className="font-medium">
                    {selectedStallDisplayName} ({selectedStall.id})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">PHP {paymentData.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Type:</span>
                  <span className="font-medium">{paymentData.paymentType}</span>
                </div>
                {paymentData.notes && (
                  <div className="flex justify-between">
                    <span>Notes:</span>
                    <span className="font-medium">{paymentData.notes}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
              </div>
              <div className="text-center text-xs pt-2 border-t mt-2">
                Thank you for your payment.
              </div>
            </CardContent>
          </Card>
        </div>

        <Button className="w-full" onClick={handlePrintReceipt}>
          Print Receipt
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Payment Collection</h1>
          <p className="text-muted-foreground">
            Capture stall payments and generate receipts instantly.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Select Stall</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="stall-type">Stall Type</Label>
              <Select
                value={selectedType || undefined}
                onValueChange={setSelectedType}
                disabled={stallTypeOptions.length === 0}
              >
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
            <div>
              <Label htmlFor="stall-select">Stall</Label>
              <Select
                value={selectedStallId || undefined}
                onValueChange={setSelectedStallId}
                disabled={filteredStalls.length === 0}
              >
                <SelectTrigger id="stall-select">
                  <SelectValue placeholder="Choose stall" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStalls.map((stall) => {
                    const displayName = displayNameById.get(stall.id) ?? stall.name;
                    return (
                      <SelectItem key={stall.id} value={stall.id}>
                        {displayName} — {stall.vendor || "No vendor"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedStall && (
            <div className="bg-muted/40 p-3 rounded-md text-sm space-y-1">
              <div>
                <strong>Stall:</strong> {selectedStallDisplayName}
              </div>
              <div>
                <strong>Vendor:</strong> {selectedStall.vendor || "No vendor"}
              </div>
              <div>
                <strong>Monthly Rent:</strong> PHP {selectedStall.monthlyRent}
              </div>
              <div>
                <strong>Last Payment:</strong> {selectedStall.lastPayment || "--"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
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
              <Label htmlFor="payment-type">Payment Type</Label>
              <Select
                value={paymentData.paymentType || undefined}
                onValueChange={(value) => setPaymentData({ ...paymentData, paymentType: value })}
              >
                <SelectTrigger id="payment-type">
                  <SelectValue placeholder="Select payment type" />
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
            Record Payment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
