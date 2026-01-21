import * as React from "react"; 
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AtSign,
  CalendarRange,
  ClipboardList,
  Fingerprint,
  Globe,
  LogIn,
  Mail,
  MapPin,
  Monitor,
  Phone,
  Receipt,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCircle2,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

type AccountStatus = "active" | "suspended";

interface Permission {
  name: string;
  description: string;
  enabled: boolean;
}

export interface ActivitySummary {
  totalCollections: number;
  avgPerDay: number;
  invoicesHandled: number;
  activeStalls: number;
}

export interface AccountProfileData {
  fullName: string;
  username: string;
  role: "admin" | "collector";
  status: AccountStatus;
  email: string;
  phone: string;
  address: string;
  market: string;
  userId: string;
  createdAt: string;
  lastLogin: string;
  lastPasswordChange: string;
  device: string;
  lastIp: string;
  permissions: Permission[];
  activity: ActivitySummary;
}

const mockAccount: AccountProfileData = {
  fullName: "Test Collector",
  username: "testcollector",
  role: "collector",
  status: "active",
  email: "testcollector@example.com",
  phone: "+63 912 345 6789",
  address: "123 Market Road, Barangay Poblacion, Sibulan",
  market: "Sibulan Public Market",
  userId: "usr_5f0b38d9c4",
  createdAt: "2024-01-12 08:45 AM",
  lastLogin: "2025-02-03 03:15 PM",
  lastPasswordChange: "2024-11-18 10:02 AM",
  device: "Chrome on Windows 11",
  lastIp: "203.121.84.22",
  permissions: [
    { name: "Collections", description: "Process stall payments", enabled: true },
    { name: "Invoices", description: "View and issue invoices", enabled: true },
    { name: "Refunds", description: "Approve refunds", enabled: false },
    { name: "User Admin", description: "Manage personnel accounts", enabled: false },
  ],
  activity: {
    totalCollections: 1248,
    avgPerDay: 42,
    invoicesHandled: 389,
    activeStalls: 37,
  },
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat();

const formatCurrency = (value: number) => currencyFormatter.format(value ?? 0);
const formatNumber = (value: number) => numberFormatter.format(value ?? 0);
const formatInteger = (value: number) => integerFormatter.format(Math.round(value ?? 0));

interface AccountProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountProfileData;
  canEdit?: boolean;
  activityLoading?: boolean;
  activityError?: string | null;
  invoices?: any[];
}

