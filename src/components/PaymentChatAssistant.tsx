import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardStats, type CollectorInfo, type RecentTransaction } from "@/data/dashboardStats";
import { Invoice } from "./UnpaidDues";
import "./PaymentChatAssistant.css";

export interface ChatQuery {
  text: string;
  intent: "social" | "payment" | "unknown";
  socialIntent?: "greet" | "thanks" | "bye" | "ok";
  paymentIntent?:
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
    | "my_summary";
  status?: "paid" | "unpaid" | "overdue";
  timeframe?: "today" | "this_month";
}

export interface ChatRecord {
  name: string;
  status: string;
  amount: number;
  collector: string;
  date: string;
}

export interface ChatResult {
  query: ChatQuery;
  records: ChatRecord[];
}

const includesAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

const extractStatus = (text: string): ChatQuery["status"] => {
  if (includesAny(text, ["overdue", "due now", "due today"])) return "overdue";
  if (includesAny(text, ["unpaid", "due", "not paid"])) return "unpaid";
  if (includesAny(text, ["paid", "settled", "completed"])) return "paid";
  return undefined;
};

const extractTimeframe = (text: string): ChatQuery["timeframe"] => {
  if (includesAny(text, ["today", "today's", "this day"])) return "today";
  if (includesAny(text, ["this month", "month", "this month's", "monthly"])) return "this_month";
  return undefined;
};

const GREETING_WORDS = new Set(["hi", "hello", "hey"]);
const RUDE_WORDS = new Set(["fuck", "fck", "shit", "stupid", "idiot", "bobo", "gago", "tanga", "ulol"]);
const PAYMENT_PATTERNS: Array<{ intent: ChatQuery["paymentIntent"]; phrases: string[] }> = [
  {
    intent: "my_collections",
    phrases: ["my collections today", "my collection today", "my collections", "collections for me"],
  },
  {
    intent: "my_unpaid",
    phrases: ["my unpaid assigned stalls", "my unpaid stalls", "my unpaid records", "my unpaid invoices"],
  },
  {
    intent: "my_assigned",
    phrases: ["my assigned stalls", "my stalls", "assigned stalls", "stalls assigned to me"],
  },
  {
    intent: "my_pending",
    phrases: ["my pending collections", "pending collections for me", "my pending payments"],
  },
  {
    intent: "my_summary",
    phrases: ["my summary today", "summary for me today", "today summary for me"],
  },
  {
    intent: "total",
    phrases: [
      "total today",
      "today total",
      "collection total today",
      "today's total",
      "total this month",
      "this month total",
      "collection total this month",
      "monthly total",
      "total for today",
      "total for this month",
    ],
  },
  {
    intent: "unpaid",
    phrases: [
      "unpaid today",
      "today unpaid",
      "unpaid records today",
      "today's unpaid",
      "unpaid this month",
      "this month unpaid",
      "unpaid records this month",
      "monthly unpaid",
    ],
  },
  {
    intent: "summary",
    phrases: ["summary today", "today summary", "summary for today", "today's summary", "collections today"],
  },
  {
    intent: "overdue",
    phrases: ["overdue accounts", "overdue records", "overdue", "past due", "past due records"],
  },
  {
    intent: "update",
    phrases: ["collection update", "collection updates", "latest collection", "latest update", "update", "collection status"],
  },
  {
    intent: "collector_updates",
    phrases: [
      "collector update",
      "collector updates",
      "show collector updates",
      "collectors update",
      "collector performance",
      "show all collectors",
      "show all collectors performance",
      "collectors performance",
      "show me all collectors",
    ],
  },
  {
    intent: "top_collector",
    phrases: [
      "who collected the most today",
      "top collector",
      "highest collection today",
      "leaderboard",
      "collector leaderboard",
    ],
  },
  {
    intent: "top_unpaid",
    phrases: [
      "who has the most unpaid stalls",
      "most unpaid stalls",
      "highest unpaid stalls",
      "collector with the most unpaid",
    ],
  },
  {
    intent: "needs_follow_up",
    phrases: [
      "who needs follow-up",
      "follow-up needed",
      "who to follow up with",
      "prioritize unpaid",
      "who needs attention",
    ],
  },
  {
    intent: "dashboard_insight",
    phrases: [
      "dashboard update",
      "what stands out today",
      "summarize current status",
      "what should i know today",
      "give me the dashboard numbers",
      "current dashboard summary",
    ],
  },
  {
    intent: "history",
    phrases: [
      "full history of payments today",
      "show me full history of payments today",
      "payment history today",
      "today's payment history",
    ],
  },
  {
    intent: "stalls",
    phrases: ["total stalls", "stall count", "number of stalls", "total vendors", "vendor count"],
  },
];

