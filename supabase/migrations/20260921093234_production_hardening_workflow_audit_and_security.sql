-- Production hardening migration for RG Pharma-POS.
-- This file mirrors the database changes applied under migration
-- 20260921093234_production_hardening_workflow_audit_and_security.
-- The earlier 20260920143000 migration contains the private inventory-import
-- implementation and is intentionally kept replayable.

-- Canonical prescription statuses.
update public.prescriptions
set status = case lower(trim(status))
  when 'draft' then 'DRAFT'
  when 'active' then 'ISSUED'
  when 'issued' then 'ISSUED'
  when 'partially dispensed' then 'PARTIALLY_DISPENSED'
  when 'partially_dispensed' then 'PARTIALLY_DISPENSED'
  when 'dispensed' then 'DISPENSED'
  when 'cancelled' then 'CANCELLED'
  when 'expired' then 'EXPIRED'
  else 'ISSUED'
end;

alter table public.prescriptions drop constraint if exists prescriptions_status_check;
alter table public.prescriptions
  add constraint prescriptions_status_check
  check (status = any (array[
    'DRAFT'::text,'ISSUED'::text,'PARTIALLY_DISPENSED'::text,
    'DISPENSED'::text,'CANCELLED'::text,'EXPIRED'::text
  ]));
alter table public.prescriptions alter column status set default 'ISSUED';

-- Consolidate laboratory records into clinical_tests while preserving the old
-- tests relation as a compatibility view.
alter table public.clinical_tests
  add column if not exists test_number text,
  add column if not exists patient_dob date,
  add column if not exists patient_phone text not null default '',
  add column if not exists clinician_name text not null default '',
  add column if not exists clinician_license text not null default '',
  add column if not exists test_type text not null default 'General Laboratory Test',
  add column if not exists date_ordered date not null default current_date,
  add column if not exists result_summary text,
  add column if not exists result_date date,
  add column if not exists linked_prescription_id text;

