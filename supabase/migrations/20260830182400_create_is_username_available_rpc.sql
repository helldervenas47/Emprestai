-- Criação de RPC para checar disponibilidade de username burlando RLS para novos usuários

CREATE OR REPLACE FUNCTION is_username_available(username_to_check text, ignore_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_available boolean;
BEGIN
    IF ignore_user_id IS NOT NULL THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM profiles WHERE username = username_to_check AND user_id != ignore_user_id
        ) INTO is_available;
    ELSE
        SELECT NOT EXISTS (
            SELECT 1 FROM profiles WHERE username = username_to_check
        ) INTO is_available;
    END IF;
    
    RETURN is_available;
END;
$$;
