import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  DashboardStats,
  type CollectorInfo,
  type RecentTransaction,
} from "@/data/dashboardStats";
import { type StallRecord } from "@/data/stalls";
import { type Invoice } from "./UnpaidDues";
import "./PaymentChatAssistant.css";

type PaymentIntent =
  | "unpaid"
  | "total"
  | "summary"
  | "overdue"
  | "update"
  | "stalls"
  | "collector_updates"
  | "top_collector"
  | "top_unpaid"
  | "needs_follow_up"
  | "dashboard_insight"
  | "history"
  | "my_collections"
  | "my_unpaid"
  | "my_assigned"
  | "my_pending"
  | "my_summary"
  | "help";

export interface ChatQuery {
  text: string;
  intent: "social" | "payment" | "unknown";
  socialIntent?: "greet" | "thanks" | "bye" | "ok";
  paymentIntent?: PaymentIntent;
  status?: "paid" | "unpaid" | "overdue";
  timeframe?: "today" | "this_month";
  confidence?: "high" | "low";
}

export interface ChatRecord {
  name: string;
  status: string;
  amount: number | null;
  collector: string;
  date: string;
  dateNote?: string;
}

export interface ChatResult {
  query: ChatQuery;
  records: ChatRecord[];
}

interface PaymentChatAssistantProps {
  records: Invoice[];
  systemStats: DashboardStats;
  stalls?: StallRecord[];
  variant?: "page" | "panel";
  onRequestRefresh?: () => void;
}

interface ChatMessageItem {
  id: string;
  sender: "bot" | "user";
  text: string;
  createdAt: Date;
  confirmQuery?: ChatQuery;
  examples?: string[];
}

type IntentMeta = {
  label: string;
  adminOnly?: boolean;
  collectorAllowed?: boolean;
  examples: string[];
  requiredStats?: Array<keyof DashboardStats>;
};

const PAYMENT_INTENTS: Record<PaymentIntent, IntentMeta> = {
  unpaid: {
    label: "unpaid records",
    adminOnly: true,
    examples: ["unpaid today", "unpaid this month"],
    requiredStats: ["unpaidCount"],
  },
  total: {
    label: "collection totals",
    adminOnly: true,
    examples: ["total today", "total this month"],
    requiredStats: ["totalToday", "totalMonth"],
  },
  summary: {
    label: "daily summary",
    adminOnly: true,
    examples: ["summary today"],
    requiredStats: ["totalToday", "paidCount", "unpaidCount", "activeVendors", "totalStalls"],
  },
  overdue: {
    label: "overdue accounts",
    adminOnly: true,
    examples: ["overdue accounts"],
    requiredStats: ["overdueCount"],
  },
  update: {
    label: "collection update",
    adminOnly: true,
    examples: ["collection update"],
    requiredStats: ["totalMonth", "paidCount", "unpaidCount", "totalStalls"],
  },
  stalls: {
    label: "stall count",
    adminOnly: true,
    examples: ["total stalls"],
    requiredStats: ["totalStalls", "vacantStalls"],
  },
  collector_updates: {
    label: "collector performance",
    adminOnly: true,
    examples: ["show all collectors performance"],
    requiredStats: ["collectors"],
  },
  top_collector: {
    label: "top collector",
    adminOnly: true,
    examples: ["top collector"],
    requiredStats: ["collectors"],
  },
  top_unpaid: {
    label: "collector with most unpaid stalls",
    adminOnly: true,
    examples: ["who has the most unpaid stalls"],
    requiredStats: ["collectors"],
  },
  needs_follow_up: {
    label: "follow-up priorities",
    adminOnly: true,
    examples: ["who needs follow-up"],
    requiredStats: ["collectors"],
  },
  dashboard_insight: {
    label: "dashboard insight",
    adminOnly: true,
    examples: ["dashboard update"],
    requiredStats: ["totalToday", "totalMonth", "unpaidCount", "overdueCount", "activeVendors", "totalStalls"],
  },
  history: {
    label: "payment history",
    adminOnly: true,
    examples: ["payment history today"],
  },
  my_collections: {
    label: "my collections",
    collectorAllowed: true,
    examples: ["my collections today"],
    requiredStats: ["myCollectionsToday", "collectorName"],
  },
  my_unpaid: {
    label: "my unpaid assigned stalls",
    collectorAllowed: true,
    examples: ["my unpaid assigned stalls"],
    requiredStats: ["myUnpaidCount", "collectorName"],
  },
  my_assigned: {
    label: "my assigned stalls",
    collectorAllowed: true,
    examples: ["my assigned stalls"],
    requiredStats: ["myAssignedStallsCount", "collectorName"],
  },
  my_pending: {
    label: "my pending collections",
    collectorAllowed: true,
    examples: ["my pending collections"],
    requiredStats: ["myPendingAmount", "collectorName"],
  },
  my_summary: {
    label: "my summary",
    collectorAllowed: true,
    examples: ["my summary today"],
    requiredStats: ["mySummaryCount", "myCollectionsToday", "collectorName"],
  },
  help: {
    label: "help",
    collectorAllowed: true,
    examples: ["help", "commands", "what can you do"],
  },
};

