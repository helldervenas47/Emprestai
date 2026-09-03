import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

interface ChartOverrideRow {
  month_label: string;
  emprestado: number;
  recebido: number;
  juros: number;
  juros_manual: boolean;
}

interface ChartOverrides {
  [month: string]: { emprestado?: number; recebido?: number };
}

interface InterestOverrides {
  [month: string]: number;
}

const hasOwnMonthOverride = (overrides: InterestOverrides, month: string) =>
  Object.prototype.hasOwnProperty.call(overrides, month);

export function useChartOverrides() {
  const { user, dataOwnerId } = useAuth();
  const [chartOverrides, setChartOverridesState] = useState<ChartOverrides>({});
  const [interestOverrides, setInterestOverridesState] = useState<InterestOverrides>({});
  const [loaded, setLoaded] = useState(false);

  const fetchOverrides = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chart_overrides")
      .select("month_label, emprestado, recebido, juros, juros_manual");
    if (data) {
      const chart: ChartOverrides = {};
      const interest: InterestOverrides = {};
      (data as ChartOverrideRow[]).forEach((row) => {
        const emp = Number(row.emprestado) || 0;
        const rec = Number(row.recebido) || 0;
        const jur = Number(row.juros) || 0;
        if (emp !== 0 || rec !== 0) {
          chart[row.month_label] = {
            ...(emp !== 0 ? { emprestado: emp } : {}),
            ...(rec !== 0 ? { recebido: rec } : {}),
          };
        }
        if (row.juros_manual) {
          interest[row.month_label] = jur;
        }
      });
      setChartOverridesState(chart);
      setInterestOverridesState(interest);
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const setChartOverrides = useCallback(async (overrides: ChartOverrides) => {
    if (!dataOwnerId) return;
    setChartOverridesState(overrides);

    // Delete all existing and re-insert
    await supabase.from("chart_overrides").delete().eq("user_id", dataOwnerId);

    // Merge with current interest overrides
    const allMonths = new Set([...Object.keys(overrides), ...Object.keys(interestOverrides)]);
    const rows = Array.from(allMonths).map((month) => ({
      user_id: dataOwnerId,
      month_label: month,
      emprestado: overrides[month]?.emprestado ?? 0,
      recebido: overrides[month]?.recebido ?? 0,
      juros: interestOverrides[month] ?? 0,
      juros_manual: hasOwnMonthOverride(interestOverrides, month),
    })).filter((r) => r.emprestado !== 0 || r.recebido !== 0 || r.juros !== 0 || r.juros_manual);

    if (rows.length > 0) {
      await supabase.from("chart_overrides").insert(rows);
    }
  }, [dataOwnerId, interestOverrides]);

  const setInterestOverrides = useCallback(async (overrides: InterestOverrides) => {
    if (!dataOwnerId) return;
    setInterestOverridesState(overrides);

    await supabase.from("chart_overrides").delete().eq("user_id", dataOwnerId);

    const allMonths = new Set([...Object.keys(chartOverrides), ...Object.keys(overrides)]);
    const rows = Array.from(allMonths).map((month) => ({
      user_id: dataOwnerId,
      month_label: month,
      emprestado: chartOverrides[month]?.emprestado ?? 0,
      recebido: chartOverrides[month]?.recebido ?? 0,
      juros: overrides[month] ?? 0,
      juros_manual: hasOwnMonthOverride(overrides, month),
    })).filter((r) => r.emprestado !== 0 || r.recebido !== 0 || r.juros !== 0 || r.juros_manual);

    if (rows.length > 0) {
      await supabase.from("chart_overrides").insert(rows);
    }
  }, [dataOwnerId, chartOverrides]);

  return { chartOverrides, setChartOverrides, interestOverrides, setInterestOverrides, loaded };
}
