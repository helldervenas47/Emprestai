-- ============================================================
-- Bônus por Pontuação de Metas
-- Aplique este SQL uma única vez no banco (SQL Editor do backend).
-- ============================================================

-- 1) Configuração do bônus por funcionário
CREATE TABLE IF NOT EXISTS public.employee_goal_bonuses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT true,
  min_score     numeric NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  bonus_amount  numeric NOT NULL CHECK (bonus_amount >= 0),
  start_date    date NOT NULL,
  end_date      date NULL,
  notes         text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_goal_bonuses_user_idx     ON public.employee_goal_bonuses(user_id);
CREATE INDEX IF NOT EXISTS employee_goal_bonuses_employee_idx ON public.employee_goal_bonuses(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_goal_bonuses TO authenticated;
GRANT ALL ON public.employee_goal_bonuses TO service_role;

ALTER TABLE public.employee_goal_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "egb_select_own" ON public.employee_goal_bonuses;
CREATE POLICY "egb_select_own" ON public.employee_goal_bonuses
  FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "egb_insert_own" ON public.employee_goal_bonuses;
CREATE POLICY "egb_insert_own" ON public.employee_goal_bonuses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "egb_update_own" ON public.employee_goal_bonuses;
CREATE POLICY "egb_update_own" ON public.employee_goal_bonuses
  FOR UPDATE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "egb_delete_own" ON public.employee_goal_bonuses;
CREATE POLICY "egb_delete_own" ON public.employee_goal_bonuses
  FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

DROP TRIGGER IF EXISTS employee_goal_bonuses_updated_at ON public.employee_goal_bonuses;
CREATE TRIGGER employee_goal_bonuses_updated_at
  BEFORE UPDATE ON public.employee_goal_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Awards (histórico imutável)
CREATE TABLE IF NOT EXISTS public.goal_bonus_awards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  bonus_config_id    uuid NULL REFERENCES public.employee_goal_bonuses(id) ON DELETE SET NULL,
  reference_month    text NOT NULL,
  payroll_month      text NOT NULL,
  score_obtained     numeric NOT NULL,
  min_score_required numeric NOT NULL,
  bonus_amount       numeric NOT NULL,
  status             text NOT NULL DEFAULT 'gerado' CHECK (status IN ('gerado','pago','cancelado')),
  payroll_id         uuid NULL REFERENCES public.payrolls(id) ON DELETE SET NULL,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, employee_id, reference_month)
);

CREATE INDEX IF NOT EXISTS goal_bonus_awards_user_ref_idx      ON public.goal_bonus_awards(user_id, reference_month);
CREATE INDEX IF NOT EXISTS goal_bonus_awards_payroll_month_idx ON public.goal_bonus_awards(user_id, payroll_month);
CREATE INDEX IF NOT EXISTS goal_bonus_awards_employee_idx      ON public.goal_bonus_awards(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_bonus_awards TO authenticated;
GRANT ALL ON public.goal_bonus_awards TO service_role;

ALTER TABLE public.goal_bonus_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gba_select_own" ON public.goal_bonus_awards;
CREATE POLICY "gba_select_own" ON public.goal_bonus_awards
  FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "gba_insert_own" ON public.goal_bonus_awards;
CREATE POLICY "gba_insert_own" ON public.goal_bonus_awards
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "gba_update_own" ON public.goal_bonus_awards;
CREATE POLICY "gba_update_own" ON public.goal_bonus_awards
  FOR UPDATE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP POLICY IF EXISTS "gba_delete_own" ON public.goal_bonus_awards;
CREATE POLICY "gba_delete_own" ON public.goal_bonus_awards
  FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));