const PAYMENT_PATTERNS: Array<{ intent: PaymentIntent; phrases: string[] }> = [
  { intent: "help", phrases: ["help", "commands", "what can you do", "unsa imong mabuhat", "ano kaya mo"] },
  { intent: "my_collections", phrases: ["my collections today", "my collection today", "collections for me", "akong nakolekta", "pila akong nakolekta"] },
  { intent: "my_unpaid", phrases: ["my unpaid assigned stalls", "my unpaid stalls", "kinsa wala kabayad sa ako", "sino hindi nagbayad sa section ko"] },
  { intent: "my_assigned", phrases: ["my assigned stalls", "my stalls", "assigned stalls", "akong stalls"] },
  { intent: "my_pending", phrases: ["my pending collections", "pending collections for me", "kulang pa nako kolektahon"] },
  { intent: "my_summary", phrases: ["my summary today", "summary for me today", "today summary for me"] },
  { intent: "total", phrases: ["total today", "today total", "collection total today", "total this month", "monthly total", "pila ang bayad", "tag pila", "magkano total"] },
  { intent: "unpaid", phrases: ["unpaid today", "unpaid this month", "unpaid records", "kinsa wala kabayad", "sino hindi nagbayad", "wala kabayad"] },
  { intent: "summary", phrases: ["summary today", "today summary", "collections today"] },
  { intent: "overdue", phrases: ["overdue accounts", "overdue records", "overdue", "past due", "lapas due", "nalapas na bayad"] },
  { intent: "update", phrases: ["collection update", "latest collection", "latest update", "collection status"] },
  { intent: "collector_updates", phrases: ["collector update", "collector performance", "show all collectors performance"] },
  { intent: "top_collector", phrases: ["who collected the most today", "top collector", "highest collection today", "leaderboard"] },
  { intent: "top_unpaid", phrases: ["who has the most unpaid stalls", "most unpaid stalls", "highest unpaid stalls"] },
  { intent: "needs_follow_up", phrases: ["who needs follow-up", "follow-up needed", "who needs attention", "prioritize unpaid"] },
  { intent: "dashboard_insight", phrases: ["dashboard update", "what stands out today", "current dashboard summary"] },
  { intent: "history", phrases: ["full history of payments today", "payment history today", "today's payment history"] },
  { intent: "stalls", phrases: ["total stalls", "stall count", "number of stalls", "total vendors", "vendor count"] },
];

const GREETING_WORDS = new Set(["hi", "hello", "hey", "maayong", "kumusta"]);
const RUDE_WORDS = new Set(["fuck", "fck", "shit", "stupid", "idiot", "bobo", "gago", "tanga", "ulol"]);
const SOCIAL_PATTERNS = {
  thanks: ["thanks", "thank you", "salamat"],
  bye: ["bye", "goodbye", "see you", "later"],
  ok: ["okay", "ok", "alright", "sige"],
} as const;

const includesAny = (text: string, terms: readonly string[]) =>
  terms.some((term) => text.includes(term));

