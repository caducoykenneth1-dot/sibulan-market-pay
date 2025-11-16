import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload } from "lucide-react";

interface CollectorProfileProps {
  userName: string;
  userUsername: string;
  userRole: string;
  onBack: () => void;
  avatarUrl?: string | null;
  onAvatarChange?: (url: string | null) => void;
}

export const CollectorProfile = ({
  userName,
  userUsername,
  userRole,
  onBack,
  avatarUrl: avatarUrlProp = null,
  onAvatarChange,
}: CollectorProfileProps) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatarUrlProp);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState("");
  const [saveMessage, setSaveMessage] = useState<string>("");

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
    </div>
  );
};
