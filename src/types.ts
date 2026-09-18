/**
 * RG Pharma-POS Types & Interfaces
 */

export type UserRole = 'admin' | 'clinician' | 'cashier';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string; username: string; password?: string; email?: string; name: string; role: UserRole; status: UserStatus;
  createdAt: string; lastLogin?: string; phone?: string; licenseNumber?: string; avatarColor: string;
}

export type AppNavTab = 'pos' | 'clinical' | 'prescriptions' | 'tests' | 'inventory' | 'users' | 'profile' | 'reports' | 'audit' | 'settings';

export interface AuditLog { id: string; timestamp: string; userId: string; userName: string; userRole: UserRole; action: string; details: string; category: 'AUTH' | 'USERS' | 'INVENTORY' | 'SALES' | 'SETTINGS' | 'SYSTEM' | 'CLINICAL'; }

export type MedicationCategory = 'Antibiotics' | 'Cardiovascular' | 'Pain & Analgesics' | 'Respiratory' | 'Gastrointestinal' | 'Diabetes' | 'OTC & First Aid' | 'Vitamins & Supplements';

export interface Medication {
  id: string;
  name: string;
  genericName: string;
  dosage: string;
  form: 'Tablet' | 'Capsule' | 'Syrup' | 'Injection' | 'Inhaler' | 'Ointment' | 'Drops' | string;
  category: MedicationCategory | string;
  isPrescriptionRequired: boolean;
  barcode: string;
  /** Selling price for one stock/pack unit. For individually sellable medicines, use unitPrice. */
  price: number;
  /** Purchase cost for one stock/pack unit. This is explicitly supplied per spreadsheet row. */
  costPrice: number;
  /** Current stock in the smallest sellable unit. */
  stock: number;
  minStockLevel: number;
  batchNumber: string;
  expiryDate: string;
  manufacturer: string;
  requiresRefrigeration?: boolean;
  /** Number of smallest units contained in one pack/container. Defaults to 1. */
  packSize?: number;
  /** Unit in which stock is purchased/received, e.g. Pack, Box, Bottle. */
  stockUnit?: string;
  /** Smallest unit that can be sold, e.g. Tablet, Capsule, Sachet, Bottle. */
  saleUnit?: string;
  /** When true, POS can sell quantities smaller than one pack. */
  canSellIndividually?: boolean;
  /** Selling price for one smallest unit. Usually price / packSize when split sales are enabled. */
  unitPrice?: number;
  /** Purchase cost for one smallest unit, derived from costPrice / packSize. */
  unitCost?: number;
}

export type PrescriptionStatus = 'Draft' | 'Issued' | 'Partially Dispensed' | 'Dispensed' | 'Cancelled' | 'Expired' | 'Active';

export interface PrescriptionItem { id: string; medicationId: string; medicationName: string; genericName?: string; dosageInstructions: string; quantityPrescribed: number; quantityDispensedSoFar: number; refillsAllowed: number; refillsRemaining: number; }
export interface Prescription {
  id: string; rxNumber: string; barcode: string; patientId?: string; patientName: string; patientDOB: string; patientPhone: string;
  doctorName: string; doctorLicense: string; doctorClinic: string; medicationId?: string; medicationName: string; dosageInstructions?: string;
  quantityPrescribed?: number; quantityDispensedSoFar?: number; refillsAllowed?: number; refillsRemaining?: number; items?: PrescriptionItem[];
  dateIssued: string; expiryDate: string; status: PrescriptionStatus; insuranceProvider?: string; insuranceCoPayRate?: number; notes?: string;
}

