import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import type { LoanSimulation, SimulationScenario, SimulationSettings } from "@/types/loanSimulation";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

function mapRow(row: any): LoanSimulation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    userId: row.user_id,
    clientId: row.client_id,
    name: row.name,
    notes: row.notes,
    scenarios: Array.isArray(row.scenarios) ? row.scenarios : [],
    chosenScenarioId: row.chosen_scenario_id,
    simulationDate: row.simulation_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useLoanSimulations() {
  const { user } = useAuth();
  const [simulations, setSimulations] = useState<LoanSimulation[]>([]);
  const [settings, setSettings] = useState<SimulationSettings>({ retentionDays: 90 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: sims, error: e1 }, { data: cfg }] = await Promise.all([
        supabase
          .from("loan_simulations" as any)
          .select("id, owner_id, user_id, client_id, name, notes, scenarios, chosen_scenario_id, simulation_date, created_at, updated_at")
          .order("simulation_date", { ascending: false }),
        supabase.from("simulation_settings" as any).select("retention_days").maybeSingle(),
      ]);
      if (e1) throw e1;
      const retention = (cfg as any)?.retention_days ?? 90;
      setSettings({ retentionDays: retention });

      // Filtra simulações dentro do período de retenção
      const cutoff = Date.now() - retention * 86400000;
      const filtered = (sims || [])
        .map(mapRow)
        .filter((s) => new Date(s.simulationDate).getTime() >= cutoff);
      setSimulations(filtered);
    } catch (err: any) {
      console.error("Erro ao carregar simulações:", err);
      toast.error("Erro ao carregar simulações");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSimulation = useCallback(
    async (input: {
      id?: string;
      clientId: string | null;
      name: string | null;
      notes: string | null;
      scenarios: SimulationScenario[];
      chosenScenarioId: string | null;
    }): Promise<LoanSimulation | null> => {
      assertWritable();
      if (!user) return null;
      try {
        // owner_id will default via RLS check; we need to pass it explicitly. Get it via RPC.
        const { data: ownerRes } = await supabase.rpc("get_data_owner_id" as any, { _user_id: user.id });
        const ownerId = (ownerRes as any) || user.id;

        const payload: any = {
          user_id: user.id,
          owner_id: ownerId,
          client_id: input.clientId,
          name: input.name,
          notes: input.notes,
          scenarios: input.scenarios,
          chosen_scenario_id: input.chosenScenarioId,
        };

        if (input.id) {
          const { data, error } = await supabase
            .from("loan_simulations" as any)
            .update(payload)
            .eq("id", input.id)
            .select()
            .maybeSingle();
          if (error) throw error;
          const mapped = mapRow(data);
          setSimulations((prev) => prev.map((s) => (s.id === mapped.id ? mapped : s)));
          return mapped;
        }
        const { data, error } = await supabase
          .from("loan_simulations" as any)
          .insert(payload)
          .select()
          .maybeSingle();
        if (error) throw error;
        const mapped = mapRow(data);
        setSimulations((prev) => [mapped, ...prev]);
        return mapped;
      } catch (err: any) {
        console.error(err);
        toast.error("Erro ao salvar simulação");
        return null;
      }
    },
    [user],
  );

  const deleteSimulation = useCallback(async (id: string) => {
    assertWritable();
    try {
      const { error } = await supabase.from("loan_simulations" as any).delete().eq("id", id);
      if (error) throw error;
      setSimulations((prev) => prev.filter((s) => s.id !== id));
      toast.success("Simulação excluída");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir simulação");
    }
  }, []);

  const updateSettings = useCallback(
    async (next: SimulationSettings) => {
      assertWritable();
      if (!user) return;
      try {
        const { data: ownerRes } = await supabase.rpc("get_data_owner_id" as any, { _user_id: user.id });
        const ownerId = (ownerRes as any) || user.id;
        const { error } = await supabase
          .from("simulation_settings" as any)
          .upsert({ owner_id: ownerId, retention_days: next.retentionDays }, { onConflict: "owner_id" });
        if (error) throw error;
        setSettings(next);
        toast.success("Configuração atualizada");
      } catch (err) {
        console.error(err);
        toast.error("Erro ao salvar configuração");
      }
    },
    [user],
  );

  return { simulations, settings, loading, saveSimulation, deleteSimulation, updateSettings, reload: load };
}
