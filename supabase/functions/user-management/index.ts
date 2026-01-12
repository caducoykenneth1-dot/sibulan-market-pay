import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = {
  verify_jwt: true,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

serve(async (req: Request) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    /* ======================================================
       1️⃣ VERIFY CALLER (JWT + ADMIN ROLE)
    ====================================================== */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ message: "Missing Authorization header" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user || user.user_metadata?.role !== "admin") {
      return new Response(
        JSON.stringify({ message: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    /* ======================================================
       2️⃣ SERVICE ROLE CLIENT (ADMIN ACTIONS ONLY)
    ====================================================== */
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);

    /* ======================================================
       LIST USERS (GET)
    ====================================================== */
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) throw error;

      // Hide admins
      const collectorsOnly = data.users.filter(
        (u) => u.user_metadata?.role !== "admin"
      );

      return new Response(
        JSON.stringify({ users: collectorsOnly }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ======================================================
       CREATE USER (POST)
    ====================================================== */
    if (req.method === "POST") {
      const {
        email,
        password,
        full_name,
        role = "collector",
        market,
        phone,
        address,
      } = await req.json();

      if (!email || !password || !phone) {
        return new Response(
          JSON.stringify({ message: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Normalize phone → +63
      const formattedPhone = phone.startsWith("09")
        ? "+63" + phone.slice(1)
        : phone;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
          market,
          phone: formattedPhone,
          address,
        },
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, user: data.user }),
        { status: 201, headers: corsHeaders }
      );
    }

    /* ======================================================
       UPDATE USER (PATCH)
    ====================================================== */
    if (req.method === "PATCH") {
      const { user_id, ...updates } = await req.json();

      if (!user_id) {
        return new Response(
          JSON.stringify({ message: "user_id required" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: updates,
      });

      if (error) throw error;

      // Optional notification
      const messages: string[] = [];
      if (updates.role) messages.push(`Role updated to ${updates.role}`);
      if (updates.market) messages.push(`Assigned to ${updates.market}`);

      if (messages.length > 0) {
        await supabaseAdmin.from("notifications").insert({
          user_id,
          message: messages.join(". "),
          type: "assignment",
          read: false,
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
      );
    }

    /* ======================================================
       DELETE USER
    ====================================================== */
    if (req.method === "DELETE") {
      let userId = url.pathname.split("/").pop();

      if (!userId || userId === "user-management") {
        userId = url.searchParams.get("id") || undefined;
      }

      if (!userId) {
        const body = await req.json().catch(() => null);
        userId = body?.user_id;
      }

      if (!userId) {
        return new Response(
          JSON.stringify({ message: "Missing user id" }),
          { status: 400, headers: corsHeaders }
        );
      }

      await supabaseAdmin.auth.admin.deleteUser(userId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
      );
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });

  } catch (err: any) {
    console.error("USER MANAGEMENT ERROR:", err);
    return new Response(
      JSON.stringify({ message: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
