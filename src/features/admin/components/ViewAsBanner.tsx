import { Eye, LogOut, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useViewAsUser } from "@/features/admin/hooks/useViewAsUser";

export function ViewAsBanner() {
  const { session, isViewingAs, stopViewing } = useViewAsUser();
  const [exiting, setExiting] = useState(false);

  if (!isViewingAs || !session) return null;

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await stopViewing();
    } catch {
      setExiting(false);
    }
  };

  return (
    <div
      className="sticky top-0 z-[60] w-full bg-warning text-warning-foreground border-b border-warning/60 shadow-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      role="status"
      aria-live="polite"
    >
      {exiting && (
        <div className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-5 w-5 animate-spin" />
            Restaurando sua conta...
          </div>
        </div>
      )}
      <div
        className="container mx-auto px-3 py-2 flex items-center justify-between gap-2 text-sm"
        style={{
          paddingLeft: "calc(env(safe-area-inset-left) + 0.75rem)",
          paddingRight: "calc(env(safe-area-inset-right) + 0.75rem)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-warning-foreground opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning-foreground" />
          </span>
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-medium truncate">
            Visualizando: <strong>{session.target_name}</strong>
          </span>
          <span className="hidden sm:inline text-xs opacity-80">(somente leitura)</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={exiting}
          className="h-8 gap-1.5 shrink-0 bg-background text-foreground border-background hover:bg-background/90 font-semibold shadow-sm"
          onClick={handleExit}
          aria-label="Voltar para minha conta"
        >
          {exiting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          <span className="whitespace-nowrap">
            {exiting ? "Saindo..." : "Voltar p/ minha conta"}
          </span>
        </Button>
      </div>
    </div>
  );
}
