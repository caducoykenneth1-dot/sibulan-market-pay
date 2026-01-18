import { useEffect, useMemo, useState, type TouchEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const STALLS_PER_PAGE = 6;
const sectionMap = new Map(STALL_TYPES.map(t => [t.name, t.section]));


interface ArchivedStallRecord extends StallRecord {
  section: "Dry Section" | "Wet Section" | "N/A";
}

interface ArchivedStallsProps {
  onDataChange: () => void;
  allStalls: StallRecord[];
}

export const ArchivedStalls = ({ onDataChange, allStalls }: ArchivedStallsProps) => {
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);

  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showStalls, setShowStalls] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedStall, setSelectedStall] = useState<ArchivedStallRecord | null>(null);
  const [stallToRestore, setStallToRestore] = useState<StallRecord | null>(null);
  const [stallToDelete, setStallToDelete] = useState<StallRecord | null>(null);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const stallTypeOptions = useMemo(() => {
    return [
      ...new Set(
        STALL_TYPES
          .filter(t => sectionFilter === "all" || t.section === sectionFilter)
          .map(t => t.name)
      ),
    ].sort();
  }, [sectionFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  const totalStalls = filteredStalls.length;
  const totalPages = Math.ceil(totalStalls / STALLS_PER_PAGE);

  const paginatedStalls = useMemo(() => {
    const from = (currentPage - 1) * STALLS_PER_PAGE;
    return filteredStalls.slice(from, from + STALLS_PER_PAGE);
  }, [filteredStalls, currentPage]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
  }, [sectionFilter, typeFilter, debouncedSearch]);

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

    if (isLeftSwipe && currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
    }
    if (isRightSwipe && currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  };

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
                setCurrentPage(1);
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
          {paginatedStalls.length === 0 ? (
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
            <div 
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {paginatedStalls.map((stall, i) => (
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
          )}
        </>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
       <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
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
                <Button variant="destructive" onClick={() => setStallToDelete(selectedStall)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </Button>
                <Button onClick={() => setStallToRestore(selectedStall)}>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Restore Stall
                </Button>
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
