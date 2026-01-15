export const config = {
  verify_jwt: false,
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1️⃣ Parse body safely
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ message: "Invalid JSON body" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const phone = body?.phone;
    if (!phone) {
      return new Response(
        JSON.stringify({ message: "Phone is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 2️⃣ Normalize phone (PH)
    const clean = phone.replace(/\D/g, "");
    const formattedPhone =
      clean.startsWith("63")
        ? clean
        : clean.startsWith("09")
        ? "63" + clean.slice(1)
        : clean;

    // 3️⃣ Init Supabase (SERVICE ROLE)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4️⃣ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 5️⃣ Hash OTP
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(otp)
    );
    const codeHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 6️⃣ Store OTP (user lookup optional, OTP still valid)
    await supabase.from("password_reset_codes").insert({
      phone: formattedPhone,
      user_id: "00000000-0000-0000-0000-000000000000", // placeholder OK
      code_hash: codeHash,
      expires_at: expiresAt,
    });

    console.log("✅ OTP GENERATED:", otp);

    // 7️⃣ Send SMS via IPROG (BEST-EFFORT ONLY)
    try {
      const smsRes = await fetch(
        "https://www.iprogsms.com/api/v1/sms_messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_token: Deno.env.get("IPROG_API_KEY"),
            phone_number: formattedPhone,
            message: `
              Reset code: ${otp}
              Valid for 5 minutes.
              Do not share this code.`,
          }),
        }
      );

      const smsResult = await smsRes.json();
      console.log("📨 IPROG SMS RESULT:", smsResult);
    } catch (smsErr) {
      console.warn("⚠️ SMS failed, OTP still valid:", smsErr);
    }

    // 8️⃣ ALWAYS return success
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("❌ SEND RESET OTP ERROR:", err);

    return new Response(
      JSON.stringify({ message: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
