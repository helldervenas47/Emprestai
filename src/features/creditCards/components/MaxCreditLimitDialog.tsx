import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAccountSettings } from "@/hooks/useAccountSettings";
import { useCreditLimits } from "@/features/creditCards/hooks/useCreditLimits";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaxCreditLimitDialog({ open, onOpenChange }: Props) {
  const { settings, updateMaxCreditLimit, saving } = useAccountSettings();
  const { limits, updateLimit } = useCreditLimits();
  const [value, setValue] = useState<string>("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(settings.maxCreditLimit != null ? String(settings.maxCreditLimit) : "");
    }
  }, [open, settings.maxCreditLimit]);

  const parsed = (() => {
    const trimmed = value.trim().replace(",", ".");
    if (trimmed === "") return null;
    const n = parseFloat(trimmed);
    return isNaN(n) || n < 0 ? NaN : n;
  })();

  const aboveCap = parsed !== null && !isNaN(parsed)
    ? limits.filter((l) => l.currentLimit > (parsed as number))
    : [];

  const handleSave = async () => {
    if (parsed !== null && isNaN(parsed)) {
      toast.error("Informe um valor válido");
      return;
    }
    setApplying(true);
    const ok = await updateMaxCreditLimit(parsed);
    if (!ok) {
      setApplying(false);
      toast.error("Falha ao salvar o limite máximo");
      return;
    }

    if (parsed !== null) {
      const cap = parsed;
      const toAdjust = limits.filter((l) => l.currentLimit > cap);
      for (const l of toAdjust) {
        await updateLimit(l.clientId, cap, {
          changeType: "automatic",
          mode: l.mode,
          reason: `Reduzido para o limite máximo global (${formatBRL(cap)})`,
          metadata: { previousLimit: l.currentLimit, maxCreditLimit: cap },
        });
      }
      toast.success(
        toAdjust.length > 0
          ? `Limite máximo aplicado. ${toAdjust.length} cliente(s) ajustado(s).`
          : "Limite máximo definido.",
      );
    } else {
      toast.success("Limite máximo removido");
    }

    setApplying(false);
    onOpenChange(false);
  };

  const handleClear = async () => {
    setApplying(true);
    const ok = await updateMaxCreditLimit(null);
    setApplying(false);
    if (ok) {
      toast.success("Limite máximo removido");
      onOpenChange(false);
    } else {
      toast.error("Falha ao remover");
    }
  };

  const busy = saving || applying;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Limite máximo de crédito
          </DialogTitle>
          <DialogDescription>
            Define um teto global aplicado a todos os clientes. Limites acima deste valor serão
            reduzidos automaticamente ao salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="max-credit-limit">Valor máximo (R$)</Label>
            <Input
              id="max-credit-limit"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="Ex.: 5000"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para não aplicar nenhum teto.
            </p>
          </div>

          {parsed !== null && !isNaN(parsed) && aboveCap.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="font-medium text-warning">
                {aboveCap.length} cliente(s) serão reduzidos para {formatBRL(parsed)}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {settings.maxCreditLimit != null && (
            <Button variant="outline" onClick={handleClear} disabled={busy}>
              Remover teto
            </Button>
          )}
          <Button onClick={handleSave} disabled={busy || (parsed !== null && isNaN(parsed))}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