const tokenizeWords = (text: string) => text.match(/\b[\p{L}]+\b/gu) ?? [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isGreeting = (text: string) =>
  tokenizeWords(text).some((token) => GREETING_WORDS.has(token.toLowerCase()));

const isRudeMessage = (text: string) =>
  tokenizeWords(text).some((token) => RUDE_WORDS.has(token.toLowerCase()));

const extractStatus = (text: string): ChatQuery["status"] => {
  if (includesAny(text, ["overdue", "past due", "lapas due", "nalapas"])) return "overdue";
  if (includesAny(text, ["unpaid", "not paid", "wala kabayad", "hindi nagbayad"])) return "unpaid";
  if (includesAny(text, ["paid", "settled", "completed", "kabayad", "nagbayad"])) return "paid";
  return undefined;
};

const extractTimeframe = (text: string): ChatQuery["timeframe"] => {
  if (includesAny(text, ["today", "today's", "this day", "karon", "ngayon"])) return "today";
  if (includesAny(text, ["this month", "month", "monthly", "buwan", "bulan"])) return "this_month";
  return undefined;
};

const detectSocialIntent = (text: string): ChatQuery["socialIntent"] | undefined => {
  if (isGreeting(text)) return "greet";
  for (const intent of Object.keys(SOCIAL_PATTERNS) as Array<keyof typeof SOCIAL_PATTERNS>) {
    if (includesAny(text, SOCIAL_PATTERNS[intent])) return intent;
  }
  return undefined;
};

const detectPaymentIntent = (text: string): { intent?: PaymentIntent; confidence: "high" | "low" } => {
  for (const pattern of PAYMENT_PATTERNS) {
    for (const phrase of pattern.phrases) {
      if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(text)) {
        return { intent: pattern.intent, confidence: "high" };
      }
    }
  }

  const words = new Set(tokenizeWords(text).map((word) => word.toLowerCase()));
  let bestIntent: PaymentIntent | undefined;
  let bestScore = 0;
  for (const pattern of PAYMENT_PATTERNS) {
    const phraseWords = new Set(pattern.phrases.flatMap((phrase) => tokenizeWords(phrase.toLowerCase())));
    const score = Array.from(phraseWords).filter((word) => words.has(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = pattern.intent;
    }
  }
  return { intent: bestScore > 0 ? bestIntent : undefined, confidence: "low" };
};

export const parseQuery = (input: string): ChatQuery => {
  const text = input.trim().toLowerCase();
  const socialIntent = detectSocialIntent(text);
  const detected = detectPaymentIntent(text);

  if (detected.intent) {
    const timeframe = extractTimeframe(text);
    const normalizedTimeframe = detected.intent === "history" ? "today" : timeframe;
    return {
      text,
      intent: "payment",
      paymentIntent: detected.intent,
      status: extractStatus(text),
      timeframe: normalizedTimeframe,
      confidence: detected.confidence,
    };
  }

  if (socialIntent) return { text, intent: "social", socialIntent, confidence: "high" };
  return { text, intent: "unknown", confidence: "low" };
};

const normalizeDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const isSameDay = (dateA: Date, dateB: Date) =>
  dateA.getFullYear() === dateB.getFullYear() &&
  dateA.getMonth() === dateB.getMonth() &&
  dateA.getDate() === dateB.getDate();

const isSameMonth = (dateA: Date, dateB: Date) =>
  dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth();

const formatAmount = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "amount unavailable";
  }
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCount = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to textarea copy for older mobile/browser contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const selectedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);

  if (selection) {
    selection.removeAllRanges();
    if (selectedRange) {
      selection.addRange(selectedRange);
    }
  }

  return copied;
};

const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createBotMessage = (
  text: string,
  extra?: Pick<ChatMessageItem, "confirmQuery" | "examples">
): ChatMessageItem => ({
  id: createMessageId(),
  sender: "bot",
  text,
  createdAt: new Date(),
  ...extra,
});

const formatRelativeMinutes = (date: Date) => {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return minutes <= 0 ? "just now" : `${minutes} min${minutes === 1 ? "" : "s"} ago`;
};

const getInvoiceDisplayDate = (invoice: Invoice) => {
  if (invoice.status === "paid") {
    if (invoice.paid_at) return { date: invoice.paid_at, note: "" };
    if (invoice.due_date) return { date: invoice.due_date, note: "paid date missing; using due date" };
  }
  return { date: invoice.due_date || invoice.paid_at || "", note: "" };
};

const toChatRecord = (invoice: Invoice): ChatRecord => {
  const amount = Number(invoice.amount);
  const displayDate = getInvoiceDisplayDate(invoice);
  return {
    name: invoice.vendor_name || invoice.stall_name || "Unknown",
    status: invoice.status || "unknown",
    amount: Number.isFinite(amount) ? amount : null,
    collector: invoice.collector_name || "Unknown",
    date: displayDate.date,
    dateNote: displayDate.note,
  };
};

