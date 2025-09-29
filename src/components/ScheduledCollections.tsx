import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Clock,
  MapPin,
  Play,
  User
} from "lucide-react";
import { type StallRecord } from "@/data/stalls";

interface ScheduledCollectionsProps {
  onNavigate: (page: string) => void;
  stalls: StallRecord[];
}

type ScheduledCollectionStatus = "confirmed" | "pending" | "completed";

type ScheduledCollection = {
  id: string;
  vendor: string;
  stallId: string;
  stallName: string;
  type: string;
  date: string;
  time: string;
  collector: string;
  status: ScheduledCollectionStatus;
  notes?: string;
};

const STATUS_META: Record<ScheduledCollectionStatus, { label: string; badge: "default" | "secondary" | "outline" }> = {
  confirmed: { label: "Confirmed", badge: "default" },
  pending: { label: "Pending", badge: "secondary" },
  completed: { label: "Completed", badge: "outline" }
};

const COLLECTION_TIME_SLOTS = [
  "09:00 AM",
  "09:45 AM",
  "10:30 AM",
  "11:15 AM",
  "01:00 PM",
  "01:45 PM",
  "02:30 PM"
];

const COLLECTOR_POOL = ["Juan Collector", "Maria Collector", "Alex Rivera", "Kim Santos"];

const formatISODate = (date: Date): string => date.toISOString().split("T")[0];

const buildDisplayNameMap = (stalls: StallRecord[]): Map<string, string> => {
  const counters = new Map<string, number>();
  const names = new Map<string, string>();

  stalls.forEach((stall) => {
    const typeKey = stall.type.trim().toLowerCase() || "uncategorised";
    const nextNumber = (counters.get(typeKey) ?? 0) + 1;
    counters.set(typeKey, nextNumber);
    names.set(stall.id, `Stall ${nextNumber}`);
  });

  return names;
};

const buildCollectionsFromStalls = (
  stalls: StallRecord[],
  displayNameById: Map<string, string>
): ScheduledCollection[] => {
  const today = new Date();

  return stalls
    .filter((stall) => stall.occupied || stall.status !== "vacant")
    .map((stall, index) => {
      const visitDate = new Date(today);
      visitDate.setDate(today.getDate() + (index % 5));
      const status: ScheduledCollectionStatus = stall.status === "current" ? "confirmed" : "pending";
      const notes =
        stall.status === "overdue"
          ? "Follow up on overdue balance."
          : stall.status === "due"
          ? "Payment due soon."
          : undefined;
      const stallDisplayName = displayNameById.get(stall.id) ?? stall.name;

      return {
        id: `SCH-${stall.id.replace("stall-", "").padStart(4, "0")}`,
        vendor: stall.vendor || "No vendor assigned",
        stallId: stall.id,
        stallName: stallDisplayName,
        type: stall.type || "Monthly Rent",
        date: formatISODate(visitDate),
        time: COLLECTION_TIME_SLOTS[index % COLLECTION_TIME_SLOTS.length],
        collector: COLLECTOR_POOL[index % COLLECTOR_POOL.length],
        status,
        notes
      };
    });
};

