import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingDown, Calendar, Download, ChevronRight, Phone } from 'lucide-react';
import api from '../../utils/api';

interface Debtor {
  id: string; admissionNumber: string; firstName: string; lastName: string;
  className: string; guardianName: string; guardianPhone: string;
  totalDue: number; totalPaid: number; balance: number; status: string;
}

interface Payment {
  id: string; amount: number; method: string; referenceNumber: string;
  paymentDate: string; studentName: string; admissionNumber: string;
  className: string; recordedBy: string;
}

const FinancialReports = () => {
  const [reportType, setReportType] = useState<'debtors' | 'collection' | 'summary'>('debtors');
  const [loading, setLoading] = useState(false);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [debtorsSummary, setDebtorsSummary] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [collectionSummary, setCollectionSummary] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (reportType === 'debtors') fetchDebtors();
    else if (reportType === 'collection') fetchCollection();
  }, [reportType, selectedDate]);

  const fetchDebtors = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/financial/debtors');
      setDebtors(res.data.debtors);
      setDebtorsSummary(res.data.summary);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchCollection = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/financial/daily-collection', { params: { date: selectedDate } });
      setPayments(res.data.payments);
      setCollectionSummary(res.data.summary);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Report Type Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'debtors', label: 'Debtors List' },
          { id: 'collection', label: 'Daily Collection' },
        ].map((r) => (
          <button key={r.id} onClick={() => setReportType(r.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              reportType === r.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>{r.label}</button>
        ))}
      </div>

      {/* Debtors Report */}
      {reportType === 'debtors' && (
        <>
          {debtorsSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Total Debtors</p>
                <p className="text-xl font-bold text-gray-800">{debtorsSummary.totalDebtors}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Outstanding</p>
                <p className="text-xl font-bold text-red-600">ZMW {debtorsSummary.totalOutstanding?.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Critical (Unpaid)</p>
                <p className="text-xl font-bold text-red-600">{debtorsSummary.criticalCount}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Partial Payment</p>
                <p className="text-xl font-bold text-yellow-600">{debtorsSummary.partialCount}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Mobile List */}
            <div className="lg:hidden divide-y divide-gray-100">
              {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> :
                debtors.length === 0 ? <div className="p-8 text-center text-gray-500">No debtors found</div> :
                debtors.map((d) => (
                  <div key={d.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{d.firstName} {d.lastName}</p>
                        <p className="text-xs text-gray-500">{d.className} • {d.admissionNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-600">ZMW {d.balance.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'UNPAID' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span>
                      </div>
                    </div>
                    <a href={`tel:${d.guardianPhone}`} className="flex items-center gap-1 text-xs text-blue-600">
                      <Phone size={12} /> {d.guardianPhone}
                    </a>
                  </div>
                ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Total Due</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Paid</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Balance</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {debtors.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{d.firstName} {d.lastName}</p>
                        <p className="text-xs text-gray-500">{d.admissionNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{d.className}</td>
                      <td className="px-4 py-3 text-right">ZMW {d.totalDue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-green-600">ZMW {d.totalPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">ZMW {d.balance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.status === 'UNPAID' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{d.guardianPhone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Daily Collection Report */}
      {reportType === 'collection' && (
        <>
          <div className="flex items-center gap-3">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>

          {collectionSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Total Collected</p>
                <p className="text-xl font-bold text-green-600">ZMW {collectionSummary.totalAmount?.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Transactions</p>
                <p className="text-xl font-bold text-gray-800">{collectionSummary.transactionCount}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Cash</p>
                <p className="text-xl font-bold text-gray-800">ZMW {(collectionSummary.byMethod?.CASH || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Mobile Money</p>
                <p className="text-xl font-bold text-gray-800">ZMW {(collectionSummary.byMethod?.MOBILE_MONEY || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="lg:hidden divide-y divide-gray-100">
              {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> :
                payments.length === 0 ? <div className="p-8 text-center text-gray-500">No payments for this date</div> :
                payments.map((p) => (
                  <div key={p.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{p.studentName}</p>
                        <p className="text-xs text-gray-500">{p.className} • {p.recordedBy}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">ZMW {p.amount.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.method === 'CASH' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{p.method.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Method</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Reference</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{new Date(p.paymentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.studentName}</td>
                      <td className="px-4 py-3 text-gray-600">{p.className}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">ZMW {p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.method === 'CASH' ? 'bg-green-100 text-green-700' : p.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{p.method.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.referenceNumber || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.recordedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinancialReports;
