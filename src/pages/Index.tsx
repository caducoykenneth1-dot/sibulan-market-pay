import { useEffect, useState, useMemo } from "react";
import { Navigation } from "@/components/Navigation.tsx";
import { Dashboard } from "@/components/Dashboard";
import { PaymentCollection } from "@/components/PaymentCollection"; // 🟢 Added
import { PaymentHistory } from "@/components/PaymentHistory"; // 🟢 Added
import { StallManagement } from "@/components/StallManagement"; // 🟢 Added
import { Reports } from "@/components/Reports"; // 🟢 Added
import { ScheduledCollections } from "@/components/ScheduledCollections"; // 🟢 Added
import { ArchivedStalls } from "@/components/ArchivedStalls"; // 🟢 Added
import { UnpaidDues } from "@/components/UnpaidDues";
import { type Invoice } from "@/components/UnpaidDues";
import {
  computeStatusFromDueDate,
  getNextTypeSequence,
  type StallRecord,
  type StallStatus,
} from "@/data/stalls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

type AccountRole = "admin" | "collector";

type VendorRow = {
  id: number | string | null;
  vendor: string | null;
  contact: string | null;
  type: string | null;
  monthly_rent: number | string | null;
  last_payment: string | null;
  next_due: string | null;
  rental_type: "monthly" | "daily" | null;
  status: string | null;
};

// A dummy domain to append to usernames to make them valid for Supabase Auth.
const DUMMY_EMAIL_DOMAIN = "@example.com";

