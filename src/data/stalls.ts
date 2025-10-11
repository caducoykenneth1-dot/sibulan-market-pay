import { supabase } from "@/lib/supabaseClient";

export type StallStatus = "current" | "due" | "overdue" | "vacant" | "archived";

export interface StallRecord {
  id: string;           // local identifier like "stall-3"
  dbId: number;         // Supabase ID (numeric)
  name: string;
  vendor: string;
  contact: string;
  type: string;
  rentAmount: number;
  rentalType: 'monthly' | 'daily';
  lastPayment: string;
  nextDue: string;
  status: StallStatus;
  occupied: boolean;
  archive_reason?: string;
}

export interface StallTypeInfo {
  name: string;
  section: 'Dry Section' | 'Wet Section';
}

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const normalizeRawStatus = (status: string | StallStatus | null | undefined): StallStatus | null => {
  if (!status) return null;
  const normalized = status.toString().trim().toLowerCase();
  switch (normalized) {
    case "current":
    case "due":
    case "overdue":
    case "vacant":
    case "archived":
      return normalized as StallStatus;
    default:
      return null;
  }
};

const normalizeDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const computeStatusFromDueDate = (
  nextDue: string | null | undefined,
  currentStatus: string | StallStatus | null | undefined,
  todayOverride?: Date,
  rentalType?: "daily" | "monthly"
): StallStatus => {
  const normalizedStatus = normalizeRawStatus(currentStatus);
  if (normalizedStatus === "vacant" || normalizedStatus === "archived") {
    return normalizedStatus;
  }

  const dueDate = normalizeDate(nextDue);
  if (!dueDate) return "vacant";

  const today = todayOverride ? new Date(todayOverride) : new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / DAY_IN_MS);

  // ✅ Daily rentals are "current" until the next day has fully passed
  if (rentalType === "daily") {
    if (diffDays < 0) return "overdue";
    return "current";
  }

  // ✅ Monthly logic (normal behavior)
  if (diffTime < 0) return "overdue";
  return diffDays === 0 ? "due" : "current";
};



const unsortedStallTypes: StallTypeInfo[] = [
  { name: "Type 1A (Dried Fish)", section: "Dry Section" },
  { name: "Type 2B (Mixed Section)", section: "Dry Section" },
  { name: "Type 2 (Groceries)", section: "Dry Section" },
  { name: "Type 3 (Groceries)", section: "Dry Section" },
  { name: "Type 4 (Mixed Section)", section: "Dry Section" },
  { name: "Type 5 (Mixed Section)", section: "Dry Section" },
  { name: "Upper Floor Stall (Dry Goods)", section: "Dry Section" },
  { name: "Upper Floor Stall (Big)", section: "Dry Section" },
  { name: "Old Concrete Stalls", section: "Dry Section" },
  { name: "Fish Section", section: "Wet Section" },
  { name: "Meat Section", section: "Wet Section" },
  { name: "Chicken Section", section: "Wet Section" },
  { name: "Vegetables & Fruits", section: "Wet Section" },
];

export const STALL_TYPES: StallTypeInfo[] = [...unsortedStallTypes].sort((a, b) =>
  a.name.localeCompare(b.name)
);

// This is now deprecated but kept for backward compatibility with filter logic.
export const BASE_TYPE_OPTIONS = STALL_TYPES.map(t => t.name);

/* ----------------------------------------------------------
   CREATE STALL
---------------------------------------------------------- */
export async function createStall(stallData: Partial<StallRecord>) {
  const { data, error } = await supabase
    .from("vendors")
    .insert([
      {
        vendor: stallData.vendor || null,
        contact: stallData.contact || null,
        type: stallData.type || null,
        monthly_rent: stallData.rentAmount || 0,
        rental_type: stallData.rentalType || 'monthly',
        last_payment: stallData.lastPayment || null,
        next_due: stallData.nextDue || null,
        status: stallData.status || "vacant",
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------
   UPDATE STALL (safe version)
---------------------------------------------------------- */
export async function updateStall(id: number, updatedData: Partial<StallRecord>) {
  const payload: Record<string, any> = {};

  if (updatedData.vendor !== undefined) payload.vendor = updatedData.vendor;
  if (updatedData.contact !== undefined) payload.contact = updatedData.contact;
  if (updatedData.type !== undefined) payload.type = updatedData.type;
  if (updatedData.rentAmount !== undefined) payload.monthly_rent = updatedData.rentAmount;
  if (updatedData.rentalType !== undefined) payload.rental_type = updatedData.rentalType;
  if (updatedData.lastPayment !== undefined) payload.last_payment = updatedData.lastPayment;
  if (updatedData.nextDue !== undefined) payload.next_due = updatedData.nextDue;
  if (updatedData.status !== undefined) payload.status = updatedData.status;
  if (updatedData.archive_reason !== undefined) payload.archive_reason = updatedData.archive_reason;

  const { data, error } = await supabase
    .from("vendors")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------
   DELETE STALL
---------------------------------------------------------- */
export async function deleteStall(id: number) {
  const { data, error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------
   HELPER: GET NEXT STALL NUMBERS
---------------------------------------------------------- */
export function getNextStallNumbers(stalls: StallRecord[], type: string) {
  const sameType = stalls.filter((stall) => stall.type === type);
  const nextIdNumber =
    sameType.length > 0
      ? Math.max(...sameType.map((s) => Number(s.id.replace("stall-", "")) || 0)) + 1
      : 1;
  const nextNameNumber = sameType.length + 1;
  return { nextIdNumber, nextNameNumber };
}

/* ----------------------------------------------------------
   HELPER: TYPE-BASED SEQUENCES
---------------------------------------------------------- */
export function getNextTypeSequence(
  counters: Map<string, number>,
  rawType: string | null | undefined
) {
  const typeValue = typeof rawType === "string" ? rawType.trim() : "";
  const key = typeValue.toLowerCase() || "uncategorised";
  const sequence = (counters.get(key) ?? 0) + 1;
  counters.set(key, sequence);
  return { sequence, typeValue };
}
