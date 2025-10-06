import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/components/Dashboard";
import { PaymentCollection } from "@/components/PaymentCollection";
import { PaymentHistory } from "@/components/PaymentHistory";
import { StallManagement } from "@/components/StallManagement";
import { Reports } from "@/components/Reports";
import { ScheduledCollections } from "@/components/ScheduledCollections";
import { getNextTypeSequence, type StallRecord, type StallStatus } from "@/data/stalls";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const ACCOUNTS_KEY = "smp-accounts";
const CURRENT_USER_KEY = "smp-current-user";

type AccountRole = "admin" | "collector";

type AccountRecord = {
  id: string;
  name: string;
  username: string;
  password: string;
  role: AccountRole;
  createdAt: string;
};

type VendorRow = {
  id: number | string | null;
  vendor: string | null;
  contact: string | null;
  type: string | null;
  monthly_rent: number | string | null;
  last_payment: string | null;
  next_due: string | null;
  status: string | null;
};

const DEFAULT_ACCOUNTS: AccountRecord[] = [
  {
    id: "default-admin",
    name: "System Admin",
    username: "admin",
    password: "admin123",
    role: "admin",
    createdAt: new Date().toISOString()
  },
  {
    id: "default-collector",
    name: "Market Collector",
    username: "collector",
    password: "collect123",
    role: "collector",
    createdAt: new Date().toISOString()
  }
];

const sanitizeUsername = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
const sanitizeName = (value: string) => value.trim().replace(/\s+/g, " ");

const normalizeAccounts = (records: unknown[]): AccountRecord[] => {
  return records.map((item, index) => {
    const record = (item ?? {}) as Partial<AccountRecord> & { email?: string };

    const candidateUsername =
      typeof record.username === "string"
        ? record.username
        : typeof record.email === "string"
        ? record.email
        : `user-${index + 1}`;

    let username = sanitizeUsername(candidateUsername);
    if (!username) {
      username = `user-${index + 1}`;
    }

    const nameValue = typeof record.name === "string" && record.name.trim() ? record.name : `Account ${index + 1}`;
    const passwordValue =
      typeof record.password === "string" && record.password.trim().length >= 3 ? record.password : "changeme";
    const roleValue: AccountRole = record.role === "admin" ? "admin" : "collector";

    return {
      id: typeof record.id === "string" && record.id.trim() ? record.id : `acc-${index}-${Date.now()}`,
      name: sanitizeName(nameValue),
      username,
      password: passwordValue,
      role: roleValue,
      createdAt:
        typeof record.createdAt === "string" && record.createdAt.trim()
          ? record.createdAt
          : new Date().toISOString()
    };
  });
};

