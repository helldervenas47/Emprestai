
CREATE TABLE public.monthly_goal_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  month TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  target_value NUMERIC,
  realized_value NUMERIC NOT NULL DEFAULT 0,
  attainment_pct NUMERIC,
  finalized BOOLEAN NOT NULL DEFAULT true,
  snapshot_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (owner_id, month, goal_type)
);

CREATE INDEX idx_mgs_owner_month ON public.monthly_goal_snapshots(owner_id, month);

ALTER TABLE public.monthly_goal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their goal snapshots"
ON public.monthly_goal_snapshots FOR SELECT
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Owners can insert their goal snapshots"
ON public.monthly_goal_snapshots FOR INSERT
WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owners can update their goal snapshots"
ON public.monthly_goal_snapshots FOR UPDATE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Owners can delete their goal snapshots"
ON public.monthly_goal_snapshots FOR DELETE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_finalized_goal_snapshot_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized THEN
      RAISE EXCEPTION 'Snapshots de metas já fechados não podem ser excluídos';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.finalized AND NEW.finalized THEN
    RAISE EXCEPTION 'Snapshots de metas já fechados não podem ser alterados';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_finalized_goal_snapshot_update
BEFORE UPDATE ON public.monthly_goal_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_goal_snapshot_changes();

CREATE TRIGGER trg_prevent_finalized_goal_snapshot_delete
BEFORE DELETE ON public.monthly_goal_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_goal_snapshot_changes();

CREATE TRIGGER trg_mgs_updated_at
BEFORE UPDATE ON public.monthly_goal_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
