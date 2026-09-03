-- Reclassifica para "Combustível" despesas criadas pelo bot do Telegram que foram
-- remapeadas indevidamente para "Transporte". Critério conservador: notes contém
-- o marcador "[bot]" e a descrição/notas mencionam termos típicos de abastecimento.
UPDATE public.expenses
SET category = 'Combustível'
WHERE category = 'Transporte'
  AND COALESCE(notes, '') ILIKE '%[bot]%'
  AND (
    description ~* '(gasolina|combust[ií]vel|etanol|[áa]lcool|diesel|posto|abastec|shell|ipiranga|petrobras|br mania)'
    OR COALESCE(notes, '') ~* '(gasolina|combust[ií]vel|etanol|[áa]lcool|diesel|posto|abastec|shell|ipiranga|petrobras|br mania)'
  );