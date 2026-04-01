import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Invoice } from "./UnpaidDues";
import { PaymentChatAssistant } from "./PaymentChatAssistant";
import { StallRecord } from "@/data/stalls";
import { type DashboardStats } from "@/data/dashboardStats";

interface GlobalChatLauncherProps {
  records: Invoice[];
  stalls: StallRecord[];
  systemStats: DashboardStats;
}

export const GlobalChatLauncher = ({ records, stalls, systemStats }: GlobalChatLauncherProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 md:right-6 md:bottom-6">
      {open && (
        <div className="w-[min(100vw-1rem,420px)] rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">AI Assistant</p>
              <p className="text-xs text-slate-500">Tap the robot to ask about totals and unpaid records.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              aria-label="Close AI chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
            <PaymentChatAssistant
              records={records}
              stalls={stalls}
              systemStats={systemStats}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90"
        aria-label="Toggle AI chat assistant"
      >
        <MessageCircle className="h-7 w-7" />
      </button>
    </div>
  );
};
