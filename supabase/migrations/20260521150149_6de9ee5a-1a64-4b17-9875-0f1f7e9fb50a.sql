UPDATE public.chart_overrides SET juros = 0 WHERE juros <> 0;
DELETE FROM public.chart_overrides WHERE emprestado = 0 AND recebido = 0 AND juros = 0;