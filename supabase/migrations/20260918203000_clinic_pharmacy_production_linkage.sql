-- Production clinic/pharmacy linkage hardening.
-- Applied to Supabase project fhnpvjrgqhchnuagwwlt on 2026-09-18.
-- Source of truth for future environments; keep this migration in version control.

alter table public.patients
  alter column patient_number set default (
    'P' || to_char(now() at time zone 'Africa/Nairobi','YY') ||
    lpad(nextval('public.patient_number_seq')::text,6,'0')
  );

create or replace function private.register_patient(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text := private.current_pharmacy_role();
  v_existing public.patients;
  v_id text := coalesce(nullif(p->>'id',''), gen_random_uuid()::text);
  v_patient public.patients;
begin
  if v_role is null or v_role not in ('admin','clinician') then
    raise exception 'Only clinical staff can register patients';
  end if;

  if nullif(btrim(p->>'full_name'),'') is null
     or nullif(p->>'dob','') is null
     or nullif(btrim(p->>'phone'),'') is null then
    raise exception 'Patient name, date of birth and phone are required';
  end if;

  select * into v_existing
  from public.patients
  where lower(btrim(full_name)) = lower(btrim(p->>'full_name'))
    and dob = (p->>'dob')::date
    and btrim(phone) = btrim(p->>'phone')
  order by created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'existing', true,
      'patient', jsonb_build_object(
        'id', v_existing.id, 'patient_number', v_existing.patient_number,
        'full_name', v_existing.full_name, 'dob', v_existing.dob,
        'gender', v_existing.gender, 'phone', v_existing.phone,
        'email', v_existing.email, 'address', v_existing.address,
        'allergies', v_existing.allergies,
        'insurance_provider', v_existing.insurance_provider,
        'insurance_policy_number', v_existing.insurance_policy_number,
        'created_at', v_existing.created_at
      )
    );
  end if;

  insert into public.patients (
    id, full_name, dob, gender, phone, email, address, allergies,
    insurance_provider, insurance_policy_number
  )
  values (
    v_id, btrim(p->>'full_name'), (p->>'dob')::date,
    coalesce(nullif(p->>'gender',''),'Other'), btrim(p->>'phone'),
    nullif(btrim(p->>'email'),''),
    nullif(btrim(p->>'address'),''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'allergies','[]'::jsonb))), '{}'::text[]),
    nullif(btrim(p->>'insurance_provider'),''),
    nullif(btrim(p->>'insurance_policy_number'),'')
  )
  returning * into v_patient;

  perform private.audit(
    'PATIENT_REGISTERED',
    'Registered patient ' || v_patient.patient_number,
    'CLINICAL',
    jsonb_build_object('patient_id',v_patient.id,'patient_number',v_patient.patient_number)
  );

  return jsonb_build_object(
    'ok', true, 'existing', false,
    'patient', jsonb_build_object(
      'id', v_patient.id, 'patient_number', v_patient.patient_number,
      'full_name', v_patient.full_name, 'dob', v_patient.dob,
      'gender', v_patient.gender, 'phone', v_patient.phone,
      'email', v_patient.email, 'address', v_patient.address,
      'allergies', v_patient.allergies,
      'insurance_provider', v_patient.insurance_provider,
      'insurance_policy_number', v_patient.insurance_policy_number,
      'created_at', v_patient.created_at
    )
  );
end;
$$;

create or replace function public.register_patient(p jsonb)
returns jsonb
language sql
set search_path = pg_catalog, public, pg_temp
as $$ select private.register_patient(p) $$;

revoke execute on function public.register_patient(jsonb) from public;
grant execute on function public.register_patient(jsonb) to authenticated;

create or replace function private.complete_sale(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_existing public.sale_transactions;
  v_item jsonb;
  v_med_id text;
  v_qty integer;
  v_rows integer;
  v_inserted public.sale_transactions;
  v_rx public.prescriptions;
  v_rx_id text := nullif(p_transaction->>'prescriptionId','');
  v_item_id text;
  v_rx_item public.prescription_items;
  v_total_disp integer;
begin
  v_role := private.current_pharmacy_role();
  if v_role is null or v_role not in ('admin','cashier') then
    raise exception 'Only administrators and cashiers may complete sales';
  end if;

  if p_transaction is null or jsonb_typeof(p_transaction) <> 'object' then
    raise exception 'Invalid sale transaction payload';
  end if;

  select * into v_existing from public.sale_transactions where id=(p_transaction->>'id');
  if found then return jsonb_build_object('ok',true,'idempotent',true,'sale_id',v_existing.id); end if;

  if jsonb_typeof(p_transaction->'items') <> 'array' or jsonb_array_length(p_transaction->'items')=0 then
    raise exception 'A sale must contain at least one item';
  end if;

  if v_rx_id is not null then
    select * into v_rx from public.prescriptions where id=v_rx_id for update;
    if not found then raise exception 'Prescription not found'; end if;
    if v_rx.status not in ('Active','Partially Dispensed') then
      raise exception 'Prescription % is not available for dispensing',v_rx.rx_number;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_transaction->'items') loop
    v_med_id:=nullif(v_item->>'medicationId','');
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_med_id is null or v_qty<=0 then raise exception 'Invalid medication or quantity in sale'; end if;

    update public.medications set stock=stock-v_qty,updated_at=now()
    where id=v_med_id and stock>=v_qty;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'Insufficient stock for medication %',v_med_id; end if;

    if v_rx_id is not null then
      v_item_id:=nullif(v_item->>'prescriptionItemId','');
      if v_item_id is null then raise exception 'Prescription sale item is missing its prescription item link'; end if;

      select * into v_rx_item
      from public.prescription_items
      where id=v_item_id and prescription_id=v_rx_id
      for update;
      if not found then raise exception 'Prescription item not found'; end if;

      if v_rx_item.medication_id is not null and v_rx_item.medication_id<>v_med_id then
        raise exception 'Selected stock product does not match the prescription item';
      end if;
      if v_qty>(v_rx_item.quantity-v_rx_item.quantity_dispensed) then
        raise exception 'Dispensing quantity exceeds remaining prescription quantity for %',v_rx_item.medication_name;
      end if;

      update public.prescription_items
      set quantity_dispensed=quantity_dispensed+v_qty,
          dispensing_status=case when quantity_dispensed+v_qty>=quantity then 'DISPENSED' else 'PARTIALLY_DISPENSED' end
      where id=v_item_id;
    end if;
  end loop;

  if v_rx_id is not null then
    select coalesce(sum(quantity_dispensed),0) into v_total_disp
    from public.prescription_items where prescription_id=v_rx_id;

    update public.prescriptions
    set quantity_dispensed_so_far=v_total_disp,
        status=case
          when exists (
            select 1 from public.prescription_items
            where prescription_id=v_rx_id and dispensing_status not in ('DISPENSED','CANCELLED')
          ) then 'Partially Dispensed' else 'Dispensed' end,
        updated_at=now()
    where id=v_rx_id;
  end if;

  insert into public.sale_transactions
  select (
    jsonb_populate_record(
      null::public.sale_transactions,
      p_transaction || jsonb_build_object('created_at',now(),'synced',true,'sync_timestamp',now())
    )
  ).*
  returning * into v_inserted;

  perform private.audit('SALE_COMPLETED','Sale '||v_inserted.receipt_number||' completed','SALES',
    jsonb_build_object('sale_id',v_inserted.id,'prescription_id',v_rx_id));

  return jsonb_build_object('ok',true,'idempotent',false,'sale_id',v_inserted.id);
end;
$$;
