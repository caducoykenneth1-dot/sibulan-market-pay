supabase/functions/send-sms-receipt/index.ts
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
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { contactNumber, amount, stallName } = await req.json();

    if (!contactNumber || !amount || !stallName) {
      throw new Error("Missing required fields.");
    }

    // Format mobile number to 639xxxxxxxxx
    let recipient = contactNumber.toString().trim();

    if (recipient.startsWith("09")) {
      recipient = "63" + recipient.substring(1);
    } else if (recipient.startsWith("9") && recipient.length === 10) {
      recipient = "63" + recipient;
    } else if (recipient.startsWith("63")) {
      // already correct
    } else {
      throw new Error("Invalid phone number format.");
    }

    const payload = {
      recipients: [recipient], // array format required by PhilSMS
      message: `Thank you! Payment received for ${stallName}. Amount: PHP ${amount}.`,
      sender_id: "MARKET",
    };

    const response = await fetch("https://app.philsms.com/api/v3/sms/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PHILSMS_API_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Log response for debugging
    console.log("PhilSMS Response Status:", response.status);
    console.log("PhilSMS Response Data:", JSON.stringify(data));

    // Check if the API returned an error
    if (!response.ok || data.status === 0 || data.error) {
      const errorMsg = data.message || data.error || `PhilSMS API returned status ${response.status}`;
      throw new Error(`PhilSMS API Error: ${errorMsg}`);
    }

    return new Response(JSON.stringify({ success: true, data, message: "SMS sent successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
