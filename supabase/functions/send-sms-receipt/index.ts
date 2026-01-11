import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMS_GATEWAY_API_KEY = Deno.env.get("SMS_GATEWAY_API_KEY")!;
const SMS_GATEWAY_URL = "https://api.smstext.app/push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const auth = btoa(`apikey:${SMS_GATEWAY_API_KEY}`);

  const res = await fetch(SMS_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ mobile: phone, text: message }]),
  });

  return res.ok;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone);
    const reference = body.receiptNumber;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Idempotency check
    const { data: existing } = await supabase
      .from("sms_logs")
      .select("id")
      .eq("reference", reference)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, message: "Receipt already sent." }),
        { status: 200, headers: corsHeaders }
      );
    }

    const message = `Payment received: PHP ${body.amount.toFixed(
      2
    )}. Receipt ${reference}. Thank you.`;

    await sendSMS(phone, message);

    await supabase.from("sms_logs").insert({
      phone,
      message,
      type: "receipt",
      reference,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Receipt sent." }),
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
