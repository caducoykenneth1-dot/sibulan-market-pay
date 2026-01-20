import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Navigation } from "@/components/Navigation.tsx";
import { Dashboard } from "@/components/Dashboard";
import { PaymentCollection } from "@/components/PaymentCollection";
import { PaymentHistory } from "@/components/PaymentHistory";
import { StallManagement } from "@/components/StallManagement";
import { Reports } from "@/components/Reports";
import { UserManagement, type Account } from "@/components/UserManagement";
import { ArchivedStalls } from "@/components/ArchivedStalls";
import { UnpaidDues } from "@/components/UnpaidDues";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { type Invoice } from "@/components/UnpaidDues";
import { CollectorProfile } from "@/components/CollectorProfile";
import { ActivityLog } from "@/components/ActivityLog";
import {
  computeStatusFromDueDate,
  getNextTypeSequence,
  type StallRecord,
  STALL_TYPES,
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
import { Eye, EyeOff, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

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
  archive_reason?: string | null;
};

// A dummy domain to append to usernames to make them valid for Supabase Auth.
const DUMMY_EMAIL_DOMAIN = "@example.com";
const sectionMap = new Map(STALL_TYPES.map((type) => [type.name, type.section]));

// 👉 Your deployed Edge Function base URL
const USER_MGMT_FN =
  "https://idokfqcmophowhtdjymi.supabase.co/functions/v1/user-management";

const Index = () => {
  const [rawStalls, setRawStalls] = useState<StallRecord[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [user, setUser] = useState<any>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [newCollections, setNewCollections] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("CONNECTING");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem("collectorAvatarUrl");
  });

  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot_password" | "reset_password"
  >("login");
  const [authError, setAuthError] = useState<string>("");
  const [authMessage, setAuthMessage] = useState<string>("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    username: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
    role: "collector" as AccountRole,
  });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({
    phone: "",
    code: "",
  });
  const [forgotStage, setForgotStage] = useState<"request" | "verify">("request");
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [resetPasswordVisible, setResetPasswordVisible] = useState(true);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(true);
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registerConfirmVisible, setRegisterConfirmVisible] = useState(false);
  const { toast } = useToast();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // ✅ Poll for user updates (Real-time unassignment check)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      // Fetch latest user data from Supabase Auth
      const { data: { user: latestUser }, error } = await supabase.auth.getUser();
      
      if (latestUser && !error) {
        // Check if section assignment has changed
        const currentSection = user.user_metadata?.market_section || user.user_metadata?.section;
        const newSection = latestUser.user_metadata?.market_section || latestUser.user_metadata?.section;
        
        // Check if role has changed
        const currentRole = user.user_metadata?.role;
        const newRole = latestUser.user_metadata?.role;

        if (currentSection !== newSection || currentRole !== newRole) {
          console.log("🔄 User assignment/role updated from server.");
          setUser(latestUser);
          
          // If unassigned, show a toast
          if (latestUser.user_metadata?.role === 'collector' && (!newSection || newSection === 'unassigned') && currentSection && currentSection !== 'unassigned') {
             toast({
               title: "Access Updated",
               description: "You have been unassigned from your section.",
               variant: "destructive"
             });
          }
        }
      }
    }, 3000); // Check every 3 seconds for responsiveness

    return () => clearInterval(interval);
  }, [user, toast]);

  // ✅ Fetch unread notifications badge count
  useEffect(() => {
    if (!user?.id) return;

    const fetchUnreadCount = async () => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact" })
          .eq("user_id", user.id)
          .eq("read", false);

        if (!error && data) {
          setUnreadNotifications(data.length);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };

    fetchUnreadCount();

    // Subscribe to notification changes
    const subscription = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const unpaidInvoices = useMemo(() => {
    return allInvoices.filter((inv) => inv.status === "unpaid");
  }, [allInvoices]);

  // ✅ Mark notifications as read when user opens notifications page
  useEffect(() => {
    if (currentPage === "notifications" && user?.id) {
      const markAsRead = async () => {
        try {
          console.log("🔔 Marking all unread notifications as read...");
          
          // First, fetch all unread notifications to see what we're updating
          const { data: unreadBefore } = await supabase
            .from("notifications")
            .select("id, read")
            .eq("user_id", user.id)
            .eq("read", false);
          
          console.log("📋 Unread notifications BEFORE update:", unreadBefore);
          
          // Now update them
          const { data: updateResult, error } = await supabase
            .from("notifications")
            .update({ read: true })
            .eq("user_id", user.id)
            .eq("read", false)
            .select();
          
          if (error) {
            console.error("❌ Error marking notifications as read:", error);
            console.error("Error details:", error.details, error.message);
          } else {
            console.log("✅ Updated notifications:", updateResult);
            
            // Verify the update actually happened
            const { data: unreadAfter, error: refetchError } = await supabase
              .from("notifications")
              .select("id, read")
              .eq("user_id", user.id)
              .eq("read", false);
            
            if (refetchError) {
              console.error("❌ Error refetching:", refetchError);
            } else {
              console.log("📋 Unread notifications AFTER update:", unreadAfter);
              setUnreadNotifications(unreadAfter?.length || 0);
            }
          }
        } catch (err) {
          console.error("❌ Exception in markAsRead:", err);
        }
      };
      markAsRead();
    }
  }, [currentPage, user?.id]);

  // ✅ Clear collections badge when user opens history page
  useEffect(() => {
    if (currentPage === "history") {
      setNewCollections(0);
    }
  }, [currentPage]);
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const todaysPaid = allInvoices.filter(
      (inv) => inv.status === "paid" && inv.paid_at?.startsWith(today)
    );
    setNewCollections(todaysPaid.length);
  }, [allInvoices]);

  // ✅ Fetch all user accounts for the admin via Edge Function (secure)
  useEffect(() => {
    const fetchAccounts = async () => {
      if (user?.user_metadata?.role !== "admin") return;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      try {
        const res = await fetch(USER_MGMT_FN, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json();
        if (!res.ok) {
          toast({
            title: "Unable to load users",
            description:
              result?.message || "Your account may not have admin access.",
            variant: "destructive",
          });
          return;
        }
        if (result?.users) {
          // Result shape: { id, email, full_name, role, created_at, last_sign_in_at }
          setAccounts(result.users as Account[]);
        }
      } catch (e: any) {
        toast({
          title: "Error fetching users",
          description: e?.message ?? "Network error",
          variant: "destructive",
        });
      }
    };
    fetchAccounts();
  }, [user, dataVersion, toast]);

  const refreshData = useCallback(() => setDataVersion((v) => v + 1), []);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      refreshData();
    }, 500);
  }, [refreshData]);

  // ✅ Real-time Data Sync
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("global-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => {
          console.log("🔔 Realtime Invoice Update:", payload);
          debouncedRefresh();

          // Notify Admin when a payment is marked as PAID
          if (user?.user_metadata?.role === "admin") {
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;
            
            // Check for INSERT of paid invoice OR UPDATE to paid status
            const isNewPayment = 
              (payload.eventType === "INSERT" && newRecord?.status === "paid") ||
              (payload.eventType === "UPDATE" && newRecord?.status === "paid" && oldRecord?.status !== "paid");

            if (isNewPayment) {
              toast({
                title: "New Collection",
                description: `Payment received from ${newRecord?.vendor_name || "a vendor"}.`,
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendors" },
        (payload) => {
          console.log("🔔 Realtime Vendor Update:", payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        console.log("📡 Realtime Status:", status);
        setRealtimeStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, toast, debouncedRefresh]);

  // ✅ Load ALL invoices for reports
  // This runs on mount and when dataVersion changes (manual refresh or vendor change)
  useEffect(() => {
    const fetchAllInvoices = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, vendor_id, vendor_name, stall_name, amount, due_date, status, paid_at, payment_type, collector_name, collector_id, notes, stall_type, receipt_number"
        );

      if (!error) {
        setAllInvoices(data || []);
      }
    };
    fetchAllInvoices();
  }, [dataVersion]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (avatarUrl) {
      localStorage.setItem("collectorAvatarUrl", avatarUrl);
    } else {
      localStorage.removeItem("collectorAvatarUrl");
    }
  }, [avatarUrl]);

  // ✅ Load stalls
  useEffect(() => {
    let isCancelled = false;

    const loadStalls = async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id,vendor,contact,type,monthly_rent,last_payment,next_due,status,rental_type,archive_reason"
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

        const statusValue = computeStatusFromDueDate(row.next_due, row.status);
        const section = sectionMap.get(typeValue) ?? "N/A";

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
          section,
          archive_reason: row.archive_reason ?? null,
        };
      });

      setRawStalls(mapped);
    };

    loadStalls();
    return () => {
      isCancelled = true;
    };
  }, [dataVersion, toast]);

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username}${DUMMY_EMAIL_DOMAIN}`,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    // Log the login activity
    if (data.user) {
      await supabase.from("activity_logs").insert({
        user_id: data.user.id,
        user_name: data.user.user_metadata.full_name || username,
        action: "LOGIN",
        details: "User logged in successfully"
      });
    }

    setLoginForm({ username: "", password: "" });
    toast({ title: "Login successful!", description: "Welcome back." });
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const name = registerForm.name.trim();
    const username = registerForm.username.trim();
    const phone = registerForm.phone.trim();
    const address = registerForm.address.trim();
    const password = registerForm.password.trim();
    const confirmPassword = registerForm.confirmPassword.trim();
    const role = registerForm.role;

    if (!name || !username || !phone || !address || !password || !confirmPassword) {
      setAuthError("Fill out all fields to create an account.");
      return;
    }

    if (!/^\d{11}$/.test(phone)) {
      setAuthError("Phone number must be exactly 11 digits.");
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
          phone,
          address,
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
      phone: "",
      address: "",
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

  const phone = forgotPasswordForm.phone.trim();
  if (!phone) {
    setAuthError("Enter your phone number to receive a reset code.");
    return;
  }

  try {
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const res = await fetch(
      "https://idokfqcmophowhtdjymi.supabase.co/functions/v1/send-reset-otp",
      {
        method: "POST",
        headers: {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
},

        body: JSON.stringify({
          phone, // 09XXXXXXXXX
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      setAuthError(result?.message || "Failed to send reset code.");
      return;
    }

    setAuthMessage(
      "If this number is registered, an SMS with a code has been sent."
    );
    setForgotStage("verify");
  } catch (e: any) {
    setAuthError(e?.message ?? "Network error sending SMS.");
  }
};



 const handleVerifyReset = async (
  event: React.FormEvent<HTMLFormElement>
) => {
  event.preventDefault();
  resetFeedback();

  const phone = forgotPasswordForm.phone.trim();
  const code = forgotPasswordForm.code.trim();
  const password = resetPasswordForm.password.trim();
  const confirmPassword = resetPasswordForm.confirmPassword.trim();

  if (!phone || !code || !password || !confirmPassword) {
    setAuthError("Complete all fields.");
    return;
  }

  if (password !== confirmPassword) {
    setAuthError("Passwords do not match.");
    return;
  }

  try {
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const res = await fetch(
      "https://idokfqcmophowhtdjymi.supabase.co/functions/v1/verify-reset-otp",
      {
        method: "POST",
        headers: {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
},

        body: JSON.stringify({
          phone: phone,
          code: code,
          newPassword: password,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      setAuthError(result?.error || "Verification failed.");
      return;
    }

    setAuthMessage("Password updated. You can now sign in.");
    setAuthMode("login");
    setForgotStage("request");
    setForgotPasswordForm({ phone: "", code: "" });
    setResetPasswordForm({ password: "", confirmPassword: "" });
  } catch (e: any) {
    setAuthError(e?.message ?? "Network error verifying code.");
  }
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
    if (user) {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Unknown",
        action: "LOGOUT",
        details: "User logged out",
      });
    }

    await supabase.auth.signOut();
    setUser(null);
    setCurrentPage("dashboard");
    window.location.reload();
  };

  // ✅ All pages including Unpaid Dues
  const renderCurrentPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            onPageChange={setCurrentPage}
            stalls={stalls}
            unpaidInvoices={allInvoices} // Dashboard uses all invoices to calculate stats
            userRole={user?.user_metadata?.role ?? ""}
            userName={user?.user_metadata?.full_name ?? ""}
            userUsername={user?.email?.split("@")[0] ?? ""}
            avatarUrl={avatarUrl}
          />
        );
      case "collect":
        return (
          <PaymentCollection
            stalls={stalls}
            collectorName={user?.user_metadata?.full_name ?? "System"}
            collectorId={user?.id ?? ""}
            onPaymentSuccess={refreshData}
            userRole={user?.user_metadata?.role}
            userSection={user?.user_metadata?.market_section || user?.user_metadata?.section}
          />
        );
      case "history":
        return <PaymentHistory stalls={rawStalls} invoices={allInvoices} userRole={user?.user_metadata?.role ?? ""} userId={user?.id} />;
      case "stalls":
        return (
          <StallManagement
            stalls={stalls}
            onStallsChange={refreshData}
            userRole={user?.user_metadata?.role ?? ""}
            userName={user?.user_metadata?.full_name ?? ""}
            userId={user?.id}
            invoices={allInvoices}
            userSection={user?.user_metadata?.market_section || user?.user_metadata?.section}
          />
        );
      case "reports":
        return <Reports stalls={stalls} invoices={allInvoices} />;
      case "users":
        return (
          <UserManagement accounts={accounts} onAccountsChange={refreshData} />
        );
      case "archived":
        return (
          <ArchivedStalls 
            onDataChange={refreshData} 
            allStalls={rawStalls} 
            userRole={user?.user_metadata?.role ?? ""} 
            userName={user?.user_metadata?.full_name ?? ""}
            userId={user?.id}
          />
        );
      case "unpaid":
        return <UnpaidDues 
          invoices={allInvoices} 
          userRole={user?.user_metadata?.role}
          userSection={user?.user_metadata?.market_section || user?.user_metadata?.section}
        />;
      case "notifications":
        return <NotificationsPanel userId={user?.id} />;
      case "activity":
        return <ActivityLog />;
      case "profile":
        return (
          <CollectorProfile
            userName={user?.user_metadata?.full_name ?? ""}
            userUsername={user?.email?.split("@")[0] ?? ""}
            userRole={user?.user_metadata?.role ?? ""}
            onBack={() => setCurrentPage("dashboard")}
            avatarUrl={avatarUrl}
            onAvatarChange={setAvatarUrl}
            invoices={allInvoices}
          />
        );
      default:
        return (
          <Dashboard
            onPageChange={setCurrentPage}
            stalls={stalls}
            unpaidInvoices={allInvoices} // Dashboard uses all invoices to calculate stats
            userRole={user?.user_metadata?.role ?? ""}
            userName={user?.user_metadata?.full_name ?? ""}
            userUsername={user?.email?.split("@")[0] ?? ""}
            avatarUrl={avatarUrl}
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
            <CardTitle className="text-2xl font-bold">
              Sibulan Market Pay
            </CardTitle>
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
                      setLoginForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
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
                        setLoginForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      autoComplete="current-password"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLoginPasswordVisible((prev) => !prev)
                      }
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={
                        loginPasswordVisible ? "Hide password" : "Show password"
                      }
                    >
                      {loginPasswordVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {authError && (
                  <p className="text-sm text-destructive">{authError}</p>
                )}
                {authMessage && (
                  <p className="text-sm text-emerald-600">{authMessage}</p>
                )}

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
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex items-center gap-2 px-0 text-sm"
                    onClick={() => {
                      resetFeedback();
                      setAuthMode("login");
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to sign in
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input
                    id="register-name"
                    value={registerForm.name}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
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
                      setRegisterForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-phone">Phone number</Label>
                  <Input
                    id="register-phone"
                    value={registerForm.phone}
                    inputMode="numeric"
                    maxLength={11}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        phone: event.target.value.replace(/\D/g, "").slice(0, 11),
                      }))
                    }
                    placeholder="09XXXXXXXXX"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-address">Address</Label>
                  <Textarea
                    id="register-address"
                    value={registerForm.address}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        address: event.target.value,
                      }))
                    }
                    placeholder="House number, street, barangay, city"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-role">Role</Label>
                  <Select
                    value={registerForm.role}
                    onValueChange={(value) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        role: value as AccountRole,
                      }))
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
                        setRegisterForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRegisterPasswordVisible((prev) => !prev)
                      }
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={
                        registerPasswordVisible
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {registerPasswordVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
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
                        setRegisterForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRegisterConfirmVisible((prev) => !prev)
                      }
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                      aria-label={
                        registerConfirmVisible
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {registerConfirmVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {authError && (
                  <p className="text-sm text-destructive">{authError}</p>
                )}
                {authMessage && (
                  <p className="text-sm text-emerald-600">{authMessage}</p>
                )}

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
              <>
                {forgotStage === "request" ? (
                  <form className="space-y-4" onSubmit={handleForgotPassword}>
                    <div className="space-y-1">
                      <Label htmlFor="forgot-phone">Phone number</Label>
                      <Input
                        id="forgot-phone"
                        value={forgotPasswordForm.phone}
                        inputMode="numeric"
                        maxLength={11}
                        onChange={(event) =>
                          setForgotPasswordForm((prev) => ({
                            ...prev,
                            phone: event.target.value.replace(/\D/g, "").slice(0, 11),
                          }))
                        }
                        placeholder="09XXXXXXXXX"
                        required
                      />
                    </div>

                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                    <Button type="submit" className="w-full">
                      Send code
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
                ) : (
                  <form className="space-y-4" onSubmit={handleVerifyReset}>
                    <div className="space-y-1">
                      <Label htmlFor="forgot-code">Verification code</Label>
                      <Input
                        id="forgot-code"
                        value={forgotPasswordForm.code}
                        onChange={(event) =>
                          setForgotPasswordForm((prev) => ({
                            ...prev,
                            code: event.target.value.replace(/\D/g, "").slice(0, 6),
                          }))
                        }
                        inputMode="numeric"
                        maxLength={6}
                        required
                      />
                    </div>

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
                          className="absolute inset-y-0 right-2 flex items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                          aria-label={resetPasswordVisible ? "Hide password" : "Show password"}
                        >
                          {resetPasswordVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          <span>{resetPasswordVisible ? "Hide" : "Show"}</span>
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
                          className="absolute inset-y-0 right-2 flex items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                          aria-label={resetConfirmVisible ? "Hide password" : "Show password"}
                        >
                          {resetConfirmVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          <span>{resetConfirmVisible ? "Hide" : "Show"}</span>
                        </button>
                      </div>
                    </div>

                    {authError && <p className="text-sm text-destructive">{authError}</p>}
                    {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}

                    <Button type="submit" className="w-full">
                      Verify & set new password
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => {
                          resetFeedback();
                          setForgotStage("request");
                        }}
                      >
                        Back
                      </button>
                    </p>
                  </form>
                )}
              </>
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
                      onClick={() =>
                        setResetPasswordVisible((prev) => !prev)
                      }
                      className="absolute inset-y-0 right-2 flex items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                      aria-label={
                        resetPasswordVisible
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {resetPasswordVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      <span>{resetPasswordVisible ? "Hide" : "Show"}</span>
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
                      onClick={() =>
                        setResetConfirmVisible((prev) => !prev)
                      }
                      className="absolute inset-y-0 right-2 flex items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                      aria-label={
                        resetConfirmVisible
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {resetConfirmVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      <span>{resetConfirmVisible ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                </div>

                {authError && (
                  <p className="text-sm text-destructive">{authError}</p>
                )}
                {authMessage && (
                  <p className="text-sm text-emerald-600">{authMessage}</p>
                )}

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
      <div className="flex w-full flex-col gap-4 px-2 md:flex-row md:gap-0 md:px-0">
        <div className="md:sticky md:top-0 md:w-80 md:flex-shrink-0 md:h-screen">
          <Navigation
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onLogout={handleLogout}
            userName={user?.user_metadata?.full_name}
            userRole={user?.user_metadata?.role}
            userUsername={user?.email?.split("@")[0]}
            unreadNotifications={unreadNotifications}
            newCollections={newCollections}
            realtimeStatus={realtimeStatus}
          />
        </div>

        <main className="flex-1 w-full space-y-6 p-4 pt-6 with-bottom-nav">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};

export default Index;
