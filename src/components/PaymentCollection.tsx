import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { computeStatusFromDueDate, type StallRecord } from "@/data/stalls";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabaseClient"; // ✅ Supabase client

type PaymentData = {
  amount: string;
  notes: string;
};

interface PaymentCollectionProps {
  stalls: StallRecord[];
  collectorName: string;
  onPaymentSuccess: () => void;
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

const generateReceiptNo = () => `DPM-${Math.floor(100000 + Math.random() * 900000)}`;

export const PaymentCollection = ({ stalls, collectorName, onPaymentSuccess }: PaymentCollectionProps) => {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStallId, setSelectedStallId] = useState<string>("");
  const [paymentData, setPaymentData] = useState<PaymentData>({
    amount: "",
    notes: "",
  });
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptNo, setReceiptNo] = useState(generateReceiptNo());
  const [loading, setLoading] = useState(false);

  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);
  const stallTypeOptions = useMemo(
    () => Array.from(new Set(stalls.map((stall) => stall.type))).sort((a, b) => a.localeCompare(b)),
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
    if (!selectedType) return stalls;
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

  const selectedStallDisplayName = selectedStall
    ? displayNameById.get(selectedStall.id) ?? selectedStall.name
    : "";

  useEffect(() => {
    if (!selectedStall) {
      setPaymentData((prev) => ({ ...prev, amount: "" }));
      return;
    }
    setPaymentData((prev) => ({ ...prev, amount: String(selectedStall.rentAmount) }));
  }, [selectedStall]);

  /* ----------------------------------------------------------
     ✅ MAIN PAYMENT SUBMIT HANDLER
  ---------------------------------------------------------- */
  const handlePaymentSubmit = async () => {
    if (!selectedStall || !paymentData.amount) {
      toast({
        title: "Missing information",
        description: "Please select a stall and complete all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const paymentTimestamp = new Date();
    const paymentDateString = paymentTimestamp.toISOString().split("T")[0];

    const stallLabel =
      selectedStall.type && selectedStallDisplayName
        ? `${selectedStall.type} - ${selectedStallDisplayName}`
        : selectedStallDisplayName || "Unnamed Stall";

    const paymentType = selectedStall.rentalType === "daily" ? "Daily Fee" : "Monthly Rent";

    // ✅ Insert payment into invoices
    const { error: invoiceError } = await supabase.from("invoices").insert([
      {
        vendor_id: selectedStall.dbId,
        vendor_name: selectedStall.vendor || "No vendor",
        stall_name: stallLabel,
        stall_type: selectedStall.type,
        amount: Number(paymentData.amount),
        payment_type: paymentType,
        notes: paymentData.notes || null,
        due_date: paymentDateString,
        status: "paid",
        paid_at: paymentTimestamp.toISOString(),
        collector_name: collectorName,
      },
    ]);

    if (invoiceError) {
      setLoading(false);
      console.error(invoiceError);
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Payment could not be saved. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error saving payment",
          description: invoiceError.message,
          variant: "destructive",
        });
      }
      return;
    }

    /* ✅ Auto-update stall’s next_due & status */
    const today = new Date();
    let nextDueDate = new Date(selectedStall.nextDue || today);

    if (selectedStall.rentalType === "daily") {
      nextDueDate.setDate(today.getDate() + 1);
    } else {
      nextDueDate.setMonth(today.getMonth() + 1);
    }

    const nextDueDateString = nextDueDate.toISOString().split("T")[0];
    const updatedStatus = computeStatusFromDueDate(
  nextDueDateString,
  "current",
  undefined,
  selectedStall.rentalType
);


    console.log("🔍 Updating vendor:", {
      id: selectedStall.dbId,
      last_payment: paymentDateString,
      next_due: nextDueDateString,
      status: updatedStatus,
    });

    const { data: updateData, error: vendorUpdateError } = await supabase
      .from("vendors")
      .update({
        last_payment: paymentDateString,
        next_due: nextDueDateString,
        status: updatedStatus,
      })
      .eq("id", selectedStall.dbId)
      .select()
      .single();

    setLoading(false);

    if (vendorUpdateError) {
      console.error("❌ Vendor update failed:", vendorUpdateError);
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Stall due date could not be updated. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Update failed",
          description: vendorUpdateError.message,
          variant: "destructive",
        });
      }
    } else {
      console.log("✅ Vendor updated:", updateData);
      toast({
        title: "Next due updated",
        description: `Stall ${updateData.type} new due: ${updateData.next_due}`,
      });
    }

    // ✅ Success feedback
    setReceiptNo(generateReceiptNo());
    setShowReceipt(true);
    toast({
      title: "Payment recorded",
      description: `Payment of PHP ${paymentData.amount} saved for ${selectedStall.vendor || "No vendor"}.`,
    });
    await onPaymentSuccess();
  };

  /* ----------------------------------------------------------
     🖨️ RECEIPT PRINTING
  ---------------------------------------------------------- */
  const handlePrintReceipt = async () => {
    const receipt = document.getElementById("receipt-content");
    if (!receipt) return;

    try {
      const canvas = await html2canvas(receipt, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: receipt.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");
      const pxPerMm = 3.779528;
      const pdfWidth = 80;
      const pdfHeight = canvas.height / pxPerMm;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight],
      });

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      pdf.autoPrint();
      window.open(pdf.output("bloburl"), "_blank");

      toast({
        title: "Receipt ready",
        description: "Print dialog opened automatically.",
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

  /* ----------------------------------------------------------
     🧾 RECEIPT VIEW
  ---------------------------------------------------------- */
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
            <CardHeader className="text-center space-y-2">
              <img src="/logo.png" alt="Sibulan Market Pay Logo" className="mx-auto h-16 w-16" />
              <CardTitle className="text-base font-semibold">PAYMENT RECEIPT</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold">PHP {paymentData.amount}</div>
                <div>Receipt No: {receiptNo}</div>
              </div>
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Vendor:</span>
                  <span className="font-medium">{selectedStall.vendor || "No vendor"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stall:</span>
                  <span className="font-medium">
                    {selectedStall.type} - {selectedStallDisplayName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">PHP {paymentData.amount}</span>
                </div>
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
          🖨️ Print Receipt
        </Button>
      </div>
    );
  }

  /* ----------------------------------------------------------
     🧾 PAYMENT FORM
  ---------------------------------------------------------- */
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
                <strong>Rent Amount:</strong> PHP {selectedStall.rentAmount.toLocaleString()} /{" "}
                {selectedStall.rentalType}
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
          <div className="grid gap-4">
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
            disabled={!selectedStall || !paymentData.amount || loading}
          >
            {loading ? "Saving..." : "Record Payment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
