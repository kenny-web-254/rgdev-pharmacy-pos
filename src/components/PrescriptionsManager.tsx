import React, { useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  ExternalLink,
  FileCheck,
  FilePlus,
  FileText,
  Phone,
  Pill,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Medication, Prescription, PrescriptionStatus, UserRole } from '../types';

interface PrescriptionsManagerProps {
  prescriptions: Prescription[];
  medications: Medication[];
  onDispensePrescription: (prescription: Prescription) => void;
  onAddNewPrescription: (prescription: Prescription) => void;
  onEditPrescription?: (prescription: Prescription) => void;
  onDeletePrescription?: (prescriptionId: string) => void;
  onOpenBarcodeScanner: () => void;
  userRole: UserRole;
}

export const PrescriptionsManager: React.FC<PrescriptionsManagerProps> = ({
  prescriptions,
  medications,
  onDispensePrescription,
  onAddNewPrescription,
  onEditPrescription,
  onDeletePrescription,
  onOpenBarcodeScanner,
  userRole,
}) => {
  const isAdmin = userRole === 'admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedRxForLabel, setSelectedRxForLabel] = useState<Prescription | null>(null);
  const [isNewRxModalOpen, setIsNewRxModalOpen] = useState(false);
  const [newRxError, setNewRxError] = useState<string | null>(null);

  // Edit and Delete states
  const [editingRx, setEditingRx] = useState<Prescription | null>(null);
  const [editRxError, setEditRxError] = useState<string | null>(null);
  const [rxToDelete, setRxToDelete] = useState<Prescription | null>(null);

  // New Rx form state
  const [newRx, setNewRx] = useState<Partial<Prescription>>({
    rxNumber: 'RX-' + Math.floor(10000 + Math.random() * 90000),
    barcode: '',
    patientName: '',
    patientDOB: '1985-04-12',
    patientPhone: '(555) ',
    doctorName: 'Dr. Michael Chen, MD',
    doctorLicense: 'MED-88129',
    doctorClinic: 'City Health Clinic',
    medicationId: medications[0]?.id || '',
    medicationName: medications[0]?.name || '',
    dosageInstructions: 'Take 1 tablet daily with water after breakfast.',
    quantityPrescribed: 30,
    refillsAllowed: 3,
    refillsRemaining: 3,
    dateIssued: '2026-09-08',
    expiryDate: '2027-09-08',
    insuranceProvider: 'BlueCross Anthem',
    insuranceCoPayRate: 0.15,
  });

  const filteredPrescriptions = prescriptions.filter((rx) => {
    const matchesSearch =
      rx.rxNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rx.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rx.medicationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rx.doctorName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'All' && rx.status !== statusFilter) return false;
    return true;
  });

  const handleSelectMedicationForNewRx = (medId: string) => {
    const med = medications.find((m) => m.id === medId);
    if (med) {
      setNewRx((prev) => ({
        ...prev,
        medicationId: med.id,
        medicationName: med.name,
      }));
    }
  };

  const handleCreateNewRx = (e: React.FormEvent) => {
    e.preventDefault();
    setNewRxError(null);

    const rxNum = newRx.rxNumber?.trim();
    const patientName = newRx.patientName?.trim();
    const doctorName = newRx.doctorName?.trim();
    const doctorLicense = newRx.doctorLicense?.trim();
    const quantity = Number(newRx.quantityPrescribed);

    if (!rxNum) {
      setNewRxError('Prescription Rx Number is required.');
      return;
    }

    // Check duplicate prescription number
    if (prescriptions.some((p) => p.rxNumber.toLowerCase() === rxNum.toLowerCase())) {
      setNewRxError(`Prescription with Rx Number "${rxNum}" already exists.`);
      return;
    }

    if (!patientName) {
      setNewRxError('Patient full name is required.');
      return;
    }

    if (!doctorName) {
      setNewRxError('Prescribing physician name is required.');
      return;
    }

    if (!doctorLicense) {
      setNewRxError('Prescriber medical license number is required.');
      return;
    }

    if (isNaN(quantity) || quantity <= 0) {
      setNewRxError('Prescribed quantity must be a positive number.');
      return;
    }

    const rxId = 'rx-' + Date.now();
    const fullRx: Prescription = {
      id: rxId,
      rxNumber: rxNum,
      barcode: rxNum,
      patientName,
      patientDOB: newRx.patientDOB || '1990-01-01',
      patientPhone: newRx.patientPhone || '(555) 000-0000',
      doctorName,
      doctorLicense,
      doctorClinic: newRx.doctorClinic || 'Community Clinic',
      medicationId: newRx.medicationId || medications[0]?.id || '',
      medicationName: newRx.medicationName || medications[0]?.name || '',
      dosageInstructions: newRx.dosageInstructions || 'As directed',
      quantityPrescribed: quantity,
      quantityDispensedSoFar: 0,
      refillsAllowed: Number(newRx.refillsAllowed) || 1,
      refillsRemaining: Number(newRx.refillsAllowed) || 1,
      dateIssued: newRx.dateIssued || '2026-09-08',
      expiryDate: newRx.expiryDate || '2027-09-08',
      status: 'Active',
      insuranceProvider: newRx.insuranceProvider || 'Standard Health',
      insuranceCoPayRate: Number(newRx.insuranceCoPayRate) || 0.2,
    };
    onAddNewPrescription(fullRx);
    setIsNewRxModalOpen(false);
    setNewRxError(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Scanner Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-teal-600" />
            Prescription Management & Verification
          </h1>
          <p className="text-xs text-slate-500">
            Manage electronic doctor scripts, scan Rx bottle barcodes, and dispense with insurance co-pay calculation
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="scan-rx-barcode-top-btn"
            onClick={onOpenBarcodeScanner}
            className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95"
          >
            <Barcode className="w-4 h-4" />
            <span>Scan Rx Barcode</span>
          </button>

          <button
            onClick={() => setIsNewRxModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <FilePlus className="w-4 h-4 text-teal-600" />
            <span>Intake New Rx</span>
          </button>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Rx # (e.g. RX-80219), patient name, or doctor..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start md:self-auto overflow-x-auto w-full md:w-auto">
          {['All', 'Active', 'Dispensed', 'Expired'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st} ({st === 'All' ? prescriptions.length : prescriptions.filter((r) => r.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {/* Prescriptions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPrescriptions.map((rx) => {
          const med = medications.find((m) => m.id === rx.medicationId);
          const hasStock = med ? med.stock >= rx.quantityPrescribed : false;
          const isActive = rx.status === 'Active';

          return (
            <div
              key={rx.id}
              className={`bg-white rounded-2xl border-2 transition-all p-5 shadow-xs flex flex-col justify-between ${
                isActive ? 'border-slate-200 hover:border-teal-400' : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div>
                {/* Rx Header with Barcode Badge */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-base text-slate-900 bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-lg">
                        {rx.rxNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rx.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rx.status === 'Dispensed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {rx.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                      <Barcode className="w-3.5 h-3.5" />
                      Barcode: {rx.barcode}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedRxForLabel(rx)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      title="Print prescription label sticker"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Label</span>
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => {
                            setEditingRx({ ...rx });
                            setEditRxError(null);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          title="Edit prescription details"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => setRxToDelete(rx)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 p-1 rounded-lg transition cursor-pointer"
                          title="Delete prescription record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Patient & Doctor Information */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                      <User className="w-3 h-3 text-teal-600" /> Patient
                    </span>
                    <div className="font-bold text-slate-900 mt-0.5">{rx.patientName}</div>
                    <div className="text-[11px] text-slate-500">DOB: {rx.patientDOB}</div>
                    <div className="text-[11px] text-slate-500">{rx.patientPhone}</div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-teal-600" /> Prescriber
                    </span>
                    <div className="font-bold text-slate-900 mt-0.5">{rx.doctorName}</div>
                    <div className="text-[11px] text-slate-500">{rx.doctorClinic}</div>
                    <div className="text-[10px] font-mono text-slate-400">{rx.doctorLicense}</div>
                  </div>
                </div>

                {/* Prescribed Drug & Directions */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pill className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="font-bold text-sm text-slate-900">{rx.medicationName}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      Qty: <strong>{rx.quantityPrescribed}</strong> units
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-teal-50/50 border border-teal-100 text-xs text-teal-950 font-medium leading-relaxed">
                    <span className="font-bold text-teal-900 block text-[10px] uppercase">Sig / Instructions:</span>
                    {rx.dosageInstructions}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>
                      Refills remaining: <strong className="text-slate-800">{rx.refillsRemaining} of {rx.refillsAllowed}</strong>
                    </span>
                    <span>
                      Issued: {rx.dateIssued}
                    </span>
                  </div>

                  {rx.insuranceProvider && (
                    <div className="text-[11px] text-slate-600 flex items-center justify-between bg-slate-100/70 px-2.5 py-1 rounded-lg">
                      <span>Insurance: <strong>{rx.insuranceProvider}</strong></span>
                      <span className="text-emerald-700 font-bold">
                        Co-pay: {Math.round((rx.insuranceCoPayRate || 0.2) * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Stock validation note */}
                  <div className="pt-1">
                    {med ? (
                      <span
                        className={`text-[11px] font-medium flex items-center gap-1 ${
                          hasStock ? 'text-emerald-700' : 'text-rose-600 font-bold'
                        }`}
                      >
                        {hasStock ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            In Stock: {med.stock} units available on shelf
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            Insufficient inventory! Only {med.stock} units in stock.
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Medication inventory record unlinked</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  {rx.status === 'Dispensed' ? 'Already fulfilled' : 'Ready for dispensing'}
                </span>

                <button
                  id={`dispense-rx-btn-${rx.rxNumber}`}
                  onClick={() => onDispensePrescription(rx)}
                  disabled={!isActive || (med && med.stock <= 0)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition active:scale-95"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Dispense & Ring Up</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Prescription Bottle Label Sticker Modal */}
      {selectedRxForLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Rx Bottle Label Print Preview</h3>
              </div>
              <button
                onClick={() => setSelectedRxForLabel(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 bg-slate-100 flex justify-center">
              {/* Thermal Rx Label Card */}
              <div className="w-[320px] bg-white border-2 border-slate-800 p-4 shadow-lg text-black font-mono-receipt text-[11px] leading-snug rounded-lg">
                <div className="text-center pb-2 border-b border-black font-bold uppercase text-xs">
                  PHARMACARE COMMUNITY RX
                  <div className="text-[9px] font-normal normal-case">Tel: (555) 382-9400 • Springfield, OR</div>
                </div>

                <div className="py-2 border-b border-black space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>RX#: {selectedRxForLabel.rxNumber}</span>
                    <span>DATE: {selectedRxForLabel.dateIssued}</span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 pt-0.5">
                    PATIENT: {selectedRxForLabel.patientName.toUpperCase()}
                  </div>
                  <div>DR: {selectedRxForLabel.doctorName}</div>
                </div>

                <div className="py-2.5 border-b border-black space-y-1">
                  <div className="font-bold text-sm">{selectedRxForLabel.medicationName}</div>
                  <div className="font-bold bg-amber-100 text-amber-950 p-1.5 rounded text-[11px] leading-tight">
                    SIG: {selectedRxForLabel.dosageInstructions}
                  </div>
                  <div className="flex justify-between text-[10px] pt-1">
                    <span>QTY: {selectedRxForLabel.quantityPrescribed}</span>
                    <span>REFILLS: {selectedRxForLabel.refillsRemaining}</span>
                  </div>
                </div>

                <div className="pt-2 text-center text-[9px] space-y-1">
                  <div className="tracking-widest font-mono font-bold text-[10px]">
                    |||||||||||||||||||||||||||||||||
                  </div>
                  <div>*{selectedRxForLabel.rxNumber}*</div>
                  <div className="text-[8px] font-bold text-red-600 uppercase">
                    CAUTION: FEDERAL LAW PROHIBITS DISPENSING WITHOUT PRESCRIPTION
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs text-slate-500">Label format: 4 x 2.25 inch</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedRxForLabel(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Label
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Rx Intake Modal */}
      {isNewRxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-teal-600" />
                Intake Doctor Prescription (Script Entry)
              </h3>
              <button
                onClick={() => setIsNewRxModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newRxError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {newRxError}
              </div>
            )}

            <form onSubmit={handleCreateNewRx} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rx Number</label>
                  <input
                    type="text"
                    value={newRx.rxNumber}
                    onChange={(e) => setNewRx({ ...newRx, rxNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient Full Name</label>
                  <input
                    type="text"
                    value={newRx.patientName}
                    onChange={(e) => setNewRx({ ...newRx, patientName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient DOB</label>
                  <input
                    type="date"
                    value={newRx.patientDOB}
                    onChange={(e) => setNewRx({ ...newRx, patientDOB: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient Contact Phone</label>
                  <input
                    type="tel"
                    value={newRx.patientPhone}
                    onChange={(e) => setNewRx({ ...newRx, patientPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Doctor / Prescriber Name</label>
                  <input
                    type="text"
                    value={newRx.doctorName}
                    onChange={(e) => setNewRx({ ...newRx, doctorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Doctor State License</label>
                  <input
                    type="text"
                    value={newRx.doctorLicense}
                    onChange={(e) => setNewRx({ ...newRx, doctorLicense: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Select Medication to Dispense</label>
                  <select
                    value={newRx.medicationId}
                    onChange={(e) => handleSelectMedicationForNewRx(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white font-bold"
                  >
                    {medications.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.genericName}) - Stock: {m.stock}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Dosage & Administration Sig</label>
                  <textarea
                    rows={2}
                    value={newRx.dosageInstructions}
                    onChange={(e) => setNewRx({ ...newRx, dosageInstructions: e.target.value })}
                    placeholder="e.g. Take 1 tablet by mouth twice daily with meals..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prescribed Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newRx.quantityPrescribed}
                    onChange={(e) => setNewRx({ ...newRx, quantityPrescribed: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Refills Authorized</label>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={newRx.refillsAllowed}
                    onChange={(e) => setNewRx({ ...newRx, refillsAllowed: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Insurance Provider</label>
                  <input
                    type="text"
                    value={newRx.insuranceProvider}
                    onChange={(e) => setNewRx({ ...newRx, insuranceProvider: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient Co-Pay Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={newRx.insuranceCoPayRate}
                    onChange={(e) => setNewRx({ ...newRx, insuranceCoPayRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewRxModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-xs transition cursor-pointer"
                >
                  Save Prescription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Prescription Modal (Admin Only) */}
      {editingRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Edit Prescription Record ({editingRx.rxNumber})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Administrator audit: update physician orders, dispensing limits, or patient profile
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingRx(null);
                  setEditRxError(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editRxError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editRxError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingRx.patientName?.trim()) {
                  setEditRxError('Patient full legal name is required.');
                  return;
                }
                if (!editingRx.doctorName?.trim()) {
                  setEditRxError('Prescribing physician name is required.');
                  return;
                }
                if (!editingRx.medicationName?.trim()) {
                  setEditRxError('Prescribed medication must be specified.');
                  return;
                }
                if (!editingRx.quantityPrescribed || editingRx.quantityPrescribed <= 0) {
                  setEditRxError('Prescribed quantity must be greater than zero.');
                  return;
                }
                if (onEditPrescription) {
                  onEditPrescription(editingRx);
                }
                setEditingRx(null);
                setEditRxError(null);
              }}
              className="space-y-4 text-xs"
            >
              {/* Top Identifiers: Rx Number & Status */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Rx Script Number
                  </label>
                  <input
                    type="text"
                    value={editingRx.rxNumber}
                    onChange={(e) => setEditingRx({ ...editingRx, rxNumber: e.target.value, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Prescription Status
                  </label>
                  <select
                    value={editingRx.status}
                    onChange={(e) => setEditingRx({ ...editingRx, status: e.target.value as PrescriptionStatus })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-semibold"
                  >
                    <option value="Active">Active (Ready to Dispense)</option>
                    <option value="Partially Dispensed">Partially Dispensed</option>
                    <option value="Dispensed">Dispensed (Completed)</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Barcode ID
                  </label>
                  <input
                    type="text"
                    value={editingRx.barcode}
                    onChange={(e) => setEditingRx({ ...editingRx, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono text-slate-600"
                  />
                </div>
              </div>

              {/* Patient Information */}
              <div>
                <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block mb-2">
                  Patient Demographics
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Patient Full Name</label>
                    <input
                      type="text"
                      value={editingRx.patientName}
                      onChange={(e) => setEditingRx({ ...editingRx, patientName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={editingRx.patientDOB}
                      onChange={(e) => setEditingRx({ ...editingRx, patientDOB: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={editingRx.patientPhone}
                      onChange={(e) => setEditingRx({ ...editingRx, patientPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Doctor Information */}
              <div>
                <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block mb-2">
                  Prescribing Physician
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Doctor Name</label>
                    <input
                      type="text"
                      value={editingRx.doctorName}
                      onChange={(e) => setEditingRx({ ...editingRx, doctorName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">License / Registration</label>
                    <input
                      type="text"
                      value={editingRx.doctorLicense}
                      onChange={(e) => setEditingRx({ ...editingRx, doctorLicense: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Clinic / Hospital</label>
                    <input
                      type="text"
                      value={editingRx.doctorClinic}
                      onChange={(e) => setEditingRx({ ...editingRx, doctorClinic: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Medication Order */}
              <div>
                <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block mb-2">
                  Medication & Dispensing Parameters
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Select Catalog Medication</label>
                    <select
                      value={editingRx.medicationId}
                      onChange={(e) => {
                        const sel = medications.find((m) => m.id === e.target.value);
                        if (sel) {
                          setEditingRx({
                            ...editingRx,
                            medicationId: sel.id,
                            medicationName: sel.name,
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white"
                    >
                      <option value="">-- Choose Medication --</option>
                      {medications.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.form}) - Stock: {m.stock}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Prescribed Drug Name</label>
                    <input
                      type="text"
                      value={editingRx.medicationName}
                      onChange={(e) => setEditingRx({ ...editingRx, medicationName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-slate-600 mb-1">Directions for Use (Sig)</label>
                  <textarea
                    rows={2}
                    value={editingRx.dosageInstructions}
                    onChange={(e) => setEditingRx({ ...editingRx, dosageInstructions: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Total Prescribed</label>
                    <input
                      type="number"
                      min="1"
                      value={editingRx.quantityPrescribed}
                      onChange={(e) => setEditingRx({ ...editingRx, quantityPrescribed: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Dispensed So Far</label>
                    <input
                      type="number"
                      min="0"
                      value={editingRx.quantityDispensedSoFar}
                      onChange={(e) => setEditingRx({ ...editingRx, quantityDispensedSoFar: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Refills Allowed</label>
                    <input
                      type="number"
                      min="0"
                      value={editingRx.refillsAllowed}
                      onChange={(e) => setEditingRx({ ...editingRx, refillsAllowed: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Refills Remaining</label>
                    <input
                      type="number"
                      min="0"
                      value={editingRx.refillsRemaining}
                      onChange={(e) => setEditingRx({ ...editingRx, refillsRemaining: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Dates & Insurance */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-slate-600 mb-1">Date Issued</label>
                  <input
                    type="date"
                    value={editingRx.dateIssued}
                    onChange={(e) => setEditingRx({ ...editingRx, dateIssued: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editingRx.expiryDate}
                    onChange={(e) => setEditingRx({ ...editingRx, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Insurance Provider</label>
                  <input
                    type="text"
                    value={editingRx.insuranceProvider || ''}
                    onChange={(e) => setEditingRx({ ...editingRx, insuranceProvider: e.target.value })}
                    placeholder="e.g. NHIF / Jubilee"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Co-Pay Rate (0 to 1)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={editingRx.insuranceCoPayRate ?? 0}
                    onChange={(e) => setEditingRx({ ...editingRx, insuranceCoPayRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRx(null);
                    setEditRxError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-xs transition cursor-pointer"
                >
                  Update Prescription Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {rxToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Delete Prescription Record?</h4>
                <p className="text-xs text-rose-600 font-semibold">Irreversible administrative action</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Rx Number:</span>
                <span className="font-mono font-bold text-slate-900">{rxToDelete.rxNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-bold text-slate-900">{rxToDelete.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Medication:</span>
                <span className="font-semibold text-slate-900">{rxToDelete.medicationName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-slate-900">{rxToDelete.status}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete prescription{' '}
              <strong>{rxToDelete.rxNumber}</strong> for patient{' '}
              <strong>{rxToDelete.patientName}</strong>? This operation will be permanently recorded in the system audit log.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRxToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeletePrescription) {
                    onDeletePrescription(rxToDelete.id);
                  }
                  setRxToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                Delete Prescription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
