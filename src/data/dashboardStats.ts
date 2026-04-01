import { type StallRecord } from "./stalls";
import { type Invoice } from "@/components/UnpaidDues";

export interface DashboardStatsInput {
  stalls: StallRecord[];
  invoices: Invoice[];
  userRole?: string | null;
  userName?: string | null;
}

export interface DashboardStats {
  totalToday: number;
  totalMonth: number;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  totalStalls: number;
  vacantStalls: number;
  today: string;
}

const isCollector = (role?: string | null) =>
  role?.toLowerCase() === "collector";

const getTodayKey = () => new Date().toISOString().split("T")[0];

const isSameMonth = (dateString: string, reference: Date) => {
  const parsed = new Date(dateString);
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth()
  );
};

const formatTodayLabel = () => {
  const today = new Date();
  return today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const filterRelevantPaid = (
  invoices: Invoice[],
  isCollectorRole: boolean,
  collectorName?: string | null
) => {
  const paidInvoices = invoices.filter(
    (invoice) => invoice.status === "paid" && invoice.paid_at
  );

  if (!isCollectorRole || !collectorName) {
    return paidInvoices;
  }
  return paidInvoices.filter(
    (invoice) => invoice.collector_name === collectorName
  );
};

export const calculateDashboardStats = ({
  stalls,
  invoices,
  userRole,
  userName,
}: DashboardStatsInput): DashboardStats => {
  const today = new Date();
  const todayKey = getTodayKey();
  const relevantPaidInvoices = filterRelevantPaid(
    invoices,
    isCollector(userRole),
    userName
  );

  const totalToday = relevantPaidInvoices
    .filter((invoice) => invoice.paid_at?.startsWith(todayKey))
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const totalMonth = relevantPaidInvoices
    .filter((invoice) => invoice.paid_at && isSameMonth(invoice.paid_at, today))
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const unpaidCount = invoices.filter(
    (invoice) => invoice.status === "unpaid" || invoice.status === "overdue"
  ).length;

  const overdueCount = invoices.filter(
    (invoice) => invoice.status === "overdue"
  ).length;

  const totalStalls = stalls.length;
  const vacantStalls = stalls.filter((stall) => !stall.occupied).length;

  return {
    totalToday,
    totalMonth,
    paidCount: relevantPaidInvoices.length,
    unpaidCount,
    overdueCount,
    totalStalls,
    vacantStalls,
    today: formatTodayLabel(),
  };
};
