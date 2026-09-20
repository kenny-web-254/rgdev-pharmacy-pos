-- Move privileged inventory import implementation out of exposed public schema.
-- The public function remains an invoker wrapper so the frontend RPC contract is unchanged.

create or replace function private.import_inventory(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_role text;
  v_row jsonb;
  v_barcode text;
  v_name text;
  v_generic text;
  v_dosage text;
  v_form text;
  v_category text;
  v_batch text;
  v_expiry date;
  v_manufacturer text;
  v_price numeric;
  v_cost numeric;
  v_qty integer;
  v_min_stock integer;
  v_action text;
  v_rx boolean;
  v_cold boolean;
  v_id text;
  v_existing public.medications;
  v_new_stock integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_index integer := 0;
  v_user_id text;
  v_user_name text;
  v_user_role text;
  v_pack_size numeric;
  v_stock_unit text;
  v_sale_unit text;
  v_can_sell_individually boolean;
  v_unit_price numeric;
  v_unit_cost numeric;
begin
  v_role := private.current_pharmacy_role();
  if v_role is null or lower(v_role) <> 'admin' then raise exception 'Only administrators may import inventory'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Inventory import must contain at least one row'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Inventory import is limited to 2,000 rows'; end if;
  if exists (select 1 from (select lower(trim(value->>'barcode')) barcode from jsonb_array_elements(p_rows) value where trim(coalesce(value->>'barcode','')) <> '' group by lower(trim(value->>'barcode')) having count(*) > 1) d) then raise exception 'Duplicate barcode found inside import payload'; end if;
  v_user_id := auth.uid()::text;
  select pu.name, pu.role into v_user_name, v_user_role from public.pharmacy_users pu where pu.auth_user_id = auth.uid() and pu.status = 'active' limit 1;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_id := nullif(trim(v_row->>'id'), '');
    v_name := nullif(trim(v_row->>'name'), '');
    v_generic := nullif(trim(v_row->>'genericName'), '');
    v_dosage := nullif(trim(v_row->>'dosage'), '');
    v_form := coalesce(nullif(trim(v_row->>'form'), ''), 'Unit');
    v_category := coalesce(nullif(trim(v_row->>'category'), ''), 'Uncategorized');
    v_barcode := nullif(trim(v_row->>'barcode'), '');
    v_batch := nullif(trim(v_row->>'batchNumber'), '');
    v_manufacturer := coalesce(trim(v_row->>'manufacturer'), '');
    v_action := upper(coalesce(nullif(trim(v_row->>'stockAction'), ''), 'ADD'));
    v_price := nullif(v_row->>'price','')::numeric;
    v_cost := nullif(v_row->>'costPrice','')::numeric;
    v_qty := floor(nullif(v_row->>'quantity','')::numeric)::integer;
    v_min_stock := floor(nullif(v_row->>'minStockLevel','')::numeric)::integer;
    v_rx := coalesce((v_row->>'isPrescriptionRequired')::boolean, false);
    v_cold := coalesce((v_row->>'requiresRefrigeration')::boolean, false);
    v_pack_size := coalesce(nullif(v_row->>'packSize','')::numeric, 1);
    v_stock_unit := coalesce(nullif(trim(v_row->>'stockUnit'), ''), 'Unit');
    v_sale_unit := coalesce(nullif(trim(v_row->>'saleUnit'), ''), v_stock_unit);
    v_can_sell_individually := coalesce((v_row->>'canSellIndividually')::boolean, false);
    v_unit_price := nullif(v_row->>'unitPrice','')::numeric;
    v_unit_cost := nullif(v_row->>'unitCost','')::numeric;
    begin v_expiry := (v_row->>'expiryDate')::date; exception when others then raise exception 'Invalid expiry date at import row %', v_index; end;

    if v_name is null or v_generic is null or v_dosage is null or v_barcode is null or v_batch is null or v_expiry is null then raise exception 'Required inventory field missing at import row %', v_index; end if;
    if v_price is null or v_price <= 0 or v_cost is null or v_cost < 0 then raise exception 'Invalid price/cost at import row %', v_index; end if;
    if v_qty is null or v_qty < 0 or v_min_stock is null or v_min_stock < 0 then raise exception 'Invalid quantity/minimum stock at import row %', v_index; end if;
    if v_action not in ('ADD','REDUCE','REPLACE') then raise exception 'Invalid stock action at import row %', v_index; end if;
    if v_pack_size <= 0 then raise exception 'Pack/container size must be greater than zero at import row %', v_index; end if;
    if v_stock_unit = '' or v_sale_unit = '' then raise exception 'Stock and sale units are required at import row %', v_index; end if;
    if v_unit_price is not null and v_unit_price < 0 then raise exception 'Unit price cannot be negative at import row %', v_index; end if;
    if v_unit_cost is not null and v_unit_cost < 0 then raise exception 'Unit cost cannot be negative at import row %', v_index; end if;
    if v_can_sell_individually and v_pack_size <= 1 then raise exception 'Individual-unit flag requires a pack size greater than 1 at import row %', v_index; end if;
    if v_can_sell_individually and v_unit_price is null then raise exception 'Unit price is required when individual-unit mode is enabled at import row %', v_index; end if;

    select * into v_existing from public.medications where lower(trim(barcode)) = lower(v_barcode) for update;
    if v_existing.id is null then
      if v_action = 'REDUCE' then raise exception 'Cannot REDUCE stock for a new product at import row %', v_index; end if;
      if v_id is null then v_id := 'med-' || gen_random_uuid()::text; end if;
      insert into public.medications(id,name,generic_name,dosage,form,category,is_prescription_required,barcode,price,cost_price,stock,min_stock_level,batch_number,expiry_date,manufacturer,requires_refrigeration,pack_size,stock_unit,sale_unit,can_sell_individually,unit_price,unit_cost,created_at,updated_at)
      values(v_id,v_name,v_generic,v_dosage,v_form,v_category,v_rx,v_barcode,ceil(v_price),v_cost,v_qty,v_min_stock,v_batch,v_expiry,v_manufacturer,v_cold,v_pack_size,v_stock_unit,v_sale_unit,v_can_sell_individually,coalesce(v_unit_price, case when v_pack_size > 0 then v_price / v_pack_size else null end),coalesce(v_unit_cost, case when v_pack_size > 0 then v_cost / v_pack_size else null end),now(),now());
      v_created := v_created + 1;
    else
      if v_action = 'ADD' then v_new_stock := v_existing.stock + v_qty; elsif v_action = 'REDUCE' then v_new_stock := v_existing.stock - v_qty; if v_new_stock < 0 then raise exception 'REDUCE would make stock negative at import row % (current %, requested %)', v_index, v_existing.stock, v_qty; end if; else v_new_stock := v_qty; end if;
      update public.medications set name=v_name,generic_name=v_generic,dosage=v_dosage,form=v_form,category=v_category,is_prescription_required=v_rx,price=ceil(v_price),cost_price=v_cost,stock=v_new_stock,min_stock_level=v_min_stock,batch_number=v_batch,expiry_date=v_expiry,manufacturer=v_manufacturer,requires_refrigeration=v_cold,pack_size=v_pack_size,stock_unit=v_stock_unit,sale_unit=v_sale_unit,can_sell_individually=v_can_sell_individually,unit_price=coalesce(v_unit_price, case when v_pack_size > 0 then v_price / v_pack_size else null end),unit_cost=coalesce(v_unit_cost, case when v_pack_size > 0 then v_cost / v_pack_size else null end),updated_at=now() where id=v_existing.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  insert into public.audit_logs(id,timestamp,user_id,user_name,user_role,action,details,category)
  values(gen_random_uuid()::text,now(),coalesce(v_user_id,''),coalesce(v_user_name,'Unknown'),coalesce(v_user_role,'admin'),'INVENTORY_IMPORTED',format('Imported %s inventory rows (%s created, %s updated)',v_created+v_updated,v_created,v_updated),'INVENTORY');
  return jsonb_build_object('ok',true,'created',v_created,'updated',v_updated,'total',v_created+v_updated);
end;
$function$;

revoke all on function public.import_inventory(jsonb) from public;
revoke all on function public.import_inventory(jsonb) from anon;
revoke all on function public.import_inventory(jsonb) from authenticated;
grant execute on function private.import_inventory(jsonb) to authenticated;

create or replace function public.import_inventory(p_rows jsonb)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.import_inventory(p_rows);
$function$;

revoke all on function public.import_inventory(jsonb) from public;
revoke all on function public.import_inventory(jsonb) from anon;
grant execute on function public.import_inventory(jsonb) to authenticated;