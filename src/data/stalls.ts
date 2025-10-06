import { supabase } from "@/lib/supabaseClient";

export type StallStatus = "current" | "due" | "overdue" | "vacant";

export interface StallRecord {
  id: string;           // local identifier like "stall-3"
  dbId: number;         // Supabase ID (numeric)
  name: string;
  vendor: string;
  contact: string;
  type: string;
  monthlyRent: number;
  lastPayment: string;
  nextDue: string;
  status: StallStatus;
  occupied: boolean;
}

export const BASE_TYPE_OPTIONS = [
  "Vegetables",
  "Fish",
  "Meat",
  "Rice",
  "Grocery",
  "Clothing",
  "Others",
];

/* ----------------------------------------------------------
   CREATE STALL
---------------------------------------------------------- */
export async function createStall(stallData: Partial<StallRecord>) {
  const { data, error } = await supabase
    .from("vendors") // ✅ correct table name
    .insert([
      {
        vendor: stallData.vendor || null,
        contact: stallData.contact || null,
        type: stallData.type || null,
        monthly_rent: stallData.monthlyRent || 0,
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
  if (updatedData.monthlyRent !== undefined) payload.monthly_rent = updatedData.monthlyRent;
  if (updatedData.lastPayment !== undefined) payload.last_payment = updatedData.lastPayment;
  if (updatedData.nextDue !== undefined) payload.next_due = updatedData.nextDue;
  if (updatedData.status !== undefined) payload.status = updatedData.status;

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
    .from("vendors") // ✅ correct table name
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
