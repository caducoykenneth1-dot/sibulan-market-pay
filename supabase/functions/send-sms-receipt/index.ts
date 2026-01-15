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
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("amount, vendor_name, receipt_number")
      .eq("receipt_number", receiptNumber)
      .single();

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
Amount: PHP ${invoice.amount}
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
