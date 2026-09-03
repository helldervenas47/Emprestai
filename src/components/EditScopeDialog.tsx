import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import type { EditScope } from "@/features/financial/lib/seriesEdit";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Confirmado pelo usuário; chamado após a confirmação extra do escopo "all". */
  onConfirm: (scope: EditScope) => Promise<void> | void;
  title?: string;
  description?: string;
}

/**
 * Modal genérico para escolher o escopo da edição de séries
 * (apenas esta parcela / esta e as próximas / todas as parcelas).
 * Inclui um passo extra de confirmação ao escolher "todas as parcelas".
 */
export function EditScopeDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Aplicar alteração em",
  description = "Escolha como esta edição deve ser propagada na série.",
}: Props) {
  const [scope, setScope] = useState<EditScope>("this");
  const [saving, setSaving] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (open) setScope("this");
  }, [open]);

  async function commit(s: EditScope) {
    setSaving(true);
    try {
      await onConfirm(s);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <RadioGroup value={scope} onValueChange={(v) => setScope(v as EditScope)} className="gap-2">
          <ScopeOption
            value="this"
            id="scope-only-this"
            active={scope === "this"}
            title="Apenas esta parcela"
            hint="Altera somente o lançamento selecionado."
          />
          <ScopeOption
            value="pending"
            id="scope-this-and-next"
            active={scope === "pending"}
            title="Esta parcela e as próximas"
            hint="Mantém inalteradas as parcelas anteriores e já pagas."
          />
          <ScopeOption
            value="all"
            id="scope-all"
            active={scope === "all"}
            destructive
            title={
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Todas as parcelas
              </span>
            }
            hint="Reescreve também o histórico de parcelas já quitadas."
          />
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              if (scope === "all") setConfirmAll(true);
              else commit(scope);
            }}
          >
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar alteração no histórico
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alterar <strong>todas as parcelas, inclusive as já pagas</strong>.
              Esta ação reescreve registros históricos do seu fluxo financeiro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmAll(false); commit("all"); }}
            >
              Sim, alterar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ScopeOption({
  value,
  id,
  active,
  title,
  hint,
  destructive,
}: {
  value: EditScope;
  id: string;
  active: boolean;
  title: React.ReactNode;
  hint: string;
  destructive?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
        active
          ? destructive
            ? "border-destructive bg-destructive/5"
            : "border-primary bg-primary/5"
          : "border-border/50 hover:bg-muted/40"
      }`}
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </label>
  );
}
