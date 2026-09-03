UPDATE public.expenses
SET description = upper(left(trim(description), 1)) || substring(trim(description) from 2)
WHERE notes ILIKE '%[bot]%'
  AND description IS NOT NULL
  AND length(trim(description)) > 0
  AND left(trim(description), 1) <> upper(left(trim(description), 1));