// supabase/functions/verify-reset-otp/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = { verify_jwt: false };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, code, newPassword } = await req.json();

    if (!phone || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const formattedPhone = phone.startsWith("09")
      ? "+63" + phone.slice(1)
      : phone;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Hash entered OTP
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(code)
    );
    const codeHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Find latest valid OTP
    const { data: otp, error } = await supabase
      .from("password_reset_codes")
      .select("*")
      .eq("phone", formattedPhone)
      .eq("code_hash", codeHash)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !otp) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired code" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Increment attempts
    await supabase
      .from("password_reset_codes")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);

    if (otp.attempts >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts" }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Update password
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(otp.user_id, {
        password: newPassword,
      });

    if (updateError) throw updateError;

    // Mark OTP as used
    await supabase
      .from("password_reset_codes")
      .update({ used: true })
      .eq("id", otp.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
