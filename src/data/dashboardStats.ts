import { type StallRecord } from "./stalls";
import { type Invoice } from "@/components/UnpaidDues";
import { type Account } from "@/components/UserManagement";

export interface DashboardStatsInput {
  stalls: StallRecord[];
  invoices: Invoice[];
  userRole?: string | null;
  userName?: string | null;
  userId?: string | null;
  userSection?: string | null;
  collectors?: Account[];
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
  role?: string | null;
  collectorId?: string | null;
  collectorName?: string | null;
  collectorSection?: string | null;
  myCollectionsToday?: number;
  mySummaryCount?: number;
  myUnpaidCount?: number;
  myPendingAmount?: number;
  myAssignedStallsCount?: number;
  collectorPerformance?: CollectorPerformance[];
  activeVendors: number;
  collectors: CollectorInfo[];
  recentTransactions: RecentTransaction[];
}

export interface CollectorPerformance {
  name: string;
  collectionsToday: number;
  unpaidStalls: number;
}

export interface CollectorInfo {
  id: string;
  name: string;
  username: string;
  section: string;
  assignedStalls: number;
  collectionsToday: number;
  collectedThisMonth: number;
  unpaidAssignedStalls: number;
}

export interface RecentTransaction {
  vendorName: string;
  stallName: string;
  amount: number;
  collectorName: string;
  paidAt?: string;
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
  collectorName?: string | null,
  collectorId?: string | null
) => {
  const paidInvoices = invoices.filter(
    (invoice) => invoice.status === "paid" && invoice.paid_at
  );

  if (!isCollectorRole) {
    return paidInvoices;
  }
  return paidInvoices.filter(
    (invoice) =>
      (collectorId && invoice.collector_id === collectorId) ||
      (collectorName && invoice.collector_name === collectorName)
  );
};

