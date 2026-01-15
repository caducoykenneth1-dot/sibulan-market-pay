import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export const config = {
  verify_jwt: false, // Public function (OTP-based)
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Normalize PH phone numbers to +639XXXXXXXXX
 */
function normalizePhone(phone: string): string {
  const clean = phone.replace(/\s+/g, "");

  if (clean.startsWith("+63")) return clean;
  if (clean.startsWith("63")) return "+" + clean;
  if (clean.startsWith("09")) return "+63" + clean.slice(1);

  return clean;
}

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { phone, code, newPassword } = await req.json();

    if (!phone || !code || !newPassword) {
      return new Response(
        JSON.stringify({
          error: "Phone, code, and new password are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters long",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formattedPhone = normalizePhone(phone);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /**
     * 🔐 Hash the OTP (SHA-256)
     */
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(code)
    );

    const codeHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    /**
     * 🔍 Find valid OTP record
     */
    const { data: otpRecord, error: otpError } = await supabase
      .from("password_reset_codes")
      .select("*")
      .eq("phone", formattedPhone)
      .eq("code_hash", codeHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /**
     * 🔄 Update user password
     */
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(
        otpRecord.user_id,
        { password: newPassword }
      );

    if (updateError) {
      throw updateError;
    }

    /**
     * 🧹 Delete OTP to prevent replay
     */
    await supabase
      .from("password_reset_codes")
      .delete()
      .eq("id", otpRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password updated successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("VERIFY RESET OTP ERROR:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Internal Server Error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