const Index = () => {
  const [rawStalls, setRawStalls] = useState<StallRecord[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot_password" | "reset_password"
  >("login");
  const [authError, setAuthError] = useState<string>("");
  const [authMessage, setAuthMessage] = useState<string>("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
    role: "collector" as AccountRole,
  });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({
    username: "",
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registerConfirmVisible, setRegisterConfirmVisible] = useState(false);
  const { toast } = useToast();

  // ✅ Check for active session
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (_event === "PASSWORD_RECOVERY") {
          setAuthMode("reset_password");
          setAuthError("");
          setAuthMessage("You can now set a new password.");
        }
        setUser(session?.user ?? null);
      }
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  const refreshData = () => {
    setDataVersion((v) => v + 1);
  };

  // ✅ Load ALL invoices for reports
  useEffect(() => {
    const fetchAllInvoices = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, vendor_id, vendor_name, stall_name, amount, due_date, status, paid_at, payment_type, collector_name, notes, stall_type"
        );

      if (!error) {
        setAllInvoices(data || []);
      }
    };
    fetchAllInvoices(); // Re-fetch when data changes
  }, [rawStalls, dataVersion]);

  // ✅ Load unpaid invoices
  useEffect(() => {
    const fetchUnpaid = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, vendor_id, vendor_name, stall_name, amount, due_date, status"
        )
        .eq("status", "unpaid");

      if (!error) {
        setUnpaidInvoices(data || []);
      }
    };
    fetchUnpaid();
  }, [rawStalls, dataVersion]); // Re-fetch when stalls change, e.g., after a payment

  // ✅ Load stalls
  useEffect(() => {
    let isCancelled = false;

    const loadStalls = async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id,vendor,contact,type,monthly_rent,last_payment,next_due,status,rental_type"
        )
        .order("id", { ascending: true });

      if (error) {
        if (!isCancelled) {
          if (!navigator.onLine) {
            toast({
              title: "No Internet Connection",
              description:
                "Could not load stalls. Please check your connection and try again.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Failed to load stalls",
              description: error.message,
              variant: "destructive",
            });
          }
        }
        return;
      }
      if (isCancelled) return;
      const rows = (data ?? []) as VendorRow[];
      const typeCounters = new Map<string, number>();
      const mapped: StallRecord[] = rows.map((row, index) => {
        const numericId =
          typeof row.id === "number"
            ? row.id
            : Number.parseInt(String(row.id ?? ""), 10);
        const safeId =
          Number.isFinite(numericId) && numericId > 0
            ? numericId
            : Date.now() + index;
        const { sequence: typeSequence, typeValue } = getNextTypeSequence(
          typeCounters,
          row.type
        );
        const monthlyRentValue =
          typeof row.monthly_rent === "number"
            ? row.monthly_rent
            : Number.parseFloat(String(row.monthly_rent ?? 0)) || 0;

        // ✅ Automatically determine status based on the due date.
        const statusValue = computeStatusFromDueDate(row.next_due, row.status);

        return {
          id: `stall-${safeId}`,
          dbId: safeId,
          name: `Stall ${typeSequence}`,
          vendor: row.vendor ?? "",
          contact: row.contact ?? "",
          type: typeValue,
          rentAmount: monthlyRentValue,
          rentalType: row.rental_type || "monthly",
          lastPayment: row.last_payment ?? "",
          nextDue: row.next_due ?? "",
          status: statusValue,
          occupied: statusValue !== "vacant" && statusValue !== "archived",
        };
      });

      setRawStalls(mapped);
    };

    loadStalls();
    return () => {
      isCancelled = true;
    };
  }, [dataVersion]);

  // ✅ Filter out archived stalls using useMemo for performance
  const stalls = useMemo(() => {
    return rawStalls.filter((stall) => stall.status !== "archived");
  }, [rawStalls]);

  const resetFeedback = () => {
    setAuthError("");
    setAuthMessage("");
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const username = loginForm.username.trim();
    const password = loginForm.password.trim();

    if (!username || !password) {
      setAuthError("Enter both username and password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: `${username}${DUMMY_EMAIL_DOMAIN}`,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setLoginForm({ username: "", password: "" });
    toast({ title: "Login successful!", description: "Welcome back." });
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const name = registerForm.name.trim();
    const username = registerForm.username.trim();
    const password = registerForm.password.trim();
    const confirmPassword = registerForm.confirmPassword.trim();
    const role = registerForm.role;

    if (!name || !username || !password || !confirmPassword) {
      setAuthError("Fill out all fields to create an account.");
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

    const { error } = await supabase.auth.signUp({
      email: `${username}${DUMMY_EMAIL_DOMAIN}`,
      password,
      options: {
        data: {
          full_name: name,
          role,
        },
      },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setRegisterForm({
      name: "",
      username: "",
      password: "",
      confirmPassword: "",
      role: "collector",
    });

    toast({
      title: "Registration successful!",
      description: "You can now sign in using your credentials.",
    });
    setAuthMode("login");
  };

  const handleForgotPassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    resetFeedback();

    const username = forgotPasswordForm.username.trim();
    if (!username) {
      setAuthError("Enter your username to receive a reset link.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      `${username}${DUMMY_EMAIL_DOMAIN}`,
      {
        redirectTo: window.location.origin,
      }
    );

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("A password reset link has been sent to your email.");
  };

  const handleResetPassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    resetFeedback();

    const password = resetPasswordForm.password.trim();
    const confirmPassword = resetPasswordForm.confirmPassword.trim();

    if (!password || !confirmPassword) {
      setAuthError("Complete both password fields.");
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

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setResetPasswordForm({ password: "", confirmPassword: "" });
    toast({
      title: "Password updated",
      description: "You can now sign in with your new password.",
    });
    setAuthMode("login");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentPage("dashboard");
  };

  // ✅ All pages including Unpaid Dues
  const renderCurrentPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            onPageChange={setCurrentPage}
            stalls={stalls}
            unpaidInvoices={allInvoices}
            userRole={user?.user_metadata?.role ?? ""}
          />
        );
      case "collect":
        return (
          <PaymentCollection
            stalls={stalls}
            collectorName={user?.user_metadata?.full_name ?? "System"}
            onPaymentSuccess={refreshData}
          />
        );
      case "history":
        return <PaymentHistory stalls={stalls} invoices={allInvoices} />;
      case "stalls":
        return (
          <StallManagement
            stalls={stalls}
            onStallsChange={refreshData}
            userRole={user?.user_metadata?.role ?? ""}
          />
        );
      case "reports":
        return <Reports stalls={stalls} invoices={allInvoices} />;
      case "scheduled":
        return (
          <ScheduledCollections onNavigate={setCurrentPage} stalls={stalls} />
        );
      case "archived":
        return <ArchivedStalls onDataChange={refreshData} allStalls={rawStalls} />;
      case "unpaid":
        return <UnpaidDues />;
      default:
        return (
          <Dashboard
            onPageChange={setCurrentPage}
            stalls={stalls}
            unpaidInvoices={allInvoices}
            userRole={user?.user_metadata?.role ?? ""}
          />
        );
    }
  };

  if (!user) {
    const authDescriptions: Record<typeof authMode, string> = {
      login: "Sign in as a collector or admin to continue.",
      register: "Create an account to access Sibulan Market Pay.",
      forgot_password: "Enter your username to receive a reset link.",
      reset_password: "Set a new password for your account.",
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 via-secondary/30 to-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3 text-center">
            <img
              src="/logo.png"
              alt="Sibulan Market Pay Logo"
              className="mx-auto h-20 w-20 rounded-lg"
            />
            <CardTitle className="text-2xl font-bold">Sibulan Market Pay</CardTitle>
            <CardDescription>{authDescriptions[authMode]}</CardDescription>
          </CardHeader>
          <CardContent>
            {authMode === "login" && (
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-1">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    value={loginForm.username}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                    }
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
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="current-password"
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
                {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                <Button type="submit" className="w-full">
                  Sign in
                </Button>
                <div className="text-xs text-muted-foreground space-y-2 text-center">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      resetFeedback();
                      setAuthMode("register");
                    }}
                  >
                    Need an account? Register here
                  </button>
                  <div>
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => {
                        resetFeedback();
                        setAuthMode("forgot_password");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </form>
            )}

            {authMode === "register" && (
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="space-y-1">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input
                    id="register-name"
                    value={registerForm.name}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-username">Username</Label>
                  <Input
                    id="register-username"
                    value={registerForm.username}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-role">Role</Label>
                  <Select
                    value={registerForm.role}
                    onValueChange={(value) =>
                      setRegisterForm((prev) => ({ ...prev, role: value as AccountRole }))
                    }
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
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="new-password"
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
                      value={registerForm.confirmPassword}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                      }
                      autoComplete="new-password"
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
                {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                <Button type="submit" className="w-full">
                  Create account
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Already registered?{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      resetFeedback();
                      setAuthMode("login");
                    }}
                  >
                    Sign in instead
                  </button>
                </p>
              </form>
            )}

            {authMode === "forgot_password" && (
              <form className="space-y-4" onSubmit={handleForgotPassword}>
                <div className="space-y-1">
                  <Label htmlFor="forgot-username">Username</Label>
                  <Input
                    id="forgot-username"
                    value={forgotPasswordForm.username}
                    onChange={(event) =>
                      setForgotPasswordForm({ username: event.target.value })
                    }
                    autoComplete="username"
                    required
                  />
                </div>

                {authError && <p className="text-sm text-destructive">{authError}</p>}
                {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                <Button type="submit" className="w-full">
                  Send reset link
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Remembered your password?{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      resetFeedback();
                      setAuthMode("login");
                    }}
                  >
                    Back to sign in
                  </button>
                </p>
              </form>
            )}

            {authMode === "reset_password" && (
              <form className="space-y-4" onSubmit={handleResetPassword}>
                <div className="space-y-1">
                  <Label htmlFor="reset-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="reset-password"
                      type={resetPasswordVisible ? "text" : "password"}
                      value={resetPasswordForm.password}
                      onChange={(event) =>
                        setResetPasswordForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setResetPasswordVisible((prev) => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={resetPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {resetPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reset-confirm">Confirm new password</Label>
                  <div className="relative">
                    <Input
                      id="reset-confirm"
                      type={resetConfirmVisible ? "text" : "password"}
                      value={resetPasswordForm.confirmPassword}
                      onChange={(event) =>
                        setResetPasswordForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setResetConfirmVisible((prev) => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={resetConfirmVisible ? "Hide password" : "Show password"}
                    >
                      {resetConfirmVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {authError && <p className="text-sm text-destructive">{authError}</p>}
                {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                <Button type="submit" className="w-full">
                  Set new password
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      resetFeedback();
                      setAuthMode("login");
                    }}
                  >
                    Back to sign in
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 md:flex-row md:gap-6 md:px-4">
        <div className="md:sticky md:top-6 md:w-64 md:flex-shrink-0">
          <Navigation
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onLogout={handleLogout}
            userName={user.user_metadata.full_name}
            userRole={user.user_metadata.role}
            userUsername={user.email.split("@")[0]}
          />
        </div>

        <main className="flex-1 w-full space-y-6 p-4 pt-24 md:p-6 md:pt-6 with-bottom-nav">
          <div className="rounded-lg border bg-card/60 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Signed in as
            </p>
            <p className="text-sm font-semibold text-foreground">
              {user.user_metadata.full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              Username: {user.email.split("@")[0]}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              Role: {user.user_metadata.role}
            </p>
          </div>
          {renderCurrentPage()}
        </main>
      </div>

    </div>
  );
};

export default Index;
