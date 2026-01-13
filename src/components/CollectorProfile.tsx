import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload, History, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface CollectorProfileProps {
  userName: string;
  userUsername: string;
  userRole: string;
  onBack: () => void;
  avatarUrl?: string | null;
  onAvatarChange?: (url: string | null) => void;
}

interface Collection {
  id: number;
  amount: number;
  paid_at: string;
}

export const CollectorProfile = ({
  userName,
  userUsername,
  userRole,
  onBack,
  avatarUrl: avatarUrlProp = null,
  onAvatarChange,
}: CollectorProfileProps) => {
  const { toast } = useToast();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatarUrlProp);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState("");
  const [saveMessage, setSaveMessage] = useState<string>("");

  // Collection History State
  const [showCollections, setShowCollections] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: Date; total: number } | null>(null);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);

  const initials = useMemo(() => {
    if (userName?.trim()) {
      const parts = userName.trim().split(" ");
      const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
      if (letters) return letters;
    }
    return (userUsername?.slice(0, 2) || "SM").toUpperCase();
  }, [userName, userUsername]);

  useEffect(() => {
    setAvatarUrl(avatarUrlProp);
  }, [avatarUrlProp]);

  const handleAvatarClick = () => avatarInputRef.current?.click();
  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);
    onAvatarChange?.(objectUrl);
  };

  const handleSave = () => {
    setSaveMessage("Changes saved locally (connect backend to persist).");
  };

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    if (showCollections && userName) {
      const fetchCollections = async () => {
        setIsLoadingCollections(true);
        const { data, error } = await supabase
          .from("invoices")
          .select("id, amount, paid_at")
          .eq("collector_name", userName)
          .eq("status", "paid");

        if (error) {
          toast({
            title: "Error fetching collections",
            description: error.message,
            variant: "destructive",
          });
          setCollections([]);
        } else {
          setCollections(data || []);
        }
        setIsLoadingCollections(false);
      };
      fetchCollections();
    }
  }, [showCollections, userName, toast]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    collections.forEach(c => {
      if (c.paid_at) {
        const d = new Date(c.paid_at);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const currentTotal = totals.get(dateStr) || 0;
        totals.set(dateStr, currentTotal + c.amount);
      }
    });
    return totals;
  }, [collections]);

  const handleDayClick = (day: number) => {
    const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    const total = dailyTotals.get(dateStr);
    if (total !== undefined) {
      setSelectedDayInfo({ date, total });
      setIsDayDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-xl font-semibold">Collector Profile</h1>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleAvatarClick}
              className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              title="Change profile photo"
            >
              <Avatar className="h-16 w-16 border-2 border-transparent transition group-hover:border-primary">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="Collector profile" /> : <AvatarFallback>{initials}</AvatarFallback>}
              </Avatar>
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-[2px] text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                Edit
              </span>
            </button>
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="text-lg font-semibold">{userName || "Collector"}</p>
              <p className="text-xs text-muted-foreground">
                @{userUsername || "username"} · <span className="capitalize">{userRole || "collector"}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleAvatarClick} className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload photo
            </Button>
            {userRole?.toLowerCase() !== "admin" && (
              <Button variant="outline" size="sm" onClick={() => setShowCollections(true)} className="inline-flex items-center gap-2">
                <History className="h-4 w-4" />
                My Collections
              </Button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Display Name</p>
                <p className="text-sm font-medium">{userName || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium">@{userUsername || "-"}</p>
              </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="text-sm font-medium capitalize">{userRole || "collector"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Profile Notes (local)</p>
            <Textarea
              placeholder="Add notes about this profile (not saved to server)."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Photo selection and notes are kept locally for now. Connect backend to persist.
            </p>
            <div className="flex items-center gap-2">
              {saveMessage && <span className="text-xs text-muted-foreground">{saveMessage}</span>}
              <Button onClick={handleSave} size="sm">
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collection History Dialog */}
      <Dialog open={showCollections} onOpenChange={setShowCollections}>
        <DialogContent className="sm:max-w-lg w-[95vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>My Collection History</DialogTitle>
            <DialogDescription>
              Past collections for {userName}
            </DialogDescription>
          </DialogHeader>

          {isLoadingCollections ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mb-4 border rounded-lg p-3 bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    const d = new Date(calendarDate);
                    d.setFullYear(d.getFullYear() - 1);
                    setCalendarDate(d);
                  }}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    const d = new Date(calendarDate);
                    d.setMonth(d.getMonth() - 1);
                    setCalendarDate(d);
                  }}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="font-semibold text-sm">
                  {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    const d = new Date(calendarDate);
                    d.setMonth(d.getMonth() + 1);
                    setCalendarDate(d);
                  }}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    const d = new Date(calendarDate);
                    d.setFullYear(d.getFullYear() + 1);
                    setCalendarDate(d);
                  }}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
                {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const hasCollection = dailyTotals.has(dateStr);
                  
                  let statusClass = "hover:bg-muted";
                  if (hasCollection) {
                    statusClass = "bg-emerald-100 text-emerald-700 font-bold";
                  }

                  return (
                    <div key={day} onClick={() => handleDayClick(day)} className={`aspect-square flex items-center justify-center rounded-md text-xs cursor-pointer ${statusClass}`}>
                      {day}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 text-[10px] justify-center text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-100 rounded-full"></div> Collection Day</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Day Details Dialog */}
      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent className="sm:max-w-sm w-[90vw] rounded-xl">
            <DialogHeader>
                <DialogTitle>
                  Collection for {selectedDayInfo?.date.toLocaleDateString('default', { month: 'long', day: 'numeric' })}
                </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center text-center py-6 gap-3 bg-card rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Collected</p>
                <p className="text-3xl font-bold text-emerald-600">
                  ₱{selectedDayInfo?.total.toLocaleString()}
                </p>
              </div>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};
