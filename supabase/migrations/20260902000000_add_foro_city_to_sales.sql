-- Migration: Adicionar coluna foro_city na tabela sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS foro_city text DEFAULT NULL;
