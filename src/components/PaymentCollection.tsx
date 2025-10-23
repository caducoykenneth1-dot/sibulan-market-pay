import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { computeStatusFromDueDate, type StallRecord, type StallTypeInfo } from "@/data/stalls";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabaseClient"; // Supabase client

type PaymentData = {
  amount: string;
  notes: string;
};

interface PaymentCollectionProps {
  stalls: StallRecord[];
  collectorName: string;
  collectorId: string;
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

const getStartOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const parseISODate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const formatDateForDisplay = (value: string | null | undefined) => {
  const parsed = parseISODate(value);
  if (!parsed) return "-";
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const PaymentCollection = ({ stalls, collectorName, collectorId, onPaymentSuccess }: PaymentCollectionProps) => {
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

  const groupedStallTypes = useMemo(() => {
    const stallTypesWithSection = stalls.map(stall => ({ name: stall.type, section: stall.section }));
    const uniqueStallTypes = Array.from(new Map(stallTypesWithSection.map(item => [item.name, item])).values());
    
    return uniqueStallTypes.reduce((acc, type) => {
      const section = type.section || 'Uncategorized';
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(type as StallTypeInfo);
      return acc;
    }, {} as Record<string, StallTypeInfo[]>);
  }, [stalls]);

  const canCollectStall = useCallback((stall: StallRecord) => {
    if (!stall) return false;
    if (stall.status === "vacant" || stall.status === "archived") return false;

    const nextDueDate = parseISODate(stall.nextDue);
    if (nextDueDate) {
      return nextDueDate <= getStartOfToday();
    }

    // Fallback to status if next due is missing
    return stall.status === "due" || stall.status === "overdue";
  }, []);

  useEffect(() => {
    if (stallTypeOptions.length === 0) {
      setSelectedType("");
      return;
    }
    const firstCollectableType =
      stallTypeOptions.find((type) =>
        stalls.some((stall) => stall.type === type && canCollectStall(stall))
      ) ?? stallTypeOptions[0];

    if (!selectedType) {
      setSelectedType(firstCollectableType);
      return;
    }
    if (!stallTypeOptions.includes(selectedType)) {
      setSelectedType(firstCollectableType);
    }
  }, [selectedType, stallTypeOptions, stalls, canCollectStall]);

  const filteredStalls = useMemo(() => {
    if (!selectedType) return stalls;
    return stalls.filter((stall) => stall.type === selectedType);
  }, [stalls, selectedType]);

  const collectableStalls = useMemo(() => filteredStalls.filter(canCollectStall), [filteredStalls, canCollectStall]);

  const nonCollectableStalls = useMemo(
    () => filteredStalls.filter((stall) => !canCollectStall(stall)),
    [filteredStalls, canCollectStall]
  );

  useEffect(() => {
    if (collectableStalls.length === 0) {
      setSelectedStallId("");
      return;
    }
    if (!selectedStallId || !collectableStalls.some((stall) => stall.id === selectedStallId)) {
      setSelectedStallId(collectableStalls[0].id);
    }
  }, [collectableStalls, selectedStallId]);

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
     ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ MAIN PAYMENT SUBMIT HANDLER
  ---------------------------------------------------------- */  const handlePaymentSubmit = async () => {
    if (!selectedStall || !paymentData.amount) {
      toast({
        title: "Missing information",
        description: "Please select a stall and complete all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!collectorId) {
      toast({
        title: "Missing collector",
        description: "Please sign in again before collecting payments.",
        variant: "destructive",
      });
      return;
    }

    const stallDbId = selectedStall.dbId;
    let lockAcquired = false;

    setLoading(true);

    try {
      const { data: lockData, error: lockError } = await supabase.rpc("acquire_stall_lock", {
        p_stall_id: stallDbId,
        p_collector: collectorId,
        p_collector_name: collectorName,
      });

      if (lockError) {
        console.error("Error acquiring stall lock:", lockError);
        toast({
          title: "Unable to lock stall",
          description: lockError.message,
          variant: "destructive",
        });
        return;
      }

      if (!lockData) {
        toast({
          title: "Already processing",
          description: "Another collector is already recording a payment for this stall.",
          variant: "destructive",
        });
        setSelectedStallId("");
        await onPaymentSuccess();
        return;
      }

      lockAcquired = true;

      const { data: latestStall, error: latestFetchError } = await supabase
        .from("vendors")
        .select("id, last_payment, next_due, status, rental_type")
        .eq("id", stallDbId)
        .maybeSingle();

      if (latestFetchError) {
        console.error("Error verifying stall status:", latestFetchError);
        toast({
          title: "Could not verify stall status",
          description: latestFetchError.message,
          variant: "destructive",
        });
        return;
      }

      const statusFromDb = (latestStall?.status || selectedStall.status || "").toLowerCase();
      const rentalTypeFromDb = (latestStall?.rental_type || selectedStall.rentalType || "monthly") as "daily" | "monthly";
      const todayStart = getStartOfToday();
      let nextEligibleDate = parseISODate(latestStall?.next_due);

      if (!nextEligibleDate && latestStall?.last_payment) {
        const lastPaymentDate = parseISODate(latestStall.last_payment);
        if (lastPaymentDate) {
          nextEligibleDate = new Date(lastPaymentDate);
          if (rentalTypeFromDb === "daily") {
            nextEligibleDate.setDate(nextEligibleDate.getDate() + 1);
          } else {
            nextEligibleDate.setMonth(nextEligibleDate.getMonth() + 1);
          }
          nextEligibleDate.setHours(0, 0, 0, 0);
        }
      }

      const canCollectNow = (() => {
        if (statusFromDb === "vacant" || statusFromDb === "archived") return false;
        if (nextEligibleDate) {
          return nextEligibleDate <= todayStart;
        }
        return statusFromDb === "due" || statusFromDb === "overdue" || statusFromDb === "";
      })();

      if (!canCollectNow) {
        toast({
          title: "Not due yet",
          description: nextEligibleDate
            ? `This stall is settled until ${nextEligibleDate.toLocaleDateString()}. Please collect after that date.`
            : "This stall is not currently due for collection.",
          variant: "destructive",
        });
        setSelectedStallId("");
        await onPaymentSuccess();
        return;
      }

      const paymentTimestamp = new Date();
      const paymentDateString = paymentTimestamp.toISOString().split("T")[0];

      const stallLabel =
        selectedStall.type && selectedStallDisplayName
          ? `${selectedStall.type} - ${selectedStallDisplayName}`
          : selectedStallDisplayName || "Unnamed Stall";

      const paymentType = selectedStall.rentalType === "daily" ? "Daily Fee" : "Monthly Rent";

      const { error: invoiceError } = await supabase.from("invoices").insert([
        {
          vendor_id: stallDbId,
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
        console.error("Error saving payment:", invoiceError);
        toast({
          title: !navigator.onLine ? "No Internet Connection" : "Error saving payment",
          description: !navigator.onLine
            ? "Payment could not be saved. Please check your connection."
            : invoiceError.message,
          variant: "destructive",
        });
        return;
      }

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

      const { data: updateData, error: vendorUpdateError } = await supabase
        .from("vendors")
        .update({
          last_payment: paymentDateString,
          next_due: nextDueDateString,
          status: updatedStatus,
        })
        .eq("id", stallDbId)
        .select()
        .single();

      if (vendorUpdateError) {
        console.error("Vendor update failed:", vendorUpdateError);
        toast({
          title: !navigator.onLine ? "No Internet Connection" : "Update failed",
          description: !navigator.onLine
            ? "Stall due date could not be updated. Please check your connection."
            : vendorUpdateError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Next due updated",
          description: `Stall ${updateData.type} new due: ${updateData.next_due}`,
        });
      }

      setReceiptNo(generateReceiptNo());
      setShowReceipt(true);
      toast({
        title: "Payment recorded",
        description: `Payment of PHP ${paymentData.amount} saved for ${selectedStall.vendor || "No vendor"}.`,
      });
      await onPaymentSuccess();
    } finally {
      if (lockAcquired) {
        const { error: releaseError } = await supabase.rpc("release_stall_lock", {
          p_stall_id: stallDbId,
        });
        if (releaseError) {
          console.error("Error releasing stall lock:", releaseError);
        }
      }
      setLoading(false);
    }
  };

  /* ----------------------------------------------------------
     ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¾ RECEIPT VIEW
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
          ÃƒÂ¯Ã‚Â¿Ã‚Â½-ÃƒÂ¯Ã‚Â¿Ã‚Â½ÃƒÂ¯Ã‚Â¸Ã‚Â Print Receipt
        </Button>
      </div>
    );
  }

  /* ----------------------------------------------------------
     ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¾ PAYMENT FORM
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
                  {Object.entries(groupedStallTypes).map(([section, types]) => (
                      <SelectGroup key={section}>
                        <SelectLabel>{section}</SelectLabel>
                        {types.map((type) => (
                          <SelectItem key={type.name} value={type.name}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="stall-select">Stall</Label>
              <Select
                value={selectedStallId || undefined}
                onValueChange={setSelectedStallId}
                disabled={collectableStalls.length === 0}
              >
                <SelectTrigger id="stall-select">
                  <SelectValue placeholder="Choose stall" />
                </SelectTrigger>
                <SelectContent>
                  {collectableStalls.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Due &amp; Overdue</SelectLabel>
                      {collectableStalls.map((stall) => {
                        const displayName = displayNameById.get(stall.id) ?? stall.name;
                        return (
                          <SelectItem key={stall.id} value={stall.id}>
                            {displayName} - Next due {nextDueLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {collectableStalls.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  All stalls of this type are settled until their next due date.
                </p>
              )}
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
              <div>
                <strong>Next Due:</strong> {formatDateForDisplay(selectedStall.nextDue)}
              </div>
              <div className="capitalize">
                <strong>Status:</strong> {selectedStall.status}
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
