import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/status";
import { usePendingCount } from "@/lib/offline/sync";

export function OfflineBadge() {
  const online = useOnlineStatus();
  const { count } = usePendingCount();

  if (online && count === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[100] pointer-events-none">
      <div className="flex items-center gap-2 rounded-full bg-muted/90 backdrop-blur border border-border px-3 py-1.5 shadow-md text-xs font-medium text-foreground">
        {!online && (
          <>
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
            <span>Modo offline</span>
          </>
        )}
        {count > 0 && (
          <span className="text-muted-foreground">
            {!online && "•"} {count} pendente{count === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}
