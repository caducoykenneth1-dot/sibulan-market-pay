import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Home,
  Receipt,
  History,
  Building2,
  BarChart3,
  Menu,
  X,
  LogOut,
  Archive,
  AlertCircle,
  Users,
  Calendar,
  Bell,
  WifiOff,
  ClipboardList,
  Signal,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface NavigationProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
  onLogout?: () => void;
  userName?: string;
  userRole?: string;
  userUsername?: string;
  unreadNotifications?: number;
  newCollections?: number;
  realtimeStatus?: string;
}

const collectorNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  // { id: "scheduled", label: "Scheduled Collections", icon: Calendar },
  { id: "collect", label: "Collect", icon: Receipt },
  { id: "history", label: "History", icon: History },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "stalls", label: "Stalls", icon: Building2 },
  { id: "unpaid", label: "Unpaid Dues", icon: AlertCircle },
  { id: "archived", label: "Archived", icon: Archive },
];

const adminNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "history", label: "History", icon: History },
  { id: "stalls", label: "Stalls", icon: Building2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "users", label: "User Management", icon: Users },
  { id: "activity", label: "Activity Log", icon: ClipboardList },
  { id: "unpaid", label: "Unpaid Dues", icon: AlertCircle },
  { id: "archived", label: "Archived", icon: Archive },
];