do $function$
begin
  if to_regclass('public.tests') is not null and
     exists (select 1 from pg_class where oid = 'public.tests'::regclass and relkind = 'r') then
    insert into public.clinical_tests(
      id, patient_id, patient_name, test_name, status, notes, requested_by,
      created_at, test_number, patient_dob, patient_phone, clinician_name,
      clinician_license, test_type, date_ordered, result_summary, result_date,
      linked_prescription_id
    )
    select
      coalesce(nullif(t.id,''), gen_random_uuid()::text),
      p.id,
      t.patient_name,
      t.test_type,
      case t.status
        when 'Ordered' then 'Pending'
        when 'In Progress' then 'In Progress'
        when 'Completed' then 'Completed'
        when 'Cancelled' then 'Cancelled'
        else 'Pending'
      end,
      coalesce(t.notes,''),
      coalesce(nullif(t.clinician_name,''), 'Clinical Staff'),
      coalesce(t.created_at, now()),
      coalesce(nullif(t.test_number,''), 'TST-' || substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      t.patient_dob,
      coalesce(t.patient_phone,''),
      coalesce(t.clinician_name,''),
      coalesce(t.clinician_license,''),
      t.test_type,
      coalesce(t.date_ordered, current_date),
      t.result_summary,
      t.result_date,
      t.linked_prescription_id
    from public.tests t
    left join public.patients p
      on lower(btrim(p.full_name)) = lower(btrim(t.patient_name))
     and p.dob = t.patient_dob
     and (nullif(btrim(t.patient_phone),'') is null or btrim(p.phone)=btrim(t.patient_phone))
    where not exists (
      select 1 from public.clinical_tests c where c.id = t.id
    );
  end if;
end
$function$;

update public.clinical_tests c
set test_number = coalesce(c.test_number, 'TST-' || substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    test_type = coalesce(nullif(c.test_type,''), c.test_name),
    date_ordered = coalesce(c.date_ordered, (c.created_at at time zone 'Africa/Nairobi')::date),
    clinician_name = coalesce(nullif(c.clinician_name,''), c.requested_by),
    patient_dob = coalesce(c.patient_dob, (select p.dob from public.patients p where p.id=c.patient_id)),
    patient_phone = case when c.patient_phone='' then coalesce((select p.phone from public.patients p where p.id=c.patient_id),'') else c.patient_phone end,
    result_summary = coalesce(c.result_summary,c.results);

create unique index if not exists clinical_tests_test_number_uidx on public.clinical_tests(test_number);

drop table if exists public.tests cascade;

create view public.tests
with (security_invoker = true)
as
select
  id,
  test_number,
  patient_name,
  patient_dob,
  patient_phone,
  clinician_name,
  clinician_license,
  test_type,
  notes,
  date_ordered,
  case status
    when 'Pending' then 'Ordered'
    when 'In Progress' then 'In Progress'
    when 'Completed' then 'Completed'
    when 'Cancelled' then 'Cancelled'
    else 'Ordered'
  end as status,
  result_summary,
  result_date,
  linked_prescription_id,
  created_at,
  created_at as updated_at
from public.clinical_tests;

create or replace function private.tests_compat_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := lower(private.current_pharmacy_role());
  v_patient public.patients;
  v_patient_id text;
  v_status text;
begin
  if v_role is null or v_role not in ('admin','clinician') then
    raise exception 'Unauthorized clinical test operation';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    if nullif(btrim(new.patient_name),'') is null
       or new.patient_dob is null
       or nullif(btrim(new.test_type),'') is null then
      raise exception 'Patient name, date of birth and test type are required';
    end if;

    select *
    into v_patient
    from public.patients p
    where lower(btrim(p.full_name)) = lower(btrim(new.patient_name))
      and p.dob = new.patient_dob
      and (nullif(btrim(coalesce(new.patient_phone,'')),'') is null or btrim(p.phone)=btrim(new.patient_phone))
    order by p.created_at asc
    limit 1;

    if not found then
      raise exception 'Patient must be registered before a clinical test can be ordered';
    end if;

    v_patient_id := v_patient.id;
    v_status := case coalesce(new.status,'Ordered')
      when 'Ordered' then 'Pending'
      when 'In Progress' then 'In Progress'
      when 'Completed' then 'Completed'
      when 'Cancelled' then 'Cancelled'
      else 'Pending'
    end;

    if tg_op='INSERT' then
      insert into public.clinical_tests(
        id, consultation_id, patient_id, patient_name, test_name, category, status,
        results, reference_ranges, notes, requested_by, conducted_at, created_at,
        test_number, patient_dob, patient_phone, clinician_name, clinician_license,
        test_type, date_ordered, result_summary, result_date, linked_prescription_id
      )
      values(
        coalesce(nullif(new.id,''),gen_random_uuid()::text),
        null,v_patient_id,btrim(new.patient_name),btrim(new.test_type),'Other',v_status,
        nullif(new.result_summary,''),null,coalesce(new.notes,''),
        coalesce(nullif(btrim(new.clinician_name),''),v_role),null,coalesce(new.created_at,now()),
        coalesce(nullif(btrim(new.test_number),''),'TST-' || substr(replace(gen_random_uuid()::text,'-',''),1,10)),
        new.patient_dob,coalesce(new.patient_phone,''),
        coalesce(new.clinician_name,''),coalesce(new.clinician_license,''),
        btrim(new.test_type),coalesce(new.date_ordered,current_date),
        new.result_summary,new.result_date,new.linked_prescription_id
      );
    else
      update public.clinical_tests
      set patient_id=v_patient_id,
          patient_name=btrim(new.patient_name),
          test_name=btrim(new.test_type),
          status=v_status,
          results=new.result_summary,
          notes=coalesce(new.notes,''),
          requested_by=coalesce(nullif(btrim(new.clinician_name),''),requested_by),
          test_number=coalesce(nullif(btrim(new.test_number),''),test_number),
          patient_dob=new.patient_dob,
          patient_phone=coalesce(new.patient_phone,''),
          clinician_name=coalesce(new.clinician_name,''),
          clinician_license=coalesce(new.clinician_license,''),
          test_type=btrim(new.test_type),
          date_ordered=coalesce(new.date_ordered,date_ordered),
          result_summary=new.result_summary,
          result_date=new.result_date,
          linked_prescription_id=new.linked_prescription_id
      where id=new.id;
    end if;

    return new;
  elsif tg_op='DELETE' then
    delete from public.clinical_tests where id=old.id;
    return old;
  end if;
  return null;
end;
$function$;

drop trigger if exists tests_compat_write on public.tests;
create trigger tests_compat_write
instead of insert or update or delete on public.tests
for each row execute function private.tests_compat_write();

revoke all on public.tests from anon;
grant select,insert,update,delete on public.tests to authenticated;

-- Inventory movement ledger.
create table if not exists public.inventory_movements(
  id text primary key default gen_random_uuid()::text,
  medication_id text not null references public.medications(id),
  medication_name text not null,
  movement_type text not null check (movement_type = any(array[
    'IMPORT_ADD'::text,'IMPORT_REDUCE'::text,'IMPORT_SET'::text,
    'SALE'::text,'RETURN'::text,'MANUAL_ADJUSTMENT'::text,'DAMAGE_WRITE_OFF'::text
  ])),
  quantity_change integer not null check (quantity_change<>0),
  previous_stock integer not null check (previous_stock>=0),
  new_stock integer not null check (new_stock>=0),
  batch_number text,
  reason text,
  user_id uuid,
  user_name text,
  sale_transaction_id text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_medication_idx
  on public.inventory_movements(medication_id,created_at desc);
create index if not exists inventory_movements_sale_idx
  on public.inventory_movements(sale_transaction_id);
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon;
grant select on public.inventory_movements to authenticated;
drop policy if exists inventory_movements_admin_select on public.inventory_movements;
create policy inventory_movements_admin_select on public.inventory_movements
for select to authenticated
using (lower(private.current_pharmacy_role())='admin');

-- Authoritative atomic sale/dispense.
create or replace function private.complete_sale(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_name text;
  v_existing public.sale_transactions;
  v_item jsonb;
  v_med_id text;
  v_qty integer;
  v_rx_id text:=nullif(p_transaction->>'prescriptionId','');
  v_rx public.prescriptions;
  v_item_id text;
  v_rx_item public.prescription_items;
  v_total_disp integer;
  v_receipt text;
  v_previous_stock integer;
  v_new_stock integer;
  v_payment text;
  v_tender numeric;
begin
  if p_transaction is null or jsonb_typeof(p_transaction)<>'object' then raise exception 'Invalid sale transaction payload'; end if;
  if nullif(trim(p_transaction->>'id'),'') is null then raise exception 'Sale transaction ID is required for idempotent processing'; end if;
  v_role:=lower(private.current_pharmacy_role());
  if v_role is null or v_role not in ('admin','cashier') then raise exception 'Sale rejected: active Admin or Cashier session required'; end if;
  select pu.name into v_name from public.pharmacy_users pu where pu.auth_user_id=auth.uid() and lower(pu.status)='active' limit 1;
  select * into v_existing from public.sale_transactions where id=p_transaction->>'id';
  if found then return jsonb_build_object('ok',true,'idempotent',true,'sale_id',v_existing.id,'receipt_number',v_existing.receipt_number); end if;
  if jsonb_typeof(p_transaction->'items')<>'array' or jsonb_array_length(p_transaction->'items')=0 then raise exception 'Sale must contain at least one medication'; end if;
  if coalesce((p_transaction->>'total')::numeric,0)<0 or coalesce((p_transaction->>'subtotal')::numeric,0)<0 or coalesce((p_transaction->>'discount')::numeric,0)<0 then raise exception 'Invalid sale totals'; end if;
  v_payment:=p_transaction->>'payment_method';
  if v_payment not in ('Cash','M-Pesa','Partial (Cash + M-Pesa)','Credit/Debit Card','Insurance') then raise exception 'Unsupported payment method'; end if;
  v_tender:=coalesce((p_transaction->>'amount_tendered')::numeric,0);
  if v_payment='Cash' and v_tender<coalesce((p_transaction->>'total')::numeric,0) then raise exception 'Insufficient cash tendered'; end if;
  if v_payment='Partial (Cash + M-Pesa)' and coalesce((p_transaction->>'cash_amount')::numeric,0)+coalesce((p_transaction->>'mpesa_amount')::numeric,0)<coalesce((p_transaction->>'total')::numeric,0) then raise exception 'Combined payment is less than sale total'; end if;
  if v_payment in ('M-Pesa','Partial (Cash + M-Pesa)') and nullif(trim(p_transaction->>'mpesa_reference'),'') is null then raise exception 'M-Pesa confirmation reference is required'; end if;
  if v_payment='Credit/Debit Card' and nullif(trim(p_transaction->>'card_auth_code'),'') is null then raise exception 'Card authorization code is required'; end if;
  if v_payment='Insurance' and nullif(trim(p_transaction->>'insurance_policy_number'),'') is null then raise exception 'Insurance policy number is required'; end if;
  if v_payment='Insurance' and nullif(trim(p_transaction->>'insurance_auth_code'),'') is null then raise exception 'Insurance authorization code is required'; end if;

  if v_rx_id is not null then
    select * into v_rx from public.prescriptions where id=v_rx_id for update;
    if not found then raise exception 'Prescription not found'; end if;
    if lower(v_rx.status) not in ('issued','partially_dispensed') then raise exception 'Prescription is not available for dispensing'; end if;
    if v_rx.expiry_date is not null and v_rx.expiry_date<(now() at time zone 'Africa/Nairobi')::date then
      update public.prescriptions set status='EXPIRED',updated_at=now() where id=v_rx.id;
      raise exception 'Prescription has expired';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_transaction->'items') loop
    v_med_id:=nullif(v_item->>'medicationId','');
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_med_id is null or v_qty<=0 then raise exception 'Invalid medication or quantity in sale'; end if;

    select m.stock into v_previous_stock
    from public.medications m
    where m.id=v_med_id and m.expiry_date >= (now() at time zone 'Africa/Nairobi')::date
    for update;

    if not found then
      if exists(select 1 from public.medications where id=v_med_id) then raise exception 'Cannot sell medication: medication is expired'; else raise exception 'Medication does not exist'; end if;
    end if;
    if v_previous_stock<v_qty then raise exception 'Cannot sell medication: insufficient stock'; end if;
    v_new_stock:=v_previous_stock-v_qty;

    update public.medications set stock=v_new_stock,updated_at=now() where id=v_med_id;

    insert into public.inventory_movements(
      medication_id,medication_name,movement_type,quantity_change,previous_stock,new_stock,
      batch_number,reason,user_id,user_name,sale_transaction_id
    )
    select m.id,m.name,'SALE',-v_qty,v_previous_stock,v_new_stock,m.batch_number,
      'Sale '||p_transaction->>'id',auth.uid(),v_name,p_transaction->>'id'
    from public.medications m where m.id=v_med_id;

    if v_rx_id is not null then
      v_item_id:=nullif(v_item->>'prescriptionItemId','');
      if v_item_id is null then raise exception 'Prescription sale item is missing its prescription-item link'; end if;
      select * into v_rx_item from public.prescription_items where id=v_item_id and prescription_id=v_rx_id for update;
      if not found then raise exception 'Prescription item not found'; end if;
      if v_rx_item.medication_id is not null and v_rx_item.medication_id<>v_med_id then raise exception 'Selected medication does not match prescription'; end if;
      if v_qty>(v_rx_item.quantity-v_rx_item.quantity_dispensed) then raise exception 'Dispensing quantity exceeds prescription balance'; end if;
      update public.prescription_items
      set quantity_dispensed=quantity_dispensed+v_qty,
          dispensing_status=case when quantity_dispensed+v_qty>=quantity then 'DISPENSED' else 'PARTIALLY_DISPENSED' end,
          updated_at=now()
      where id=v_item_id;
    end if;
  end loop;

  if v_rx_id is not null then
    select coalesce(sum(quantity_dispensed),0) into v_total_disp from public.prescription_items where prescription_id=v_rx_id;
    update public.prescriptions set quantity_dispensed_so_far=v_total_disp,
      status=case
        when not exists(select 1 from public.prescription_items where prescription_id=v_rx_id and dispensing_status<>'CANCELLED') then 'CANCELLED'
        when exists(select 1 from public.prescription_items where prescription_id=v_rx_id and dispensing_status<>'CANCELLED' and quantity_dispensed<quantity) then 'PARTIALLY_DISPENSED'
        else 'DISPENSED'
      end,
      updated_at=now()
    where id=v_rx_id;
  end if;

  v_receipt:=coalesce(nullif(p_transaction->>'receipt_number',''),
    'RC'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||lpad(nextval('public.receipt_number_seq')::text,5,'0'));

  insert into public.sale_transactions
  select (jsonb_populate_record(null::public.sale_transactions,p_transaction||jsonb_build_object(
    'receipt_number',v_receipt,'cashier_name',coalesce(v_name,p_transaction->>'cashier_name','Unknown'),
    'cashier_role',v_role,'created_at',now(),'synced',true,'sync_timestamp',now()
  ))).* returning * into v_existing;

  perform private.audit('SALE_COMPLETED','Sale '||v_existing.receipt_number||' completed','SALES',
    jsonb_build_object('sale_id',v_existing.id,'prescription_id',v_rx_id));
  return jsonb_build_object('ok',true,'idempotent',false,'sale_id',v_existing.id,'receipt_number',v_existing.receipt_number);
end;
$function$;

-- Authoritative admin inventory adjustment.
create or replace function private.adjust_inventory(p_medication_id text,p_new_stock integer,p_reason text,p_batch_number text default null,p_expiry_date date default null)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_role text:=lower(private.current_pharmacy_role());
  v_med public.medications;
  v_diff integer;
  v_name text;
  v_batch text;
  v_expiry date;
begin
  if v_role<>'admin' then raise exception 'Only administrators may adjust inventory'; end if;
  if p_new_stock is null or p_new_stock<0 then raise exception 'Stock cannot be negative'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Adjustment reason is required'; end if;
  select * into v_med from public.medications where id=p_medication_id for update;
  if not found then raise exception 'Medication not found'; end if;
  v_batch:=coalesce(nullif(trim(p_batch_number),''),v_med.batch_number);
  v_expiry:=coalesce(p_expiry_date,v_med.expiry_date);
  if nullif(trim(coalesce(v_batch,'')),'') is null or v_expiry is null then raise exception 'Batch and expiry are required'; end if;
  v_diff:=p_new_stock-v_med.stock;
  select name into v_name from public.pharmacy_users where auth_user_id=auth.uid() and lower(status)='active' limit 1;
  update public.medications set stock=p_new_stock,batch_number=v_batch,expiry_date=v_expiry,updated_at=now() where id=v_med.id;
  if v_diff<>0 then
    insert into public.inventory_movements(medication_id,medication_name,movement_type,quantity_change,previous_stock,new_stock,batch_number,reason,user_id,user_name)
    values(v_med.id,v_med.name,'MANUAL_ADJUSTMENT',v_diff,v_med.stock,p_new_stock,v_batch,trim(p_reason),auth.uid(),v_name);
  end if;
  perform private.audit('STOCK_ADJUSTMENT','Adjusted '||v_med.name||' stock from '||v_med.stock||' to '||p_new_stock,'INVENTORY',
    jsonb_build_object('medication_id',v_med.id,'reason',trim(p_reason),'difference',v_diff));
  return jsonb_build_object('ok',true,'changed',v_diff<>0,'medication_id',v_med.id,'stock',p_new_stock);
end;
$function$;

create or replace function public.adjust_inventory(p_medication_id text,p_new_stock integer,p_reason text,p_batch_number text default null,p_expiry_date date default null)
returns jsonb language sql security invoker set search_path=public,private,pg_temp
as $function$ select private.adjust_inventory(p_medication_id,p_new_stock,p_reason,p_batch_number,p_expiry_date); $function$;
revoke all on function public.adjust_inventory(text,integer,text,text,date) from public;
revoke all on function public.adjust_inventory(text,integer,text,text,date) from anon;
grant execute on function public.adjust_inventory(text,integer,text,text,date) to authenticated;

-- Hide internal purchase costs from non-admin clients.
create or replace function private.get_medications_for_session()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_role text:=lower(private.current_pharmacy_role()); v_data jsonb;
begin
  if v_role='admin' then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.name,m.id),'[]'::jsonb) into v_data from public.medications m;
  elsif v_role in ('clinician','cashier') then
    select coalesce(jsonb_agg((to_jsonb(m)-'cost_price'-'unit_cost') order by m.name,m.id),'[]'::jsonb) into v_data from public.medications m;
  else raise exception 'Authenticated pharmacy role required'; end if;
  return v_data;
end;
$function$;

create or replace function public.get_medications_for_session()
returns jsonb language sql security invoker set search_path=public,private,pg_temp
as $function$ select private.get_medications_for_session(); $function$;
revoke all on function public.get_medications_for_session() from public;
revoke all on function public.get_medications_for_session() from anon;
grant execute on function public.get_medications_for_session() to authenticated;
revoke select(cost_price,unit_cost) on public.medications from anon;
revoke select(cost_price,unit_cost) on public.medications from authenticated;

-- Clinical prescription creation with server-generated Rx number/barcode.
create or replace function private.create_clinical_prescription(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='pg_catalog','public','private'
as $function$
declare
  v_role text:=lower(private.current_pharmacy_role());
  v_parent jsonb:=p_payload->'prescription';
  v_items jsonb:=p_payload->'items';
  v_id text:=v_parent->>'id';
  v_patient_id text:=v_parent->>'patient_id';
  v_visit_id text:=v_parent->>'visit_id';
  v_consultation_id text:=nullif(v_parent->>'consultation_id','');
  v_item jsonb;
  v_rx_number text;
  v_barcode text;
  v_status text;
begin
  if v_role is null or v_role not in ('admin','clinician') then raise exception 'Unauthorized clinical prescription operation'; end if;
  if jsonb_typeof(v_parent)<>'object' or jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then raise exception 'Invalid prescription payload'; end if;
  if nullif(v_id,'') is null or nullif(v_patient_id,'') is null or nullif(v_visit_id,'') is null then raise exception 'Prescription must include patient and visit'; end if;
  if not exists(select 1 from public.patients where id=v_patient_id) then raise exception 'Patient record does not exist'; end if;
  if not exists(select 1 from public.visits where id=v_visit_id and patient_id=v_patient_id) then raise exception 'Visit does not belong to patient'; end if;
  if v_consultation_id is not null and not exists(select 1 from public.consultations where id=v_consultation_id and patient_id=v_patient_id and visit_id=v_visit_id) then raise exception 'Consultation does not belong to patient visit'; end if;

  v_rx_number:=nullif(trim(v_parent->>'rx_number'),'');
  if v_rx_number is null or upper(v_rx_number)='PENDING' then
    v_rx_number:='RX-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDDHH24MISS')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6);
  end if;
  v_barcode:=nullif(trim(v_parent->>'barcode'),'');
  if v_barcode is null or upper(v_barcode)='PENDING' then v_barcode:=v_rx_number; end if;

  v_status:=upper(coalesce(nullif(trim(v_parent->>'status'),''),'ISSUED'));
  if v_status='ACTIVE' then v_status='ISSUED'; end if;
  if v_status not in ('DRAFT','ISSUED','PARTIALLY_DISPENSED','DISPENSED','CANCELLED','EXPIRED') then v_status='ISSUED'; end if;

  insert into public.prescriptions(
    id,rx_number,barcode,patient_id,visit_id,consultation_id,patient_name,patient_dob,patient_phone,
    doctor_name,doctor_license,doctor_clinic,medication_id,medication_name,dosage_instructions,
    quantity_prescribed,quantity_dispensed_so_far,refills_allowed,refills_remaining,date_issued,expiry_date,
    status,insurance_provider,insurance_co_pay_rate
  )
  values(
    v_id,v_rx_number,v_barcode,v_patient_id,v_visit_id,v_consultation_id,
    v_parent->>'patient_name',(v_parent->>'patient_dob')::date,v_parent->>'patient_phone',
    v_parent->>'doctor_name',coalesce(v_parent->>'doctor_license',''),coalesce(v_parent->>'doctor_clinic',''),
    nullif(v_parent->>'medication_id',''),v_parent->>'medication_name',coalesce(v_parent->>'dosage_instructions',''),
    greatest(1,(v_parent->>'quantity_prescribed')::integer),0,0,0,
    (v_parent->>'date_issued')::date,(v_parent->>'expiry_date')::date,
    v_status,nullif(v_parent->>'insurance_provider',''),coalesce((v_parent->>'insurance_co_pay_rate')::numeric,0)
  );

  for v_item in select value from jsonb_array_elements(v_items) loop
    if coalesce(length(trim(v_item->>'medication_name')),0)=0 or coalesce((v_item->>'quantity')::integer,0)<=0 then
      raise exception 'Each prescription item requires a medication name and positive quantity';
    end if;
    insert into public.prescription_items(
      id,prescription_id,medication_id,medication_name,dosage,frequency,duration,quantity,instructions,dispensing_status,quantity_dispensed
    )
    values(
      coalesce(nullif(v_item->>'id',''),gen_random_uuid()::text),v_id,nullif(v_item->>'medication_id',''),
      v_item->>'medication_name',coalesce(v_item->>'dosage',''),coalesce(v_item->>'frequency',''),
      coalesce(v_item->>'duration',''),(v_item->>'quantity')::integer,coalesce(v_item->>'instructions',''),'PENDING',0
    );
  end loop;

  perform private.audit('CLINICAL_PRESCRIPTION_CREATED','Created prescription '||v_rx_number,'CLINICAL',
    jsonb_build_object('prescription_id',v_id,'patient_id',v_patient_id,'visit_id',v_visit_id,'rx_number',v_rx_number));
  return jsonb_build_object('ok',true,'id',v_id,'rx_number',v_rx_number,'barcode',v_barcode,'status',v_status);
