export const config = {
  verify_jwt: false,
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMS_GATEWAY_API_KEY = Deno.env.get("SMS_GATEWAY_API_KEY") || "";
const SMS_GATEWAY_URL = "https://api.smstext.app/push";

serve(async (req) => {
  console.log("🔥 FUNCTION HIT", req.method);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ message: "Phone is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ NORMALIZE PHONE FIRST (THIS FIXES YOUR ERROR)
    const formattedPhone = phone.startsWith("09")
      ? "+63" + phone.slice(1)
      : phone;

    console.log("📱 Phone:", formattedPhone);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find user
    const { data, error: listError } = await supabase.auth.admin.listUsers({ per_page: 1000 });

    if (listError) {
      throw listError;
    }

    const user = data.users.find(
      (u) => u.user_metadata?.phone === formattedPhone || u.phone === formattedPhone
    );

    // Silent success if user not found
    if (!user) {
      console.log("ℹ️ User not found (silent)");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Simple hash (safe for now)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(otp)
    );
    const codeHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ✅ STORE OTP
    const { error: insertError } = await supabase
      .from("password_reset_codes")
      .insert({
        phone: formattedPhone,
        user_id: user.id,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("❌ Failed to store OTP:", insertError);
      throw insertError;
    }

    console.log("✅ OTP STORED:", otp);

    // TODO: SEND SMS HERE (NEXT STEP)
    // ✅ SEND SMS
    if (SMS_GATEWAY_API_KEY) {
      console.log("🔑 API Key loaded, length:", SMS_GATEWAY_API_KEY.length);

      // Documentation example uses +1234567890, so we keep the + from formattedPhone
      const mobile = formattedPhone;
      const message = `Your Sibulan Market Pay reset code is: ${otp}. Valid for 5 minutes.`;
      
      console.log("ℹ️ Using SMS Gateway (smstext.app).");
      
      let headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Handle JWT (Bearer) vs UUID (Basic)
      if (SMS_GATEWAY_API_KEY.length > 60) {
        console.log("⚠️ Long API Key detected. Attempting Bearer Auth.");
        headers["Authorization"] = `Bearer ${SMS_GATEWAY_API_KEY}`;
      } else {
        const auth = btoa(`apikey:${SMS_GATEWAY_API_KEY}`);
        headers["Authorization"] = `Basic ${auth}`;
      }

      const bodyStr = JSON.stringify([{ mobile: mobile, text: message }]);

      const smsRes = await fetch(SMS_GATEWAY_URL, {
        method: "POST",
        headers: headers,
        body: bodyStr,
      });

      console.log("📡 SMS Response Status:", smsRes.status, smsRes.statusText);
      const responseText = await smsRes.text();
      console.log("📄 SMS Provider Response:", responseText);
      
      if (!smsRes.ok) {
        console.error("❌ SMS Gateway Error Body:", responseText || "(Empty response body)");
        console.error("Request Payload:", bodyStr);
      }
    } else {
      console.warn("⚠️ SMS_GATEWAY_API_KEY is missing. SMS was not sent.");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("🔥 FUNCTION ERROR:", err);
    return new Response(
      JSON.stringify({ message: err.message || "Internal error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
