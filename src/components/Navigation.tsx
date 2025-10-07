import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Home,
  CalendarDays,
  Receipt,
  History,
  Building2,
  BarChart3,
  Menu,
  X,
  LogOut,
  AlertCircle,
} from "lucide-react";

interface NavigationProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
  onLogout?: () => void;
  userName?: string;
  userRole?: string;
  userUsername?: string;
}

export const Navigation = ({
  currentPage,
  onPageChange,
  onLogout,
  userName,
  userRole,
  userUsername
}: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

 // 🟢 Add these before where navItems is defined:
const collectorNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  // { id: "scheduled", label: "Scheduled", icon: CalendarDays },
  { id: "collect", label: "Collect Payment", icon: Receipt },
  { id: "history", label: "Payment History", icon: History },
  { id: "unpaid", label: "Unpaid Dues", icon: AlertCircle },
];

const adminNav = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  // { id: "scheduled", label: "Scheduled", icon: CalendarDays },
  // { id: "collect", label: "Collect Payment", icon: Receipt },
  { id: "history", label: "Payment History", icon: History },
  { id: "stalls", label: "Stall Management", icon: Building2 },
  { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
  { id: "unpaid", label: "Unpaid Dues", icon: AlertCircle },
];

// 🟢 Replace your existing navItems array with this single line:
const navItems = userRole === "collector" ? collectorNav : adminNav;


  const handleMobileNav = (page: string) => {
    if (onPageChange) {
      onPageChange(page);
    }
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* 📱 Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-4 left-1/2 z-50 w-[92%] -translate-x-1/2">
        <div className="rounded-2xl border bg-card/90 px-2 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="grid grid-cols-6 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleMobileNav(item.id)}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 text-[11px] font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="mt-1">{item.label.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          )}
        </div>
      </div>

      {/* 📱 Mobile Menu Toggle */}
      <div className="md:hidden fixed top-4 left-4 z-40">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="bg-card shadow-lg"
        >
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {isMenuOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsMenuOpen(false)} />}

      {/* 🖥️ Sidebar for Desktop */}
      <Card
        className={`fixed z-40 h-full w-64 border-r bg-card transition-transform duration-300 md:relative ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col p-6">
          <div className="mb-8 text-center">
            <img src="/logo.png" alt="Sibulan Market Pay Logo" className="mx-auto mb-4 h-16 w-16 rounded-lg" />
            <h2 className="text-xl font-bold text-primary">Sibulan Public Market</h2>
            <p className="text-sm text-muted-foreground">Stall Rental System</p>
          </div>

          {/* 🔹 Main Navigation */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    if (onPageChange) {
                      onPageChange(item.id);
                      setIsMenuOpen(false);
                    }
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          {/* 👤 User Info + Logout */}
          {onLogout && (
            <div className="mt-8 space-y-3 border-t pt-4 text-xs text-muted-foreground">
              {(userName || userRole || userUsername) && (
                <div>
                  {userName && <p className="text-sm font-semibold text-foreground">{userName}</p>}
                  {userUsername && <p className="truncate">Username: {userUsername}</p>}
                  {userRole && <p className="capitalize">Role: {userRole}</p>}
                </div>
              )}
              <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
};
