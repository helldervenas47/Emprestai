import { useState, useMemo, useCallback, useDeferredValue, memo, lazy, Suspense } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Checkbox } from "@/components/ui/checkbox";
import { Client, Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { X, Check, ToggleLeft, ToggleRight, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, Clock, CalendarDays, TrendingUp, AlertTriangle, Users, Search, Wallet, Sparkles, Shield, SlidersHorizontal } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useCreditLimits } from "@/features/creditCards/hooks/useCreditLimits";
import { computeAvailableLimit, computeUsedLimit, formatBRL } from "@/features/creditCards/lib/creditLimit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAllClientDocumentCounts } from "@/features/clients/hooks/useAllClientDocumentCounts";
import { formatCPF, formatRG, onlyDigits, isValidCPF, isValidCNPJ } from "@/lib/brDocuments";
import { toast } from "sonner";
import { ClientCardView } from "@/features/clients/components/ClientCardView";
import { getVisibleClients, type ClientStatusFilter, type ClientSortOption } from "@/features/clients/utils/clientListLogic";
import { getClientRiskScoreInfo } from "@/features/clients/lib/clientRiskScore";
import { getClientLoans, buildRiskProfile, getClientRiskMetrics } from "@/features/loans/lib/clientRisk";

// P1 perf: dialogs pesados carregam sob demanda — reduz bundle inicial da aba.
const ClientDetailDialog = lazy(() => import("@/features/clients/components/ClientDetailDialog").then(m => ({ default: m.ClientDetailDialog })));
const CreditLimitDialog = lazy(() => import("@/features/creditCards/components/CreditLimitDialog").then(m => ({ default: m.CreditLimitDialog })));
const RecentLimitAdjustmentsDialog = lazy(() => import("@/features/creditCards/components/RecentLimitAdjustmentsDialog").then(m => ({ default: m.RecentLimitAdjustmentsDialog })));
const MaxCreditLimitDialog = lazy(() => import("@/features/creditCards/components/MaxCreditLimitDialog").then(m => ({ default: m.MaxCreditLimitDialog })));
const ClientDocuments = lazy(() => import("@/features/clients/components/ClientDocuments").then(m => ({ default: m.ClientDocuments })));

const DocumentsTabTrigger = memo(function DocumentsTabTrigger({ count }: { count: number }) {
  return (
    <TabsTrigger value="docs" className="flex-1">
      Documentos{count > 0 ? ` (${count})` : ""}
    </TabsTrigger>
  );
});

// P1 perf: linha de cliente memoizada — só re-renderiza quando SEUS dados
// mudarem (score, docCount, limite). Digitar na busca não repinta cards.
interface ClientRowProps {
  client: Client;
  score: import("@/features/clients/components/ClientCardView").ClientCardCreditScore;
  docCount: number;
  usedLimit: number;
  creditLimit: import("@/features/creditCards/hooks/useCreditLimits").CreditLimit | null | undefined;
  readOnly?: boolean;
  onEdit: (client: Client) => void;
  onOpenDocs: (client: Client) => void;
  onOpenLimit: (client: Client) => void;
  onOpenAnalysis: (client: Client) => void;
  onToggleActive: (client: Client) => void;
  onDelete: (id: string) => void;
}

const ClientRow = memo(function ClientRow(p: ClientRowProps) {
  return (
    <ClientCardView
      client={p.client}
      score={p.score}
      docCount={p.docCount}
      usedLimit={p.usedLimit}
      creditLimit={p.creditLimit}
      readOnly={p.readOnly}
      onOpenDocs={() => p.onOpenDocs(p.client)}
      onOpenLimit={() => p.onOpenLimit(p.client)}
      onOpenAnalysis={() => p.onOpenAnalysis(p.client)}
      onToggleActive={() => p.onToggleActive(p.client)}
      onEdit={() => p.onEdit(p.client)}
      onDelete={() => p.onDelete(p.client.id)}
    />
  );
});





