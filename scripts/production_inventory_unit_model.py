from pathlib import Path
import re

path = Path('src/components/InventoryExcelImport.tsx')
s = path.read_text()

# Remove automatic pricing. Prices/costs must come from explicit item data or an existing record.
old = """function roundSellingPrice(costPrice: number): number {
  // Protect against Nairobi transport/logistics costs and leave a practical
  // gross margin. Cost is treated as purchase cost before shipment; 15% is
  // reserved for logistics and the target gross margin is 25% after that.
  const landedCost = costPrice * 1.15;
  const protectedPrice = landedCost / 0.75;
  return Math.max(10, Math.ceil(protectedPrice / 5) * 5);
}

"""
s = s.replace(old, '')

# Replace price/cost/unit parsing block.
old = """  const rawPrice = numberValue(row, 'Selling Price (KSh)', 'Selling Price', 'Price', 'Unit Selling Price', 'Unit Selling Price (KSh)');
  const costPrice = numberValue(row, 'Cost Price (KSh)', 'Cost Price', 'Unit Cost', 'Unit Cost (KSh)');
  const stock = numberValue(row, 'Quantity', 'Stock', 'Current Stock Level');
  const minStockLevel = numberValue(row, 'Min Stock Alert Level', 'Min Stock', 'Min Stock Level', 'Min Reorder Level');
  const rx = text(row, 'Prescription Required (Yes/No)', 'Prescription Required', 'Rx Required').toLowerCase();
  const coldChain = text(row, 'Requires Cold Chain (Yes/No)', 'Requires Cold Chain', 'Cold Chain').toLowerCase();
  const stockAction = parseAction(row);
  const validCost = Number.isFinite(costPrice) ? costPrice : (existing?.costPrice ?? NaN);
  const generatedPrice = Number.isFinite(validCost) && validCost > 0 ? roundSellingPrice(validCost) : 0;
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.ceil(rawPrice) : (generatedPrice || existing?.price || 0);
"""
new = """  const rawPrice = numberValue(row, 'Selling Price (KSh)', 'Selling Price', 'Price', 'Stock Unit Price (KSh)', 'Stock Unit Price') ;
  const costPrice = numberValue(row, 'Cost Price (KSh)', 'Cost Price', 'Stock Unit Cost (KSh)', 'Stock Unit Cost');
  const packSize = numberValue(row, 'Pack / Container Size', 'Pack Size', 'Units Per Pack', 'Units Per Container');
  const stockUnit = text(row, 'Stock Unit', 'Inventory Unit', 'Purchase Unit') || existing?.stockUnit || 'Unit';
  const saleUnit = text(row, 'Smallest Unit', 'Sale Unit', 'Base Unit') || existing?.saleUnit || stockUnit;
  const subunitTracking = text(row, 'Subunit Tracking Enabled (Yes/No)', 'Can Sell Individually (Yes/No)', 'Can Sell Individually').toLowerCase();
  const canSellIndividually = subunitTracking ? ['yes', 'true', '1'].includes(subunitTracking) : (existing?.canSellIndividually ?? false);
  const rawUnitPrice = numberValue(row, 'Smallest Unit Price (KSh)', 'Unit Price (KSh)', 'Unit Price');
  const rawUnitCost = numberValue(row, 'Smallest Unit Cost (KSh)', 'Unit Cost (KSh)', 'Unit Cost');
  const stock = numberValue(row, 'Quantity', 'Stock', 'Current Stock Level');
  const minStockLevel = numberValue(row, 'Min Stock Alert Level', 'Min Stock', 'Min Stock Level', 'Min Reorder Level');
  const rx = text(row, 'Prescription Required (Yes/No)', 'Prescription Required', 'Rx Required').toLowerCase();
  const coldChain = text(row, 'Requires Cold Chain (Yes/No)', 'Requires Cold Chain', 'Cold Chain').toLowerCase();
  const stockAction = parseAction(row);
  const validCost = Number.isFinite(costPrice) ? costPrice : (existing?.costPrice ?? NaN);
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.ceil(rawPrice) : (existing?.price ?? 0);
  const validPackSize = Number.isFinite(packSize) && packSize > 0 ? packSize : (existing?.packSize ?? 1);
  const unitPrice = Number.isFinite(rawUnitPrice) && rawUnitPrice >= 0 ? rawUnitPrice : (existing?.unitPrice ?? (price > 0 ? price / validPackSize : undefined));
  const unitCost = Number.isFinite(rawUnitCost) && rawUnitCost >= 0 ? rawUnitCost : (existing?.unitCost ?? (Number.isFinite(validCost) ? validCost / validPackSize : undefined));
"""
if old not in s:
    raise SystemExit('pricing/unit parsing anchor not found')
