-- Pesos (pontuação) das metas por usuário — usado no sistema de pontuação da
-- aba Metas → Evolução. Cada usuário tem um peso por goal_type; a soma
-- deve totalizar 100 (validação no cliente).

CREATE TABLE IF NOT EXISTS public.user_goal_score_weights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  goal_type  text NOT NULL,
  weight     integer NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goal_score_weights TO authenticated;
GRANT ALL ON public.user_goal_score_weights TO service_role;

ALTER TABLE public.user_goal_score_weights ENABLE ROW LEVEL SECURITY;

-- Segue o padrão dos demais recursos multi-usuário do app: leitura/escrita
-- respeita o "data owner" (proprietário) do usuário logado.
DROP POLICY IF EXISTS "score_weights_select_own" ON public.user_goal_score_weights;
CREATE POLICY "score_weights_select_own"
  ON public.user_goal_score_weights
  FOR SELECT
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "score_weights_insert_own" ON public.user_goal_score_weights;
CREATE POLICY "score_weights_insert_own"
  ON public.user_goal_score_weights
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "score_weights_update_own" ON public.user_goal_score_weights;
CREATE POLICY "score_weights_update_own"
  ON public.user_goal_score_weights
  FOR UPDATE
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "score_weights_delete_own" ON public.user_goal_score_weights;
CREATE POLICY "score_weights_delete_own"
  ON public.user_goal_score_weights
  FOR DELETE
  TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

-- Trigger para manter updated_at atualizado
DROP TRIGGER IF EXISTS trg_user_goal_score_weights_updated_at ON public.user_goal_score_weights;
CREATE TRIGGER trg_user_goal_score_weights_updated_at
  BEFORE UPDATE ON public.user_goal_score_weights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
