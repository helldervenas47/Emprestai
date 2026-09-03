import { useEffect, useState, useCallback, useMemo, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";
import { computePiggyDetailed, type PiggyDetailed, type RatePeriod } from "@/features/piggyBanks/lib/piggyTax";
import { financeFetchStart, financeFetchSuccess, financeInvalidate, financeRealtimeEvent, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";

/**
 * Adapter sobre a nova arquitetura financeira (tabelas `cofrinhos`,
 * `cofrinho_aportes`, `cofrinho_eventos`, `cofrinho_rendimento_diario`,
 * `taxa_referencia`) + Edge Functions:
 *   - processar-deposito-cofrinho
 *   - processar-resgate-cofrinho
 *   - sync-taxas-financeiras
 *
 * A interface pública foi mantida intacta para preservar compatibilidade
 * com todos os consumidores existentes (PiggyBankList, PiggyBankDetail,
 * useAccountBalance, useExternalAccountSources, ConsolidatedBalanceCards,
 * IncomePendingCalendar, FinancialHealthDashboard, PiggyBanksSummaryCard,
 * PiggyBanksBreakdownDialog, PersonalExpenseForm, etc.).
 *
 * A tabela legada `piggy_banks` NÃO é mais lida nem escrita. Permanece no
 * banco para preservar histórico — não está sendo dropada nesta migração.
 *
 * Cores/ícones/categoria/data-alvo são serializados em `cofrinhos.descricao`
 * como JSON, já que o novo schema não possui esses campos.
 */

export interface PiggyBankRateHistory {
  id: string;
  piggyBankId: string;
  annualRate: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface PiggyBank {
  id: string;
  shortId: number | null;
  name: string;
  color: string;
  icon: string;
  annualRate: number;
  autoRate: boolean;
  cdiPercent: number;
  goalAmount: number | null;
  category: string | null;
  targetDate: string | null;
  createdAt: string;
  deletedMovements?: string[];
}

export interface MarketRate {
  indicator: string;
  annualRate: number;
  source: string | null;
  referenceDate: string | null;
  fetchedAt: string;
}

export interface PiggyBankDeposit {
  id: string;
  piggyBankId: string;
  expenseId?: string | null;
  amount: number;
  depositDate: string;
  source?: string;
  recurrenceId?: string | null;
}

export interface PiggyBankRecurrence {
  id: string;
  piggyBankId: string;
  amount: number;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number;
  description?: string | null;
  active: boolean;
  lastGeneratedDate: string | null;
}

// ---------------------------------------------------------------------------
// Compat layer: as funções abaixo são exportadas porque outros módulos do app
// (PersonalExpenseForm, useExpenses, etc.) ainda dependem delas para marcar
// expenses como transferências para cofrinho.
// ---------------------------------------------------------------------------

const PIGGY_TAG_RE = /\[cofrinho:([0-9a-f-]{36})\]/i;

export const buildPiggyTag = (piggyId: string, original?: string) =>
  `[cofrinho:${piggyId}]${original ? " " + original : ""}`;

export const extractPiggyId = (notes?: string | null): string | null => {
  if (!notes) return null;
  const m = notes.match(PIGGY_TAG_RE);
  return m ? m[1] : null;
};

export const isPiggyExpense = (notes?: string | null) => !!extractPiggyId(notes);

/**
 * Mantida para compat com módulos que ainda chamam diretamente. NÃO é usada
 * internamente — o backend é a fonte de verdade do saldo agora.
 */
export function computePiggyBalance(
  deposits: PiggyBankDeposit[],
  annualRatePct: number,
  asOf: Date = new Date(),
) {
  const dailyFactor = Math.pow(1 + annualRatePct / 100, 1 / 365);
  const todayMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  let principal = 0;
  let total = 0;
  for (const d of deposits) {
    const depMs = new Date(d.depositDate).getTime();
    if (depMs > todayMs) continue;
    const days = Math.max(0, Math.floor((todayMs - depMs) / 86400000));
    principal += d.amount;
    total += d.amount * Math.pow(dailyFactor, days);
  }
  return { principal, total, yield: total - principal };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Descricao JSON helpers — extras visuais que o novo schema não comporta.
// ---------------------------------------------------------------------------
interface DescricaoMeta {
  cor?: string;
  icone?: string;
  categoria?: string | null;
  data_prevista?: string | null;
  short_id?: number | null;
  deleted_movements?: string[];
  note?: string;
  // legacy keys (compat com registros antigos)
  color?: string;
  icon?: string;
  category?: string | null;
  targetDate?: string | null;
  shortId?: number | null;
}

const parseDescricao = (raw: any): DescricaoMeta => {
  if (raw == null) return {};
  if (typeof raw === "object") return { ...(raw as DescricaoMeta) };
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (!trimmed.startsWith("{")) return { note: trimmed };
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed ? parsed : { note: trimmed };
  } catch {
    return { note: trimmed };
  }
};

const readMeta = (m: DescricaoMeta) => ({
  cor: m.cor ?? m.color ?? DEFAULT_COLOR,
  icone: m.icone ?? m.icon ?? DEFAULT_ICON,
  categoria: m.categoria ?? m.category ?? null,
  data_prevista: m.data_prevista ?? m.targetDate ?? null,
  short_id: m.short_id ?? m.shortId ?? null,
  deleted_movements: Array.isArray(m.deleted_movements) ? m.deleted_movements : [],
});

const DEFAULT_COLOR = "210 80% 55%";
const DEFAULT_ICON = "PiggyBank";

export function usePiggyBanks() {
  useFinanceHookDebug("usePiggyBanks");
  const instanceId = useId();
  const { user } = useAuth();
  const dataOwnerId = useDataOwner();
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [deposits, setDeposits] = useState<PiggyBankDeposit[]>([]);
  const [cofrinhoRows, setCofrinhoRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [cdiRate, setCdiRate] = useState<MarketRate | null>(null);

  // Recurrences/RateHistory ainda não migradas para a nova arquitetura.
  // Mantidas como arrays vazios para preservar a interface pública.
  const recurrences: PiggyBankRecurrence[] = [];
  const rateHistory: PiggyBankRateHistory[] = [];

  const reload = useCallback(async () => {
    if (!dataOwnerId) return;
    financeFetchStart("usePiggyBanks", "cofrinhos/taxa_referencia/cofrinho_ledger/cofrinho_eventos", { ownerId: "present" });
    const [cofRes, taxaRes] = await Promise.all([
      supabase
        .from("cofrinhos" as any)
        .select("id, ativo, nome, descricao, percentual_cdi, meta, created_at, saldo_principal, saldo_total, saldo_rendimento_bruto, saldo_rendimento_liquido")
        .eq("usuario_id", dataOwnerId)
        .order("created_at"),
      supabase
        .from("taxa_referencia" as any)
        // `*` porque o schema real usa `data` / `cdi_anual`; nomes alternativos
        // são tratados abaixo (compat com bases antigas).
        .select("*")
        .limit(50),
    ]);

    let activeCofrinhoIds: string[] = [];
    let loadedList: PiggyBank[] = [];
    if (!cofRes.error && Array.isArray(cofRes.data)) {
      const rowsMap: Record<string, any> = {};
      loadedList = (cofRes.data as any[])
        .filter((r) => r.ativo !== false)
        .map((r) => {
          rowsMap[r.id] = r;
          const meta = parseDescricao(r.descricao);
          const m = readMeta(meta);
          return {
            id: r.id,
            shortId: m.short_id,
            name: r.nome,
            color: m.cor,
            icon: m.icone,
            annualRate: 0, // backend controla; campo legado mantido por compat
            autoRate: true,
            // percentual inválido (0/negativo/nulo) equivale a 100% do CDI
            cdiPercent: Number(r.percentual_cdi) > 0 ? Number(r.percentual_cdi) : 100,
            goalAmount: r.meta != null ? Number(r.meta) : null,
            category: m.categoria,
            targetDate: m.data_prevista,
            createdAt: r.created_at,
            deletedMovements: m.deleted_movements,
          };
        });
      financeSetState("usePiggyBanks", "piggyBanks", { rows: loadedList.length });
      setPiggyBanks(loadedList);
      financeSetState("usePiggyBanks", "cofrinhoRows", { rows: Object.keys(rowsMap).length });
      setCofrinhoRows(rowsMap);
      activeCofrinhoIds = loadedList.map((pb) => pb.id);
    }

    if (activeCofrinhoIds.length > 0) {
      const [ledgerRes, eventosRes, aportesRes] = await Promise.all([
        supabase
          .from("cofrinho_ledger" as any)
          .select("id, cofrinho_id, tipo, valor, data_evento, created_at, evento_id, aporte_id, resgate_id")
          .in("cofrinho_id", activeCofrinhoIds)
          .order("data_evento", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("cofrinho_eventos" as any)
          .select("id, cofrinho_id, tipo, valor, data_evento, created_at")
          .in("cofrinho_id", activeCofrinhoIds)
          .in("tipo", ["DEPOSITO", "RESGATE", "AJUSTE"]),
        supabase
          .from("cofrinho_aportes" as any)
          .select("id, cofrinho_id, valor_original, data_aporte, created_at")
          .in("cofrinho_id", activeCofrinhoIds),
      ]);

      // Merge ledger + eventos + aportes para garantir que entradas/saídas históricas
      // não se percam quando uma das fontes estiver incompleta. A
      // deduplicação por evento_id/aporte_id/resgate_id evita contar
      // duas vezes a mesma movimentação.
      const ledgerRows = !ledgerRes.error && Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
      const eventosRows = !eventosRes.error && Array.isArray(eventosRes.data) ? eventosRes.data : [];
      const hasMovementFor = new Set<string>();
      for (const r of [...ledgerRows, ...eventosRows]) {
        if (r.cofrinho_id) hasMovementFor.add(r.cofrinho_id);
      }
      const aporteRows = !aportesRes.error && Array.isArray(aportesRes.data)
        ? aportesRes.data
            .filter((r: any) => !hasMovementFor.has(r.cofrinho_id))
            .map((r: any) => ({
              id: r.id,
              cofrinho_id: r.cofrinho_id,
              tipo: "DEPOSITO",
              valor: r.valor_original ?? r.valor,
              data_evento: r.data_aporte,
              created_at: r.created_at,
              aporte_id: r.id,
            }))
        : [];
      const movementRows = [...ledgerRows, ...eventosRows, ...aporteRows];

      if (movementRows.length > 0) {
        const seen = new Set<string>();
        financeSetState("usePiggyBanks", "deposits", { movementRows: movementRows.length });
        setDeposits(
          (movementRows as any[]).flatMap((r) => {
            const tipo = String(r.tipo || "").toUpperCase().replace("Ó", "O");
            if (tipo === "RENDIMENTO") return [];
            const rawDate = String(r.data_evento ?? r.created_at ?? "").slice(0, 10);
            const uniqueId = String(
              r.evento_id ||
                r.aporte_id ||
                r.resgate_id ||
                r.id ||
                `${r.cofrinho_id}-${rawDate}-${r.tipo}-${r.valor}`,
            );

            // Ignora movimentações marcadas como excluídas pelo usuário
            const currentPb = loadedList.find((p) => p.id === r.cofrinho_id);
            const delList = currentPb?.deletedMovements ?? [];
            if (
              delList.includes(uniqueId) ||
              (r.id && delList.includes(String(r.id))) ||
              (r.aporte_id && delList.includes(String(r.aporte_id))) ||
              (r.resgate_id && delList.includes(String(r.resgate_id))) ||
              (r.evento_id && delList.includes(String(r.evento_id)))
            ) {
              return [];
            }

            if (seen.has(uniqueId)) return [];
            seen.add(uniqueId);

            const rawValue = Number(r.valor || 0);
            let amount = rawValue;
            let source: PiggyBankDeposit["source"] = "manual";
            if (tipo === "DEPOSITO") {
              amount = Math.abs(rawValue);
              source = "transfer_in";
            } else if (tipo === "RESGATE") {
              amount = -Math.abs(rawValue);
              source = "transfer_out";
            }

            return [{
              id: uniqueId,
              piggyBankId: r.cofrinho_id,
              expenseId: null,
              amount,
              depositDate: rawDate,
              source,
              recurrenceId: null,
            }];
          }),
        );
      } else {
        financeSetState("usePiggyBanks", "deposits", { rows: 0 });
        setDeposits([]);
      }
    } else {
      financeSetState("usePiggyBanks", "deposits", { rows: 0, reason: "no active cofrinhos" });
      setDeposits([]);
    }

    if (!taxaRes.error && Array.isArray(taxaRes.data) && taxaRes.data.length > 0) {
      // A tabela `taxa_referencia` do projeto usa `data` + `cdi_anual`, mas
      // bases antigas podem usar outros nomes — tratamos todos.
      const rows = (taxaRes.data as any[]).slice();
      const dateOf = (r: any) =>
        r.data ?? r.data_referencia ?? r.reference_date ?? r.atualizado_em ?? r.updated_at ?? "";
      rows.sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a))));
      const r: any = rows[0];
      const annual =
        r.cdi_anual ?? r.taxa_anual ?? r.valor_anual ?? r.taxa ?? r.valor ?? r.annual_rate ?? null;
      if (annual != null && Number(annual) > 0) {
        financeSetState("usePiggyBanks", "cdiRate", { annualRate: Number(annual) });
        setCdiRate({
          indicator: "cdi",
          annualRate: Number(annual),
          source: r.fonte ?? r.source ?? null,
          referenceDate: dateOf(r) ? String(dateOf(r)).slice(0, 10) : null,
          fetchedAt: r.atualizado_em ?? r.updated_at ?? new Date().toISOString(),
        });
      }
    }


    setLoading(false);
    financeSetState("usePiggyBanks", "loading", { value: false });
    financeFetchSuccess("usePiggyBanks", "cofrinhos/taxa_referencia/cofrinho_ledger/cofrinho_eventos", {
      cofrinhos: Array.isArray(cofRes.data) ? cofRes.data.length : 0,
      taxaReferencia: Array.isArray(taxaRes.data) ? taxaRes.data.length : 0,
    });
  }, [dataOwnerId]);

  useEffect(() => {
    financeInvalidate("usePiggyBanks", "cofrinhos/taxa_referencia/cofrinho_ledger/cofrinho_eventos", { reason: "initial effect" });
    reload();
  }, [reload]);

  // Realtime — debounced fallback (agregações não permitem patch por payload sem
  // recomputar totais; ao invés de SELECT completo por evento, agrupamos rajadas
  // em uma única recarga a cada ~1500ms e ignoramos eventos com aba oculta.)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dataOwnerId) return;
    const scheduleReload = (source: string) => {
      financeRealtimeEvent("usePiggyBanks", source);
      if (typeof document !== "undefined" && document.hidden) return;
      if (reloadTimerRef.current) return;
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        financeInvalidate("usePiggyBanks", "cofrinhos/taxa_referencia/cofrinho_ledger/cofrinho_eventos", { reason: `realtime ${source} (debounced)` });
        reload();
      }, 1500);
    };
    const channel = supabase
      .channel(`cofrinhos:${dataOwnerId}:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinhos" }, () => scheduleReload("cofrinhos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinho_aportes" }, () => scheduleReload("cofrinho_aportes"))
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinho_eventos" }, () => scheduleReload("cofrinho_eventos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinho_ledger" }, () => scheduleReload("cofrinho_ledger"))
      .on("postgres_changes", { event: "*", schema: "public", table: "taxa_referencia" }, () => scheduleReload("taxa_referencia"))
      .subscribe();
    return () => {
      if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
      supabase.removeChannel(channel);
    };
  }, [dataOwnerId, reload, instanceId]);

  // ---------------------------------------------------------------------------
  // CRUD de cofrinhos
  // ---------------------------------------------------------------------------

  const createPiggyBank = useCallback(
    async (data: {
      name: string;
      color?: string;
      icon?: string;
      annualRate?: number;
      autoRate?: boolean;
      cdiPercent?: number;
      shortId?: number | null;
      goalAmount?: number | null;
      category?: string | null;
      targetDate?: string | null;
    }) => {
      assertWritable();
      if (!user || !dataOwnerId) return null;
      const descricao: DescricaoMeta = {
        cor: data.color ?? DEFAULT_COLOR,
        icone: data.icon ?? DEFAULT_ICON,
        categoria: data.category ?? null,
        data_prevista: data.targetDate ?? null,
        short_id: data.shortId ?? null,
      };
      const payload: any = {
        usuario_id: dataOwnerId,
        nome: data.name,
        descricao,
        meta: data.goalAmount ?? null,
        percentual_cdi: (data.cdiPercent ?? 0) > 0 ? data.cdiPercent : 100,
        tipo_rendimento: "CDI",
        rendimento_automatico: true,
        ativo: true,
      };
      const { data: row, error } = await (supabase as any)
        .from("cofrinhos")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast.error(error.message || "Erro ao criar cofrinho");
        return null;
      }
      await reload();
      return (row as any)?.id as string;
    },
    [user, dataOwnerId, reload],
  );

  const updatePiggyBank = useCallback(
    async (
      id: string,
      patch: Partial<{
        name: string;
        color: string;
        icon: string;
        annualRate: number;
        autoRate: boolean;
        cdiPercent: number;
        shortId: number | null;
        goalAmount: number | null;
        category: string | null;
        targetDate: string | null;
      }>,
    ) => {
      assertWritable();
      const current = cofrinhoRows[id];
      const meta = parseDescricao(current?.descricao);
      // Normaliza para chaves PT e remove chaves legadas (color/icon/etc.)
      const base = readMeta(meta);
      const newMeta: DescricaoMeta = {
        cor: base.cor,
        icone: base.icone,
        categoria: base.categoria,
        data_prevista: base.data_prevista,
        short_id: base.short_id,
      };
      if (patch.color !== undefined) newMeta.cor = patch.color;
      if (patch.icon !== undefined) newMeta.icone = patch.icon;
      if (patch.category !== undefined) newMeta.categoria = patch.category;
      if (patch.targetDate !== undefined) newMeta.data_prevista = patch.targetDate;
      if (patch.shortId !== undefined) newMeta.short_id = patch.shortId;
      const dbPatch: any = { descricao: newMeta };
      if (patch.name !== undefined) dbPatch.nome = patch.name;
      // `percentual_cdi` é controlado automaticamente pelo backend (CDI).
      // Ignoramos qualquer alteração vinda do modal para não bloquear o update
      // dos demais campos por triggers/policies que protegem essa coluna.
      if (patch.goalAmount !== undefined) dbPatch.meta = patch.goalAmount;

      const { data, error } = await supabase
        .from("cofrinhos" as any)
        .update(dbPatch)
        .eq("id", id)
        .select();

      if (error) {
        toast.error(error.message || "Erro ao atualizar");
        return false;
      }
      // referência mantida para futura leitura do registro atualizado
      void data;
      await reload();
      return true;
    },
    [cofrinhoRows, reload],
  );


  const deletePiggyBank = useCallback(
    async (id: string) => {
      assertWritable();
      // Soft delete para preservar histórico de aportes/eventos.
      const { error } = await supabase
        .from("cofrinhos" as any)
        .update({ ativo: false })
        .eq("id", id);
      if (error) {
        toast.error("Erro ao excluir cofrinho");
        return;
      }
      await reload();
    },
    [reload],
  );

  // ---------------------------------------------------------------------------
  // Depósitos e resgates — TODOS via Edge Function
  // ---------------------------------------------------------------------------

  // Chama a edge function via fetch explícito para garantir que o
  // Authorization (access_token do usuário) e a apikey sejam enviados.
  // `supabase.functions.invoke` às vezes falha com
  // "failed to send a request to the edge function" quando a sessão
  // ainda não foi hidratada no client externo.
  const callCofrinhoFn = useCallback(
    async (fnName: string, payload: Record<string, unknown>) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const baseUrl = (import.meta as any).env.VITE_EXTERNAL_SUPABASE_URL as string;
      const anonKey = (import.meta as any).env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string;
      const url = `${baseUrl}/functions/v1/${fnName}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
          },
          body: JSON.stringify(payload),
        });
      } catch (e: any) {
        throw new Error(e?.message || "Falha de rede ao chamar edge function");
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* resposta não-JSON */
      }
      if (!res.ok) {
        const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    },
    [],
  );

  const invokeDeposit = useCallback(
    async (cofrinhoId: string, valor: number, dataAporte?: string, percentualCdi?: number) => {
      const payload: Record<string, unknown> = {
        cofrinho_id: cofrinhoId,
        valor,
        percentual_cdi: (percentualCdi ?? 0) > 0 ? percentualCdi : 100,
      };
      if (dataAporte) payload.data_aporte = dataAporte;
      return callCofrinhoFn("processar-deposito-cofrinho", payload);
    },
    [callCofrinhoFn],
  );

  const invokeWithdraw = useCallback(
    async (cofrinhoId: string, valor: number, dataResgate?: string) => {
      const payload: Record<string, unknown> = {
        cofrinho_id: cofrinhoId,
        valor,
      };
      if (dataResgate) payload.data_resgate = dataResgate;
      return callCofrinhoFn("processar-resgate-cofrinho", payload);
    },
    [callCofrinhoFn],
  );

  /** Aporte simples (compat). */
  const addDeposit = useCallback(
    async (input: {
      piggyBankId: string;
      amount: number;
      depositDate: string;
      expenseId?: string;
      source?: string;
    }) => {
      assertWritable();
      try {
        await invokeDeposit(input.piggyBankId, input.amount, input.depositDate);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        await reload();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao registrar aporte");
      }
    },
    [invokeDeposit, reload],
  );

  /**
   * Remoção via expenseId: no novo schema os aportes não carregam expense_id,
   * então essa operação vira no-op silencioso (a despesa será apagada pelo
   * fluxo normal de despesas; o cofrinho continua com o aporte registrado).
   */
  const removeDepositByExpenseId = useCallback(async (_expenseId: string) => {
    // intencionalmente vazio na nova arquitetura
  }, []);

  const updateDeposit = useCallback(
    async (id: string, patch: Partial<{ amount: number; depositDate: string }>) => {
      assertWritable();
      const newDate = patch.depositDate ? patch.depositDate.slice(0, 10) : undefined;
      const newAmount = patch.amount !== undefined ? Number(patch.amount) : undefined;

      try {
        let cofrinhoId: string | null = null;
        let aporteId: string | null = null;

        // 1. Atualiza em cofrinho_ledger e descobre cofrinho_id e aporte_id
        const ledgerPatch: any = {};
        if (newDate) ledgerPatch.data_evento = newDate;
        if (newAmount !== undefined && newAmount > 0) ledgerPatch.valor = newAmount;

        if (Object.keys(ledgerPatch).length > 0) {
          const { data: ledgerRow } = await (supabase as any)
            .from("cofrinho_ledger")
            .update(ledgerPatch)
            .or(`id.eq.${id},evento_id.eq.${id},aporte_id.eq.${id}`)
            .select("cofrinho_id, aporte_id")
            .maybeSingle();

          if (ledgerRow) {
            cofrinhoId = ledgerRow.cofrinho_id;
            aporteId = ledgerRow.aporte_id;
          }
        }

        // 2. Atualiza em cofrinho_aportes
        const aportePatch: any = {};
        if (newDate) aportePatch.data_aporte = newDate;
        if (newAmount !== undefined && newAmount > 0) {
          aportePatch.valor_original = newAmount;
          aportePatch.saldo_restante = newAmount;
        }

        if (Object.keys(aportePatch).length > 0) {
          const targetAporteId = aporteId || id;
          const { data: aporteRow } = await (supabase as any)
            .from("cofrinho_aportes")
            .update(aportePatch)
            .eq("id", targetAporteId)
            .select("id, cofrinho_id")
            .maybeSingle();

          if (aporteRow?.cofrinho_id) {
            cofrinhoId = aporteRow.cofrinho_id;
          } else if (cofrinhoId) {
            await (supabase as any)
              .from("cofrinho_aportes")
              .update(aportePatch)
              .eq("cofrinho_id", cofrinhoId);
          }
        }

        // 3. Atualiza cofrinho_eventos
        if (newDate || newAmount) {
          const evUpdate: any = {};
          if (newDate) evUpdate.data_evento = newDate;
          if (newAmount !== undefined && newAmount > 0) evUpdate.valor = newAmount;
          await (supabase as any)
            .from("cofrinho_eventos")
            .update(evUpdate)
            .or(`id.eq.${id},evento_id.eq.${id}`);
        }

        // 4. Dispara o recálculo do cofrinho para reprocessar juros e tributos a partir da nova data
        if (cofrinhoId) {
          try {
            await supabase.functions.invoke("recalcular-cofrinho", {
              body: { cofrinho_id: cofrinhoId },
            });
          } catch {
            /* noop */
          }
        }

        toast.success("Movimentação atualizada com sucesso");
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao atualizar movimentação");
        return false;
      }
    },
    [reload],
  );

  const deleteDeposit = useCallback(
    async (id: string) => {
      assertWritable();
      try {
        let cofrinhoId: string | null = null;
        const allIdsToDelete = new Set<string>([String(id)]);

        // 1. Localiza no cofrinho_ledger
        try {
          const { data: lRow } = await (supabase as any)
            .from("cofrinho_ledger")
            .select("id, cofrinho_id, aporte_id, evento_id, resgate_id")
            .or(`id.eq.${id},evento_id.eq.${id},aporte_id.eq.${id},resgate_id.eq.${id}`)
            .maybeSingle();
          if (lRow) {
            cofrinhoId = lRow.cofrinho_id;
            if (lRow.id) allIdsToDelete.add(String(lRow.id));
            if (lRow.aporte_id) allIdsToDelete.add(String(lRow.aporte_id));
            if (lRow.resgate_id) allIdsToDelete.add(String(lRow.resgate_id));
            if (lRow.evento_id) allIdsToDelete.add(String(lRow.evento_id));
          }
        } catch {
          /* ignore */
        }

        // 2. Se não achou cofrinhoId, tenta no cofrinho_aportes
        if (!cofrinhoId) {
          try {
            const { data: aRow } = await (supabase as any)
              .from("cofrinho_aportes")
              .select("id, cofrinho_id")
              .eq("id", id)
              .maybeSingle();
            if (aRow) {
              cofrinhoId = aRow.cofrinho_id;
              allIdsToDelete.add(String(aRow.id));
            }
          } catch {
            /* ignore */
          }
        }

        // 3. Se não achou cofrinhoId, tenta no cofrinho_resgates
        if (!cofrinhoId) {
          try {
            const { data: rRow } = await (supabase as any)
              .from("cofrinho_resgates")
              .select("id, cofrinho_id")
              .eq("id", id)
              .maybeSingle();
            if (rRow) {
              cofrinhoId = rRow.cofrinho_id;
              allIdsToDelete.add(String(rRow.id));
            }
          } catch {
            /* ignore */
          }
        }

        // 4. Se não achou cofrinhoId, tenta no cofrinho_eventos
        if (!cofrinhoId) {
          try {
            const { data: eRow } = await (supabase as any)
              .from("cofrinho_eventos")
              .select("id, cofrinho_id")
              .or(`id.eq.${id},evento_id.eq.${id}`)
              .maybeSingle();
            if (eRow) {
              cofrinhoId = eRow.cofrinho_id;
              allIdsToDelete.add(String(eRow.id));
            }
          } catch {
            /* ignore */
          }
        }

        // 5. Persiste permanentemente no JSON do cofrinho para nunca mais retornar
        if (cofrinhoId) {
          try {
            const { data: cofData } = await (supabase as any)
              .from("cofrinhos")
              .select("id, descricao")
              .eq("id", cofrinhoId)
              .single();

            if (cofData) {
              const parsed = parseDescricao(cofData.descricao);
              const currentDeleted = Array.isArray(parsed.deleted_movements)
                ? parsed.deleted_movements
                : [];
              const nextDeleted = Array.from(new Set([...currentDeleted, ...Array.from(allIdsToDelete)]));
              parsed.deleted_movements = nextDeleted;

              await (supabase as any)
                .from("cofrinhos")
                .update({ descricao: JSON.stringify(parsed) })
                .eq("id", cofrinhoId);
            }
          } catch {
            /* ignore */
          }
        }

        // 6. Tenta a deleção física em todas as tabelas
        for (const targetId of Array.from(allIdsToDelete)) {
          try { await (supabase as any).from("cofrinho_resgate_aportes").delete().eq("resgate_id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_resgate_aportes").delete().eq("aporte_id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_rendimento_diario").delete().eq("aporte_id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_resgates").delete().eq("id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_aportes").delete().eq("id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_ledger").delete().eq("id", targetId); } catch {}
          try { await (supabase as any).from("cofrinho_eventos").delete().eq("id", targetId); } catch {}
        }

        // 7. Dispara o recálculo do cofrinho para reprocessar saldos e tributos
        if (cofrinhoId) {
          try {
            await supabase.functions.invoke("recalcular-cofrinho", {
              body: { cofrinho_id: cofrinhoId },
            });
          } catch {
            /* noop */
          }
        }

        toast.success("Movimentação excluída com sucesso");
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao remover movimentação");
        return false;
      }
    },
    [reload],
  );

  const adjustBalance = useCallback(
    async (piggyBankId: string, newBalance: number, _note?: string) => {
      assertWritable();
      const row = cofrinhoRows[piggyBankId];
      if (!row) return;
      const current = Number(row.saldo_total ?? 0);
      const delta = Number((newBalance - current).toFixed(2));
      if (delta === 0) {
        toast.info("Saldo já está nesse valor");
        return;
      }
      try {
        if (delta > 0) await invokeDeposit(piggyBankId, delta);
        else await invokeWithdraw(piggyBankId, Math.abs(delta));
        toast.success(`Saldo ajustado em ${delta > 0 ? "+" : ""}${delta.toFixed(2)}`);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        await reload();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao ajustar saldo");
      }
    },
    [cofrinhoRows, invokeDeposit, invokeWithdraw, reload],
  );

  const storeMoney = useCallback(
    async (piggyBankId: string, amount: number, depositDate?: string) => {
      const value = Number(amount.toFixed(2));
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Informe um valor válido");
        return false;
      }
      const pb = piggyBanks.find((p) => p.id === piggyBankId);
      try {
        await invokeDeposit(piggyBankId, value, depositDate);
        // Se a data for retroativa, dispara o recálculo do cofrinho
        const hoje = new Date().toISOString().slice(0, 10);
        if (depositDate && depositDate < hoje) {
          try {
            await supabase.functions.invoke("recalcular-cofrinho", {
              body: { cofrinho_id: piggyBankId },
            });
          } catch {
            /* noop */
          }
        }
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        toast.success(`Guardado ${value.toFixed(2)} em "${pb?.name ?? "cofrinho"}"`);
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao guardar no cofrinho");
        return false;
      }
    },
    [piggyBanks, invokeDeposit, reload],
  );

  const withdrawMoney = useCallback(
    async (piggyBankId: string, amount: number, withdrawDate?: string) => {
      const value = Number(amount.toFixed(2));
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Informe um valor válido");
        return false;
      }
      const pb = piggyBanks.find((p) => p.id === piggyBankId);
      try {
        await invokeWithdraw(piggyBankId, value, withdrawDate);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        toast.success(`Resgatado ${value.toFixed(2)} de "${pb?.name ?? "cofrinho"}"`);
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao resgatar do cofrinho");
        return false;
      }
    },
    [piggyBanks, invokeWithdraw, reload],
  );

  // ---------------------------------------------------------------------------
  // Recorrências — feature ainda não disponível na nova arquitetura (stubs)
  // ---------------------------------------------------------------------------
  const createRecurrence = useCallback(
    async (_input: {
      piggyBankId: string;
      amount: number;
      startDate: string;
      endDate?: string | null;
      description?: string;
    }) => {
      toast.info("Aportes recorrentes serão reintroduzidos em uma próxima atualização.");
      return null;
    },
    [],
  );
  const setRecurrenceActive = useCallback(async (_id: string, _active: boolean) => false, []);
  const deleteRecurrence = useCallback(async (_id: string) => false, []);

  // Taxa controlada automaticamente pelo backend — no-op silencioso.
  const setPiggyRate = useCallback(
    async (_piggyBankId: string, _newRate: number, _mode: "forward" | "recalc") => {
      // Intencionalmente vazio: o backend recalcula via CDI.
    },
    [],
  );

  const refreshCdiNow = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sync-taxas-financeiras", {
        body: {},
      });
      if (error) throw error;
      await reload();
      const rate = (data as any)?.cdi?.taxa_anual ?? (data as any)?.annual_rate;
      if (typeof rate === "number") {
        toast.success(`Taxa CDI atualizada: ${rate.toFixed(2)}% a.a.`);
      } else {
        toast.success("Taxas financeiras atualizadas");
      }
      return data;
    } catch {
      toast.error("Não foi possível atualizar a taxa CDI agora");
      return null;
    }
  }, [reload]);

  // Exposto para compat com qualquer consumidor que chame `periodsFor(pb)`.
  const _periodsFor = useCallback(
    (pb: PiggyBank): RatePeriod[] => {
      const annual = (cdiRate?.annualRate ?? 0) * ((pb.cdiPercent ?? 100) / 100);
      return [{ effectiveFrom: pb.createdAt?.slice(0, 10) || ymd(new Date()), annualRate: annual }];
    },
    [cdiRate],
  );

  // ---------------------------------------------------------------------------
  // Saldos derivados — cálculo dinâmico baseado nos aportes reais e taxas vigentes
  // ---------------------------------------------------------------------------

  const balances = useMemo(() => {
    const map = new Map<string, { principal: number; balance: number; yield: number }>();
    for (const pb of piggyBanks) {
      const row = cofrinhoRows[pb.id] || {};
      const pbDeposits = deposits.filter((d) => d.piggyBankId === pb.id);
      const periods = _periodsFor(pb);
      const comp = computePiggyDetailed(pbDeposits, periods);

      const hasDeposits = pbDeposits.length > 0;
      const principal = hasDeposits ? comp.principal : Number(row.saldo_principal ?? 0);
      const net = hasDeposits ? comp.net : Number(row.saldo_rendimento_liquido ?? 0);
      const balance = principal + net;
      map.set(pb.id, { principal, balance, yield: net });
    }
    return map;
  }, [piggyBanks, cofrinhoRows, deposits, _periodsFor]);

  const detailed = useMemo(() => {
    const map = new Map<string, PiggyDetailed>();
    for (const pb of piggyBanks) {
      const row = cofrinhoRows[pb.id] || {};
      const cdi = cdiRate?.annualRate ?? 0;
      const currentRate = cdi * ((pb.cdiPercent ?? 100) / 100);

      const pbDeposits = deposits.filter((d) => d.piggyBankId === pb.id);
      const periods = _periodsFor(pb);
      const comp = computePiggyDetailed(pbDeposits, periods);

      const hasDeposits = pbDeposits.length > 0;
      const principal = hasDeposits ? comp.principal : Number(row.saldo_principal ?? 0);
      const gross = hasDeposits ? comp.gross : Number(row.saldo_rendimento_bruto ?? 0);
      const net = hasDeposits ? comp.net : Number(row.saldo_rendimento_liquido ?? 0);
      const tax = hasDeposits ? comp.tax : Math.max(0, gross - net);

      let iof = comp.iof;
      let ir = comp.ir;
      if (tax > 0 && comp.tax > 0) {
        const iofRatio = comp.iof / comp.tax;
        iof = Number((tax * iofRatio).toFixed(2));
        ir = Number((tax - iof).toFixed(2));
      } else if (tax > 0) {
        ir = tax;
        iof = 0;
      }

      map.set(pb.id, {
        principal,
        balance: principal + net,
        gross,
        tax,
        iof,
        ir,
        iofRate: comp.iofRate,
        irRate: comp.irRate,
        holdingDays: comp.holdingDays,
        net,
        projectionNetEom: comp.projectionNetEom,
        currentNet: principal + net,
        currentRate,
      });
    }
    return map;
  }, [piggyBanks, cofrinhoRows, cdiRate, deposits, _periodsFor]);

  return {
    piggyBanks,
    deposits,
    recurrences,
    rateHistory,
    balances,
    detailed,
    cdiRate,
    loading,
    createPiggyBank,
    updatePiggyBank,
    deletePiggyBank,
    addDeposit,
    removeDepositByExpenseId,
    updateDeposit,
    deleteDeposit,
    adjustBalance,
    storeMoney,
    withdrawMoney,
    createRecurrence,
    setRecurrenceActive,
    deleteRecurrence,
    setPiggyRate,
    refreshCdiNow,
    reload,
    /** Dados crus do cofrinho (saldo_principal, saldo_total etc.) para UIs que
     *  queiram surface fields novos (saldo_rendimento_bruto, ultimo_rendimento,
     *  proximo_rendimento, tipo_rendimento). */
    cofrinhoRows,
  };
}