export const calculateDashboardStats = ({
  stalls,
  invoices,
  userRole,
  userName,
  userId,
  userSection,
  collectors,
}: DashboardStatsInput): DashboardStats => {
  const today = new Date();
  const todayKey = getTodayKey();
  const relevantPaidInvoices = filterRelevantPaid(
    invoices,
    isCollector(userRole),
    userName,
    userId
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
  const activeVendors = stalls.filter((stall) => stall.occupied).length;

  const assignedStallIds = new Set(
    userSection
      ? stalls
          .filter((stall) => stall.section === userSection)
          .map((stall) => String(stall.dbId))
      : []
  );

  const collectorRecordedInvoices = invoices.filter(
    (invoice) =>
      invoice.collector_id === userId ||
      (userName && invoice.collector_name === userName)
  );

  const collectorAssignedInvoices = invoices.filter((invoice) =>
    assignedStallIds.has(String(invoice.vendor_id))
  );

  const collectorPaidToday = collectorRecordedInvoices.filter(
    (invoice) => invoice.status === "paid" && invoice.paid_at?.startsWith(todayKey)
  );

  const myCollectionsToday = collectorPaidToday.reduce((sum, invoice) => sum + invoice.amount, 0);
  const mySummaryCount = collectorPaidToday.length;

  const myUnpaidCount = collectorAssignedInvoices.filter(
    (invoice) => invoice.status === "unpaid" || invoice.status === "overdue"
  ).length;

  const myPendingAmount = collectorAssignedInvoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const myAssignedStallsCount = userSection
    ? stalls.filter((stall) => stall.section === userSection).length
    : undefined;

  const accountMeta = (account: Account) => {
    const meta = account.user_metadata || account.raw_user_meta_data || {};
    const section =
      typeof meta?.market_section === "string"
        ? meta.market_section.trim()
        : typeof meta?.section === "string"
        ? meta.section.trim()
        : "Unassigned";
    const role =
      typeof meta?.role === "string"
        ? meta.role.trim().toLowerCase()
        : typeof meta?.account_role === "string"
        ? meta.account_role.trim().toLowerCase()
        : "collector";
    const name =
      typeof meta?.full_name === "string" && meta.full_name.trim().length > 0
        ? meta.full_name.trim()
        : account.email?.split("@")[0] || "Unknown";
    const username = account.email?.split("@")[0] || "collector";
    return { section, role, name, username };
  };

  const assignedStallsBySection = stalls.reduce((map, stall) => {
    const key = stall.section?.trim() || "Unassigned";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const collectorInvoiceStats = new Map<
    string,
    {
      collectionsToday: number;
      collectedThisMonth: number;
      unpaidStalls: Set<number | string>;
    }
  >();

  const ensureCollectorStats = (collectorId: string) => {
    if (!collectorInvoiceStats.has(collectorId)) {
      collectorInvoiceStats.set(collectorId, {
        collectionsToday: 0,
        collectedThisMonth: 0,
        unpaidStalls: new Set<number | string>(),
      });
    }
    return collectorInvoiceStats.get(collectorId)!;
  };

  invoices.forEach((invoice) => {
    const collectorId = invoice.collector_id;
    if (!collectorId) return;
    const statsEntry = ensureCollectorStats(collectorId);

    if (invoice.status === "paid" && invoice.paid_at?.startsWith(todayKey)) {
      statsEntry.collectionsToday += invoice.amount;
    }
    if (invoice.status === "paid" && invoice.paid_at && isSameMonth(invoice.paid_at, today)) {
      statsEntry.collectedThisMonth += invoice.amount;
    }

    if (invoice.status === "unpaid" || invoice.status === "overdue") {
      if (invoice.vendor_id !== null && invoice.vendor_id !== undefined) {
        statsEntry.unpaidStalls.add(invoice.vendor_id);
      }
    }
  });

  const collectorAccounts = (collectors ?? []).filter((account) => {
    const { role } = accountMeta(account);
    return role === "collector";
  });

  const collectorsList: CollectorInfo[] = collectorAccounts.map((account) => {
    const { section, name, username } = accountMeta(account);
    const statsEntry = collectorInvoiceStats.get(account.id) ?? {
      collectionsToday: 0,
      collectedThisMonth: 0,
      unpaidStalls: new Set<number | string>(),
    };
    return {
      id: account.id,
      name,
      username,
      section,
      assignedStalls: assignedStallsBySection.get(section) ?? 0,
      collectionsToday: statsEntry.collectionsToday,
      collectedThisMonth: statsEntry.collectedThisMonth,
      unpaidAssignedStalls: statsEntry.unpaidStalls.size,
    };
  });

  const collectorPerformance: CollectorPerformance[] = collectorsList
    .map((collector) => ({
      name: collector.name,
      collectionsToday: collector.collectionsToday,
      unpaidStalls: collector.unpaidAssignedStalls,
    }))
    .filter((collector) => collector.collectionsToday > 0 || collector.unpaidStalls > 0);

  const recentTransactions: RecentTransaction[] = relevantPaidInvoices
    .filter((invoice) => invoice.paid_at)
    .sort((a, b) => {
      const aDate = new Date(a.paid_at!);
      const bDate = new Date(b.paid_at!);
      return bDate.getTime() - aDate.getTime();
    })
    .slice(0, 5)
    .map((invoice) => ({
      vendorName: invoice.vendor_name || "Unknown vendor",
      stallName: invoice.stall_name || "Unknown stall",
      amount: invoice.amount,
      collectorName: invoice.collector_name || "Unknown",
      paidAt: invoice.paid_at ?? undefined,
    }));


  return {
    totalToday,
    totalMonth,
    paidCount: relevantPaidInvoices.length,
    unpaidCount,
    overdueCount,
    totalStalls,
    vacantStalls,
    today: formatTodayLabel(),
    role: userRole ?? null,
    collectorId: userId ?? null,
    collectorName: userName ?? null,
    collectorSection: userSection ?? null,
    myCollectionsToday,
    mySummaryCount,
    myUnpaidCount,
    myPendingAmount,
    myAssignedStallsCount,
    collectorPerformance,
    collectors: collectorsList,
    activeVendors,
    recentTransactions,
  };
};
