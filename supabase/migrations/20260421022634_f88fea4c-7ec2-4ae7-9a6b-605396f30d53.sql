CREATE TABLE public.active_capital_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  finalized boolean NOT NULL DEFAULT false,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_capital_snapshots_month_format_chk CHECK (month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT active_capital_snapshots_owner_month_key UNIQUE (owner_id, month)
);

CREATE INDEX idx_active_capital_snapshots_owner_month
  ON public.active_capital_snapshots (owner_id, month DESC);

ALTER TABLE public.active_capital_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active capital snapshots"
ON public.active_capital_snapshots
FOR SELECT
USING (owner_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert active capital snapshots"
ON public.active_capital_snapshots
FOR INSERT
WITH CHECK (
  owner_id = get_data_owner_id(auth.uid())
  AND can_write_data(auth.uid())
);

CREATE POLICY "Users can update open active capital snapshots"
ON public.active_capital_snapshots
FOR UPDATE
USING (
  owner_id = get_data_owner_id(auth.uid())
  AND can_write_data(auth.uid())
  AND finalized = false
)
WITH CHECK (
  owner_id = get_data_owner_id(auth.uid())
  AND finalized = false
);

CREATE POLICY "Users can delete open active capital snapshots"
ON public.active_capital_snapshots
FOR DELETE
USING (
  owner_id = get_data_owner_id(auth.uid())
  AND can_write_data(auth.uid())
  AND finalized = false
);

CREATE TRIGGER update_active_capital_snapshots_updated_at
BEFORE UPDATE ON public.active_capital_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prevent_finalized_active_capital_snapshot_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.finalized THEN
    RAISE EXCEPTION 'Snapshots de capital ativo já fechados não podem ser alterados';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_finalized_active_capital_snapshot_changes
BEFORE UPDATE OR DELETE ON public.active_capital_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.prevent_finalized_active_capital_snapshot_changes();

CREATE OR REPLACE FUNCTION public.upsert_active_capital_snapshot(
  _owner_id uuid,
  _month text,
  _amount numeric,
  _snapshot_date timestamptz DEFAULT now(),
  _finalize boolean DEFAULT false
)
RETURNS public.active_capital_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.active_capital_snapshots;
BEGIN
  INSERT INTO public.active_capital_snapshots (
    owner_id,
    month,
    amount,
    finalized,
    snapshot_date,
    last_calculated_at
  )
  VALUES (
    _owner_id,
    _month,
    _amount,
    _finalize,
    _snapshot_date,
    now()
  )
  ON CONFLICT (owner_id, month)
  DO UPDATE SET
    amount = CASE
      WHEN public.active_capital_snapshots.finalized THEN public.active_capital_snapshots.amount
      ELSE EXCLUDED.amount
    END,
    finalized = public.active_capital_snapshots.finalized OR EXCLUDED.finalized,
    snapshot_date = CASE
      WHEN public.active_capital_snapshots.finalized THEN public.active_capital_snapshots.snapshot_date
      ELSE EXCLUDED.snapshot_date
    END,
    last_calculated_at = CASE
      WHEN public.active_capital_snapshots.finalized THEN public.active_capital_snapshots.last_calculated_at
      ELSE now()
    END,
    updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;