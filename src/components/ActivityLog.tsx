import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface ActivityLogEntry {
  id: number;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

interface ActivityLogProps {
  logs?: ActivityLogEntry[];
  newEntryAt?: number | null;
}

const ITEMS_PER_PAGE = 10;

export const ActivityLog = ({ logs = [], newEntryAt }: ActivityLogProps) => {
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [highlightLatest, setHighlightLatest] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setLoading(false);
  }, [logs]);

  useEffect(() => {
    if (!newEntryAt) return;
    setHighlightLatest(true);
    const timer = window.setTimeout(() => setHighlightLatest(false), 1800);
    return () => window.clearTimeout(timer);
  }, [newEntryAt]);

  const filteredLogs = useMemo(() => {
    const normalized = debouncedSearch.trim().toLowerCase();
    const sorted = [...logs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!normalized) return sorted;
    return sorted.filter((log) =>
      [log.user_name, log.action, log.details].some((value) =>
        value?.toLowerCase().includes(normalized)
      )
    );
  }, [logs, debouncedSearch]);

  const totalCount = filteredLogs.length;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const pagedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">Monitor system usage and collector actions.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No activity logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedLogs.map((log, index) => (
                        <TableRow
                          key={log.id}
                          className={index === 0 && highlightLatest ? "bg-emerald-50 transition-colors" : undefined}
                        >
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="font-medium">{log.user_name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{log.details}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {totalCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} entries
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm font-medium">
                    Page {currentPage} of {totalPages || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages || 1, page + 1))}
                    disabled={currentPage >= (totalPages || 1) || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
