# Database Migration — RG DEV Pharmacy POS

**Applied to production:** 30 September 2026
**Project:** `fhnpvjrgqhchnuagwwlt` (Mshaale Healthcare)
**Migration:** `fix_sale_precedence_crash_and_authoritative_pricing`
**Repo file:** `supabase/migrations/20260929120000_fix_missing_audit_and_authoritative_pricing.sql`

---

## 1. What it changes

| Change | Type | Data impact |
|---|---|---|
| `public.audit_logs.metadata` | `add column if not exists`, nullable `jsonb` | **None.** Already existed in production, so this was a no-op. Retained for fresh installs. |
| `private.audit(text,text,text,jsonb)` | `create or replace` | **None.** Definition only. |
| `private.complete_sale(jsonb)` | `create or replace` | **None.** Definition only. |

**No table was created, dropped or rewritten. No row was inserted, updated or
deleted. No column was dropped or retyped.** The migration is definition-only
plus one additive nullable column.

### The functional fix

`private.complete_sale` contained, in its `inventory_movements` insert:

```sql
'Sale ' || p_transaction->>'id'          -- broken
'Sale ' || (p_transaction->>'id')        -- fixed
```

`||` and `->>` share precedence in PostgreSQL and are left-associative, so the
first form grouped as `('Sale ' || p_transaction) ->> 'id'`. Concatenating `text`
with `jsonb` coerces the literal to JSON and raises:

```
22P02  invalid input syntax for type json
DETAIL: Token "Sale" is invalid.
```

That statement runs on every line of every sale, so **every sale raised 22P02 and
rolled back.** Introduced by `20260921093234` line 342 on 21 September 2026.

### The hardening change

Sale pricing is now server-authoritative. Previously `subtotal`, `discount`,
`total` and each line's `unitPrice`/`totalPrice` came from the browser and were
only checked for being non-negative — a sale could be recorded for any amount,
including zero, while stock deducted correctly.

Now each line's unit price is checked against `public.medications.price` under the
row lock already held, a line total may only reduce quantity × price, the
subtotal must equal the sum of line totals, `total` must equal
`subtotal - discount`, and **the server's figures are stored, not the client's.**

## 2. Data preservation — verified before and after

| Metric | Before | After |
|---|---|---|
| `sale_transactions` rows | 1 | **1** |
| `medications` rows | 193 | **193** |
| `sum(medications.stock)` | 1187 | **1187** |
| `audit_logs` rows | 8 | **8** |
| `inventory_movements` rows | 0 | **0** |
| `EXECUTE` on `public.complete_sale` | `authenticated` | **`authenticated`** |

Post-apply checks confirmed the corrected expression is present and the buggy
form is absent.

Supabase security advisors after the change report only one pre-existing,
unrelated warning (leaked-password protection disabled). No RLS or function
issue was introduced.

## 3. How it was tested before being applied

No local PostgreSQL was available and a paid Supabase branch was declined, so the
function was executed against an **isolated schema inside the live project**:

1. `create schema zz_saletest`
2. Seven tables created with `LIKE public.<table> INCLUDING ALL` — exact
   structure, **no data copied**
3. The migration's `complete_sale` installed against that schema
4. **Eleven cases executed** (see `TESTING_REPORT.md`) — all correct
5. Side effects asserted, including that a duplicate submission does **not**
   deduct stock twice
6. `drop schema zz_saletest cascade`, and production counts re-verified unchanged

This is how the 22P02 bug was found. It would not have surfaced from review.

## 4. Two things that would have broken this migration

Both were caught by inspecting the live database first, and are recorded so they
are not reintroduced:

1. **`private.audit`'s fourth parameter is named `p_meta`, not `p_metadata`.** It
   was created outside of migrations. PostgreSQL refuses to rename an input
   parameter through `CREATE OR REPLACE` — *"cannot change name of input
   parameter"* — so a definition using any other name **aborts the migration.**
2. **The live `complete_sale` was newer than the repository's.** Applying the
   repo version would have silently reverted its `get diagnostics` row-count
   assertion and `(select auth.uid())` form. The applied definition is rebased on
   the live one.

Treat the live database as ahead of this repository until the two are reconciled.

## 5. Rollback

> **Rolling back `complete_sale` reintroduces the 22P02 crash and stops all
> sales again.** Only do it if the new pricing checks are rejecting legitimate
> sales, and prefer the partial rollback below.

**Partial rollback (preferred)** — keeps the crash fix, drops the pricing checks.
Re-apply the migration with these three blocks removed:

- the `v_line_unit` / catalogue-price comparison
- the `v_line_total > (v_cat_price * v_qty)` check
- the three post-loop reconciliation checks on `subtotal`, `discount`, `total`

Keep `'Sale ' || (p_transaction->>'id')` parenthesised, and keep storing
`v_subtotal` / `v_discount` / `v_total`.

**Full rollback** — re-apply `private.complete_sale` from
`20260921093234_production_hardening_workflow_audit_and_security.sql`. This
restores the bug; do not use it to resolve a pricing complaint.

`audit_logs.metadata` should be left in place in either case. Dropping it
discards audit detail.

Pre-change definition hashes, for confirming what was replaced:

| Function | `md5(pg_get_functiondef(...))` before |
|---|---|
| `private.complete_sale` | `22027264dd0c2e50199e0b8365857679` |
| `private.audit` | `e1e47ceeb6d79e05150a453cd4b5a229` |

## 6. Still requires manual confirmation

- [ ] **Ring one real sale in the live app.** Confirm a row appears in
      `sale_transactions` **and** a matching row in `inventory_movements`. A sale
      row without a movement row means the fix did not take.
- [ ] Confirm the receipt prints and the stored total matches what the till showed.

```sql
-- Run after the first real sale.
select s.receipt_number, s.total, count(m.id) as movements
from public.sale_transactions s
left join public.inventory_movements m on m.sale_transaction_id = s.id
group by s.receipt_number, s.total, s.timestamp
order by s.timestamp desc limit 5;
```

## 7. Data quality issues found, not changed

Flagged rather than altered, because correcting them is a business decision:

- **All 193 medications share one expiry date, `2027-03-31`**, and one batch
  number pattern. This is a bulk-import placeholder, not real batch data. FEFO
  batching cannot be built meaningfully on top of it.
- **There is no cashier account.** Two admins and one clinician, so all selling
  happens under admin privileges.
- `inventory_movements` is empty, so there is no stock history prior to
  30 September 2026.
