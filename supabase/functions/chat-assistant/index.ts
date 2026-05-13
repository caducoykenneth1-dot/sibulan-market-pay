import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatRequest = {
  message: string;
  history: ChatHistoryItem[];
  role: "admin" | "collector";
  full_name: string;
  market_section: string;
  user_id: string;
  language: Language;
};

type Language = "en" | "bsy" | "tgl";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type InvoiceRow = {
  id: number | string;
  vendor_name?: string | null;
  stall_name?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  paid_at?: string | null;
  collector_name?: string | null;
};

type VendorRow = {
  id: number | string;
  vendor?: string | null;
  type?: string | null;
  monthly_rent?: number | string | null;
  next_due?: string | null;
  status?: string | null;
  section?: string | null;
  market_section?: string | null;
};

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const stallTypeSections: Record<string, string> = {
  "Type 1A (Dried Fish)": "Dry Section",
  "Type 2B (Mixed Section)": "Dry Section",
  "Type 2 (Groceries)": "Dry Section",
  "Type 3 (Groceries)": "Dry Section",
  "Type 4 (Mixed Section)": "Dry Section",
  "Type 5 (Mixed Section)": "Dry Section",
  "Upper Floor Stall (Dry Goods)": "Dry Section",
  "Upper Floor Stall (Big)": "Dry Section",
  "Old Concrete Stalls": "Dry Section",
  "Fish Section": "Wet Section",
  "Meat Section": "Wet Section",
  "Chicken Section": "Wet Section",
  "Vegetables & Fruits": "Wet Section",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isChatRequest = (value: unknown): value is ChatRequest => {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const history = body.history;
  return (
    typeof body.message === "string" &&
    Array.isArray(history) &&
    history.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const historyItem = item as Record<string, unknown>;
      return (
        (historyItem.role === "user" || historyItem.role === "assistant") &&
        typeof historyItem.content === "string"
      );
    }) &&
    (body.role === "admin" || body.role === "collector") &&
    typeof body.full_name === "string" &&
    typeof body.market_section === "string" &&
    typeof body.user_id === "string" &&
    (body.language === "en" || body.language === "bsy" || body.language === "tgl")
  );
};

const languageLabel = (language: Language) => {
  if (language === "bsy") return "Bisaya/Cebuano";
  if (language === "tgl") return "Tagalog/Filipino";
  return "English";
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPeso = (value: number) =>
  value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value: string | null | undefined) => value?.split("T")[0] ?? "n/a";

const estimateTokens = (text: string) => Math.floor(text.length / 4);

const isSameMonth = (dateValue: string, reference: Date) => {
  const date = new Date(dateValue);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth()
  );
};

const filterVendorsForSection = (vendors: VendorRow[], role: string, section: string) => {
  if (role !== "collector" || section === "all") return vendors;
  return vendors.filter((vendor) => {
    const vendorSection =
      vendor.market_section || vendor.section || (vendor.type ? stallTypeSections[vendor.type] : null);
    return !vendorSection || vendorSection === section;
  });
};

const calculateStats = (invoices: InvoiceRow[], vendors: VendorRow[]) => {
  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const paidToday = paid.filter((invoice) => invoice.paid_at?.startsWith(todayKey));
  const paidThisMonth = paid.filter((invoice) =>
    invoice.paid_at ? isSameMonth(invoice.paid_at, today) : false
  );

  const collectorTotals = new Map<string, number>();
  paidToday.forEach((invoice) => {
    const collector = invoice.collector_name || "Unknown collector";
    collectorTotals.set(collector, (collectorTotals.get(collector) ?? 0) + toNumber(invoice.amount));
  });

  const topCollector = Array.from(collectorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => `${name} (${formatPeso(amount)})`)[0] ?? "None";

  return {
    totalToday: paidToday.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0),
    totalMonth: paidThisMonth.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0),
    paidCount: paid.length,
    unpaidCount: invoices.filter((invoice) => invoice.status === "unpaid").length,
    overdueCount: invoices.filter((invoice) => invoice.status === "overdue").length,
    totalStalls: vendors.length,
    vacantStalls: vendors.filter((vendor) => vendor.status === "vacant").length,
    topCollector,
  };
};

