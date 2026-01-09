// supabase/functions/send-sms-receipt/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PHILSMS_API_TOKEN = Deno.env.get("PHILSMS_API_TOKEN");


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { contactNumber, amount, stallName } = await req.json();

    if (!contactNumber || !amount || !stallName) {
      throw new Error("Missing required fields.");
    }

    // Format number to 639XXXXXXXXX
    let recipient = contactNumber.toString().trim();
    if (recipient.startsWith("09")) recipient = "63" + recipient.substring(1);
    else if (recipient.startsWith("9") && recipient.length === 10) recipient = "63" + recipient;
    else if (recipient.startsWith("63")) recipient = recipient;
    else throw new Error("Invalid phone number format.");

    const payload = {
      recipients: [recipient],
      message: `Thank you! Payment received for ${stallName}. Amount: PHP ${amount}.`,
      sender_id: "MARKET", // make sure this is approved
    };

    console.log("Sending SMS with payload:", payload);

    const response = await fetch("https://app.philsms.com/api/v3/sms/send", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${PHILSMS_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});


    console.log("PhilSMS response status:", response.status);
    const responseText = await response.text();
    console.log("PhilSMS response body:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("SMS Function Error:", err);
    return new Response(JSON.stringify({ error: true, message: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