end;
$function$;

-- Normalize roles in clinical helper functions.
create or replace function private.start_visit(p_patient_id text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_role text:=lower(private.current_pharmacy_role()); v_ex public.visits; v_id text:=gen_random_uuid()::text; v_num text; v_uid uuid;
begin
  if v_role is null or v_role not in ('admin','clinician') then raise exception 'Only clinical staff can start visits'; end if;
  if not exists(select 1 from public.patients where id=p_patient_id) then raise exception 'Patient record does not exist'; end if;
  select * into v_ex from public.visits where patient_id=p_patient_id and status='ACTIVE' limit 1;
  if found then return jsonb_build_object('ok',true,'id',v_ex.id,'visit_number',v_ex.visit_number,'existing',true); end if;
  select id into v_uid from public.pharmacy_users where auth_user_id=auth.uid();
  v_num:='V'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||lpad(nextval('public.visit_number_seq')::text,4,'0');
  insert into public.visits(id,patient_id,visit_number,created_by) values(v_id,p_patient_id,v_num,v_uid);
  perform private.audit('VISIT_STARTED','Started visit '||v_num,'CLINICAL',jsonb_build_object('visit_id',v_id,'patient_id',p_patient_id));
  return jsonb_build_object('ok',true,'id',v_id,'visit_number',v_num,'existing',false);
end;
$function$;

-- Remove implicit PUBLIC execution from privileged private functions.
revoke execute on function private.complete_sale(jsonb) from public;
revoke execute on function private.import_inventory(jsonb) from public;
revoke execute on function private.adjust_inventory(text,integer,text,text,date) from public;
revoke execute on function private.get_medications_for_session() from public;
revoke execute on function private.create_clinical_prescription(jsonb) from public;
revoke execute on function private.start_visit(text) from public;
revoke execute on function private.register_patient(jsonb) from public;
revoke execute on function private.tests_compat_write() from public;
