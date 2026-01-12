import { useEffect, useMemo, useState } from "react";
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
import { type StallRecord, updateStall, STALL_TYPES } from "@/data/stalls";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const STALLS_PER_PAGE = 5;
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
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No archived stalls found
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {paginatedStalls.map(stall => (
                <Button
                  key={stall.id}
                  variant={selectedStall?.id === stall.id ? "default" : "outline"}
                  className="h-12 w-12 text-xs"
                  onClick={() => setSelectedStall(stall as ArchivedStallRecord)}
                >
                  {stall.name}
                </Button>
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
                <Button variant="outline" onClick={() => setSelectedStall(null)}>Close</Button>
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
   </div>
  );
};
