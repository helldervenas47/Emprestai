import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Link2Off, Search, RefreshCw, Plus } from "lucide-react";
import { useMyBoletos } from "@/features/boletos/hooks/useMyBoletos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoletoFormDialog } from "@/features/boletos/components/boletos/BoletoFormDialog";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  expenseId: string;
  className?: string;
}

/**
 * Botão compacto (ícone) para vincular/substituir/desvincular o boleto
 * diretamente do card da despesa (sem abrir o diálogo de edição completo).
 */
export function ExpenseBoletoLinkButton({ expenseId, className }: Props) {
  const { items, loading, linkExpense, unlinkExpense } = useMyBoletos();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const linked = useMemo(
    () => items.find((b) => b.expense_id === expenseId) ?? null,
    [items, expenseId],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((b) => !b.expense_id && !b.income_id)
      .filter(
        (b) =>
          !q ||
          (b.description ?? "").toLowerCase().includes(q) ||
          (b.beneficiary ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  }, [items, search]);

  const handleLink = async (boletoId: string) => {
    setBusy(true);
    try {
      if (linked && linked.id !== boletoId) {
        await unlinkExpense(linked.id);
      }
      await linkExpense(boletoId, expenseId);
      toast.success(linked ? "Boleto substituído" : "Boleto vinculado");
      setOpen(false);
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao vincular boleto");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!linked) return;
    setBusy(true);
    try {
      await unlinkExpense(linked.id);
      toast.success("Boleto desvinculado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desvincular");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant={linked ? "default" : "ghost"}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "h-8 w-8 p-0 shrink-0",
          linked
            ? "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30"
            : "text-muted-foreground hover:text-foreground",
          className,
        )}
        title={linked ? `Boleto vinculado: ${linked.description}` : "Vincular boleto"}
        aria-label={linked ? "Boleto vinculado" : "Vincular boleto"}
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md max-h-[85vh] overflow-y-auto z-[2147483650]"
        >
          <DialogHeader>
            <DialogTitle>
              {linked ? "Boleto vinculado à despesa" : "Vincular boleto à despesa"}
            </DialogTitle>
            <DialogDescription>
              Consulte, substitua ou selecione o boleto relacionado a esta despesa.
            </DialogDescription>
          </DialogHeader>

          {linked && (
            <div className="rounded-md border bg-card p-3 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{linked.description}</div>
                  {linked.beneficiary && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {linked.beneficiary}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px] capitalize">{linked.status}</Badge>
                    {linked.category && (
                      <Badge variant="outline" className="text-[10px]">{linked.category}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{BRL(Number(linked.amount) || 0)}</div>
                  {linked.due_date && (
                    <div className="text-[10px] text-muted-foreground">
                      Venc. {format(parseISO(linked.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-7 px-2 text-xs gap-1 text-destructive flex-1"
                  onClick={handleUnlink} disabled={busy}
                >
                  <Link2Off className="h-3 w-3" /> Desvincular
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1 border-t">
                <RefreshCw className="h-3 w-3" /> Selecione abaixo para substituir
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar boleto"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 px-2 gap-1 shrink-0"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>

          <div className="space-y-1 max-h-[45vh] overflow-y-auto">
            {loading ? (
              <div className="text-sm text-muted-foreground text-center py-4">Carregando…</div>
            ) : available.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
                Nenhum boleto disponível.
              </div>
            ) : (
              available.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleLink(b.id)}
                  disabled={busy}
                  className="w-full text-left rounded-md border p-2 hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{b.description}</div>
                      {b.beneficiary && (
                        <div className="text-[11px] text-muted-foreground truncate">{b.beneficiary}</div>
                      )}
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">{b.status}</Badge>
                        {b.category && (
                          <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{BRL(Number(b.amount) || 0)}</div>
                      {b.due_date && (
                        <div className="text-[10px] text-muted-foreground">
                          {format(parseISO(b.due_date), "dd/MM/yy", { locale: ptBR })}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BoletoFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={async (newId) => {
          try {
            if (linked && linked.id !== newId) await unlinkExpense(linked.id);
            await linkExpense(newId, expenseId);
            toast.success("Boleto criado e vinculado");
            setOpen(false);
          } catch (e: any) {
            toast.error(e?.message ?? "Boleto criado, mas falhou ao vincular");
          }
        }}
      />
    </>
  );
}
