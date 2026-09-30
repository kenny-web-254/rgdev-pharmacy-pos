-- ---------------------------------------------------------------------------
-- Server-authoritative sale pricing, plus the audit helper the repository never
-- defined.
--
-- Verified against the live Mshaale Healthcare database (project
-- fhnpvjrgqhchnuagwwlt) on 30 September 2026 before being written:
--
--   * private.audit ALREADY EXISTS there, created outside of migrations, with
--     its fourth parameter named `p_meta`. This file therefore uses that exact
--     parameter name -- PostgreSQL refuses to rename an input parameter through
--     CREATE OR REPLACE ("cannot change name of input parameter"), so a
--     definition using any other name would abort the migration.
--   * public.audit_logs.metadata already exists there too, so the ALTER below
--     is a no-op on that database. It is retained for a fresh installation,
--     where neither the column nor the function exists and the five functions
--     that call private.audit would otherwise fail with undefined_function.
--   * private.complete_sale in the live database is NEWER than the definition
--     in this repository. The body below is rebased on the live version --
--     keeping its `get diagnostics` row-count assertion, its
--     `(select auth.uid())` form and its exception re-raise -- rather than
--     reverting those improvements.
--
-- The only behavioural change is pricing authority, described at part 2.
-- ---------------------------------------------------------------------------

-- Additive and nullable: preserves every existing audit row.
alter table public.audit_logs add column if not exists metadata jsonb;

