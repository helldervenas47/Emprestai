import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIOS = () => {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
};

const isInStandaloneMode = () => {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
};

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;

    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt) {
      const hours = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60);
      if (hours < 72) {
        setDismissed(true);
        return;
      }
    }

    if (isIOS()) {
      setShowIOSPrompt(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
  };

  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl bg-card border border-border shadow-xl p-4">
        <div className="flex items-start gap-3">
          <img src="/logo-96.png" alt="EmprestAI" className="w-12 h-12 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Instalar EmprestAI</h3>
              <button type="button" onClick={handleDismiss} className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showIOSPrompt
                ? "Toque em \"Compartilhar\" e depois \"Adicionar à Tela de Início\""
                : "Adicione o app à sua tela inicial para acesso rápido"}
            </p>
            {showIOSPrompt ? (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Share className="w-4 h-4 text-primary" />
                <span>Toque no ícone <strong>Compartilhar</strong> do Safari</span>
              </div>
            ) : (
              <Button size="sm" onClick={handleInstall} className="mt-2 h-8 text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Instalar agora
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