s = s.replace(old, new, 1)

# Validation additions and price message.
s = s.replace("  if (price <= 0) errors.push('Selling price could not be determined');\n", "  if (price <= 0) errors.push('Selling price must be supplied explicitly');\n")
s = s.replace("  if (!Number.isFinite(minStockLevel) || minStockLevel < 0) errors.push('Minimum stock cannot be negative');\n", "  if (!Number.isFinite(minStockLevel) || minStockLevel < 0) errors.push('Minimum stock cannot be negative');\n  if (!Number.isFinite(validPackSize) || validPackSize <= 0) errors.push('Pack/container size must be greater than zero');\n  if (!stockUnit) errors.push('Stock unit is required');\n  if (!saleUnit) errors.push('Smallest/sale unit is required');\n  if (canSellIndividually && validPackSize <= 1) errors.push('Subunit tracking requires a pack/container size greater than 1');\n  if (canSellIndividually && (!Number.isFinite(unitPrice) || unitPrice < 0)) errors.push('Smallest-unit price is required when subunit tracking is enabled');\n")

# Add fields to medication object.
old_obj = """    manufacturer: manufacturer || existing?.manufacturer || '',
    requiresRefrigeration,
  };"""
new_obj = """    manufacturer: manufacturer || existing?.manufacturer || '',
    requiresRefrigeration,
    packSize: validPackSize,
    stockUnit,
    saleUnit,
    canSellIndividually,
    unitPrice,
    unitCost,
  };"""
if old_obj not in s:
    raise SystemExit('medication object anchor not found')
s = s.replace(old_obj, new_obj, 1)

# Replace downloadable template headers.
old_headers = """        'Product Name', 'Generic Name', 'Category', 'Dosage Form', 'Strength / Dosage',
        'Selling Price (KSh)', 'Cost Price (KSh)', 'Quantity', 'Action (Add/Reduce/Replace)',
        'Min Stock Alert Level', 'Batch / Lot Number', 'Expiry Date (YYYY-MM-DD)',
        'Manufacturer / Supplier', 'Barcode / NDC', 'Prescription Required (Yes/No)',
        'Requires Cold Chain (Yes/No)'
"""
new_headers = """        'Product Name', 'Generic Name', 'Category', 'Dosage Form', 'Strength / Dosage',
        'Barcode / SKU', 'Stock Unit', 'Smallest Unit', 'Pack / Container Size',
        'Subunit Tracking Enabled (Yes/No)', 'Selling Price (KSh)', 'Cost Price (KSh)',
        'Smallest Unit Price (KSh)', 'Smallest Unit Cost (KSh)', 'Quantity',
        'Action (Add/Reduce/Replace)', 'Min Stock Alert Level', 'Batch / Lot Number',
        'Expiry Date (YYYY-MM-DD)', 'Manufacturer / Supplier',
        'Prescription Required (Yes/No)', 'Requires Cold Chain (Yes/No)'
"""
if old_headers not in s:
    raise SystemExit('template header anchor not found')
s = s.replace(old_headers, new_headers, 1)

# Update explanatory copy so it no longer claims automatic pricing.
s = s.replace('Missing selling prices are generated safely from cost; nothing is saved until you confirm.', 'Prices and costs are taken from the spreadsheet; missing required values are rejected. Nothing is saved until you confirm.')
s = s.replace('Selling prices are whole KSh and are never allowed below the protected cost calculation.', 'Prices and costs are explicit item data. Unit relationships are validated before import.')

# Include new fields in cloud RPC payload.
old_payload = """        manufacturer: medication.manufacturer,
        requiresRefrigeration: medication.requiresRefrigeration,
      }));"""
new_payload = """        manufacturer: medication.manufacturer,
        requiresRefrigeration: medication.requiresRefrigeration,
        packSize: medication.packSize ?? 1,
        stockUnit: medication.stockUnit ?? 'Unit',
        saleUnit: medication.saleUnit ?? medication.stockUnit ?? 'Unit',
        canSellIndividually: medication.canSellIndividually ?? false,
        unitPrice: medication.unitPrice ?? null,
        unitCost: medication.unitCost ?? null,
      }));"""
if old_payload in s:
    s = s.replace(old_payload, new_payload, 1)

path.write_text(s)
