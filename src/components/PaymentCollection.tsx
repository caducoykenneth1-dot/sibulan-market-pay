import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { computeStatusFromDueDate, type StallRecord, type StallTypeInfo } from "@/data/stalls";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabaseClient"; // Supabase client
import { Loader2, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type PaymentData = {
  amount: string;
  notes: string;
};

interface PaymentCollectionProps {
  stalls: StallRecord[];
  collectorName: string;
  collectorId: string;
  onPaymentSuccess: () => void;
  userRole?: string;
  userSection?: string;
}

const OFFLINE_PAYMENT_QUEUE_KEY = "offlinePaymentQueue";
const STALLS_CACHE_KEY = "stallsCache";

export interface QueuedPayment {
  id: string; // A unique ID for the queued item, e.g., a UUID
  stallDbId: number;
  stallLabel: string;
  vendorName: string;
  stallType: string;
  amount: number;
  paymentType: string;
  notes: string | null;
  paymentTimestamp: string; // ISO string
  collectorId: string;
  collectorName: string;
  rentalType: 'daily' | 'monthly';
  nextDue: string | null;
  paymentMethod: 'cash' | 'gcash' | 'maycana';
  referenceNumber: string;
  duration?: number;
}

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

export const PaymentCollection = ({ 
  stalls, 
  collectorName, 
  collectorId, 
  onPaymentSuccess,
  userRole,
  userSection
}: PaymentCollectionProps) => {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStallId, setSelectedStallId] = useState<string>("");
  const [paymentData, setPaymentData] = useState<PaymentData>({
    amount: "",
    notes: "",
  });
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptNo, setReceiptNo] = useState(generateReceiptNo());
  const [receiptContext, setReceiptContext] = useState<{
    stallLabel: string;
    vendor: string;
    amount: string;
    paymentType: string;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber: string;
    isOffline?: boolean;
    paymentPeriod?: { start: Date; end: Date };
    duration?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [localStalls, setLocalStalls] = useState<StallRecord[]>(stalls);
  const [duration, setDuration] = useState<number | string>(1);

  const checkInternetConnection = async () => {
    try {
      await fetch("https://www.google.com/favicon.ico", { mode: "no-cors", cache: "no-store" });
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (isOnline) {
      if (stalls && stalls.length > 0) {
        // Online and have fresh data, so cache it and use it.
        localStorage.setItem(STALLS_CACHE_KEY, JSON.stringify(stalls));
        setLocalStalls(stalls);
      }
    } else {
      // Offline. If the stalls prop is empty, try to load from cache.
      if (!stalls || stalls.length === 0) {
        const cachedStallsJson = localStorage.getItem(STALLS_CACHE_KEY);
        if (cachedStallsJson) {
          const cachedStalls = JSON.parse(cachedStallsJson) as StallRecord[];
          setLocalStalls(cachedStalls);
          toast({
            title: "Using Offline Data",
            description: "Stall information loaded from local cache.",
          });
        }
      }
    }
  }, [stalls, isOnline, toast]);

  const getQueue = useCallback((): QueuedPayment[] => {
    const queueJson = localStorage.getItem(OFFLINE_PAYMENT_QUEUE_KEY);
    return queueJson ? JSON.parse(queueJson) : [];
  }, []);

  const saveQueue = (queue: QueuedPayment[]) => {
    localStorage.setItem(OFFLINE_PAYMENT_QUEUE_KEY, JSON.stringify(queue));
    setOfflineQueueCount(queue.length);
  };

  const syncOfflinePayments = useCallback(async () => {
    if (isSyncing) return;

    const queue = getQueue();
    if (queue.length === 0) {
      setOfflineQueueCount(0);
      return;
    }

    setIsSyncing(true);
    toast({ title: "Syncing...", description: `Syncing ${queue.length} offline payment(s)...` });

    let successfulSyncs = 0;
    const syncErrors: any[] = [];
    const remainingInQueue: QueuedPayment[] = [];

    for (const payment of queue) {
      try {
        const loopCount = payment.duration || 1;
        const totalAmount = payment.amount;
        const perInvoiceAmount = Math.floor((totalAmount / loopCount) * 100) / 100;
        const remainder = totalAmount - (perInvoiceAmount * loopCount);
        const systemReceiptNo = generateReceiptNo();

        let currentDueDate = parseISODate(payment.nextDue);
        if (!currentDueDate) {
             currentDueDate = new Date(payment.paymentTimestamp);
        }

        const invoicesToInsert = [];
        for (let i = 0; i < loopCount; i++) {
          const invoiceDate = new Date(currentDueDate!);
          if (payment.rentalType === 'daily') {
              invoiceDate.setDate(invoiceDate.getDate() + i);
          } else {
              invoiceDate.setMonth(invoiceDate.getMonth() + i);
          }
          const amount = i === 0 ? perInvoiceAmount + remainder : perInvoiceAmount;
          const uniqueReceiptNo = loopCount > 1 ? `${systemReceiptNo}-${i + 1}` : systemReceiptNo;

          invoicesToInsert.push({
            vendor_id: payment.stallDbId,
            vendor_name: payment.vendorName,
            stall_name: payment.stallLabel,
            stall_type: payment.stallType,
            amount: amount,
            payment_type: payment.paymentType,
            notes: payment.notes,
            due_date: invoiceDate.toISOString().split("T")[0],
            status: "paid",
            paid_at: payment.paymentTimestamp,
            collector_id: payment.collectorId,
            collector_name: payment.collectorName,
            receipt_number: uniqueReceiptNo,
          });
        }

        const { error: invoiceError } = await supabase.from("invoices").insert(invoicesToInsert);

        if (invoiceError) throw new Error(`Invoice insert failed: ${invoiceError.message}`);

        // Calculate next due date after the paid period
        let nextDueDate = new Date(currentDueDate!);
        if (payment.rentalType === "daily") {
          nextDueDate.setDate(nextDueDate.getDate() + loopCount);
        } else {
          nextDueDate.setMonth(nextDueDate.getMonth() + loopCount);
          if (payment.nextDue) {
            const oldDue = new Date(payment.nextDue);
            if (!isNaN(oldDue.getTime())) nextDueDate.setDate(oldDue.getDate());
          }
        }

        const nextDueDateString = `${nextDueDate.getFullYear()}-${String(nextDueDate.getMonth() + 1).padStart(2, "0")}-${String(nextDueDate.getDate()).padStart(2, "0")}`;

        const { error: vendorUpdateError } = await supabase
          .from("vendors")
          .update({
            last_payment: new Date(payment.paymentTimestamp).toISOString().split("T")[0],
            next_due: nextDueDateString,
            status: 'current',
          })
          .eq("id", payment.stallDbId);

        if (vendorUpdateError) {
          console.error(`Vendor update failed for ${payment.vendorName}: ${vendorUpdateError.message}`);
          syncErrors.push({ payment, error: `Vendor update failed: ${vendorUpdateError.message}` });
        }

        successfulSyncs++;
      } catch (error) {
        console.error("Sync failed for one payment:", error);
        syncErrors.push({ payment, error: (error as Error).message });
        remainingInQueue.push(payment);
      }
    }

    saveQueue(remainingInQueue);

    if (syncErrors.length > 0) {
      toast({ title: "Sync Partially Failed", description: `${syncErrors.length} payment(s) could not be synced.`, variant: "destructive" });
    }
    if (successfulSyncs > 0) {
      toast({ title: "Sync Complete", description: `${successfulSyncs} offline payment(s) have been synced.` });
      onPaymentSuccess();
    }

    setIsSyncing(false);
  }, [isSyncing, toast, onPaymentSuccess, getQueue]);

  useEffect(() => {
    const handleStatusChange = async () => {
      const online = navigator.onLine ? await checkInternetConnection() : false;
      
      setIsOnline((prev) => {
        if (prev !== online) {
          if (online) {
            toast({ title: "Back Online!", description: "Attempting to sync offline data." });
            syncOfflinePayments();
          } else {
            toast({
              title: "You are offline",
              description: "Payments will be saved locally.",
              variant: "destructive",
            });
          }
        }
        return online;
      });
    };

    // Initial check
    handleStatusChange();

    // Poll every 5 seconds
    const interval = setInterval(handleStatusChange, 5000);

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    setOfflineQueueCount(getQueue().length);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, [getQueue, syncOfflinePayments, toast]);

  const availableStalls = useMemo(() => {
    if (userRole === 'admin') return localStalls;
    // If collector is unassigned or section is missing, show no stalls
    if (!userSection || userSection === "unassigned") return [];
    return localStalls.filter((s) => s.section === userSection);
  }, [localStalls, userSection, userRole]);

  const stallTypeOptions = useMemo(
    () => Array.from(new Set(availableStalls.map((stall) => stall.type))).sort((a, b) => a.localeCompare(b)),
    [availableStalls]
  );

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya'>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');

  const groupedStallTypes = useMemo(() => {
    const stallTypesWithSection = availableStalls.map(stall => ({ name: stall.type, section: stall.section }));
    const uniqueStallTypes = Array.from(new Map(stallTypesWithSection.map(item => [item.name, item])).values());
    
    return uniqueStallTypes.reduce((acc, type) => {
      const section = type.section || 'Uncategorized';
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(type as StallTypeInfo);
      return acc;
    }, {} as Record<string, StallTypeInfo[]>);
  }, [availableStalls]);

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
        availableStalls.some((stall) => stall.type === type && canCollectStall(stall))
      ) ?? stallTypeOptions[0];

    if (!selectedType) {
      setSelectedType(firstCollectableType);
      return;
    }
    if (!stallTypeOptions.includes(selectedType)) {
      setSelectedType(firstCollectableType);
    }
  }, [selectedType, stallTypeOptions, availableStalls, canCollectStall]);

  const filteredStalls = useMemo(() => {
    if (!selectedType) return availableStalls;
    return availableStalls.filter((stall) => stall.type === selectedType);
  }, [availableStalls, selectedType]);

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
    // Reset duration when stall selection logic runs (e.g. type change)
    setDuration(1);
  }, [collectableStalls, selectedStallId]);

  const selectedStall = useMemo(
    () => localStalls.find((stall) => stall.id === selectedStallId) ?? null,
    [localStalls, selectedStallId]
  );

  const selectedStallDisplayName = selectedStall ? selectedStall.name : "";

  const paymentPeriod = useMemo(() => {
    if (!selectedStall || selectedStall.rentalType !== 'daily' || !duration) {
      return null;
    }
    const dur = typeof duration === 'number' ? duration : parseInt(String(duration), 10) || 0;
    if (dur <= 0) return null;

    const startDate = parseISODate(selectedStall.nextDue) || getStartOfToday();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dur - 1);

    return {
      start: startDate,
      end: endDate,
    };
  }, [selectedStall, duration]);

  useEffect(() => {
    if (!selectedStall) {
      setDuration(1);
      setPaymentData((prev) => ({ ...prev, amount: "" }));
      setPaymentMethod("cash");
      setReferenceNumber("");
      return;
    }
    // If it's daily, calculate based on duration, otherwise just rentAmount
    const dur = typeof duration === 'number' ? duration : (parseInt(duration as string) || 0);
    if (selectedStall.rentalType === 'daily') {
        const total = selectedStall.rentAmount * dur;
        setPaymentData((prev) => ({ ...prev, amount: dur > 0 ? String(total) : "" }));
    } else {
        setPaymentData((prev) => ({ ...prev, amount: String(selectedStall.rentAmount) }));
    }
  }, [selectedStall, duration]);

  // Reset duration when stall changes explicitly
  useEffect(() => {
    setDuration(1);
  }, [selectedStallId]);

  const handlePrintReceipt = async () => {
    const receiptElement = document.getElementById("receipt-content");
    if (!receiptElement) {
      toast({
        title: "Error",
        description: "Could not find receipt content to print.",
        variant: "destructive",
      });
      return;
    }

    try {
      const canvas = await html2canvas(receiptElement, { scale: 3 }); // Increased scale for better quality
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
    } catch (error) {
      console.error("Error generating receipt PDF:", error);
      toast({ title: "Printing Error", description: "Could not generate receipt for printing.", variant: "destructive" });
    }
  };

  /* ----------------------------------------------------------
     ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ MAIN PAYMENT SUBMIT HANDLER
  ---------------------------------------------------------- */
  const currentReceiptNo = generateReceiptNo();
  const handlePaymentSubmit = async () => {
    if (!selectedStall || !paymentData.amount) {
      toast({
        title: "Missing information",
        description: "Please select a stall and complete all required fields.",
        variant: "destructive",
      });
      return;
    }

    const stallLabel = selectedStall.type && selectedStallDisplayName
      ? `${selectedStall.type} - ${selectedStallDisplayName}`
      : selectedStallDisplayName || "Unnamed Stall";
    const paymentType = selectedStall.rentalType === "daily" ? "Daily Fee" : "Monthly Rent";
    const paymentTimestamp = new Date();
    const currentReceiptNo = generateReceiptNo();
    const dur = typeof duration === 'number' ? duration : (parseInt(duration as string) || 1);
    const loopCount = selectedStall.rentalType === 'daily' ? dur : 1;

    if (!isOnline) {
      const newPayment: QueuedPayment = {
        id: crypto.randomUUID(),
        stallDbId: selectedStall.dbId,
        stallLabel,
        vendorName: selectedStall.vendor || "No vendor",
        stallType: selectedStall.type,
        amount: Number(paymentData.amount),
        paymentType,
        notes: paymentData.notes || null,
        paymentTimestamp: paymentTimestamp.toISOString(),
        collectorId,
        collectorName,
        rentalType: selectedStall.rentalType,
        nextDue: selectedStall.nextDue,
        paymentMethod,
        referenceNumber,
        duration: loopCount,
        paymentPeriod: paymentPeriod || undefined,
        duration: dur,
      };

      const queue = getQueue();
      queue.push(newPayment);
      saveQueue(queue);

      setReceiptContext({
        stallLabel,
        vendor: selectedStall.vendor || "No vendor",
        amount: paymentData.amount,
        paymentType,
        paymentDate: paymentTimestamp.toLocaleString(),
        paymentMethod: paymentMethod === 'cash' ? 'Cash' : (paymentMethod === 'gcash' ? 'GCash' : 'Maya'),
        referenceNumber,
        isOffline: true,
        paymentPeriod: paymentPeriod || undefined,
        duration: dur,
      });
      setShowReceipt(true);
      toast({ title: "Payment Saved Offline", description: "It will be synced when you're back online." });
      setSelectedStallId("");
      setPaymentMethod("cash");
      setReferenceNumber("");
      return;
    }

    // --- ONLINE LOGIC ---
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
    let smsFailed = false; // Flag to track SMS status

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
        .select("id, last_payment, next_due, status, rental_type, contact")
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

      // If no next due date is found (e.g. new stall or missing data), start from today
      if (!nextEligibleDate) {
        nextEligibleDate = new Date(todayStart);
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

      let finalNotes = paymentData.notes || "";
      if (paymentMethod !== 'cash') {
        const methodLabel = paymentMethod === 'gcash' ? 'GCash' : 'Maya';
        const refInfo = referenceNumber ? ` (Ref: ${referenceNumber})` : '';
        const prefix = finalNotes ? '\n' : '';
        finalNotes = `${finalNotes}${prefix}Paid via ${methodLabel}${refInfo}`;
      }

      const totalAmount = Number(paymentData.amount);
      const perInvoiceAmount = Math.floor((totalAmount / loopCount) * 100) / 100;
      const remainder = totalAmount - (perInvoiceAmount * loopCount);

      const invoicesToInsert = [];
      for (let i = 0; i < loopCount; i++) {
        const invoiceDate = new Date(nextEligibleDate!);
        if (rentalTypeFromDb === 'daily') {
            invoiceDate.setDate(invoiceDate.getDate() + i);
        } else {
            invoiceDate.setMonth(invoiceDate.getMonth() + i);
        }
        const amount = i === 0 ? perInvoiceAmount + remainder : perInvoiceAmount;
        const uniqueReceiptNo = loopCount > 1 ? `${currentReceiptNo}-${i + 1}` : currentReceiptNo;

        invoicesToInsert.push({
          vendor_id: stallDbId,
          vendor_name: selectedStall.vendor || "No vendor",
          stall_name: stallLabel,
          stall_type: selectedStall.type,
          amount: amount,
          payment_type: paymentType,
          notes: finalNotes || null,
          due_date: invoiceDate.toISOString().split("T")[0],
          status: "paid",
          paid_at: paymentTimestamp.toISOString(),
          receipt_number: uniqueReceiptNo,
          collector_id: collectorId,
          collector_name: collectorName,
        });
      }

      const { error: invoiceError } = await supabase.from("invoices").insert(invoicesToInsert);



      // Log Activity
      await supabase.from("activity_logs").insert({
        user_id: collectorId,
        user_name: collectorName,
        action: "COLLECT_PAYMENT",
        details: `Collected PHP ${paymentData.amount} from ${stallLabel}`
      });

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

    // -----------------------------
    // SEND SMS RECEIPT VIA SMS GATEWAY
    // -----------------------------
    if (latestStall?.contact) {
      try {
        const { data, error } = await supabase.functions.invoke(
          "send-sms-receipt",
          {
            body: {
              receiptNumber: currentReceiptNo,
            },
          }
        );

        if (error) {
          console.error("SMS Function Error:", error);
          smsFailed = true;
        } else if (!data?.success) {
          console.warn("SMS failed response:", data);
          smsFailed = true;
        } else {
          console.log("SMS sent successfully");
        }
      } catch (err) {
        console.error("Unexpected SMS exception:", err);
        smsFailed = true; // Set flag on failure
      }
    }

    // Continue with updating next due, receipt, and toast
    // Start from the date we just paid off (nextEligibleDate)
    let nextDueDate = new Date(nextEligibleDate!);

    if (selectedStall.rentalType === "daily") {
      nextDueDate.setDate(nextDueDate.getDate() + loopCount);
    } else {
      nextDueDate.setMonth(nextDueDate.getMonth() + loopCount);
      // Preserve the original due day (e.g., 15th) if available
      if (selectedStall.nextDue) {
        const oldDue = new Date(selectedStall.nextDue);
        if (!isNaN(oldDue.getTime())) {
          nextDueDate.setDate(oldDue.getDate());
        }
      }
    }

    // ✅ FIX: Use local date components to avoid timezone shifts (toISOString uses UTC)
    const year = nextDueDate.getFullYear();
    const month = String(nextDueDate.getMonth() + 1).padStart(2, "0");
    const day = String(nextDueDate.getDate()).padStart(2, "0");
    const nextDueDateString = `${year}-${month}-${day}`;

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

    setReceiptNo(currentReceiptNo);
    setReceiptContext({
      stallLabel,
      vendor: selectedStall.vendor || "No vendor",
      amount: paymentData.amount,
      paymentType,
      paymentDate: paymentTimestamp.toLocaleString(),
      paymentMethod: paymentMethod === 'cash' ? 'Cash' : (paymentMethod === 'gcash' ? 'GCash' : 'Maya'),
      referenceNumber,
      paymentPeriod: paymentPeriod || undefined,
      duration: dur,

    });
    setShowReceipt(true);
    toast({
      title: "Payment recorded",
      description: `PHP ${paymentData.amount} saved for ${selectedStall.vendor || "No vendor"}. ${
        smsFailed ? "Warning: SMS receipt could not be sent." : ""
      }`,
    });
    setSelectedStallId(""); // Reset selected stall
    setPaymentMethod("cash");
    setReferenceNumber("");
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
  if (showReceipt && receiptContext) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowReceipt(false);
              setReceiptContext(null);
              setSelectedStallId("");
            }}
          >
            &lt; Back
          </Button>
          <h1 className="text-2xl font-bold">Payment Receipt</h1>
        </div>

        <div id="receipt-content">
          <Card className="mx-auto w-[300px] text-sm p-2">
            <CardHeader className="text-center space-y-2">
              <img src="/logo.png" alt="Sibulan Market Pay Logo" className="mx-auto h-16 w-16" />
              <CardTitle className="text-base font-semibold">PAYMENT RECEIPT</CardTitle>
              {receiptContext.isOffline && (
                <Badge variant="destructive" className="w-fit mx-auto">
                  OFFLINE - NOT SYNCED
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold">PHP {receiptContext.amount}</div>
                <div>Receipt No: {receiptNo}</div>
              </div>
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Vendor:</span>
                  <span className="font-medium">{receiptContext.vendor}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stall:</span>
                  <span className="font-medium">{receiptContext.stallLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">PHP {receiptContext.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Type:</span>
                  <span className="font-medium">{receiptContext.paymentType}</span>
                </div>
                {receiptContext.paymentPeriod && (
                  <div className="flex justify-between font-semibold text-primary bg-primary/10 p-2 rounded-md my-1">
                    <span>Period Covered:</span>
                    <span>
                      {format(receiptContext.paymentPeriod.start, "MMM d")} - {format(receiptContext.paymentPeriod.end, "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Method:</span>
                  <span className="font-medium uppercase">{receiptContext.paymentMethod}</span>
                </div>
                {receiptContext.referenceNumber && (
                  <div className="flex justify-between">
                    <span>Ref No:</span>
                    <span className="font-medium">{receiptContext.referenceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{receiptContext.paymentDate}</span>
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
        <Button className="w-full mt-2" variant="default" onClick={() => setShowReceipt(false)}>
          Done
        </Button>
      </div>
    );
  }



  /* ----------------------------------------------------------
     ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¾ PAYMENT FORM
  ---------------------------------------------------------- */
  
  // Block access if collector is unassigned
  if (userRole === 'collector' && (!userSection || userSection === 'unassigned')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 p-6 animate-in fade-in zoom-in duration-300">
        <div className="bg-destructive/10 p-6 rounded-full shadow-sm">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-destructive">Access Revoked</h2>
          <p className="text-xl font-medium text-foreground">
            You have been unassigned.
          </p>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your section assignment has been removed by an administrator. You cannot collect payments until you are reassigned.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Payment Collection</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isOnline ? "default" : "destructive"} className="gap-1.5 pl-2 pr-2.5">
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isOnline ? "Online" : "Offline"}
            </Badge>
            {userSection && (
              <Badge variant="secondary">
                {userSection}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {!isOnline && (
        <Card className="bg-amber-50 border-amber-200 text-amber-900">
          <CardContent className="pt-6 text-sm font-medium">
            You are currently offline. Payments will be saved locally and synced automatically when you're back online.
          </CardContent>
        </Card>
      )}

      {offlineQueueCount > 0 && (
        <Card>
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm font-medium text-center sm:text-left">
              <span className="font-bold text-primary">{offlineQueueCount}</span> payment(s) waiting to be synced.
            </p>
            <Button onClick={syncOfflinePayments} disabled={!isOnline || isSyncing} size="sm">
              {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          </CardContent>
        </Card>
      )}

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
                        return (
                          <SelectItem key={stall.id} value={stall.id}>
                            {stall.name} - {stall.vendor || "No vendor"}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}

                  {nonCollectableStalls.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Already Settled</SelectLabel>
                      {nonCollectableStalls.map((stall) => {
                        const nextDueLabel = formatDateForDisplay(stall.nextDue);
                        return (
                          <SelectItem key={stall.id} value={stall.id} disabled>
                            {stall.name} - Next due {nextDueLabel}
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
              {paymentPeriod && (
                <div className="font-medium text-primary bg-primary/10 p-2 rounded-md mt-2">
                  <strong>Paying for:</strong> {format(paymentPeriod.start, "MMM d")} - {format(paymentPeriod.end, "MMM d, yyyy")} ({duration} {Number(duration) === 1 ? 'day' : 'days'})
                </div>
              )}
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
            
            {/* Payment Method Buttons */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                  className="w-full"
                >
                  Cash
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "gcash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("gcash")}
                  className={`w-full ${
                    paymentMethod === "gcash" 
                      ? "bg-blue-600 hover:bg-blue-700 text-white border-transparent" 
                      : "text-blue-600 border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  GCash
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "maya" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("maya")}
                  className={`w-full ${
                    paymentMethod === "maya" 
                      ? "bg-green-600 hover:bg-green-700 text-white border-transparent" 
                      : "text-green-600 border-green-200 hover:bg-green-50"
                  }`}
                >
                  Maya
                </Button>
              </div>
            </div>

            {paymentMethod !== "cash" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <Label htmlFor="ref-no">Reference Number</Label>
                <Input
                  id="ref-no"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder={`Last digits of ${paymentMethod === 'gcash' ? 'GCash' : 'Maya'} Ref No.`}
                />
              </div>
            )}

            {selectedStall && selectedStall.rentalType === 'daily' && (
              <div className="animate-in fade-in slide-in-from-top-1">
                <Label htmlFor="duration">Number of Days</Label>
                <Input
                  id="duration"
                  type="number"
                  min={0}
                  max={365}
                  value={duration}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") setDuration("");
                    else setDuration(parseInt(val));
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setDuration(7)} className="flex-1">1 Week</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDuration(30)} className="flex-1">1 Month</Button>
                </div>
              </div>
            )}

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
            disabled={!selectedStall || !paymentData.amount || loading || userRole === 'admin'}
          >
            {userRole === 'admin' ? "Admins Cannot Collect Payments" : (loading ? "Saving..." : "Record Payment")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
