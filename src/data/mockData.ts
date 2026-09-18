import type { AuditLog, MedicalTest, Medication, Prescription, ReceiptSettings, SaleTransaction, User } from '../types';
import { INITIAL_RECEIPT_SETTINGS } from './defaultReceiptSettings';

export const DEMO_USERS: User[] = [];
export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
export const INITIAL_MEDICATIONS: Medication[] = [];
export const INITIAL_PRESCRIPTIONS: Prescription[] = [];
export const INITIAL_TESTS: MedicalTest[] = [];
export const INITIAL_TRANSACTIONS: SaleTransaction[] = [];
export { INITIAL_RECEIPT_SETTINGS };