interface Props {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: import("@/types/loan").InstallmentSchedule[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => void;
}

type StatusFilter = ClientStatusFilter;
type SortOption = ClientSortOption;

const sortLabels: Record<SortOption, string> = {
  "name-asc": "A → Z",
  "name-desc": "Z → A",
  "newest": "Mais recentes",
  "oldest": "Mais antigos",
  "score-desc": "Melhor score",
  "score-asc": "Pior score",
};

import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { LoanRenegotiation } from "@/types/loan";

interface CreditScore {
  score: number;
  label: string;
  color: string;
  bgColor: string;
  totalLoans: number;
  paidLoans: number;
  activeLoans: number;
  overdueLoans: number;
  onTimePayments: number;
  latePayments: number;
  totalPayments: number;
}

function calculateCreditScore(
  client: Client,
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: import("@/types/loan").InstallmentSchedule[] = [],
  referenceDate = new Date(),
  renegotiations: LoanRenegotiation[] = [],
): CreditScore {
  const clientLoansAll = getClientLoans(client, loans);
  if (clientLoansAll.length === 0) {
    return {
      score: 100,
      label: "Sem Histórico",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      totalLoans: 0,
      paidLoans: 0,
      activeLoans: 0,
      overdueLoans: 0,
      onTimePayments: 0,
      latePayments: 0,
      totalPayments: 0,
    };
  }

  const riskProfile = buildRiskProfile(client, clientLoansAll, payments, installmentSchedules, referenceDate, renegotiations);
  const metrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, referenceDate);
  const numScore = riskProfile.historicalScore;
  const info = getClientRiskScoreInfo(numScore);

  return {
    score: info.score,
    label: info.label,
    description: info.description,
    color: info.color,
    bgColor: info.bgColor,
    totalLoans: metrics.activeLoans + metrics.paidLoans,
    paidLoans: metrics.paidLoans,
    activeLoans: metrics.activeLoans,
    overdueLoans: metrics.overdueLoans,
    onTimePayments: metrics.onTimePayments,
    latePayments: metrics.latePayments,
    totalPayments: metrics.totalTimedPayments,
  };
}

