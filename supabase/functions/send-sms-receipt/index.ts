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

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const { contactNumber, amount, stallName } = await req.json();

    if (!contactNumber || !amount || !stallName) {
      throw new Error("Missing required fields.");
    }

    const response = await fetch("https://app.philsms.com/api/v3/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PHILSMS_API_TOKEN}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({
        recipient: contactNumber.replace(/^0/, "63"), // 09XXXX -> 639XXXX
        sender_id: "MyApp",
        type: "plain",
        message: `Thank you for your payment! Your rent for ${stallName} amounting to PHP ${amount} has been received.`,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
