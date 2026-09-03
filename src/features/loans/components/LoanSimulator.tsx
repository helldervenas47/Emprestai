import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  Settings as SettingsIcon,
  Save,
  FileDown,
  Wallet,
  TrendingDown,
  TrendingUp,
  Sparkles,
  History,
  X,
  Download,
  Share2,
} from "lucide-react";

import { toast } from "sonner";
import { useLoanSimulations } from "@/features/loans/hooks/useLoanSimulations";
import { computeScenario, computeHighlights, formatBRL, newScenario, frequencyLabel } from "@/features/loans/lib/loanSimulation";
import type { LoanSimulation, SimulationScenario, ScenarioComputed } from "@/types/loanSimulation";
import type { Client } from "@/types/loan";
import { generateSimulationPdf } from "@/lib/simulationPdf";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  /** Called with prefill payload when user clicks "Criar empréstimo com este cenário". */
  onCreateLoanFromScenario?: (prefill: {
    clientId: string | null;
    clientName: string;
    amount: number;
    interestRate: number;
    installments: number;
    customInstallmentValue?: number | null;
    /** When true, Index should auto-create the client using clientName before opening the loan form. */
    autoCreateClient?: boolean;
  }) => void;
}

export function LoanSimulator({ open, onOpenChange, clients, onCreateLoanFromScenario }: Props) {
  const { simulations, settings, saveSimulation, deleteSimulation, updateSettings } = useLoanSimulations();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [quickClientName, setQuickClientName] = useState("");
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([newScenario()]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [retentionInput, setRetentionInput] = useState(settings.retentionDays.toString());
  const [saving, setSaving] = useState(false);

  useEffect(() => setRetentionInput(settings.retentionDays.toString()), [settings.retentionDays]);

  const computed: ScenarioComputed[] = useMemo(() => scenarios.map(computeScenario), [scenarios]);
  const highlights = useMemo(() => computeHighlights(computed), [computed]);

  const effectiveClientName = useMemo(() => {
    if (clientId) return clients.find((c) => c.id === clientId)?.name || "";
    return quickClientName.trim();
  }, [clientId, quickClientName, clients]);

  function reset() {
    setEditingId(null);
    setName("");
    setNotes("");
    setClientId(null);
    setQuickClientName("");
    setScenarios([newScenario()]);
    setChosenId(null);
  }

  function updateScenario(id: string, patch: Partial<SimulationScenario>) {
    setScenarios((prev) => prev.map((s) => (s.id === id ? computeScenario({ ...s, ...patch } as SimulationScenario) : s)));
  }

  function addScenario() {
    setScenarios((prev) => [...prev, newScenario()]);
  }

  function duplicateScenario(id: string) {
    setScenarios((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const copy: SimulationScenario = { ...prev[idx], id: crypto.randomUUID() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function removeScenario(id: string) {
    setScenarios((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
    if (chosenId === id) setChosenId(null);
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveSimulation({
      id: editingId ?? undefined,
      clientId,
      name: name || null,
      notes: notes || null,
      scenarios: computed.map((s) => ({
        id: s.id,
        label: s.label,
        amount: s.amount,
        monthlyRate: s.monthlyRate,
        installments: s.installments,
        installmentValue: s.installmentValue,
        interestModel: s.interestModel,
        calcMode: s.calcMode,
        frequency: s.frequency,
      })),
      chosenScenarioId: chosenId,
    });
    setSaving(false);
    if (result) {
      setEditingId(result.id);
      toast.success("Simulação salva");
    }
  }

  function loadSimulation(sim: LoanSimulation) {
    setEditingId(sim.id);
    setName(sim.name || "");
    setNotes(sim.notes || "");
    setClientId(sim.clientId);
    setQuickClientName("");
    setScenarios(sim.scenarios.length ? sim.scenarios : [newScenario()]);
    setChosenId(sim.chosenScenarioId);
    setShowHistory(false);
  }

  async function handleExportPdf(mode: "download" | "share" = "download") {
    // PDF agora exporta TODOS os cenários — o cenário escolhido, se houver, vem destacado.
    let simToExport: LoanSimulation;
    if (editingId) {
      const found = simulations.find((s) => s.id === editingId);
      if (!found) {
        toast.error("Salve a simulação antes de exportar");
        return;
      }
      simToExport = { ...found, scenarios: computed, chosenScenarioId: chosenId, notes };
    } else {
      const saved = await saveSimulation({
        clientId,
        name: name || null,
        notes: notes || null,
        scenarios: computed,
        chosenScenarioId: chosenId,
      });
      if (!saved) return;
      setEditingId(saved.id);
      simToExport = saved;
    }
    const client = clients.find((c) => c.id === clientId);
    const args = {
      simulation: simToExport,
      clientName: client?.name || effectiveClientName || undefined,
      clientPhone: client?.phone,
    };

    if (mode === "download") {
      await generateSimulationPdf({ ...args, output: "save" });
      return;
    }

    // share
    try {
      const result = await generateSimulationPdf({ ...args, output: "blob" });
      if (!result) return;
      const file = new File([result.blob], result.fileName, { type: "application/pdf" });
      const navAny = navigator as any;
      const canShareFiles =
        typeof navAny.canShare === "function" &&
        typeof navAny.share === "function" &&
        (() => {
          try { return navAny.canShare({ files: [file] }); } catch { return false; }
        })();

      if (canShareFiles) {
        try {
          await navAny.share({
            files: [file],
            title: "Simulação de Empréstimo",
            text: args.clientName ? `Simulação para ${args.clientName}` : "Simulação de Empréstimo",
          });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          // Se falhar (ex.: bloqueio de permissão), cai no fallback abaixo
          console.warn("navigator.share falhou, usando fallback:", err);
        }
      }

      // Fallback: baixa o PDF e abre WhatsApp com mensagem-resumo pronta
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Monta resumo curto da simulação para texto do WhatsApp
      const chosen = computed.find((s) => s.id === chosenId);
      const lines: string[] = [];
      lines.push(`*Simulação de Empréstimo*${args.clientName ? ` — ${args.clientName}` : ""}`);
      if (chosen) {
        lines.push("");
        lines.push(`💰 Valor: ${formatBRL(chosen.amount)}`);
        lines.push(`📅 ${chosen.installments}x de ${formatBRL(chosen.installmentValue)}`);
        lines.push(`📈 Taxa: ${chosen.monthlyRate.toFixed(2)}% a.m.`);
        lines.push(`💳 Total: ${formatBRL(chosen.totalPayable)}`);
      } else {
        lines.push(`${computed.length} cenário(s) simulado(s).`);
      }
      lines.push("");
      lines.push("📎 PDF em anexo.");
      const text = encodeURIComponent(lines.join("\n"));
      const phone = (client?.phone || "").replace(/\D/g, "");
      const waUrl = phone
        ? `https://wa.me/${phone.length <= 11 ? "55" + phone : phone}?text=${text}`
        : `https://wa.me/?text=${text}`;

      toast.info("PDF baixado. Abrindo WhatsApp para você anexar o arquivo manualmente.");
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error(err);
      toast.error("Erro ao compartilhar PDF");
    }
  }

  function handleCreateLoan() {
    if (!chosenId) {
      toast.error("Selecione um cenário primeiro");
      return;
    }
    const sc = computed.find((s) => s.id === chosenId);
    if (!sc) return;
    const client = clients.find((c) => c.id === clientId);
    const typedName = quickClientName.trim();
    const needsAutoCreate = !clientId && typedName.length > 0;

    if (!clientId && !typedName) {
      toast.error("Informe o cliente ou digite um nome");
      return;
    }

    onCreateLoanFromScenario?.({
      clientId,
      clientName: client?.name || typedName,
      amount: sc.amount,
      interestRate: sc.monthlyRate,
      installments: sc.installments,
      customInstallmentValue: sc.calcMode === "manual" ? sc.installmentValue : null,
      autoCreateClient: needsAutoCreate,
    });
    onOpenChange(false);
  }

  async function handleSaveSettings() {
    const days = Math.max(1, Math.min(3650, parseInt(retentionInput) || 90));
    await updateSettings({ retentionDays: days });
    setShowSettings(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Simulador de Empréstimo
              </DialogTitle>
              <DialogDescription>
                Crie cenários, compare lado a lado e converta direto em empréstimo.
              </DialogDescription>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} className="gap-1.5">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Histórico</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings((v) => !v)} className="gap-1.5">
                <SettingsIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Config</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {showSettings && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <Label className="text-xs">Tempo de armazenamento das simulações (dias)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={3650}
                value={retentionInput}
                onChange={(e) => setRetentionInput(e.target.value)}
                className="h-9 max-w-[140px]"
              />
              <Button size="sm" onClick={handleSaveSettings}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)}>Cancelar</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Após esse período, as simulações são automaticamente ocultadas.
            </p>
          </div>
        )}

        {showHistory && (
          <div className="rounded-lg border border-border/60 p-3 max-h-[300px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Simulações salvas ({simulations.length})</p>
              <Button size="sm" variant="ghost" onClick={() => { reset(); setShowHistory(false); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova
              </Button>
            </div>
            {simulations.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma simulação salva.</p>
            )}
            <div className="space-y-1.5">
              {simulations.map((sim) => {
                const cli = clients.find((c) => c.id === sim.clientId);
                return (
                  <div
                    key={sim.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border border-border/40 p-2 hover:bg-muted/40",
                      editingId === sim.id && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <button type="button"
                      onClick={() => loadSimulation(sim)}
                      className="flex-1 text-left text-xs"
                    >
                      <p className="font-medium">{sim.name || cli?.name || "Sem título"}</p>
                      <p className="text-muted-foreground">
                        {new Date(sim.simulationDate).toLocaleDateString("pt-BR")} · {sim.scenarios.length} cenário(s)
                      </p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteSimulation(sim.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cabeçalho da simulação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <Select
              value={clientId ?? "__none__"}
              onValueChange={(v) => {
                setClientId(v === "__none__" ? null : v);
                if (v !== "__none__") setQuickClientName("");
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecionar cliente cadastrado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Cliente novo (digitar nome) —</SelectItem>
                {clients
                  .filter((c) => c.active !== false)
                  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {!clientId && (
              <Input
                value={quickClientName}
                onChange={(e) => setQuickClientName(e.target.value)}
                placeholder="Digite o nome do cliente"
                className="h-10 mt-1.5"
              />
            )}
            {!clientId && quickClientName.trim() && (
              <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                Cadastro será criado automaticamente ao confirmar o empréstimo
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome da simulação</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Proposta João — Maio"
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações internas"
              className="h-10"
            />
          </div>
        </div>

        {/* Scenarios — mobile: stacked full-width; tablet: 2-col grid; desktop: horizontal scroll */}
        {/* Mobile (stacked) */}
        <div className="md:hidden space-y-3">
          {computed.map((s, idx) => (
            <ScenarioCard
              key={s.id}
              index={idx}
              scenario={s}
              isChosen={chosenId === s.id}
              isLowestTotal={highlights.lowestTotalId === s.id}
              isLowestInstallment={highlights.lowestInstallmentId === s.id}
              isHighestReturn={highlights.highestReturnId === s.id}
              isBestApproval={highlights.bestApprovalId === s.id}
              isBestReturn={highlights.bestReturnId === s.id}
              canRemove={scenarios.length > 1}
              fullWidth
              onChange={(p) => updateScenario(s.id, p)}
              onChoose={() => setChosenId((prev) => (prev === s.id ? null : s.id))}
              onDuplicate={() => duplicateScenario(s.id)}
              onRemove={() => removeScenario(s.id)}
            />
          ))}
          <button type="button"
            onClick={addScenario}
            className="w-full min-h-[80px] rounded-xl border-2 border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary py-4"
          >
            <Plus className="h-5 w-5" />
            Adicionar cenário
          </button>
        </div>

        {/* Tablet (2-col grid) */}
        <div className="hidden md:grid lg:hidden grid-cols-2 gap-3">
          {computed.map((s, idx) => (
            <ScenarioCard
              key={s.id}
              index={idx}
              scenario={s}
              isChosen={chosenId === s.id}
              isLowestTotal={highlights.lowestTotalId === s.id}
              isLowestInstallment={highlights.lowestInstallmentId === s.id}
              isHighestReturn={highlights.highestReturnId === s.id}
              isBestApproval={highlights.bestApprovalId === s.id}
              isBestReturn={highlights.bestReturnId === s.id}
              canRemove={scenarios.length > 1}
              fullWidth
              onChange={(p) => updateScenario(s.id, p)}
              onChoose={() => setChosenId((prev) => (prev === s.id ? null : s.id))}
              onDuplicate={() => duplicateScenario(s.id)}
              onRemove={() => removeScenario(s.id)}
            />
          ))}
          <button type="button"
            onClick={addScenario}
            className="min-h-[400px] rounded-xl border-2 border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            Adicionar cenário
          </button>
        </div>

        {/* Desktop (horizontal scroll) */}
        <ScrollArea className="hidden lg:block w-full rounded-lg border border-border/40 bg-muted/10">
          <div className="flex gap-3 p-3 min-w-min">
            {computed.map((s, idx) => (
              <ScenarioCard
                key={s.id}
                index={idx}
                scenario={s}
                isChosen={chosenId === s.id}
                isLowestTotal={highlights.lowestTotalId === s.id}
                isLowestInstallment={highlights.lowestInstallmentId === s.id}
                isHighestReturn={highlights.highestReturnId === s.id}
                isBestApproval={highlights.bestApprovalId === s.id}
                isBestReturn={highlights.bestReturnId === s.id}
                canRemove={scenarios.length > 1}
                onChange={(p) => updateScenario(s.id, p)}
                onChoose={() => setChosenId((prev) => (prev === s.id ? null : s.id))}
                onDuplicate={() => duplicateScenario(s.id)}
                onRemove={() => removeScenario(s.id)}
              />
            ))}
            <button type="button"
              onClick={addScenario}
              className="flex-shrink-0 w-[280px] min-h-[400px] rounded-xl border-2 border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              <Plus className="h-5 w-5" />
              Adicionar cenário
            </button>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-[25px] h-[25px] mr-1" /> Fechar
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {editingId ? "Atualizar" : "Salvar"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportPdf("download")}>
                  <Download className="h-4 w-4 mr-2" /> Baixar PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPdf("share")}>
                  <Share2 className="h-4 w-4 mr-2" /> Compartilhar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleCreateLoan} disabled={!chosenId} className="gap-1.5">
              <Wallet className="h-4 w-4" />
              Criar Empréstimo com este cenário
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CardProps {
  index: number;
  scenario: ScenarioComputed;
  isChosen: boolean;
  isLowestTotal: boolean;
  isLowestInstallment: boolean;
  isHighestReturn: boolean;
  isBestApproval: boolean;
  isBestReturn: boolean;
  canRemove: boolean;
  fullWidth?: boolean;
  onChange: (patch: Partial<SimulationScenario>) => void;
  onChoose: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function ScenarioCard({
  index,
  scenario,
  isChosen,
  isLowestTotal,
  isLowestInstallment,
  isHighestReturn,
  isBestApproval,
  isBestReturn,
  canRemove,
  fullWidth,
  onChange,
  onChoose,
  onDuplicate,
  onRemove,
}: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card transition-all",
        fullWidth ? "w-full" : "flex-shrink-0 w-[300px]",
        isChosen
          ? "border-success shadow-[0_0_0_4px_hsl(var(--success)/0.2)] ring-1 ring-success/40 bg-success/5"
          : "border-border/60 hover:border-border",
      )}
    >
      {isChosen && (
        <div className="absolute -top-2.5 -right-2.5 z-10 bg-success text-success-foreground rounded-full px-2 py-0.5 text-[10px] font-bold shadow-md flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> ESCOLHIDO
        </div>
      )}
      <div className="p-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">Cenário {index + 1}</Badge>
          {isChosen && (
            <Badge className="bg-success text-success-foreground text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> Escolhido
            </Badge>
          )}
        </div>
        <div className="flex gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {canRemove && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Modo */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Modo</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={scenario.calcMode}
              onValueChange={(v) => v && onChange({ calcMode: v as any })}
              className="border rounded-md p-0.5"
            >
              <ToggleGroupItem value="auto" className="h-7 text-[10px] px-2 flex-1">Auto</ToggleGroupItem>
              <ToggleGroupItem value="manual" className="h-7 text-[10px] px-2 flex-1">Manual</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Juros</Label>
            <Select value={scenario.interestModel} onValueChange={(v) => onChange({ interestModel: v as any })}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simples</SelectItem>
                <SelectItem value="compound">Composto (Price)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Valor */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Valor emprestado</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={scenario.amount || ""}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
            className="h-9 text-sm tabular-nums"
          />
        </div>

        {/* Frequência de pagamento */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Frequência de pagamento</Label>
          <Select
            value={scenario.frequency || "monthly"}
            onValueChange={(v) => onChange({ frequency: v as any })}
          >
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal (1x/mês)</SelectItem>
              <SelectItem value="biweekly">Quinzenal (2x/mês)</SelectItem>
              <SelectItem value="weekly">Semanal (4x/mês)</SelectItem>
              <SelectItem value="daily">Diária (30x/mês)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Taxa e parcelas */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Taxa mensal (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={scenario.monthlyRate || ""}
              onChange={(e) => onChange({ monthlyRate: parseFloat(e.target.value) || 0 })}
              className="h-9 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Parcelas</Label>
            <Input
              type="number"
              min={1}
              step="1"
              value={scenario.installments || ""}
              onChange={(e) => onChange({ installments: parseInt(e.target.value) || 1 })}
              className="h-9 text-sm tabular-nums"
            />
          </div>
        </div>

        {/* Taxa equivalente por parcela */}
        <div className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-[10.5px] flex items-center justify-between">
          <span className="text-muted-foreground">
            Taxa equivalente ({frequencyLabel(scenario.frequency)})
          </span>
          <span className="tabular-nums font-semibold text-primary">
            {scenario.periodRate.toFixed(2)}% / parcela
          </span>
        </div>

        {/* Parcela calculada/editável */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Valor da parcela {scenario.calcMode === "auto" ? "(calculado)" : "(manual)"}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={scenario.installmentValue || ""}
            onChange={(e) => onChange({ installmentValue: parseFloat(e.target.value) || 0, calcMode: "manual" })}
            className={cn(
              "h-9 text-sm tabular-nums font-semibold",
              scenario.calcMode === "auto" && "bg-muted/50",
            )}
          />
        </div>

        <Separator />

        {/* Resumo */}
        <div className="space-y-1.5 text-[11px]">
          <Row label="Juros mensal" value={formatBRL(scenario.monthlyInterestValue)} />
          <Row label="Total de juros" value={formatBRL(scenario.totalInterest)} highlight={isHighestReturn} />
          <Row
            label="Total a pagar"
            value={formatBRL(scenario.totalPayable)}
            bold
            highlight={isLowestTotal}
            highlightClass="text-success"
          />
        </div>

        <Button
          variant={isChosen ? "success" : "outline"}
          size="sm"
          className="w-full gap-1.5 h-8 text-xs"
          onClick={onChoose}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isChosen ? "Escolhido pelo cliente" : "Marcar como escolhido"}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
  highlightClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
  highlightClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold && "font-semibold",
          highlight && (highlightClass || "text-primary font-semibold"),
        )}
      >
        {value}
      </span>
    </div>
  );
}
