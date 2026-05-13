import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  DashboardStats,
  type CollectorInfo,
  type RecentTransaction,
} from "@/data/dashboardStats";
import { supabase } from "@/lib/supabaseClient";
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
  | "stall_lookup"
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
  | "my_route"
  | "help";

type Language = "en" | "bsy" | "tgl";

export interface ChatQuery {
  text: string;
  intent: "social" | "payment" | "unknown";
  socialIntent?: "greet" | "thanks" | "bye" | "ok";
  paymentIntent?: PaymentIntent;
  status?: "paid" | "unpaid" | "overdue";
  timeframe?: "today" | "this_month";
  collectorName?: string;
  stallQuery?: string;
  showMore?: boolean;
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
  isOnline?: boolean;
}

interface ChatMessageItem {
  id: string;
  sender: "bot" | "user";
  text: string;
  createdAt: Date;
  confirmQuery?: ChatQuery;
  examples?: string[];
}

type EdgeAssistantResponse = {
  reply?: string;
  message?: string;
  fallback?: boolean;
};

type EdgeAssistantHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type ResponseKey =
  | "greeting"
  | "thanks"
  | "bye"
  | "ok"
  | "unknown"
  | "rude"
  | "unauthorized"
  | "missingStats"
  | "baseHelp"
  | "helpIntro"
  | "total"
  | "noCollections"
  | "unpaid"
  | "noUnpaid"
  | "summaryTitle"
  | "noOverdue"
  | "overdue"
  | "updateTitle"
  | "collectorUpdate"
  | "noCollectors"
  | "topCollector"
  | "noTopCollector"
  | "topUnpaid"
  | "noTopUnpaid"
  | "followUp"
  | "noFollowUp"
  | "dashboardInsight"
  | "historyTitle"
  | "noHistory"
  | "stalls"
  | "noVacant"
  | "myCollections"
  | "myNoCollections"
  | "myUnpaid"
  | "myNoUnpaid"
  | "myAssigned"
  | "myPending"
  | "myNoPending"
  | "mySummaryTitle"
  | "stallNotFound"
  | "stallRestricted"
  | "stallTitle"
  | "myRouteTitle"
  | "myRouteEmpty"
  | "didYouMean"
  | "yesRun"
  | "copied"
  | "copy"
  | "staleData"
  | "inputPlaceholder"
  | "send";

type ResponseTemplateSet = Record<ResponseKey, string>;

const CHAT_LANGUAGE_KEY = "chat_language";
const CHAT_ASSISTANT_URL =
  "https://idokfqcmophowhtdjymi.supabase.co/functions/v1/chat-assistant";

const detectLanguageSwitch = (text: string): Language | null => {
  const lower = text.toLowerCase().trim();
  const englishTriggers = [
    "speak english",
    "english please",
    "mag english",
    "english na",
    "in english",
    "english only",
    "use english",
    "talk english",
  ];
  const bisayaTriggers = [
    "speak bisaya",
    "bisaya lang",
    "mag bisaya",
    "bisaya please",
    "in bisaya",
    "bisaya na",
    "use bisaya",
    "talk bisaya",
    "mag cebuano",
    "cebuano please",
    "speak cebuano",
  ];
  const tagalogTriggers = [
    "speak tagalog",
    "tagalog please",
    "mag tagalog",
    "tagalog lang",
    "in tagalog",
    "tagalog na",
    "use tagalog",
    "talk tagalog",
    "mag filipino",
    "filipino please",
    "speak filipino",
  ];

  if (englishTriggers.some((trigger) => lower.includes(trigger))) return "en";
  if (bisayaTriggers.some((trigger) => lower.includes(trigger))) return "bsy";
  if (tagalogTriggers.some((trigger) => lower.includes(trigger))) return "tgl";
  return null;
};

const getLanguageSwitchConfirmation = (nextLanguage: Language) => {
  if (nextLanguage === "bsy") return "Okay, mag-Bisaya na ko!";
  if (nextLanguage === "tgl") return "Sige, magta-Tagalog na ako mula ngayon!";
  return "Got it! I'll speak English from now on.";
};

