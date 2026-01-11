export const config = {
  verify_jwt: false,
};

import { serve } from "https://deno.land/std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // ✅ Get API key
    const apiKey = Deno.env.get("SMS_GATEWAY_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SMS API key not set" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const auth = btoa(`apikey:${apiKey}`);

    // ✅ Send SMS
    const smsResponse = await fetch("https://api.smstext.app/push", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          mobile: phone,
          text: `Your OTP code is ${otp}`,
        },
      ]),
    });

    const smsResult = await smsResponse.text();

    if (!smsResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "SMS gateway failed",
          details: smsResult,
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        otp_sent: true,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