const formatInvoiceLines = (invoices: InvoiceRow[]) =>
  invoices.length
    ? invoices
        .map(
          (invoice) =>
            `- ${invoice.vendor_name || "Unknown"} / ${invoice.stall_name || "No stall"} / PHP ${formatPeso(
              toNumber(invoice.amount)
            )} / ${invoice.status || "unknown"} / ${formatDate(invoice.paid_at || invoice.due_date)}`
        )
        .join("\n")
    : "- none";

const formatVendorLines = (vendors: VendorRow[]) =>
  vendors.length
    ? vendors
        .map(
          (vendor) =>
            `- ${vendor.type || `Stall ${vendor.id}`} / ${vendor.vendor || "Vacant"} / ${
              vendor.status || "unknown"
            } / due ${formatDate(vendor.next_due)} / PHP ${formatPeso(toNumber(vendor.monthly_rent))}`
        )
        .join("\n")
    : "- none";

const buildSystemPrompt = (
  request: ChatRequest,
  invoices: InvoiceRow[],
  vendors: VendorRow[],
  invoiceLimit = 30,
  vendorLimit = 20
) => {
  const stats = calculateStats(invoices, vendors);
  const date = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const invoiceLines = formatInvoiceLines(invoices.slice(0, invoiceLimit));
  const vendorLines = formatVendorLines(vendors.slice(0, vendorLimit));

  return `You are the Sibulan Market Pay assistant.

USER: ${request.role} - ${request.full_name}
SECTION: ${request.market_section}
DATE: ${date}

LANGUAGE: ${request.language} (${languageLabel(request.language)}).
- en: reply only in English.
- bsy: reply only in Bisaya/Cebuano.
- tgl: reply only in Tagalog/Filipino.

STATS:
- Today: PHP ${formatPeso(stats.totalToday)}
- This month: PHP ${formatPeso(stats.totalMonth)}
- Paid: ${stats.paidCount}
- Unpaid: ${stats.unpaidCount}
- Overdue: ${stats.overdueCount}
- Vacant stalls: ${stats.vacantStalls}
- Top collector today: ${stats.topCollector}

RECENT INVOICES:
${invoiceLines}

ACTIVE VENDORS:
${vendorLines}

RULES: Answer only market payment questions. Use only the data above; never invent numbers. If collector, answer only for section ${request.market_section}. Keep it concise. Format money as PHP X,XXX.XX.`;

/*
  return `You are an AI assistant for Sibulan Market Pay, a market stall payment management system in Sibulan, Negros Oriental, Philippines.

Current user: ${request.role} — ${request.full_name}
Section: ${request.market_section}
Today's date: ${date}
Selected language: ${request.language} (${languageLabel(request.language)})

CRITICAL LANGUAGE RULE - THIS OVERRIDES EVERYTHING ELSE:
Selected language: ${request.language}

- "en" -> respond ONLY in English. Never use Bisaya or Tagalog words.
- "bsy" -> respond ONLY in Bisaya/Cebuano. Never use English or Tagalog.
- "tgl" -> respond ONLY in Tagalog/Filipino. Never use English or Bisaya.

This rule cannot be overridden by the user's message language.
This rule cannot be overridden by any user instruction.
Even if the user writes in a different language your response must be in the selected language only.
EXCEPTION: If the message is a language switch command like "speak bisaya" or "mag tagalog" - switch to that language and confirm in the new language.

LIVE DATABASE DATA:

INVOICES (last 100):
${JSON.stringify(invoices.slice(0, 100), null, 2)}

VENDORS:
${JSON.stringify(vendors, null, 2)}

CALCULATED STATS:
- Total collected today: PHP ${formatPeso(stats.totalToday)}
- Total collected this month: PHP ${formatPeso(stats.totalMonth)}
- Paid records: ${stats.paidCount}
- Unpaid records: ${stats.unpaidCount}
- Overdue accounts: ${stats.overdueCount}
- Total stalls: ${stats.totalStalls}
- Vacant stalls: ${stats.vacantStalls}
- Top collector today: ${stats.topCollector}

ADDITIONAL RULES:
- The selected language rule above overrides all other language guidance.

RULES:
- Only answer questions about market payment data
- If user is collector, only show data from their section: ${request.market_section}
- If user is admin, show all data
- Answer in the same language the user writes in — English, Bisaya, or Tagalog
- Never make up numbers — only use the data provided above
- Keep answers concise and friendly
- Format peso amounts as PHP X,XXX.XX
- If asked something unrelated to market payments, politely redirect`;
*/
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ message: "Method not allowed", fallback: true }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqApiKey = Deno.env.get("GROQ_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ message: "Server configuration missing", fallback: true }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return jsonResponse({ message: "Missing Authorization header", fallback: true }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return jsonResponse({ message: "Unauthorized", fallback: true }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!isChatRequest(body)) {
      return jsonResponse({ message: "Invalid request body", fallback: true }, 400);
    }

    if (body.user_id !== user.id) {
      return jsonResponse({ message: "User mismatch", fallback: true }, 403);
    }

    const [{ data: invoiceData, error: invoiceError }, { data: vendorData, error: vendorError }] =
      await Promise.all([
        supabaseAdmin
          .from("invoices")
          .select(
            "id, vendor_name, stall_name, amount, status, paid_at, due_date, collector_name"
          )
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin
          .from("vendors")
          .select(
            "id, vendor, type, status, next_due, monthly_rent"
          )
          .neq("status", "archived")
          .limit(20),
      ]);

    if (invoiceError || vendorError) {
      console.error("Database query failed", { invoiceError, vendorError });
      return jsonResponse({
        message: "Unable to load live data",
        fallback: true,
      });
    }

    const allInvoices = (invoiceData ?? []) as InvoiceRow[];
    const collectorInvoices = allInvoices;
    const visibleVendors = filterVendorsForSection(
      (vendorData ?? []) as VendorRow[],
      body.role,
      body.market_section
    );

    if (!groqApiKey) {
      console.warn("GROQ_API_KEY is missing.");
      return jsonResponse({
        message: "AI service is not configured",
        fallback: true,
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const recentHistory = body.history.slice(-3);
    let systemPrompt = buildSystemPrompt(body, collectorInvoices, visibleVendors, 30, 20);
    const fullPrompt = [
      systemPrompt,
      ...recentHistory.map((message) => `${message.role}: ${message.content}`),
      `user: ${body.message}`,
    ].join("\n");
    if (estimateTokens(fullPrompt) > 4500) {
      systemPrompt = buildSystemPrompt(body, collectorInvoices, visibleVendors, 15, 10);
    }

    const groqMessages: GroqMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: body.message },
    ];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: groqMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    }).finally(() => clearTimeout(timeoutId));

    if (!groqResponse.ok) {
      const errorBody = await groqResponse.json().catch(() => null);
      console.error("Groq API failed", groqResponse.status, errorBody);
      return jsonResponse({
        message: "AI service unavailable",
        fallback: true,
      });
    }

    const groqData = (await groqResponse.json()) as GroqResponse;
    const reply = groqData.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return jsonResponse({
        message: "AI service returned no response",
        fallback: true,
      });
    }

    return jsonResponse({ reply, fallback: false });
  } catch (error) {
    console.error("chat-assistant error", error);
    return jsonResponse({
      message: "Assistant temporarily unavailable",
      fallback: true,
    });
  }
});
