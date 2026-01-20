import { useEffect, useMemo, useState, useCallback, type TouchEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ArchiveRestore,
  Building2,
  User,
  Phone,
  Info,
  Layers,
  Droplets,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  Filter,
  Search,
  Archive,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type StallRecord, updateStall, deleteStall, STALL_TYPES } from "@/data/stalls";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sectionMap = new Map(STALL_TYPES.map(t => [t.name, t.section]));


interface ArchivedStallRecord extends StallRecord {
  section: "Dry Section" | "Wet Section" | "N/A";
}

interface PendingArchiveRequest {
  id: number;
  stall_id: number;
  stall_name: string;
  vendor_name: string;
  reason: string;
  requested_by_id: string;
  requested_by_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface ArchivedStallsProps {
  onDataChange: () => void;
  allStalls: StallRecord[];
  userRole: string;
  userName: string;
  userId: string;
}

export const ArchivedStalls = ({ onDataChange, allStalls, userRole, userName, userId }: ArchivedStallsProps) => {
  const { toast } = useToast();

  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showStalls, setShowStalls] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedStall, setSelectedStall] = useState<ArchivedStallRecord | null>(null);
  const [stallToRestore, setStallToRestore] = useState<StallRecord | null>(null);
  const [stallToDelete, setStallToDelete] = useState<StallRecord | null>(null);
  const [activeTypeIndex, setActiveTypeIndex] = useState(0);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const [pendingArchives, setPendingArchives] = useState<PendingArchiveRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [requestToProcess, setRequestToProcess] = useState<{ request: PendingArchiveRequest, action: 'approve' | 'reject' } | null>(null);

  const stallTypeOptions = useMemo(() => {
    return [
      ...new Set(
        STALL_TYPES
          .filter(t => sectionFilter === "all" || t.section === sectionFilter)
          .map(t => t.name)
      ),
    ].sort();
  }, [sectionFilter]);

  const fetchPendingArchives = useCallback(async () => {
    if (userRole?.toLowerCase() !== 'admin') return;
    setLoadingPending(true);
    const { data, error } = await supabase
      .from('pending_archives')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    
    if (error) {
      // Suppress 404/missing table errors to avoid spamming the user if migration isn't run yet
      if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
        console.warn("Pending archives table not found. Please run the migration script.");
      } else {
        toast({ title: "Error", description: "Could not fetch pending archive requests.", variant: "destructive" });
      }
    } else {
      setPendingArchives(data || []);
    }
    setLoadingPending(false);
  }, [userRole, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (userRole?.toLowerCase() === 'admin') {
      fetchPendingArchives();

      const channel = supabase
        .channel('pending_archives_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pending_archives' },
          (payload) => {
            console.log('Realtime change received:', payload);
            if (payload.eventType === 'INSERT') {
              const newRecord = payload.new as PendingArchiveRequest;
              // Add only if it's pending and not already in the list
              if (newRecord.status === 'pending') {
                setPendingArchives(prev => prev.find(p => p.id === newRecord.id) ? prev : [...prev, newRecord].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                toast({
                  title: "New Archive Request",
                  description: `${newRecord.requested_by_name} requested to archive ${newRecord.stall_name}.`
                });
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRecord = payload.new as PendingArchiveRequest;
              // If an item is approved/rejected, its status changes, so we remove it from the pending list.
              if (updatedRecord.status !== 'pending') {
                setPendingArchives(prev => prev.filter(p => p.id !== updatedRecord.id));
              }
            } else if (payload.eventType === 'DELETE') {
              setPendingArchives(prev => prev.filter(p => p.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userRole, fetchPendingArchives]);

  const filteredStalls = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    
    return allStalls.filter(stall => {
      if (stall.status !== 'archived') return false;

      const matchesSection = sectionFilter === 'all' || stall.section === sectionFilter;
      const matchesType = typeFilter === 'all' || stall.type === typeFilter;
      const matchesSearch = !normalizedSearch || 
        stall.vendor.toLowerCase().includes(normalizedSearch) ||
        stall.name.toLowerCase().includes(normalizedSearch) ||
        String(stall.dbId).includes(normalizedSearch);

      return matchesSection && matchesType && matchesSearch;
    });
  }, [allStalls, sectionFilter, typeFilter, debouncedSearch]);

  const groupedStalls = useMemo(() => {
    const groups = filteredStalls.reduce((acc, stall) => {
      const type = stall.type || "Uncategorized";
      if (!acc[type]) acc[type] = [];
      acc[type].push(stall);
      return acc;
    }, {} as Record<string, typeof filteredStalls>);

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, "") || "0", 10);
        const numB = parseInt(b.name.replace(/\D/g, "") || "0", 10);
        return numA - numB;
      });
    });

    return groups;
  }, [filteredStalls]);

  const sortedTypes = useMemo(() => Object.keys(groupedStalls).sort((a, b) => a.localeCompare(b)), [groupedStalls]);

  useEffect(() => {
    setTypeFilter("all");
  }, [sectionFilter]);

  const handleRestore = async () => {
    if (!stallToRestore) return;

    try {
      await updateStall(stallToRestore.dbId, {
        status: "vacant",
        archive_reason: null,
        occupied: false,
        vendor: "",
        contact: "",
        last_payment: null,
        next_due: null,
      });

      toast({ title: "Stall Restored", description: "Stall moved to active list." });
      onDataChange();
      setStallToRestore(null);
      setSelectedStall(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!stallToDelete) return;

    try {
      await deleteStall(stallToDelete.dbId);
      toast({ title: "Stall Deleted", description: "Stall permanently removed." });
      onDataChange();
      setStallToDelete(null);
      setSelectedStall(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleProcessRequest = async () => {
    if (!requestToProcess) return;

    const { request, action } = requestToProcess;

    try {
        if (action === 'approve') {
            // 1. Archive the actual stall
            await updateStall(request.stall_id, {
                status: "archived",
                archive_reason: `(Approved) ${request.reason}`,
                occupied: false,
            });

            // 2. Update the pending request status
            await supabase.from('pending_archives').update({
                status: 'approved',
                reviewed_at: new Date().toISOString(),
                reviewed_by: userName,
            }).eq('id', request.id);

            // 3. Log admin activity
            await supabase.from("activity_logs").insert({
                user_id: userId,
                user_name: userName,
                action: "APPROVE_ARCHIVE",
                details: `Approved archive request for ${request.stall_name}. Reason: ${request.reason}`
            });

            // 4. Notify the original collector
            await supabase.from("notifications").insert({
              user_id: request.requested_by_id,
              message: `Your request to archive stall "${request.stall_name}" has been approved.`,
              type: "archive_status",
            });

            toast({ title: "Request Approved", description: `${request.stall_name} has been archived.` });
        } else { // 'reject'
            // 1. Update the pending request status
            await supabase.from('pending_archives').update({
                status: 'rejected',
                reviewed_at: new Date().toISOString(),
                reviewed_by: userName,
            }).eq('id', request.id);

            // 2. Log admin activity
            await supabase.from("activity_logs").insert({
                user_id: userId,
                user_name: userName,
                action: "REJECT_ARCHIVE",
                details: `Rejected archive request for ${request.stall_name}.`
            });

            // 3. Notify the original collector
            await supabase.from("notifications").insert({
              user_id: request.requested_by_id,
              message: `Your request to archive stall "${request.stall_name}" was rejected.`,
              type: "archive_status",
            });

            toast({ title: "Request Rejected", variant: "destructive" });
        }

        setPendingArchives(prev => prev.filter(p => p.id !== request.id));
        onDataChange();
        setRequestToProcess(null);
    } catch (err: any) {
        toast({ title: "Error Processing Request", description: err.message, variant: "destructive" });
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      if (activeTypeIndex < sortedTypes.length - 1) {
        setActiveTypeIndex((prev) => prev + 1);
      }
    }
    else if (isRightSwipe) {
      if (activeTypeIndex > 0) {
        setActiveTypeIndex((prev) => prev - 1);
      }
    }
  };

  if (userRole?.toLowerCase() === 'admin') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Archives</h1>
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">
              Pending Requests
              {pendingArchives.length > 0 && <Badge className="ml-2">{pendingArchives.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="archived">Archived Stalls</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Pending Archive Requests</CardTitle>
                  <CardDescription>Review requests from collectors to archive stalls.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchPendingArchives} disabled={loadingPending}>
                  <RefreshCw className={`h-4 w-4 ${loadingPending ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPending ? <Loader2 className="animate-spin" /> :
                  pendingArchives.length === 0 ? <p className="text-muted-foreground text-sm">No pending requests.</p> :
                  pendingArchives.map(req => (
                    <Card key={req.id} className="bg-muted/30">
                      <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="flex-1">
                          <p className="font-bold">{req.stall_name} <span className="font-normal text-muted-foreground">({req.vendor_name})</span></p>
                          <p className="text-sm italic text-muted-foreground mt-1">"{req.reason}"</p>
                          <p className="text-xs text-muted-foreground mt-2">Requested by {req.requested_by_name} on {new Date(req.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="destructive" onClick={() => setRequestToProcess({ request: req, action: 'reject' })}>Reject</Button>
                          <Button size="sm" onClick={() => setRequestToProcess({ request: req, action: 'approve' })}>Approve</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                }
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="archived" className="mt-6">
            {/* This content is now inside the tab for admins */}
            <div className="space-y-6">
              {/* The rest of the original component's JSX will be placed here, starting from the section filter card */}
      {/* SECTION FILTER */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Section</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {["all", "Dry Section", "Wet Section"].map(sec => (
           <Button
              key={sec}
              variant={sectionFilter === sec ? "default" : "outline"}
              onClick={() => setSectionFilter(sec)}
            >
              {sec === "all" ? "All" : sec.replace(" Section", "")}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
       <h2 className="text-xl font-semibold">
          {typeFilter === "all" ? (sectionFilter === "all" ? "All Archived Stalls" : sectionFilter) : typeFilter}
        </h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {stallTypeOptions.length > 0 && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2 shrink-0">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter Types</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filter by Stall Type</SheetTitle>
                  <SheetDescription>
                    Select a stall type to filter the list.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-2 py-4">
                  <Button
                    variant={typeFilter === "all" ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => {
                      setTypeFilter("all");
                      setShowStalls(true);
                    }}
                  >
                    All Types
                  </Button>
                  {stallTypeOptions.map((type) => (
                    <Button
                      key={type}
                      variant={typeFilter === type ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => {
                        setTypeFilter(type);
                        setShowStalls(true);
                      }}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveTypeIndex(0);
              }}
              placeholder="Search vendor or ID..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* STALL GRID */}
      {showStalls && (
        <>
          {filteredStalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border-2 border-dashed rounded-xl bg-muted/30 animate-in fade-in zoom-in-95 duration-500">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Archive className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">No archived stalls found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Archived stalls will appear here. They are hidden from the main dashboard but can be restored at any time.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTypes.length > 0 && (
                <div className="flex items-center justify-between border-b pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={activeTypeIndex === 0}
                    onClick={() => setActiveTypeIndex((prev) => Math.max(0, prev - 1))}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>

                  <div className="text-center">
                    <h3 className="font-semibold text-lg text-primary/80 flex items-center justify-center gap-2">
                      {sortedTypes[activeTypeIndex]}
                      <Badge variant="secondary" className="text-xs font-normal">
                        {groupedStalls[sortedTypes[activeTypeIndex]]?.length || 0}
                      </Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activeTypeIndex + 1} of {sortedTypes.length} types
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={activeTypeIndex === sortedTypes.length - 1}
                    onClick={() => setActiveTypeIndex((prev) => Math.min(sortedTypes.length - 1, prev + 1))}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              )}

              <div 
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-right-4 duration-300"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                key={sortedTypes[activeTypeIndex]}
              >
                {groupedStalls[sortedTypes[activeTypeIndex]]?.map((stall, i) => (
                  <Card 
                    key={stall.id}
                    className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden ${selectedStall?.id === stall.id ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/50"}`}
                    onClick={() => setSelectedStall(stall as ArchivedStallRecord)}
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors duration-300 ${selectedStall?.id === stall.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}>
                        <Building2 className="h-6 w-6" />
                      </div>
                      
                      <div className="space-y-1 w-full">
                        <h3 className="font-bold text-sm truncate">{stall.name}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                          {stall.type}
                        </Badge>
                      </div>

                      <div className="w-full pt-3 border-t mt-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Last Vendor</p>
                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium truncate text-foreground/80">
                          <User className="h-3 w-3" />
                          <span className="truncate">{stall.vendor || "Unknown"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

            </div>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!requestToProcess} onOpenChange={(open) => !open && setRequestToProcess(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm {requestToProcess?.action === 'approve' ? 'Approval' : 'Rejection'}</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to {requestToProcess?.action} this archive request for <strong>{requestToProcess?.request.stall_name}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleProcessRequest} className={requestToProcess?.action === 'reject' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
                Confirm {requestToProcess?.action === 'approve' ? 'Approval' : 'Rejection'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!selectedStall} onOpenChange={(open) => !open && setSelectedStall(null)}>
          <DialogContent>
            {selectedStall && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {selectedStall.name}
                  </h2>
                  <Badge variant="secondary">Archived</Badge>
                </div>
                
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Previous Vendor:</span>
                    <span>{selectedStall.vendor || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Contact:</span>
                    <span>{selectedStall.contact || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Archive Reason:</span>
                  </div>
                  <div className="p-2 bg-muted rounded-md text-sm italic">
                    {(selectedStall as any).archive_reason || "No reason provided."}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  {userRole?.toLowerCase() === "admin" && (
                    <Button variant="destructive" onClick={() => setStallToDelete(selectedStall)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Permanently
                    </Button>
                  )}
                  {userRole?.toLowerCase() === "admin" && (
                    <Button onClick={() => setStallToRestore(selectedStall)}>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Restore Stall
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!stallToRestore} onOpenChange={(open) => !open && setStallToRestore(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore Stall?</AlertDialogTitle>
              <AlertDialogDescription>
                This will move <strong>{stallToRestore?.name}</strong> back to the active list as a vacant stall.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRestore}>Confirm Restore</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!stallToDelete} onOpenChange={(open) => !open && setStallToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Stall Permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently remove <strong>{stallToDelete?.name}</strong> from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
   <div className="space-y-6">
      <h1 className="text-3xl font-bold">Archived Stalls</h1>

      {/* SECTION FILTER */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Section</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {["all", "Dry Section", "Wet Section"].map(sec => (
           <Button
              key={sec}
              variant={sectionFilter === sec ? "default" : "outline"}
              onClick={() => setSectionFilter(sec)}
            >
              {sec === "all" ? "All" : sec.replace(" Section", "")}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
       <h2 className="text-xl font-semibold">
          {typeFilter === "all" ? (sectionFilter === "all" ? "All Archived Stalls" : sectionFilter) : typeFilter}
        </h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {stallTypeOptions.length > 0 && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2 shrink-0">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter Types</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filter by Stall Type</SheetTitle>
                  <SheetDescription>
                    Select a stall type to filter the list.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-2 py-4">
                  <Button
                    variant={typeFilter === "all" ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => {
                      setTypeFilter("all");
                      setShowStalls(true);
                    }}
                  >
                    All Types
                  </Button>
                  {stallTypeOptions.map((type) => (
                    <Button
                      key={type}
                      variant={typeFilter === type ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => {
                        setTypeFilter(type);
                        setShowStalls(true);
                      }}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveTypeIndex(0);
              }}
              placeholder="Search vendor or ID..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* STALL GRID */}
      {showStalls && (
        <>
          {filteredStalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border-2 border-dashed rounded-xl bg-muted/30 animate-in fade-in zoom-in-95 duration-500">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Archive className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">No archived stalls found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Archived stalls will appear here. They are hidden from the main dashboard but can be restored at any time.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTypes.length > 0 && (
                <div className="flex items-center justify-between border-b pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={activeTypeIndex === 0}
                    onClick={() => setActiveTypeIndex((prev) => Math.max(0, prev - 1))}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>

                  <div className="text-center">
                    <h3 className="font-semibold text-lg text-primary/80 flex items-center justify-center gap-2">
                      {sortedTypes[activeTypeIndex]}
                      <Badge variant="secondary" className="text-xs font-normal">
                        {groupedStalls[sortedTypes[activeTypeIndex]]?.length || 0}
                      </Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activeTypeIndex + 1} of {sortedTypes.length} types
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={activeTypeIndex === sortedTypes.length - 1}
                    onClick={() => setActiveTypeIndex((prev) => Math.min(sortedTypes.length - 1, prev + 1))}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              )}

              <div 
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-right-4 duration-300"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                key={sortedTypes[activeTypeIndex]}
              >
                {groupedStalls[sortedTypes[activeTypeIndex]]?.map((stall, i) => (
                  <Card 
                    key={stall.id}
                    className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden ${selectedStall?.id === stall.id ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/50"}`}
                    onClick={() => setSelectedStall(stall as ArchivedStallRecord)}
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors duration-300 ${selectedStall?.id === stall.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}>
                        <Building2 className="h-6 w-6" />
                      </div>
                      
                      <div className="space-y-1 w-full">
                        <h3 className="font-bold text-sm truncate">{stall.name}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                          {stall.type}
                        </Badge>
                      </div>

                      <div className="w-full pt-3 border-t mt-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Last Vendor</p>
                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium truncate text-foreground/80">
                          <User className="h-3 w-3" />
                          <span className="truncate">{stall.vendor || "Unknown"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <Dialog open={!!selectedStall} onOpenChange={(open) => !open && setSelectedStall(null)}>
        <DialogContent>
          {selectedStall && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedStall.name}
                </h2>
                <Badge variant="secondary">Archived</Badge>
              </div>
              
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Previous Vendor:</span>
                  <span>{selectedStall.vendor || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Contact:</span>
                  <span>{selectedStall.contact || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Archive Reason:</span>
                </div>
                <div className="p-2 bg-muted rounded-md text-sm italic">
                  {(selectedStall as any).archive_reason || "No reason provided."}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                {userRole?.toLowerCase() === "admin" && (
                  <Button variant="destructive" onClick={() => setStallToDelete(selectedStall)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Permanently
                  </Button>
                )}
                {userRole?.toLowerCase() === "admin" && (
                  <Button onClick={() => setStallToRestore(selectedStall)}>
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    Restore Stall
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!stallToRestore} onOpenChange={(open) => !open && setStallToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Stall?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move <strong>{stallToRestore?.name}</strong> back to the active list as a vacant stall.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Confirm Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!stallToDelete} onOpenChange={(open) => !open && setStallToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stall Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove <strong>{stallToDelete?.name}</strong> from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
   </div>
  );
};
