import { useState, useEffect } from 'react';
import { Plus, X, Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { pettyCashApi, PettyCashAccount, PettyCashTransaction } from '../../services/accountingService';
import toast from 'react-hot-toast';

const PettyCash = ({ embedded = false }: { embedded?: boolean }) => {
  const [accounts, setAccounts] = useState<PettyCashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', floatAmount: '', custodianId: '' });
  const [txForm, setTxForm] = useState({ accountId: '', type: 'DISBURSEMENT', amount: '', description: '', category: '' });

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadAccountData(selectedAccountId);
    }
  }, [selectedAccountId]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await pettyCashApi.getAccounts();
      const accts = res.data.accounts || res.data || [];
      setAccounts(accts);
      if (accts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accts[0].id);
      }
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountData = async (id: string) => {
    try {
      const [txRes, sumRes] = await Promise.all([
        pettyCashApi.getTransactions(id),
        pettyCashApi.getSummary(id),
      ]);
      setTransactions(txRes.data.transactions || txRes.data || []);
      setSummary(sumRes.data);
    } catch {
      toast.error('Failed to load account data');
    }
  };

  const handleCreateAccount = async () => {
    try {
      await pettyCashApi.createAccount({
        name: accountForm.name,
        floatAmount: parseFloat(accountForm.floatAmount),
        custodianId: accountForm.custodianId,
      });
      toast.success('Account created');
      setShowAccountModal(false);
      setAccountForm({ name: '', floatAmount: '', custodianId: '' });
      loadAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create account');
    }
  };

  const handleCreateTransaction = async () => {
    try {
      await pettyCashApi.createTransaction({
        accountId: txForm.accountId || selectedAccountId,
        type: txForm.type,
        amount: parseFloat(txForm.amount),
        description: txForm.description,
        category: txForm.category || undefined,
      });
      toast.success('Transaction recorded');
      setShowTransactionModal(false);
      setTxForm({ accountId: '', type: 'DISBURSEMENT', amount: '', description: '', category: '' });
      if (selectedAccountId) {
        loadAccountData(selectedAccountId);
        loadAccounts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record transaction');
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Petty Cash</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage petty cash floats and transactions</p>
          </div>
        )}
        <div className="flex space-x-2">
          <button onClick={() => setShowAccountModal(true)}
            className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm">
            <Wallet size={16} /><span>New Account</span>
          </button>
          {selectedAccountId && (
            <button onClick={() => { setTxForm({ ...txForm, accountId: selectedAccountId }); setShowTransactionModal(true); }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <Plus size={16} /><span>New Transaction</span>
            </button>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-16">
          <Wallet size={48} className="mx-auto mb-4 text-gray-300" />
          <p>No petty cash accounts yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Account Selector */}
          <div className="flex flex-wrap gap-3">
            {accounts.map(acct => (
              <button key={acct.id} onClick={() => setSelectedAccountId(acct.id)}
                className={`px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                  selectedAccountId === acct.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <p className="font-medium text-sm dark:text-white">{acct.name}</p>
                <p className={`text-lg font-bold ${acct.balance < acct.floatAmount * 0.2 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(acct.balance)}
                </p>
                <p className="text-xs text-gray-400">Float: {fmt(acct.floatAmount)}</p>
              </button>
            ))}
          </div>

          {selectedAccount && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Float Amount</p>
                  <p className="text-2xl font-bold text-blue-600">{fmt(selectedAccount.floatAmount)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(selectedAccount.balance)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Disbursed</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(summary?.totalDisbursed || 0)}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Replenished</p>
                  <p className="text-2xl font-bold text-purple-600">{fmt(summary?.totalReplenished || 0)}</p>
                </div>
              </div>

              {/* Summary by category */}
              {summary?.byCategory && summary.byCategory.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Spending by Category</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {summary.byCategory.map((cat: any) => (
                      <div key={cat.category || 'uncategorized'} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                        <p className="text-xs text-gray-500">{(cat.category || 'Uncategorized').replace(/_/g, ' ')}</p>
                        <p className="font-medium dark:text-white">{fmt(cat._sum?.amount || 0)}</p>
                        <p className="text-xs text-gray-400">{cat._count} txn(s)</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <div className="p-4 border-b dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Category</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No transactions yet</td></tr>
                    ) : transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3">{new Date(tx.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          {tx.type === 'DISBURSEMENT' ? (
                            <span className="flex items-center space-x-1 text-red-600"><ArrowUpCircle size={14} /><span>Disbursement</span></span>
                          ) : (
                            <span className="flex items-center space-x-1 text-green-600"><ArrowDownCircle size={14} /><span>Replenishment</span></span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate dark:text-gray-200">{tx.description}</td>
                        <td className="px-4 py-3 text-gray-500">{(tx.category || '—').replace(/_/g, ' ')}</td>
                        <td className={`px-4 py-3 text-right font-medium ${tx.type === 'DISBURSEMENT' ? 'text-red-600' : 'text-green-600'}`}>
                          {tx.type === 'DISBURSEMENT' ? '-' : '+'}{fmt(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ======== ACCOUNT MODAL ======== */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">New Petty Cash Account</h2>
              <button onClick={() => setShowAccountModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
                <input type="text" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Main Office Petty Cash" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Float Amount (ZMW)</label>
                <input type="number" step="0.01" value={accountForm.floatAmount} onChange={e => setAccountForm({ ...accountForm, floatAmount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custodian User ID</label>
                <input type="text" value={accountForm.custodianId} onChange={e => setAccountForm({ ...accountForm, custodianId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="User ID of the custodian" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowAccountModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Account</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== TRANSACTION MODAL ======== */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">New Transaction</h2>
              <button onClick={() => setShowTransactionModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="DISBURSEMENT">Disbursement (Cash Out)</option>
                  <option value="REPLENISHMENT">Replenishment (Cash In)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (ZMW)</label>
                <input type="number" step="0.01" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="What was this for?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category (optional)</label>
                <input type="text" value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Office Supplies" />
              </div>
              {selectedAccount && (
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-sm">
                  <p className="text-gray-500">Current Balance: <span className="font-bold text-green-600">{fmt(selectedAccount.balance)}</span></p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowTransactionModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateTransaction}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Record Transaction</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCash;
