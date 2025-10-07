import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/components/Dashboard";
import { PaymentCollection } from "@/components/PaymentCollection"; // 🟢 Added
import { PaymentHistory } from "@/components/PaymentHistory"; // 🟢 Added
import { StallManagement } from "@/components/StallManagement"; // 🟢 Added
import { Reports } from "@/components/Reports"; // 🟢 Added
import { ScheduledCollections } from "@/components/ScheduledCollections"; // 🟢 Added
import { UnpaidDues } from "@/components/UnpaidDues";
import { type Invoice } from "@/components/UnpaidDues";
import { getNextTypeSequence, type StallRecord, type StallStatus } from "@/data/stalls";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  status: string | null;
};

// A dummy domain to append to usernames to make them valid for Supabase Auth.
const DUMMY_EMAIL_DOMAIN = "@example.com";

/**
 * Determines the stall status based on its next due date.
 * @param nextDueDate The due date string (e.g., "2024-08-15").
 * @param currentStatus The status from the database, to respect "vacant".
 * @returns The calculated StallStatus.
 */
const getStatusFromDueDate = (nextDueDate: string | null, currentStatus: string | null): StallStatus => {
  // If the stall is explicitly marked as vacant or has no due date, it's vacant.
  if (currentStatus === "vacant" || !nextDueDate) {
    return "vacant";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today to the start of the day for accurate comparison.

  const dueDate = new Date(nextDueDate);
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "due";
  return "current";
};

const Index = () => {
  const [stalls, setStalls] = useState<StallRecord[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot_password" | "reset_password">("login");
  const [authError, setAuthError] = useState<string>("");
  const [authMessage, setAuthMessage] = useState<string>("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
    role: "collector" as AccountRole
  });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ username: "" });
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: "", confirmPassword: "" });
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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        setAuthMode("reset_password");
        setAuthError("");
        setAuthMessage("You can now set a new password.");
      }
      setUser(session?.user ?? null); 
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const refreshData = () => {
    setDataVersion(v => v + 1);
  };

  // ✅ Load ALL invoices for reports
  useEffect(() => {
    const fetchAllInvoices = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor_id, vendor_name, stall_name, amount, due_date, status, paid_at, payment_type, collector_name, notes");

      if (!error) {
        setAllInvoices(data || []);
      }
    };
    fetchAllInvoices();
  }, [stalls, dataVersion]); // Re-fetch when data changes

  // ✅ Load unpaid invoices
  useEffect(() => {
    const fetchUnpaid = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor_id, vendor_name, stall_name, amount, due_date, status")
        .eq("status", "unpaid");

      if (!error) {
        setUnpaidInvoices(data || []);
      }
    };
    fetchUnpaid();
  }, [stalls, dataVersion]); // Re-fetch when stalls change, e.g., after a payment

  // ✅ Load stalls
  useEffect(() => {
    let isCancelled = false;

    const loadStalls = async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,vendor,contact,type,monthly_rent,last_payment,next_due,status")
        .order("id", { ascending: true });

      if (error) {
        if (!isCancelled) {
          toast({ title: "Failed to load stalls", description: error.message, variant: "destructive" });
        }
        return;
      }
      if (isCancelled) return;
      const rows = (data ?? []) as VendorRow[];

      const typeCounters = new Map<string, number>();
      const mapped: StallRecord[] = rows.map((row, index) => {
        const numericId = typeof row.id === "number" ? row.id : Number.parseInt(String(row.id ?? ""), 10);
        const safeId = Number.isFinite(numericId) && numericId > 0 ? numericId : Date.now() + index;
        const { sequence: typeSequence, typeValue } = getNextTypeSequence(typeCounters, row.type);
        const monthlyRentValue =
          typeof row.monthly_rent === "number"
            ? row.monthly_rent
            : Number.parseFloat(String(row.monthly_rent ?? 0)) || 0;

        // ✅ Automatically determine status based on the due date.
        const statusValue = getStatusFromDueDate(row.next_due, row.status);

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

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const username = loginForm.username.trim();
    const password = loginForm.password.trim();

    if (!username || !password) {
      setAuthError("Enter both username and password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: username + DUMMY_EMAIL_DOMAIN,
      password: password,
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
    setAuthError("");
    setAuthMessage("");

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
      email: username + DUMMY_EMAIL_DOMAIN,
      password: password,
      options: {
        data: {
          full_name: name,
          role: role,
        },
      },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setRegisterForm({ name: "", username: "", password: "", confirmPassword: "", role: "collector" });
    toast({ title: "Registration successful!", description: "You are now logged in." });
  };

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const username = forgotPasswordForm.username.trim();
    if (!username) {
      setAuthError("Please enter your username.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(username + DUMMY_EMAIL_DOMAIN, {
      redirectTo: window.location.origin, // URL to redirect to after password reset
    });

    if (error) {
      // Show a generic message to prevent user enumeration
      setAuthError("If an account with that username exists, a password reset link has been sent.");
    } else {
      setAuthMessage("If an account with that username exists, a password reset link has been sent to the associated email. Please check your inbox.");
      setAuthMode("login");
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const { password, confirmPassword } = resetPasswordForm;

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
    } else {
      setAuthMessage("Your password has been successfully reset. Please sign in.");
      setResetPasswordForm({ password: "", confirmPassword: "" });
      setAuthMode("login");
      toast({ title: "Password updated!", description: "You can now log in with your new password." });
    }
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
        return <PaymentCollection stalls={stalls} collectorName={user?.user_metadata?.full_name ?? "System"} onPaymentSuccess={refreshData} />;
      case "history":
        return <PaymentHistory stalls={stalls} invoices={allInvoices} />;
      case "stalls":
        return (
          <StallManagement
            stalls={stalls} onStallsChange={setStalls} userRole={user?.user_metadata?.role ?? ""}
          />
        );
      case "reports":
        return <Reports stalls={stalls} invoices={allInvoices} />;
      case "scheduled":
        return <ScheduledCollections onNavigate={setCurrentPage} stalls={stalls} />;
      case "unpaid":
        return <UnpaidDues />; // ✅ shows Unpaid Dues beside sidebar
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 via-secondary/30 to-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <img src="/logo.png" alt="Sibulan Market Pay Logo" className="mx-auto h-20 w-20 rounded-lg" />
            <CardTitle className="text-2xl font-bold text-center pt-2">Sibulan Market Pay</CardTitle>
            <CardDescription className="text-center pt-1">
              {
                {
                  login: "Sign in as a collector or admin",
                  register: "Create an account to continue",
                  forgot_password: "Reset your password",
                  reset_password: "Create a new password"
                }[authMode]
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              if (authMode === 'login') {
                return (
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-1">
                      <Label htmlFor="login-username">Username</Label>
                      <Input id="login-username" value={loginForm.username} onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))} autoComplete="username" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Input id="login-password" type={loginPasswordVisible ? "text" : "password"} autoComplete="current-password" value={loginForm.password} onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))} className="pr-10" required />
                        <button type="button" onClick={() => setLoginPasswordVisible(p => !p)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground" aria-label={loginPasswordVisible ? "Hide password" : "Show password"}>
                          {loginPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}
                    <Button type="submit" className="w-full">Sign in</Button>
                    {/* <p className="text-xs text-muted-foreground text-center">
                      <button type="button" className="text-primary underline" onClick={() => { setAuthMode("forgot_password"); setAuthError(""); setAuthMessage(""); }}>
                        Forgot password?
                      </button>
                    </p> */}
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      Need an account?{" "}
                      <button type="button" className="text-primary underline" onClick={() => { setAuthMode("register"); setAuthError(""); }}>Register here</button>
                    </p>
                  </form>
                );
              } else if (authMode === 'register') {
                return (
                  <form className="space-y-4" onSubmit={handleRegister}>
                    <div className="space-y-1"><Label htmlFor="register-name">Full name</Label><Input id="register-name" value={registerForm.name} onChange={(e) => setRegisterForm(p => ({ ...p, name: e.target.value }))} required /></div>
                    <div className="space-y-1"><Label htmlFor="register-username">Username</Label><Input id="register-username" value={registerForm.username} onChange={(e) => setRegisterForm(p => ({ ...p, username: e.target.value }))} autoComplete="username" required /></div>
                    <div className="space-y-1"><Label htmlFor="register-role">Role</Label><Select value={registerForm.role} onValueChange={(v) => setRegisterForm(p => ({ ...p, role: v as AccountRole }))}><SelectTrigger id="register-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collector">Collector</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><Label htmlFor="register-password">Password</Label><div className="relative"><Input id="register-password" type={registerPasswordVisible ? "text" : "password"} autoComplete="new-password" value={registerForm.password} onChange={(e) => setRegisterForm(p => ({ ...p, password: e.target.value }))} className="pr-10" required /><button type="button" onClick={() => setRegisterPasswordVisible(p => !p)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground">{registerPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                    <div className="space-y-1"><Label htmlFor="register-confirm">Confirm password</Label><div className="relative"><Input id="register-confirm" type={registerConfirmVisible ? "text" : "password"} autoComplete="new-password" value={registerForm.confirmPassword} onChange={(e) => setRegisterForm(p => ({ ...p, confirmPassword: e.target.value }))} className="pr-10" required /><button type="button" onClick={() => setRegisterConfirmVisible(p => !p)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground">{registerConfirmVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}
                    <Button type="submit" className="w-full">Create account</Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Already registered?{" "}
                      <button type="button" className="text-primary underline" onClick={() => { setAuthMode("login"); setAuthError(""); setAuthMessage(""); }}>Sign in instead</button>
                    </p>
                  </form>
                );
              } else if (authMode === 'reset_password') {
                return (
                  <form className="space-y-4" onSubmit={handleResetPassword}>
                    <div className="space-y-1">
                      <Label htmlFor="reset-password">New Password</Label>
                      <div className="relative"><Input id="reset-password" type={resetPasswordVisible ? "text" : "password"} value={resetPasswordForm.password} onChange={(e) => setResetPasswordForm(p => ({ ...p, password: e.target.value }))} className="pr-10" required /><button type="button" onClick={() => setResetPasswordVisible(p => !p)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground">{resetPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="reset-confirm">Confirm New Password</Label>
                      <div className="relative"><Input id="reset-confirm" type={resetConfirmVisible ? "text" : "password"} value={resetPasswordForm.confirmPassword} onChange={(e) => setResetPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} className="pr-10" required /><button type="button" onClick={() => setResetConfirmVisible(p => !p)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground">{resetConfirmVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                    </div>
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}
                    <Button type="submit" className="w-full">Set New Password</Button>
                    <p className="text-xs text-muted-foreground text-center">
                      <button type="button" className="text-primary underline" onClick={() => { setAuthMode("login"); setAuthError(""); setAuthMessage(""); }}>Back to Sign In</button>
                    </p>
                  </form>
                );
              } else { // forgot_password
                return (
                  <form className="space-y-4" onSubmit={handleForgotPassword}>
                    <div className="space-y-1">
                      <Label htmlFor="forgot-username">Username</Label>
                      <Input id="forgot-username" value={forgotPasswordForm.username} onChange={(e) => setForgotPasswordForm({ username: e.target.value })} autoComplete="username" required />
                    </div>
                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}
                    <Button type="submit" className="w-full">Send Reset Link</Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Remembered your password?{" "}
                      <button type="button" className="text-primary underline" onClick={() => { setAuthMode("login"); setAuthError(""); setAuthMessage(""); }}>
                        Back to Sign In
                      </button>
                    </p>
                  </form>
                );
              }
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-secondary/30 to-background">
      <div className="flex max-w-7xl mx-auto px-2 md:px-6"> {/* ✅ made wider */}
        <Navigation
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onLogout={handleLogout}
          userName={user.user_metadata.full_name}
          userRole={user.user_metadata.role}
          userUsername={user.email.split('@')[0]}
        />
        <main className="flex-1 md:ml-0 p-4 md:p-6 pb-24 space-y-6 overflow-y-auto">
          <div className="rounded-lg border bg-card/60 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
            <p className="text-sm font-semibold text-foreground">{user.user_metadata.full_name}</p>
            <p className="text-xs text-muted-foreground">Username: {user.email.split('@')[0]}</p>
            <p className="text-xs text-muted-foreground capitalize">Role: {user.user_metadata.role}</p>
          </div>
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};

export default Index;
