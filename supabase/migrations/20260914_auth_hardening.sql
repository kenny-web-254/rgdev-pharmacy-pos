-- Supabase Auth hardening migration.
-- The production database migration was applied separately.
-- Keep this file as the repository record of the Auth/RLS hardening work.
BEGIN;
ALTER TABLE public.pharmacy_users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.pharmacy_users ALTER COLUMN id TYPE uuid USING id::uuid;
ALTER TABLE public.pharmacy_users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pharmacy_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE public.pharmacy_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
UPDATE public.pharmacy_users SET auth_user_id=id WHERE auth_user_id IS NULL AND id IN (SELECT id FROM auth.users);
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_users_auth_user_id_uidx ON public.pharmacy_users(auth_user_id) WHERE auth_user_id IS NOT NULL;
ALTER TABLE public.pharmacy_users ADD CONSTRAINT pharmacy_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
INSERT INTO public.pharmacy_users (id,username,name,role,status,email,auth_user_id) VALUES ('70e222d9-604f-4b32-a477-b31ab6e39cc4','admin','RGDev Administrator','admin','active','admin@rgdev.pos','70e222d9-604f-4b32-a477-b31ab6e39cc4') ON CONFLICT (id) DO UPDATE SET username=excluded.username,name=excluded.name,role=excluded.role,status=excluded.status,email=excluded.email,auth_user_id=excluded.auth_user_id,updated_at=now();
UPDATE auth.users SET raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role','admin') WHERE id='70e222d9-604f-4b32-a477-b31ab6e39cc4';
ALTER TABLE public.pharmacy_users DROP COLUMN IF EXISTS password_hash;
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();
COMMIT;
