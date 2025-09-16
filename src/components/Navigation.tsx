import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Home, 
  Receipt, 
  History, 
  Building2, 
  BarChart3,
  Menu,
  X
} from "lucide-react";

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

export const Navigation = ({ currentPage, onPageChange }: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'collect', label: 'Collect Payment', icon: Receipt },
    { id: 'history', label: 'Payment History', icon: History },
    { id: 'stalls', label: 'Stall Management', icon: Building2 },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <>
      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%]">
        <div className="backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-card/90 border shadow-lg rounded-2xl px-2 py-2">
          <div className="grid grid-cols-5 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onPageChange(item.id)}
                  className={`flex flex-col items-center justify-center py-2 rounded-xl transition-colors ${
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] mt-1 font-medium">{item.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {/* Mobile Menu Button (left) */}
      <div className="md:hidden fixed top-4 left-4 z-40">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="bg-card shadow-lg"
        >
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMenuOpen(false)} />
      )}

      {/* Navigation Sidebar */}
      <Card className={`
        fixed md:relative h-full w-64 bg-card border-r z-40 transition-transform duration-300
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-primary">Dumaguete Public Market</h2>
            <p className="text-sm text-muted-foreground">Stall Rental System</p>
          </div>
          
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={currentPage === item.id ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    onPageChange(item.id);
                    setIsMenuOpen(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </div>
      </Card>
    </>
  );
};