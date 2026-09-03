import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Tablet, Loader2, RefreshCw, LogOut, Globe, MapPin, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

interface SessionItem {
  id: string;
  created_at: string;
  updated_at: string;
  user_agent: string | null;
  ip: string | null;
  not_after: string | null;
  geo?: { city: string | null; region: string | null; country: string | null; lat?: number | null; lon?: number | null } | null;
}

function detectDevice(ua: string | null): { icon: typeof Monitor; label: string } {
  if (!ua) return { icon: Globe, label: "Dispositivo desconhecido" };
  const u = ua.toLowerCase();
  if (/iphone|android.*mobile|windows phone/.test(u)) return { icon: Smartphone, label: "Celular" };
  if (/ipad|tablet|android(?!.*mobile)/.test(u)) return { icon: Tablet, label: "Tablet" };
  return { icon: Monitor, label: "Computador" };
}

function detectBrowser(ua: string | null): string {
  if (!ua) return "Navegador";
  const u = ua.toLowerCase();
  if (u.includes("edg/")) return "Edge";
  if (u.includes("opr/") || u.includes("opera")) return "Opera";
  if (u.includes("chrome/") && !u.includes("chromium")) return "Chrome";
  if (u.includes("safari/") && !u.includes("chrome")) return "Safari";
  if (u.includes("firefox/")) return "Firefox";
  return "Navegador";
}

function detectOS(ua: string | null): string {
  if (!ua) return "";
  const u = ua.toLowerCase();
  if (u.includes("windows")) return "Windows";
  if (u.includes("mac os") || u.includes("macintosh")) return "macOS";
  if (u.includes("android")) return "Android";
  if (u.includes("iphone") || u.includes("ipad") || u.includes("ios")) return "iOS";
  if (u.includes("linux")) return "Linux";
  return "";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActiveSessionsCard() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<SessionItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sessions", {
        body: { action: "list" },
      });
      if (error) throw error;
      setSessions(data?.sessions ?? []);
      setCurrentId(data?.current_session_id ?? null);
    } catch (e: any) {
      toast.error("Falha ao carregar sessões: " + (e?.message || "erro"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = async (s: SessionItem) => {
    setRevoking(s.id);
    try {
      const { error } = await supabase.functions.invoke("manage-sessions", {
        body: { action: "revoke", session_id: s.id },
      });
      if (error) throw error;
      toast.success("Sessão revogada com sucesso.");
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e: any) {
      toast.error("Falha ao revogar: " + (e?.message || "erro"));
    } finally {
      setRevoking(null);
      setConfirmRevoke(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4 text-primary" /> Sessões ativas
            </CardTitle>
            <CardDescription>
              Dispositivos onde você está logado. Revogue qualquer um para deslogá-lo.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma sessão ativa encontrada.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const { icon: Icon, label } = detectDevice(s.user_agent);
              const browser = detectBrowser(s.user_agent);
              const os = detectOS(s.user_agent);
              const isCurrent = s.id === currentId;
              return (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <Icon className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {label}{os ? ` · ${os}` : ""}
                        </span>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-xs">Este dispositivo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {browser}
                        {s.ip ? ` · ${s.ip}` : ""}
                      </p>
                      {s.geo && (s.geo.city || s.geo.country) && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                          <MapPin className="h-3 w-3" />
                          <span>{[s.geo.city, s.geo.region, s.geo.country].filter(Boolean).join(", ")}</span>
                          <a
                            href={
                              s.geo.lat != null && s.geo.lon != null
                                ? `https://www.google.com/maps?q=${s.geo.lat},${s.geo.lon}`
                                : `https://www.google.com/maps?q=${encodeURIComponent(
                                    [s.geo.city, s.geo.region, s.geo.country].filter(Boolean).join(", "),
                                  )}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Ver no mapa
                          </a>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Último acesso: {formatDate(s.updated_at || s.created_at)}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRevoke(s)}
                      disabled={revoking === s.id}
                      className="shrink-0"
                    >
                      {revoking === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><LogOut className="h-3.5 w-3.5 mr-1" /> Revogar</>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={!!confirmRevoke}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
        title="Revogar sessão"
        description={`Este dispositivo será deslogado imediatamente e precisará entrar novamente. Continuar?`}
        onConfirm={() => confirmRevoke && handleRevoke(confirmRevoke)}
      />
    </Card>
  );
}