const responses: Record<Language, ResponseTemplateSet> = {
  en: {
    greeting: "Hello {role} {name}! Ask 'help' to see what I can answer.",
    thanks: "You're welcome. Ask for another update anytime.",
    bye: "Bye. I'll be here when you need collection updates.",
    ok: "Got it. Ask 'help' if you want the available commands.",
    unknown: "I didn't catch a Market Pay request.",
    rude: "I'm here to help with Market Pay tasks.",
    unauthorized: "Sorry, that information is only available to administrators.",
    missingStats: "Refreshing data... Some dashboard fields are missing right now.",
    baseHelp: "I can help with collections, unpaid records, summaries, and stall information.",
    helpIntro: "Here's what you can ask me:",
    total: "Total collection for {timeframe}: {amount}.",
    noCollections: "No collections recorded yet today.",
    unpaid: "There are {count} unpaid record(s), totaling {amount}.",
    noUnpaid: "No unpaid records found {timeframe}.",
    summaryTitle: "Summary for {today}:",
    noOverdue: "Good news - there are no overdue accounts right now.",
    overdue: "There are {count} overdue account(s).",
    updateTitle: "Update snapshot:",
    collectorUpdate: "Latest collector update:",
    noCollectors: "No collector records are available right now.",
    topCollector: "{name} is leading today with {amount}.",
    noTopCollector: "No collections recorded for any collector today yet.",
    topUnpaid: "{name} has the most unpaid assigned stalls: {count}.",
    noTopUnpaid: "No unpaid assigned stalls are reported right now.",
    followUp: "Follow up with:",
    noFollowUp: "No follow-up priorities right now.",
    dashboardInsight: "Here's what stands out today:",
    historyTitle: "Recorded payment history today:",
    noHistory: "No recorded payments found for today.",
    stalls: "Tracked stalls: {total}. Occupied: {occupied}. Vacant: {vacant}.",
    noVacant: "All stalls are full.",
    myCollections: "{name}, your collections today total {amount}.",
    myNoCollections: "No collections recorded yet today.",
    myUnpaid: "{name}, you have {count} unpaid assigned stall(s).",
    myNoUnpaid: "All stalls in your section are paid.",
    myAssigned: "{name}, you have {count} assigned stall(s) in {section}.",
    myPending: "{name}, your pending collections total {amount}.",
    myNoPending: "{name}, no pending collection amount is recorded for your section.",
    mySummaryTitle: "Summary for {name} on {today}:",
    stallNotFound: "I couldn't find that stall.",
    stallRestricted: "That stall is outside your assigned section.",
    stallTitle: "Stall lookup:",
    myRouteTitle: "Your route today:",
    myRouteEmpty: "All stalls in your section are paid.",
    didYouMean: "Did you mean: {command}?",
    yesRun: "Yes, run this",
    copied: "Copied!",
    copy: "Copy",
    staleData: "Data may be outdated - last updated {time}.",
    inputPlaceholder: "Ask anything about payments...",
    send: "Send",
  },
  bsy: {
    greeting: "Kumusta {role} {name}! I-type ang 'tabang' para makita ang akong mahimo.",
    thanks: "Walay sapayan. Pangutana lang usab kung kinahanglan nimo ug update.",
    bye: "Sige, naa ra ko kung kinahanglan nimo ug collection updates.",
    ok: "Sige. I-type ang 'tabang' kung gusto nimo makita ang mga command.",
    unknown: "Wala nako nasabtan ang Market Pay request.",
    rude: "Naa ko diri para motabang sa Market Pay tasks.",
    unauthorized: "Pasayloa, pang-admin ra kana nga impormasyon.",
    missingStats: "Nag-refresh sa data... Naay kulang nga dashboard fields karon.",
    baseHelp: "Makatabang ko sa collections, unpaid records, summaries, ug stall information.",
    helpIntro: "Mao ni imong pwede ipangutana:",
    total: "Total collection sa {timeframe}: {amount}.",
    noCollections: "Wala pay nakolekta karon.",
    unpaid: "Naay {count} unpaid record(s), total {amount}.",
    noUnpaid: "Walay unpaid records nga nakita sa {timeframe}.",
    summaryTitle: "Summary sa {today}:",
    noOverdue: "Maayo! Walay overdue accounts karon.",
    overdue: "Naay {count} overdue account(s).",
    updateTitle: "Update snapshot:",
    collectorUpdate: "Pinakabag-ong collector update:",
    noCollectors: "Walay collector records nga available karon.",
    topCollector: "{name} ang nanguna karon gamit ang {amount}.",
    noTopCollector: "Wala pay nakolekta ang collectors karon.",
    topUnpaid: "{name} ang naay pinakadaghan unpaid assigned stalls: {count}.",
    noTopUnpaid: "Walay unpaid assigned stalls nga nareport karon.",
    followUp: "I-follow up ni:",
    noFollowUp: "Walay follow-up priorities karon.",
    dashboardInsight: "Mao ni ang importante karon:",
    historyTitle: "Payment history karon:",
    noHistory: "Walay recorded payments karon.",
    stalls: "Tracked stalls: {total}. Occupied: {occupied}. Vacant: {vacant}.",
    noVacant: "Puno na ang tanan nga stalls!",
    myCollections: "{name}, imong collections karon total {amount}.",
    myNoCollections: "Wala pay nakolekta karon.",
    myUnpaid: "{name}, naa kay {count} unpaid assigned stall(s).",
    myNoUnpaid: "Tanan nabayran na sa imong section!",
    myAssigned: "{name}, naa kay {count} assigned stall(s) sa {section}.",
    myPending: "{name}, imong pending collections total {amount}.",
    myNoPending: "{name}, walay pending collection amount sa imong section.",
    mySummaryTitle: "Summary para kang {name} sa {today}:",
    stallNotFound: "Wala nako nakit-i kana nga stall.",
    stallRestricted: "Kana nga stall gawas sa imong assigned section.",
    stallTitle: "Stall lookup:",
    myRouteTitle: "Imong route karon:",
    myRouteEmpty: "Tanan nabayran na sa imong section!",
    didYouMean: "Mao ba ni imong pasabot: {command}?",
    yesRun: "Oo, ipadayon",
    copied: "Nakopya!",
    copy: "Copy",
    staleData: "Basin karaan na ang data - last updated {time}.",
    inputPlaceholder: "Pangutana bahin sa payments...",
    send: "Send",
  },
  tgl: {
    greeting: "Kumusta {role} {name}! I-type ang 'tulong' para makita kung ano ang kaya kong sagutin.",
    thanks: "Walang anuman. Magtanong ka lang ulit para sa bagong update.",
    bye: "Sige. Nandito lang ako kapag kailangan mo ng collection updates.",
    ok: "Sige. I-type ang 'tulong' kung gusto mong makita ang commands.",
    unknown: "Hindi ko nakuha ang Market Pay request.",
    rude: "Nandito ako para tumulong sa Market Pay tasks.",
    unauthorized: "Paumanhin, pang-admin lang ang impormasyong iyon.",
    missingStats: "Nagre-refresh ng data... May kulang na dashboard fields ngayon.",
    baseHelp: "Makakatulong ako sa collections, unpaid records, summaries, at stall information.",
    helpIntro: "Ito ang pwede mong itanong:",
    total: "Total collection para sa {timeframe}: {amount}.",
    noCollections: "Wala pang nakolekta ngayon.",
    unpaid: "May {count} unpaid record(s), total {amount}.",
    noUnpaid: "Walang unpaid records na nakita sa {timeframe}.",
    summaryTitle: "Summary para sa {today}:",
    noOverdue: "Magaling! Walang overdue accounts ngayon.",
    overdue: "May {count} overdue account(s).",
    updateTitle: "Update snapshot:",
    collectorUpdate: "Pinakabagong collector update:",
    noCollectors: "Walang collector records na available ngayon.",
    topCollector: "{name} ang nangunguna ngayon na may {amount}.",
    noTopCollector: "Wala pang collections ang kahit sinong collector ngayon.",
    topUnpaid: "{name} ang may pinakamaraming unpaid assigned stalls: {count}.",
    noTopUnpaid: "Walang unpaid assigned stalls na nai-report ngayon.",
    followUp: "I-follow up ito:",
    noFollowUp: "Walang follow-up priorities ngayon.",
    dashboardInsight: "Ito ang mahalaga ngayon:",
    historyTitle: "Payment history ngayon:",
    noHistory: "Walang recorded payments ngayon.",
    stalls: "Tracked stalls: {total}. Occupied: {occupied}. Vacant: {vacant}.",
    noVacant: "Puno na ang lahat ng stalls!",
    myCollections: "{name}, ang collections mo ngayon ay {amount}.",
    myNoCollections: "Wala pang nakolekta ngayon.",
    myUnpaid: "{name}, mayroon kang {count} unpaid assigned stall(s).",
    myNoUnpaid: "Lahat bayad na sa iyong section!",
    myAssigned: "{name}, mayroon kang {count} assigned stall(s) sa {section}.",
    myPending: "{name}, ang pending collections mo ay {amount}.",
    myNoPending: "{name}, walang pending collection amount sa section mo.",
    mySummaryTitle: "Summary para kay {name} sa {today}:",
    stallNotFound: "Hindi ko mahanap ang stall na iyon.",
    stallRestricted: "Ang stall na iyon ay labas sa assigned section mo.",
    stallTitle: "Stall lookup:",
    myRouteTitle: "Route mo ngayon:",
    myRouteEmpty: "Lahat bayad na sa iyong section!",
    didYouMean: "Ito ba ang ibig mong sabihin: {command}?",
    yesRun: "Oo, ituloy",
    copied: "Nakopya!",
    copy: "Copy",
    staleData: "Maaaring luma na ang data - last updated {time}.",
    inputPlaceholder: "Magtanong tungkol sa payments...",
    send: "Send",
  },
};