export interface Patient { id: string; fullName: string; dob: string; gender: 'Male' | 'Female' | 'Other'; phone: string; email?: string; address?: string; allergies?: string[]; insuranceProvider?: string; insurancePolicyNumber?: string; createdAt: string; }
export interface ClinicalTest { id: string; consultationId?: string; patientId: string; patientName?: string; testName: string; category: 'Hematology' | 'Biochemistry' | 'Microbiology' | 'Rapid Diagnostic' | 'Urinalysis' | 'Other'; status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled'; results?: string; referenceRanges?: string; notes?: string; requestedBy: string; conductedAt?: string; createdAt: string; }
export interface Consultation { id: string; patientId: string; patientName: string; clinicianId: string; clinicianName: string; date: string; symptoms: string; diagnosis: string; notes?: string; vitals?: { bp?: string; temperature?: string; heartRate?: string; weight?: string; oxygenSat?: string; }; tests?: ClinicalTest[]; prescriptions?: Prescription[]; createdAt: string; }
export interface InventoryMovement { id: string; medicationId: string; medicationName?: string; movementType: 'IMPORT_ADD' | 'IMPORT_REDUCE' | 'IMPORT_SET' | 'SALE' | 'RETURN' | 'MANUAL_ADJUSTMENT' | 'DAMAGE_WRITE_OFF'; quantityChange: number; previousStock: number; newStock: number; batchNumber?: string; reason?: string; userId?: string; userName?: string; createdAt: string; }
export interface InventoryImportBatch { id: string; importId: string; filename: string; fileHash?: string; totalRows: number; createdCount: number; updatedCount: number; stockAdded: number; stockReduced: number; actorId?: string; actorName?: string; createdAt: string; }
export type TestStatus = 'Ordered' | 'In Progress' | 'Completed' | 'Cancelled';
export interface MedicalTest { id: string; testNumber: string; patientName: string; patientDOB: string; patientPhone: string; clinicianName: string; clinicianLicense: string; testType: string; notes: string; dateOrdered: string; status: TestStatus; resultSummary?: string; resultDate?: string; linkedPrescriptionId?: string; }

export interface CartItem {
  medication: Medication;
  quantity: number;
  /** false = smallest sale unit; true = whole pack/container. */
  saleAsPack?: boolean;
  prescriptionId?: string; rxNumber?: string; patientName?: string; discountPercent?: number;
}
export interface POSTab { id: string; name: string; cart: CartItem[]; patientName?: string; isParked?: boolean; notes?: string; createdAt: number; updatedAt: number; }
export type PaymentMethod = 'Cash' | 'M-Pesa' | 'Partial (Cash + M-Pesa)' | 'Credit/Debit Card' | 'Insurance';
export interface SaleTransaction {
  id: string; receiptNumber: string; timestamp: string; cashierName: string; cashierRole: UserRole;
  items: { medicationId: string; name: string; genericName: string; dosage: string; isPrescription: boolean; rxNumber?: string; patientName?: string;
    quantity: number; unitPrice: number; totalPrice: number; batchNumber?: string; expiryDate?: string; saleUnit?: string; saleAsPack?: boolean; packSize?: number; }[];
  subtotal: number; discount: number; total: number; paymentMethod: PaymentMethod; amountTendered?: number; changeDue?: number;
  cashAmount?: number; mpesaAmount?: number; mpesaReference?: string; mpesaPhone?: string; patientName?: string; cardAuthCode?: string;
  insuranceProvider?: string; insurancePolicyNumber?: string; insuranceAuthCode?: string; isOffline: boolean; synced: boolean; syncTimestamp?: string;
}

export interface ReceiptSettings { pharmacyName: string; tagline: string; logoUrl?: string; showLogo?: boolean; logoHeight?: number; addressLine1: string; addressLine2: string; phone: string; email: string; licenseNumber: string; taxId: string; paperWidth: '80mm' | '58mm'; headerMessage: string; footerMessage: string; returnPolicy: string; emergencyPhone: string; showGenericName: boolean; showBatchAndExpiry: boolean; showPrescriptionDetails: boolean; showPharmacistName: boolean; showBarcode: boolean; currencySymbol: string; enableReceiptPrinting?: boolean; autoPrintReceipt?: boolean; showReceiptDialog?: boolean; }
export interface InventoryAlert { id: string; medicationId: string; medicationName: string; type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON' | 'EXPIRED'; currentStock: number; minStockLevel: number; expiryDate?: string; message: string; }
export type ExpiryFilterPreset = 'all' | 'expired' | 'expiring_30' | 'expiring_90' | 'expiring_180' | 'expiring_365' | 'custom';
export interface InventoryFilters { searchTerm: string; category: string; supplier: string; stockStatus: 'all' | 'low' | 'rx' | 'otc' | 'expiring'; expiryPreset: ExpiryFilterPreset; expiryStartDate: string; expiryEndDate: string; }
