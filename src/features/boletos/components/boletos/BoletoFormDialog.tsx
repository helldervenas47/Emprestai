import { useEffect, useState } from "react";
import { Upload, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  parseLinhaDigitavel, formatLinhaDigitavel, type ParsedBoleto,
} from "@/features/boletos/lib/boleto/parseLinhaDigitavel";
import { parsePixBrCode } from "@/features/boletos/lib/boleto/pixBrCode";
import { useMyBoletos, type MyBoleto } from "@/features/boletos/hooks/useMyBoletos";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const BOLETO_CATEGORIES = [
  "Moradia", "Energia", "Água", "Internet", "Telefone", "Educação",
  "Saúde", "Transporte", "Imposto", "Cartão", "Financiamento", "Outros",
];

interface DraftForm {
  digits: string;
  description: string;
  beneficiary: string;
  category: string;
  amount: string;
  dueDate: string;
  notes: string;
  parsed: ParsedBoleto | null;
  attachmentFile: File | null;
  attachmentPath: string | null;
  pix_brcode: string;
  status: "pendente" | "pago";
  paidAt: string;
}

const emptyDraft: DraftForm = {
  digits: "", description: "", beneficiary: "", category: "Outros",
  amount: "", dueDate: "", notes: "", parsed: null,
  attachmentFile: null, attachmentPath: null, pix_brcode: "",
  status: "pendente", paidAt: "",
};

function autoDescription(p: ParsedBoleto | null, pixName?: string): string {
  if (!p) return "";
  if (pixName) return pixName;
  if (p.kind === "bancario") return `Boleto ${p.bankName ?? "bancário"}`.trim();
  return `Conta — ${p.segmentLabel ?? "Arrecadação"}`;
}
function autoCategory(p: ParsedBoleto | null): string {
  if (!p) return "Outros";
  if (p.kind === "arrecadacao") {
    switch (p.segment) {
      case "1": return "Imposto";
      case "2": return "Água";
      case "3": return "Energia";
      case "4": return "Internet";
      case "7": return "Transporte";
      default: return "Outros";
    }
  }
  return "Outros";
}
function autoBeneficiary(p: ParsedBoleto | null, pixName?: string): string {
  if (pixName) return pixName;
  if (!p) return "";
  if (p.kind === "bancario") return p.bankName ?? "";
  return p.segmentLabel ?? "";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: MyBoleto | null;
  /** Called with the saved boleto id (create or edit). */
  onSaved?: (id: string) => void;
  /** Prefill values when creating. */
  initialDraft?: Partial<DraftForm>;
}