-- Parameter name `p_meta` matches the live definition. Do not rename it.
create or replace function private.audit(
  p_action   text,
  p_details  text,
  p_category text,
  p_meta     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_logs(
    id, user_id, user_name, user_role, action, details, category, metadata
  )
  select
    gen_random_uuid()::text,
    coalesce((select auth.uid())::text, 'system'),
    coalesce(pu.name, 'Unknown'),
    coalesce(pu.role, 'system'),
    p_action,
    p_details,
    -- audit_logs.category carries a CHECK constraint; never fail the caller's
    -- business transaction because of an unexpected category label.
    case
      when p_category in ('AUTH','USERS','INVENTORY','SALES','SETTINGS','SYSTEM','CLINICAL')
        then p_category
      else 'SYSTEM'
    end,
    p_meta
  from (select 1) x
  left join public.pharmacy_users pu
    on pu.auth_user_id = (select auth.uid())
   and pu.status = 'active';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Pricing authority.
--
-- The live definition accepts `subtotal`, `discount`, `total` and each line's
-- `unitPrice`/`totalPrice` from the browser and checks only that they are not
-- negative. A tampered or simply buggy till can therefore record a sale for any
-- amount, including zero, while stock is still deducted correctly. Stock would
-- reconcile; revenue would not.
--
-- Added below, with every existing control kept intact:
--   * each line's unit price is checked against public.medications.price under
--     the row lock the function already holds;
--   * a line total may only ever reduce quantity x unit price;
--   * the subtotal must equal the sum of the line totals;
--   * total must equal subtotal - discount, and discount may not exceed it;
--   * the server's own figures are stored, not the client's;
--   * payment sufficiency is checked against the server total.
--
-- A sale whose prices no longer match the catalogue is rejected rather than
-- silently re-priced, so the cashier re-rings it at the current price.
-- ---------------------------------------------------------------------------
create or replace function private.complete_sale(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  v_previous_stock integer;
  v_new_stock integer;
  v_payment text;
  v_tender numeric;
  -- Server-authoritative money.
  v_cat_price numeric;
  v_line_unit numeric;
  v_line_total numeric;
  v_calc_subtotal numeric := 0;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_epsilon constant numeric := 0.01;
begin
  if p_transaction is null or jsonb_typeof(p_transaction) <> 'object' then
    raise exception 'Invalid sale transaction payload';
  end if;

  if nullif(trim(p_transaction->>'id'),'') is null then
    raise exception 'Sale transaction ID is required for idempotent processing';
  end if;

  v_role := lower(private.current_pharmacy_role());
  if v_role is null or v_role not in ('admin','cashier') then
    raise exception 'Sale rejected: active Admin or Cashier session required';
  end if;

  select pu.name
    into v_name
  from public.pharmacy_users pu
  where pu.auth_user_id = (select auth.uid())
    and lower(pu.status) = 'active'
  limit 1;

  select *
    into v_existing
  from public.sale_transactions
  where id = p_transaction->>'id';

  if found then
    return jsonb_build_object(
      'ok',true,
      'idempotent',true,
      'sale_id',v_existing.id,
      'receipt_number',v_existing.receipt_number
    );
  end if;

  if jsonb_typeof(p_transaction->'items') <> 'array'
     or jsonb_array_length(p_transaction->'items') = 0 then
    raise exception 'Sale must contain at least one medication';
  end if;

  if coalesce((p_transaction->>'total')::numeric,0) < 0
     or coalesce((p_transaction->>'subtotal')::numeric,0) < 0
     or coalesce((p_transaction->>'discount')::numeric,0) < 0 then
    raise exception 'Invalid sale totals';
  end if;

  v_payment := p_transaction->>'payment_method';
  if v_payment is null then
    raise exception 'Payment method is required';
  end if;

  if v_payment not in ('Cash','M-Pesa','Partial (Cash + M-Pesa)','Credit/Debit Card','Insurance') then
    raise exception 'Unsupported payment method';
  end if;

  if v_payment in ('M-Pesa','Partial (Cash + M-Pesa)')
     and nullif(trim(p_transaction->>'mpesa_reference'),'') is null then
    raise exception 'M-Pesa confirmation reference is required';
  end if;

  if v_payment = 'Credit/Debit Card'
     and nullif(trim(p_transaction->>'card_auth_code'),'') is null then
    raise exception 'Card authorization code is required';
  end if;

  if v_payment = 'Insurance'
     and nullif(trim(p_transaction->>'insurance_policy_number'),'') is null then
    raise exception 'Insurance policy number is required';
  end if;

  if v_payment = 'Insurance'
     and nullif(trim(p_transaction->>'insurance_auth_code'),'') is null then
    raise exception 'Insurance authorization code is required';
  end if;

  if v_rx_id is not null then
    select * into v_rx
    from public.prescriptions
    where id = v_rx_id
    for update;

    if not found then raise exception 'Prescription not found'; end if;

    if lower(v_rx.status) not in ('issued','partially_dispensed') then
      raise exception 'Prescription is not available for dispensing';
    end if;

    if v_rx.expiry_date is not null
       and v_rx.expiry_date < (now() at time zone 'Africa/Nairobi')::date then
      update public.prescriptions
      set status='EXPIRED', updated_at=now()
      where id=v_rx.id;
      raise exception 'Prescription has expired';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_transaction->'items') loop
    v_med_id := nullif(v_item->>'medicationId','');
    v_qty := coalesce((v_item->>'quantity')::integer,0);

    if v_med_id is null or v_qty <= 0 then
      raise exception 'Invalid medication or quantity in sale';
    end if;

    -- Lock the row and read the authoritative catalogue price alongside stock.
    select m.stock, m.price
      into v_previous_stock, v_cat_price
    from public.medications m
    where m.id=v_med_id
      and m.expiry_date >= (now() at time zone 'Africa/Nairobi')::date
    for update;

    if not found then
      if exists(select 1 from public.medications where id=v_med_id) then
        raise exception 'Cannot sell medication: medication is expired';
      else
        raise exception 'Medication does not exist';
      end if;
    end if;

    if v_previous_stock < v_qty then
      raise exception 'Cannot sell medication: insufficient stock';
    end if;

    -- Price authority: the line's unit price must be the catalogue price.
    v_line_unit := coalesce((v_item->>'unitPrice')::numeric, -1);
    if abs(v_line_unit - v_cat_price) > v_epsilon then
      raise exception 'Sale rejected: the price of this medication has changed (till showed %, catalogue is %). Re-ring the sale at the current price.', v_line_unit, v_cat_price;
    end if;

    -- A line total may only ever be a reduction of quantity x catalogue price.
    v_line_total := coalesce((v_item->>'totalPrice')::numeric, -1);
    if v_line_total < 0 then
      raise exception 'Sale rejected: negative line total';
    end if;
    if v_line_total > (v_cat_price * v_qty) + v_epsilon then
      raise exception 'Sale rejected: line total exceeds quantity x unit price';
    end if;
    v_calc_subtotal := v_calc_subtotal + v_line_total;

    v_new_stock := v_previous_stock - v_qty;

    update public.medications
    set stock=v_new_stock, updated_at=now()
    where id=v_med_id;
    get diagnostics v_rows=row_count;

    if v_rows <> 1 then
      raise exception 'Medication stock update failed';
    end if;

    insert into public.inventory_movements(
      medication_id, medication_name, movement_type, quantity_change,
      previous_stock, new_stock, batch_number, reason, user_id, user_name,
      sale_transaction_id
    )
    select
      m.id, m.name, 'SALE', -v_qty, v_previous_stock, v_new_stock,
      m.batch_number, 'Sale ' || p_transaction->>'id', (select auth.uid()), v_name,
      p_transaction->>'id'
    from public.medications m
    where m.id=v_med_id;

    if v_rx_id is not null then
      v_item_id := nullif(v_item->>'prescriptionItemId','');
      if v_item_id is null then
        raise exception 'Prescription sale item is missing its prescription-item link';
      end if;

      select * into v_rx_item
      from public.prescription_items
      where id=v_item_id
        and prescription_id=v_rx_id
      for update;

      if not found then raise exception 'Prescription item not found'; end if;

      if v_rx_item.medication_id is not null
         and v_rx_item.medication_id <> v_med_id then
        raise exception 'Selected medication does not match prescription';
      end if;

      if v_qty > (v_rx_item.quantity - v_rx_item.quantity_dispensed) then
        raise exception 'Dispensing quantity exceeds prescription balance';
      end if;

      update public.prescription_items
      set quantity_dispensed=quantity_dispensed+v_qty,
          dispensing_status=case
            when quantity_dispensed+v_qty >= quantity then 'DISPENSED'
            else 'PARTIALLY_DISPENSED'
          end,
          updated_at=now()
      where id=v_item_id;
    end if;
  end loop;

  -- Reconcile the client's figures against the server's own arithmetic.
  v_subtotal := round(v_calc_subtotal, 2);
  if abs(coalesce((p_transaction->>'subtotal')::numeric, -1) - v_subtotal) > v_epsilon then
    raise exception 'Sale rejected: the subtotal does not match the sum of its line items';
  end if;

  v_discount := round(coalesce((p_transaction->>'discount')::numeric, 0), 2);
  if v_discount > v_subtotal then
    raise exception 'Sale rejected: the discount exceeds the sale subtotal';
  end if;

  v_total := round(v_subtotal - v_discount, 2);
  if abs(coalesce((p_transaction->>'total')::numeric, -1) - v_total) > v_epsilon then
    raise exception 'Sale rejected: the total does not equal subtotal less discount';
  end if;

  -- Payment sufficiency is checked against the server total, never the client's.
  v_tender := coalesce((p_transaction->>'amount_tendered')::numeric,0);
  if v_payment = 'Cash' and v_tender < v_total then
    raise exception 'Insufficient cash tendered';
  end if;

  if v_payment = 'Partial (Cash + M-Pesa)'
     and coalesce((p_transaction->>'cash_amount')::numeric,0)
       + coalesce((p_transaction->>'mpesa_amount')::numeric,0)
       < v_total then
    raise exception 'Combined payment is less than sale total';
  end if;

  if v_rx_id is not null then
    select coalesce(sum(quantity_dispensed),0)
      into v_total_disp
    from public.prescription_items
    where prescription_id=v_rx_id;

    update public.prescriptions
    set quantity_dispensed_so_far=v_total_disp,
        status=case
          when not exists (
            select 1 from public.prescription_items
            where prescription_id=v_rx_id
              and dispensing_status <> 'CANCELLED'
          ) then 'CANCELLED'
          when exists (
            select 1 from public.prescription_items
            where prescription_id=v_rx_id
              and dispensing_status <> 'CANCELLED'
              and quantity_dispensed < quantity
          ) then 'PARTIALLY_DISPENSED'
          else 'DISPENSED'
        end,
        updated_at=now()
    where id=v_rx_id;
  end if;

  v_receipt := coalesce(
    nullif(p_transaction->>'receipt_number',''),
    'RC' ||
    to_char(now() at time zone 'Africa/Nairobi','YYMMDD') ||
    '-' ||
    lpad(nextval('public.receipt_number_seq')::text,5,'0')
  );

  -- Store the server's figures, not the client's.
  insert into public.sale_transactions
  select (jsonb_populate_record(
    null::public.sale_transactions,
    p_transaction || jsonb_build_object(
      'receipt_number',v_receipt,
      'cashier_name',coalesce(v_name,p_transaction->>'cashier_name','Unknown'),
      'cashier_role',v_role,
      'created_at',now(),
      'synced',true,
      'sync_timestamp',now(),
      'subtotal',v_subtotal,
      'discount',v_discount,
      'total',v_total
    )
  )).*
  returning * into v_inserted;

  perform private.audit(
    'SALE_COMPLETED',
    'Sale ' || v_inserted.receipt_number || ' completed',
    'SALES',
    jsonb_build_object(
      'sale_id',v_inserted.id,
      'prescription_id',v_rx_id,
      'inventory_movement_count',jsonb_array_length(p_transaction->'items'),
      'subtotal',v_subtotal,
      'discount',v_discount,
      'total',v_total
    )
  );

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'sale_id',v_inserted.id,
    'receipt_number',v_inserted.receipt_number
  );
exception
  when others then raise;
end;
$function$;
