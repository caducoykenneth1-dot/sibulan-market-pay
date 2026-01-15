// supabase/functions/send-reset-otp/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = {
  verify_jwt: false,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMS_GATEWAY_URL = "https://api.smstext.app/push";
const SMS_GATEWAY_API_KEY = Deno.env.get("SMS_GATEWAY_API_KEY")!;

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ message: "Phone is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Normalize PH phone
    const normalizedPhone = phone.startsWith("09")
      ? "63" + phone.slice(1)
      : phone.replace(/\D/g, "");

    console.log("📞 NORMALIZED PHONE:", normalizedPhone);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ✅ Find user by phone
    const { data: users } = await supabase.auth.admin.listUsers({ per_page: 1000 });

    const user = users?.users.find(
      (u) =>
        u.phone === `+${normalizedPhone}` ||
        u.user_metadata?.phone === `+${normalizedPhone}`
    );

    // Silent success (security)
    if (!user) {
      console.log("ℹ️ User not found — silent exit");
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Hash OTP
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(otp)
    );

    const codeHash = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Store OTP
    await supabase.from("password_reset_codes").insert({
      phone: `+${normalizedPhone}`,
      user_id: user.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });

    console.log("✅ OTP STORED");

    // ✅ SEND SMS (Bearer Token — FIXED)
    const payload = [
      {
        mobile: normalizedPhone,
        text: `Sibulan Market Pay\nReset code: ${otp}\nValid for 5 minutes.\nDo not share this code.`,
      },
    ];

    console.log("📨 SMS PAYLOAD:", JSON.stringify(payload));

    const smsRes = await fetch(SMS_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SMS_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const smsText = await smsRes.text();

    console.log("📡 SMS STATUS:", smsRes.status);
    console.log("📄 SMS RESPONSE:", smsText);

    if (!smsRes.ok) {
      console.error("❌ SMS SEND FAILED");
      return new Response(
        JSON.stringify({ success: false, message: "SMS failed" }),
        { status: 502, headers: corsHeaders }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error("🔥 FUNCTION ERROR:", err);
    return new Response(
      JSON.stringify({ message: err.message || "Internal error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