const Index = () => {
  // ⬇️ Changed: start empty; Supabase will populate
  const [stalls, setStalls] = useState<StallRecord[]>([]);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AccountRecord | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string>("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({

    name: "",
    username: "",
    password: "",
    confirmPassword: "",
    role: "collector" as AccountRole
  });
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registerConfirmVisible, setRegisterConfirmVisible] = useState(false);

  useEffect(() => {
    const storedAccountsRaw = localStorage.getItem(ACCOUNTS_KEY);
    let parsedAccounts: unknown[] = [];

    if (storedAccountsRaw) {
      try {
        const parsed = JSON.parse(storedAccountsRaw);
        if (Array.isArray(parsed)) {
          parsedAccounts = parsed;
        }
      } catch (error) {
        console.warn("Failed to parse saved accounts, resetting to defaults.", error);
      }
    }

    const baseAccounts = parsedAccounts.length > 0 ? parsedAccounts : DEFAULT_ACCOUNTS;
    const normalizedAccounts = normalizeAccounts(baseAccounts);

    setAccounts(normalizedAccounts);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(normalizedAccounts));

    const storedUserRaw = localStorage.getItem(CURRENT_USER_KEY);
    if (storedUserRaw) {
      try {
        const storedUser = JSON.parse(storedUserRaw) as Partial<AccountRecord> & { email?: string };
        if (storedUser) {
          const username = sanitizeUsername(storedUser.username ?? storedUser.email ?? "");
          const match = normalizedAccounts.find((account) => account.username === username);
          if (match) {
            setCurrentUser(match);
          } else {
            localStorage.removeItem(CURRENT_USER_KEY);
          }
        }
      } catch (error) {
        console.warn("Failed to parse saved session.", error);
        localStorage.removeItem(CURRENT_USER_KEY);
      }
    }

    setAuthReady(true);
  }, []);
  useEffect(() => {
    let isCancelled = false;

    const loadStalls = async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,vendor,contact,type,monthly_rent,last_payment,next_due,status")
        .order("id", { ascending: true });

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load stalls from Supabase", error);
        return;
      }

      const rows = (data ?? []) as VendorRow[];

      if (rows.length === 0) {
        return;
      }

      const typeCounters = new Map<string, number>();
      const mapped: StallRecord[] = rows.map((row, index) => {
        const numericId = typeof row.id === "number" ? row.id : Number.parseInt(String(row.id ?? ""), 10);
        const safeId = Number.isFinite(numericId) && numericId > 0 ? numericId : Date.now() + index;
        const { sequence: typeSequence, typeValue } = getNextTypeSequence(typeCounters, row.type);

        const rawMonthlyRent = row.monthly_rent;
        let monthlyRentValue = 0;

        if (typeof rawMonthlyRent === "number") {
          monthlyRentValue = rawMonthlyRent;
        } else if (typeof rawMonthlyRent === "string") {
          const parsed = Number.parseFloat(rawMonthlyRent);
          monthlyRentValue = Number.isNaN(parsed) ? 0 : parsed;
        }

        const statusValue: StallStatus =
          typeof row.status === "string" && row.status.trim().length > 0
            ? (row.status as StallStatus)
            : "vacant";

        return {
          id: `stall-${safeId}`,
          dbId: safeId,
          name: `Stall ${typeSequence}`,
          vendor: row.vendor ?? "",
          contact: row.contact ?? "",
          type: typeValue,
          monthlyRent: monthlyRentValue,
          lastPayment: row.last_payment ?? "",
          nextDue: row.next_due ?? "",
          status: statusValue,
          occupied: statusValue !== "vacant"
        };
      });

      setStalls(mapped);
    };

    loadStalls();

    return () => {
      isCancelled = true;
    };
  }, []);

  const persistAccounts = (nextAccounts: AccountRecord[]) => {
    setAccounts(nextAccounts);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));
  };

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");

    const username = sanitizeUsername(loginForm.username);
    const password = loginForm.password.trim();

    if (!username || !password) {
      setAuthError("Enter both username and password.");
      return;
    }

    const account = accounts.find((record) => record.username === username && record.password === password);

    if (!account) {
      setAuthError("Invalid credentials. Check your username and password.");
      return;
    }

    setCurrentUser(account);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
    setLoginForm({ username: "", password: "" });
  };

  const handleRegister = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");

    const name = sanitizeName(registerForm.name);
    const username = sanitizeUsername(registerForm.username);
    const password = registerForm.password.trim();
    const confirmPassword = registerForm.confirmPassword.trim();
    const role = registerForm.role;

    if (!name || !username || !password || !confirmPassword) {
      setAuthError("Fill out all fields to create an account.");
      return;
    }

    if (username.length < 3) {
      setAuthError("Username must be at least 3 characters.");
      return;
    }

    if (accounts.some((record) => record.username === username)) {
      setAuthError("That username is already taken.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    const newAccount: AccountRecord = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}`,
      name,
      username,
      password,
      role,
      createdAt: new Date().toISOString()
    };

    const nextAccounts = [...accounts, newAccount];
    persistAccounts(nextAccounts);

    setCurrentUser(newAccount);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newAccount));

    setRegisterForm({ name: "", username: "", password: "", confirmPassword: "", role: "collector" });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
    setCurrentPage("dashboard");
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard onPageChange={setCurrentPage} stalls={stalls} />;
      case "collect":
        return <PaymentCollection stalls={stalls} />;
      case "history":
        return <PaymentHistory stalls={stalls} />;
      case "stalls":
        return <StallManagement stalls={stalls} onStallsChange={setStalls} />;
      case "reports":
        return <Reports />;
      case "scheduled":
        return <ScheduledCollections onNavigate={setCurrentPage} stalls={stalls} />;
      default:
        return <Dashboard onPageChange={setCurrentPage} stalls={stalls} />;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 via-secondary/30 to-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Sibulan Market Pay</CardTitle>
            <CardDescription className="text-center">
              {authMode === "login" ? "Sign in as a collector or admin" : "Create an account to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authMode === "login" ? (
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-1">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={loginPasswordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setLoginPasswordVisible((prev) => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={loginPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {loginPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {authError && <p className="text-sm text-destructive">{authError}</p>}
                <Button type="submit" className="w-full">
                  Sign in
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Need an account?{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError("");
                    }}
                  >
                    Register here
                  </button>
                </p>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="space-y-1">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input
                    id="register-name"
                    value={registerForm.name}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-username">Username</Label>
                  <Input
                    id="register-username"
                    value={registerForm.username}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-role">Role</Label>
                  <Select
                    value={registerForm.role}
                    onValueChange={(value) => setRegisterForm((prev) => ({ ...prev, role: value as AccountRole }))}
                  >
                    <SelectTrigger id="register-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="collector">Collector</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="register-password"
                      type={registerPasswordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={registerForm.password}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setRegisterPasswordVisible((prev) => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={registerPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {registerPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-confirm">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="register-confirm"
                      type={registerConfirmVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={registerForm.confirmPassword}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                      }
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setRegisterConfirmVisible((prev) => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={registerConfirmVisible ? "Hide password" : "Show password"}
                    >
                      {registerConfirmVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {authError && <p className="text-sm text-destructive">{authError}</p>}
                <Button type="submit" className="w-full">
                  Create account
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Already registered?{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                  >
                    Sign in instead
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-secondary/30 to-background">
      <div className="flex max-w-5xl mx-auto px-4 md:px-6">
        <Navigation
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onLogout={handleLogout}
          userName={currentUser.name}
          userRole={currentUser.role}
          userUsername={currentUser.username}
        />
        <main className="flex-1 md:ml-0 p-4 md:p-6 pb-24 space-y-6">
          <div className="rounded-lg border bg-card/60 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
            <p className="text-sm font-semibold text-foreground">{currentUser.name}</p>
            <p className="text-xs text-muted-foreground">Username: {currentUser.username}</p>
            <p className="text-xs text-muted-foreground capitalize">Role: {currentUser.role}</p>
          </div>
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};

export default Index;
