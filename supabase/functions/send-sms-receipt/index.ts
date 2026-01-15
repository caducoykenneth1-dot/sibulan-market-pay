export const config = {
  verify_jwt: true, // 🔐 REQUIRED for receipts
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMS_GATEWAY_API_KEY = Deno.env.get("SMS_GATEWAY_API_KEY")!;
const SMS_GATEWAY_URL = "https://api.smstext.app/push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Normalize PH mobile numbers to +639XXXXXXXXX
 */
function normalizePhone(phone: string): string {
  const clean = phone.replace(/\s+/g, "");

  if (clean.startsWith("+63")) return clean;
  if (clean.startsWith("63")) return "+" + clean;
  if (clean.startsWith("09")) return "+63" + clean.slice(1);

  return clean;
}

/**
 * Send SMS via smstext.app
 */
async function sendSMS(phone: string, message: string): Promise<boolean> {
  const auth = btoa(`apikey:${SMS_GATEWAY_API_KEY}`);

  const res = await fetch(SMS_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        mobile: phone,
        text: message,
      },
    ]),
  });

  return res.ok;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { receiptNumber } = await req.json();

    if (!receiptNumber) {
      return new Response(
        JSON.stringify({ success: false, message: "Receipt number required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    // 🔁 Prevent duplicate SMS
    const { data: existing } = await supabase
      .from("sms_logs")
      .select("id")
      .eq("reference", receiptNumber)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, message: "Receipt already sent." }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 🔐 Load receipt details from DB
    const { data: txn, error: txnError } = await supabase
      .from("transactions")
      .select("amount, phone, receipt_number")
      .eq("receipt_number", receiptNumber)
      .single();

    if (txnError || !txn) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid receipt" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const phone = normalizePhone(txn.phone);
    const message = `Sibulan Market Pay\nReceipt ${txn.receipt_number}\nAmount: PHP ${txn.amount.toFixed(
      2
    )}\nThank you.`;

    // 📡 Send SMS
    const sent = await sendSMS(phone, message);

    if (!sent) {
      return new Response(
        JSON.stringify({ success: false, message: "SMS gateway failed" }),
        { status: 502, headers: corsHeaders }
      );
    }

    // 🧾 Log SMS
    await supabase.from("sms_logs").insert({
      phone,
      message,
      type: "receipt",
      reference: receiptNumber,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Receipt sent." }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("SMS Receipt Error:", err);

    return new Response(
      JSON.stringify({ success: false, message: "Server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}
