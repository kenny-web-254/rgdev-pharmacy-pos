-- Production hardening applied to the live Supabase project.
-- This migration records the database changes made for multi-device operation.

begin;

-- Authenticated frontend RPC wrapper. The privileged implementation remains in private.
create or replace function public.complete_sale(p_transaction jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select private.complete_sale(p_transaction);
$$;
revoke all on function public.complete_sale(jsonb) from public;
revoke all on function public.complete_sale(jsonb) from anon;
grant execute on function public.complete_sale(jsonb) to authenticated;

-- Realtime publication for shared operational state.
do $$
declare
  t text;
begin
  foreach t in array array[
    'medications','prescriptions','tests','patients','consultations','clinical_tests',
    'sale_transactions','receipt_settings','pharmacy_users','audit_logs'
  ] loop
    execute format('alter table public.%I replica identity default', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Foreign-key indexes for clinical/prescription lookup and update performance.
create index if not exists clinical_tests_consultation_id_idx on public.clinical_tests (consultation_id);
create index if not exists prescriptions_medication_id_idx on public.prescriptions (medication_id);
create index if not exists tests_linked_prescription_id_idx on public.tests (linked_prescription_id);

-- Receipt configuration is non-sensitive application configuration and must be readable
-- by authenticated POS/clinical sessions so every device uses the same receipt settings.
drop policy if exists settings_select on public.receipt_settings;
create policy settings_select on public.receipt_settings
for select to authenticated
using ((select private.current_pharmacy_role()) in ('admin','clinician','cashier'));

commit;
