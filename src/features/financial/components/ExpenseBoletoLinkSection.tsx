import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link2, Link2Off, Plus, Search, RefreshCw } from "lucide-react";
import { useMyBoletos } from "@/features/boletos/hooks/useMyBoletos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BoletoFormDialog } from "@/features/boletos/components/boletos/BoletoFormDialog";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  expenseId: string;
}

/**
 * Seção exibida dentro do diálogo de edição da despesa.
 * O vínculo despesa↔boleto é 1:1 e agora é iniciado pela despesa.
 */
export function ExpenseBoletoLinkSection({ expenseId }: Props) {
  const { items, loading, linkExpense, unlinkExpense } = useMyBoletos();
  const [pickerOpen, setPickerOpen] = useState(false);
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
      // Garante 1:1 — se já existe vínculo, desfaz primeiro
      if (linked && linked.id !== boletoId) {
        await unlinkExpense(linked.id);
      }
      await linkExpense(boletoId, expenseId);
      toast.success(linked ? "Boleto substituído" : "Boleto vinculado");
      setPickerOpen(false);
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
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Boleto vinculado
        </Label>
        <div className="flex gap-1">
          {linked && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setPickerOpen(true)}
                disabled={busy || loading}
              >
                <RefreshCw className="h-3 w-3" /> Substituir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1 text-destructive"
                onClick={handleUnlink}
                disabled={busy}
              >
                <Link2Off className="h-3 w-3" /> Desvincular
              </Button>
            </>
          )}
          {!linked && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setPickerOpen(true)}
              disabled={busy || loading}
            >
              <Plus className="h-3 w-3" /> Vincular
            </Button>
          )}
        </div>
      </div>

      {linked ? (
        <div className="rounded-md border bg-card p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{linked.description}</div>
              {linked.beneficiary && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {linked.beneficiary}
                </div>
              )}
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {linked.status}
                </Badge>
                {linked.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {linked.category}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold">
                {BRL(Number(linked.amount) || 0)}
              </div>
              {linked.due_date && (
                <div className="text-[10px] text-muted-foreground">
                  Venc. {format(parseISO(linked.due_date), "dd/MM/yyyy", { locale: ptBR })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Nenhum boleto vinculado. Cada despesa pode ter até 1 boleto.
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          className="max-w-md max-h-[85vh] overflow-y-auto z-[2147483650]"
        >
          <DialogHeader>
            <DialogTitle>
              {linked ? "Substituir boleto vinculado" : "Vincular boleto à despesa"}
            </DialogTitle>
            <DialogDescription>
              Busque e selecione um boleto para vincular a esta despesa.
            </DialogDescription>
          </DialogHeader>

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
            <Button type="button" size="sm" variant="outline" className="h-9 px-2 gap-1 shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Apenas boletos sem vínculo com outra despesa são exibidos.
          </div>

          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                Carregando…
              </div>
            ) : available.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
                Nenhum boleto disponível para vincular.
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
                        <div className="text-[11px] text-muted-foreground truncate">
                          {b.beneficiary}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {b.status}
                        </Badge>
                        {b.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {b.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">
                        {BRL(Number(b.amount) || 0)}
                      </div>
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
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Fechar
            </Button>
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
            setPickerOpen(false);
          } catch (e: any) {
            toast.error(e?.message ?? "Boleto criado, mas falhou ao vincular");
          }
        }}
      />
    </div>
  );
}
