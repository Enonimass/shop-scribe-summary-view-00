
-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash all existing plaintext passwords
UPDATE public.profiles
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';

-- Create a trigger function to auto-hash passwords on insert/update
CREATE OR REPLACE FUNCTION public.hash_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only hash if the password is not already a bcrypt hash
  IF NEW.password IS NOT NULL AND NEW.password NOT LIKE '$2a$%' AND NEW.password NOT LIKE '$2b$%' THEN
    NEW.password := crypt(NEW.password, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger on insert and update
CREATE TRIGGER hash_password_trigger
BEFORE INSERT OR UPDATE OF password ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.hash_password();
