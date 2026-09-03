import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface VehicleInfo {
  id: string;
  marcaModelo: string;
  ano: string;
  cor: string;
  placa: string;
  renavam: string;
}

const VEHICLE_REGISTRY_COLUMNS =
  "id, marca_modelo, ano, cor, placa, renavam, created_at";

export function useVehicleRegistry(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("vehicle_registry")
      .select(VEHICLE_REGISTRY_COLUMNS)
      .order("created_at", { ascending: false });
    if (data) {
      setVehicles(data.map((v: any) => ({
        id: v.id,
        marcaModelo: v.marca_modelo,
        ano: v.ano,
        cor: v.cor,
        placa: v.placa,
        renavam: v.renavam,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetch(); }, [fetch, enabled]);

  const add = useCallback(async (v: Omit<VehicleInfo, "id">) => {
    assertWritable();
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    setVehicles(prev => [{ ...v, id: tempId }, ...prev]);

    const { data, error } = await supabase.from("vehicle_registry").insert({
      user_id: dataOwnerId,
      marca_modelo: v.marcaModelo, ano: v.ano, cor: v.cor,
      placa: v.placa, renavam: v.renavam,
    }).select().single();

    if (error) {
      setVehicles(prev => prev.filter(x => x.id !== tempId));
    } else if (data) {
      setVehicles(prev => prev.map(x => x.id === tempId ? { ...x, id: data.id } : x));
    }
  }, [user, dataOwnerId]);

  const update = useCallback(async (id: string, v: Partial<Omit<VehicleInfo, "id">>) => {
    assertWritable();
    setVehicles(prev => prev.map(x => x.id === id ? { ...x, ...v } : x));
    await supabase.from("vehicle_registry").update({
      marca_modelo: v.marcaModelo, ano: v.ano, cor: v.cor,
      placa: v.placa, renavam: v.renavam,
    }).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    assertWritable();
    setVehicles(prev => prev.filter(x => x.id !== id));
    await supabase.from("vehicle_registry").delete().eq("id", id);
  }, []);

  return { vehicles, add, update, remove, loading };
}