const COLLECTOR_ALLOWED_INTENTS = new Set([
  "my_collections",
  "my_unpaid",
  "my_assigned",
  "my_pending",
  "my_summary",
]);

const COLLECTOR_UNAUTHORIZED_MSG =
  "Sorry, that information is only available to administrators. You can ask about your assigned stalls or your collections.";

// Break out alphabetic tokens so we only match greetings against whole words.
const tokenizeWords = (text: string) => {
  return text.match(/\b[a-zA-Z]+\b/g) ?? [];
};

const isGreeting = (text: string) => {
  const tokens = tokenizeWords(text);
  return tokens.some((token) => GREETING_WORDS.has(token.toLowerCase()));
};

const isRudeMessage = (text: string) => {
  const tokens = tokenizeWords(text);
  return tokens.some((token) => RUDE_WORDS.has(token.toLowerCase()));
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const detectPaymentIntent = (text: string): ChatQuery["paymentIntent"] | undefined => {
  for (const pattern of PAYMENT_PATTERNS) {
    for (const phrase of pattern.phrases) {
      const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");
      if (regex.test(text)) {
        return pattern.intent;
      }
    }
  }
  return undefined;
};

const socialPatterns: Record<Exclude<NonNullable<ChatQuery["socialIntent"]>, "greet">, string[]> = {
  thanks: ["thanks", "thank you", "thank you!", "thankyou"],
  bye: ["bye", "goodbye", "see you", "talk later", "later"],
  ok: ["okay", "ok", "alright", "sure"],
};

const detectSocialIntent = (text: string): ChatQuery["socialIntent"] | undefined => {
  for (const intent of Object.keys(socialPatterns) as Array<keyof typeof socialPatterns>) {
    if (includesAny(text, socialPatterns[intent])) {
      return intent;
    }
  }
  return undefined;
};

type IntentCheckResult =
  | { type: "payment"; paymentIntent: ChatQuery["paymentIntent"] }
  | { type: "social"; socialIntent: ChatQuery["socialIntent"] }
  | { type: "unknown" };

// Determine the user's intent: check payments first, then greetings, then other socials.
const detectIntent = (text: string): IntentCheckResult => {
  const paymentIntent = detectPaymentIntent(text);
  if (paymentIntent) {
    return { type: "payment", paymentIntent };
  }

  if (isGreeting(text)) {
    return { type: "social", socialIntent: "greet" };
  }

  const socialIntent = detectSocialIntent(text);
  if (socialIntent) {
    return { type: "social", socialIntent };
  }

  return { type: "unknown" };
};

export const parseQuery = (input: string): ChatQuery => {
  const text = input.trim().toLowerCase();
  const intentCheck = detectIntent(text);

  if (intentCheck.type === "social") {
    return { text, intent: "social", socialIntent: intentCheck.socialIntent };
  }

  if (intentCheck.type !== "payment") {
    return { text, intent: "unknown" };
  }

  const timeframe = extractTimeframe(text);
  const status = extractStatus(text);
  const normalizedIntentTimeframe =
    intentCheck.paymentIntent === "history" ? ("today" as ChatQuery["timeframe"]) : timeframe;

  if ((intentCheck.paymentIntent === "unpaid" || intentCheck.paymentIntent === "total") && !timeframe) {
    return { text, intent: "unknown" };
  }

  if (intentCheck.paymentIntent === "summary" && timeframe !== "today") {
    return { text, intent: "unknown" };
  }

  return {
    text,
    intent: "payment",
    paymentIntent: intentCheck.paymentIntent,
    status,
    timeframe: normalizedIntentTimeframe,
  };
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

const toChatRecord = (invoice: Invoice): ChatRecord => ({
  name: invoice.vendor_name || invoice.stall_name || "Unknown",
  status: invoice.status || "unknown",
  amount: Number(invoice.amount) || 0,
  collector: invoice.collector_name || "Unknown",
  date: invoice.paid_at || invoice.due_date || "",
});

const mergeWithContext = (query: ChatQuery, context: ChatQuery | null): ChatQuery => {
  if (!context) return query;

  return {
    ...query,
    status: query.status ?? context.status,
    timeframe: query.timeframe ?? context.timeframe,
    intent: query.intent === "unknown" ? context.intent : query.intent,
  };
};

export const filterRecords = (query: ChatQuery, records: Invoice[]): ChatResult => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const mapped = records.map(toChatRecord);
  let filtered = mapped;

  if (query.status === "overdue") {
    filtered = filtered.filter((record) => record.status === "overdue");
  } else if (query.status === "paid") {
    filtered = filtered.filter((record) => record.status === "paid");
  } else if (query.status === "unpaid") {
    filtered = filtered.filter((record) => record.status === "unpaid" || record.status === "overdue");
  }

  if (query.timeframe === "today") {
    filtered = filtered.filter((record) => {
      const recordDate = normalizeDate(record.date);
      return recordDate ? isSameDay(recordDate, now) : false;
    });
  } else if (query.timeframe === "this_month") {
    filtered = filtered.filter((record) => {
      const recordDate = normalizeDate(record.date);
      return recordDate ? isSameMonth(recordDate, now) : false;
    });
  }

  return { query, records: filtered };
};

const formatCurrency = (value: number) => `PHP ${value.toFixed(2)}`;

const joinParagraphs = (...sections: Array<string | undefined>) =>
  sections.filter(Boolean).join("\n\n");

const formatRecordLine = (record: ChatRecord, index: number) =>
  `${index + 1}. ${record.name} • ${record.status.toUpperCase()} • ${formatCurrency(record.amount)} • ${record.date || "no date"}`;

const collectorsFromStats = (stats: DashboardStats): CollectorInfo[] => stats.collectors ?? [];

const formatCollectorLine = (collector: CollectorInfo) => {
  const todayAmount = formatCurrency(collector.collectionsToday);
  const monthAmount = formatCurrency(collector.collectedThisMonth);
  return `* ${collector.name}${collector.section ? ` (${collector.section})` : ""} — Today ${todayAmount} · Month ${monthAmount} · Unpaid ${collector.unpaidAssignedStalls} stall${
    collector.unpaidAssignedStalls === 1 ? "" : "s"
  } · Assigned ${collector.assignedStalls} stall${collector.assignedStalls === 1 ? "" : "s"}`;
};

const formatRecentTransactionLine = (transaction: RecentTransaction) => {
  const when = transaction.paidAt ? ` on ${transaction.paidAt}` : "";
  return `* ${transaction.vendorName} (${transaction.stallName}) by ${transaction.collectorName} - ${formatCurrency(
    transaction.amount
  )}${when}`;
};

// System instructions reminder: rely on the `systemStats` object, never invent totals, and do not ask users to supply system metrics.
const missingDataReply = "I don't have that information available right now.";

const hasStat = (value: number | null | undefined): value is number =>
  typeof value === "number";

const timeframeLabel = (timeframe?: ChatQuery["timeframe"]) => {
  if (timeframe === "today") return "today";
  if (timeframe === "this_month") return "this month";
  return "";
};

const getTypingDelay = (text: string) => {
  const base = 700;
  const perChar = 4;
  const random = Math.random() * 300;
  return Math.min(1800, base + text.length * perChar + random);
};

const getRoleAwareGreeting = (stats: DashboardStats): string => {
  const role = stats.role?.toLowerCase();
  const label = role === "admin" ? "admin" : role === "collector" ? "collector" : "user";
  const displayName = stats.collectorName?.trim();
  return `Hello ${label}${displayName ? ` ${displayName}` : ""}! Need a fresh update on collections, unpaid records, or stalls?`;
};

const getFallbackExamples = (stats: DashboardStats): [string, string] => {
  const role = stats.role?.toLowerCase();
  return role === "admin"
    ? ["unpaid today", "show all collectors performance"]
    : ["my collections today", "my unpaid assigned stalls"];
};

const getUnknownResponse = (text: string, stats: DashboardStats): string => {
  const [firstExample, secondExample] = getFallbackExamples(stats);

  if (isRudeMessage(text)) {
    return joinParagraphs(
      "I'm here to help with Market Pay tasks.",
      `If you need something, ask me like "${firstExample}" or "${secondExample}".`
    );
  }

  return joinParagraphs(
    "I didn't quite catch a Market Pay request there.",
    `Try asking something like "${firstExample}" or "${secondExample}".`
  );
};

export const getSocialResponse = (
  socialIntent: NonNullable<ChatQuery["socialIntent"]>
): string => {
  switch (socialIntent) {
    case "greet":
      return joinParagraphs(
        "Hi! 👋 I'm your MarketPay assistant.",
        "Ask me about collections, unpaid records, collector updates, or stall status."
      );
    case "thanks":
      return joinParagraphs("You're welcome!", "Let me know if you'd like another update.");
    case "bye":
      return joinParagraphs("Bye! 👋 I'm here anytime you need collection updates.", "Just ping me again when you're ready.");
    case "ok":
      return joinParagraphs("Got it.", "Let me know if you need totals, unpaid accounts, or summaries.");
    default:
      return "Thanks for saying hello — I can help with payments, totals, and overdue updates whenever you need.";
  }
};

export const getPaymentResponse = (
  result: ChatResult,
  stats: DashboardStats,
  records: ChatRecord[]
): string => {
  const { query } = result;
  const intent = query.paymentIntent;
  if (!intent) {
    return "Sorry, I can help with collections, unpaid records, summaries, and stall-related information.";
  }

  const normalizedRole = stats.role?.toLowerCase() ?? "collector";
  const isAdmin = normalizedRole === "admin";
  if (!isAdmin && !COLLECTOR_ALLOWED_INTENTS.has(intent)) {
    return COLLECTOR_UNAUTHORIZED_MSG;
  }

  const timeframeText = timeframeLabel(query.timeframe);
  const count = records.length;
  const total = records.reduce((sum, record) => sum + record.amount, 0);
  const collectors = isAdmin ? collectorsFromStats(stats) : [];
  const recentTransactions = stats.recentTransactions ?? [];

  switch (intent) {
    case "total": {
      const amount =
        query.timeframe === "today"
          ? stats.totalToday
          : query.timeframe === "this_month"
          ? stats.totalMonth
          : null;
      if (!hasStat(amount)) {
        return missingDataReply;
      }
      return joinParagraphs(
        "Sure, here's what I found.",
        `Total collection for ${timeframeText} is ${formatCurrency(amount)}.`,
        "Would you like a summary or unpaid records?"
      );
    }
    case "unpaid":
      if (count === 0) {
        return joinParagraphs(
          `I checked, and there are no unpaid records${timeframeText ? ` ${timeframeText}` : ""}.`,
          "Great job staying on top of collections!"
        );
      }
      return joinParagraphs(
        `There are ${count} unpaid record(s)${timeframeText ? ` ${timeframeText}` : ""}, totaling ${formatCurrency(total)}.`,
        "Ask me for a summary or overdue accounts if you'd like."
      );
    case "summary":
      if (!hasStat(stats.totalToday) || !hasStat(stats.paidCount) || !hasStat(stats.unpaidCount)) {
        return missingDataReply;
      }
      const summaryLines = [
        `* Total collected: ${formatCurrency(stats.totalToday)}`,
        `* Paid records: ${stats.paidCount}`,
        `* Unpaid records: ${stats.unpaidCount}`,
        `* Active vendors: ${stats.activeVendors} of ${stats.totalStalls} stalls`,
      ];
      return joinParagraphs(
        `Here’s a quick summary for ${stats.today}:`,
        summaryLines.join("\n"),
        "You can also ask for unpaid records or monthly totals."
      );
    case "overdue":
      if (!hasStat(stats.overdueCount)) {
        return missingDataReply;
      }
      if (stats.overdueCount === 0) {
        return "Good news — there are no overdue accounts right now.";
      }
      const overdueBlock =
        count > 0
          ? joinParagraphs("Here are the overdue records:", records.map((record, index) => formatRecordLine(record, index)).join("\n"))
          : undefined;
      return joinParagraphs(
        `There are ${stats.overdueCount} overdue account(s), totaling ${formatCurrency(total)}${timeframeText ? ` ${timeframeText}` : ""}.`,
        overdueBlock
      );
    case "update":
      if (
        !hasStat(stats.totalMonth) ||
        !hasStat(stats.paidCount) ||
        !hasStat(stats.unpaidCount) ||
        !hasStat(stats.totalStalls)
      ) {
        return missingDataReply;
      }
      const updateSection = joinParagraphs(
        "Update snapshot:",
        `* Total collected: ${formatCurrency(stats.totalMonth)}`,
        `* Paid: ${stats.paidCount} | Unpaid: ${stats.unpaidCount}`,
        `* Stalls: ${stats.totalStalls} (${stats.activeVendors} active)`
      );
      const previewRecord =
        count > 0
          ? `Sample: ${formatRecordLine(records[0], 0)}${count > 1 ? ` ...and ${count - 1} more.` : ""}`
          : undefined;
      const latestTransaction =
        recentTransactions.length > 0 ? `Latest: ${formatRecentTransactionLine(recentTransactions[0])}` : undefined;
      return joinParagraphs(updateSection, previewRecord, latestTransaction, "Need unpaid details or today’s summary?");
    case "collector_updates":
      if (!isAdmin) {
        return COLLECTOR_UNAUTHORIZED_MSG;
      }
      if (!collectors.length) {
        return missingDataReply;
      }
      const sortedCollectors = [...collectors].sort(
        (a, b) =>
          b.collectionsToday - a.collectionsToday ||
          b.unpaidAssignedStalls - a.unpaidAssignedStalls
      );
      const collectorLines = sortedCollectors.map(formatCollectorLine).join("\n");
      const recentBlock =
        recentTransactions.length > 0
          ? `Recent transactions:\n${recentTransactions
              .slice(0, 3)
              .map((transaction) => formatRecentTransactionLine(transaction))
              .join("\n")}`
          : undefined;
      return joinParagraphs(
        "Here’s the latest collector update:",
        collectorLines,
        recentBlock,
        "You can also ask who collected the most today or who needs follow-up."
      );
    case "top_collector":
      if (!isAdmin) {
        return COLLECTOR_UNAUTHORIZED_MSG;
      }
      if (!collectors.length) {
        return missingDataReply;
      }
      const bestCollector = collectors.reduce((prev, current) =>
        current.collectionsToday > prev.collectionsToday ? current : prev
      );
      if (!hasStat(bestCollector.collectionsToday) || bestCollector.collectionsToday <= 0) {
        return "No collections recorded for today yet.";
      }
      return joinParagraphs(
        `${bestCollector.name} is leading the collections today with ${formatCurrency(bestCollector.collectionsToday)}.`,
        `${bestCollector.unpaidAssignedStalls} unpaid stall(s) remain assigned to them.`
      );
    case "top_unpaid":
      if (!isAdmin) {
        return COLLECTOR_UNAUTHORIZED_MSG;
      }
      if (!collectors.length) {
        return missingDataReply;
      }
      const mostUnpaid = collectors.reduce((prev, current) =>
        current.unpaidAssignedStalls > prev.unpaidAssignedStalls ? current : prev
      );
      if (!hasStat(mostUnpaid.unpaidAssignedStalls) || mostUnpaid.unpaidAssignedStalls === 0) {
        return "Great news — there are no unpaid stalls reported today.";
      }
      return joinParagraphs(
        `${mostUnpaid.name} still has the most unpaid stalls (${mostUnpaid.unpaidAssignedStalls}).`,
        `They’ve collected ${formatCurrency(mostUnpaid.collectionsToday)} so far today.`
      );
    case "needs_follow_up":
      if (!isAdmin) {
        return COLLECTOR_UNAUTHORIZED_MSG;
      }
      if (!collectors.length) {
        return missingDataReply;
      }
      const followUpList = [...collectors]
        .sort((a, b) => b.unpaidAssignedStalls - a.unpaidAssignedStalls)
        .slice(0, 3);
      if (!followUpList.length) {
        return "Everyone is caught up today.";
      }
      const followUpLines = followUpList
        .map((collector) => `${collector.name}: ${collector.unpaidAssignedStalls} unpaid stall(s)`)
        .join("\n");
      return joinParagraphs(
        "These collectors may need follow-up:",
        followUpLines,
        "You can ask for their latest updates or the collector performance list."
      );
    case "dashboard_insight":
      if (!hasStat(stats.totalToday) || !hasStat(stats.totalMonth) || !hasStat(stats.unpaidCount)) {
        return missingDataReply;
      }
      const insightLines = [
        `* Today’s collection: ${formatCurrency(stats.totalToday)}`,
        `* Month-to-date: ${formatCurrency(stats.totalMonth)}`,
        `* Unpaid records: ${stats.unpaidCount}, Overdue: ${stats.overdueCount}`,
        `* Active vendors: ${stats.activeVendors} / ${stats.totalStalls} stalls`,
      ];
      const insightRecent =
        recentTransactions.length > 0 ? `Today’s latest payment: ${formatRecentTransactionLine(recentTransactions[0])}` : undefined;
      const sortedByCollected = [...collectors].sort((a, b) => b.collectionsToday - a.collectionsToday);
      const topCollectorInsight = sortedByCollected[0];
      const topInsight =
        topCollectorInsight && hasStat(topCollectorInsight.collectionsToday)
          ? `Top collector: ${topCollectorInsight.name} (${formatCurrency(
              topCollectorInsight.collectionsToday
            )}), with ${topCollectorInsight.unpaidAssignedStalls} unpaid stall(s).`
          : undefined;
      return joinParagraphs(
        "Here’s what stands out today:",
        insightLines.join("\n"),
        topInsight,
        insightRecent,
        "You can also ask for a collector update or who needs follow-up."
      );
    case "history":
      if (!isAdmin) {
        return COLLECTOR_UNAUTHORIZED_MSG;
      }
      if (records.length === 0) {
        return "No recorded payments found for today.";
      }
      const historyLines = records.map((record, index) => formatRecordLine(record, index)).join("\n");
      return joinParagraphs(
        "Here’s the full recorded history of payments today (all recorded entries):",
        historyLines,
        "You can also request the monthly totals or collector leaderboard."
      );
    case "stalls":
      if (!hasStat(stats.totalStalls) || !hasStat(stats.vacantStalls)) {
        return missingDataReply;
      }
      const occupied = stats.totalStalls - stats.vacantStalls;
      return joinParagraphs(
        `Sure! I currently track ${stats.totalStalls} stalls/vendors (${occupied} occupied, ${stats.vacantStalls} vacant).`,
        "Ask me about active vendors or totals."
      );
    case "my_collections":
      if (!hasStat(stats.myCollectionsToday)) {
        return missingDataReply;
      }
      return joinParagraphs(
        "Got it. Here's your collection for today:",
        `${formatCurrency(stats.myCollectionsToday)}`,
        "You can also check your unpaid assigned stalls or your summary."
      );
    case "my_unpaid":
      if (!hasStat(stats.myUnpaidCount)) {
        return missingDataReply;
      }
      return joinParagraphs(
        `Sure, you have ${stats.myUnpaidCount} unpaid assigned stall(s).`,
        "Need me to pull up the unpaid list or your pending collections?"
      );
    case "my_assigned":
      if (!hasStat(stats.myAssignedStallsCount)) {
        return missingDataReply;
      }
      return joinParagraphs(
        `You have ${stats.myAssignedStallsCount} assigned stall(s).`,
        "You can also ask for unpaid records or your summary today."
      );
    case "my_pending":
      if (!hasStat(stats.myPendingAmount)) {
        return missingDataReply;
      }
      return joinParagraphs(
        `Your pending collections total ${formatCurrency(stats.myPendingAmount)}.`,
        "Want me to show unpaid assigned stalls or your summary?"
      );
    case "my_summary":
      if (!hasStat(stats.mySummaryCount) || !hasStat(stats.myCollectionsToday)) {
        return missingDataReply;
      }
      return joinParagraphs(
        `Here’s your summary for ${stats.today}:`,
        `* Payments recorded: ${stats.mySummaryCount}`,
        `* Total collected: ${formatCurrency(stats.myCollectionsToday)}`,
        "You can also check unpaid assigned stalls or your pending collections."
      );
    default:
      return joinParagraphs(
        "I can help with unpaid today, total this month, summary today, overdue accounts, collector updates, or total stalls.",
        "Try one of those phrases or ask for collector performance."
      );
  }
};

export const generateResponse = (
  result: ChatResult,
  systemStats: DashboardStats,
  stalls: StallRecord[] = []
): string => {
  if (result.query.intent === "social" && result.query.socialIntent) {
    return getSocialResponse(result.query.socialIntent);
  }
  return getPaymentResponse(result, systemStats, stalls);
};

interface PaymentChatAssistantProps {
  records: Invoice[];
  systemStats: DashboardStats;
  variant?: "page" | "panel";
}

interface ChatMessageItem {
  sender: "bot" | "user";
  text: string;
}

export const PaymentChatAssistant = ({
  records,
  systemStats,
  variant = "panel",
}: PaymentChatAssistantProps) => {
  const initialGreeting = getRoleAwareGreeting(systemStats);
  const [messages, setMessages] = useState<ChatMessageItem[]>([{ sender: "bot", text: initialGreeting }]);
  const [inputValue, setInputValue] = useState("");
  const [context, setContext] = useState<ChatQuery | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [navOffset, setNavOffset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const normalizedRole = systemStats.role?.toLowerCase();
  const isAdmin = normalizedRole === "admin";
  const isPageVariant = variant === "page";
  const composerBottomOffset = keyboardInset || 0;
  const messageListSpacerHeight = isPageVariant
    ? composerHeight + composerBottomOffset + navOffset + 8
    : 0;
  const quickSuggestions = isAdmin
    ? [
        "unpaid today",
        "total this month",
        "summary today",
        "overdue accounts",
        "collection update",
        "total stalls",
        "show all collectors performance",
        "dashboard update",
        "show me full history of payments today",
      ]
    : [
        "my collections today",
        "my pending collections",
        "my unpaid assigned stalls",
        "my summary today",
        "my assigned stalls",
      ];

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage = { sender: "user", text: trimmed };
    const parsedQuery = parseQuery(trimmed);
    let botText = "";

    if (parsedQuery.intent === "unknown") {
      botText = getUnknownResponse(trimmed, systemStats);
    } else if (parsedQuery.intent === "social" && parsedQuery.socialIntent) {
      if (parsedQuery.socialIntent === "greet") {
        botText = getRoleAwareGreeting(systemStats);
      } else {
        botText = getSocialResponse(parsedQuery.socialIntent);
      }
    } else {
      const effectiveQuery = mergeWithContext(parsedQuery, context);
      if (effectiveQuery.intent === "payment" && effectiveQuery.paymentIntent) {
        const result = filterRecords(effectiveQuery, records);
        botText = getPaymentResponse(result, systemStats, result.records);
        setContext(effectiveQuery);
      } else if (effectiveQuery.intent === "unknown") {
        botText = joinParagraphs(
        "I'm sorry — I don’t know how to reply to that yet.",
          "Try asking about unpaid today, total this month, summary today, overdue accounts, collector updates, or total stalls."
        );
      } else {
        botText = joinParagraphs(
          "I can help with unpaid today, total this month, summary today, overdue accounts, collector updates, or total stalls.",
          "If you'd like, try one of those exact phrases."
        );
      }
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    setMessages((current) => [...current, userMessage]);
    setInputValue("");
    setIsTyping(true);

    const responseDelay = getTypingDelay(botText);
    typingTimerRef.current = setTimeout(() => {
      setMessages((current) => [...current, { sender: "bot", text: botText }]);
      setIsTyping(false);
      typingTimerRef.current = null;
    }, responseDelay);
  };

  const handleSend = () => handleSendMessage(inputValue);
  const handleSuggestionClick = (suggestion: string) => handleSendMessage(suggestion);

  useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    requestAnimationFrame(scrollToBottom);
  }, [messages, isTyping]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    const measureLayout = () => {
      const nextKeyboardInset = viewport
        ? Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop)))
        : 0;

      setKeyboardInset(nextKeyboardInset > 120 ? nextKeyboardInset : 0);

      const navElement = document.getElementById("mobile-bottom-nav-bar");
      if (!navElement) {
        setNavOffset(0);
      } else {
        const rect = navElement.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(rect.height, window.innerHeight - rect.top));
        setNavOffset(visibleHeight > 0 ? Math.round(visibleHeight) : 0);
      }

      if (composerRef.current) {
        setComposerHeight(Math.round(composerRef.current.getBoundingClientRect().height));
      }
    };

    const requestMeasure = () => {
      requestAnimationFrame(measureLayout);
    };

    requestMeasure();
    viewport?.addEventListener("resize", requestMeasure);
    viewport?.addEventListener("scroll", requestMeasure);
    window.addEventListener("resize", requestMeasure);
    window.addEventListener("scroll", requestMeasure, { passive: true });
    window.addEventListener("orientationchange", requestMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestMeasure) : null;
    if (resizeObserver && composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }

    const navElement = document.getElementById("mobile-bottom-nav-bar");
    if (resizeObserver && navElement) {
      resizeObserver.observe(navElement);
    }

    return () => {
      viewport?.removeEventListener("resize", requestMeasure);
      viewport?.removeEventListener("scroll", requestMeasure);
      window.removeEventListener("resize", requestMeasure);
      window.removeEventListener("scroll", requestMeasure);
      window.removeEventListener("orientationchange", requestMeasure);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const renderedMessages = useMemo(
    () => (
      <>
        {messages.map((message, index) => {
          const previousSender = index > 0 ? messages[index - 1].sender : null;
          const spacingFromPrevious = index === 0 ? 0 : previousSender === message.sender ? 4 : 16;

          return (
            <div
              key={`${message.sender}-${index}`}
              className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
              style={{ marginTop: spacingFromPrevious }}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3.5 text-sm leading-7 shadow-sm ${
                  message.sender === "user"
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {message.text}
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div
            className="flex justify-start"
            style={{
              marginTop:
                messages.length > 0 && messages[messages.length - 1].sender === "bot" ? 4 : 16,
            }}
          >
            <div className="typing-indicator" role="status" aria-live="polite" aria-label="Assistant is typing">
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
            </div>
          </div>
        )}
        {isPageVariant && <div style={{ height: messageListSpacerHeight }} aria-hidden="true" />}
        <div ref={messagesEndRef} aria-hidden="true" />
      </>
    ),
    [isPageVariant, isTyping, messageListSpacerHeight, messages]
  );

  return (
    <div
      className={
        isPageVariant
          ? "flex flex-col"
          : "flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:min-h-0"
      }
    >
      {!isPageVariant && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold">SMP AI Agent</h2>
          <p className="text-sm text-muted-foreground">
            Ask casually: "How many unpaid invoices today?" or "Show overdue records." Follow up with "total?" and I'll keep the context.
          </p>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className={
          isPageVariant
            ? "flex flex-col"
            : "flex flex-1 flex-col gap-3 overflow-y-auto px-1 pb-3 md:flex-none"
        }
        style={{
          maxHeight: isPageVariant ? undefined : 380,
          WebkitOverflowScrolling: isPageVariant ? undefined : "touch",
          overscrollBehavior: isPageVariant ? undefined : "contain",
        }}
      >
        {renderedMessages}
      </div>

      <div
        ref={composerRef}
        className={
          isPageVariant
            ? "fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-background/95 pt-4 backdrop-blur md:sticky md:z-10"
            : "sticky bottom-0 mt-5 space-y-3 border-t border-slate-100 bg-white pt-4"
        }
        style={{
          bottom: isPageVariant ? composerBottomOffset : keyboardInset || undefined,
          paddingBottom: isPageVariant
            ? "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)"
            : "calc(env(safe-area-inset-bottom, 0px) + 0.25rem)",
        }}
      >
        <div className={isPageVariant ? "mx-auto w-full space-y-3 px-4 md:px-0" : ""}>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max gap-2 pr-2">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
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
              handleSend();
            }}
          >
            <input
              type="search"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSend();
                }
              }}
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