export function ClientList({ clients, loans, payments, installmentSchedules, onDelete, onUpdate, readOnly = false }: Props & { readOnly?: boolean }) {
  const [search, setSearch] = useState("");
  // P1 perf: filtragem/ordenação usam o valor "adiado" — teclado permanece 60fps
  // mesmo com centenas de clientes; React agenda o filtro em transição.
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<"data" | "docs">("data");
  const [editForm, setEditForm] = useState<Record<string, any>>({ name: "", phone: "", email: "", cpf: "", cnpj: "", rg: "", address: "", city: "", state: "", score: "", notes: "", isVehicleRental: false, nacionalidade: "", estadoCivil: "", profissao: "", bairro: "", isManager: false, defaultInterestRate: "", creditLimit: "", autoBillingEnabled: true });
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [limitClient, setLimitClient] = useState<Client | null>(null);
  const [recentAdjustOpen, setRecentAdjustOpen] = useState(false);
  const [maxLimitOpen, setMaxLimitOpen] = useState(false);
  const { getLimitForClient, updateLimit, ensureLimit } = useCreditLimits();
  const { renegotiations } = useLoanRenegotiations();
  // P0 perf: 1 query única de contagens de documentos, ao invés de N por card.
  const { counts: docCounts } = useAllClientDocumentCounts();

  const todayStr = todayInAppTz();
  const today = useMemo(() => new Date(todayStr + "T00:00:00"), [todayStr]);

  const creditScores = useMemo(() => {
    const map: Record<string, CreditScore> = {};
    clients.forEach((c) => {
      map[c.id] = calculateCreditScore(c, loans, payments, installmentSchedules, today, renegotiations);
    });
    return map;
  }, [clients, loans, payments, installmentSchedules, today, renegotiations]);

  // P0 perf: cacheia `computeUsedLimit` — antes rodava 2× por card + N vezes
  // no cálculo de overLimit. Agora é O(N·M) uma vez por render.
  const usedLimitByClient = useMemo(() => {
    const map: Record<string, number> = {};
    clients.forEach((c) => {
      map[c.id] = computeUsedLimit(c, loans, payments);
    });
    return map;
  }, [clients, loans, payments]);

  const overLimitClientIds = useMemo(() => {
    const ids = new Set<string>();
    clients.forEach((c) => {
      const lim = getLimitForClient(c.id);
      if (!lim) return;
      const used = usedLimitByClient[c.id] ?? 0;
      if (used > lim.currentLimit && lim.currentLimit >= 0) ids.add(c.id);
    });
    return ids;
  }, [clients, usedLimitByClient, getLimitForClient]);

  // P0 perf: filtro+sort memoizados — antes rodava a cada keystroke E era
  // recomputado a cada re-render pai (hover, toggle, etc.).
  // Lógica pura extraída em `clientListLogic.ts` para permitir testes diretos.
  const filtered = useMemo(
    () =>
      getVisibleClients(clients, deferredSearch, statusFilter, sortOption, {
        overLimitClientIds,
        scoreByClientId: creditScores,
      }),
    [clients, deferredSearch, sortOption, statusFilter, overLimitClientIds, creditScores],
  );

  const { activeCount, inactiveCount } = useMemo(() => {
    let a = 0, i = 0;
    clients.forEach((c) => { if (c.active === false) i++; else a++; });
    return { activeCount: a, inactiveCount: i };
  }, [clients]);
  const overLimitCount = overLimitClientIds.size;


  // P1 perf: callbacks estáveis — evitam invalidar `memo` dos cards a cada render.
  const startEdit = useCallback((client: Client, tab: "data" | "docs" = "data") => {
    setEditingId(client.id);
    setEditingTab(tab);
    const cl = getLimitForClient(client.id);
    setEditForm({ name: client.name, phone: client.phone, email: client.email, cpf: client.cpf, cnpj: client.cnpj || "", rg: client.rg || "", address: client.address, city: client.city || "", state: client.state || "", score: client.score || "", notes: client.notes || "", isVehicleRental: client.isVehicleRental || false, nacionalidade: client.nacionalidade || "", estadoCivil: client.estadoCivil || "", profissao: client.profissao || "", bairro: client.bairro || "", isManager: client.isManager || false, defaultInterestRate: client.defaultInterestRate != null ? String(client.defaultInterestRate) : "", creditLimit: cl?.currentLimit != null ? String(cl.currentLimit) : "", autoBillingEnabled: client.autoBillingEnabled ?? true });
  }, [getLimitForClient]);

  const saveEdit = useCallback(async (id: string) => {
    const { defaultInterestRate, creditLimit, cpf, cnpj, rg, ...rest } = editForm;
    if (cpf && !isValidCPF(cpf)) { toast.error("CPF inválido"); return; }
    if (cnpj && !isValidCNPJ(cnpj)) { toast.error("CNPJ inválido"); return; }
    const parsedRate = (defaultInterestRate ?? "").toString().trim() === "" ? null : parseFloat(defaultInterestRate);
    onUpdate(id, {
      ...rest,
      cpf: onlyDigits(cpf),
      cnpj: onlyDigits(cnpj),
      rg: formatRG(rg),
      defaultInterestRate: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
    });
    const parsedLimit = (creditLimit ?? "").toString().trim() === "" ? null : parseFloat(String(creditLimit).replace(",", "."));
    if (parsedLimit !== null && !isNaN(parsedLimit) && parsedLimit >= 0) {
      const existing = getLimitForClient(id);
      if (!existing) await ensureLimit(id);
      const current = getLimitForClient(id)?.currentLimit ?? 0;
      if (Math.abs(current - parsedLimit) > 0.001) {
        await updateLimit(id, parsedLimit, {
          mode: "manual",
          changeType: "manual",
          reason: "Ajuste manual via edição do cliente",
        });
      }
    }
    setEditingId(null);
  }, [editForm, onUpdate, getLimitForClient, ensureLimit, updateLimit]);

  const handleToggleActive = useCallback(async (client: Client) => {
    const becomingInactive = client.active !== false;
    onUpdate(client.id, { active: !client.active });
    if (becomingInactive) {
      const existing = getLimitForClient(client.id);
      if (existing && existing.currentLimit > 0) {
        await updateLimit(client.id, 0, {
          mode: "manual",
          changeType: "manual",
          reason: "Cliente inativado — limite zerado automaticamente",
        });
      }
    }
  }, [onUpdate, getLimitForClient, updateLimit]);

  const updateField = useCallback((field: string, value: string | boolean) => setEditForm((prev) => ({ ...prev, [field]: value })), []);

  return (
    <div className="space-y-4">
      <div className="hidden sm:flex flex-wrap gap-2">
        {([
          { id: "all" as StatusFilter, label: "Todos", count: clients.length },
          { id: "active" as StatusFilter, label: "Ativos", count: activeCount },
          { id: "inactive" as StatusFilter, label: "Inativos", count: inactiveCount },
        ]).map((opt) => (
          <button type="button"
            key={opt.id}
            onClick={() => setStatusFilter(opt.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
              statusFilter === opt.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:opacity-80"
            }`}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRecentAdjustOpen(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border bg-card border-border text-muted-foreground hover:opacity-80 inline-flex items-center gap-1.5"
          title="Ver clientes com limite ajustado recentemente"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Limites ajustados
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("over-limit")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border inline-flex items-center gap-1.5 ${
            statusFilter === "over-limit"
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-card border-border text-muted-foreground hover:opacity-80"
          }`}
          title="Clientes com empréstimos acima do limite definido"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Acima do limite ({overLimitCount})
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setMaxLimitOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border bg-card border-border text-muted-foreground hover:opacity-80 inline-flex items-center gap-1.5"
            title="Definir limite máximo global"
          >
            <Shield className="h-3.5 w-3.5" />
            Limite máximo
          </button>
        )}
      </div>

      {/* Mobile: single filter dropdown */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 w-full justify-between">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                {statusFilter === "all" && `Todos (${clients.length})`}
                {statusFilter === "active" && `Ativos (${activeCount})`}
                {statusFilter === "inactive" && `Inativos (${inactiveCount})`}
                {statusFilter === "over-limit" && `Acima do limite (${overLimitCount})`}
              </span>
              <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[calc(100%-2rem)] max-w-sm">
            <DropdownMenuItem onClick={() => setStatusFilter("all")}>
              <Users className="h-4 w-4 mr-2" /> Todos ({clients.length})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("active")}>
              <ToggleRight className="h-4 w-4 mr-2" /> Ativos ({activeCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("inactive")}>
              <ToggleLeft className="h-4 w-4 mr-2" /> Inativos ({inactiveCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("over-limit")}>
              <AlertTriangle className="h-4 w-4 mr-2" /> Acima do limite ({overLimitCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRecentAdjustOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Limites ajustados
            </DropdownMenuItem>
            {!readOnly && (
              <DropdownMenuItem onClick={() => setMaxLimitOpen(true)}>
                <Shield className="h-4 w-4 mr-2" /> Limite máximo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5 whitespace-nowrap">
              <ArrowUpDown className="h-4 w-4" />
              <span className="hidden sm:inline">{sortLabels[sortOption]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOption("name-asc")} className="gap-2">
              <ArrowDownAZ className="h-4 w-4" /> A → Z
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("name-desc")} className="gap-2">
              <ArrowUpAZ className="h-4 w-4" /> Z → A
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-desc")} className="gap-2">
              <TrendingUp className="h-4 w-4" /> Melhor score
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-asc")} className="gap-2">
              <AlertTriangle className="h-4 w-4" /> Pior score
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("newest")} className="gap-2">
              <Clock className="h-4 w-4" /> Mais recentes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("oldest")} className="gap-2">
              <CalendarDays className="h-4 w-4" /> Mais antigos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado encontrado"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((client, i) => {
            const cs = creditScores[client.id];
            const docCount = docCounts[client.id] ?? 0;
            // Cap na animação stagger para não passar de ~480ms total.
            const delayMs = Math.min(i, 8) * 40;
            return (
            <div key={client.id} className="animate-fade-in" style={{ animationDelay: `${delayMs}ms`, animationFillMode: 'backwards' }}>
            <Card className={`hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-200 ease-out overflow-hidden ${!client.active ? "opacity-60" : ""}`}>
              <CardContent className="p-3 sm:p-5">
                {editingId === client.id ? (
                  <div className="space-y-3">
                    <div className="flex justify-end">

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancelar"
                        title="Cancelar"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </div>
                    <Tabs value={editingTab} onValueChange={(v) => setEditingTab(v as "data" | "docs")} className="w-full">
                      <TabsList className="w-full">
                        <TabsTrigger value="data" className="flex-1">Dados do Cliente</TabsTrigger>
                        <DocumentsTabTrigger count={docCount} />
                      </TabsList>

                      <TabsContent value="data" className="space-y-3 mt-3">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={editForm.name} onChange={(e) => updateField("name", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">CPF</Label>
                        <Input value={formatCPF(editForm.cpf)} onChange={(e) => updateField("cpf", formatCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                      </div>
                      <div>
                        <Label className="text-xs">Telefone</Label>
                        <Input value={editForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input value={editForm.email} onChange={(e) => updateField("email", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Endereço</Label>
                      <Input value={editForm.address} onChange={(e) => updateField("address", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Taxa de juros padrão (% ao mês)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editForm.defaultInterestRate}
                        onChange={(e) => updateField("defaultInterestRate", e.target.value)}
                        placeholder="30"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Se vazio, será usado 30% em novos empréstimos.
                      </p>
                    </div>
                    {/* Credit Limit edit */}
                    {(() => {
                      const used = usedLimitByClient[client.id] ?? 0;
                      const totalNum = parseFloat(String(editForm.creditLimit).replace(",", ".")) || 0;
                      const available = computeAvailableLimit(totalNum, used);
                      return (
                        <div className="border border-border rounded-lg p-3 space-y-2">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5 text-primary" /> Limite de Crédito
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editForm.creditLimit}
                            onChange={(e) => updateField("creditLimit", e.target.value)}
                            placeholder="0,00"
                            disabled={client.active === false}
                          />
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                              <p className="text-muted-foreground">Utilizado</p>
                              <p className="font-semibold text-warning">{formatBRL(used)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Disponível</p>
                              <p className={`font-semibold ${available < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(available)}</p>
                            </div>
                          </div>
                          {client.active === false && (
                            <p className="text-[10px] text-destructive">
                              Cliente inativo — limite zerado e bloqueado para novas operações.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <Label className="text-xs">Observações</Label>
                      <Textarea value={editForm.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} />
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-manager-${client.id}`}
                          checked={editForm.isManager}
                          onCheckedChange={(checked) => updateField("isManager", !!checked)}
                        />
                        <Label htmlFor={`edit-manager-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Cliente é Gerente
                        </Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                        Habilita receber comissão sobre empréstimos atrelados.
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-autobilling-${client.id}`}
                          checked={editForm.autoBillingEnabled}
                          onCheckedChange={(checked) => updateField("autoBillingEnabled", !!checked)}
                        />
                        <Label htmlFor={`edit-autobilling-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Receber cobrança automática por WhatsApp
                        </Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                        Se desmarcado, nenhum contrato deste cliente será cobrado automaticamente.
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-3 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-vehicle-${client.id}`}
                          checked={editForm.isVehicleRental}
                          onCheckedChange={(checked) => updateField("isVehicleRental", !!checked)}
                        />
                        <Label htmlFor={`edit-vehicle-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Aluguel de Veículos
                        </Label>
                      </div>
                      {editForm.isVehicleRental && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">RG</Label>
                              <Input value={formatRG(editForm.rg)} onChange={(e) => updateField("rg", formatRG(e.target.value))} placeholder="00.000.000-0" inputMode="text" maxLength={15} />
                            </div>
                            <div>
                              <Label className="text-xs">Cidade</Label>
                              <Input value={editForm.city} onChange={(e) => updateField("city", e.target.value)} placeholder="São Paulo" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Nacionalidade</Label>
                              <Input value={editForm.nacionalidade} onChange={(e) => updateField("nacionalidade", e.target.value)} placeholder="Brasileiro(a)" />
                            </div>
                            <div>
                              <Label className="text-xs">Estado Civil</Label>
                              <Input value={editForm.estadoCivil} onChange={(e) => updateField("estadoCivil", e.target.value)} placeholder="Solteiro(a)" />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Profissão</Label>
                            <Input value={editForm.profissao} onChange={(e) => updateField("profissao", e.target.value)} placeholder="Motorista" />
                          </div>
                          <div>
                            <Label className="text-xs">Bairro</Label>
                            <Input value={editForm.bairro} onChange={(e) => updateField("bairro", e.target.value)} placeholder="Centro" />
                          </div>
                        </div>
                      )}
                    </div>
                      </TabsContent>
                      <TabsContent value="docs" className="mt-3">
                        <Suspense fallback={<div className="text-xs text-muted-foreground py-4 text-center">Carregando documentos…</div>}>
                          <ClientDocuments clientId={client.id} />
                        </Suspense>
                      </TabsContent>
                    </Tabs>

                    <div className="flex gap-2 justify-end">
                      <Button data-mutation size="sm" onClick={() => saveEdit(client.id)}>
                        <Check className="w-[25px] h-[25px] mr-1" /> Salvar
                      </Button>
                    </div>

                  </div>
                ) : (
                  <ClientRow
                    client={client}
                    score={cs}
                    docCount={docCount}
                    usedLimit={usedLimitByClient[client.id] ?? 0}
                    creditLimit={getLimitForClient(client.id)}
                    readOnly={readOnly}
                    onEdit={(c) => startEdit(c)}
                    onOpenDocs={(c) => startEdit(c, "docs")}
                    onOpenLimit={setLimitClient}
                    onOpenAnalysis={setSelectedClient}
                    onToggleActive={handleToggleActive}
                    onDelete={setDeleteClientId}
                  />
                )}
              </CardContent>
            </Card>
            </div>
            );
          })}
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!deleteClientId}
        onOpenChange={() => setDeleteClientId(null)}
        onConfirm={() => { if (deleteClientId) { onDelete(deleteClientId); setDeleteClientId(null); } }}
        title="Excluir cliente"
        description="Tem certeza que deseja excluir este cliente?"
      />
      <Suspense fallback={null}>
        {selectedClient && (
          <ClientDetailDialog
            open={!!selectedClient}
            onOpenChange={(open) => !open && setSelectedClient(null)}
            client={selectedClient}
            loans={loans}
            payments={payments}
            installmentSchedules={installmentSchedules}
          />
        )}
        {limitClient && (
          <CreditLimitDialog
            open={!!limitClient}
            onOpenChange={(open) => !open && setLimitClient(null)}
            client={limitClient}
            loans={loans}
            payments={payments}
          />
        )}
        {recentAdjustOpen && (
          <RecentLimitAdjustmentsDialog
            open={recentAdjustOpen}
            onOpenChange={setRecentAdjustOpen}
            clients={clients}
          />
        )}
        {maxLimitOpen && (
          <MaxCreditLimitDialog
            open={maxLimitOpen}
            onOpenChange={setMaxLimitOpen}
          />
        )}
      </Suspense>
    </div>
  );
}
