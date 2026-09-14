-- Supabase Auth hardening migration.
-- Applied to production and kept here as the repository migration record.
BEGIN;

ALTER TABLE public.pharmacy_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_users_auth_user_id_uidx ON public.pharmacy_users(auth_user_id) WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pharmacy_users_auth_user_id_fkey') THEN
    ALTER TABLE public.pharmacy_users
      ADD CONSTRAINT pharmacy_users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.pharmacy_users
SET role=lower(role),
    auth_user_id='70e222d9-604f-4b32-a477-b31ab6e39cc4',
    updated_at=now()
WHERE id='70e222d9-604f-4b32-a477-b31ab6e39cc4'
  AND email='admin@rgdev.pos';

ALTER TABLE public.pharmacy_users DROP COLUMN IF EXISTS password_hash;

CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.current_pharmacy_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
  SELECT role FROM public.pharmacy_users
  WHERE auth_user_id=(SELECT auth.uid()) AND status='active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.current_pharmacy_role() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.current_pharmacy_role() TO authenticated;

DROP FUNCTION IF EXISTS public.rls_auto_enable();
DROP FUNCTION IF EXISTS public.ensure_rls();

DROP POLICY IF EXISTS pharmacy_users_select ON public.pharmacy_users;
DROP POLICY IF EXISTS pharmacy_users_insert ON public.pharmacy_users;
DROP POLICY IF EXISTS pharmacy_users_update ON public.pharmacy_users;
DROP POLICY IF EXISTS pharmacy_users_delete ON public.pharmacy_users;

CREATE POLICY pharmacy_users_select ON public.pharmacy_users
FOR SELECT TO authenticated
USING (auth_user_id=(SELECT auth.uid()) OR (SELECT private.current_pharmacy_role())='admin');

CREATE POLICY pharmacy_users_insert ON public.pharmacy_users
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.current_pharmacy_role())='admin');

CREATE POLICY pharmacy_users_update ON public.pharmacy_users
FOR UPDATE TO authenticated
USING (auth_user_id=(SELECT auth.uid()) OR (SELECT private.current_pharmacy_role())='admin')
WITH CHECK (auth_user_id=(SELECT auth.uid()) OR (SELECT private.current_pharmacy_role())='admin');

CREATE POLICY pharmacy_users_delete ON public.pharmacy_users
FOR DELETE TO authenticated
USING ((SELECT private.current_pharmacy_role())='admin' AND auth_user_id <> (SELECT auth.uid()));

COMMIT;
