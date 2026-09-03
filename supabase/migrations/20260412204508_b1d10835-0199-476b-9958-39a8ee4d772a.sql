CREATE TABLE public.vehicle_balance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicle balance" ON public.vehicle_balance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vehicle balance" ON public.vehicle_balance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vehicle balance" ON public.vehicle_balance FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own vehicle balance" ON public.vehicle_balance FOR DELETE TO authenticated USING (auth.uid() = user_id);