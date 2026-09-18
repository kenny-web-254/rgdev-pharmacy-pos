-- Remove tax/VAT from the application and sales model.
-- Existing sales remain intact; tax fields are no longer part of the schema.
alter table if exists public.sale_transactions
  drop column if exists tax;

alter table if exists public.receipt_settings
  drop column if exists tax_rate,
  drop column if exists show_tax_breakdown,
  drop column if exists tax_id;
