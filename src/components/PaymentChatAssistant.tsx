import { useState, useEffect, useRef } from "react";
import { DashboardStats } from "@/data/dashboardStats";
import { Invoice } from "./UnpaidDues";
import "./PaymentChatAssistant.css";

export interface ChatQuery {
  text: string;
  intent: "social" | "payment" | "unknown";
  socialIntent?: "greet" | "thanks" | "bye" | "ok";
  paymentIntent?: "unpaid" | "total" | "summary" | "overdue" | "update" | "stalls";
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
const PAYMENT_PATTERNS: Array<{ intent: ChatQuery["paymentIntent"]; phrases: string[] }> = [
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
    intent: "stalls",
    phrases: ["total stalls", "stall count", "number of stalls", "total vendors", "vendor count"],
  },
];

// Break out alphabetic tokens so we only match greetings against whole words.
const tokenizeWords = (text: string) => {
  return text.match(/\b[a-zA-Z]+\b/g) ?? [];
};

const isGreeting = (text: string) => {
  const tokens = tokenizeWords(text);
  return tokens.some((token) => GREETING_WORDS.has(token.toLowerCase()));
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
    timeframe,
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

const formatRecordLine = (record: ChatRecord, index: number) =>
  `${index + 1}. ${record.name} • ${record.status.toUpperCase()} • ${formatCurrency(record.amount)} • ${record.date || "no date"}`;

// System instructions reminder: rely on the `systemStats` object, never invent totals, and do not ask users to supply system metrics.
const missingDataReply = "I don’t have that information available right now.";

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

export const getSocialResponse = (
  socialIntent: NonNullable<ChatQuery["socialIntent"]>
): string => {
  switch (socialIntent) {
    case "greet":
      return "Hi! 👋 I'm your MarketPay assistant. I can help with collections, unpaid records, totals, and summaries.";
    case "thanks":
      return "You're welcome! Let me know if you want to check anything else.";
    case "bye":
      return "Bye! 👋 I'm here anytime you need collection updates.";
    case "ok":
      return "Alright. Let me know if you want to check totals, unpaid records, or summaries.";
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
  const count = records.length;
  const total = records.reduce((sum, record) => sum + record.amount, 0);
  const timeframeText = timeframeLabel(query.timeframe);

  switch (query.paymentIntent) {
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
      return `Sure, here's what I found.\n\nTotal collection for ${timeframeText} is ${formatCurrency(amount)}.\n\nWould you like a summary or unpaid records?`;
    }
    case "unpaid": {
      if (count === 0) {
        return `I checked, and there are no unpaid records${timeframeText ? ` ${timeframeText}` : ""}. Great job staying on top of collections!`;
      }
      return `There are ${count} unpaid record(s)${timeframeText ? ` ${timeframeText}` : ""}, totaling ${formatCurrency(total)}. Ask me for a summary or overdue accounts if you'd like.`;
    }
    case "summary": {
      if (!hasStat(stats.totalToday) || !hasStat(stats.paidCount) || !hasStat(stats.unpaidCount)) {
        return missingDataReply;
      }
      return (
        `Here’s a quick summary for ${stats.today}:\n` +
        `* Total collected: ${formatCurrency(stats.totalToday)}\n` +
        `* Paid records: ${stats.paidCount}\n` +
        `* Unpaid records: ${stats.unpaidCount}\n\n` +
        "You can also ask for unpaid records or monthly totals."
      );
    }
    case "overdue": {
      if (!hasStat(stats.overdueCount)) {
        return missingDataReply;
      }
      if (stats.overdueCount === 0) {
        return "Good news — there are no overdue accounts right now.";
      }
      const preview =
        count > 0
          ? `\n\nHere are the overdue records:\n${records
              .map((record, index) => formatRecordLine(record, index))
              .join("\n")}`
          : "";
      return `There are ${stats.overdueCount} overdue account(s), totaling ${formatCurrency(total)}.${timeframeText ? ` ${timeframeText}` : ""}.${preview}`;
    }
    case "update": {
      if (
        !hasStat(stats.totalMonth) ||
        !hasStat(stats.paidCount) ||
        !hasStat(stats.unpaidCount) ||
        !hasStat(stats.totalStalls)
      ) {
        return missingDataReply;
      }
      const preview =
        count > 0
          ? `\n\nSample records:\n${records
              .slice(0, 2)
              .map((record, index) => formatRecordLine(record, index))
              .join("\n")}${count > 2 ? `\n...and ${count - 2} more records.` : ""}`
          : "";
      return (
        `Got it. Here’s the latest update:\n\n` +
        `* Total collected: ${formatCurrency(stats.totalMonth)}\n` +
        `* Paid records: ${stats.paidCount}\n` +
        `* Unpaid records: ${stats.unpaidCount}\n` +
        `* Total stalls: ${stats.totalStalls}` +
        preview +
        `\n\nYou can also ask me to show unpaid records or today’s summary.`
      );
    }
    case "stalls": {
      if (!hasStat(stats.totalStalls) || !hasStat(stats.vacantStalls)) {
        return missingDataReply;
      }
      const occupied = stats.totalStalls - stats.vacantStalls;
      return `Sure! I currently track ${stats.totalStalls} stalls/vendors (${occupied} occupied, ${stats.vacantStalls} vacant).`;
    }
    default:
      return "I can help with unpaid today, total this month, summary today, overdue accounts, collection update, or total stalls.";
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
}

export const PaymentChatAssistant = ({ records, systemStats }: PaymentChatAssistantProps) => {
  const [messages, setMessages] = useState([
    { sender: "bot", text: "Hi there — I'm your Sibulan Market Pay assistant. Ask me about unpaid records, totals, or overdue items." },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [context, setContext] = useState<ChatQuery | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quickSuggestions = [
    "unpaid today",
    "total this month",
    "summary today",
    "overdue accounts",
    "collection update",
    "total stalls",
  ];

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage = { sender: "user", text: trimmed };
    const parsedQuery = parseQuery(trimmed);
    let botText = "";

    if (parsedQuery.intent === "social" && parsedQuery.socialIntent) {
      botText = getSocialResponse(parsedQuery.socialIntent);
    } else {
      const effectiveQuery = mergeWithContext(parsedQuery, context);
      if (effectiveQuery.intent === "payment" && effectiveQuery.paymentIntent) {
        const result = filterRecords(effectiveQuery, records);
        botText = getPaymentResponse(result, systemStats, result.records);
        setContext(effectiveQuery);
      } else {
        botText =
          "I can help with unpaid today, total this month, summary today, overdue accounts, collection update, or total stalls. " +
          "If you'd like, try one of those exact phrases.";
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
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">SMP AI Agent</h2>
        <p className="text-sm text-muted-foreground">
          Ask casually: "How many unpaid invoices today?" or "Show overdue records." Follow up with "total?" and I'll keep the context.
        </p>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto pb-2" style={{ maxHeight: 380 }}>
        {messages.map((message, index) => (
          <div
            key={`${message.sender}-${index}`}
            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.sender === "user"
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-900"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="typing-indicator" role="status" aria-live="polite" aria-label="Assistant is typing">
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {quickSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
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
          type="button"
          onClick={handleSend}
          className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Send
        </button>
      </div>
    </div>
  );
};
