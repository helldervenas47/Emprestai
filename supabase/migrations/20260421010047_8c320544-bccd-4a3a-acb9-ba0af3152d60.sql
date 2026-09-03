CREATE TABLE public.client_financial_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  source_status TEXT NOT NULL DEFAULT 'pending',
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMP WITH TIME ZONE,
  provider TEXT,
  monthly_income NUMERIC,
  debt_level NUMERIC,
  employment_stability TEXT,
  industry_sector TEXT,
  banking_relationship TEXT,
  external_score NUMERIC,
  internal_score NUMERIC,
  consolidated_score NUMERIC,
  risk_level TEXT,
  positive_factors TEXT[] NOT NULL DEFAULT '{}',
  negative_factors TEXT[] NOT NULL DEFAULT '{}',
  last_error TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

CREATE TABLE public.client_credit_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  delinquency_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  credit_history_summary TEXT,
  source_status TEXT NOT NULL DEFAULT 'pending',
  fetched_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.client_analysis_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_financial_profiles_owner_id ON public.client_financial_profiles(owner_id);
CREATE INDEX idx_client_financial_profiles_status ON public.client_financial_profiles(analysis_status, source_status);
CREATE INDEX idx_client_credit_reports_owner_client ON public.client_credit_reports(owner_id, client_id);
CREATE INDEX idx_client_credit_reports_provider ON public.client_credit_reports(provider);
CREATE INDEX idx_client_analysis_events_owner_client ON public.client_analysis_events(owner_id, client_id);
CREATE INDEX idx_client_analysis_events_created_at ON public.client_analysis_events(created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_client_analysis_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _client_owner UUID;
BEGIN
  SELECT user_id INTO _client_owner
  FROM public.clients
  WHERE id = NEW.client_id;

  IF _client_owner IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado para análise financeira';
  END IF;

  NEW.owner_id := _client_owner;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_client_financial_profile_owner
BEFORE INSERT OR UPDATE ON public.client_financial_profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_client_analysis_owner();

CREATE TRIGGER set_client_credit_report_owner
BEFORE INSERT OR UPDATE ON public.client_credit_reports
FOR EACH ROW
EXECUTE FUNCTION public.validate_client_analysis_owner();

CREATE TRIGGER set_client_analysis_event_owner
BEFORE INSERT OR UPDATE ON public.client_analysis_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_client_analysis_owner();

CREATE TRIGGER update_client_financial_profiles_updated_at
BEFORE UPDATE ON public.client_financial_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_credit_reports_updated_at
BEFORE UPDATE ON public.client_credit_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_financial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_analysis_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view financial profiles"
ON public.client_financial_profiles
FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can manage financial profiles"
ON public.client_financial_profiles
FOR ALL
TO authenticated
USING ((owner_id = public.get_data_owner_id(auth.uid())) AND public.can_write_data(auth.uid()))
WITH CHECK ((owner_id = public.get_data_owner_id(auth.uid())) AND public.can_write_data(auth.uid()));

CREATE POLICY "Service role manages financial profiles"
ON public.client_financial_profiles
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view credit reports"
ON public.client_credit_reports
FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Service role manages credit reports"
ON public.client_credit_reports
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view analysis events"
ON public.client_analysis_events
FOR SELECT
TO authenticated
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Service role manages analysis events"
ON public.client_analysis_events
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');