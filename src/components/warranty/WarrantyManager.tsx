import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Plus, Upload, Trash2, ArrowDownToLine, ArrowUpFromLine, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Sale, Product } from "@/types/loan";
import { useWarranty } from "@/hooks/useWarranty";
import {
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_TONE,
  type WarrantyCase,
  type WarrantyStatus,
} from "@/types/warranty";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

const STATUSES: WarrantyStatus[] = [
  "aberta", "em_analise", "aguardando_produto",
  "produto_recebido", "produto_substituido", "concluida", "cancelada",
];

const ACTIVE_CASE_STATUSES: WarrantyStatus[] = STATUSES.filter((s) => s !== "cancelada");

interface Props {
  sale: Sale;
  products?: Product[];
  iconOnly?: boolean;
}

export function WarrantyManager({ sale, products: productsProp, iconOnly }: Props) {
  const [open, setOpen] = useState(false);
  const w = useWarranty(open ? sale.id : undefined);
  const [fetched, setFetched] = useState<Product[]>([]);
  useEffect(() => {
    if (!open || productsProp?.length) return;
    supabase.from("products").select("id,name,stock,price,cost,created_at").then(({ data }) => {
      if (data) setFetched(data.map((p: any) => ({
        id: p.id, name: p.name, description: "", price: Number(p.price || 0), cost: Number(p.cost || 0),
        lastPurchasePrice: 0, suggestedStock: 0, stock: Number(p.stock || 0), active: true, createdAt: p.created_at,
      })));
    });
  }, [open, productsProp?.length]);
  const products = productsProp?.length ? productsProp : fetched;

  const activeCount = w.cases.filter((c) => c.status !== "concluida" && c.status !== "cancelada").length;

  return (
    <>
      {iconOnly ? (
        <Button data-mutation
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary hover:bg-primary/10 relative"
          title="Garantia"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <ShieldCheck className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </Button>
      ) : (
        <Button data-mutation
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => setOpen(true)}
          title="Garantia"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Garantia
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{activeCount}</Badge>
          )}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Garantia — {sale.customerName || sale.productName || "Venda"}
            </DialogTitle>
          </DialogHeader>
          <WarrantyContent sale={sale} products={products} w={w} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function WarrantyContent({
  sale, products, w,
}: { sale: Sale; products: Product[]; w: ReturnType<typeof useWarranty> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const selected = w.cases.find((c) => c.id === selectedId) || w.cases[0] || null;

  // Quantity already in non-cancelled warranties (for the sale's product line)
  const usedQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    w.items.forEach((it) => {
      const c = w.cases.find((cc) => cc.id === it.warrantyCaseId);
      if (!c || c.status === "cancelada") return;
      const key = it.productId || `__name:${it.productName}`;
      map.set(key, (map.get(key) || 0) + it.quantity);
    });
    return map;
  }, [w.items, w.cases]);

  const soldKey = sale.productId || `__name:${sale.productName || sale.description || ""}`;
  const soldQty = Number(sale.quantity) || 0;
  const usedQty = usedQtyByProduct.get(soldKey) || 0;
  const availableForWarranty = Math.max(0, soldQty - usedQty);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
        <div>
          <div className="font-medium text-foreground">{sale.productName || sale.description}</div>
          <div className="text-muted-foreground">
            Vendido: <span className="font-medium text-foreground tabular-nums">{soldQty}</span>
            {" · "}Em garantia: <span className="font-medium text-foreground tabular-nums">{usedQty}</span>
            {" · "}Disponível: <span className="font-semibold text-primary tabular-nums">{availableForWarranty}</span>
          </div>
        </div>
        <Button data-mutation size="sm" onClick={() => setShowNew(true)} disabled={availableForWarranty <= 0}>
          <Plus className="h-3.5 w-3.5" /> Nova garantia
        </Button>
      </div>

      {w.cases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhuma garantia aberta para esta venda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3">
          <div className="space-y-1.5">
            {w.cases.map((c) => {
              const toneCls = toneClass(WARRANTY_STATUS_TONE[c.status]);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-md border transition-colors",
                    selected?.id === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tabular-nums">#{c.id.slice(0, 8)}</span>
                    <Badge variant="outline" className={cn("text-[10px]", toneCls)}>{WARRANTY_STATUS_LABEL[c.status]}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(c.openedAt), "dd/MM/yyyy HH:mm")}
                  </div>
                </button>
              );
            })}
          </div>
          {selected && (
            <CaseDetail key={selected.id} caseRow={selected} w={w} products={products} />
          )}
        </div>
      )}

      <NewWarrantyDialog
        open={showNew}
        onOpenChange={setShowNew}
        sale={sale}
        availableQty={availableForWarranty}
        defaultProduct={sale.productId ? products.find((p) => p.id === sale.productId) : undefined}
        defaultName={sale.productName || sale.description || ""}
        onSubmit={async (input) => {
          try {
            const c = await w.createCase(input);
            setSelectedId(c.id);
            toast.success("Garantia aberta");
            setShowNew(false);
          } catch (e: any) {
            toast.error(e?.message || "Falha ao abrir garantia");
          }
        }}
      />
    </div>
  );
}

