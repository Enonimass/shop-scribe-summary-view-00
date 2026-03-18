
CREATE OR REPLACE FUNCTION public.verify_password(_password text, _hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
  SELECT _hash = extensions.crypt(_password, _hash);
$$;
