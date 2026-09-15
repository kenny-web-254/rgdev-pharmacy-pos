create or replace function private.reset_business_data()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role text;
  v_medications bigint;
  v_prescriptions bigint;
  v_tests bigint;
  v_sales bigint;
begin
  v_role := private.current_pharmacy_role();
  if v_role is distinct from 'admin' then
    raise exception 'Only ADMIN users can reset business data';
  end if;

  select count(*) into v_medications from public.medications;
  select count(*) into v_prescriptions from public.prescriptions;
  select count(*) into v_tests from public.tests;
  select count(*) into v_sales from public.sale_transactions;

  delete from public.tests;
  delete from public.prescriptions;
  delete from public.sale_transactions;
  delete from public.medications;

  return jsonb_build_object(
    'ok', true,
    'medications_deleted', v_medications,
    'prescriptions_deleted', v_prescriptions,
    'tests_deleted', v_tests,
    'sales_deleted', v_sales
  );
end;
$$;

revoke all on function private.reset_business_data() from public;
revoke all on function private.reset_business_data() from anon;
revoke all on function private.reset_business_data() from authenticated;

drop function if exists public.reset_business_data();
create or replace function public.reset_business_data()
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if private.current_pharmacy_role() is distinct from 'admin' then
    raise exception 'Only ADMIN users can reset business data';
  end if;
  return private.reset_business_data();
end;
$$;

revoke all on function public.reset_business_data() from public;
revoke all on function public.reset_business_data() from anon;
grant execute on function public.reset_business_data() to authenticated;
