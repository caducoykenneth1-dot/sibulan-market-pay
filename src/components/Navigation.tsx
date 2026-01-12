import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";

interface NavigationProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
  onLogout?: () => void;
  userName?: string;
  userRole?: string;
  userUsername?: string;
  unreadNotifications?: number;
  newCollections?: number;
}

const collectorNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  // { id: "scheduled", label: "Scheduled Collections", icon: Calendar },
  { id: "collect", label: "Collect", icon: Receipt },
  { id: "history", label: "History", icon: History },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "stalls", label: "Stalls", icon: Building2 },
  { id: "unpaid", label: "Unpaid", icon: AlertCircle },
  { id: "archived", label: "Archived", icon: Archive },
];

const adminNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "history", label: "History", icon: History },
  { id: "stalls", label: "Stalls", icon: Building2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "users", label: "User Management", icon: Users },
 // { id: "unpaid", label: "Unpaid", icon: AlertCircle },
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
}: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
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

  const navItems = userRole === "collector" ? collectorNav : adminNav;

  const handleMobileNav = (page: string) => {
    onPageChange?.(page);
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    onLogout?.();
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* ✅ Mobile Bottom Navigation (Single Row, Icon Beside Text) */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg transition-transform duration-300 ${isNavVisible ? "translate-y-0" : "translate-y-full"}`}>
        <div className="grid grid-cols-5 items-center gap-2 px-2 py-2">
          {[
            { id: "dashboard", label: "Dashboard", icon: Home },
            { id: "notifications", label: "Notifications", icon: Bell, badge: unreadNotifications },
            { id: "stalls", label: "Stalls", icon: Building2 },
            { id: "collect", label: "Collect", icon: Receipt },
            { id: "archived", label: "Archived", icon: Archive },
          ].map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            const badgeCount = item.badge || 0;
            return (
              <button
                key={item.id}
                onClick={() => handleMobileNav(item.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-all relative ${
                  active
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`h-5 w-5 transition-transform duration-200 ${
                      active
                        ? "scale-110"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  {badgeCount > 0 && (
                    <div className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
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
          className="md:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ✅ Ultra-Compact Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-56 sm:w-60 md:w-80 transform transition-transform duration-300 md:relative md:h-full md:translate-x-0 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex h-full flex-col border-r bg-card shadow-xl md:shadow-none rounded-r-2xl md:rounded-none">
          {/* ✅ Logo + Header */}
          <div className="shrink-0 mb-6 px-4 pt-6 text-center">
            <img
              src="/logo.png"
              alt="Sibulan Market Pay Logo"
              className="mx-auto mb-2 h-16 w-16 rounded-lg"
            />
            <h2 className="text-xl font-bold text-primary">
              Sibulan Market
            </h2>
            <p className="text-sm text-muted-foreground">
              Stall System
            </p>
          </div>

          {/* ✅ Scrollable Nav Section */}
          <div className="flex-1 overflow-y-auto px-2 pb-24 md:pb-4">
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
                    variant={isActive ? "default" : "ghost"}
                    className={`group w-full justify-start items-center gap-2.5 text-sm px-3 py-2 h-auto relative ${
                      isActive
                        ? "font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      handleMobileNav(item.id);
                    }}
                  >
                    <div className="relative">
                      <Icon
                        className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${
                          isActive
                            ? ""
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      />
                      {badgeCount > 0 && (
                        <div className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </div>
                      )}
                    </div>
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* ✅ Fixed Footer / Logout Section */}
          {onLogout && (
            <div className="sticky bottom-0 left-0 mt-auto w-full border-t bg-card/95 p-4 text-xs text-muted-foreground backdrop-blur-sm">
              {(userName || userRole || userUsername) && (
                <div className="mb-3 space-y-1 text-left">
                  {userName && (
                    <p className="text-sm font-semibold text-foreground">
                      {userName}
                    </p>
                  )}
                  {userUsername && (
                    <p className="truncate text-xs">Username: {userUsername}</p>
                  )}
                  {userRole && (
                    <p className="capitalize text-xs">Role: {userRole}</p>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
