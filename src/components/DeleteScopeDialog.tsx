import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { DeleteScope } from "@/features/financial/lib/expenseSeriesScope";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (scope: DeleteScope) => Promise<void> | void;
  /** Contexto do lançamento — exibido na confirmação. */
  context: "personal" | "business";
  /** Nome/descrição da despesa. */
  label?: string;
  /** Quando false, apenas confirma a exclusão do próprio registro. */
  isSeries?: boolean;
}

const SCOPE_TEXT: Record<DeleteScope, { title: string; hint: string; confirm: string }> = {
  this: {
    title: "Excluir somente esta",
    hint: "Remove apenas este lançamento. Registros anteriores e futuros permanecem intactos.",
    confirm: "Excluir somente esta despesa",
  },
  future: {
    title: "Excluir esta e todas as futuras",
    hint: "Remove este lançamento e as ocorrências seguintes da mesma sequência. O histórico anterior é preservado.",
    confirm: "Excluir esta despesa e todas as futuras",
  },
  all: {
    title: "Excluir todas",
    hint: "Remove toda a sequência: ocorrências anteriores, a atual e as futuras.",
    confirm: "Excluir todas as despesas da sequência",
  },
};

export function DeleteScopeDialog({
  open, onOpenChange, onConfirm, context, label, isSeries = true,
}: Props) {
  const [scope, setScope] = useState<DeleteScope>("this");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const contextLabel = context === "personal" ? "Pessoal" : "Empresarial";

  useEffect(() => { if (open) { setScope("this"); setConfirming(false); } }, [open]);

  async function commit() {
    setSaving(true);
    try {
      await onConfirm(isSeries ? scope : "this");
      setConfirming(false);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Excluir despesa
          </DialogTitle>
          <DialogDescription>
            {label ? `${label} — ` : ""}Contexto: <strong>{contextLabel}</strong>
            {isSeries ? ". Escolha o alcance da exclusão." : ". Confirme a exclusão deste lançamento."}
          </DialogDescription>
        </DialogHeader>

        {isSeries && (
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as DeleteScope)} className="gap-2">
            {(["this", "future", "all"] as DeleteScope[]).map((s) => {
              const active = scope === s;
              const destructive = s === "all";
              return (
                <label
                  key={s}
                  htmlFor={`del-scope-${s}`}
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    active
                      ? destructive ? "border-destructive bg-destructive/5" : "border-primary bg-primary/5"
                      : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value={s} id={`del-scope-${s}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      {destructive && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      {SCOPE_TEXT[s].title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{SCOPE_TEXT[s].hint}</div>
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={saving} onClick={() => setConfirming(true)}>
            {saving ? "Excluindo..." : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="z-[2147483648]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ação selecionada: <strong>{SCOPE_TEXT[isSeries ? scope : "this"].confirm}</strong>.
              <br />
              Despesa {label ? <strong>{label}</strong> : "selecionada"} — contexto{" "}
              <strong>{contextLabel}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); commit(); }}
            >
              {saving ? "Excluindo..." : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
