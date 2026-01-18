export const config = {
  verify_jwt: false,
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const receiptNumber = body?.receiptNumber;

    if (!receiptNumber) {
      return new Response(
        JSON.stringify({ success: false, message: "receiptNumber required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 🔎 Get invoice details
    // First try exact match (single payment)
    let { data: invoice, error } = await supabase
      .from("invoices")
      .select("amount, vendor_name, receipt_number, stall_name, payment_type, paid_at")
      .eq("receipt_number", receiptNumber)
      .maybeSingle();

    // If not found, try to find as a bulk payment (suffix pattern)
    if (!invoice && !error) {
       const { data: bulkInvoices, error: bulkError } = await supabase
         .from("invoices")
         .select("amount, vendor_name, receipt_number, stall_name, payment_type, paid_at")
         .like("receipt_number", `${receiptNumber}-%`);
       
       if (bulkInvoices && bulkInvoices.length > 0) {
          // Aggregate amount
          const totalAmount = bulkInvoices.reduce((sum: number, inv: any) => sum + inv.amount, 0);
          // Use the first invoice for metadata
          invoice = { ...bulkInvoices[0], amount: totalAmount };
       } else if (bulkError) {
          error = bulkError;
       }
    }

    if (error || !invoice) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid receipt" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 📞 Get vendor phone
    const { data: vendor } = await supabase
      .from("vendors")
      .select("contact")
      .eq("vendor", invoice.vendor_name)
      .single();

    if (!vendor?.contact) {
      return new Response(
        JSON.stringify({ success: false, message: "No contact number" }),
        { status: 200, headers: corsHeaders }
      );
    }

    const phone = vendor.contact.replace(/\D/g, "");

    // Format date (YYYY-MM-DD)
    const dateStr = invoice.paid_at ? invoice.paid_at.split("T")[0] : new Date().toISOString().split("T")[0];

    // 📩 Send SMS via IPROG
    const smsRes = await fetch(
      "https://www.iprogsms.com/api/v1/sms_messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: Deno.env.get("IPROG_API_KEY"),
          phone_number: phone,
          message: `
Receipt: ${receiptNumber}
SIBULAN MARKET PAY
Payment Received

Stall: ${invoice.stall_name}
Type: ${invoice.payment_type}
Amount: PHP ${invoice.amount}
Ref: ${receiptNumber}
Date: ${dateStr}

Thank you.`,
        }),
      }
    );

    const smsResult = await smsRes.json();
    console.log("IPROG RESPONSE:", smsResult);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("SMS RECEIPT ERROR:", err);
    return new Response(
      JSON.stringify({ success: false }),
      { status: 500, headers: corsHeaders }
    );
  }
});
