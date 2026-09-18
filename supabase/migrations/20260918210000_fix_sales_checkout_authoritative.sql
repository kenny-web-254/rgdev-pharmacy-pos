-- Production sales checkout hardening
-- The production database function was applied separately; this migration keeps the fix source-controlled.

create or replace function private.complete_sale(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_name text;
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
  v_receipt text;
begin
  if p_transaction is null or jsonb_typeof(p_transaction) <> 'object' then raise exception 'Invalid sale transaction payload'; end if;
  v_role := private.current_pharmacy_role();
  if v_role is null or v_role not in ('admin','cashier') then raise exception 'Sale rejected: authenticated user is not an active admin or cashier'; end if;
  select pu.name into v_name from public.pharmacy_users pu where pu.auth_user_id=(select auth.uid()) and pu.status='active' limit 1;

  select * into v_existing from public.sale_transactions where id=(p_transaction->>'id');
  if found then return jsonb_build_object('ok',true,'idempotent',true,'sale_id',v_existing.id,'receipt_number',v_existing.receipt_number); end if;

  if jsonb_typeof(p_transaction->'items') <> 'array' or jsonb_array_length(p_transaction->'items')=0 then raise exception 'Sale must contain at least one medication'; end if;
  if v_rx_id is not null then
    select * into v_rx from public.prescriptions where id=v_rx_id for update;
    if not found then raise exception 'Prescription not found'; end if;
    if v_rx.status not in ('Active','Partially Dispensed') then raise exception 'Prescription % is not available for dispensing',v_rx.rx_number; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_transaction->'items') loop
    v_med_id:=nullif(v_item->>'medicationId',''); v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_med_id is null or v_qty<=0 then raise exception 'Invalid medication or quantity in sale'; end if;
    update public.medications set stock=stock-v_qty,updated_at=now()
      where id=v_med_id and stock>=v_qty and expiry_date >= (now() at time zone 'Africa/Nairobi')::date;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'Cannot sell medication %: insufficient stock, expired batch, or medication not found',v_med_id; end if;

    if v_rx_id is not null then
      v_item_id:=nullif(v_item->>'prescriptionItemId','');
      if v_item_id is null then raise exception 'Prescription sale item is missing its prescription-item link'; end if;
      select * into v_rx_item from public.prescription_items where id=v_item_id and prescription_id=v_rx_id for update;
      if not found then raise exception 'Prescription item not found'; end if;
      if v_rx_item.medication_id is not null and v_rx_item.medication_id<>v_med_id then raise exception 'Selected stock product does not match the prescription item'; end if;
      if v_qty>(v_rx_item.quantity-v_rx_item.quantity_dispensed) then raise exception 'Dispensing quantity exceeds remaining quantity for %',v_rx_item.medication_name; end if;
      update public.prescription_items set quantity_dispensed=quantity_dispensed+v_qty,
        dispensing_status=case when quantity_dispensed+v_qty>=quantity then 'DISPENSED' else 'PARTIALLY_DISPENSED' end,updated_at=now() where id=v_item_id;
    end if;
  end loop;

  if v_rx_id is not null then
    select coalesce(sum(quantity_dispensed),0) into v_total_disp from public.prescription_items where prescription_id=v_rx_id;
    update public.prescriptions set quantity_dispensed_so_far=v_total_disp,
      status=case when exists(select 1 from public.prescription_items where prescription_id=v_rx_id and dispensing_status not in ('DISPENSED','CANCELLED')) then 'Partially Dispensed' else 'Dispensed' end,updated_at=now()
      where id=v_rx_id;
  end if;

  v_receipt:=coalesce(nullif(p_transaction->>'receipt_number',''),'RC'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||lpad(nextval('public.receipt_number_seq')::text,5,'0'));
  if exists(select 1 from public.sale_transactions where receipt_number=v_receipt) then
    v_receipt:='RC'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||lpad(nextval('public.receipt_number_seq')::text,5,'0');
  end if;

  insert into public.sale_transactions
  select (jsonb_populate_record(null::public.sale_transactions,p_transaction||jsonb_build_object(
    'receipt_number',v_receipt,'cashier_name',coalesce(v_name,p_transaction->>'cashier_name','Unknown'),'cashier_role',v_role,
    'created_at',now(),'synced',true,'sync_timestamp',now()))).* returning * into v_inserted;

  perform private.audit('SALE_COMPLETED','Sale '||v_inserted.receipt_number||' completed','SALES',jsonb_build_object('sale_id',v_inserted.id,'prescription_id',v_rx_id));
  return jsonb_build_object('ok',true,'idempotent',false,'sale_id',v_inserted.id,'receipt_number',v_inserted.receipt_number);
end;
$function$;

create or replace function public.complete_sale(p_transaction jsonb)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $function$ select private.complete_sale(p_transaction); $function$;

revoke execute on function public.complete_sale(jsonb) from public;
revoke execute on function public.complete_sale(jsonb) from anon;
grant execute on function public.complete_sale(jsonb) to authenticated;
