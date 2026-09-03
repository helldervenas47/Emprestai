-- Garante que TODO novo cadastro receba automaticamente o papel 'cliente'.
-- Rode UMA VEZ no projeto EXTERNAL Supabase (mesmo onde o userClient aponta).

-- 1) Atualiza a função trigger para criar perfil + papel cliente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_metadata->>'full_name')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'cliente'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$$;

-- 2) (Re)cria o trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Backfill: usuários atuais sem nenhum papel passam a ser 'cliente'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'cliente'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;
