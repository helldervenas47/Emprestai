
CREATE TABLE IF NOT EXISTS public.telegram_manager_weekly_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  send_weekday smallint NOT NULL DEFAULT 1,
  send_time text NOT NULL DEFAULT '09:00',
  message_template text NOT NULL DEFAULT $$Olá {nome_gerente}! 👋
Resumo semanal dos seus empréstimos:

⚠️ Atrasados: {total_emprestimos_atrasados}
📅 Vencendo nesta semana: {total_emprestimos_semana}
💰 Valor total: {valores_totais}

Clientes:
{lista_clientes}$$,
  last_sent_date text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_manager_weekly_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own manager weekly prefs"
  ON public.telegram_manager_weekly_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users insert own manager weekly prefs"
  ON public.telegram_manager_weekly_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own manager weekly prefs"
  ON public.telegram_manager_weekly_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own manager weekly prefs"
  ON public.telegram_manager_weekly_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Service role manages manager weekly prefs"
  ON public.telegram_manager_weekly_prefs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_telegram_manager_weekly_prefs_updated_at
  BEFORE UPDATE ON public.telegram_manager_weekly_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
