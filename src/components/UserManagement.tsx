import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus, User, Users, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { User as SupabaseUser } from "@supabase/supabase-js";

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
    role: "collector" as AccountRole,
  });
  const [error, setError] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [pendingChanges, setPendingChanges] = React.useState<Record<string, AccountRole>>({});
  const [loading, setLoading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

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

  // ✅ Create user via Edge Function (POST)
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const name = newAccount.name.trim();
    const username = newAccount.username.trim().toLowerCase();
    const password = newAccount.password.trim();
    const confirmPassword = newAccount.confirmPassword.trim();

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
      role: "collector",
    });
    onAccountsChange();
  };

  // ✅ Handle role change (local pending)
  const handleRoleChange = (userId: string, newRole: AccountRole) => {
    setPendingChanges((prev) => ({ ...prev, [userId]: newRole }));
  };

  // ✅ Save all pending role updates
  const handleSaveChanges = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    for (const [user_id, role] of Object.entries(pendingChanges)) {
      const res = await fetch(`${USER_MGMT_FN}/role`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id, role }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({
          title: "Update failed",
          description: err?.message || "Unable to update role.",
          variant: "destructive",
        });
      }
    }

    setPendingChanges({});
    setLoading(false);
    onAccountsChange();
    toast({ title: "Roles updated successfully" });
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
        <CardContent className="grid gap-4 md:grid-cols-2">
          {filteredAccounts.map((acc) => {
            const meta = acc.user_metadata || acc.raw_user_meta_data;
            const role = meta?.role ?? "collector";
            const pending = pendingChanges[acc.id];
            const isAdmin = role === "admin";

            return (
              <div
                key={acc.id}
                className="flex justify-between items-center p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-secondary rounded-full">
                    <User />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {meta?.full_name || "Unnamed User"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @{acc.email?.split("@")[0]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    disabled={isAdmin}
                    value={pending ?? role}
                    onValueChange={(v) =>
                      handleRoleChange(acc.id, v as AccountRole)
                    }
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="collector">Collector</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  {!isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => setConfirmId(acc.id)}
                      disabled={deletingId === acc.id}
                    >
                      {deletingId === acc.id ? (
                        <span className="animate-spin">⏳</span>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Save Changes Button */}
      {Object.keys(pendingChanges).length > 0 && (
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
    </div>
  );
};