export const AccountProfileModal: React.FC<AccountProfileModalProps> = ({
  open,
  onOpenChange,
  account = mockAccount,
  canEdit = account.role === "admin",
  activityLoading = false,
  activityError = null,
  invoices = [],
}) => {
  const [calendarDate, setCalendarDate] = React.useState(new Date());
  const statusBadge =
    account.status === "active" ? (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Active
      </Badge>
    ) : (
      <Badge variant="destructive" className="bg-rose-100 text-rose-700">
        <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Suspended
      </Badge>
    );

  // Group invoices by date for the history view
  const dailyHistory = React.useMemo(() => {
    if (!invoices || invoices.length === 0) return [];
    
    const groups: Record<string, { date: string; count: number; total: number }> = {};
    
    invoices.forEach(inv => {
      if (inv.status === 'paid' && inv.paid_at) {
        const date = new Date(inv.paid_at).toLocaleDateString();
        if (!groups[date]) {
          groups[date] = { date, count: 0, total: 0 };
        }
        groups[date].count += 1;
        groups[date].total += inv.amount;
      }
    });

    // Sort by date descending (newest first)
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices]);

  const dailyStats = React.useMemo(() => {
    const stats = new Map<string, { total: number; count: number }>();
    if (!invoices) return stats;
    
    invoices.forEach(inv => {
      if (inv.status === 'paid' && inv.paid_at) {
        const d = new Date(inv.paid_at);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const current = stats.get(dateStr) || { total: 0, count: 0 };
        stats.set(dateStr, { total: current.total + inv.amount, count: current.count + 1 });
      }
    });
    return stats;
  }, [invoices]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl border border-border/70 p-0 sm:w-[calc(100vw-2rem)]">
        <div className="flex max-h-[92vh] flex-col overflow-y-auto">
          <DialogHeader className="px-5 pt-6 sm:px-6">
            <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">
              Account Profile
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Personnel record from Sibulan Market Pay directory.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-4 sm:gap-6 sm:px-6">
            <Card className="border border-border/70 shadow-sm">
              <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary sm:h-20 sm:w-20">
                    <UserCircle2 className="h-10 w-10 sm:h-12 sm:w-12" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold">{account.fullName}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
                      <span className="inline-flex items-center gap-1">
                        <AtSign className="h-3.5 w-3.5" /> @{account.username}
                      </span>
                      <Badge
                        variant={account.role === "admin" ? "default" : "secondary"}
                        className="uppercase"
                      >
                        {account.role === "admin" ? "Admin" : "Collector"}
                      </Badge>
                      {statusBadge}
                    </div>
                  </div>
                </div>
                <div className="w-full rounded-xl border border-border/70 bg-muted/50 px-4 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground sm:w-auto">
                  Sibulan Market Pay
                </div>
              </CardContent>
            </Card>

            <Section icon={<ClipboardList className="h-4 w-4" />} title="Contact Information">
              <InfoGrid
                rows={[
                  { label: "Email", value: account.email, icon: Mail },
                  { label: "Phone", value: account.phone, icon: Phone },
                  { label: "Address", value: account.address, icon: MapPin },
                  { label: "Assigned Market", value: account.market, icon: Globe },
                ]}
                columns={3}
              />
            </Section>

            <Section icon={<Settings className="h-4 w-4" />} title="System Details">
              <InfoGrid
                rows={[
                  { label: "User ID", value: account.userId, icon: Fingerprint },
                  { label: "Account Created", value: account.createdAt, icon: CalendarRange },
                  { label: "Last Login", value: account.lastLogin, icon: LogIn },
                  { label: "Password Changed", value: account.lastPasswordChange, icon: RefreshCw },
                  { label: "Device / Browser", value: account.device, icon: Monitor },
                  { label: "Last IP", value: account.lastIp, icon: Globe },
                ]}
                columns={2}
              />
            </Section>

            {/* <Section icon={<Receipt className="h-4 w-4" />} title="Permissions">
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead className="w-1/4">Permission</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-28 text-center">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {account.permissions.map((perm) => (
                      <TableRow key={perm.name}>
                        <TableCell className="font-medium">{perm.name}</TableCell>
                        <TableCell>{perm.description}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={perm.enabled ? "default" : "secondary"}
                            className={perm.enabled ? "" : "bg-muted text-muted-foreground"}
                          >
                            {perm.enabled ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section> */}

            <Section icon={<Activity className="h-4 w-4" />} title="Activity Summary">
              {activityLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <Card
                      key={idx}
                      className="border border-border/70 bg-muted/40 shadow-none sm:min-h-[120px]"
                    >
                      <CardContent className="flex h-full flex-col justify-between gap-2 p-4">
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-6 w-20 animate-pulse rounded bg-muted" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: "Collections Processed",
                        value: formatCurrency(account.activity.totalCollections),
                      },
                      {
                        label: "Average Per Day",
                        value: formatNumber(account.activity.avgPerDay),
                      },
                      {
                        label: "Invoices Handled",
                        value: formatInteger(account.activity.invoicesHandled),
                      },
                      {
                        label: "Active Stalls",
                        value: formatInteger(account.activity.activeStalls),
                      },
                    ].map((stat) => (
                      <Card
                        key={stat.label}
                        className="border border-border/70 bg-muted/40 shadow-none sm:min-h-[120px]"
                      >
                        <CardContent className="flex h-full flex-col justify-between gap-1 p-4">
                          <p className="text-xs uppercase text-muted-foreground">{stat.label}</p>
                          <p className="text-2xl font-semibold">{stat.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {activityError && (
                    <p className="text-xs text-destructive">{activityError}</p>
                  )}
                </>
              )}
            </Section>

            {/* Daily Collection History Section - Only for Collectors */}
            {account.role === 'collector' && (
              <Section icon={<History className="h-4 w-4" />} title="Recent Daily Collections">
                <div className="mb-4 border rounded-lg p-3 bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(calendarDate);
                        d.setFullYear(d.getFullYear() - 1);
                        setCalendarDate(d);
                      }}>
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(calendarDate);
                        d.setMonth(d.getMonth() - 1);
                        setCalendarDate(d);
                      }}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="font-semibold text-sm">
                      {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(calendarDate);
                        d.setMonth(d.getMonth() + 1);
                        setCalendarDate(d);
                      }}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(calendarDate);
                        d.setFullYear(d.getFullYear() + 1);
                        setCalendarDate(d);
                      }}>
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                      <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                    {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const hasCollection = dailyStats.has(dateStr);
                      const stat = dailyStats.get(dateStr);
                      
                      let statusClass = "hover:bg-muted";
                      if (hasCollection) {
                        statusClass = "bg-emerald-100 text-emerald-700 font-bold";
                      }

                      return (
                        <div key={day} className={`aspect-square flex flex-col items-center justify-center rounded-md text-xs cursor-default ${statusClass}`} title={hasCollection ? `₱${stat?.total.toLocaleString()}` : ''}>
                          <span>{day}</span>
                          {hasCollection && <span className="text-[8px] leading-none">₱{(stat?.total || 0) / 1000}k</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/70 flex flex-col max-h-[300px]">
                  <div className="overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Transactions</TableHead>
                        <TableHead className="text-right">Total Collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No collection history found.</TableCell>
                        </TableRow>
                      ) : (
                        dailyHistory.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-medium">{day.date}</TableCell>
                            <TableCell className="text-center">{day.count}</TableCell>
                            <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(day.total)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </Section>
            )}

            <Separator />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Close
              </Button>
              {canEdit && (
                <Button className="w-full sm:w-auto sm:min-w-[140px]">Edit Profile</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <section className="space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {title}
    </div>
    {children}
  </section>
);

const InfoGrid: React.FC<{
  rows: Array<{
    label: string;
    value: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }>;
  columns?: 1 | 2 | 3;
}> = ({ rows, columns = 1 }) => {
  const gridClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div key={row.label} className="rounded-lg border border-border/60 p-4">
            <Label className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {row.label}
            </Label>
            <p className="mt-1 break-words text-sm font-medium text-foreground">{row.value}</p>
          </div>
        );
      })}
    </div>
  );
};