const getResponse = (
  key: ResponseKey,
  lang: Language,
  vars: Record<string, string> = {}
) =>
  Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    responses[lang][key]
  );

const metricLabels: Record<Language, Record<string, string>> = {
  en: {
    totalCollected: "Total collected",
    paidRecords: "Paid records",
    unpaidRecords: "Unpaid records",
    activeVendors: "Active vendors",
    monthToDate: "Month-to-date collected",
    unpaid: "Unpaid",
    overdue: "Overdue",
    latest: "Latest",
    latestPayment: "Latest payment",
    vendor: "Vendor",
    status: "Status",
    lastPayment: "Last payment",
    nextDue: "Next due",
    amount: "Amount",
    paymentsRecorded: "Payments recorded",
    pendingAmount: "Pending amount",
  },
  bsy: {
    totalCollected: "Total nakolekta",
    paidRecords: "Paid records",
    unpaidRecords: "Unpaid records",
    activeVendors: "Active vendors",
    monthToDate: "Nakolekta niining bulana",
    unpaid: "Unpaid",
    overdue: "Overdue",
    latest: "Pinakabag-o",
    latestPayment: "Pinakabag-ong bayad",
    vendor: "Vendor",
    status: "Status",
    lastPayment: "Katapusang bayad",
    nextDue: "Sunod due",
    amount: "Amount",
    paymentsRecorded: "Recorded payments",
    pendingAmount: "Pending amount",
  },
  tgl: {
    totalCollected: "Total nakolekta",
    paidRecords: "Paid records",
    unpaidRecords: "Unpaid records",
    activeVendors: "Active vendors",
    monthToDate: "Nakolekta ngayong buwan",
    unpaid: "Unpaid",
    overdue: "Overdue",
    latest: "Pinakabago",
    latestPayment: "Pinakabagong bayad",
    vendor: "Vendor",
    status: "Status",
    lastPayment: "Huling bayad",
    nextDue: "Susunod na due",
    amount: "Amount",
    paymentsRecorded: "Recorded payments",
    pendingAmount: "Pending amount",
  },
};

const label = (language: Language, key: keyof typeof metricLabels.en) =>
  metricLabels[language][key];

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
  stall_lookup: {
    label: "stall lookup",
    collectorAllowed: true,
    examples: ["stall 12", "status of stall 12"],
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
  my_route: {
    label: "my route today",
    collectorAllowed: true,
    examples: ["my route today", "who should I visit"],
    requiredStats: ["collectorSection", "collectorName"],
  },
  help: {
    label: "help",
    collectorAllowed: true,
    examples: ["help", "commands", "what can you do"],
  },
};