export const ScheduledCollections = ({ onNavigate, stalls }: ScheduledCollectionsProps) => {
  const { toast } = useToast();
  const displayNameById = useMemo(() => buildDisplayNameMap(stalls), [stalls]);
  const [collections, setCollections] = useState<ScheduledCollection[]>(() =>
    buildCollectionsFromStalls(stalls, displayNameById)
  );

  useEffect(() => {
    setCollections((previous) => {
      const nextFromStalls = buildCollectionsFromStalls(stalls, displayNameById);
      const previousById = new Map(previous.map((item) => [item.id, item]));

      return nextFromStalls.map((item) => {
        const existing = previousById.get(item.id);
        return existing
          ? {
              ...item,
              status: existing.status,
              notes: existing.notes ?? item.notes
            }
          : item;
      });
    });
  }, [stalls, displayNameById]);

  const today = formatISODate(new Date());

  const todaysSchedules = useMemo(
    () => collections.filter((item) => item.date === today),
    [collections, today]
  );

  const upcomingSchedules = useMemo(
    () => collections.filter((item) => item.date !== today),
    [collections, today]
  );

  const recommendations = useMemo(
    () => collections.filter((item) => item.status !== "completed").slice(0, 3),
    [collections]
  );

  const stallDirectory = useMemo(
    () =>
      stalls.map((stall) => {
        const displayName = displayNameById.get(stall.id) ?? stall.name;
        return {
          id: stall.id,
          name: displayName,
          vendor: stall.vendor || "No vendor assigned",
          status: stall.status,
          type: stall.type,
          monthlyRent: stall.monthlyRent
        };
      }),
    [stalls, displayNameById]
  );

  const handleMarkCompleted = (id: string) => {
    setCollections((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "completed"
            }
          : item
      )
    );

    const target = collections.find((item) => item.id === id);
    if (target) {
      toast({
        title: "Marked as completed",
        description: `Collection for ${target.vendor} has been completed.`
      });
    }
  };

  const handleStartCollection = (schedule: ScheduledCollection) => {
    toast({
      title: "Collection launched",
      description: `Starting collection for ${schedule.vendor} at ${schedule.stallName}.`
    });
  };

  const renderScheduleRow = (item: ScheduledCollection) => {
    const status = STATUS_META[item.status];

    return (
      <div
        key={item.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{item.vendor}</p>
            <p className="text-xs text-muted-foreground">
              {item.type} • {item.date} at {item.time}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {item.stallName}
            </p>
            {item.notes ? <p className="text-xs text-amber-600">{item.notes}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{item.collector}</span>
          </div>
          <Badge variant={status.badge}>{status.label}</Badge>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleStartCollection(item)}>
              <Play className="mr-1 h-4 w-4" /> Collect
            </Button>
            {item.status !== "completed" && (
              <Button size="sm" onClick={() => handleMarkCompleted(item.id)}>
                <CheckCircle className="mr-1 h-4 w-4" /> Done
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Scheduled Collections</h1>
          <p className="text-muted-foreground">Live schedule derived from current stall assignments.</p>
        </div>
        <Button variant="ghost" onClick={() => onNavigate("dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-semibold">{todaysSchedules.length}</div>
                <div className="text-sm text-muted-foreground">Visits for Today</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-secondary/20 bg-secondary/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-secondary" />
              <div>
                <div className="text-2xl font-semibold">{upcomingSchedules.length}</div>
                <div className="text-sm text-muted-foreground">Upcoming Visits</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-success/20 bg-success/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="h-8 w-8 text-success" />
              <div>
                <div className="text-2xl font-semibold">{new Set(collections.map((item) => item.collector)).size}</div>
                <div className="text-sm text-muted-foreground">Assigned Collectors</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Recommended Actions</CardTitle>
          <CardDescription>Focus on pending and overdue stalls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">All scheduled visits are completed. Great job!</p>
          ) : (
            recommendations.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
              >
                <div>
                  <p className="font-medium">Follow up with {item.vendor}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.type} • {item.date} at {item.time}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleStartCollection(item)}>
                    <Play className="mr-1 h-4 w-4" /> Collect now
                  </Button>
                  {item.status !== "completed" && (
                    <Button size="sm" onClick={() => handleMarkCompleted(item.id)}>
                      <CheckCircle className="mr-1 h-4 w-4" /> Mark done
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today's Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {todaysSchedules.length === 0
            ? <p className="text-sm text-muted-foreground">No scheduled visits for today.</p>
            : todaysSchedules.map(renderScheduleRow)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingSchedules.length === 0
            ? <p className="text-sm text-muted-foreground">No upcoming visits scheduled.</p>
            : upcomingSchedules.map(renderScheduleRow)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Stall Directory</CardTitle>
          <CardDescription>Shared stall information from Stall Management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stallDirectory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stalls available.</p>
          ) : (
            stallDirectory.map((stall) => (
              <div
                key={stall.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div>
                  <p className="font-medium">{stall.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stall.vendor} - PHP {stall.monthlyRent.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={stall.status === "vacant" ? "outline" : "default"} className="capitalize">
                    {stall.status}
                  </Badge>
                  {stall.type ? (
                    <Badge variant="secondary" className="capitalize">
                      {stall.type}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

