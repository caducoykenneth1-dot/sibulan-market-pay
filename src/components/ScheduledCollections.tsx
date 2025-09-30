import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface ScheduledCollectionsProps {
  onNavigate: (page: string) => void;
}

type ScheduledCollectionStatus = "confirmed" | "pending" | "completed";

type ScheduledCollection = {
  id: string;
  vendor: string;
  stall: string;
  type: string;
  date: string;
  time: string;
  collector: string;
  status: ScheduledCollectionStatus;
  notes?: string;
};

const INITIAL_COLLECTIONS: ScheduledCollection[] = [
  {
    id: "SCH-202401",
    vendor: "Maria Santos",
    stall: "A-15",
    type: "Monthly Rent",
    date: "2024-01-22",
    time: "09:00 AM",
    collector: "Juan Collector",
    status: "confirmed",
    notes: "Bring January invoice copy."
  },
  {
    id: "SCH-202402",
    vendor: "Cristian Daron",
    stall: "F-09",
    type: "Monthly Rent",
    date: "2024-01-22",
    time: "10:30 AM",
    collector: "Maria Collector",
    status: "pending",
    notes: "Confirm newly assigned stall paperwork."
  },
  {
    id: "SCH-202403",
    vendor: "Ana Reyes",
    stall: "C-22",
    type: "Daily Fee",
    date: "2024-01-23",
    time: "08:30 AM",
    collector: "Juan Collector",
    status: "confirmed"
  },
  {
    id: "SCH-202404",
    vendor: "Pedro Garcia",
    stall: "D-05",
    type: "Penalty",
    date: "2024-01-24",
    time: "01:15 PM",
    collector: "Maria Collector",
    status: "pending"
  }
];

const STATUS_META: Record<ScheduledCollectionStatus, { label: string; badge: "default" | "secondary" | "outline" }> = {
  confirmed: { label: "Confirmed", badge: "default" },
  pending: { label: "Pending", badge: "secondary" },
  completed: { label: "Completed", badge: "outline" }
};

export const ScheduledCollections = ({ onNavigate }: ScheduledCollectionsProps) => {
  const { toast } = useToast();
  const [collections, setCollections] = useState<ScheduledCollection[]>(INITIAL_COLLECTIONS);

  const today = "2024-01-22";

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
      title: "Opening payment collection",
      description: `Preparing collection for ${schedule.vendor} at stall ${schedule.stall}.`
    });
    onNavigate("collect");
  };

  const renderScheduleRow = (item: ScheduledCollection) => {
    const status = STATUS_META[item.status];

    return (
      <div
        key={item.id}
        className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <div className="font-semibold">{item.vendor}</div>
          <div className="text-sm text-muted-foreground">
            {item.type} • {item.id}
          </div>
          {item.notes && <div className="text-xs text-muted-foreground">Notes: {item.notes}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Stall {item.stall}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{item.time}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
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
          <p className="text-muted-foreground">Review upcoming collection visits and follow-up reminders.</p>
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
    </div>
  );
};