const PAYMENT_PATTERNS: Array<{ intent: PaymentIntent; phrases: string[] }> = [
  { intent: "help", phrases: ["help", "commands", "what can you do", "tabang", "tulong", "unsa imong mabuhat", "ano kaya mo"] },
  { intent: "my_collections", phrases: ["my collections today", "my collection today", "collections for me", "akong collections", "akong nakolekta", "pila akong nakolekta", "aking collections", "aking nakolekta"] },
  { intent: "my_unpaid", phrases: ["my unpaid assigned stalls", "my unpaid stalls", "akong unpaid stalls", "kinsa wala kabayad sa ako", "sino hindi nagbayad sa section ko"] },
  { intent: "my_assigned", phrases: ["my assigned stalls", "my stalls", "assigned stalls", "akong stalls"] },
  { intent: "my_pending", phrases: ["my pending collections", "pending collections for me", "kulang pa nako kolektahon"] },
  { intent: "my_summary", phrases: ["my summary today", "summary for me today", "today summary for me", "akong summary karon"] },
  { intent: "my_route", phrases: ["my route today", "who should i visit", "akong route karon", "sino puntahan ko ngayon"] },
  { intent: "total", phrases: ["total today", "today total", "collection total today", "total this month", "monthly total", "pila ang nakolekta", "pila nakolekta karon", "magkano nakolekta", "magkano ang nakolekta ngayon", "pila ang bayad", "tag pila", "magkano total"] },
  { intent: "unpaid", phrases: ["unpaid today", "unpaid this month", "unpaid records", "pila ang bayad", "pila ang utang", "magkano ang bayad", "magkano ang utang", "sino ang may utang"] },
  { intent: "summary", phrases: ["summary today", "today summary", "collections today", "unsay summary karon", "unsay nahitabo karon", "ano ang summary ngayon", "ano ang nangyari ngayon"] },
  { intent: "overdue", phrases: ["overdue accounts", "overdue records", "overdue", "past due", "lapas due", "nalapas na bayad", "kinsa wala kabayad", "kinsa wala pa kabayad", "sino hindi nagbayad", "sino ang may utang", "wala kabayad"] },
  { intent: "update", phrases: ["collection update", "latest collection", "latest update", "collection status"] },
  { intent: "collector_updates", phrases: ["collector update", "collector performance", "show all collectors performance"] },
  { intent: "top_collector", phrases: ["who collected the most today", "top collector", "highest collection today", "leaderboard", "kinsa nag-una", "kinsa pinaka daghan nakolekta", "sino nangunguna", "sino pinaka maraming nakolekta"] },
  { intent: "top_unpaid", phrases: ["who has the most unpaid stalls", "most unpaid stalls", "highest unpaid stalls"] },
  { intent: "needs_follow_up", phrases: ["who needs follow-up", "follow-up needed", "who needs attention", "prioritize unpaid", "kinsa nagkulang", "kinsa wala makolektahan", "sino kulang", "sino hindi pa nakakolekta"] },
  { intent: "dashboard_insight", phrases: ["dashboard update", "what stands out today", "current dashboard summary"] },
  { intent: "history", phrases: ["full history of payments today", "payment history today", "today's payment history"] },
  { intent: "stall_lookup", phrases: ["status of stall", "last payment of stall", "unsa ang stall", "ano ang stall"] },
  { intent: "stalls", phrases: ["total stalls", "stall count", "number of stalls", "total vendors", "vendor count", "pila ang stalls", "pila ang vendors", "ilang stalls", "ilang vendors"] },
];

