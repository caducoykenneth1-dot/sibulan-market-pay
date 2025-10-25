import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AccountProfileModal,
  AccountProfileData,
  ActivitySummary,
} from "@/components/AccountProfileModal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Users, Search, Trash2, Loader2, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { STALL_TYPES } from "@/data/stalls";

type AccountRole = "admin" | "collector";

export interface Account extends SupabaseUser {
  raw_user_meta_data?: {
    full_name?: string;
    role?: AccountRole;
  };
}

interface UserManagementProps {
  accounts: Account[];
  onAccountsChange: () => void;
}

// ✅ Supabase Edge Function URL
const USER_MGMT_FN =
  "https://idokfqcmophowhtdjymi.supabase.co/functions/v1/user-management";

type PendingChange = {
  role?: AccountRole;
  section?: string | null;
  market?: string | null;
  stallType?: string | null;
};

export const UserManagement = ({
  accounts,
  onAccountsChange,
}: UserManagementProps) => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [newAccount, setNewAccount] = React.useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
    market: "",
    role: "collector" as AccountRole,
  });
  const [error, setError] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [pendingChanges, setPendingChanges] = React.useState<Record<string, PendingChange>>({});
  const [loading, setLoading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [profileAccount, setProfileAccount] = React.useState<Account | null>(null);
  const [profileActivity, setProfileActivity] = React.useState<ActivitySummary | null>(null);
  const [profileActivityLoading, setProfileActivityLoading] = React.useState(false);
  const [profileActivityError, setProfileActivityError] = React.useState<string | null>(null);

  const filteredAccounts = React.useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return accounts;

    return accounts.filter((acc) => {
      const metadata = acc.user_metadata || acc.raw_user_meta_data;
      const name = metadata?.full_name?.toLowerCase() || "";
      const username = acc.email?.split("@")[0].toLowerCase() || "";
      return name.includes(normalized) || username.includes(normalized);
    });
  }, [accounts, searchTerm]);

  const selectedProfileData = React.useMemo(
    () =>
      profileAccount
        ? mapAccountToProfileData(profileAccount, {
            activity: profileActivity ?? undefined,
          })
        : null,
    [profileAccount, profileActivity]
  );

  React.useEffect(() => {
    if (!profileAccount) {
      setProfileActivity(null);
      setProfileActivityError(null);
      setProfileActivityLoading(false);
      return;
    }

    let isMounted = true;
    setProfileActivityLoading(true);
    setProfileActivityError(null);

    fetchCollectorActivitySummary(profileAccount)
      .then((activity) => {
        if (!isMounted) return;
        setProfileActivity(activity);
      })
      .catch((error) => {
        console.error("Failed to load activity summary:", error);
        if (!isMounted) return;
        setProfileActivity(null);
        setProfileActivityError("Unable to load latest collection stats.");
      })
      .finally(() => {
        if (!isMounted) return;
        setProfileActivityLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [profileAccount]);

  const sectionOptions = React.useMemo(() => {
    const sections = new Set<string>();
    STALL_TYPES.forEach((type) => sections.add(type.section));
    accounts.forEach((account) => {
      const meta = account.user_metadata || account.raw_user_meta_data;
      const section =
        typeof meta?.market_section === "string"
          ? meta.market_section.trim()
          : typeof meta?.section === "string"
          ? meta.section.trim()
          : null;
      if (section) sections.add(section);
    });
    return Array.from(sections).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const typeOptionsBySection = React.useMemo(() => {
    const map = new Map<string, Set<string>>();

    STALL_TYPES.forEach((type) => {
      if (!map.has(type.section)) {
        map.set(type.section, new Set());
      }
      map.get(type.section)?.add(type.name);
    });

    accounts.forEach((account) => {
      const meta = account.user_metadata || account.raw_user_meta_data;
      const section =
        typeof meta?.market_section === "string"
          ? meta.market_section.trim()
          : typeof meta?.section === "string"
          ? meta.section.trim()
          : null;
      const typeName =
        typeof meta?.market_type === "string"
          ? meta.market_type.trim()
          : typeof meta?.market === "string"
          ? meta.market.trim()
          : null;
      if (section && typeName) {
        if (!map.has(section)) {
          map.set(section, new Set());
        }
        map.get(section)?.add(typeName);
      }
    });

    const result = new Map<string, string[]>();
    Array.from(map.entries()).forEach(([section, values]) => {
      result.set(section, Array.from(values).sort((a, b) => a.localeCompare(b)));
    });
    return result;
  }, [accounts]);

  const hasPendingChanges = React.useMemo(
    () =>
      Object.values(pendingChanges).some(
        (change) =>
          change &&
          (typeof change.role !== "undefined" ||
            typeof change.section !== "undefined" ||
            typeof change.stallType !== "undefined")
      ),
    [pendingChanges]
  );

  const MARKET_OPTIONS = React.useMemo(() => {
    const markets = new Set<string>();
    accounts.forEach((account) => {
      const meta = account.user_metadata || account.raw_user_meta_data;
      if (typeof meta?.market === "string" && meta.market.trim()) {
        markets.add(meta.market.trim());
      }
    });
    // Add some default options if they don't exist
    if (!markets.has("Sibulan Public Market")) markets.add("Sibulan Public Market");
    if (!markets.has("Dumaguete Public Market")) markets.add("Dumaguete Public Market");

    return Array.from(markets).sort();
  }, [accounts]);

  const handleMarketChange = (userId: string, marketValue: string) => {
    setPendingChanges((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], market: marketValue === "unassigned" ? null : marketValue },
    }));
  };

  // ✅ Create user via Edge Function (POST)
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const name = newAccount.name.trim();
    const username = newAccount.username.trim().toLowerCase();
    const password = newAccount.password.trim();
    const confirmPassword = newAccount.confirmPassword.trim();
    const market = newAccount.market;

    if (!name || !username || !password || !confirmPassword) {
      setError("Please fill out all fields.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const res = await fetch(USER_MGMT_FN, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${username}@example.com`,
        password,
        full_name: name,
        role: newAccount.role,
        market: market,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const result = await res.json();
      setError(result?.message || "Failed to create user.");
      return;
    }

    toast({ title: "Account Created", description: `"${name}" added.` });
    setIsDialogOpen(false);
    setNewAccount({
      name: "",
      username: "",
      password: "",
      confirmPassword: "",
      market: "",
      role: "collector",
    });
    onAccountsChange();
  };

  // ✅ Handle role change (local pending)
  const handleRoleChange = (userId: string, newRole: AccountRole) => {
    setPendingChanges((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], role: newRole },
    }));
  };

  const handleSectionChange = (
    userId: string,
    sectionValue: string,
    baselineSection: string
  ) => {
    setPendingChanges((prev) => {
      const prevChange = prev[userId] ?? {};
      const normalized = sectionValue ? sectionValue.trim() : null;
      const matchesBaseline =
        (normalized ?? "") === (baselineSection ?? "");

      const nextChange: PendingChange = { ...prevChange };

      if (matchesBaseline) {
        delete nextChange.section;
      } else {
        nextChange.section = normalized;
      }

      if (!matchesBaseline) {
        nextChange.stallType = null;
      } else if (
        typeof nextChange.stallType !== "undefined" &&
        nextChange.stallType === null
      ) {
        delete nextChange.stallType;
      }

      if (
        typeof nextChange.section === "undefined" &&
        typeof nextChange.stallType === "undefined" &&
        typeof nextChange.role === "undefined"
      ) {
        const { [userId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [userId]: nextChange };
    });
  };

  const handleStallTypeChange = (
    userId: string,
    stallTypeValue: string,
    baselineType: string,
    forceChange = false
  ) => {
    setPendingChanges((prev) => {
      const prevChange = prev[userId] ?? {};
      const normalized = stallTypeValue ? stallTypeValue.trim() : null;
      const matchesBaseline =
        !forceChange && (normalized ?? "") === (baselineType ?? "");

      const nextChange: PendingChange = { ...prevChange };

      if (matchesBaseline) {
        delete nextChange.stallType;
      } else {
        nextChange.stallType = normalized;
      }

      if (
        typeof nextChange.section === "undefined" &&
        typeof nextChange.stallType === "undefined" &&
        typeof nextChange.role === "undefined"
      ) {
        const { [userId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [userId]: nextChange };
    });
  };

  // ✅ Save all pending role updates
  const handleSaveChanges = async () => {
    const updates = Object.entries(pendingChanges).filter(
      ([, change]) =>
        change &&
        (typeof change.role !== "undefined" ||
          typeof change.section !== "undefined" ||
          typeof change.stallType !== "undefined")
    );

    if (updates.length === 0) return;

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setLoading(false);
      toast({
        title: "Session expired",
        description: "Please sign in again to apply changes.",
        variant: "destructive",
      });
      return;
    }

    for (const [user_id, change] of updates) {
      const payload: Record<string, any> = { user_id };

      if (typeof change.role !== "undefined") {
        payload.role = change.role;
      }

      if (typeof change.section !== "undefined") {
        const normalized = change.section?.trim();
        payload.market_section = normalized && normalized.length > 0 ? normalized : null;
      }

      if (typeof change.stallType !== "undefined") {
        const normalized = change.stallType?.trim();
        payload.market_type = normalized && normalized.length > 0 ? normalized : null;
      }

      if (
        payload.role === undefined &&
        typeof payload.market_section === "undefined" &&
        typeof payload.market_type === "undefined"
      ) {
        continue;
      }

      const res = await fetch(`${USER_MGMT_FN}/role`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({
          title: "Update failed",
          description: err?.message || "Unable to update account.",
          variant: "destructive",
        });
      }
    }

    setPendingChanges({});
    setLoading(false);
    onAccountsChange();
    toast({ title: "Account assignments updated" });
  };

  // ✅ Delete user (collectors only)
  const handleDeleteUser = async (userId: string) => {
    setDeletingId(userId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(`${USER_MGMT_FN}/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });


    setDeletingId(null);
    setConfirmId(null);
    if (!res.ok) {
      const err = await res.json();
      toast({
        title: "Delete failed",
        description: err?.message || "Unable to delete user.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "User deleted" });
    onAccountsChange();
  };

  return (
    <div className="space-y-6">
      {/* Header + Add User */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage collector and admin accounts
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                value={newAccount.name}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={newAccount.username}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, username: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Market</Label>
              <Select
                value={newAccount.market}
                onValueChange={(m) => setNewAccount({ ...newAccount, market: m })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign a market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {MARKET_OPTIONS.map((market) => (
                    <SelectItem key={market} value={market}>{market}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={newAccount.role}
                onValueChange={(r) =>
                  setNewAccount({ ...newAccount, role: r as AccountRole })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collector">Collector</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={newAccount.password}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, password: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={newAccount.confirmPassword}
                onChange={(e) =>
                  setNewAccount({
                    ...newAccount,
                    confirmPassword: e.target.value,
                  })
                }
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Existing Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users /> Existing Accounts
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or username"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              No accounts match your search.
            </div>
          ) : (
            filteredAccounts.map((acc) => {
              const meta = acc.user_metadata || acc.raw_user_meta_data;
              const storedMarket =
                typeof meta?.market === "string" ? meta.market.trim() : "";
              const storedRole = meta?.role ?? "collector";
              const storedSection =
                typeof meta?.market_section === "string"
                  ? meta.market_section.trim()
                  : typeof meta?.section === "string"
                  ? meta.section.trim()
                  : "";
              const storedType =
                typeof meta?.market_type === "string"
                  ? meta.market_type.trim()
                  : "";
              const pending = pendingChanges[acc.id];
              const pendingMarket = pending?.market;
              const pendingRole = pending?.role;
              const pendingSection = pending?.section;
              const pendingType = pending?.stallType;

              const effectiveRole = pendingRole ?? storedRole;
              const isAdmin = effectiveRole === "admin";

              const marketBaseline = storedMarket ?? "";
              const sectionBaseline = storedSection ?? "";
              const typeBaseline = storedType ?? "";

              const hasPendingMarket = typeof pendingMarket !== "undefined";
              const hasPendingSection = typeof pendingSection !== "undefined";
              const hasPendingType = typeof pendingType !== "undefined";

              const effectiveMarket = hasPendingMarket ? pendingMarket ?? "" : marketBaseline;
              const effectiveSection = hasPendingSection
                ? pendingSection ?? ""
                : sectionBaseline;
              const effectiveType = hasPendingType ? pendingType ?? "" : typeBaseline;
              const sectionChanged = effectiveSection !== sectionBaseline;

              const baseTypeOptions =
                effectiveSection && typeOptionsBySection.get(effectiveSection)
                  ? typeOptionsBySection.get(effectiveSection)!
                  : [];
              const combinedTypes =
                effectiveType &&
                effectiveSection &&
                !baseTypeOptions.includes(effectiveType)
                  ? [effectiveType, ...baseTypeOptions]
                  : baseTypeOptions;

              return (
                <Card
                  key={acc.id}
                  className="flex h-full min-h-[230px] flex-col border border-border/70 shadow-sm transition-shadow hover:shadow-lg"
                >
                  <CardContent className="relative flex h-full flex-col gap-5 p-6 pt-8">
                    <Badge
                      variant={isAdmin ? "default" : "secondary"}
                      className="absolute right-4 top-4 px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm"
                    >
                      {isAdmin ? "Admin" : "Collector"}
                    </Badge>
                    <div className="flex items-center gap-4 pr-16">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
                        <User className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold">
                          {meta?.full_name || "Unnamed User"}
                        </p>
                        <p className="break-all text-sm text-muted-foreground">
                          @{acc.email?.split("@")[0]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isAdmin
                            ? "Admin permissions"
                            : [effectiveMarket, effectiveSection, effectiveType]
                                .filter(Boolean)
                                .join(" • ") || "No assignment"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-col gap-3 pt-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label className="text-xs uppercase text-muted-foreground">
                            Section
                          </Label>
                          <Select
                             value={effectiveSection || "unassigned"}
                            disabled={isAdmin}
                            onValueChange={(value) =>
                              handleSectionChange(acc.id, value, storedSection ?? "")
                            }
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Assign section"  />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {sectionOptions.map((section) => (
                                <SelectItem key={section} value={section}>
                                  {section}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Market Type commented out
                        */}
                      </div>

                      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                        <Button
                          variant="outline"
                          className="flex-1 items-center justify-center gap-2"
                          onClick={() => setProfileAccount(acc)}
                        >
                          <Eye className="h-4 w-4" />
                          View Profile
                        </Button>

                        {!isAdmin && (
                          <Button
                            variant="destructive"
                            className="flex-shrink-0 items-center justify-center gap-2 sm:w-auto sm:px-3"
                            onClick={() => setConfirmId(acc.id)}
                            disabled={deletingId === acc.id}
                          >
                            {deletingId === acc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span className="text-sm sm:hidden">Remove</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Save Changes Button */}
      {hasPendingChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSaveChanges} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmId} onOpenChange={() => setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete this collector? This action cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmId && handleDeleteUser(confirmId)}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountProfileModal
        open={!!profileAccount}
        onOpenChange={(open) => {
          if (!open) setProfileAccount(null);
        }}
        account={selectedProfileData ?? undefined}
        activityLoading={profileActivityLoading}
        activityError={profileActivityError}
      />
    </div>
  );
};

const mapAccountToProfileData = (
  account: Account,
  options?: { activity?: ActivitySummary }
): AccountProfileData => {
  const meta = (account.user_metadata || account.raw_user_meta_data || {}) as Record<string, any>;
  const role = (meta.role as AccountRole) ?? "collector";
  const status =
    meta.status === "suspended" || meta.account_status === "suspended" ? "suspended" : "active";
  const phone =
    typeof meta.phone === "string"
      ? meta.phone
      : typeof meta.phone_number === "string"
      ? meta.phone_number
      : "Not provided";
  const sectionMeta =
    typeof meta.market_section === "string"
      ? meta.market_section.trim()
      : typeof meta.section === "string"
      ? meta.section.trim()
      : "";
  const typeMeta =
    typeof meta.market_type === "string"
      ? meta.market_type.trim()
      : typeof meta.market === "string"
      ? meta.market.trim()
      : "";
  const combinedMarket = [sectionMeta, typeMeta]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" • ");
  const market =
    combinedMarket ||
    (typeof meta.market === "string" && meta.market.trim().length > 0
      ? meta.market
      : typeof meta.location === "string" && meta.location.trim().length > 0
      ? meta.location
      : "Not assigned");
  const device =
    typeof meta.device === "string"
      ? meta.device
      : typeof meta.last_device === "string"
      ? meta.last_device
      : "Unknown device";
  const lastIp =
    typeof meta.last_ip === "string"
      ? meta.last_ip
      : typeof meta.ip_address === "string"
      ? meta.ip_address
      : "Unavailable";

  const lastPasswordChange =
    (meta.password_updated_at as string | undefined) ||
    (meta.password_changed_at as string | undefined) ||
    (meta.last_password_change as string | undefined) ||
    null;

  return {
    fullName: (meta.full_name as string) || "Unnamed User",
    username: account.email?.split("@")[0] ?? "unknown",
    role,
    status,
    email: account.email ?? "Not provided",
    phone,
    market,
    userId: account.id,
    createdAt: formatDateTime(account.created_at),
    lastLogin: formatDateTime(account.last_sign_in_at),
    lastPasswordChange: formatDateTime(lastPasswordChange),
    device,
    lastIp,
    permissions: buildPermissions(role),
    activity: options?.activity ?? buildActivitySummary(meta),
  };
};

const buildPermissions = (role: AccountRole): AccountProfileData["permissions"] => [
  {
    name: "Collections",
    description: "Process stall collections and payments",
    enabled: true,
  },
  {
    name: "Invoices",
    description: "View and issue official invoices",
    enabled: true,
  },
  {
    name: "Refunds",
    description: "Approve or deny collection refunds",
    enabled: role === "admin",
  },
  {
    name: "User Admin",
    description: "Create or manage personnel accounts",
    enabled: role === "admin",
  },
];

const buildActivitySummary = (meta: Record<string, any>): ActivitySummary => {
  const activity =
    (meta.activity as Record<string, any>) ||
    (meta.stats as Record<string, any>) ||
    (meta.metrics as Record<string, any>) ||
    {};
  const toNumber = (value: unknown) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  return {
    totalCollections: toNumber(
      activity.totalCollections ?? activity.total_collections ?? activity.collections
    ),
    avgPerDay: toNumber(activity.avgPerDay ?? activity.avg_per_day ?? activity.averagePerDay),
    invoicesHandled: toNumber(
      activity.invoicesHandled ?? activity.invoices_handled ?? activity.invoices
    ),
    activeStalls: toNumber(activity.activeStalls ?? activity.active_stalls ?? activity.stalls),
  };
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
};

const fetchCollectorActivitySummary = async (
  account: Account
): Promise<ActivitySummary> => {
  const meta = (account.user_metadata || account.raw_user_meta_data || {}) as Record<string, any>;
  const collectorName =
    (typeof meta.full_name === "string" && meta.full_name.trim().length > 0
      ? meta.full_name.trim()
      : account.email?.split("@")[0]) || "";

  if (!collectorName) {
    return EMPTY_ACTIVITY_SUMMARY;
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, amount, paid_at, stall_name, vendor_id")
    .eq("status", "paid")
    .eq("collector_name", collectorName);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return EMPTY_ACTIVITY_SUMMARY;
  }

  const totalAmount = data.reduce((sum, invoice) => sum + (invoice.amount ?? 0), 0);
  const totalInvoices = data.length;

  const windowDays = 14;
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));

  const invoicesInWindow = data.filter((invoice) => {
    if (!invoice.paid_at) return false;
    const paidDate = new Date(invoice.paid_at);
    if (Number.isNaN(paidDate.getTime())) return false;
    return paidDate >= windowStart;
  });

  const avgPerDay =
    windowDays > 0 ? Number((invoicesInWindow.length / windowDays).toFixed(1)) : 0;

  const uniqueStalls = new Set<string>();
  data.forEach((invoice) => {
    if (invoice.stall_name) {
      uniqueStalls.add(invoice.stall_name);
    } else if (invoice.vendor_id) {
      uniqueStalls.add(String(invoice.vendor_id));
    }
  });

  return {
    totalCollections: totalAmount,
    avgPerDay,
    invoicesHandled: totalInvoices,
    activeStalls: uniqueStalls.size,
  };
};

const EMPTY_ACTIVITY_SUMMARY: ActivitySummary = {
  totalCollections: 0,
  avgPerDay: 0,
  invoicesHandled: 0,
  activeStalls: 0,
};