const isCollector = (stats: DashboardStats) => stats.role?.toLowerCase() === "collector";

const roleExamples = (stats: DashboardStats) =>
  isCollector(stats)
    ? ["my collections today", "my unpaid assigned stalls", "my summary today", "my pending collections"]
    : ["summary today", "total this month", "overdue accounts", "show all collectors performance"];

const unauthorizedMessage = (stats: DashboardStats) =>
  [
    "Sorry, that information is only available to administrators.",
    `You can ask: ${roleExamples(stats).map((example) => `"${example}"`).join(", ")}.`,
  ].join("\n\n");

const isAuthorized = (query: ChatQuery, stats: DashboardStats) => {
  const intent = query.paymentIntent;
  if (!intent) return true;
  const meta = PAYMENT_INTENTS[intent];
  if (!isCollector(stats)) return true;
  return Boolean(meta.collectorAllowed) && !meta.adminOnly;
};

const hasRequiredStats = (intent: PaymentIntent, stats: DashboardStats) => {
  const required = PAYMENT_INTENTS[intent].requiredStats ?? [];
  return required.every((field) => {
    const value = stats[field];
    if (Array.isArray(value)) return true;
    return value !== undefined && value !== null;
  });
};

const mergeWithContext = (query: ChatQuery, context: ChatQuery | null): ChatQuery => {
  if (!context || context.intent !== "payment") return query;
  if (query.intent === "social" || query.paymentIntent === "help") return query;

  const vagueTimeframeOnly = query.intent === "unknown" && extractTimeframe(query.text);
  const vagueStatusOnly = query.intent === "unknown" && extractStatus(query.text);

  if (vagueTimeframeOnly || vagueStatusOnly) {
    return {
      ...context,
      text: query.text,
      status: extractStatus(query.text) ?? context.status,
      timeframe: extractTimeframe(query.text) ?? context.timeframe,
      confidence: "high",
    };
  }

  if (query.intent !== "payment") return query;
  return {
    ...query,
    status: query.status ?? context.status,
    timeframe: query.timeframe ?? context.timeframe,
  };
};

export const filterRecords = (query: ChatQuery, records: Invoice[]): ChatResult => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let filtered = records.map(toChatRecord);

  if (query.status === "overdue") filtered = filtered.filter((record) => record.status === "overdue");
  if (query.status === "paid") filtered = filtered.filter((record) => record.status === "paid");
  if (query.status === "unpaid") {
    filtered = filtered.filter((record) => record.status === "unpaid" || record.status === "overdue");
  }

  if (query.timeframe === "today") {
    filtered = filtered.filter((record) => {
      const recordDate = normalizeDate(record.date);
      return recordDate ? isSameDay(recordDate, now) : false;
    });
  }

  if (query.timeframe === "this_month") {
    filtered = filtered.filter((record) => {
      const recordDate = normalizeDate(record.date);
      return recordDate ? isSameMonth(recordDate, now) : false;
    });
  }

  return { query, records: filtered };
};

const joinParagraphs = (...sections: Array<string | undefined | false>) =>
  sections.filter(Boolean).join("\n\n");

const formatRecordLine = (record: ChatRecord, index: number) => {
  const note = record.dateNote ? ` (${record.dateNote})` : "";
  return `${index + 1}. ${record.name} - ${record.status.toUpperCase()} - ${formatAmount(record.amount)} - ${record.date || "date unavailable"}${note}`;
};

const collectorsFromStats = (stats: DashboardStats): CollectorInfo[] =>
  Array.isArray(stats.collectors) ? stats.collectors : [];

const recentTransactionsFromStats = (stats: DashboardStats): RecentTransaction[] =>
  Array.isArray(stats.recentTransactions) ? stats.recentTransactions : [];

const formatCollectorLine = (collector: CollectorInfo) =>
  `* ${collector.name}${collector.section ? ` (${collector.section})` : ""} - Today ${formatAmount(collector.collectionsToday)} - Month ${formatAmount(
    collector.collectedThisMonth
  )} - Unpaid ${collector.unpaidAssignedStalls} - Assigned ${collector.assignedStalls}`;

const formatRecentTransactionLine = (transaction: RecentTransaction) =>
  `* ${transaction.vendorName} (${transaction.stallName}) by ${transaction.collectorName} - ${formatAmount(transaction.amount)}${
    transaction.paidAt ? ` on ${transaction.paidAt}` : ""
  }`;