export function BoletoFormDialog({
  open, onOpenChange, editing, onSaved, initialDraft,
}: Props) {
  const { add, update, uploadAttachment } = useMyBoletos();
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDraft({
        digits: editing.digits ?? "",
        description: editing.description,
        beneficiary: editing.beneficiary ?? "",
        category: editing.category ?? "Outros",
        amount: editing.amount ? String(editing.amount) : "",
        dueDate: editing.due_date ?? "",
        notes: editing.notes ?? "",
        parsed: null,
        attachmentFile: null,
        attachmentPath: editing.attachment_path,
        pix_brcode: editing.pix_brcode ?? "",
        status: editing.status === "pago" ? "pago" : "pendente",
        paidAt: editing.paid_at ?? "",
      });
    } else {
      setDraft({ ...emptyDraft, ...(initialDraft ?? {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const handleParseDigits = (text: string) => {
    const out = parseLinhaDigitavel(text);
    if ("error" in out) { setDraft((d) => ({ ...d, digits: text, parsed: null })); return; }
    const pix = draft.pix_brcode ? parsePixBrCode(draft.pix_brcode) : null;
    const pixName = pix?.valid ? pix.merchantName : undefined;
    setDraft((d) => ({
      ...d,
      digits: text, parsed: out,
      description: d.description.trim() ? d.description : autoDescription(out, pixName),
      beneficiary: d.beneficiary.trim() ? d.beneficiary : autoBeneficiary(out, pixName),
      category: d.category && d.category !== "Outros" ? d.category : autoCategory(out),
      amount: d.amount || (out.amount > 0 ? String(out.amount) : ""),
      dueDate: d.dueDate || (out.dueDate ?? ""),
      notes: d.notes,
    }));
  };

  const applySuggestion = () => {
    if (!draft.parsed) return;
    const pix = draft.pix_brcode ? parsePixBrCode(draft.pix_brcode) : null;
    const pixName = pix?.valid ? pix.merchantName : undefined;
    setDraft((d) => ({
      ...d,
      description: autoDescription(d.parsed, pixName),
      beneficiary: autoBeneficiary(d.parsed, pixName),
      category: autoCategory(d.parsed),
    }));
    toast.success("Descrição preenchida com base no boleto");
  };

  const onFileSelected = async (file: File) => {
    setDraft((d) => ({ ...d, attachmentFile: file }));
    const m = file.name.replace(/\D+/g, "");
    if (m.length === 47 || m.length === 48 || m.length === 44) {
      handleParseDigits(m);
      toast.success("Linha digitável detectada no arquivo");
    }
  };

  const handleSave = async () => {
    if (!draft.description.trim()) { toast.error("Informe uma descrição"); return; }
    setSaving(true);
    try {
      let attachment_path = draft.attachmentPath;
      if (draft.attachmentFile) attachment_path = await uploadAttachment(draft.attachmentFile);
      const digits = draft.digits.replace(/\D+/g, "") || null;
      const parsed = digits ? parseLinhaDigitavel(digits) : null;
      const valid = parsed && !("error" in parsed) ? parsed : null;
      const isPago = draft.status === "pago";
      const paidAt = isPago ? (draft.paidAt || new Date().toISOString().slice(0, 10)) : null;
      const payload = {
        description: draft.description.trim(),
        beneficiary: draft.beneficiary.trim() || null,
        category: draft.category || null,
        amount: Number(draft.amount.replace(",", ".")) || 0,
        due_date: draft.dueDate || null,
        paid_at: paidAt,
        status: draft.status,
        digits,
        barcode: valid?.barcode ?? null,
        bank_code: valid?.bankCode ?? null,
        bank_name: valid?.bankName ?? null,
        segment: valid?.segment ?? null,
        segment_label: valid?.segmentLabel ?? null,
        kind: valid?.kind ?? null,
        notes: draft.notes.trim() || null,
        attachment_path,
        pix_brcode: draft.pix_brcode.trim() || null,
      };
      let id: string;
      if (editing) {
        await update(editing.id, payload);
        id = editing.id;
        toast.success("Boleto atualizado");
      } else {
        id = await add(payload);
        toast.success("Boleto cadastrado");
      }
      onSaved?.(id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar boleto");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100%-1rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 z-[2147483651]"
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Editar boleto" : "Novo boleto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Linha digitável ou código de barras (opcional)</Label>
            <Textarea value={draft.digits}
              onChange={(e) => setDraft((d) => ({ ...d, digits: e.target.value }))}
              onBlur={(e) => handleParseDigits(e.target.value)}
              placeholder="47 ou 48 dígitos — preenche descrição, valor e vencimento automaticamente"
              className="font-mono text-xs min-h-[60px]" />
            {draft.parsed && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                <div className="text-[11px] text-muted-foreground truncate">
                  Detectado: <span className="text-foreground font-medium">{autoDescription(draft.parsed)}</span>
                  {draft.parsed.amount > 0 && ` · ${BRL(draft.parsed.amount)}`}
                </div>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={applySuggestion}>
                  Usar sugestão
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição *</Label>
            <Input value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Ex.: Aluguel novembro" />
            <p className="text-[10px] text-muted-foreground">
              Boletos com o mesmo nome ficam agrupados na pasta automaticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Beneficiário</Label>
              <Input value={draft.beneficiary}
                onChange={(e) => setDraft((d) => ({ ...d, beneficiary: e.target.value }))}
                placeholder="Empresa / pessoa" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[2147483652]">
                  {BOLETO_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" inputMode="decimal" value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vencimento</Label>
              <DatePickerField value={draft.dueDate}
                onChange={(v) => setDraft((d) => ({ ...d, dueDate: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Situação</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => ({
                  ...d,
                  status: v as "pendente" | "pago",
                  paidAt: v === "pago" ? (d.paidAt || new Date().toISOString().slice(0, 10)) : "",
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[2147483652]">
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.status === "pago" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pago em</Label>
                <DatePickerField value={draft.paidAt}
                  onChange={(v) => setDraft((d) => ({ ...d, paidAt: v }))} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="min-h-[60px]" placeholder="Notas internas, número do contrato, etc." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Anexo (PDF ou imagem do boleto)</Label>
            <div className="flex items-center gap-2 min-w-0">
              <Input type="file" accept="application/pdf,image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
                className="text-xs min-w-0 flex-1" />
              {draft.attachmentFile && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  <Upload className="h-3 w-3" /> {draft.attachmentFile.name.slice(0, 20)}
                </Badge>
              )}
              {!draft.attachmentFile && draft.attachmentPath && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  <Paperclip className="h-3 w-3" /> Anexo atual
                </Badge>
              )}
            </div>
          </div>
          {draft.parsed && (
            <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground font-mono break-all">
              {formatLinhaDigitavel(draft.parsed.digits)}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
