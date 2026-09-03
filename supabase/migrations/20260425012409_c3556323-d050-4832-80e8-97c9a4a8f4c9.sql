-- 1) Add nullable column first
ALTER TABLE public.piggy_banks
  ADD COLUMN IF NOT EXISTS short_id smallint;

-- 2) Constraint: range 1..99
ALTER TABLE public.piggy_banks
  DROP CONSTRAINT IF EXISTS piggy_banks_short_id_range;
ALTER TABLE public.piggy_banks
  ADD CONSTRAINT piggy_banks_short_id_range
  CHECK (short_id IS NULL OR (short_id BETWEEN 1 AND 99));

-- 3) Backfill existing rows with sequential numbers per owner (by created_at)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM public.piggy_banks
  WHERE short_id IS NULL
)
UPDATE public.piggy_banks pb
SET short_id = ranked.rn
FROM ranked
WHERE pb.id = ranked.id
  AND ranked.rn BETWEEN 1 AND 99;

-- 4) Unique per owner (only when short_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS piggy_banks_user_short_id_uniq
  ON public.piggy_banks (user_id, short_id)
  WHERE short_id IS NOT NULL;