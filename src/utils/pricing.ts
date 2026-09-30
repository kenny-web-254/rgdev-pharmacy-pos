/**
 * Sale money arithmetic, in one place.
 *
 * Every figure the till sends to the server is produced here, and the rules
 * below mirror the checks in `private.complete_sale` exactly:
 *
 *   line total   = round2(unitPrice * quantity * (1 - itemDiscount%))
 *   subtotal     = round2(sum of line totals)
 *   discount     = round2(subtotal * cartDiscount%)
 *   total        = round2(subtotal - discount)
 *
 * Keeping the two in step matters: the server recomputes these values, rejects
 * a sale whose figures do not reconcile, and stores its own numbers. Rounding
 * at every step (rather than only at the end, as the till previously did) keeps
 * the subtotal equal to the sum of its lines once the database has coerced each
 * column to NUMERIC(12,2).
 *
 * Amounts are Kenyan Shillings.
 */

/**
 * Round to 2 decimal places using decimal half-up, away from zero.
 *
 * This deliberately rounds the *decimal* text of the number rather than its
 * binary value, because that is what PostgreSQL will do. `JSON.stringify(8.165)`
 * sends the text "8.165", which Postgres parses as an exact decimal and rounds
 * to 8.17 on the way into a NUMERIC(12,2) column. Rounding the binary double
 * instead (`Math.round(8.165 * 100) / 100`) yields 8.16, because the nearest
 * double to 8.165 is slightly below it.
 *
 * Letting the till and the database disagree by a cent would put the stored
 * subtotal out of step with the stored total, so both round identically here.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;

  const text = String(value);
  // Exponential notation is far outside any realistic sale amount; fall back.
  if (text.includes('e') || text.includes('E')) {
    return Math.round(value * 100) / 100;
  }

  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  if (fraction.length <= 2) return value;

  let cents = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  if (Number(fraction[2]) >= 5) cents += 1;

  const rounded = cents / 100;
  return negative ? -rounded : rounded;
}

export interface PricedLine {
  unitPrice: number;
  quantity: number;
  /** Item-level reduction, e.g. an insurance co-pay rate. 0-100. */
  discountPercent?: number;
}

/**
 * The amount charged for a single cart line, after any item-level discount.
 * Never negative, and never more than quantity x unit price.
 */
export function lineTotal(line: PricedLine): number {
  const unitPrice = Math.max(0, line.unitPrice || 0);
  const quantity = Math.max(0, Math.trunc(line.quantity || 0));
  const gross = unitPrice * quantity;
  const percent = clampPercent(line.discountPercent);
  return round2(gross * (1 - percent / 100));
}

/** Sum of the cart's line totals. */
export function cartSubtotal(lines: PricedLine[]): number {
  return round2(lines.reduce((acc, line) => acc + lineTotal(line), 0));
}

/** The cart-level (manual) discount amount for a given percentage. */
export function cartDiscountAmount(subtotal: number, discountPercent: number): number {
  const percent = clampPercent(discountPercent);
  return round2(Math.max(0, subtotal) * (percent / 100));
}

/** Payable total. Never negative, never more than the subtotal. */
export function cartTotal(subtotal: number, discountAmount: number): number {
  const safeSubtotal = Math.max(0, round2(subtotal));
  const safeDiscount = Math.min(Math.max(0, round2(discountAmount)), safeSubtotal);
  return round2(safeSubtotal - safeDiscount);
}

/** Change owed for a cash tender. Never negative. */
export function changeDue(amountTendered: number, total: number): number {
  return round2(Math.max(0, (amountTendered || 0) - (total || 0)));
}

function clampPercent(percent: number | undefined): number {
  if (!Number.isFinite(percent as number)) return 0;
  return Math.min(100, Math.max(0, percent as number));
}
