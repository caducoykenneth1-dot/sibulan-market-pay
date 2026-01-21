import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload, History, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, CheckCircle, Save } from "lucide-react";
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
  invoices?: any[];
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
  invoices,
}: CollectorProfileProps) => {
  const { toast } = useToast();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatarUrlProp);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    // When the user identity changes (indicated by a change in userName),
    // reset the component's internal state to prevent showing stale data
    // from a previous user, like a temporary avatar preview.
    setAvatarUrl(avatarUrlProp);
    setAvatarFile(null);
  }, [userName, avatarUrlProp]);

  useEffect(() => {
    // This effect handles the cleanup of temporary blob URLs.
    const isBlob = avatarUrl?.startsWith('blob:');

    // It's important to revoke the object URL when the component unmounts
    // or when the avatarUrl is no longer a blob URL to prevent memory leaks.
    return () => {
      if (isBlob) {
        URL.revokeObjectURL(avatarUrl);
      }
    };
  }, [avatarUrl]);

  const handleAvatarClick = () => avatarInputRef.current?.click();

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Set the file for upload
    setAvatarFile(file);

    // Create a temporary URL for preview
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);
  };

  const handleSave = async () => {
    if (!avatarFile) {
      toast({
        title: "No Changes",
        description: "No new profile picture was selected.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to update your profile picture.");
      }

      const fileExt = avatarFile.name.split('.').pop();
      // ✅ Store avatar in a folder named after the user's ID for true uniqueness.
      const fileName = `avatar.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      // Upload the file to Supabase Storage, overwriting if it exists
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get the public URL of the uploaded file, adding a timestamp to bypass cache
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;

      // Update the user's metadata
      const { error: userError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (userError) throw userError;

      setAvatarFile(null);
      onAvatarChange?.(publicUrl);

      toast({
        title: "Profile Updated",
        description: "Your profile picture has been saved.",
      });

    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Could not save the profile picture.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (showCollections && userName) {
      if (invoices) {
        // Optimize: Use passed invoices
        setIsLoadingCollections(true);
        const myCollections = invoices.filter(inv => 
          inv.collector_name === userName && inv.status === "paid"
        );
        setCollections(myCollections);
        setIsLoadingCollections(false);
      } else {
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
    }
  }, [showCollections, userName, toast, invoices]);

  const dailyStats = useMemo(() => {
    const stats = new Map<string, { total: number; count: number }>();
    collections.forEach(c => {
      if (c.paid_at) {
        const d = new Date(c.paid_at);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const current = stats.get(dateStr) || { total: 0, count: 0 };
        stats.set(dateStr, { total: current.total + c.amount, count: current.count + 1 });
      }
    });
    return stats;
  }, [collections]);

  const monthlyTotal = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    let total = 0;
    
    collections.forEach(c => {
      if (c.paid_at) {
        const d = new Date(c.paid_at);
        if (d.getFullYear() === year && d.getMonth() === month) {
          total += c.amount;
        }
      }
    });
    return total;
  }, [collections, calendarDate]);

  const handleDayClick = (day: number) => {
    const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    const stat = dailyStats.get(dateStr);
    if (stat !== undefined) {
      setSelectedDayInfo({ date, total: stat.total });
      setIsDayDialogOpen(true);
    }
  };

  // Convert stats map to array for table display, sorted by date descending
  const sortedHistory = useMemo(() => {
    return Array.from(dailyStats.entries())
      .map(([date, stat]) => ({ date, ...stat }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dailyStats]);

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
              {/* The AvatarImage component uses `object-fit: cover` by default,
                  which ensures the image fills the space without distortion,
                  addressing the "accurate size" requirement. */}
              <Avatar key={avatarUrl} className="h-16 w-16 border-2 border-transparent transition group-hover:border-primary">
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
            accept="image/png, image/jpeg, image/gif"
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
          <div className="flex items-center justify-end">
            <Button onClick={handleSave} size="sm" disabled={isSaving || !avatarFile}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? "Saving..." : "Save Picture"}
            </Button>
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
            <div className="space-y-4">
            <div className="border rounded-lg p-3 bg-card">
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
                  <div className="text-center">
                    <div>{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
                    <div className="text-xs text-emerald-600 font-normal">Total: ₱{monthlyTotal.toLocaleString()}</div>
                  </div>
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
                  const hasCollection = dailyStats.has(dateStr);
                  
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

            {/* List View for Reconciliation */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground border-b flex justify-between">
                <span>Date</span>
                <div className="flex gap-8">
                  <span>Count</span>
                  <span className="w-20 text-right">Total</span>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {sortedHistory.map((item) => (
                  <div key={item.date} className="px-4 py-2 text-sm border-b last:border-0 flex justify-between items-center hover:bg-muted/20">
                    <span className="font-medium">{new Date(item.date).toLocaleDateString()}</span>
                    <div className="flex gap-8">
                      <span className="text-muted-foreground w-8 text-center">{item.count}</span>
                      <span className="w-20 text-right font-semibold text-emerald-600">
                        ₱{item.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
