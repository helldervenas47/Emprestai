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
import { ClientEditModal } from "@/features/clients/components/ClientEditModal";
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
  onNewClient?: () => void;
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

export function ClientList({ clients, loans, payments, installmentSchedules, onDelete, onUpdate, onNewClient, readOnly = false }: Props & { readOnly?: boolean }) {
  const [search, setSearch] = useState("");
  // P1 perf: filtragem/ordenação usam o valor "adiado" — teclado permanece 60fps
  // mesmo com centenas de clientes; React agenda o filtro em transição.
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingTab, setEditingTab] = useState<"data" | "docs">("data");
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
    setEditingClient(client);
    setEditingTab(tab);
  }, []);

  const handleSaveClient = useCallback(async (id: string, data: Partial<Omit<Client, "id" | "createdAt">>, creditLimitValue?: number | null) => {
    onUpdate(id, data);
    if (creditLimitValue !== undefined && creditLimitValue !== null && !isNaN(creditLimitValue) && creditLimitValue >= 0) {
      const existing = getLimitForClient(id);
      if (!existing) await ensureLimit(id);
      const current = getLimitForClient(id)?.currentLimit ?? 0;
      if (Math.abs(current - creditLimitValue) > 0.001) {
        await updateLimit(id, creditLimitValue, {
          mode: "manual",
          changeType: "manual",
          reason: "Ajuste manual via edição do cliente",
        });
      }
    }
    setEditingClient(null);
  }, [onUpdate, getLimitForClient, ensureLimit, updateLimit]);

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
        <Card className="border-dashed border-border/80 bg-muted/10">
          <CardContent className="py-12 px-4 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-base">
                {clients.length === 0 ? "Nenhum cliente cadastrado ainda" : "Nenhum cliente encontrado"}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                {clients.length === 0
                  ? "Cadastre seu primeiro cliente para registrar empréstimos, controlar limites e emitir cobranças."
                  : "Nenhum tomador corresponde aos filtros ou ao termo pesquisado."}
              </p>
            </div>
            {clients.length === 0 && onNewClient && (
              <div className="pt-2">
                <Button
                  onClick={onNewClient}
                  className="rounded-xl font-semibold gap-1.5 h-11 px-5 shadow-sm"
                >
                  <Users className="h-4 w-4" />
                  Cadastrar Primeiro Cliente
                </Button>
              </div>
            )}
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
                    <ClientRow
                      client={client}
                      score={cs}
                      docCount={docCount}
                      usedLimit={usedLimitByClient[client.id] ?? 0}
                      creditLimit={getLimitForClient(client.id)}
                      readOnly={readOnly}
                      onEdit={(c) => startEdit(c, "data")}
                      onOpenDocs={(c) => startEdit(c, "docs")}
                      onOpenLimit={setLimitClient}
                      onOpenAnalysis={setSelectedClient}
                      onToggleActive={handleToggleActive}
                      onDelete={setDeleteClientId}
                    />
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
      {editingClient && (
        <ClientEditModal
          isOpen={!!editingClient}
          onClose={() => setEditingClient(null)}
          client={editingClient}
          usedLimit={usedLimitByClient[editingClient.id] ?? 0}
          initialCreditLimit={getLimitForClient(editingClient.id)?.currentLimit ?? null}
          docCount={docCounts[editingClient.id] ?? 0}
          initialTab={editingTab}
          onSave={handleSaveClient}
        />
      )}
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
