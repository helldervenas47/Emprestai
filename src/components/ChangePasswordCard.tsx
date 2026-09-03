import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Eye,
  EyeOff,
  Lock,
  Loader2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function evaluateStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: "Muito fraca", color: "bg-destructive" },
    1: { score: 1, label: "Fraca", color: "bg-destructive" },
    2: { score: 2, label: "Razoável", color: "bg-amber-500" },
    3: { score: 3, label: "Forte", color: "bg-emerald-500" },
    4: { score: 4, label: "Excelente", color: "bg-emerald-500" },
  };
  return map[Math.min(score, 4) as 0 | 1 | 2 | 3 | 4];
}

const MIN_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;

export function ChangePasswordCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  const strength = useMemo(() => evaluateStrength(next), [next]);

  const sameAsCurrent = next.length > 0 && next === current;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const locked = lockUntil !== null && Date.now() < lockUntil;

  const canSubmit =
    !loading &&
    !locked &&
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    !sameAsCurrent &&
    !mismatch &&
    confirm === next;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShowAll(false);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;
    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInErr) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= MAX_ATTEMPTS) {
          setLockUntil(Date.now() + COOLDOWN_MS);
          toast.error("Muitas tentativas inválidas. Aguarde 1 minuto e tente novamente.");
        } else {
          toast.error("Senha atual incorreta.");
        }
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        toast.error(updateErr.message || "Erro ao atualizar senha.");
        return;
      }

      if (revokeOthers) {
        try {
          await supabase.auth.signOut({ scope: "others" });
        } catch {
          /* noop */
        }
      }

      toast.success("Senha alterada com sucesso!", {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      });
      reset();
      setAttempts(0);
      setLockUntil(null);
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Falha inesperada ao alterar senha.");
    } finally {
      setLoading(false);
    }
  };

  const inputType = showAll ? "text" : "password";

  return (
    <Card>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-t-xl"
          >
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-primary" /> Alterar senha
                </CardTitle>
                <CardDescription>
                  Atualize sua senha de acesso com segurança.
                </CardDescription>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-300",
                  open && "rotate-180",
                )}
              />
            </CardHeader>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 p-2.5">
                <div className="flex items-center gap-2">
                  {showAll ? (
                    <Eye className="h-4 w-4 text-primary" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">
                    {showAll ? "Senhas visíveis" : "Mostrar senhas"}
                  </span>
                </div>
                <Switch checked={showAll} onCheckedChange={setShowAll} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cp-current" className="text-xs font-medium">
                  Senha atual
                </Label>
                <Input
                  id="cp-current"
                  type={inputType}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cp-next" className="text-xs font-medium">
                  Nova senha
                </Label>
                <Input
                  id="cp-next"
                  type={inputType}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  className={cn(
                    (tooShort || sameAsCurrent) &&
                      "border-destructive focus-visible:ring-destructive/40",
                  )}
                />
                {(tooShort || sameAsCurrent) && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="h-3 w-3" />
                    {tooShort
                      ? `Mínimo de ${MIN_LENGTH} caracteres`
                      : "A nova senha deve ser diferente da atual"}
                  </p>
                )}
              </div>

              {next.length > 0 && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                  <div className="flex h-1.5 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 rounded-full transition-all duration-300",
                          i < strength.score ? strength.color : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Força:{" "}
                    <span className="font-medium text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="cp-confirm" className="text-xs font-medium">
                  Confirmar nova senha
                </Label>
                <Input
                  id="cp-confirm"
                  type={inputType}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={cn(
                    mismatch && "border-destructive focus-visible:ring-destructive/40",
                  )}
                />
                {mismatch && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="h-3 w-3" /> As senhas não coincidem
                  </p>
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Encerrar outras sessões</p>
                    <p className="text-[11px] text-muted-foreground">
                      Desconecta esta conta dos outros dispositivos após salvar.
                    </p>
                  </div>
                </div>
                <Switch checked={revokeOthers} onCheckedChange={setRevokeOthers} />
              </div>

              {locked && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" /> Bloqueado temporariamente. Tente novamente em alguns segundos.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleOpenChange(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit} className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Salvar nova senha"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