const getHelpResponse = (stats: DashboardStats) => {
  const examples = roleExamples(stats);
  return joinParagraphs(
    isCollector(stats)
      ? "Here are the collector commands I can answer for your assigned data:"
      : "Here are the admin commands I can answer:",
    examples.map((example) => `* ${example}`).join("\n")
  );
};

const getSocialResponse = (socialIntent: NonNullable<ChatQuery["socialIntent"]>, stats: DashboardStats) => {
  if (socialIntent === "greet") {
    const role = stats.role?.toLowerCase() === "admin" ? "admin" : "collector";
    const name = stats.collectorName?.trim();
    return `Hello ${role}${name ? ` ${name}` : ""}. Ask "help" to see what I can answer.`;
  }
  if (socialIntent === "thanks") return "You're welcome. Ask for another update anytime.";
  if (socialIntent === "bye") return "Bye. I'll be here when you need collection updates.";
  return "Got it. Ask \"help\" if you want the available commands.";
};

const missingStatsResponse = "Refreshing data... Some dashboard fields are missing right now.";

export const getPaymentResponse = (
  result: ChatResult,
  stats: DashboardStats,
  records: ChatRecord[]
): string => {
  const intent = result.query.paymentIntent;
  if (!intent) return "I can help with collections, unpaid records, summaries, and stall information.";
  if (intent === "help") return getHelpResponse(stats);
  if (!isAuthorized(result.query, stats)) return unauthorizedMessage(stats);
  if (!hasRequiredStats(intent, stats)) return missingStatsResponse;

  const count = records.length;
  const total = records.reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const timeframe = result.query.timeframe === "this_month" ? "this month" : "today";
  const collectors = collectorsFromStats(stats);
  const recent = recentTransactionsFromStats(stats);

  switch (intent) {
    case "total": {
      const amount = result.query.timeframe === "this_month" ? stats.totalMonth : stats.totalToday;
      return amount > 0
        ? `Total collection for ${timeframe}: ${formatAmount(amount)}.`
        : `No collections recorded yet ${timeframe}.`;
    }
    case "unpaid":
      return count > 0
        ? `There are ${count} unpaid record(s), totaling ${formatAmount(total)}.`
        : `No unpaid records found ${timeframe}.`;
    case "summary":
      return joinParagraphs(
        `Summary for ${stats.today}:`,
        [
          `* Total collected: ${formatAmount(stats.totalToday)}`,
          `* Paid records: ${stats.paidCount}`,
          `* Unpaid records: ${stats.unpaidCount}`,
          `* Active vendors: ${stats.activeVendors} of ${stats.totalStalls} stalls`,
        ].join("\n")
      );
    case "overdue":
      if (stats.overdueCount === 0) return "No overdue accounts right now - great news.";
      return joinParagraphs(
        `There are ${stats.overdueCount} overdue account(s).`,
        records.length ? records.map(formatRecordLine).join("\n") : undefined
      );
    case "update":
      return joinParagraphs(
        "Update snapshot:",
        `* Month-to-date collected: ${formatAmount(stats.totalMonth)}
* Paid records: ${stats.paidCount}
* Unpaid records: ${stats.unpaidCount}
* Active vendors: ${stats.activeVendors} of ${stats.totalStalls}`,
        recent[0] ? `Latest: ${formatRecentTransactionLine(recent[0])}` : undefined
      );
    case "collector_updates":
      return collectors.length
        ? joinParagraphs("Latest collector update:", collectors.map(formatCollectorLine).join("\n"))
        : "No collector records are available right now.";
    case "top_collector": {
      const top = [...collectors].sort((a, b) => b.collectionsToday - a.collectionsToday)[0];
      return top && top.collectionsToday > 0
        ? `${top.name} is leading today with ${formatAmount(top.collectionsToday)}.`
        : "No collections recorded for any collector today yet.";
    }
    case "top_unpaid": {
      const top = [...collectors].sort((a, b) => b.unpaidAssignedStalls - a.unpaidAssignedStalls)[0];
      return top && top.unpaidAssignedStalls > 0
        ? `${top.name} has the most unpaid assigned stalls: ${top.unpaidAssignedStalls}.`
        : "No unpaid assigned stalls are reported right now.";
    }
    case "needs_follow_up": {
      const list = [...collectors]
        .filter((collector) => collector.unpaidAssignedStalls > 0)
        .sort((a, b) => b.unpaidAssignedStalls - a.unpaidAssignedStalls)
        .slice(0, 3);
      return list.length
        ? joinParagraphs("Follow up with:", list.map((collector) => `* ${collector.name}: ${collector.unpaidAssignedStalls} unpaid stall(s)`).join("\n"))
        : "No follow-up priorities right now.";
    }
    case "dashboard_insight":
      return joinParagraphs(
        "Here's what stands out today:",
        `* Today: ${formatAmount(stats.totalToday)}
* Month-to-date: ${formatAmount(stats.totalMonth)}
* Unpaid: ${stats.unpaidCount}
* Overdue: ${stats.overdueCount}
* Active vendors: ${stats.activeVendors} of ${stats.totalStalls}`,
        recent[0] ? `Latest payment: ${formatRecentTransactionLine(recent[0])}` : undefined
      );
    case "history":
      return records.length
        ? joinParagraphs("Recorded payment history today:", records.map(formatRecordLine).join("\n"))
        : "No recorded payments found for today.";
    case "stalls": {
      const occupied = stats.totalStalls - stats.vacantStalls;
      return `Tracked stalls: ${stats.totalStalls}. Occupied: ${occupied}. Vacant: ${stats.vacantStalls}.`;
    }
    case "my_collections":
      return stats.myCollectionsToday && stats.myCollectionsToday > 0
        ? `${stats.collectorName}, your collections today total ${formatAmount(stats.myCollectionsToday)}.`
        : `${stats.collectorName ?? "Collector"}, no collections recorded yet today for your section.`;
    case "my_unpaid":
      return `${stats.collectorName ?? "Collector"}, you have ${stats.myUnpaidCount ?? 0} unpaid assigned stall(s).`;
    case "my_assigned":
      return `${stats.collectorName ?? "Collector"}, you have ${stats.myAssignedStallsCount ?? 0} assigned stall(s) in ${stats.collectorSection ?? "your section"}.`;
    case "my_pending":
      return stats.myPendingAmount && stats.myPendingAmount > 0
        ? `${stats.collectorName ?? "Collector"}, your pending collections total ${formatAmount(stats.myPendingAmount)}.`
        : `${stats.collectorName ?? "Collector"}, no pending collection amount is recorded for your section.`;
    case "my_summary":
      return joinParagraphs(
        `Summary for ${stats.collectorName ?? "collector"} on ${stats.today}:`,
        `* Payments recorded: ${stats.mySummaryCount ?? 0}
* Total collected: ${formatAmount(stats.myCollectionsToday)}
* Unpaid assigned stalls: ${stats.myUnpaidCount ?? 0}
* Pending amount: ${formatAmount(stats.myPendingAmount)}`
      );
    default:
      return getHelpResponse(stats);
  }
};

