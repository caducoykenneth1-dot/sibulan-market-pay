import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const [archivedStalls, setArchivedStalls] = useState<ArchivedStallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalStalls, setTotalStalls] = useState(0);

  const [sectionFilter, setSectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showStalls, setShowStalls] = useState(false);

  const [selectedStall, setSelectedStall] = useState<ArchivedStallRecord | null>(null);
  const [stallToRestore, setStallToRestore] = useState<StallRecord | null>(null);

  const nameMap = useMemo(
    () => new Map(allStalls.map(s => [s.dbId, s.name])),
    [allStalls]
  );

  const totalPages = Math.ceil(totalStalls / STALLS_PER_PAGE);

  const stallTypeOptions = useMemo(() => {
    return [
      ...new Set(
        STALL_TYPES
          .filter(t => sectionFilter === "all" || t.section === sectionFilter)
          .map(t => t.name)
      ),
    ].sort();
  }, [sectionFilter]);

  const fetchArchivedStalls = async (page: number) => {
    setLoading(true);

    const from = (page - 1) * STALLS_PER_PAGE;
    const to = from + STALLS_PER_PAGE - 1;

    let query = supabase
      .from("vendors")
      .select(
        "id, vendor, contact, type, monthly_rent, last_payment, next_due, status, rental_type, archive_reason",
        { count: "exact" }
      )
      .eq("status", "archived")
      .order("id");

    if (sectionFilter !== "all") {
      const types = STALL_TYPES.filter(t => t.section === sectionFilter).map(t => t.name);
      query = query.in("type", types);
    }

    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setArchivedStalls([]);
      setTotalStalls(0);
    } else {
      setArchivedStalls(
        (data || []).map(row => ({
          id: `stall-${row.id}`,
          dbId: row.id,
          name: nameMap.get(row.id) ?? `Stall ${row.id}`,
          vendor: row.vendor ?? "",
          contact: row.contact ?? "",
          type: row.type ?? "N/A",
          rentAmount: row.monthly_rent ?? 0,
          rentalType: row.rental_type ?? "monthly",
          lastPayment: row.last_payment ?? "",
          nextDue: row.next_due ?? "",
          status: "archived",
          occupied: false,
          archive_reason: row.archive_reason ?? "No reason provided.",
          section: sectionMap.get(row.type ?? "") ?? "N/A",
        }))
      );
      setTotalStalls(count ?? 0);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchArchivedStalls(currentPage);
  }, [currentPage, sectionFilter, typeFilter, nameMap]);

  useEffect(() => {
    setTypeFilter("all");
    setShowStalls(false);
  }, [sectionFilter]);

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

      {/* STALL TYPE FILTER */}
      <Card>
        <CardHeader>
          <CardTitle>Filter by Stall Type</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {stallTypeOptions.map(type => (
            <Button
              key={type}
              variant={typeFilter === type ? "default" : "outline"}
              onClick={() => {
                if (typeFilter === type) {
                  setTypeFilter("all");
                  setShowStalls(false);
                } else {
                  setTypeFilter(type);
                  setShowStalls(true);
                }
              }}
            >
              {type}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* STALL GRID */}
      {showStalls && (
        <>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" />
            </div>
          ) : archivedStalls.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No archived stalls found
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {archivedStalls.map(stall => (
                <Button
                  key={stall.id}
                  variant={selectedStall?.id === stall.id ? "default" : "outline"}
                  className="h-12 w-12 text-xs"
                  onClick={() => setSelectedStall(stall)}
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
    </div>
  );
};