function CaseDetail({
  caseRow, w, products,
}: { caseRow: WarrantyCase; w: ReturnType<typeof useWarranty>; products: Product[] }) {
  const items = w.items.filter((i) => i.warrantyCaseId === caseRow.id);
  const movements = w.movements.filter((m) => m.warrantyCaseId === caseRow.id);
  const attachments = w.attachments.filter((a) => a.warrantyCaseId === caseRow.id);
  const history = w.history.filter((h) => h.warrantyCaseId === caseRow.id);
  const [notes, setNotes] = useState(caseRow.notes || "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={caseRow.status}
          onValueChange={async (v) => {
            try { await w.updateStatus(caseRow.id, v as WarrantyStatus); toast.success("Status atualizado"); }
            catch (e: any) { toast.error(e?.message || "Falha"); }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{WARRANTY_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          Aberta em {format(new Date(caseRow.openedAt), "dd/MM/yyyy HH:mm")}
          {caseRow.closedAt && ` · Fechada em ${format(new Date(caseRow.closedAt), "dd/MM/yyyy HH:mm")}`}
        </span>
      </div>

      {caseRow.reason && (
        <div className="rounded-md border border-border/60 p-2.5 text-xs">
          <div className="text-muted-foreground mb-0.5">Motivo</div>
          <div className="text-foreground">{caseRow.reason}</div>
        </div>
      )}

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-9">
          <TabsTrigger value="items" className="text-xs">Itens</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs">Estoque</TabsTrigger>
          <TabsTrigger value="files" className="text-xs">Anexos</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-2 mt-3">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem itens vinculados.</p>
          ) : items.map((it) => (
            <div key={it.id} className="rounded-md border border-border/60 p-2 text-xs flex justify-between">
              <span>{it.productName}</span>
              <span className="tabular-nums font-medium">Qtd: {it.quantity}</span>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-sm" />
            <Button data-mutation
              size="sm" variant="outline"
              disabled={notes === (caseRow.notes || "") || busy}
              onClick={async () => {
                setBusy(true);
                try { await w.updateNotes(caseRow.id, notes); toast.success("Observação salva"); }
                catch (e: any) { toast.error(e?.message || "Falha"); }
                finally { setBusy(false); }
              }}
            >Salvar observação</Button>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-3 mt-3">
          <MovementForm caseRow={caseRow} items={items} products={products} w={w} />
          <div className="space-y-1.5">
            {movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada.</p>
            ) : movements.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs">
                {m.direction === "in"
                  ? <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
                  : <ArrowUpFromLine className="h-3.5 w-3.5 text-warning" />}
                <span className="font-medium">{m.direction === "in" ? "Entrada" : "Saída"}</span>
                <span className="tabular-nums">{m.quantity}</span>
                <span className="text-muted-foreground truncate flex-1">{m.notes || ""}</span>
                <span className="text-muted-foreground">{format(new Date(m.createdAt), "dd/MM HH:mm")}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="files" className="space-y-2 mt-3">
          <AttachmentUpload caseId={caseRow.id} w={w} />
          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem anexos.</p>
          ) : attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs">
              <span className="flex-1 truncate">{a.fileName}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={async () => {
                  try { const url = await w.downloadAttachment(a); window.open(url, "_blank"); }
                  catch (e: any) { toast.error(e?.message || "Falha"); }
                }}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                onClick={async () => {
                  if (!confirmWithScroll("Remover anexo?")) return;
                  try { await w.deleteAttachment(a); toast.success("Anexo removido"); }
                  catch (e: any) { toast.error(e?.message || "Falha"); }
                }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-1.5 mt-3">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem eventos.</p>
          ) : history.map((h) => (
            <div key={h.id} className="rounded-md border border-border/60 p-2 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{eventLabel(h.event)}</span>
                <span className="text-muted-foreground">{format(new Date(h.createdAt), "dd/MM/yyyy HH:mm")}</span>
              </div>
              {(h.fromValue || h.toValue) && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {h.fromValue && <>de <span className="text-foreground">{statusOrText(h.fromValue)}</span> </>}
                  {h.toValue && <>para <span className="text-foreground">{statusOrText(h.toValue)}</span></>}
                </div>
              )}
              {h.actorId && <div className="text-[10px] text-muted-foreground mt-0.5">por {h.actorId.slice(0, 8)}</div>}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <DialogFooter className="pt-2">
        <Button data-mutation
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={async () => {
            if (!confirmWithScroll("Excluir esta garantia? Movimentações de estoque NÃO serão revertidas.")) return;
            try { await w.deleteCase(caseRow.id); toast.success("Garantia excluída"); }
            catch (e: any) { toast.error(e?.message || "Falha"); }
          }}
        >Excluir garantia</Button>
      </DialogFooter>
    </div>
  );
}

function MovementForm({
  caseRow, items, products, w,
}: {
  caseRow: WarrantyCase;
  items: ReturnType<typeof useWarranty>["items"];
  products: Product[];
  w: ReturnType<typeof useWarranty>;
}) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [itemId, setItemId] = useState<string>(items[0]?.id || "");
  const [productId, setProductId] = useState<string>(items[0]?.productId || "");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedProduct = products.find(p => p.id === productId);
  const currentStock = selectedProduct?.stock ?? 0;

  const submit = async () => {
    const n = Number(qty);
    if (!isFinite(n) || n <= 0) { toast.error("Quantidade inválida"); return; }
    const pid = productId || items.find((i) => i.id === itemId)?.productId || null;
    if (!pid) { toast.error("Selecione um produto cadastrado"); return; }
    setBusy(true);
    try {
      await w.recordMovement({
        caseId: caseRow.id, itemId: itemId || null, productId: pid,
        direction, quantity: n, notes: notes.trim() || null,
      });
      toast.success(direction === "in" ? "Entrada registrada" : "Saída registrada");
      setQty("1"); setNotes("");
    } catch (e: any) {
      toast.error(e?.message || "Falha");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2">
      <div className="grid grid-cols-1 gap-2">
        <div>
          <Label className="text-[11px]">Produto para movimentar</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione um produto..." />
            </SelectTrigger>
            <SelectContent>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} (Estoque: {p.stock})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {productId && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Estoque atual disponível: <span className="font-semibold text-foreground">{currentStock}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Tipo</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Entrada (retorno ao estoque)</SelectItem>
              <SelectItem value="out">Saída (substituição)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Quantidade</Label>
          <Input type="number" min="0" step="1" className="h-8 text-xs" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label className="text-[11px]">Item da garantia (vínculo)</Label>
        <Select value={itemId} onValueChange={(v) => {
          setItemId(v);
          const found = items.find((i) => i.id === v);
          if (found?.productId) setProductId(found.productId);
        }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Opcional" /></SelectTrigger>
          <SelectContent>
            {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.productName} ({it.quantity})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Input className="h-8 text-xs" placeholder="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      
      <Button data-mutation size="sm" onClick={submit} disabled={busy} className="w-full">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : direction === "in" ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
        {direction === "in" ? "Registrar Entrada" : "Registrar Saída"}
      </Button>
    </div>
  );
}

function AttachmentUpload({ caseId, w }: { caseId: string; w: ReturnType<typeof useWarranty> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 p-3 text-xs cursor-pointer hover:bg-muted/30">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      Enviar arquivo
      <input
        type="file"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 20 * 1024 * 1024) { toast.error("Máx. 20MB"); return; }
          setBusy(true);
          try { await w.uploadAttachment(caseId, f); toast.success("Anexo enviado"); }
          catch (err: any) { toast.error(err?.message || "Falha"); }
          finally { setBusy(false); (e.target as HTMLInputElement).value = ""; }
        }}
      />
    </label>
  );
}

function NewWarrantyDialog({
  open, onOpenChange, sale, availableQty, defaultProduct, defaultName, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: Sale;
  availableQty: number;
  defaultProduct?: Product;
  defaultName: string;
  onSubmit: (input: { reason?: string | null; notes?: string | null; items: { productId: string | null; productName: string; quantity: number }[] }) => Promise<void>;
}) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova garantia</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 text-xs">
            <div className="font-medium">{defaultName}</div>
            <div className="text-muted-foreground">Disponível para garantia: <span className="font-semibold tabular-nums text-foreground">{availableQty}</span></div>
          </div>
          <div>
            <Label className="text-xs">Quantidade</Label>
            <Input type="number" min="1" max={String(availableQty)} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: defeito de fabricação" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const n = Number(qty);
              if (!isFinite(n) || n <= 0) { toast.error("Quantidade inválida"); return; }
              if (n > availableQty) { toast.error(`Máximo: ${availableQty}`); return; }
              setBusy(true);
              try {
                await onSubmit({
                  reason: reason.trim() || null,
                  notes: notes.trim() || null,
                  items: [{ productId: defaultProduct?.id || sale.productId || null, productName: defaultName, quantity: n }],
                });
              } finally { setBusy(false); }
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Abrir garantia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function eventLabel(e: string) {
  const map: Record<string, string> = {
    created: "Garantia criada",
    status_changed: "Status alterado",
    note_added: "Observação atualizada",
    movement_added: "Movimentação registrada",
    attachment_added: "Anexo enviado",
    attachment_deleted: "Anexo removido",
  };
  return map[e] || e;
}

function statusOrText(v: string) {
  return (WARRANTY_STATUS_LABEL as any)[v] || v;
}

function toneClass(tone: string) {
  switch (tone) {
    case "success": return "border-success/30 text-success bg-success/10";
    case "warning": return "border-warning/30 text-warning bg-warning/10";
    case "destructive": return "border-destructive/30 text-destructive bg-destructive/10";
    case "secondary": return "border-muted-foreground/30 text-muted-foreground bg-muted/40";
    default: return "border-primary/30 text-primary bg-primary/10";
  }
}
