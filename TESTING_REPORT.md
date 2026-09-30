# Testing Report — RG DEV Pharmacy POS

**Date:** 30 September 2026
**Branch:** `fix/reproducible-build-and-sale-integrity`

---

## 1. Starting position

**The project had no tests of any kind.** `npm run lint` was `tsc --noEmit`, and
it failed with 19 errors, so CI and the Vercel build could not pass either.

## 2. Frontend suite (added)

Runner: **vitest**. Command: `npm test`. Now also runs in CI.

`src/utils/pricing.test.ts` — **24 tests, all passing.** Covers the sale money
rules, which the server independently re-verifies:

| Area | Cases |
|---|---|
| `round2` | 2dp rounding, binary-float edge cases, NaN/Infinity |
| `lineTotal` | quantity × price, item discount, rounding, negative inputs, >100% discount, negative discount, fractional quantity |
| `cartSubtotal` | multi-line sum, **equality with the sum of its own rounded lines** (the reconciliation the server enforces), empty cart |
| `cartDiscountAmount` | percentage, rounding, negative, cap at subtotal |
| `cartTotal` | subtraction, floor at zero, negative discount, `total === subtotal - discount` |
| `changeDue` | over-tender, exact, short tender |

### A real bug this suite caught

`round2(8.165)` returned `8.16` in JavaScript while PostgreSQL rounds the same
JSON text to `8.17`. Left alone, a stored subtotal could disagree with its own
total by a cent — and would then be rejected by the new server reconciliation.
`round2` now rounds decimal text the way Postgres does.

## 3. Database testing

No local PostgreSQL was available (no Docker, no `psql`), and a paid Supabase
branch was declined. Testing was therefore done in an **isolated schema inside
the live project**, as follows:

1. `create schema zz_saletest`
2. Seven tables created with `LIKE public.<table> INCLUDING ALL` — exact
   structure, **no data copied**
3. The migration's `complete_sale` installed against that schema, with
   `current_pharmacy_role()` and `audit()` stubbed
4. Eleven cases executed
5. `drop schema zz_saletest cascade`
6. Production row counts re-checked: **1 sale, 193 medications, 8 audit rows —
   unchanged, exactly as before**

No production table, function, or row was modified at any point.

### Results

| # | Case | Expected | Result |
|---|---|---|---|
| T1 | Legitimate cash sale, 3 × KES 15.00 | Accepted | ✅ `RC260930-00004` |
| T2 | Tampered total: claims KES 1.00 for a KES 45.00 basket | Rejected | ✅ "subtotal does not match the sum of its line items" |
| T3 | Tampered unit price: KES 0.01/tablet | Rejected | ✅ "price of this medication has changed (till showed 0.01, catalogue is 15.00)" |
| T4 | Line total inflated beyond quantity × price | Rejected | ✅ "line total exceeds quantity x unit price" |
| T5 | Discount exceeds subtotal | Rejected | ✅ "discount exceeds the sale subtotal" |
| T6 | Insufficient stock (500 requested, 97 held) | Rejected | ✅ "insufficient stock" |
| T7 | Short cash tender (KES 10 against KES 45) | Rejected | ✅ "Insufficient cash tendered" |
| T8 | Duplicate submission of T1's id | Idempotent, no second deduction | ✅ `idempotent: true`, same receipt |
| T9 | Valid 10% discount, 45.00 → 40.50 | Accepted, stored as computed | ✅ stored `45.00 / 4.50 / 40.50` |
| T10 | M-Pesa with no reference | Rejected | ✅ "M-Pesa confirmation reference is required" |
| T11 | Negative discount field | Rejected | ✅ "Invalid sale totals" |

### Side effects verified after T1, T8 and T9

| Assertion | Expected | Actual |
|---|---|---|
| Stock after two sales of 3, plus one duplicate | 94 | **94** |
| Sale rows | 2 | **2** |
| `inventory_movements` rows | 2 | **2** |
| Audit rows | 2 | **2** |
| First movement `change / prev / new` | `-3 / 100 / 97` | **`-3 / 100 / 97`** |
| Movement reason | `Sale t1` | **`Sale t1`** |

The duplicate submission did **not** deduct stock twice — idempotency holds.

### The root cause this testing found

The first run failed T1 with `22P02 invalid input syntax for type json`,
`Token "Sale" is invalid`, at the `inventory_movements` insert. The cause was
operator precedence in `'Sale ' || p_transaction->>'id'` (§2.1b of
`SYSTEM_AUDIT.md`). **The live production function contains the same expression**,
verified by inspecting `pg_get_functiondef`, which means every sale in production
raises 22P02 and rolls back.

The `Movement reason = "Sale t1"` row above is the direct proof of the fix: that
exact string is what previously aborted the transaction.

**This bug would not have been found by code review or by any frontend test.**
It was only found by executing the function.

## 4. Build and reproducibility

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`, `strict` enabled) | Passes — was 19 errors |
| `npm test` | 24 passed |
| `npm run build` | Succeeds |
| Build run twice | Every file under `src/` **byte-identical** |
| `scripts/verify-production.mjs` against a deliberate violation | **Fails correctly** (not merely passing) |
| Vercel build of this branch | **`READY`** — the previous 12 deployments were all `ERROR` |

## 5. Not tested

Stated plainly:

- **The migration has not been applied to the real `public` schema.** It was
  executed only against the sandbox copy. Applying it remains a deliberate,
  separate step.
- **M-Pesa** — no integration exists to test. `mpesa_reference` is free text a
  cashier types; nothing verifies the customer paid.
- **Barcode hardware and receipt printing** — the scanner wiring fix is
  compile-verified and correctly wired, but has not been run against a camera or
  a physical scanner or printer.
- **No UI/component tests.** The 24 tests cover money arithmetic only; no
  rendering, interaction, or end-to-end flow is tested.
- **Concurrency.** The `for update` row locks are unchanged from a definition
  that already had them, but simultaneous sales of the last unit were not
  load-tested.
- **Offline sync** was reasoned about and corrected but not executed against a
  real device losing connectivity.
- **No regression testing of clinical, prescription, test-ordering, reporting or
  user-management flows** beyond the fact that they now typecheck under `strict`.

A passing suite here is not evidence that the installed system works. Confirm one
real sale in production after deploying.
