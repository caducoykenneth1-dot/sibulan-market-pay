import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function hashOTP(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { phone, code, newPassword } = await req.json();
    const normalizedPhone = phone.replace(/\D/g, "");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: reset } = await supabase
      .from("password_reset_codes")
      .select("*")
      .eq("phone", normalizedPhone)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!reset) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid or expired code." }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (new Date(reset.expires_at) < new Date() || reset.attempts >= 3) {
      return new Response(
        JSON.stringify({ success: false, message: "Code expired or locked." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const hashedInput = await hashOTP(code);
    if (hashedInput !== reset.code_hash) {
      await supabase
        .from("password_reset_codes")
        .update({ attempts: reset.attempts + 1 })
        .eq("id", reset.id);

      return new Response(
        JSON.stringify({ success: false, message: "Incorrect code." }),
        { status: 400, headers: corsHeaders }
      );
    }

    await supabase.auth.admin.updateUserById(reset.user_id, {
      password: newPassword,
    });

    await supabase
      .from("password_reset_codes")
      .update({ used: true })
      .eq("id", reset.id);

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully." }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, message: "Server error." }),
      { status: 500, headers: corsHeaders }
    );
  }
}