export const Navigation = ({
  currentPage,
  onPageChange,
  onLogout,
  userName,
  userRole,
  userUsername,
  unreadNotifications = 0,
  newCollections = 0,
  realtimeStatus,
}: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        setIsNavVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setIsNavVisible(false);
        setIsMenuOpen(false); // Close sidebar drawer when scrolling down
      } else {
        // Scrolling up
        setIsNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await fetch("https://www.google.com/favicon.ico", { mode: "no-cors", cache: "no-store" });
        return true;
      } catch {
        return false;
      }
    };

    const handleStatusChange = async () => setIsOnline(navigator.onLine && (await checkConnection()));
    
    const interval = setInterval(handleStatusChange, 5000);
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, []);

  const navItems = userRole === "collector" ? collectorNav : adminNav;

  const handleMobileNav = (page: string) => {
    onPageChange?.(page);
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }

    // Sign out from Supabase to invalidate the session on the server.
    await supabase.auth.signOut();

    // Force a hard reload of the page. This is the most reliable way to clear
    // all client-side React state and ensure a completely fresh start for the next login.
    window.location.reload();
  };

  const RealtimeStatusIndicator = ({ status }: { status?: string }) => {
    const indicator = useMemo(() => {
      switch (status) {
        case "SUBSCRIBED":
          return {
            label: "Real-time Sync Active",
            Icon: Signal,
            className: "text-green-500",
          };
        case "TIMED_OUT":
        case "CHANNEL_ERROR":
          return {
            label: "Sync Disconnected",
            Icon: Signal,
            className: "text-red-500",
          };
        case "CLOSED":
          return {
            label: "Sync Closed",
            Icon: Signal,
            className: "text-gray-500",
          };
        default: // CONNECTING
          return {
            label: "Connecting...",
            Icon: Signal,
            className: "text-yellow-500 animate-pulse",
          };
      }
    }, [status]);

    return (
      <div className="flex items-center gap-2" title={indicator.label}>
        <indicator.Icon className={`h-3.5 w-3.5 ${indicator.className}`} />
        <span className="text-xs text-muted-foreground">{indicator.label}</span>
      </div>
    );
  };

  return (
    <>
      {/* Offline Banner for Collectors */}
      {!isOnline && userRole === "collector" && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-white px-4 py-1.5 text-center text-xs font-medium flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top-1">
          <WifiOff className="h-3.5 w-3.5" />
          <span>You are offline. Payments will be saved locally.</span>
        </div>
      )}

      {/* ✅ Mobile Bottom Navigation (Single Row, Icon Beside Text) */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out ${isNavVisible ? "translate-y-0" : "translate-y-[160%]"}`}>
        <div
          id="mobile-bottom-nav-bar"
          className="relative border-t bg-background/80 backdrop-blur-xl shadow-lg"
        >
          {currentPage !== "assistant" && (
            <button
              type="button"
              onClick={() => handleMobileNav("assistant")}
              className="absolute -top-10 right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition hover:bg-primary/90"
              aria-label="Open AI assistant"
            >
              <MessageCircle className="h-7 w-7" />
            </button>
          )}

          <div className="grid grid-cols-5 items-end gap-1 px-2 pb-3 pt-6">
            {(
              userRole === "admin"
                ? [
                    { id: "reports", label: "Reports", icon: BarChart3 },
                    { id: "notifications", label: "Notifications", icon: Bell, badge: unreadNotifications },
                    { id: "dashboard", label: "Home", icon: Home },
                    { id: "stalls", label: "Stalls", icon: Building2 },
                    { id: "archived", label: "Archived", icon: Archive },
                  ]
                : [
                    { id: "dashboard", label: "Dashboard", icon: Home },
                    { id: "notifications", label: "Notifications", icon: Bell, badge: unreadNotifications },
                    { id: "collect", label: "Collect", icon: Receipt },
                    { id: "stalls", label: "Stalls", icon: Building2 },
                    { id: "archived", label: "Archived", icon: Archive },
                  ]
            ).map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              const badgeCount = item.badge || 0;
              const isCenterButton = item.id === "collect" || (userRole === "admin" && item.id === "dashboard");

              if (isCenterButton) {
                return (
                  <div key={item.id} className="relative flex justify-center -mt-8">
                    <button
                      onClick={() => handleMobileNav(item.id)}
                      className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-background shadow-xl transition-all ${
                        active
                          ? "bg-primary text-primary-foreground scale-110"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      <Icon className="h-7 w-7" />
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => handleMobileNav(item.id)}
                  className={`group flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-all relative ${
                    active
                      ? "text-primary-foreground bg-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="relative">
                    <Icon
                      className={`h-5 w-5 transition-transform duration-200 ${
                        active
                          ? ""
                          : "group-hover:scale-110"
                      }`}
                    />
                    {badgeCount > 0 && (
                      <div className={`absolute -top-1.5 -right-1.5 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold ${active ? "bg-background text-primary" : "bg-destructive text-white"}`}>
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </div>
                    )}
                  </div>
                  <span className="truncate max-w-full leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating toggle for slide-in drawer */}
      <div
        className={`md:hidden fixed left-3 z-40 transition-transform duration-300 ${isNavVisible ? "translate-y-0" : "-translate-y-20"}`}
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="bg-card shadow-md h-10 w-10"
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
        >
          {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {isMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ✅ Ultra-Compact Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 transform transition-transform duration-300 ease-in-out md:relative md:h-full md:w-full md:translate-x-0 ${
          isMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex h-full flex-col border-r bg-background md:bg-card/50 md:backdrop-blur-xl">
          {/* ✅ Logo + Header */}
          <div className="shrink-0 px-6 pt-8 pb-6 flex items-center gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shadow-sm ring-1 ring-inset ring-primary/20">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-8 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h2 className="text-lg font-bold tracking-tight text-foreground leading-tight">
                Sibulan Market
              </h2>
              <p className="text-xs font-medium text-muted-foreground">
                Stall System
              </p>
            </div>
          </div>

          {/* ✅ Scrollable Nav Section */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                let badgeCount = 0;
                
                if (item.id === "notifications") {
                  badgeCount = unreadNotifications;
                } else if (item.id === "history") {
                  badgeCount = newCollections;
                }
                
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={`group w-full justify-start items-center gap-3 text-sm font-medium px-3 py-3 h-auto relative transition-all duration-200 rounded-xl ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    onClick={() => {
                      handleMobileNav(item.id);
                    }}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                        isActive ? "" : "group-hover:scale-110"
                      }`}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className={`flex h-5 min-w-[1.25rem] px-1 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ${
                        isActive ? "bg-background text-foreground" : "bg-destructive text-white"
                      }`}>
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* ✅ Fixed Footer / Logout Section */}
          {onLogout && (
            <div className="p-4 border-t bg-muted/20">
              {(userName || userRole || userUsername) && (
                <div className="mb-4 flex items-center gap-3 px-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {userName?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {userName}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize truncate">
                      {userRole}
                    </p>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
              <div className="mt-4 flex justify-center">
                <RealtimeStatusIndicator status={realtimeStatus} />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