const GREETING_WORDS = new Set(["hi", "hello", "hey", "maayong", "kumusta"]);
const RUDE_WORDS = new Set(["fuck", "fck", "shit", "stupid", "idiot", "bobo", "gago", "tanga", "ulol"]);
const SOCIAL_PATTERNS = {
  thanks: ["thanks", "thank you", "salamat", "daghang salamat", "maraming salamat"],
  bye: ["bye", "goodbye", "see you", "later", "paalam", "amping"],
  ok: ["okay", "ok", "alright", "sige", "cge"],
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
  if (includesAny(text, ["overdue", "past due", "lapas due", "nalapas", "nagkulang", "kulang"])) return "overdue";
  if (includesAny(text, ["unpaid", "not paid", "wala kabayad", "wala pa kabayad", "hindi nagbayad", "may utang", "utang"])) return "unpaid";
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

const extractCollectorName = (text: string) => {
  const match = text.match(/\b(?:collector|kolektor)\s+([\p{L}\s.'-]+)$/iu);
  return match?.[1]?.trim();
};

const extractStallQuery = (text: string) => {
  const match =
    text.match(/\b(?:status of stall|last payment of stall|unsa ang stall|ano ang stall|stall)\s+([\p{L}\p{N}\s.'#-]+)$/iu);
  const value = match?.[1]?.trim();
  if (!value || includesAny(value.toLowerCase(), ["count", "counts", "total", "pila", "ilang"])) return undefined;
  return value;
};

const isShowMoreRequest = (text: string) =>
  includesAny(text, ["show me more", "show more", "taas pa", "ipakita pa", "pakita pa", "ipa-ita pa"]);

const isBalancePhrase = (text: string) =>
  includesAny(text, ["pila ang bayad", "pila ang utang", "magkano ang bayad", "magkano ang utang"]);

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
  return { intent: bestScore >= 2 ? bestIntent : undefined, confidence: "low" };
};

export const parseQuery = (input: string): ChatQuery => {
  const text = input.trim().toLowerCase();
  const socialIntent = detectSocialIntent(text);

  const stallQuery = extractStallQuery(text);
  if (stallQuery) {
    return {
      text,
      intent: "payment",
      paymentIntent: "stall_lookup",
      stallQuery,
      confidence: "high",
    };
  }

  if (isBalancePhrase(text)) {
    return {
      text,
      intent: "payment",
      paymentIntent: "unpaid",
      status: "unpaid",
      confidence: "high",
    };
  }

  if (isShowMoreRequest(text)) {
    return { text, intent: "unknown", showMore: true, confidence: "high" };
  }

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
      collectorName: extractCollectorName(text),
      confidence: detected.confidence,
    };
  }

  if (socialIntent) return { text, intent: "social", socialIntent, confidence: "high" };
  return { text, intent: "unknown", collectorName: extractCollectorName(text), confidence: "low" };
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

const statusIndicator = (status: string | undefined | null) => {
  const normalized = status?.toLowerCase();
  if (normalized === "overdue") return "🔴";
  if (normalized === "due" || normalized === "unpaid") return "🟡";
  if (normalized === "paid" || normalized === "current") return "🟢";
  if (normalized === "vacant") return "⚪";
  return "⚪";
};

const formatTimeframe = (timeframe: ChatQuery["timeframe"], lang: Language) => {
  if (timeframe === "this_month") {
    if (lang === "bsy") return "niining bulana";
    if (lang === "tgl") return "buwang ito";
    return "this month";
  }
  if (lang === "bsy") return "karon";
  if (lang === "tgl") return "ngayon";
  return "today";
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
    ? [
        "my collections today / akong collections",
        "my unpaid assigned stalls / akong unpaid stalls",
        "my summary today / akong summary karon",
        "my pending collections",
        "my assigned stalls",
        "my route today / akong route karon",
        "stall [name or number]",
        "help",
      ]
    : [
        "unpaid today / total this month",
        "summary today / overdue accounts",
        "show all collectors performance",
        "top collector / who needs follow up",
        "dashboard update",
        "full history of payments today",
        "stall [name or number]",
        "help",
      ];

const unauthorizedMessage = (stats: DashboardStats, language: Language) =>
  [
    getResponse("unauthorized", language),
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
  const collectorFollowUp = query.intent === "unknown" && query.collectorName;
  const showMoreFollowUp = query.intent === "unknown" && query.showMore;

  if (vagueTimeframeOnly || vagueStatusOnly || collectorFollowUp || showMoreFollowUp) {
    return {
      ...context,
      text: query.text,
      status: extractStatus(query.text) ?? context.status,
      timeframe: extractTimeframe(query.text) ?? context.timeframe,
      collectorName: query.collectorName ?? context.collectorName,
      showMore: query.showMore ?? context.showMore,
      confidence: "high",
    };
  }

  if (query.intent !== "payment") return query;
  return {
    ...query,
    status: query.status ?? context.status,
    timeframe: query.timeframe ?? context.timeframe,
    collectorName: query.collectorName ?? context.collectorName,
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

  if (query.collectorName) {
    const collectorName = query.collectorName.toLowerCase();
    filtered = filtered.filter((record) => record.collector.toLowerCase().includes(collectorName));
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
  return `${statusIndicator(record.status)} ${index + 1}. ${record.name} - ${record.status.toUpperCase()} - ${formatAmount(record.amount)} - ${record.date || "date unavailable"}${note}`;
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

const fetchEdgeAssistantResponse = async (
  message: string,
  stats: DashboardStats,
  language: Language,
  history: EdgeAssistantHistoryItem[]
): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    console.warn("Missing Supabase auth token. Using scripted assistant fallback.");
    throw new Error("Missing Supabase auth token.");
  }

  const role = stats.role?.toLowerCase() === "admin" ? "admin" : "collector";
  const userId = stats.collectorId ?? "";
  if (!userId) {
    console.warn("Missing user id for chat assistant request. Using scripted assistant fallback.");
    throw new Error("Missing user id.");
  }

  const response = await fetch(CHAT_ASSISTANT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      history: history.slice(-5),
      role,
      full_name: stats.collectorName ?? "Unknown user",
      market_section: role === "admin" ? "all" : stats.collectorSection ?? "unassigned",
      user_id: userId,
      language,
    }),
  });

  let responseBody: EdgeAssistantResponse | null = null;
  try {
    responseBody = (await response.json()) as EdgeAssistantResponse;
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    console.warn("Chat assistant function failed", response.status, responseBody);
    throw new Error("Chat assistant request failed.");
  }

  if (responseBody?.fallback || !responseBody?.reply) {
    console.warn("Chat assistant requested scripted fallback", responseBody?.message);
    throw new Error("Chat assistant fallback requested.");
  }

  return responseBody.reply.trim();
};

const getHelpResponse = (stats: DashboardStats, language: Language) => {
  const examples = roleExamples(stats);
  return joinParagraphs(
    getResponse("helpIntro", language),
    examples.map((example) => `• ${example}`).join("\n")
  );
};

const getSocialResponse = (
  socialIntent: NonNullable<ChatQuery["socialIntent"]>,
  stats: DashboardStats,
  language: Language
) => {
  if (socialIntent === "greet") {
    const role = stats.role?.toLowerCase() === "admin" ? "admin" : "collector";
    const name = stats.collectorName?.trim() ?? "";
    return getResponse("greeting", language, { role, name });
  }
  if (socialIntent === "thanks") return getResponse("thanks", language);
  if (socialIntent === "bye") return getResponse("bye", language);
  return getResponse("ok", language);
};

const missingStatsResponse = (language: Language) => getResponse("missingStats", language);

const canSeeStall = (stall: StallRecord, stats: DashboardStats) => {
  if (!isCollector(stats)) return true;
  return stall.section === stats.collectorSection;
};

const findStall = (stalls: StallRecord[], query: string) => {
  const normalized = query.toLowerCase().replace(/^#/, "").trim();
  return stalls.find((stall) => {
    const id = String(stall.dbId);
    return (
      id === normalized ||
      stall.name.toLowerCase() === normalized ||
      stall.name.toLowerCase().includes(normalized) ||
      stall.vendor.toLowerCase().includes(normalized)
    );
  });
};

const formatStallLine = (stall: StallRecord) =>
  `${statusIndicator(stall.status)} ${stall.name} - ${stall.vendor || "Vacant"} - ${formatAmount(stall.rentAmount)} - ${stall.status.toUpperCase()}`;

const getStallLookupResponse = (
  query: ChatQuery,
  stats: DashboardStats,
  stalls: StallRecord[],
  language: Language
) => {
  const stallQuery = query.stallQuery?.trim();
  if (!stallQuery) return getResponse("stallNotFound", language);
  const stall = findStall(stalls, stallQuery);
  if (!stall) return getResponse("stallNotFound", language);
  if (!canSeeStall(stall, stats)) return getResponse("stallRestricted", language);

  return joinParagraphs(
    getResponse("stallTitle", language),
    [
      `${statusIndicator(stall.status)} ${stall.name}`,
      `${label(language, "vendor")}: ${stall.vendor || "Vacant"}`,
      `${label(language, "status")}: ${stall.status.toUpperCase()}`,
      `${label(language, "lastPayment")}: ${stall.lastPayment || "date unavailable"}`,
      `${label(language, "nextDue")}: ${stall.nextDue || "date unavailable"}`,
      `${label(language, "amount")}: ${formatAmount(stall.rentAmount)}`,
    ].join("\n")
  );
};

const getMyRouteResponse = (
  stats: DashboardStats,
  stalls: StallRecord[],
  language: Language
) => {
  if (!isCollector(stats)) return unauthorizedMessage(stats, language);
  const section = stats.collectorSection;
  const routeStalls = stalls
    .filter((stall) => stall.section === section && (stall.status === "overdue" || stall.status === "due"))
    .sort((a, b) => {
      const priority = (status: string) => (status === "overdue" ? 0 : 1);
      return priority(a.status) - priority(b.status);
    });

  if (!routeStalls.length) return getResponse("myRouteEmpty", language);
  return joinParagraphs(
    getResponse("myRouteTitle", language),
    routeStalls.map(formatStallLine).join("\n")
  );
};

export const getPaymentResponse = (
  result: ChatResult,
  stats: DashboardStats,
  records: ChatRecord[],
  language: Language = "en",
  stalls: StallRecord[] = []
): string => {
  const intent = result.query.paymentIntent;
  if (!intent) return getResponse("baseHelp", language);
  if (intent === "help") return getHelpResponse(stats, language);
  if (!isAuthorized(result.query, stats)) return unauthorizedMessage(stats, language);
  if (!hasRequiredStats(intent, stats)) return missingStatsResponse(language);

  const count = records.length;
  const total = records.reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const timeframe = formatTimeframe(result.query.timeframe, language);
  const collectors = collectorsFromStats(stats);
  const recent = recentTransactionsFromStats(stats);

  switch (intent) {
    case "stall_lookup":
      return getStallLookupResponse(result.query, stats, stalls, language);
    case "my_route":
      return getMyRouteResponse(stats, stalls, language);
    case "total": {
      const amount = result.query.timeframe === "this_month" ? stats.totalMonth : stats.totalToday;
      return amount > 0
        ? getResponse("total", language, { timeframe, amount: formatAmount(amount) })
        : getResponse("noCollections", language);
    }
    case "unpaid":
      return count > 0
        ? joinParagraphs(
            getResponse("unpaid", language, { count: String(count), amount: formatAmount(total) }),
            records.map(formatRecordLine).join("\n")
          )
        : getResponse("noUnpaid", language, { timeframe });
    case "summary":
      return joinParagraphs(
        getResponse("summaryTitle", language, { today: stats.today }),
        [
          `* ${label(language, "totalCollected")}: ${formatAmount(stats.totalToday)}`,
          `* ${label(language, "paidRecords")}: ${stats.paidCount}`,
          `* ${label(language, "unpaidRecords")}: ${stats.unpaidCount}`,
          `* ${label(language, "activeVendors")}: ${stats.activeVendors} of ${stats.totalStalls} stalls`,
        ].join("\n")
      );
    case "overdue":
      if (stats.overdueCount === 0) return getResponse("noOverdue", language);
      return joinParagraphs(
        getResponse("overdue", language, { count: String(stats.overdueCount) }),
        records.length ? records.map(formatRecordLine).join("\n") : undefined
      );
    case "update":
      return joinParagraphs(
        getResponse("updateTitle", language),
        `* ${label(language, "monthToDate")}: ${formatAmount(stats.totalMonth)}
* ${label(language, "paidRecords")}: ${stats.paidCount}
* ${label(language, "unpaidRecords")}: ${stats.unpaidCount}
* ${label(language, "activeVendors")}: ${stats.activeVendors} of ${stats.totalStalls}`,
        recent[0] ? `${label(language, "latest")}: ${formatRecentTransactionLine(recent[0])}` : undefined
      );
    case "collector_updates":
      return collectors.length
        ? joinParagraphs(getResponse("collectorUpdate", language), collectors.map(formatCollectorLine).join("\n"))
        : getResponse("noCollectors", language);
    case "top_collector": {
      const top = [...collectors].sort((a, b) => b.collectionsToday - a.collectionsToday)[0];
      return top && top.collectionsToday > 0
        ? getResponse("topCollector", language, { name: top.name, amount: formatAmount(top.collectionsToday) })
        : getResponse("noTopCollector", language);
    }
    case "top_unpaid": {
      const top = [...collectors].sort((a, b) => b.unpaidAssignedStalls - a.unpaidAssignedStalls)[0];
      return top && top.unpaidAssignedStalls > 0
        ? getResponse("topUnpaid", language, { name: top.name, count: String(top.unpaidAssignedStalls) })
        : getResponse("noTopUnpaid", language);
    }
    case "needs_follow_up": {
      const list = [...collectors]
        .filter((collector) => collector.unpaidAssignedStalls > 0)
        .sort((a, b) => b.unpaidAssignedStalls - a.unpaidAssignedStalls)
        .slice(0, result.query.showMore ? undefined : 3);
      return list.length
        ? joinParagraphs(getResponse("followUp", language), list.map((collector) => `* ${collector.name}: ${collector.unpaidAssignedStalls} unpaid stall(s)`).join("\n"))
        : getResponse("noFollowUp", language);
    }
    case "dashboard_insight":
      return joinParagraphs(
        getResponse("dashboardInsight", language),
        `* Today: ${formatAmount(stats.totalToday)}
* ${label(language, "monthToDate")}: ${formatAmount(stats.totalMonth)}
* ${label(language, "unpaid")}: ${stats.unpaidCount}
* ${label(language, "overdue")}: ${stats.overdueCount}
* ${label(language, "activeVendors")}: ${stats.activeVendors} of ${stats.totalStalls}`,
        recent[0] ? `${label(language, "latestPayment")}: ${formatRecentTransactionLine(recent[0])}` : undefined
      );
    case "history":
      return records.length
        ? joinParagraphs(getResponse("historyTitle", language), records.map(formatRecordLine).join("\n"))
        : getResponse("noHistory", language);
    case "stalls": {
      const occupied = stats.totalStalls - stats.vacantStalls;
      if (stats.vacantStalls === 0) return getResponse("noVacant", language);
      return getResponse("stalls", language, {
        total: String(stats.totalStalls),
        occupied: String(occupied),
        vacant: String(stats.vacantStalls),
      });
    }
    case "my_collections":
      return stats.myCollectionsToday && stats.myCollectionsToday > 0
        ? getResponse("myCollections", language, { name: stats.collectorName ?? "Collector", amount: formatAmount(stats.myCollectionsToday) })
        : getResponse("myNoCollections", language);
    case "my_unpaid":
      return (stats.myUnpaidCount ?? 0) > 0
        ? getResponse("myUnpaid", language, { name: stats.collectorName ?? "Collector", count: String(stats.myUnpaidCount ?? 0) })
        : getResponse("myNoUnpaid", language);
    case "my_assigned":
      return getResponse("myAssigned", language, {
        name: stats.collectorName ?? "Collector",
        count: String(stats.myAssignedStallsCount ?? 0),
        section: stats.collectorSection ?? "your section",
      });
    case "my_pending":
      return stats.myPendingAmount && stats.myPendingAmount > 0
        ? getResponse("myPending", language, { name: stats.collectorName ?? "Collector", amount: formatAmount(stats.myPendingAmount) })
        : getResponse("myNoPending", language, { name: stats.collectorName ?? "Collector" });
    case "my_summary":
      return joinParagraphs(
        getResponse("mySummaryTitle", language, { name: stats.collectorName ?? "collector", today: stats.today }),
        `* ${label(language, "paymentsRecorded")}: ${stats.mySummaryCount ?? 0}
* ${label(language, "totalCollected")}: ${formatAmount(stats.myCollectionsToday)}
* ${label(language, "unpaidRecords")}: ${stats.myUnpaidCount ?? 0}
* ${label(language, "pendingAmount")}: ${formatAmount(stats.myPendingAmount)}`
      );
    default:
      return getHelpResponse(stats, language);
  }
};

export const generateResponse = (
  result: ChatResult,
  systemStats: DashboardStats,
  records: ChatRecord[] = [],
  language: Language = "en",
  stalls: StallRecord[] = []
): string => {
  if (result.query.intent === "social" && result.query.socialIntent) {
    return getSocialResponse(result.query.socialIntent, systemStats, language);
  }
  return getPaymentResponse(result, systemStats, records, language, stalls);
};

export const PaymentChatAssistant = ({
  records,
  systemStats,
  stalls = [],
  variant = "panel",
  onRequestRefresh,
  isOnline,
}: PaymentChatAssistantProps) => {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof localStorage === "undefined") return "en";
    const saved = localStorage.getItem(CHAT_LANGUAGE_KEY);
    return saved === "bsy" || saved === "tgl" || saved === "en" ? saved : "en";
  });
  const initialGreeting = useMemo(() => getSocialResponse("greet", systemStats, language), [systemStats, language]);
  const initialGreetingRef = useRef(initialGreeting);
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    createBotMessage(initialGreetingRef.current),
  ]);
  const [inputValue, setInputValue] = useState("");
  const [context, setContext] = useState<ChatQuery | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isUsingBasicAssistant, setIsUsingBasicAssistant] = useState(() =>
    isOnline === undefined
      ? typeof navigator !== "undefined" && !navigator.onLine
      : !isOnline
  );
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [navOffset, setNavOffset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight
  );
  const [lastDataUpdatedAt, setLastDataUpdatedAt] = useState(() => new Date());
  const [dataJustUpdated, setDataJustUpdated] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedDataRef = useRef(false);
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
  const effectiveIsOnline =
    isOnline ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  const assistantMode = effectiveIsOnline && !isUsingBasicAssistant ? "ai" : "basic";

  useEffect(() => {
    localStorage.setItem(CHAT_LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    setIsUsingBasicAssistant(!effectiveIsOnline);
  }, [effectiveIsOnline]);

  useEffect(() => {
    if (hasMountedDataRef.current) {
      setDataJustUpdated(true);
      const timer = window.setTimeout(() => setDataJustUpdated(false), 2200);
      setLastDataUpdatedAt(new Date());
      return () => window.clearTimeout(timer);
    }
    hasMountedDataRef.current = true;
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

  const runQuery = (query: ChatQuery, responseLanguage: Language = language) => {
    if (query.intent === "payment" && query.paymentIntent) {
      if (!isAuthorized(query, systemStats)) {
        setContext(null);
        return unauthorizedMessage(systemStats, responseLanguage);
      }
      if (!hasRequiredStats(query.paymentIntent, systemStats)) {
        onRequestRefresh?.();
        return missingStatsResponse(responseLanguage);
      }
      const result = filterRecords(query, records);
      setContext(query);
      return getPaymentResponse(result, systemStats, result.records, responseLanguage, stalls);
    }
    if (query.intent === "social" && query.socialIntent) {
      setContext(null);
      return getSocialResponse(query.socialIntent, systemStats, responseLanguage);
    }
    return getUnknownResponse(query.text, systemStats, responseLanguage);
  };

  const handleSendMessage = async (text: string, forcedQuery?: ChatQuery) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const switchedLanguage = detectLanguageSwitch(trimmed);
    const activeLanguage = switchedLanguage ?? language;
    if (switchedLanguage) {
      setLanguage(switchedLanguage);
      localStorage.setItem(CHAT_LANGUAGE_KEY, switchedLanguage);
    }

    const userMessage: ChatMessageItem = {
      id: createMessageId(),
      sender: "user",
      text: trimmed,
      createdAt: new Date(),
    };

    inputRef.current?.blur();
    const edgeHistory: EdgeAssistantHistoryItem[] = messages.slice(-5).map((message) => ({
      role: message.sender === "user" ? "user" : "assistant",
      content: message.text,
    }));
    setMessages((current) => [...current, userMessage]);
    setInputValue("");

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setIsTyping(true);

    if (effectiveIsOnline) {
      try {
        const assistantText = await fetchEdgeAssistantResponse(
          trimmed,
          systemStats,
          activeLanguage,
          edgeHistory
        );
        setContext(null);
        setIsUsingBasicAssistant(false);
        addBotMessage(assistantText);
        setIsTyping(false);
        return;
      } catch {
        setIsUsingBasicAssistant(true);
      }
    }

    const parsed = forcedQuery ?? mergeWithContext(parseQuery(trimmed), context);
    if (
      parsed.intent === "payment" &&
      parsed.confidence === "low" &&
      parsed.paymentIntent &&
      !forcedQuery &&
      !switchedLanguage
    ) {
      addBotMessage(getResponse("didYouMean", activeLanguage, { command: PAYMENT_INTENTS[parsed.paymentIntent].label }), {
        confirmQuery: { ...parsed, confidence: "high" },
      });
      setIsTyping(false);
      return;
    }

    const botText = switchedLanguage ? getLanguageSwitchConfirmation(activeLanguage) : runQuery(parsed, activeLanguage);
    const delay = Math.min(1500, botText.length < 120 ? 450 + botText.length * 2 : 800 + botText.length * 2);
    typingTimerRef.current = window.setTimeout(() => {
      addBotMessage(botText, parsed.paymentIntent === "help" ? { examples: roleExamples(systemStats) } : undefined);
      setIsTyping(false);
      typingTimerRef.current = null;
    }, delay);
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">SMP AI Agent</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              <span className={`h-2 w-2 rounded-full ${assistantMode === "ai" ? "bg-emerald-500" : "bg-slate-400"}`} />
              {assistantMode === "ai" ? "AI" : "Basic"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Ask for payment totals, unpaid records, or type "help".</p>
        </div>
      )}

      {isPageVariant && (
        <div className="mb-3 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            <span className={`h-2 w-2 rounded-full ${assistantMode === "ai" ? "bg-emerald-500" : "bg-slate-400"}`} />
            {assistantMode === "ai" ? "AI" : "Basic"}
          </span>
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-1">
        {(["en", "bsy", "tgl"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            className={`min-h-11 min-w-11 rounded-full px-3 text-xs font-semibold transition ${
              language === lang
                ? "bg-primary text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            aria-pressed={language === lang}
          >
            {lang === "en" ? "EN" : lang === "bsy" ? "BSY" : "TGL"}
          </button>
        ))}
      </div>

      {isDataStale && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {getResponse("staleData", language, { time: formatRelativeMinutes(lastDataUpdatedAt) })}
        </div>
      )}

      {!effectiveIsOnline && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Using basic assistant — you are offline
        </div>
      )}

      {dataJustUpdated && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          Data just updated
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
                    {getResponse("yesRun", language)}
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
                    {copiedMessageId === message.id ? getResponse("copied", language) : getResponse("copy", language)}
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
              placeholder={getResponse("inputPlaceholder", language)}
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              {getResponse("send", language)}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const getUnknownResponse = (text: string, stats: DashboardStats, language: Language): string => {
  if (isRudeMessage(text)) {
    return joinParagraphs(getResponse("rude", language), `Try: ${roleExamples(stats).map((example) => `"${example}"`).join(", ")}.`);
  }
  return joinParagraphs(getResponse("unknown", language), `Try: ${roleExamples(stats).map((example) => `"${example}"`).join(", ")}.`);
};
