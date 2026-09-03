import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface LocadorInfo {
  id?: string;
  nome: string;
  rg: string;
  cpf: string;
  nacionalidade: string;
  profissao: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const emptyLocador: LocadorInfo = {
  nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)", profissao: "",
  endereco: "", bairro: "", cidade: "", estado: "",
};

const LOCADOR_INFO_COLUMNS =
  "id, nome, rg, cpf, nacionalidade, profissao, endereco, bairro, cidade, estado";

export function useLocadorInfo(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [locadores, setLocadores] = useState<LocadorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep single locador for backward compat
  const locador = locadores[0] || emptyLocador;

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("locador_info")
      .select(LOCADOR_INFO_COLUMNS)
      .order("created_at", { ascending: true });
    if (data) {
      setLocadores(data.map(d => ({
        id: d.id, nome: d.nome, rg: d.rg, cpf: d.cpf,
        nacionalidade: d.nacionalidade, profissao: (d as any).profissao || "",
        endereco: d.endereco, bairro: d.bairro, cidade: d.cidade, estado: d.estado,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetchAll(); }, [fetchAll, enabled]);

  const save = useCallback(async (info: LocadorInfo): Promise<boolean> => {
    assertWritable();
    if (!user || !dataOwnerId) return false;

    if (info.id) {
      const { error } = await supabase.from("locador_info").update({
        nome: info.nome, rg: info.rg, cpf: info.cpf,
        nacionalidade: info.nacionalidade, profissao: info.profissao,
        endereco: info.endereco, bairro: info.bairro, cidade: info.cidade, estado: info.estado,
      }).eq("id", info.id);
      if (error) return false;
      setLocadores(prev => prev.map(l => l.id === info.id ? info : l));
      return true;
    } else {
      const { data, error } = await supabase.from("locador_info").insert({
        user_id: dataOwnerId,
        nome: info.nome, rg: info.rg, cpf: info.cpf,
        nacionalidade: info.nacionalidade, profissao: info.profissao,
        endereco: info.endereco, bairro: info.bairro, cidade: info.cidade, estado: info.estado,
      }).select().single();
      if (error || !data) return false;
      setLocadores(prev => [...prev, { ...info, id: data.id }]);
      return true;
    }
  }, [user, dataOwnerId]);

  const remove = useCallback(async (id: string) => {
    assertWritable();
    if (!user) return;
    await supabase.from("locador_info").delete().eq("id", id);
    setLocadores(prev => prev.filter(l => l.id !== id));
  }, [user]);

  return { locador, locadores, save, remove, loading };
}
