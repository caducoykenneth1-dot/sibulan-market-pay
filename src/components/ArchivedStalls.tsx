import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ Added useMemo
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button"; // ✅ Added Chevron icons
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ArchiveRestore, Building2, User, Phone, Info, Layers, Droplets, ChevronLeft, ChevronRight, Search, Filter, LayoutGrid, Calendar, DollarSign
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
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
 
// ✅ Pagination constants and state
const STALLS_PER_PAGE = 5;

// ✅ Create a lookup map for stall sections
const sectionMap = new Map(STALL_TYPES.map(type => [type.name, type.section]));

interface ArchivedStallRecord extends StallRecord {
  section: 'Dry Section' | 'Wet Section' | 'N/A';
}

interface ArchivedStallsProps {
  onDataChange: () => void;
  allStalls: StallRecord[]; // ✅ Accept all stalls to derive correct names
}

export const ArchivedStalls = ({ onDataChange, allStalls }: ArchivedStallsProps) => {
  const { toast } = useToast();
  const [archivedStalls, setArchivedStalls] = useState<ArchivedStallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalStalls, setTotalStalls] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stallToRestore, setStallToRestore] = useState<StallRecord | null>(null);
  const [selectedStall, setSelectedStall] = useState<ArchivedStallRecord | null>(null);

  // ✅ Create a lookup map for original stall names from the full list
  const nameMap = useMemo(() => new Map(allStalls.map(s => [s.dbId, s.name])), [allStalls]);

  const totalPages = Math.ceil(totalStalls / STALLS_PER_PAGE);

  // ✅ Create a sorted list of unique stall types for the filter dropdown
  const stallTypeOptions = useMemo(() => {
    const types = STALL_TYPES.filter(t => sectionFilter === 'all' || t.section === sectionFilter).map(t => t.name);
    return [...new Set(types)].sort();
  }, [sectionFilter]);


  const fetchArchivedStalls = async (page: number) => {
    // Don't set loading to true if it's just a search/filter change on the first page
    if (page === currentPage) {
      setLoading(true);
    }

    const from = (page - 1) * STALLS_PER_PAGE;
    const to = from + STALLS_PER_PAGE - 1;

    let query = supabase
      .from("vendors")
      .select("id, vendor, contact, type, monthly_rent, last_payment, next_due, status, rental_type, archive_reason", {
        count: "exact", // ✅ Fetch total count efficiently
      })
      .eq("status", "archived")
      .order("id", { ascending: true });

    // Apply search filter
    if (searchTerm) {
      query = query.ilike("vendor", `%${searchTerm}%`);
    }

    // Apply section filter
    if (sectionFilter !== "all") {
      const typesInSection = STALL_TYPES.filter(t => t.section === sectionFilter).map(t => t.name);
      if (typesInSection.length > 0) {
        query = query.in("type", typesInSection);
      }
    }

    // Apply type filter
    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Could not fetch archived stalls. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error fetching archived stalls",
          description: error.message,
          variant: "destructive",
        });
      }
      setArchivedStalls([]);
      setTotalStalls(0);
    } else {
      const mapped: ArchivedStallRecord[] = (data || []).map(row => ({
        id: `stall-${row.id}`,
        dbId: row.id,
        name: nameMap.get(row.id) ?? `Stall ${row.id}`, // ✅ Use original name from map
        vendor: row.vendor ?? "",
        contact: row.contact ?? "",
        type: row.type ?? "N/A",
        rentAmount: row.monthly_rent ?? 0,
        rentalType: row.rental_type ?? 'monthly',
        lastPayment: row.last_payment ?? "",
        nextDue: row.next_due ?? "",
        status: 'archived',
        occupied: false,
        archive_reason: row.archive_reason ?? "No reason provided.", // ✅ Map the reason
        section: sectionMap.get(row.type ?? '') ?? 'N/A', // ✅ Add section
      }));
      setArchivedStalls(mapped);
      setTotalStalls(count ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchArchivedStalls(currentPage);
  }, [currentPage, nameMap]); // nameMap dependency ensures fetch runs after names are ready

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
    else fetchArchivedStalls(1); // fetch on page 1 if already there
  }, [searchTerm, sectionFilter, typeFilter]);

  // Reset type filter when section changes
  useEffect(() => {
    setTypeFilter("all");
  }, [sectionFilter]);

  const groupedArchived = useMemo(() => {
    return archivedStalls.reduce<Record<string, ArchivedStallRecord[]>>((acc, stall) => {
      const section = stall.section || "N/A";
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(stall);
      return acc;
    }, {});
  }, [archivedStalls]);

  useEffect(() => {
    if (selectedStall && !archivedStalls.find(s => s.dbId === selectedStall.dbId)) {
      setSelectedStall(null);
    }
  }, [archivedStalls, selectedStall]);


  const handleRestore = async () => {
    if (!stallToRestore) return;

    // 1. Cache the current state for potential rollback
    const originalStalls = [...archivedStalls];
    const originalTotal = totalStalls;
    const stallToRestoreCopy = { ...stallToRestore };
  
    // 2. Optimistically update the UI
    setArchivedStalls(prev => prev.filter(s => s.id !== stallToRestoreCopy.id));
    setTotalStalls(prev => prev - 1);
    setStallToRestore(null); // Close the dialog immediately
    setSelectedStall(prev => (prev?.id === stallToRestoreCopy.id ? null : prev));
  
    // If the last item on a page is restored, navigate to the previous page
    if (originalStalls.length === 1 && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  
    // 3. Perform the async operation
    try {
      await updateStall(stallToRestoreCopy.dbId, {
        status: 'vacant', // Restore to vacant status
        occupied: false,
      });
  
      // 4. On success, show toast and refresh parent data
      toast({
        title: "Stall Restored",
        description: `${stallToRestoreCopy.type} - ${stallToRestoreCopy.name} is now active again.`,
      });
      onDataChange(); // Refresh the main app data
    } catch (error: any) {
      // 5. On failure, revert the UI and show an error
      if (!navigator.onLine) {
        toast({
          title: "No Internet Connection",
          description: "Could not restore stall. Please check your connection.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Restore Failed",
          description: error.message,
          variant: "destructive",
        });
      }
      setArchivedStalls(originalStalls);
      setTotalStalls(originalTotal);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Archived Stalls</h1>
        <p className="text-muted-foreground">View and restore previously archived stalls.</p>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by vendor name..."
              className="pl-9"
            />
          </div>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger>
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              <SelectItem value="Dry Section">Dry Section</SelectItem>
              <SelectItem value="Wet Section">Wet Section</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter} disabled={stallTypeOptions.length === 0}>
            <SelectTrigger>
              <LayoutGrid className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {stallTypeOptions.map(type => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : archivedStalls.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No archived stalls found.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedArchived).map(([section, stalls]) => (
            <div key={section} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{section}</h3>
              <div className="flex flex-wrap gap-2">
                {stalls.map((stall) => (
                  <Button
                    key={stall.id}
                    variant={selectedStall?.id === stall.id ? "default" : "outline"}
                    className="h-12 w-12 p-0"
                    onClick={() => setSelectedStall(prev => (prev?.id === stall.id ? null : stall))}
                  >
                    <span className="font-bold text-xs leading-tight text-center">{stall.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ✅ Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-4 pt-4">
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous Page</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
              <span className="sr-only">Next Page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedStall)} onOpenChange={(open) => (!open ? setSelectedStall(null) : null)}>
        <DialogContent className="sm:max-w-lg md:max-w-xl border-none p-0 overflow-hidden px-4">
          {selectedStall && (
            <Card key={selectedStall.id} className="border-none shadow-none">
              <CardHeader className="px-6 pt-6 pb-0">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    {selectedStall.name}
                  </CardTitle>
                  <Badge variant="outline" className="uppercase tracking-wide">
                    Archived
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm px-6 pb-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>{selectedStall.vendor || "No vendor assigned"}</span></div>
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{selectedStall.contact || "N/A"}</span></div>
                  <div className="flex items-center gap-2">
                    {selectedStall.section === "Wet Section" ? (
                      <Droplets className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>Section: {selectedStall.section}</span>
                  </div>
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><span>Type: {selectedStall.type}</span></div>
                  <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><span>Rent: ₱{selectedStall.rentAmount.toLocaleString()} / {selectedStall.rentalType}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Last Payment: {selectedStall.lastPayment || "N/A"}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Next Due: {selectedStall.nextDue || "N/A"}</span></div>
                </div>
                <div className="flex items-start gap-2 border-t pt-3">
                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span>Reason: <span className="italic">{selectedStall.archive_reason || "No reason provided."}</span></span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => setStallToRestore(selectedStall)}>
                    <ArchiveRestore className="mr-2 h-4 w-4" /> Restore
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedStall(null)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(stallToRestore)} onOpenChange={(open) => !open && setStallToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Stall</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to restore this stall? It will become 'vacant' and appear in the main stall list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
