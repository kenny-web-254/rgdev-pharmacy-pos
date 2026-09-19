/**
 * Unit / quantity domain layer for the pack + smallest-sellable-unit
 * inventory model (see the `packSize` / `stockUnit` / `saleUnit` /
 * `canSellIndividually` / `unitPrice` / `unitCost` fields on `Medication`
 * in types.ts, and the `import_inventory` / `complete_sale` RPCs in
 * supabase/migrations/20260915164802_harden_inventory_units_and_import.sql).
 *
 * Ground truth: `Medication.stock` is ALWAYS expressed in the smallest
 * sellable unit ("base units"). `packSize` is how many base units make up
 * one stocking pack/container. Every screen that shows or edits a
 * quantity, price, or cost must go through these functions rather than
 * repeating the pack-size arithmetic inline - that is what keeps a
 * conversion factor change (or a bug fix to this file) consistent across
 * InventoryManager, POSTerminal, receipts, and reports instead of having
 * to be found and fixed in each of them separately.
 */

import type { Medication } from '../types';

export type SaleUnitKind = 'pack' | 'base';

/** Effective pack size, defaulting to 1 (i.e. "no conversion, sold as-is") for older/incomplete records. */
export function getPackSize(medication: Pick<Medication, 'packSize'>): number {
  const size = medication.packSize;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 1;
}

/** Whether this product can legitimately be sold in units smaller than a full pack. */
export function isSplitSaleEnabled(medication: Pick<Medication, 'canSellIndividually' | 'packSize'>): boolean {
  return !!medication.canSellIndividually && getPackSize(medication) > 1;
}

/**
 * Converts a quantity entered in a given unit ("pack" or "base") into base
 * units - the only unit `Medication.stock` and stock-mutating RPCs deal in.
 * Throws rather than silently guessing if `unit` is 'pack' for a product
 * with an invalid (<=0) pack size.
 */
export function toBaseUnits(medication: Pick<Medication, 'packSize'>, quantity: number, unit: SaleUnitKind): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative number.');
  }
  if (unit === 'base') return quantity;
  const packSize = getPackSize(medication);
  return quantity * packSize;
}

/**
 * Converts a base-unit quantity back into whole packs + leftover base
 * units, for display ("2 boxes + 3 tablets") or for pre-filling a pack
 * quantity field.
 */
export function fromBaseUnits(medication: Pick<Medication, 'packSize'>, baseQuantity: number): { packs: number; remainder: number } {
  const packSize = getPackSize(medication);
  return {
    packs: Math.floor(baseQuantity / packSize),
    remainder: baseQuantity % packSize,
  };
}

/**
 * Human-readable stock display honoring the product's configured units,
 * e.g. "24 Tablets (2 Box of 12)" or, for a product with no pack
 * configured (packSize 1), just "24 Tablets".
 */
export function formatQuantityDisplay(medication: Pick<Medication, 'packSize' | 'stock' | 'stockUnit' | 'saleUnit'>): string {
  const packSize = getPackSize(medication);
  const saleUnit = medication.saleUnit || 'unit';
  const stockUnit = medication.stockUnit || saleUnit;
  const baseQty = Number.isFinite(medication.stock) ? medication.stock : 0;

  if (packSize <= 1) {
    return `${baseQty} ${pluralize(saleUnit, baseQty)}`;
  }

  const { packs, remainder } = fromBaseUnits(medication, baseQty);
  const packPart = `${packs} ${pluralize(stockUnit, packs)} of ${packSize}`;
  if (remainder === 0) return `${baseQty} ${pluralize(saleUnit, baseQty)} (${packPart})`;
  return `${baseQty} ${pluralize(saleUnit, baseQty)} (${packPart} + ${remainder} ${pluralize(saleUnit, remainder)})`;
}

/**
 * The per-base-unit price to use for a sale of `unit` quantity. For pack
 * sales this is `price / packSize` (not `unitPrice`, which may not be set
 * for products that never sell individually); for base-unit sales it's the
 * explicit `unitPrice` when split sales are enabled.
 */
export function getEffectiveUnitPrice(medication: Pick<Medication, 'price' | 'unitPrice' | 'packSize' | 'canSellIndividually'>, unit: SaleUnitKind): number {
  const packSize = getPackSize(medication);
  if (unit === 'pack' || !isSplitSaleEnabled(medication)) {
    return packSize > 0 ? medication.price / packSize : medication.price;
  }
  return typeof medication.unitPrice === 'number' && medication.unitPrice >= 0 ? medication.unitPrice : medication.price / packSize;
}

/** Total price for selling `quantity` of the given unit kind. */
export function calculateLineTotal(medication: Pick<Medication, 'price' | 'unitPrice' | 'packSize' | 'canSellIndividually'>, quantity: number, unit: SaleUnitKind): number {
  if (unit === 'pack') {
    return medication.price * quantity;
  }
  return getEffectiveUnitPrice(medication, 'base') * quantity;
}

/**
 * Validates a proposed unit configuration before it reaches Supabase -
 * mirrors the CHECK constraints and import_inventory validation in
 * 20260915164802_harden_inventory_units_and_import.sql, so the UI can
 * reject an obviously invalid conversion instead of discovering it only
 * after a failed RPC call.
 */
export function validateUnitConfiguration(medication: Pick<Medication, 'packSize' | 'stockUnit' | 'saleUnit' | 'canSellIndividually' | 'unitPrice'>): string[] {
  const errors: string[] = [];
  const packSize = medication.packSize;
  if (packSize !== undefined && (!Number.isFinite(packSize) || (packSize as number) <= 0)) {
    errors.push('Pack/container size must be a positive number.');
  }
  if (!medication.stockUnit || !medication.stockUnit.trim()) {
    errors.push('Stock unit name is required (e.g. Box, Pack, Bottle).');
  }
  if (!medication.saleUnit || !medication.saleUnit.trim()) {
    errors.push('Sale/smallest unit name is required (e.g. Tablet, Capsule, Sachet).');
  }
  if (medication.canSellIndividually) {
    if (!packSize || packSize <= 1) {
      errors.push('Subunit selling requires a pack size greater than 1.');
    }
    if (typeof medication.unitPrice !== 'number' || medication.unitPrice < 0) {
      errors.push('A smallest-unit price is required when subunit selling is enabled.');
    }
  }
  return errors;
}

/** Which sale-unit options a cashier may legitimately choose for this product. */
export function getAvailableSaleUnits(medication: Pick<Medication, 'canSellIndividually' | 'packSize'>): SaleUnitKind[] {
  return isSplitSaleEnabled(medication) ? ['pack', 'base'] : ['pack'];
}

function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  if (/[sxz]$|[cs]h$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
