-- Do not grant table-wide SELECT on medications to browser clients.
-- The frontend reads the catalog through get_medications_for_session(), which
-- intentionally omits internal purchase costs for non-admin roles.

revoke select on public.medications from anon;
revoke select on public.medications from authenticated;

grant select (
  id,name,generic_name,dosage,form,category,is_prescription_required,
  barcode,price,stock,min_stock_level,batch_number,expiry_date,manufacturer,
  requires_refrigeration,pack_size,stock_unit,sale_unit,can_sell_individually,
  unit_price
) on public.medications to authenticated;

revoke select(cost_price,unit_cost) on public.medications from anon,authenticated;
