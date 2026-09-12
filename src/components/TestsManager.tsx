import React, { useState } from 'react';
import {
  Beaker,
  Calendar,
  CheckCircle2,
  Clock,
  FlaskConical,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { MedicalTest, TestStatus, UserRole } from '../types';

interface TestsManagerProps {
  tests: MedicalTest[];
  onAddNewTest: (test: MedicalTest) => void;
  onUpdateTest: (test: MedicalTest) => void;
  userRole: UserRole;
  currentUserName: string;
  currentUserLicense?: string;
}

const STATUS_OPTIONS: TestStatus[] = ['Ordered', 'In Progress', 'Completed', 'Cancelled'];

const statusBadgeClass = (status: TestStatus) => {
  switch (status) {
    case 'Ordered':
      return 'bg-amber-100 text-amber-800';
    case 'In Progress':
      return 'bg-blue-100 text-blue-800';
    case 'Completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'Cancelled':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-200 text-slate-700';
  }
};

export const TestsManager: React.FC<TestsManagerProps> = ({
  tests,
  onAddNewTest,
  onUpdateTest,
  userRole,
  currentUserName,
  currentUserLicense,
}) => {
  const canOrder = userRole === 'admin' || userRole === 'clinician';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | TestStatus>('All');
  const [isNewTestModalOpen, setIsNewTestModalOpen] = useState(false);
  const [resultTest, setResultTest] = useState<MedicalTest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [newTest, setNewTest] = useState<Partial<MedicalTest>>({
    testNumber: 'TST-' + Math.floor(10000 + Math.random() * 90000),
    patientName: '',
    patientDOB: '1990-01-01',
    patientPhone: '',
    testType: '',
    notes: '',
    dateOrdered: new Date().toISOString().split('T')[0],
  });

  const [resultSummary, setResultSummary] = useState('');
  const [resultStatus, setResultStatus] = useState<TestStatus>('Completed');

  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.testNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.testType.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    return true;
  });

  const handleCreateNewTest = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const testNumber = newTest.testNumber?.trim();
    const patientName = newTest.patientName?.trim();
    const testType = newTest.testType?.trim();

    if (!testNumber) {
      setFormError('Test number is required.');
      return;
    }
    if (tests.some((t) => t.testNumber.toLowerCase() === testNumber.toLowerCase())) {
      setFormError(`A test with number "${testNumber}" already exists.`);
      return;
    }
    if (!patientName) {
      setFormError('Patient full name is required.');
      return;
    }
    if (!testType) {
      setFormError('Test type is required (e.g. Blood Glucose Panel, Malaria RDT).');
      return;
    }

    const fullTest: MedicalTest = {
      id: 'test-' + Date.now(),
      testNumber,
      patientName,
      patientDOB: newTest.patientDOB || '1990-01-01',
      patientPhone: newTest.patientPhone || '',
      clinicianName: currentUserName,
      clinicianLicense: currentUserLicense || '',
      testType,
      notes: newTest.notes || '',
      dateOrdered: newTest.dateOrdered || new Date().toISOString().split('T')[0],
      status: 'Ordered',
    };

    onAddNewTest(fullTest);
    setIsNewTestModalOpen(false);
    setNewTest({
      testNumber: 'TST-' + Math.floor(10000 + Math.random() * 90000),
      patientName: '',
      patientDOB: '1990-01-01',
      patientPhone: '',
      testType: '',
      notes: '',
      dateOrdered: new Date().toISOString().split('T')[0],
    });
  };

  const openResultModal = (test: MedicalTest) => {
    setResultTest(test);
    setResultSummary(test.resultSummary || '');
    setResultStatus(test.status === 'Ordered' ? 'Completed' : test.status);
  };

  const handleSaveResult = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultTest) return;

    const updated: MedicalTest = {
      ...resultTest,
      status: resultStatus,
      resultSummary: resultSummary.trim() || undefined,
      resultDate:
        resultStatus === 'Completed' ? new Date().toISOString().split('T')[0] : resultTest.resultDate,
    };
    onUpdateTest(updated);
    setResultTest(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            Clinical Tests
          </h1>
          <p className="text-xs text-slate-500">
            Order lab & diagnostic tests, and record results for the dispensary team to follow up on.
          </p>
        </div>

        {canOrder && (
          <button
            onClick={() => setIsNewTestModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Order New Test</span>
          </button>
        )}
      </div>

      {/* Search & Status Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by test #, patient, or test type..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start md:self-auto overflow-x-auto w-full md:w-auto">
          {(['All', ...STATUS_OPTIONS] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st} ({st === 'All' ? tests.length : tests.filter((t) => t.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {/* Tests Grid */}
      {filteredTests.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
          No clinical tests found matching your search or filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-400 transition-all p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-base text-slate-900 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg">
                        {t.testNumber}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(t.status)}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <Beaker className="w-3.5 h-3.5" />
                      {t.testType}
                    </div>
                  </div>

                  {canOrder && t.status !== 'Cancelled' && (
                    <button
                      onClick={() => openResultModal(t)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {t.status === 'Completed' ? 'Edit Result' : 'Record Result'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                      <User className="w-3 h-3 text-blue-600" /> Patient
                    </span>
                    <div className="font-bold text-slate-900 mt-0.5">{t.patientName}</div>
                    <div className="text-[11px] text-slate-500">DOB: {t.patientDOB}</div>
                    {t.patientPhone && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" /> {t.patientPhone}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-600" /> Ordering Clinician
                    </span>
                    <div className="font-bold text-slate-900 mt-0.5">{t.clinicianName}</div>
                    {t.clinicianLicense && (
                      <div className="text-[10px] font-mono text-slate-400">{t.clinicianLicense}</div>
                    )}
                  </div>
                </div>

                {t.notes && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 mb-2">
                    <span className="font-bold text-slate-600 block text-[10px] uppercase">Notes</span>
                    {t.notes}
                  </div>
                )}

                {t.resultSummary && (
                  <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-950 font-medium leading-relaxed mb-2">
                    <span className="font-bold text-emerald-900 block text-[10px] uppercase">Result</span>
                    {t.resultSummary}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Ordered: {t.dateOrdered}
                  </span>
                  {t.resultDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Result: {t.resultDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order New Test Modal */}
      {isNewTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-blue-600" />
                Order New Clinical Test
              </h3>
              <button
                onClick={() => setIsNewTestModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateNewTest} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Test Number</label>
                  <input
                    type="text"
                    value={newTest.testNumber}
                    onChange={(e) => setNewTest({ ...newTest, testNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient Full Name</label>
                  <input
                    type="text"
                    value={newTest.patientName}
                    onChange={(e) => setNewTest({ ...newTest, patientName: e.target.value })}
                    placeholder="e.g. Jane Wanjiru"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient DOB</label>
                  <input
                    type="date"
                    value={newTest.patientDOB}
                    onChange={(e) => setNewTest({ ...newTest, patientDOB: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Patient Contact Phone</label>
                  <input
                    type="tel"
                    value={newTest.patientPhone}
                    onChange={(e) => setNewTest({ ...newTest, patientPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Test Type</label>
                  <input
                    type="text"
                    value={newTest.testType}
                    onChange={(e) => setNewTest({ ...newTest, testType: e.target.value })}
                    placeholder="e.g. Blood Glucose Panel, Malaria RDT, Full Blood Count"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Clinical Notes / Reason</label>
                  <textarea
                    rows={2}
                    value={newTest.notes}
                    onChange={(e) => setNewTest({ ...newTest, notes: e.target.value })}
                    placeholder="e.g. Routine diabetes monitoring follow-up..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date Ordered</label>
                  <input
                    type="date"
                    value={newTest.dateOrdered}
                    onChange={(e) => setNewTest({ ...newTest, dateOrdered: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewTestModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold shadow-xs transition"
                >
                  Save Test Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record / Edit Result Modal */}
      {resultTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                Record Result — {resultTest.testNumber}
              </h3>
              <button
                onClick={() => setResultTest(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.filter((s) => s !== 'Ordered').map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setResultStatus(s)}
                      className={`p-2 rounded-xl border-2 text-center font-semibold transition ${
                        resultStatus === s
                          ? 'border-blue-700 bg-blue-50/50 text-blue-800'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {s === 'Cancelled' && <XCircle className="w-3.5 h-3.5 inline mr-1" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Result Summary</label>
                <textarea
                  rows={3}
                  value={resultSummary}
                  onChange={(e) => setResultSummary(e.target.value)}
                  placeholder="e.g. Fasting glucose 5.6 mmol/L — within normal range."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResultTest(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold shadow-xs transition"
                >
                  Save Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