export const generateResponse = (
  result: ChatResult,
  systemStats: DashboardStats,
  records: ChatRecord[] = []
): string => {
  if (result.query.intent === "social" && result.query.socialIntent) {
    return getSocialResponse(result.query.socialIntent, systemStats);
  }
  return getPaymentResponse(result, systemStats, records);
};

export const PaymentChatAssistant = ({
  records,
  systemStats,
  variant = "panel",
  onRequestRefresh,
}: PaymentChatAssistantProps) => {
  const initialGreeting = useMemo(() => getSocialResponse("greet", systemStats), [systemStats]);
  const initialGreetingRef = useRef(initialGreeting);
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    createBotMessage(initialGreetingRef.current),
  ]);
  const [inputValue, setInputValue] = useState("");
  const [context, setContext] = useState<ChatQuery | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [navOffset, setNavOffset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight
  );
  const [lastDataUpdatedAt, setLastDataUpdatedAt] = useState(() => new Date());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isPageVariant = variant === "page";
  const isKeyboardOpen = keyboardInset > 0;
  const pageComposerBottom = keyboardInset > 0 ? keyboardInset : navOffset;
  const pageMessagesBottomPadding = isPageVariant
    ? composerHeight + (isKeyboardOpen ? 0 : navOffset) + 12
    : undefined;
  const chatRootStyle = {
    "--mp-chat-nav-offset": `${navOffset}px`,
    "--mp-chat-composer-bottom": `${pageComposerBottom}px`,
    "--mp-chat-composer-height": `${composerHeight}px`,
    "--mp-chat-viewport-height": viewportHeight > 0 ? `${viewportHeight}px` : "100vh",
  } as CSSProperties;
  const quickSuggestions = roleExamples(systemStats);
  const staleMinutes = Math.floor((nowTick - lastDataUpdatedAt.getTime()) / 60000);
  const isDataStale = staleMinutes >= 5;

  useEffect(() => {
    setLastDataUpdatedAt(new Date());
  }, [records, systemStats]);

  useEffect(() => {
    setMessages((current) => {
      const seenInitialGreeting = new Set<string>();
      const deduped = current.filter((message) => {
        const isInitialGreeting =
          message.sender === "bot" && message.text === initialGreetingRef.current;
        if (!isInitialGreeting) return true;
        if (seenInitialGreeting.has(message.text)) return false;
        seenInitialGreeting.add(message.text);
        return true;
      });
      return deduped.length === current.length ? current : deduped;
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const addBotMessage = (text: string, extra?: Pick<ChatMessageItem, "confirmQuery" | "examples">) => {
    setMessages((current) => [...current, createBotMessage(text, extra)]);
  };

  const runQuery = (query: ChatQuery) => {
    if (query.intent === "payment" && query.paymentIntent) {
      if (!isAuthorized(query, systemStats)) {
        setContext(null);
        return unauthorizedMessage(systemStats);
      }
      if (!hasRequiredStats(query.paymentIntent, systemStats)) {
        onRequestRefresh?.();
        return missingStatsResponse;
      }
      const result = filterRecords(query, records);
      setContext(query);
      return getPaymentResponse(result, systemStats, result.records);
    }
    if (query.intent === "social" && query.socialIntent) {
      setContext(null);
      return getSocialResponse(query.socialIntent, systemStats);
    }
    return getUnknownResponse(query.text, systemStats);
  };

  const handleSendMessage = (text: string, forcedQuery?: ChatQuery) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatMessageItem = {
      id: createMessageId(),
      sender: "user",
      text: trimmed,
      createdAt: new Date(),
    };

    inputRef.current?.blur();
    const parsed = forcedQuery ?? mergeWithContext(parseQuery(trimmed), context);
    setMessages((current) => [...current, userMessage]);
    setInputValue("");

    if (parsed.intent === "payment" && parsed.confidence === "low" && parsed.paymentIntent && !forcedQuery) {
      addBotMessage(`Did you mean: ${PAYMENT_INTENTS[parsed.paymentIntent].label}?`, {
        confirmQuery: { ...parsed, confidence: "high" },
      });
      return;
    }

    const botText = runQuery(parsed);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setIsTyping(true);
    typingTimerRef.current = setTimeout(() => {
      addBotMessage(botText, parsed.paymentIntent === "help" ? { examples: roleExamples(systemStats) } : undefined);
      setIsTyping(false);
      typingTimerRef.current = null;
    }, Math.min(1500, 450 + botText.length * 3));
  };

  const handleConfirm = (query: ChatQuery) => {
    handleSendMessage(PAYMENT_INTENTS[query.paymentIntent ?? "help"].label, query);
  };

  const copyMessage = async (message: ChatMessageItem) => {
    const copied = await copyTextToClipboard(message.text);
    if (!copied) return;
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 2000);
  };

  useEffect(() => {
    const scrollToLatest = () => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    const frame = requestAnimationFrame(scrollToLatest);
    const timer = window.setTimeout(scrollToLatest, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [messages, isTyping]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const measureLayout = () => {
      const nextViewportHeight = viewport?.height
        ? Math.round(viewport.height)
        : window.innerHeight;
      setViewportHeight(nextViewportHeight);

      const nextKeyboardInset = viewport ? Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop))) : 0;
      const keyboardOpen = nextKeyboardInset > 120;
      setKeyboardInset(keyboardOpen ? nextKeyboardInset : 0);
      const navElement = document.getElementById("mobile-bottom-nav-bar");
      if (navElement && isPageVariant && !keyboardOpen) {
        const rect = navElement.getBoundingClientRect();
        const measuredHeight = Math.max(
          navElement.offsetHeight,
          rect.height,
          navElement.parentElement?.getBoundingClientRect().height ?? 0
        );
        setNavOffset(Math.ceil(measuredHeight));
      } else {
        setNavOffset(0);
      }
      if (composerRef.current) {
        setComposerHeight(Math.ceil(composerRef.current.getBoundingClientRect().height));
      }
    };
    const requestMeasure = () => requestAnimationFrame(measureLayout);
    requestMeasure();
    viewport?.addEventListener("resize", requestMeasure);
    viewport?.addEventListener("scroll", requestMeasure);
    window.addEventListener("resize", requestMeasure);
    window.addEventListener("orientationchange", requestMeasure);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestMeasure) : null;
    if (resizeObserver && composerRef.current) resizeObserver.observe(composerRef.current);
    const navElement = document.getElementById("mobile-bottom-nav-bar");
    if (resizeObserver && navElement) resizeObserver.observe(navElement);
    return () => {
      viewport?.removeEventListener("resize", requestMeasure);
      viewport?.removeEventListener("scroll", requestMeasure);
      window.removeEventListener("resize", requestMeasure);
      window.removeEventListener("orientationchange", requestMeasure);
      resizeObserver?.disconnect();
    };
  }, [isPageVariant]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  return (
    <div
      style={chatRootStyle}
      className={
        isPageVariant
          ? "payment-chat payment-chat--page flex flex-col overflow-hidden bg-transparent text-foreground"
          : "payment-chat payment-chat--panel flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm"
      }
    >
      {!isPageVariant && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold">SMP AI Agent</h2>
          <p className="text-sm text-muted-foreground">Ask for payment totals, unpaid records, or type "help".</p>
        </div>
      )}

      {isDataStale && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Data may be outdated - last updated {formatRelativeMinutes(lastDataUpdatedAt)}.
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className={
          isPageVariant
            ? "payment-chat__messages flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4"
            : "payment-chat__messages flex flex-1 flex-col gap-3 overflow-y-auto px-1 pb-3"
        }
        style={{
          maxHeight: isPageVariant ? undefined : 380,
          paddingBottom: pageMessagesBottomPadding,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            style={{ marginTop: index === 0 ? 0 : messages[index - 1].sender === message.sender ? 4 : 16 }}
          >
            <div className={`group max-w-[86%] ${message.sender === "user" ? "text-right" : "text-left"}`}>
              <div
                className={`rounded-2xl px-4 py-3.5 text-sm leading-7 shadow-sm whitespace-pre-line ${
                  message.sender === "user" ? "bg-primary text-white" : "bg-slate-100 text-slate-900"
                }`}
              >
                {message.text}
                {message.confirmQuery && (
                  <button
                    type="button"
                    onClick={() => handleConfirm(message.confirmQuery!)}
                    className="mt-3 block rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Yes, run this
                  </button>
                )}
                {message.examples && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handleSendMessage(example)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {message.sender === "bot" && (
                <div className="mt-1 flex items-center gap-2 px-2 text-[11px] text-slate-500">
                  <span>{formatTime(message.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => copyMessage(message)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100"
                  >
                    {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedMessageId === message.id ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start" style={{ marginTop: 16 }}>
            <div className="typing-indicator" role="status" aria-live="polite" aria-label="Assistant is typing">
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <div
        ref={composerRef}
        className={
          isPageVariant
            ? "payment-chat__composer payment-chat__composer--page fixed inset-x-0 z-[70] bg-background px-4 pb-3 pt-2"
            : "sticky bottom-0 mt-5 space-y-3 border-t border-slate-100 bg-white pt-4"
        }
        style={{
          bottom: isPageVariant ? pageComposerBottom : keyboardInset || undefined,
          paddingBottom: isPageVariant
            ? "0.75rem"
            : "calc(env(safe-area-inset-bottom, 0px) + 0.25rem)",
        }}
      >
        <div className={isPageVariant ? "mx-auto w-full space-y-3" : ""}>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max gap-2 pr-2">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <form
            className="flex gap-2"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              handleSendMessage(inputValue);
            }}
          >
            <input
              ref={inputRef}
              type="search"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Ask anything about payments..."
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const getUnknownResponse = (text: string, stats: DashboardStats): string => {
  if (isRudeMessage(text)) {
    return joinParagraphs("I'm here to help with Market Pay tasks.", `Try: ${roleExamples(stats).map((example) => `"${example}"`).join(", ")}.`);
  }
  return joinParagraphs("I didn't catch a Market Pay request.", `Try: ${roleExamples(stats).map((example) => `"${example}"`).join(", ")}.`);
};
